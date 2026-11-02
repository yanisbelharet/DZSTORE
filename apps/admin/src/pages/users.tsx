import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useRouteContext } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ErrorView, PageHeader } from '../components/states.tsx';
import { Button } from '../components/ui/button.tsx';
import { Badge, Card } from '../components/ui/card.tsx';
import { ConfirmButton } from '../components/ui/dialog.tsx';
import { Checkbox, Field, Input, Select } from '../components/ui/field.tsx';
import { api, errorKey } from '../lib/api.ts';
import { useHotkey } from '../lib/hotkeys.ts';
import { can, ROLES } from '../lib/session.ts';
import type { Role } from '../lib/session.ts';

export interface UserDto {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  locale: string;
  isActive: boolean;
  storeIds: string[];
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return debounced;
}

export function UsersPage() {
  const { me } = useRouteContext({ from: '/_app' });
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useHotkey('/', () => searchRef.current?.focus());
  const search = useDebounced(q.trim(), 250);
  const users = useInfiniteQuery({
    queryKey: ['users', { search, role }],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (search) params.set('q', search);
      if (role) params.set('role', role);
      if (pageParam) params.set('cursor', pageParam);
      return api<{ items: UserDto[]; nextCursor: string | null }>(`/v1/users?${params.toString()}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = users.data?.pages.flatMap((page) => page.items) ?? [];
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Algiers',
  });

  return (
    <>
      <PageHeader
        title={t('users.title')}
        actions={
          can(me, 'users.manage') ? (
            <Button asChild>
              <Link to="/users/new">{t('users.new')}</Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          ref={searchRef}
          className="max-w-xs"
          type="search"
          placeholder={`${t('common.search')} (/)`}
          aria-label={t('common.search')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
          }}
        />
        <Select
          className="w-auto"
          aria-label={t('users.filterRole')}
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
          }}
        >
          <option value="">{t('common.all')}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`roles.${r}`)}
            </option>
          ))}
        </Select>
      </div>
      {users.isError ? (
        <ErrorView error={users.error} onRetry={() => void users.refetch()} />
      ) : null}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-start text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3 text-start">{t('users.name')}</th>
              <th className="px-4 py-3 text-start">{t('users.roles')}</th>
              <th className="px-4 py-3 text-start">{t('users.status')}</th>
              <th className="px-4 py-3 text-start">{t('users.twoFactor')}</th>
              <th className="px-4 py-3 text-start">{t('users.lastLogin')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => (
              <tr
                key={user.id}
                className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                onClick={() => void navigate({ to: '/users/$userId', params: { userId: user.id } })}
              >
                <td className="px-4 py-3">
                  <Link
                    to="/users/$userId"
                    params={{ userId: user.id }}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {user.name}
                  </Link>
                  <div className="text-xs text-slate-500">{user.email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((r) => (
                      <Badge key={r} tone={r === 'OWNER' || r === 'ADMIN' ? 'info' : 'neutral'}>
                        {t(`roles.${r}`)}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={user.isActive ? 'success' : 'danger'}>
                    {user.isActive ? t('common.active') : t('common.inactive')}
                  </Badge>
                </td>
                <td className="px-4 py-3">{user.totpEnabled ? t('common.yes') : t('common.no')}</td>
                <td className="px-4 py-3 text-slate-600">
                  {user.lastLoginAt ? date.format(new Date(user.lastLoginAt)) : t('users.never')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.isSuccess && rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">{t('users.empty')}</p>
        ) : null}
      </Card>
      {users.hasNextPage ? (
        <Button
          className="mt-4"
          variant="secondary"
          disabled={users.isFetchingNextPage}
          onClick={() => void users.fetchNextPage()}
        >
          {t('common.loadMore')}
        </Button>
      ) : null}
    </>
  );
}

interface FormState {
  email: string;
  name: string;
  roles: Role[];
  locale: 'fr' | 'en';
  storeIds: string[];
  password: string;
}

const EMPTY_FORM: FormState = {
  email: '',
  name: '',
  roles: ['CONFIRMATION_AGENT'],
  locale: 'fr',
  storeIds: [],
  password: '',
};

/** Loads the user (edit) then renders the form initialised once with its data. */
export function UserFormPage() {
  const params = useParams({ strict: false });
  const userId = typeof params.userId === 'string' ? params.userId : undefined;
  const user = useQuery({
    queryKey: ['user', userId],
    queryFn: () => api<UserDto>(`/v1/users/${userId ?? ''}`),
    enabled: userId !== undefined,
  });
  if (userId === undefined) return <UserForm key="new" />;
  if (user.isError) return <ErrorView error={user.error} onRetry={() => void user.refetch()} />;
  if (!user.data) return null;
  return <UserForm key={user.data.id} existing={user.data} />;
}

function UserForm({ existing }: { existing?: UserDto }) {
  const { me } = useRouteContext({ from: '/_app' });
  const isNew = existing === undefined;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = can(me, 'users.manage');
  const [form, setForm] = useState<FormState>(() =>
    existing
      ? {
          email: existing.email,
          name: existing.name,
          roles: existing.roles,
          locale: existing.locale === 'en' ? 'en' : 'fr',
          storeIds: existing.storeIds,
          password: '',
        }
      : EMPTY_FORM,
  );
  const [newPassword, setNewPassword] = useState('');
  const stores = useQuery({
    queryKey: ['stores'],
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/v1/stores'),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['users'] });
    if (existing) await queryClient.invalidateQueries({ queryKey: ['user', existing.id] });
  };
  const onError = (error: unknown) => toast.error(t(errorKey(error)));
  const save = useMutation({
    mutationFn: () =>
      existing
        ? api<UserDto>(`/v1/users/${existing.id}`, {
            method: 'PATCH',
            body: {
              name: form.name,
              roles: form.roles,
              locale: form.locale,
              storeIds: form.storeIds,
            },
          })
        : api<UserDto>('/v1/users', { method: 'POST', body: form }),
    onSuccess: async () => {
      toast.success(isNew ? t('users.created') : t('users.updated'));
      await refresh();
      await navigate({ to: '/users' });
    },
    onError,
  });
  const action = async (path: string, body: object | undefined, message: string) => {
    if (!existing) return;
    try {
      await api(`/v1/users/${existing.id}${path}`, { method: path ? 'POST' : 'PATCH', body });
      toast.success(message);
      await refresh();
    } catch (error) {
      onError(error);
      throw error;
    }
  };

  // Only OWNER may grant OWNER/ADMIN (the API enforces it; the UI avoids offering it).
  const grantable = me.user.roles.includes('OWNER')
    ? ROLES
    : ROLES.filter((r) => r !== 'OWNER' && r !== 'ADMIN');
  const toggleRole = (role: Role) => {
    setForm((current) => ({
      ...current,
      roles: current.roles.includes(role)
        ? current.roles.filter((r) => r !== role)
        : [...current.roles, role],
    }));
  };
  const toggleStore = (storeId: string) => {
    setForm((current) => ({
      ...current,
      storeIds: current.storeIds.includes(storeId)
        ? current.storeIds.filter((s) => s !== storeId)
        : [...current.storeIds, storeId],
    }));
  };
  const self = existing?.id === me.user.id;

  return (
    <>
      <PageHeader title={isNew ? t('users.new') : t('users.edit')} />
      <form
        className="grid max-w-2xl gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Card className="grid gap-4">
          <Field label={t('users.email')}>
            {(id) => (
              <Input
                id={id}
                type="email"
                required
                disabled={!isNew}
                value={form.email}
                onChange={(e) => {
                  setForm({ ...form, email: e.target.value });
                }}
              />
            )}
          </Field>
          <Field label={t('users.name')}>
            {(id) => (
              <Input
                id={id}
                required
                disabled={!canManage}
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                }}
              />
            )}
          </Field>
          <fieldset className="grid gap-2" disabled={!canManage || self}>
            <legend className="mb-1 text-sm font-medium">{t('users.roles')}</legend>
            {grantable.map((r) => (
              <Checkbox
                key={r}
                label={t(`roles.${r}`)}
                checked={form.roles.includes(r)}
                onChange={() => {
                  toggleRole(r);
                }}
              />
            ))}
          </fieldset>
          <Field label={t('users.locale')}>
            {(id) => (
              <Select
                id={id}
                disabled={!canManage}
                value={form.locale}
                onChange={(e) => {
                  setForm({ ...form, locale: e.target.value === 'en' ? 'en' : 'fr' });
                }}
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </Select>
            )}
          </Field>
          <fieldset className="grid gap-2" disabled={!canManage}>
            <legend className="mb-1 text-sm font-medium">{t('users.stores')}</legend>
            <p className="text-xs text-slate-500">{t('users.storesHint')}</p>
            {stores.data?.items.map((store) => (
              <Checkbox
                key={store.id}
                label={store.name}
                checked={form.storeIds.includes(store.id)}
                onChange={() => {
                  toggleStore(store.id);
                }}
              />
            ))}
          </fieldset>
          {isNew ? (
            <Field label={t('users.initialPassword')} hint={t('users.passwordHint')}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  aria-describedby={describedBy}
                  required
                  value={form.password}
                  onChange={(e) => {
                    setForm({ ...form, password: e.target.value });
                  }}
                />
              )}
            </Field>
          ) : null}
        </Card>
        {canManage ? (
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending || form.roles.length === 0}>
              {t('common.save')}
            </Button>
            <Button asChild variant="secondary">
              <Link to="/users">{t('common.cancel')}</Link>
            </Button>
          </div>
        ) : null}
      </form>
      {existing && canManage && !self ? (
        <Card className="mt-8 max-w-2xl border-red-200">
          <h2 className="mb-4 font-semibold text-red-800">{t('users.dangerZone')}</h2>
          <div className="flex flex-wrap gap-2">
            <ConfirmButton
              label={existing.isActive ? t('users.deactivate') : t('users.reactivate')}
              title={existing.isActive ? t('users.deactivate') : t('users.reactivate')}
              description={t('users.deactivateConfirm')}
              variant={existing.isActive ? 'danger' : 'secondary'}
              onConfirm={() => action('', { isActive: !existing.isActive }, t('users.updated'))}
            />
            <ConfirmButton
              label={t('users.resetPassword')}
              title={t('users.resetPassword')}
              description={t('users.resetPasswordConfirm')}
              onConfirm={() => action('/reset-password', { newPassword }, t('users.passwordReset'))}
            >
              <Field label={t('users.newPassword')} hint={t('users.passwordHint')}>
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                    }}
                  />
                )}
              </Field>
            </ConfirmButton>
            {existing.totpEnabled ? (
              <ConfirmButton
                label={t('users.resetTwoFactor')}
                title={t('users.resetTwoFactor')}
                description={t('users.resetTwoFactorConfirm')}
                onConfirm={() => action('/reset-2fa', undefined, t('users.twoFactorReset'))}
              />
            ) : null}
          </div>
        </Card>
      ) : null}
    </>
  );
}
