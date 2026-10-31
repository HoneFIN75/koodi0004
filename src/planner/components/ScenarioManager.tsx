import { useState } from 'react';
import { Check, Copy, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import type { PlannerDocument } from '../../models/region';

interface ScenarioManagerProps {
  document: PlannerDocument;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onSwitch: (id: string) => void;
  readOnly?: boolean;
}

export function ScenarioManager({ document, onCreate, onRename, onDuplicate, onDelete, onSwitch, readOnly = false }: ScenarioManagerProps) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  return (
    <div className="view-stack">
      <header className="view-header"><div><p className="eyebrow">SKENAARIOT</p><h2>Suunnitteluskenaariot</h2><p>Jokaisella skenaariolla on omat aluemäärityksensä. Kartta ja analytiikka seuraavat aktiivista skenaariota.</p></div></header>
      {!readOnly && <form className="planner-card inline-form" onSubmit={(event) => { event.preventDefault(); onCreate(name); setName(''); }}>
        <label className="field grow">Uuden skenaarion nimi<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Esim. Ehdotus A tai Aluemalli 2030" maxLength={120} /></label>
        <button type="submit" className="primary-button"><Plus size={16} /> Luo skenaario</button>
      </form>}
      <ul className="scenario-grid">
        {document.scenarios.map((scenario) => {
          const active = scenario.id === document.activeScenarioId;
          const municipalities = new Set(scenario.regions.flatMap((region) => region.municipalityCodes)).size;
          return (
            <li key={scenario.id} className={`planner-card scenario-card${active ? ' active' : ''}`}>
              {!readOnly && editing?.id === scenario.id ? (
                <form className="inline-form" onSubmit={(event) => { event.preventDefault(); onRename(scenario.id, editing.name); setEditing(null); }}>
                  <label className="field grow"><span className="sr-only">Skenaarion nimi</span><input autoFocus value={editing.name} onChange={(event) => setEditing({ id: scenario.id, name: event.target.value })} maxLength={120} /></label>
                  <button type="submit" className="icon-button" aria-label="Tallenna nimi"><Check size={16} /></button>
                </form>
              ) : (
                <h3>{scenario.name} {active && <span className="pill">aktiivinen</span>}</h3>
              )}
              <p className="hint">{scenario.regions.length} aluetta · {municipalities} kuntaa · muokattu {new Date(scenario.updatedAt).toLocaleString('fi-FI')}</p>
              <ul className="swatch-row" aria-hidden="true">{scenario.regions.slice(0, 24).map((region) => <li key={region.id} style={{ background: region.color }} />)}</ul>
              <div className="button-row">
                {!active && <button type="button" className="primary-button" onClick={() => onSwitch(scenario.id)}><FolderOpen size={15} /> Avaa</button>}
                {!readOnly && <>
                  <button type="button" className="secondary-button" onClick={() => setEditing({ id: scenario.id, name: scenario.name })} aria-label={`Nimeä uudelleen ${scenario.name}`}><Pencil size={15} /> Nimeä</button>
                  <button type="button" className="secondary-button" onClick={() => onDuplicate(scenario.id)} aria-label={`Monista ${scenario.name}`}><Copy size={15} /> Monista</button>
                  <button type="button" className="secondary-button danger" disabled={document.scenarios.length <= 1} onClick={() => onDelete(scenario.id)} aria-label={`Poista ${scenario.name}`}><Trash2 size={15} /> Poista</button>
                </>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
