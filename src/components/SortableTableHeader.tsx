import { ArrowDown, ArrowDownUp, ArrowUp } from 'lucide-react';
import type { TableSortDirection } from '../services/tableSorting';

interface SortableTableHeaderProps {
  columnKey: string;
  label: string;
  sortKey: string;
  direction: TableSortDirection;
  onSort: (key: string) => void;
  className?: string;
}

export function SortableTableHeader({
  columnKey, label, sortKey, direction, onSort, className,
}: SortableTableHeaderProps) {
  const active = sortKey === columnKey;
  const SortIcon = !active ? ArrowDownUp : direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={className} aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
      <button
        type="button"
        className="table-sort-button"
        title={`Järjestä ${label} A → Z / Z → A`}
        onClick={() => onSort(columnKey)}
      >
        {label}
        {active ? <span className="table-sort-direction">{direction === 'asc' ? 'A → Z' : 'Z → A'}</span> : <SortIcon size={14} aria-hidden="true" />}
      </button>
    </th>
  );
}
