export interface Club {
  seura: string;
  paikkakunta: string;
  latitude: number;
  longitude: number;
  jasenmaara: number;
  aanimaara: number;
}

export interface Database {
  metadata: {
    generatedAt: string;
    recordCount: number;
    source: string;
  };
  data: Club[];
}

export interface MunicipalityStat {
  name: string;
  clubs: number;
  members: number;
}

export interface DistributionStat {
  label: string;
  count: number;
}
