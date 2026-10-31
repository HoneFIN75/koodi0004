import type { Club, DistributionStat, MunicipalityStat } from '../models/club';

const MEMBERSHIP_BUCKETS = [
  { label: '0–25', max: 25 },
  { label: '26–75', max: 75 },
  { label: '76–150', max: 150 },
  { label: '151–300', max: 300 },
  { label: '301+', max: Number.POSITIVE_INFINITY },
];

export function getMunicipalityStats(clubs: readonly Club[]): MunicipalityStat[] {
  const groups = new Map<string, MunicipalityStat>();
  for (const club of clubs) {
    const stat = groups.get(club.paikkakunta) ?? { name: club.paikkakunta, clubs: 0, members: 0 };
    stat.clubs += 1;
    stat.members += club.jasenmaara ?? 0;
    groups.set(club.paikkakunta, stat);
  }
  return [...groups.values()].sort((a, b) => b.members - a.members);
}

export function getMembershipDistribution(clubs: readonly Club[]): DistributionStat[] {
  return MEMBERSHIP_BUCKETS.map(({ label, max }, index) => {
    const min = index === 0 ? -1 : MEMBERSHIP_BUCKETS[index - 1].max;
    return {
      label,
      count: clubs.filter((club) => club.jasenmaara !== null && club.jasenmaara > min && club.jasenmaara <= max).length,
    };
  });
}

export function getVotingDistribution(clubs: readonly Club[]): DistributionStat[] {
  const groups = new Map<number, number>([[10, 0], [15, 0], [20, 0]]);
  for (const club of clubs) {
    if (club.aanimaara !== null) groups.set(club.aanimaara, (groups.get(club.aanimaara) ?? 0) + 1);
  }
  return [...groups].sort(([a], [b]) => a - b).map(([votes, count]) => ({ label: `${votes} ääntä`, count }));
}

export function getRegionalStats(clubs: readonly Club[]): MunicipalityStat[] {
  const groups = new Map<string, MunicipalityStat>();
  for (const club of clubs) {
    const region = String(club.details.region ?? club.details.district ?? (
      club.latitude === null || club.longitude === null ? 'Sijainti puuttuu'
        : club.latitude >= 64 ? 'Pohjois-Suomi' : club.longitude >= 27 ? 'Itä-Suomi' : 'Etelä- ja Länsi-Suomi'
    ));
    const stat = groups.get(region) ?? { name: region, clubs: 0, members: 0 };
    stat.clubs += 1;
    stat.members += club.jasenmaara ?? 0;
    groups.set(region, stat);
  }
  return [...groups.values()].sort((a, b) => b.members - a.members);
}

export function getTotals(clubs: readonly Club[]) {
  const ranked = clubs.filter((club) => club.jasenmaara !== null)
    .sort((a, b) => (a.jasenmaara ?? 0) - (b.jasenmaara ?? 0));
  const members = ranked.reduce((total, club) => total + (club.jasenmaara ?? 0), 0);
  const middle = Math.floor(ranked.length / 2);
  return {
    clubs: clubs.length,
    members,
    average: ranked.length === 0 ? null : members / ranked.length,
    median: ranked.length === 0 ? null : ranked.length % 2
      ? ranked[middle].jasenmaara
      : ((ranked[middle - 1].jasenmaara ?? 0) + (ranked[middle].jasenmaara ?? 0)) / 2,
    largest: ranked.at(-1) ?? null,
    smallest: ranked[0] ?? null,
    knownMembers: ranked.length,
    municipalities: new Set(clubs.map((club) => club.paikkakunta)).size,
  };
}
