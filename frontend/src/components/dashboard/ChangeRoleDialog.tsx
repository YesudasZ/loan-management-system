'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { SelectField } from '@/components/ui/SelectField';
import { ApiError, apiRequest } from '@/lib/api-client';
import { ROLE_LABELS, ROLES, type Role } from '@/lib/constants';
import type { AdminUser } from '@/types/staff';

const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

interface ChangeRoleFormProps {
  user: AdminUser;
  onCancel: () => void;
  onChanged: () => void;
}

function ChangeRoleForm({ user, onCancel, onChanged }: ChangeRoleFormProps) {
  const [role, setRole] = useState<Role>(user.role);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function confirmChange() {
    setError(null);
    setIsSaving(true);
    try {
      const { user: updated } = await apiRequest<{ user: AdminUser }>(
        `/admin/users/${user.id}/role`,
        { method: 'PATCH', body: { role } },
      );
      toast.success(`${updated.name} is now ${ROLE_LABELS[updated.role]}`);
      onChanged();
    } catch (caught) {
      // 409s (last admin, borrower with loans, ...) explain themselves; show them here.
      setIsSaving(false);
      setError(caught instanceof ApiError ? caught.message : 'Could not change the role.');
    }
  }

  return (
    <>
      <p className="flex flex-wrap items-center gap-2 text-sm wrap-anywhere text-slate-700">
        {user.email} is currently <RoleBadge role={user.role} />
      </p>
      <SelectField
        label="New role"
        options={ROLE_OPTIONS}
        value={role}
        onChange={(event) => setRole(event.target.value as Role)}
      />
      <Alert tone="info">
        The change applies to their very next request, but they need to{' '}
        <strong>log out and back in</strong> to see their new dashboard.
      </Alert>
      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button isLoading={isSaving} disabled={role === user.role} onClick={confirmChange}>
          Change role
        </Button>
      </div>
    </>
  );
}

interface ChangeRoleDialogProps {
  /** The user whose role is being changed; null when the dialog is closed. */
  user: AdminUser | null;
  onClose: () => void;
  onChanged: () => void;
}

export function ChangeRoleDialog({ user, onClose, onChanged }: ChangeRoleDialogProps) {
  return (
    <Dialog
      isOpen={user !== null}
      title={user ? `Change role: ${user.name}` : 'Change role'}
      onClose={onClose}
    >
      {user && (
        <ChangeRoleForm key={user.id} user={user} onCancel={onClose} onChanged={onChanged} />
      )}
    </Dialog>
  );
}
