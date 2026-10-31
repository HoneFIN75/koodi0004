import { useState } from 'react';
import { Download, FileJson, FileSpreadsheet, FileText, Upload } from 'lucide-react';
import { parseImport, type ImportResult } from '../../services/plannerDocument';

interface DataManagerProps {
  onExport: (format: 'json' | 'csv' | 'xlsx', scope: 'all' | 'active') => void;
  onImport: (result: ImportResult, mode: 'scenarios' | 'append' | 'replace') => void;
  knownCodes: Set<string>;
}

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export function DataManager({ onExport, onImport, knownCodes }: DataManagerProps) {
  const [scope, setScope] = useState<'all' | 'active'>('all');
  const [pending, setPending] = useState<{ file: string; result: ImportResult } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const readFile = async (file: File | undefined) => {
    setError(''); setMessage(''); setPending(null);
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('Tiedosto on liian suuri (enintään 10 Mt).');
      setPending({ file: file.name, result: parseImport(JSON.parse(await file.text())) });
    } catch (cause) {
      setError(cause instanceof SyntaxError ? 'Tiedosto ei ole kelvollista JSONia.' : cause instanceof Error ? cause.message : 'Tuonti epäonnistui.');
    }
  };
  const regions = pending ? (pending.result.kind === 'document' ? pending.result.scenarios.flatMap((scenario) => scenario.regions) : pending.result.regions) : [];
  const unknown = new Set(regions.flatMap((region) => region.municipalityCodes).filter((code) => !knownCodes.has(code)));
  const apply = (mode: 'scenarios' | 'append' | 'replace') => {
    if (!pending) return;
    onImport(pending.result, mode);
    setMessage(`Tuotu tiedostosta ${pending.file}.`);
    setPending(null);
  };

  return (
    <div className="view-stack">
      <header className="view-header"><div><p className="eyebrow">TUONTI JA VIENTI</p><h2>Siirrä suunnitelmia</h2><p>Vienti sisältää alueet, kunnat, värit, läpinäkyvyyden, näkyvyyden ja metatiedot.</p></div></header>
      <section className="planner-card">
        <h2 className="card-title"><Download size={17} /> Vie</h2>
        <fieldset className="radio-row">
          <legend className="sr-only">Viennin laajuus</legend>
          <label className="checkbox"><input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} /> Kaikki skenaariot</label>
          <label className="checkbox"><input type="radio" name="scope" checked={scope === 'active'} onChange={() => setScope('active')} /> Vain aktiivinen skenaario</label>
        </fieldset>
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={() => onExport('json', scope)}><FileJson size={16} /> JSON</button>
          <button type="button" className="secondary-button" onClick={() => onExport('csv', scope)}><FileText size={16} /> CSV</button>
          <button type="button" className="secondary-button" onClick={() => onExport('xlsx', scope)}><FileSpreadsheet size={16} /> Excel (.xlsx)</button>
        </div>
        <p className="hint">JSON-vienti voidaan tuoda takaisin sellaisenaan. CSV käyttää puolipistettä erottimena (suomenkielinen Excel).</p>
      </section>
      <section className="planner-card">
        <h2 className="card-title"><Upload size={17} /> Tuo</h2>
        <label className="field">JSON-tiedosto (skenaariot tai pelkät alueet)
          <input type="file" accept="application/json,.json" onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
        {error && <p className="field-error" role="alert">{error}</p>}
        {message && <p className="validation-ok" role="status">{message}</p>}
        {pending && (
          <div className="import-preview" role="status">
            <p><strong>{pending.file}</strong>: {pending.result.kind === 'document' ? `${pending.result.scenarios.length} skenaariota, ` : ''}{regions.length} aluetta.</p>
            {unknown.size > 0 && <p className="field-error">{unknown.size} tuntematonta kuntakoodia: {[...unknown].slice(0, 10).join(', ')}{unknown.size > 10 ? '…' : ''}</p>}
            <div className="button-row">
              {pending.result.kind === 'document' && <button type="button" className="primary-button" onClick={() => apply('scenarios')}>Tuo uusina skenaarioina</button>}
              <button type="button" className="secondary-button" onClick={() => apply('append')}>Lisää alueet aktiiviseen skenaarioon</button>
              <button type="button" className="secondary-button danger" onClick={() => apply('replace')}>Korvaa aktiivisen skenaarion alueet</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
