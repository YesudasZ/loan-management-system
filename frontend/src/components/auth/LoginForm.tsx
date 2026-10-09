'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ApiError, apiRequest, getFieldErrors } from '@/lib/api-client';
import { loginFormSchema, toFieldErrors } from '@/lib/auth-schemas';
import { getSafeNextPath } from '@/lib/route-access';
import type { User } from '@/types/user';

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = loginFormSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const { user } = await apiRequest<{ user: User }>('/auth/login', {
        method: 'POST',
        body: parsed.data,
      });
      // The target layout mounts fresh and loads the new session; the route guard runs too.
      router.replace(getSafeNextPath(next, user.role));
    } catch (error) {
      setIsSubmitting(false);
      if (!(error instanceof ApiError)) {
        toast.error('Something went wrong. Please try again.');
      } else if (error.code === 'VALIDATION_ERROR') {
        setFieldErrors(getFieldErrors(error));
      } else {
        setFormError(error.message);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Log in</h1>
      {formError && <Alert>{formError}</Alert>}
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
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
        required
      />
      <Button type="submit" isLoading={isSubmitting}>
        Log in
      </Button>
      <p className="text-center text-sm text-slate-600">
        New here?{' '}
        <Link href="/signup" className="font-medium text-indigo-700 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
