import type { BreFailure } from '@/lib/bre';

/** The server's eligibility decision: every rule that failed, announced to screen readers. */
export function BreFailureList({ failures }: { failures: BreFailure[] }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      <p className="font-medium">You aren&apos;t eligible for a loan with these details:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {failures.map((failure) => (
          <li key={failure.rule}>{failure.message}</li>
        ))}
      </ul>
    </div>
  );
}
