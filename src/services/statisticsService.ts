import type { Club, DistributionStat, MunicipalityStat } from '../models/club';

const MEMBERSHIP_BUCKETS = [
  { label: '0–25', max: 25 },
  { label: '26–50', max: 50 },
  { label: '51–100', max: 100 },
  { label: '101–200', max: 200 },
  { label: '201+', max: Number.POSITIVE_INFINITY },
];

export function getMunicipalityStats(clubs: readonly Club[]): MunicipalityStat[] {
  const groups = new Map<string, MunicipalityStat>();
  for (const club of clubs) {
    const stat = groups.get(club.paikkakunta) ?? { name: club.paikkakunta, clubs: 0, members: 0 };
    stat.clubs += 1;
    stat.members += club.jasenmaara;
    groups.set(club.paikkakunta, stat);
  }
  return [...groups.values()].sort((a, b) => b.members - a.members);
}

export function getMembershipDistribution(clubs: readonly Club[]): DistributionStat[] {
  return MEMBERSHIP_BUCKETS.map(({ label, max }, index) => {
    const min = index === 0 ? -1 : MEMBERSHIP_BUCKETS[index - 1].max;
    return {
      label,
      count: clubs.filter((club) => club.jasenmaara > min && club.jasenmaara <= max).length,
    };
  });
}

export function getVotingDistribution(clubs: readonly Club[]): DistributionStat[] {
  const groups = new Map<number, number>();
  for (const club of clubs) groups.set(club.aanimaara, (groups.get(club.aanimaara) ?? 0) + 1);
  return [...groups].sort(([a], [b]) => a - b).map(([votes, count]) => ({ label: `${votes} ääntä`, count }));
}

export function getRegionalStats(clubs: readonly Club[]): MunicipalityStat[] {
  const groups = new Map<string, MunicipalityStat>();
  for (const club of clubs) {
    const region = club.latitude >= 64 ? 'Pohjois-Suomi' : club.longitude >= 27 ? 'Itä-Suomi' : 'Etelä- ja Länsi-Suomi';
    const stat = groups.get(region) ?? { name: region, clubs: 0, members: 0 };
    stat.clubs += 1;
    stat.members += club.jasenmaara;
    groups.set(region, stat);
  }
  return [...groups.values()].sort((a, b) => b.members - a.members);
}

export function getTotals(clubs: readonly Club[]) {
  const members = clubs.reduce((total, club) => total + club.jasenmaara, 0);
  return {
    clubs: clubs.length,
    members,
    average: clubs.length === 0 ? 0 : Math.round(members / clubs.length),
    municipalities: new Set(clubs.map((club) => club.paikkakunta)).size,
  };
}
