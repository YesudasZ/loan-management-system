import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'link';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Disables the button and shows a spinner while an action runs. */
  isLoading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'justify-center px-4 py-2 bg-primary text-white hover:bg-primary-hover',
  secondary:
    'justify-center px-4 py-2 border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
  danger: 'justify-center px-4 py-2 bg-danger text-white hover:bg-danger-strong',
  // Looks like a text link, but keeps the tall touch area on phones (back links, "open").
  link: 'text-primary hover:underline',
};

/**
 * Button styling, shared with ButtonLink. At least 44px tall on phones (a comfortable touch
 * target), the usual 36px from the `sm` breakpoint up.
 */
export function buttonClassName(variant: ButtonVariant = 'primary', extra = ''): string {
  return `relative inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-9 ${VARIANT_CLASSES[variant]} ${extra}`;
}

export function Button({
  variant = 'primary',
  isLoading = false,
  disabled,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled === true || isLoading}
      aria-busy={isLoading}
      className={buttonClassName(variant, className)}
      {...rest}
    >
      {isLoading && <Spinner size="sm" label="Working" />}
      {children}
    </button>
  );
}
