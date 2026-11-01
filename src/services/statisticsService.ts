import type { Club, DistributionStat, MunicipalityStat } from '../models/club';
import { getMembershipBand, getVotingPower, MEMBERSHIP_BANDS } from './membershipRules.ts';

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
  return MEMBERSHIP_BANDS.map((band) => ({
    label: band.label,
    count: clubs.filter((club) => getMembershipBand(club.jasenmaara) === band).length,
  }));
}

export function getVotingDistribution(clubs: readonly Club[]): DistributionStat[] {
  return MEMBERSHIP_BANDS.map(({ votes }) => ({
    label: `${votes} ääntä`,
    count: clubs.filter((club) => getVotingPower(club.jasenmaara) === votes).length,
  }));
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
