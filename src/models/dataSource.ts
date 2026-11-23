import type { LucideIcon } from 'lucide-react';

export type DataSourceId = 'clubs' | 'competitions' | 'municipalities' | 'population' | 'provinces' | 'planning';

export interface DataSourceMetadata {
  sourceSystem?: string | null;
  updateFrequency?: string | null;
  recordCount?: number | null;
  lastUpdatedAt?: string | null;
  sourceOwner?: string | null;
  years?: readonly number[] | null;
}

export interface DataSourceDefinition {
  id: DataSourceId;
  title: string;
  description: string;
  icon: LucideIcon;
  metadata: DataSourceMetadata;
  sections: { title: string; text?: string; items?: readonly string[] }[];
}
