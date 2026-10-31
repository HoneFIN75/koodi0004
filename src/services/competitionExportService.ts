import type { Competition, CompetitionFilters } from '../models/competition';
import { getPrimaryMunicipality } from './competitionService.ts';
import type { Cell } from './xlsxWriter.ts';
import { formatCompetitionDivision } from './competitionPresentation.ts';

export function competitionExportRows(competitions: readonly Competition[]): Cell[][] {
  return [
    ['Kilpailutunniste', 'Kilpailu', 'Kilpailuvuosi', 'Alkamispäivä', 'Päättymispäivä', 'Ensisijainen kunta', 'Ensisijainen kuntakoodi', 'Muut kunnat', 'Kilpailuradat kunnittain', 'Järjestäjä', 'Kilpailumalli', 'Luokkajako', 'PDGA-luokitus', 'Kesto päivää', 'Aineiston huomautukset'],
    ...competitions.map((competition): Cell[] => {
      const primary = getPrimaryMunicipality(competition);
      return [competition.id, competition.name, competition.year, competition.startDate, competition.endDate, primary?.name ?? '', primary?.municipalityCode ?? '',
        competition.municipalities.filter((item) => item !== primary).map((item) => item.name).join(', '),
        competition.municipalities.map((item) => `${item.name}: ${item.courses.join(', ')}`).join(' | '),
        competition.organizer, competition.competitionModel, formatCompetitionDivision(competition.divisionType), competition.pdgaTier, competition.durationDays, competition.issues.join(' | ')];
    }),
  ];
}

export function competitionExportDocument(competitions: readonly Competition[], filters: CompetitionFilters) {
  return {
    source: 'SFL-Kilpailut_lopullinen.json',
    sourceNotice: 'Käyttäjän toimittama; alkuperäinen julkaisija, viitepäivä ja lisenssi ilmoittamatta',
    filters,
    uniqueCount: competitions.length,
    counting: 'Yksi lähderivi on yksi tapahtuma. Ensisijainen kunta määrää tilastoryhmän, muut kunnat kuvaavat kattavuutta.',
    competitions,
  };
}

export function exportCompetitionJson(competitions: readonly Competition[], filters: CompetitionFilters): string {
  return JSON.stringify(competitionExportDocument(competitions, filters), null, 2);
}

export function exportCompetitionCsv(competitions: readonly Competition[]): string {
  const cell = (value: Cell): string => {
    let text = value === null ? '' : String(value);
    if (typeof value === 'string' && /^\s*[=+\-@\t\r]/u.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return `\uFEFF${competitionExportRows(competitions).map((row) => row.map(cell).join(';')).join('\r\n')}\r\n`;
}
