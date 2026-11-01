import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Archive, Download, FileUp, Pencil, Plus, RotateCcw, Search, X } from 'lucide-react';
import { clubRepository } from '../data/clubRepository';
import { getVotingPower } from '../services/membershipRules.ts';
import { exportClubFile, parseClubFile, planClubImport, type ClubFileRecord, type ClubImportMode } from '../services/clubImportExport.ts';

interface AdminClub {
  id: string;
  seura: string;
  paikkakunta: string;
  latitude: number | null;
  longitude: number | null;
  jasenmaara: number | null;
  aanimaara: number | null;
  contact: {
    name: string;
    email: string;
    phone: string;
    website: string;
    instagram: string;
    tiktok: string;
    public: boolean;
  };
  details: Record<string, string | number>;
  archived: boolean;
}

interface ClubStore {
  version: 1;
  data: AdminClub[];
  revision: string;
}

interface ClubDraft {
  seura: string;
  paikkakunta: string;
  latitude: string;
  longitude: string;
  jasenmaara: string;
  name: string;
  email: string;
  phone: string;
  website: string;
  instagram: string;
  tiktok: string;
  public: boolean;
}

const endpoint = `${import.meta.env.BASE_URL}api/clubs.php`;
const emptyDraft = (): ClubDraft => ({
  seura: '', paikkakunta: '', latitude: '', longitude: '', jasenmaara: '',
  name: '', email: '', phone: '', website: '', instagram: '', tiktok: '', public: false,
});

function toDraft(club: AdminClub): ClubDraft {
  return {
    seura: club.seura,
    paikkakunta: club.paikkakunta,
    latitude: club.latitude?.toString() ?? '',
    longitude: club.longitude?.toString() ?? '',
    jasenmaara: club.jasenmaara?.toString() ?? '',
    ...club.contact,
  };
}

function downloadJson(value: unknown, name: string) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importSummary(summary: ReturnType<typeof planClubImport>['summary']): string {
  return `Lisätty ${summary.added}, päivitetty ${summary.updated}, ennallaan ${summary.unchanged}, ohitettu ${summary.skipped}, arkistoitu ${summary.archived}, palautettu ${summary.restored}${summary.removed ? `, poistuu korvauksessa ${summary.removed}` : ''}.`;
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const result = await response.json().catch(() => null) as unknown;
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(`Palvelin vastasi virheellisellä JSON-tiedolla (${response.status}).`);
  }
  return result as Record<string, unknown>;
}

