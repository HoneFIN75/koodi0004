import type { Competition } from '../models/competition';
import { formatCompetitionDate, getPrimaryMunicipality, getSecondaryMunicipalities } from '../services/competitionService';
import { formatCompetitionDivision } from '../services/competitionPresentation';

export function CompetitionDetails({ competition, onClose }: { competition: Competition; onClose: () => void }) {
  const primary = getPrimaryMunicipality(competition);
  const others = getSecondaryMunicipalities(competition);
  return <section className="competition-details panel planner-card" aria-label="Kilpailun tiedot" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
    <header><h3>{competition.name} · {competition.year ?? 'Vuosi puuttuu'}</h3><button type="button" onClick={onClose} aria-label="Sulje kilpailun tiedot">Sulje</button></header>
    <dl>
      <div><dt>Ensisijainen kunta</dt><dd>{primary?.name ?? 'Ei yksikäsitteistä ensisijaista kuntaa'}{primary && !primary.municipalityCode && ' · maantieteellinen kohdistus puuttuu'}</dd></div>
      <div><dt>Muut kunnat</dt><dd>{others.map((item) => `${item.name}${item.municipalityCode ? '' : ' (kohdistus puuttuu)'}`).join(', ') || 'Ei muita kuntia'}</dd></div>
      <div><dt>Järjestäjä</dt><dd>{competition.organizer}</dd></div>
      <div><dt>Kilpailumalli</dt><dd>{competition.competitionModel}</dd></div>
      <div><dt>Luokkajako</dt><dd>{formatCompetitionDivision(competition.divisionType)}</dd></div>
      <div><dt>PDGA-luokitus</dt><dd>{competition.pdgaTier}</dd></div>
      <div><dt>Alkamispäivä</dt><dd>{formatCompetitionDate(competition.startDate)}</dd></div>
      <div><dt>Päättymispäivä</dt><dd>{formatCompetitionDate(competition.endDate)}</dd></div>
      <div><dt>Kilpailuvuosi</dt><dd>{competition.year ?? 'Ei tietoa'}</dd></div>
      <div><dt>Kesto</dt><dd>{competition.durationDays === null ? 'Ei laskettavissa: tarkista päivämäärät' : `${competition.durationDays} päivää`}</dd></div>
    </dl>
    <h4>Kilpailuradat kunnittain</h4>
    {[...(primary ? [primary] : []), ...competition.municipalities.filter((item) => item !== primary)].map((municipality, index) => <div key={`${municipality.name}-${index}`}>
      <strong>{municipality.name} · {municipality.primary ? 'Ensisijainen kunta' : 'Muut kunnat'}{!municipality.municipalityCode && ' · kohdistus puuttuu'}</strong>
      <ul>{municipality.courses.map((course, courseIndex) => <li key={`${course}-${courseIndex}`}>{course}</li>)}{!municipality.courses.length && <li>Ratatietoja ei ole ilmoitettu</li>}</ul>
    </div>)}
    {competition.issues.length > 0 && <div role="status"><h4>Aineiston huomautukset</h4><ul>{competition.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}
  </section>;
}
