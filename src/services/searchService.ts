import type { Club } from '../models/club';

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fi-FI').trim();
}

export function searchClubs(clubs: readonly Club[], query: string): Club[] {
  const term = normalize(query);
  if (!term) return [...clubs];
  return clubs.filter((club) =>
    normalize(club.seura).includes(term) || normalize(club.paikkakunta).includes(term),
  );
}

export interface ClubFilters {
  query: string;
  maxMembers: number | null;
  votes: number | null;
}

export function filterClubs(clubs: readonly Club[], filters: ClubFilters): Club[] {
  return searchClubs(clubs, filters.query).filter((club) =>
    (filters.maxMembers === null || (club.jasenmaara !== null && club.jasenmaara <= filters.maxMembers))
    && (filters.votes === null || club.aanimaara === filters.votes),
  );
}
