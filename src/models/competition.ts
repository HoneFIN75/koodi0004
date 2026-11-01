export const COMPETITION_FILE = 'jsondb/SFL-Kilpailut-2019-2026.json';

export interface Competition {
  'Kilpailun nimi': string;
  Vuosi: number;
  Kunta: string;
}

export type YearFilter =
  | { mode: 'all' }
  | { mode: 'selected'; years: number[] }
  | { mode: 'range'; from: number; to: number };

export interface CompetitionIndex {
  records: readonly Competition[];
  years: number[];
  byYear: Map<number, readonly Competition[]>;
  byMunicipality: Map<string, { name: string; records: Competition[]; firstYear: number }>;
}

export interface CompetitionScope {
  municipality?: string;
  municipalityNames?: readonly string[];
}

export interface CompetitionContext {
  index: CompetitionIndex | null;
  yearFilter: YearFilter;
}

export interface CompetitionYearStat {
  year: number;
  count: number;
  municipalityCount: number;
  newMunicipalities: string[];
  change: number | null;
  changePercent: number | null;
}

export interface CompetitionMunicipalityStat {
  name: string;
  count: number;
  rank: number;
  share: number;
  activeYears: number;
  firstYear: number;
  byYear: { year: number; count: number }[];
  per10000Residents: number | null;
  per1000Km2: number | null;
}

export interface CompetitionStatistics {
  total: number;
  selectedYears: number[];
  municipalityCount: number;
  averagePerMunicipality: number | null;
  byYear: CompetitionYearStat[];
  municipalities: CompetitionMunicipalityStat[];
  distribution: { label: string; count: number }[];
  comparison: { from: number; to: number; change: number; changePercent: number | null } | null;
}
