'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ApiError, apiRequest, getFieldErrors } from '@/lib/api-client';
import { signupFormSchema, toFieldErrors } from '@/lib/auth-schemas';
import { PASSWORD_MIN_LENGTH } from '@/lib/constants';
import type { User } from '@/types/user';

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = signupFormSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await apiRequest<{ user: User }>('/auth/signup', { method: 'POST', body: parsed.data });
      // Sign-up logs the borrower in; start the application.
      router.replace('/apply');
    } catch (error) {
      setIsSubmitting(false);
      if (!(error instanceof ApiError)) {
        toast.error('Something went wrong. Please try again.');
      } else if (error.code === 'VALIDATION_ERROR') {
        setFieldErrors(getFieldErrors(error));
      } else if (error.code === 'EMAIL_ALREADY_REGISTERED') {
        setFieldErrors({ email: error.message });
      } else {
        setFormError(error.message);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Create your account</h1>
      {formError && <Alert>{formError}</Alert>}
      <TextField
        label="Full name"
        autoComplete="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={fieldErrors.name}
        required
      />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldErrors.email}
        required
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a digit.`}
        error={fieldErrors.password}
        required
      />
      <Button type="submit" isLoading={isSubmitting}>
        Create account
      </Button>
      <p className="text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
      <p className="text-center text-xs text-slate-500">
        Demo system: please don&apos;t enter real personal data or documents.
      </p>
    </form>
  );
}
