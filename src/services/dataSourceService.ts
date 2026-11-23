import type { Database } from '../models/club.ts';
import type { CompetitionIndex } from '../models/competition.ts';
import type { DataSourceId, DataSourceMetadata } from '../models/dataSource.ts';
import type { ProvinceDataset } from '../models/province.ts';
import type { MunicipalityDataset, PlannerDocument } from '../models/region.ts';

export interface DataSourceSnapshot {
  clubs: Database | null;
  competitions: CompetitionIndex | null;
  municipalities: MunicipalityDataset | null;
  provinces: ProvinceDataset | null;
  planning: PlannerDocument | null;
}

export function latestSourceTimestamp(timestamps: readonly (string | null | undefined)[]): string | null {
  const valid = timestamps.flatMap((timestamp) => {
    const time = timestamp ? Date.parse(timestamp) : Number.NaN;
    return Number.isFinite(time) ? [time] : [];
  });
  return valid.length ? new Date(Math.max(...valid)).toISOString() : null;
}

export function getDataSourceMetadata(snapshot: DataSourceSnapshot, populationCount: number): Record<DataSourceId, DataSourceMetadata> {
  const regions = snapshot.planning?.scenarios.flatMap((scenario) => scenario.regions);
  return {
    clubs: { recordCount: snapshot.clubs?.data.length ?? null, lastUpdatedAt: latestSourceTimestamp([snapshot.clubs?.metadata.lastUpdatedAt]) },
    competitions: { recordCount: snapshot.competitions?.records.length ?? null, years: snapshot.competitions?.years ?? null },
    municipalities: { recordCount: snapshot.municipalities?.municipalities.length ?? null, lastUpdatedAt: latestSourceTimestamp([snapshot.municipalities?.generatedAt]) },
    population: { recordCount: populationCount },
    provinces: { recordCount: snapshot.provinces?.regions.length ?? null },
    planning: { recordCount: regions?.length ?? null, lastUpdatedAt: latestSourceTimestamp(regions?.map((region) => region.updatedAt) ?? []) },
  };
}
