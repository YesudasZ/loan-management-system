'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { SelectField } from '@/components/ui/SelectField';
import { PageSpinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { ROLE_LABELS, ROLES, type Role } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import type { AdminUser, Paginated } from '@/types/staff';
import { AddStaffDialog } from './AddStaffDialog';
import { ChangeRoleDialog } from './ChangeRoleDialog';

const ROLE_FILTER_OPTIONS = [
  { value: '', label: 'All roles' },
  ...ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] })),
];

function usersPath(page: number, role: Role | '', search: string): string {
  const params = new URLSearchParams({ page: String(page) });
  if (role) params.set('role', role);
  if (search) params.set('search', search);
  return `/admin/users?${params.toString()}`;
}

interface RowActionProps {
  user: AdminUser;
  isSelf: boolean;
  onChangeRole: (user: AdminUser) => void;
}

function RowAction({ user, isSelf, onChangeRole }: RowActionProps) {
  if (isSelf) {
    return <span className="text-xs text-slate-500">You can’t change your own role</span>;
  }
  return (
    <Button variant="secondary" onClick={() => onChangeRole(user)}>
      Change role<span className="sr-only"> for {user.name}</span>
    </Button>
  );
}

/** Staff (ADMIN only): every user with their role, plus adding staff and changing roles. */
export function StaffManagement() {
  const { user: currentUser } = useCurrentUser();
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const { data, error, isLoading, reload } = useApiQuery<Paginated<AdminUser>>(
    usersPath(page, roleFilter, search),
  );

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  function renderList() {
    if (error) return <ErrorState message={error.message} onRetry={reload} />;
    if (isLoading || !data) return <PageSpinner label="Loading users" />;
    if (data.items.length === 0) {
      return <EmptyState title="No users match" description="Try another search or role." />;
    }
    const rows = data.items.map((user) => ({ user, isSelf: user.id === currentUser?.id }));

    return (
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3 lg:hidden">
          {rows.map(({ user, isSelf }) => (
            <li key={user.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium wrap-anywhere text-slate-900">{user.name}</p>
                  <p className="text-xs wrap-anywhere text-slate-500">{user.email}</p>
                </div>
                <RoleBadge role={user.role} />
              </div>
              <p className="mt-2 text-xs text-slate-500">Joined {formatDate(user.createdAt)}</p>
              <div className="mt-3">
                <RowAction user={user} isSelf={isSelf} onChangeRole={setSelectedUser} />
              </div>
            </li>
          ))}
        </ul>
        <div className="relative hidden overflow-x-auto rounded-lg border border-slate-200 bg-white lg:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">
                  User
                </th>
                <th scope="col" className="px-4 py-3">
                  Role
                </th>
                <th scope="col" className="px-4 py-3">
                  Joined
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ user, isSelf }) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium wrap-anywhere text-slate-900">{user.name}</p>
                    <p className="text-xs wrap-anywhere text-slate-500">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <RowAction user={user} isSelf={isSelf} onChangeRole={setSelectedUser} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={data.pagination.page}
          totalPages={data.pagination.totalPages}
          totalItems={data.pagination.totalItems}
          onPageChange={setPage}
        />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Staff"
          description="Everyone who can log in, and their role. Add staff members and change roles here."
        />
        {/* The margin only matters on phones, where the button wraps above the search form. */}
        <Button className="mb-4" onClick={() => setIsAdding(true)}>
          Add staff member
        </Button>
      </div>
      <form onSubmit={applySearch} className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <TextField
            label="Search name or email"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        <SelectField
          label="Role"
          options={ROLE_FILTER_OPTIONS}
          value={roleFilter}
          onChange={(event) => {
            setRoleFilter(event.target.value as Role | '');
            setPage(1);
          }}
        />
      </form>
      {renderList()}
      <AddStaffDialog
        isOpen={isAdding}
        onClose={() => setIsAdding(false)}
        onCreated={() => {
          setIsAdding(false);
          reload();
        }}
      />
      <ChangeRoleDialog
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onChanged={() => {
          setSelectedUser(null);
          reload();
        }}
      />
    </>
  );
}
