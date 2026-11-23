export type TableSortDirection = 'asc' | 'desc';
export type TableSortState = { key: string; direction: TableSortDirection };
export type TableSortValue = string | number | null | undefined;

const collator = new Intl.Collator('fi', { sensitivity: 'base', numeric: true });

export function compareTableValues(first: TableSortValue, second: TableSortValue, direction: TableSortDirection): number {
  if (first == null || first === '') return second == null || second === '' ? 0 : 1;
  if (second == null || second === '') return -1;
  const result = typeof first === 'number' && typeof second === 'number'
    ? first - second
    : collator.compare(String(first), String(second));
  return direction === 'asc' ? result : -result;
}

export function sortTableRows<T>(
  rows: readonly T[],
  sort: TableSortState,
  value: (row: T, key: string) => TableSortValue,
): T[] {
  return [...rows].sort((first, second) => compareTableValues(value(first, sort.key), value(second, sort.key), sort.direction));
}

export function toggleTableSort(current: TableSortState, key: string): TableSortState {
  return current.key === key
    ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: 'asc' };
}