export function ClubsAdmin({ csrfToken }: { csrfToken: string }) {
  const [store, setStore] = useState<ClubStore | null>(null);
  const [draft, setDraft] = useState<ClubDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [exportConfirmed, setExportConfirmed] = useState(false);
  const [importedClubs, setImportedClubs] = useState<ClubFileRecord[] | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importMode, setImportMode] = useState<ClubImportMode>('merge');
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${endpoint}?view=admin`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const result = await responseJson(response);
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : `Seuratietoja ei voitu ladata (${response.status}).`);
      if (result.version !== 1 || !Array.isArray(result.data) || typeof result.revision !== 'string') {
        throw new Error('Ylläpitäjän seuratietovastaus ei vastaa tuettua rakennetta.');
      }
      setStore({ version: 1, data: result.data as AdminClub[], revision: result.revision });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Seuratietoja ei voitu ladata.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const clubs = useMemo(() => (store?.data ?? [])
    .filter((club) => showArchived || !club.archived)
    .filter((club) => `${club.seura} ${club.paikkakunta} ${club.contact.name} ${club.contact.email}`.toLocaleLowerCase('fi').includes(query.trim().toLocaleLowerCase('fi')))
    .sort((a, b) => a.seura.localeCompare(b.seura, 'fi')), [store, showArchived, query]);
  const importPlan = useMemo(() => {
    if (!store || !importedClubs) return null;
    try {
      return { plan: planClubImport(store.data, importedClubs, importMode), error: '' };
    } catch (cause) {
      return { plan: null, error: cause instanceof Error ? cause.message : 'Tuonnin esikatselua ei voitu muodostaa.' };
    }
  }, [store, importedClubs, importMode]);

  const startNew = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setError('');
    setMessage('');
  };

  const startEdit = (club: AdminClub) => {
    setEditingId(club.id);
    setDraft(toDraft(club));
    setError('');
    setMessage('');
  };

  const saveStore = async (data: AdminClub[], success: string) => {
    if (!store) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
          'X-Expected-Revision': store.revision,
        },
        body: JSON.stringify({ version: 1, data }),
      });
      const result = await responseJson(response);
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : `Tallennus epäonnistui (${response.status}).`);
      if (typeof result.revision !== 'string') throw new Error('Tallennus onnistui, mutta palvelimen vastausrevision puuttuu.');
      setStore({ version: 1, data, revision: result.revision });
      setDraft(null);
      setEditingId(null);
      setMessage(success);
      try {
        await clubRepository.refresh();
        window.dispatchEvent(new Event('clubs-updated'));
      } catch {
        setMessage(`${success} Julkisen näkymän päivitys ei onnistunut; lataa sivu uudelleen.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Seuratietoja ei voitu tallentaa.');
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!store || !draft) return;
    const latitude = draft.latitude.trim() === '' ? null : Number(draft.latitude);
    const longitude = draft.longitude.trim() === '' ? null : Number(draft.longitude);
    const members = draft.jasenmaara.trim() === '' ? null : Number(draft.jasenmaara);
    if ((latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90))
      || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
      setError('Tarkista koordinaatit: leveysaste -90–90 ja pituusaste -180–180.');
      return;
    }
    if (members !== null && (!Number.isSafeInteger(members) || members < 0)) {
      setError('Jäsenmäärän tulee olla nolla tai positiivinen kokonaisluku.');
      return;
    }

    const existing = editingId ? store.data.find((club) => club.id === editingId) : undefined;
    const club: AdminClub = {
      id: existing?.id ?? `club_${crypto.randomUUID().replaceAll('-', '')}`,
      seura: draft.seura.trim(),
      paikkakunta: draft.paikkakunta.trim(),
      latitude,
      longitude,
      jasenmaara: members,
      aanimaara: getVotingPower(members),
      contact: {
        name: draft.name.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        website: draft.website.trim(),
        instagram: draft.instagram.trim(),
        tiktok: draft.tiktok.trim(),
        public: draft.public,
      },
      details: existing?.details ?? {},
      archived: existing?.archived ?? false,
    };
    const data = existing
      ? store.data.map((item) => item.id === existing.id ? club : item)
      : [...store.data, club];
    void saveStore(data, existing ? 'Seuran tiedot tallennettiin.' : 'Seura lisättiin.');
  };

  const toggleArchived = (club: AdminClub) => {
    const action = club.archived ? 'Palautetaanko' : 'Arkistoidaanko';
    if (!window.confirm(`${action} seura "${club.seura}"? ${club.archived ? 'Seura tulee takaisin julkiseen näkymään.' : 'Seura poistuu julkisesta näkymästä, mutta sen tiedot säilyvät.'}`)) return;
    void saveStore(store!.data.map((item) => item.id === club.id ? { ...item, archived: !item.archived } : item),
      club.archived ? 'Seura palautettiin.' : 'Seura arkistoitiin.');
  };

  const handleImportFile = async (file: File | undefined) => {
    setImportedClubs(null);
    setImportWarnings([]);
    setImportFileName('');
    setBackupDownloaded(false);
    setReplaceConfirmed(false);
    setError('');
    setMessage('');
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('JSON-tiedosto ylittää sallitun 10 Mt rajan.');
      return;
    }
    try {
      const parsed = parseClubFile(JSON.parse(await file.text()) as unknown);
      setImportedClubs(parsed.clubs);
      setImportWarnings(parsed.warnings);
      setImportFileName(file.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'JSON-tuontitiedostoa ei voitu käsitellä.');
    }
  };

  const exportCurrent = (asBackup = false) => {
    if (!store) return;
    const file = exportClubFile(store.data, asBackup || includeArchived);
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(file, `seurakartta-seurat-${date}${asBackup ? '-varmuuskopio' : ''}.json`);
    if (asBackup) setBackupDownloaded(true);
    setError('');
    setMessage(asBackup
      ? 'Yksityisen seuratietoaineiston varmuuskopio ladattiin. Säilytä tiedosto turvallisessa paikassa.'
      : `JSON-vienti ladattiin (${file.clubs.length} seuraa, sisältää myös yksityisiksi merkityt yhteystiedot).`);
  };

  const performImport = () => {
    if (!store || !importPlan?.plan) return;
    if (importMode === 'replace' && (!backupDownloaded || !replaceConfirmed)) return;
    const plan = importPlan.plan;
    const success = `JSON-tuonti valmis: ${importSummary(plan.summary)}`;
    setImportedClubs(null);
    setImportWarnings([]);
    setImportFileName('');
    setBackupDownloaded(false);
    setReplaceConfirmed(false);
    void saveStore(plan.data, success);
  };

  return (
    <section className="planner-card clubs-admin" aria-labelledby="clubs-admin-title">
      <header className="card-header clubs-admin-header">
        <div>
          <h2 id="clubs-admin-title">Seurahallinta</h2>
          <p>Hallitse seurojen perustietoja ja yhteystietoja. Arkistointi säilyttää tiedot ja piilottaa seuran julkisista näkymistä.</p>
        </div>
        <button type="button" className="primary-button" onClick={startNew} disabled={!store || saving}><Plus size={16} /> Lisää seura</button>
      </header>

      {error && <p className="field-error" role="alert">{error} {error.includes('muuttuneet') && <button type="button" className="text-button" onClick={() => void load()}>Lataa uusin aineisto</button>}</p>}
      {message && <p className="validation-ok" role="status">{message}</p>}
      {loading && <p role="status">Ladataan hallittavia seuratietoja…</p>}
      {!loading && !store && !error && <p className="notice">Seuratietoja ei ole saatavilla.</p>}

      {store && (
        <>
        <section className="clubs-json-tools" aria-labelledby="clubs-json-title">
          <div className="clubs-json-heading">
            <div><h3 id="clubs-json-title">JSON-varmuuskopio ja tiedonsiirto</h3><p>Versionoitu tiedostomuoto säilyttää seura-ID:t, arkistointitilan ja lisätiedot.</p></div>
          </div>
          <fieldset className="clubs-json-options">
            <legend>Vienti</legend>
            <label className="checkbox"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /> Sisällytä arkistoidut seurat</label>
            <p className="notice">Viety JSON sisältää kaikki yhteystiedot, myös yksityisiksi merkityt henkilötiedot. Käsittele ja säilytä tiedostoa turvallisesti.</p>
            <label className="checkbox"><input type="checkbox" checked={exportConfirmed} onChange={(event) => setExportConfirmed(event.target.checked)} /> Ymmärrän, että vientitiedosto sisältää myös yksityisiä yhteystietoja</label>
            <button type="button" className="secondary-button" disabled={!exportConfirmed} onClick={() => exportCurrent()}><Download size={15} /> Vie seurat JSON-tiedostona</button>
          </fieldset>

          <fieldset className="clubs-json-options">
            <legend>Tuonti ja esikatselu</legend>
            <label className="field">Valitse Seurakartta JSON -tiedosto
              <input type="file" accept=".json,application/json" onChange={(event) => void handleImportFile(event.target.files?.[0])} />
            </label>
            {importFileName && <p className="hint">Valittu tiedosto: {importFileName} · {importedClubs?.length ?? 0} tietuetta</p>}
            {importedClubs && (
              <>
                <fieldset className="clubs-json-modes">
                  <legend>Tuontitapa</legend>
                  <label className="checkbox"><input type="radio" name="club-import-mode" value="merge" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} /> Yhdistä ja päivitä ID:n perusteella</label>
                  <label className="checkbox"><input type="radio" name="club-import-mode" value="new" checked={importMode === 'new'} onChange={() => setImportMode('new')} /> Lisää vain uudet, ohita nykyiset</label>
                  <label className="checkbox"><input type="radio" name="club-import-mode" value="replace" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} /> Korvaa koko aineisto</label>
                </fieldset>
                {importWarnings.map((warning) => <p className="notice" role="status" key={warning}>{warning}</p>)}
                {importPlan?.error && <p className="field-error" role="alert">{importPlan.error}</p>}
                {importPlan?.plan && (
                  <div className="clubs-import-preview" aria-live="polite">
                    <strong>Esikatselun tulos</strong>
                    <p>{importSummary(importPlan.plan.summary)}</p>
                    {importMode === 'replace' && <>
                      <p className="notice">Korvaaminen poistaa nykyisestä aineistosta {importPlan.plan.summary.removed} tiedostosta puuttuvaa seuraa ja voi muuttaa yhteystietojen julkisuusasetuksia.</p>
                      <p className="notice">Ennen korvaamista lataa nykyisestä aineistosta yksityinen JSON-varmuuskopio. Varmuuskopio sisältää myös salassa pidettävät yhteystiedot.</p>
                      <button type="button" className="secondary-button" onClick={() => exportCurrent(true)}><Download size={15} /> Lataa nykyisen aineiston varmuuskopio</button>
                      <label className="checkbox"><input type="checkbox" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} disabled={!backupDownloaded} /> Vahvistan nykyisen koko aineiston korvaamisen tuontitiedoston sisällöllä</label>
                    </>}
                    <button type="button" className={importMode === 'replace' ? 'secondary-button danger' : 'primary-button'} onClick={performImport} disabled={saving || (importMode === 'replace' && (!backupDownloaded || !replaceConfirmed))}>
                      <FileUp size={15} /> {saving ? 'Tallennetaan…' : importMode === 'replace' ? 'Korvaa koko aineisto' : 'Tuo esikatseltu aineisto'}
                    </button>
                  </div>
                )}
              </>
            )}
          </fieldset>
        </section>
        <div className="clubs-admin-layout">
          <aside className="clubs-admin-list" aria-label="Seuraluettelo">
            <label className="field">Hae seuraa
              <span className="clubs-admin-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} /></span>
            </label>
            <label className="checkbox"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Näytä arkistoidut</label>
            <p className="hint">{clubs.length} / {store.data.length} seuraa</p>
            <ul className="clubs-admin-items">
              {clubs.map((club) => (
                <li key={club.id} className={club.archived ? 'archived' : ''}>
                  <div className="clubs-admin-item-name"><strong>{club.seura}</strong><span>{club.paikkakunta}{club.archived ? ' · arkistoitu' : ''}</span></div>
                  <div className="clubs-admin-actions">
                    <button type="button" className="icon-button" aria-label={`Muokkaa: ${club.seura}`} title="Muokkaa" onClick={() => startEdit(club)} disabled={saving}><Pencil size={15} /></button>
                    <button type="button" className="icon-button" aria-label={club.archived ? `Palauta: ${club.seura}` : `Arkistoi: ${club.seura}`} title={club.archived ? 'Palauta' : 'Arkistoi'} onClick={() => toggleArchived(club)} disabled={saving}>
                      {club.archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                    </button>
                  </div>
                </li>
              ))}
              {clubs.length === 0 && <li className="empty-text">Hakua vastaavia seuroja ei löytynyt.</li>}
            </ul>
          </aside>

          {draft && (
            <form className="clubs-admin-form" onSubmit={submit}>
              <div className="clubs-admin-form-title">
                <h3>{editingId ? 'Muokkaa seuraa' : 'Uusi seura'}</h3>
                <button type="button" className="icon-button" aria-label="Sulje lomake" onClick={() => { setDraft(null); setEditingId(null); }} disabled={saving}><X size={16} /></button>
              </div>
              <div className="form-grid">
                <label className="field">Seuran nimi<input required maxLength={200} value={draft.seura} onChange={(event) => setDraft({ ...draft, seura: event.target.value })} /></label>
                <label className="field">Paikkakunta<input required maxLength={200} value={draft.paikkakunta} onChange={(event) => setDraft({ ...draft, paikkakunta: event.target.value })} /></label>
                <label className="field">Leveysaste<input type="number" min="-90" max="90" step="any" value={draft.latitude} onChange={(event) => setDraft({ ...draft, latitude: event.target.value })} /></label>
                <label className="field">Pituusaste<input type="number" min="-180" max="180" step="any" value={draft.longitude} onChange={(event) => setDraft({ ...draft, longitude: event.target.value })} /></label>
                <label className="field">Jäsenmäärä<input type="number" min="0" step="1" value={draft.jasenmaara} onChange={(event) => setDraft({ ...draft, jasenmaara: event.target.value })} /><small className="hint">Äänivalta lasketaan automaattisesti jäsenmäärän perusteella.</small></label>
                <label className="field">Yhteyshenkilön nimi<input maxLength={200} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                <label className="field">Sähköposti<input type="email" maxLength={254} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
                <label className="field">Puhelinnumero<input type="tel" maxLength={50} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
                <label className="field">WWW-sivu<input type="url" maxLength={2048} placeholder="https://" value={draft.website} onChange={(event) => setDraft({ ...draft, website: event.target.value })} /></label>
                <label className="field">Instagram-linkki<input type="url" maxLength={2048} placeholder="https://" value={draft.instagram} onChange={(event) => setDraft({ ...draft, instagram: event.target.value })} /></label>
                <label className="field">TikTok-linkki<input type="url" maxLength={2048} placeholder="https://" value={draft.tiktok} onChange={(event) => setDraft({ ...draft, tiktok: event.target.value })} /></label>
              </div>
              <label className="checkbox clubs-admin-public"><input type="checkbox" checked={draft.public} onChange={(event) => setDraft({ ...draft, public: event.target.checked })} /> Näytä yhteystiedot julkisessa seurakartassa</label>
              <p className="hint">Yhteystiedot pysyvät yksityisinä, kunnes tämä asetus valitaan. Vain HTTP(S)-osoitteet hyväksytään linkeiksi.</p>
              <div className="button-row">
                <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Tallennetaan…' : 'Tallenna seura'}</button>
                <button type="button" className="secondary-button" onClick={() => { setDraft(null); setEditingId(null); }} disabled={saving}>Peruuta</button>
              </div>
            </form>
          )}
        </div>
        </>
      )}
    </section>
  );
}
