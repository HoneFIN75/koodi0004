export interface Club {
  id?: string;
  seura: string;
  paikkakunta: string;
  latitude: number | null;
  longitude: number | null;
  jasenmaara: number | null;
  aanimaara: number | null;
  contact?: ClubContact;
  details: Record<string, string | number>;
}

export interface ClubContact {
  name: string;
  email: string;
  phone: string;
  website: string;
  instagram: string;
  tiktok: string;
  public: true;
}

export type LocatedClub = Club & { latitude: number; longitude: number };

export interface Database {
  metadata: {
    generatedAt: string | null;
    recordCount: number | null;
    source: string | null;
  };
  data: Club[];
  warnings: string[];
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
