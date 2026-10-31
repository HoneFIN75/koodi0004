export interface CompetitionMunicipality {
  name: string;
  primary: boolean;
  courses: string[];
  municipalityCode: string | null;
}

export interface Competition {
  id: string;
  sourceIndex: number;
  name: string;
  year: number | null;
  startDate: string;
  endDate: string;
  competitionModel: string;
  divisionType: string;
  pdgaTier: string;
  organizer: string;
  municipalities: CompetitionMunicipality[];
  issues: string[];
  durationDays: number | null;
}

export interface CompetitionIssue {
  sourceIndex: number;
  competitionId: string;
  name: string;
  message: string;
}

export interface CompetitionIndexes {
  byOrganizer: Map<string, Competition[]>;
  byModel: Map<string, Competition[]>;
  byTier: Map<string, Competition[]>;
  byMunicipalityCode: Map<string, Competition[]>;
  byNameGram: Map<string, Set<string>>;
  byLocationGram: Map<string, Set<string>>;
  byModelGram: Map<string, Set<string>>;
  byTierGram: Map<string, Set<string>>;
  byOrganizerGram: Map<string, Set<string>>;
}

export interface CompetitionMunicipalityLabel {
  code: string;
  name: string;
  nameSv: string | null;
}

export interface CompetitionAliasResolution {
  sourceIndex: number;
  competitionId: string;
  sourceName: string;
  municipalityCode: string;
  municipalityName: string;
}

export interface CompetitionDataset {
  competitions: Competition[];
  years: number[];
  issues: CompetitionIssue[];
  byId: Map<string, Competition>;
  byYear: Map<number, Competition[]>;
  byOrganizer: Map<string, Competition[]>;
  byModel: Map<string, Competition[]>;
  byTier: Map<string, Competition[]>;
  byMunicipalityCode: Map<string, Competition[]>;
  municipalityNamesByCode: Map<string, CompetitionMunicipalityLabel>;
  municipalityAliases: Map<string, string | null>;
  aliasResolutions: CompetitionAliasResolution[];
  indexes: CompetitionIndexes;
}

export interface CompetitionFilters {
  visibility: 'hidden' | 'all' | 'years';
  years: number[];
  query: string;
  model: string;
  tier: string;
  organizer: string;
  municipality: string;
  regionId: string;
}

export interface GroupedCompetitionCourses {
  municipalityName: string;
  municipalityCode: string | null;
  primary: boolean;
  courses: string[];
}
