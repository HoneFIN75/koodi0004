import { useEffect, useState } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { ApplicationIntro, ApplicationOverview, ApplicationIntegrations } from '../components/ApplicationOverview';
import { SiteHeader } from '../components/SiteHeader';
import { clubRepository } from '../data/clubRepository';
import { dataSources } from '../data/dataSources';
import { municipalityRepository } from '../data/municipalityRepository';
import { provinceRepository } from '../data/provinceRepository';
import type { DataSourceMetadata } from '../models/dataSource';
import { getDataSourceMetadata, latestSourceTimestamp, type DataSourceSnapshot } from '../services/dataSourceService';
import { populationService } from '../services/populationService';
import { refreshCompetitions } from '../state/competitionStore';
import { plannerStore } from '../state/plannerStore';
import { useCompetitionData } from '../state/useCompetitions';
import { usePlanner } from '../state/usePlanner';

const unavailable = 'Ei saatavilla';
const numberFormat = new Intl.NumberFormat('fi-FI');
const dateFormat = new Intl.DateTimeFormat('fi-FI', { dateStyle: 'medium', timeStyle: 'short' });
const formatCount = (value: number | null | undefined) => value == null ? unavailable : numberFormat.format(value);

function Timestamp({ value }: { value?: string | null }) {
  const timestamp = latestSourceTimestamp([value]);
  return timestamp ? <time dateTime={timestamp}>{dateFormat.format(new Date(timestamp))}</time> : <>{unavailable}</>;
}

function SourceMetadata({ metadata }: { metadata: DataSourceMetadata }) {
  const years = metadata.years;
  const period = years?.length ? years[years.length - 1] - years[0] + 1 === years.length
    ? years.length === 1 ? String(years[0]) : `${years[0]}–${years[years.length - 1]}`
    : years.join(', ') : unavailable;
  return (
    <dl className="data-source-metadata">
      <div><dt>Lähdejärjestelmä</dt><dd>{metadata.sourceSystem ?? unavailable}</dd></div>
      <div><dt>Päivitystiheys</dt><dd>{metadata.updateFrequency ?? unavailable}</dd></div>
      <div><dt>Tietuemäärä</dt><dd>{formatCount(metadata.recordCount)}</dd></div>
      {years !== undefined && <div><dt>Aineistovuodet</dt><dd>{period}</dd></div>}
      <div><dt>Viimeisin päivitys</dt><dd><Timestamp value={metadata.lastUpdatedAt} /></dd></div>
      <div><dt>Lähteen omistaja</dt><dd>{metadata.sourceOwner ?? unavailable}</dd></div>
    </dl>
  );
}

