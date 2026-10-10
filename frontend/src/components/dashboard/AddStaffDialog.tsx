'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { ApiError, apiRequest, getFieldErrors } from '@/lib/api-client';
import { staffFormSchema, toFieldErrors } from '@/lib/auth-schemas';
import { PASSWORD_MIN_LENGTH, ROLE_LABELS, STAFF_ROLES, type StaffRole } from '@/lib/constants';
import type { AdminUser } from '@/types/staff';

const ROLE_OPTIONS = STAFF_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

function AddStaffForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<StaffRole>('SALES');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = staffFormSchema.safeParse({ name, email, password, role });
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const { user } = await apiRequest<{ user: AdminUser }>('/admin/users', {
        method: 'POST',
        body: parsed.data,
      });
      toast.success(`Added ${user.name} as ${ROLE_LABELS[user.role]}`);
      onCreated();
    } catch (error) {
      setIsSubmitting(false);
      if (!(error instanceof ApiError)) {
        setFormError('Something went wrong. Please try again.');
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
      {formError && <Alert>{formError}</Alert>}
      <TextField
        label="Full name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={fieldErrors.name}
        required
      />
      <TextField
        label="Email"
        type="email"
        autoComplete="off"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldErrors.email}
        required
      />
      <TextField
        label="Temporary password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a digit. Share it with them privately.`}
        required
      />
      <SelectField
        label="Role"
        options={ROLE_OPTIONS}
        value={role}
        onChange={(event) => setRole(event.target.value as StaffRole)}
        error={fieldErrors.role}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          Add staff member
        </Button>
      </div>
    </form>
  );
}

interface AddStaffDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

/** "Add staff member": creates a staff account with a temporary password (ADMIN only). */
export function AddStaffDialog({ isOpen, onClose, onCreated }: AddStaffDialogProps) {
  // The form unmounts when the dialog closes, so it starts empty every time.
  return (
    <Dialog isOpen={isOpen} title="Add staff member" onClose={onClose}>
      <AddStaffForm onCancel={onClose} onCreated={onCreated} />
    </Dialog>
  );
}
