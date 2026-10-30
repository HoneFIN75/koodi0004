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