export default function DataSourcesPage() {
  const [datasets, setDatasets] = useState<Pick<DataSourceSnapshot, 'clubs' | 'municipalities' | 'provinces'>>({
    clubs: null, municipalities: null, provinces: null,
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const { index, error: competitionError, refreshing } = useCompetitionData();
  const document_ = usePlanner((state) => state.history.present);
  const ready = usePlanner((state) => state.ready);
  const loadError = usePlanner((state) => state.loadError);
  const saveStatus = usePlanner((state) => state.saveStatus);
  const migrationAvailable = usePlanner((state) => state.migrationAvailable);

  useEffect(() => { void plannerStore.getState().init(); }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrors([]);
    Promise.allSettled([
      clubRepository.getDatabase(),
      municipalityRepository.getMunicipalities(),
      provinceRepository.getProvinces(),
    ]).then(([clubs, municipalities, provinces]) => {
      if (!active) return;
      setDatasets({
        clubs: clubs.status === 'fulfilled' ? clubs.value : null,
        municipalities: municipalities.status === 'fulfilled' ? municipalities.value : null,
        provinces: provinces.status === 'fulfilled' ? provinces.value : null,
      });
      setErrors([clubs, municipalities, provinces].flatMap((result, index_) => result.status === 'rejected'
        ? [`${['Seurat', 'Kunnat ja kartta', 'Maakunnat'][index_]}: ${result.reason instanceof Error ? result.reason.message : 'Aineistoa ei voitu ladata.'}`]
        : []));
      setLoading(false);
    });
    return () => { active = false; };
  }, [attempt]);

  const metadata = getDataSourceMetadata({
    ...datasets,
    competitions: index,
    planning: ready && !loadError ? document_ : null,
  }, populationService.municipalities.length);
  const lastUpdatedAt = latestSourceTimestamp(Object.values(metadata).map((source) => source.lastUpdatedAt));
  const summary = [
    { label: 'Seurojen määrä', value: metadata.clubs.recordCount },
    { label: 'Kilpailujen määrä', value: metadata.competitions.recordCount },
    { label: 'Kuntien määrä', value: metadata.municipalities.recordCount },
    { label: 'Maakuntien määrä', value: metadata.provinces.recordCount },
    { label: 'Käyttäjän luomien alueiden määrä', value: metadata.planning.recordCount },
  ];

  return (
    <main className="app-shell data-sources-page">
      <SiteHeader page="dataSources" />
      <ApplicationIntro />
      <ApplicationOverview />

      <section className="application-section application-data-section" aria-labelledby="data-sources-title">
        <div className="section-heading"><div><div className="eyebrow">TIEDON ALKUPERÄ JA KÄYTTÖ</div><h2 id="data-sources-title" tabIndex={-1}>Datalähteet</h2><p>Tässä osiossa kuvataan sovelluksen käyttämät datalähteet, integraatiot ja tiedon alkuperä.</p></div></div>
        <p className="application-note">Tämä sivu kuvaa kaikki sovelluksessa käytettävät datalähteet, niiden sisällön sekä käyttötarkoituksen. Tiedot auttavat ymmärtämään, mistä analyysit, karttanäkymät, aluejaot ja raportit muodostuvat.</p>
        <ApplicationIntegrations />

        {loading && <p className="loading-state" role="status"><span className="loading-spinner" />Ladataan datalähteiden tietoja…</p>}
        {errors.length > 0 && <div className="error-banner" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <div><strong>Kaikkia aineistoja ei voitu ladata</strong>
            {errors.map((error) => <p key={error}>{error}</p>)}
            <button className="clear-filters" onClick={() => setAttempt((value) => value + 1)} disabled={loading}>Yritä uudelleen</button>
          </div>
        </div>}
        {datasets.clubs?.warnings.map((warning) => <p className="data-warning" role="status" key={warning}>{warning}</p>)}
        {populationService.warnings.map((warning) => <p className="data-warning" role="status" key={warning}>{warning}</p>)}
        {competitionError && <div className="data-warning" role="alert">
          <div><p>Kilpailut: {competitionError}</p>
            {index && <p>Näytetään viimeksi onnistuneesti ladatun kilpailuaineiston lukumäärä. Tieto voi olla vanhentunut.</p>}
            <button className="clear-filters" onClick={() => void refreshCompetitions()} disabled={refreshing}>Yritä kilpailujen latausta uudelleen</button>
          </div>
        </div>}
        {loadError && <div className="data-warning" role="alert">
          <div><p>Aluesuunnittelun tiedot: {loadError}</p>
            <button className="clear-filters" onClick={() => void plannerStore.getState().retryInit()}>Yritä suunnitelmien latausta uudelleen</button>
          </div>
        </div>}
        {migrationAvailable && <p className="data-warning" role="status">Aluesuunnittelun tiedot ovat tämän selaimen suunnitelmasta. Niitä ei ole vielä siirretty yhteiseen palvelintallennukseen.</p>}

        <section className="data-source-list" aria-label="Sovelluksen datalähteet">
          {dataSources.map((source) => {
            const Icon = source.icon;
            return (
              <details className="panel data-source-card" key={source.id}>
                <summary>
                  <span className="section-icon"><Icon size={20} aria-hidden="true" /></span>
                  <div><h3>{source.title}</h3><p>{source.description}</p></div>
                  <ChevronDown className="data-source-chevron" size={20} aria-hidden="true" />
                </summary>
                <div className="data-source-content">
                  <div className="data-source-sections">
                    {source.sections.map((section) => (
                      <section key={section.title}>
                        <h4>{section.title}</h4>
                        {section.text && <p>{section.text}</p>}
                        {section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
                      </section>
                    ))}
                  </div>
                  <section className="data-source-facts" aria-label={`${source.title}: metatiedot`}>
                    <h4>Lähteen metatiedot</h4>
                    <SourceMetadata metadata={{ ...source.metadata, ...metadata[source.id] }} />
                  </section>
                </div>
              </details>
            );
          })}
        </section>

        <section className="panel data-sources-summary" aria-labelledby="data-sources-summary-title">
          <div className="panel-heading"><div><h3 id="data-sources-summary-title">Kokonaisuus</h3><p>Ladattujen aineistojen yhteenveto ilman haku- ja vuosisuodattimia.</p></div></div>
          <dl className="data-source-summary-grid">
            {summary.map((item) => <div className="metric-card" key={item.label}><dt>{item.label}</dt><dd>{formatCount(item.value)}</dd></div>)}
            <div className="metric-card"><dt>Viimeisin päivitysajankohta</dt><dd><Timestamp value={lastUpdatedAt} /></dd></div>
          </dl>
          <p>Aluemäärä kattaa kaikki skenaariot, ei varmuuskopioita. {saveStatus !== 'saved' && 'Suunnitelmassa on tallentamattomia muutoksia; aluemäärä vastaa nykyistä suunnitelmaa.'}</p>
          <p>Päivitysajankohta on uusin saatavilla oleva seura- tai kuntarajatiedoston muodostamisaika tai suunnittelualueen muokkausaikaleima. Se ei ole sivun latausaika eikä vahvista muiden lähteiden ajantasaisuutta. Tuntemattomat arvot merkitään tekstillä ”Ei saatavilla”.</p>
        </section>
      </section>
    </main>
  );
}
