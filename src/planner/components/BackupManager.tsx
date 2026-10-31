import { useMemo, useState } from 'react';
import { History, RotateCcw, Save } from 'lucide-react';
import type { MunicipalityDataset, PlannerDocument, Snapshot } from '../../models/region';
import { BACKUP_LIMIT, compareDocuments } from '../../services/backupService';
import { getCoveragePopulation } from '../../services/populationService';
import { activeScenario } from '../../services/plannerDocument';
import { formatCount } from '../../services/mapService';

interface BackupManagerProps {
  backups: Snapshot[];
  current: PlannerDocument;
  dataset: MunicipalityDataset;
  onCreate: () => void;
  onRestore: (snapshot: Snapshot) => void;
  readOnly?: boolean;
}

const CURRENT = 'current';

export function BackupManager({ backups, current, dataset, onCreate, onRestore, readOnly = false }: BackupManagerProps) {
  const [left, setLeft] = useState<string>(backups[0]?.id ?? '');
  const [right, setRight] = useState<string>(CURRENT);
  const resolve = (id: string) => id === CURRENT ? current : backups.find((backup) => backup.id === id)?.document;
  const before = resolve(left);
  const after = resolve(right);
  const comparison = useMemo(() => before && after ? compareDocuments(before, after) : null, [before, after]);
  const empty = comparison && Object.values(comparison).every((list) => list.length === 0);
  const beforePopulation = useMemo(() => before ? getCoveragePopulation(activeScenario(before).regions, dataset) : null, [before, dataset]);
  const afterPopulation = useMemo(() => after ? getCoveragePopulation(activeScenario(after).regions, dataset) : null, [after, dataset]);
  const options = [{ id: CURRENT, label: 'Nykytila' }, ...backups.map((backup) => ({ id: backup.id, label: `${new Date(backup.createdAt).toLocaleString('fi-FI')} – ${backup.reason}` }))];

  return (
    <div className="view-stack">
      <header className="view-header">
        <div><p className="eyebrow">VARMUUSKOPIOT</p><h2>Automaattiset varmuuskopiot</h2><p>Selain säilyttää {BACKUP_LIMIT} viimeisintä tilannekuvaa. Varmuuskopio otetaan automaattisesti viiden minuutin välein muutosten yhteydessä sekä ennen palautusta, tuontia ja skenaarion poistoa.</p></div>
        {!readOnly && <button type="button" className="primary-button" onClick={onCreate}><Save size={16} /> Luo varmuuskopio nyt</button>}
      </header>
      <section className="planner-card">
        {backups.length === 0 && <p className="empty-text">Varmuuskopioita ei ole vielä.</p>}
        <ol className="backup-list">
          {backups.map((backup) => (
            <li key={backup.id}>
              <History size={16} aria-hidden="true" />
              <span className="backup-text"><strong>{new Date(backup.createdAt).toLocaleString('fi-FI')}</strong><small>{backup.reason} · {backup.document.scenarios.length} skenaariota · {backup.document.scenarios.reduce((sum, scenario) => sum + scenario.regions.length, 0)} aluetta</small></span>
              {!readOnly && <button type="button" className="secondary-button" onClick={() => onRestore(backup)} aria-label={`Palauta varmuuskopio ${new Date(backup.createdAt).toLocaleString('fi-FI')}`}><RotateCcw size={15} /> Palauta</button>}
            </li>
          ))}
        </ol>
      </section>
      {backups.length > 0 && (
        <section className="planner-card">
          <h2 className="card-title">Vertaa tilannekuvia</h2>
          <div className="inline-form">
            <label className="field grow">Lähtötilanne<select value={left} onChange={(event) => setLeft(event.target.value)}>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
            <label className="field grow">Verrattava<select value={right} onChange={(event) => setRight(event.target.value)}>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          </div>
          <p className="hint">Aktiivisen skenaarion väestökattavuus vuoden 2025 aineistolla: {formatCount(beforePopulation)} → {formatCount(afterPopulation)} asukasta. Muutos: {beforePopulation !== null && afterPopulation !== null ? formatCount(afterPopulation - beforePopulation) : 'Ei tietoa'}. Päällekkäiset kunnat lasketaan kerran; tämä ei kuvaa historiallista väestömuutosta.</p>
          {comparison && (empty ? <p className="validation-ok">Tilannekuvat ovat sisällöltään samat.</p> : (
            <ul className="diff-list">
              {comparison.addedScenarios.map((name) => <li key={`as-${name}`} className="added">+ Skenaario {name}</li>)}
              {comparison.removedScenarios.map((name) => <li key={`rs-${name}`} className="removed">− Skenaario {name}</li>)}
              {comparison.addedRegions.map((item, index) => <li key={`ar-${index}`} className="added">+ {item.scenario}: {item.region}</li>)}
              {comparison.removedRegions.map((item, index) => <li key={`rr-${index}`} className="removed">− {item.scenario}: {item.region}</li>)}
              {comparison.changedRegions.map((item, index) => <li key={`cr-${index}`} className="changed">~ {item.scenario}: {item.region} ({item.changes.join(', ')})</li>)}
            </ul>
          ))}
        </section>
      )}
    </div>
  );
}
