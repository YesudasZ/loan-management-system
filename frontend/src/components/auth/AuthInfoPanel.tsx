import { ELIGIBILITY_RULE_LABELS, LOAN_TERMS } from '@/lib/loan-terms';

// The amount range must not break at its dash; the interest text may wrap.
const TERMS = [
  { label: 'Amount', value: LOAN_TERMS.amountRange, isNoWrap: true },
  { label: 'Tenure', value: LOAN_TERMS.tenureRange, isNoWrap: true },
  { label: 'Interest', value: LOAN_TERMS.interest, isNoWrap: false },
];

const HOW_IT_WORKS = [
  'Create your account',
  'Enter your details: eligibility is checked instantly',
  'Upload your latest salary slip',
  'Choose the amount and tenure, then apply',
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5 shrink-0">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * The navy brand panel beside the login and sign-up forms: loan terms, eligibility and the
 * steps. On phones it sits below the form in a compact form. Every number comes from
 * lib/loan-terms.ts, so it always matches what the server enforces.
 */
export function AuthInfoPanel() {
  return (
    <section
      aria-labelledby="about-the-loan"
      className="bg-primary-dark px-4 py-8 text-white sm:px-8 lg:order-first lg:flex lg:flex-col lg:justify-center lg:px-14 lg:py-16"
    >
      <div className="mx-auto w-full max-w-2xl">
        <p className="hidden text-sm font-semibold tracking-wide text-primary-border uppercase lg:block">
          Loan Management System
        </p>
        <h2 id="about-the-loan" className="text-xl font-semibold lg:mt-3 lg:text-4xl">
          Personal loans, decided in minutes
        </h2>
        <p className="mt-2 text-sm text-primary-border lg:mt-4 lg:text-base">
          Apply online, see your repayment before you commit, and follow your loan from application
          to closure.
        </p>

        {/* Three across where there is room; stacked on the narrower half-screen at 1024px. */}
        <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:mt-10 lg:grid-cols-1 xl:grid-cols-3">
          {TERMS.map((term) => (
            <div key={term.label} className="rounded-lg bg-white/10 px-4 py-3">
              <dt className="text-xs text-primary-border">{term.label}</dt>
              <dd className={`mt-1 font-semibold ${term.isNoWrap ? 'whitespace-nowrap' : ''}`}>
                {term.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:mt-10">
          <div>
            <h3 className="text-sm font-semibold">Who can apply</h3>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {Object.values(ELIGIBILITY_RULE_LABELS).map((rule) => (
                <li key={rule} className="flex items-start gap-2">
                  <span className="text-accent-border">
                    <CheckIcon />
                  </span>
                  {rule}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold">How it works</h3>
            <ol className="mt-3 flex flex-col gap-2 text-sm">
              {HOW_IT_WORKS.map((step, index) => (
                <li key={step} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold"
                  >
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
