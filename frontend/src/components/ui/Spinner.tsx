interface SpinnerProps {
  /** Announced to screen readers. */
  label?: string;
  size?: 'sm' | 'md';
}

const SIZE_CLASSES = { sm: 'h-4 w-4', md: 'h-6 w-6' } as const;

export function Spinner({ label = 'Loading', size = 'md' }: SpinnerProps) {
  return (
    <span role="status" className="inline-flex items-center">
      <svg
        className={`${SIZE_CLASSES[size]} animate-spin text-current`}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-12 text-primary">
      <Spinner label={label} />
    </div>
  );
}
