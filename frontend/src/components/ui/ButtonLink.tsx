import Link from 'next/link';
import type { ComponentProps } from 'react';
import { buttonClassName, type ButtonVariant } from './Button';

interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
}

/** A link that looks like a button (navigation, not an action), with the same touch target. */
export function ButtonLink({ variant = 'primary', className = '', ...linkProps }: ButtonLinkProps) {
  return <Link className={buttonClassName(variant, className)} {...linkProps} />;
}
