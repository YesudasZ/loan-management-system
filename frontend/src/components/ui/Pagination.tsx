import { Button } from './Button';

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, totalItems, onPageChange }: PaginationProps) {
  if (totalPages <= 1) {
    return <p className="text-xs text-slate-500">{totalItems} total</p>;
  }
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
      <p className="text-xs text-slate-500">
        Page {page} of {totalPages} · {totalItems} total
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
