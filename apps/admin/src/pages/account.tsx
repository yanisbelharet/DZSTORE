import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ErrorView, PageHeader } from '../components/states.tsx';
import { Button } from '../components/ui/button.tsx';
import { Badge, Card } from '../components/ui/card.tsx';
import { ConfirmButton } from '../components/ui/dialog.tsx';
import { Field, Input, Select } from '../components/ui/field.tsx';
import { isLanguage, setLanguage } from '../i18n/index.ts';
import { api, errorKey } from '../lib/api.ts';

interface SessionDto {
  id: string;
  kind: string;
  ipPrefix: string | null;
  userAgent: string | null;
  lastSeenAt: string;
  current: boolean;
}

export function AccountPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api<{ sessions: SessionDto[] }>('/v1/auth/sessions'),
  });
  const change = useMutation({
    mutationFn: () =>
      api('/v1/auth/password', { method: 'POST', body: { currentPassword, newPassword } }),
    onSuccess: async () => {
      toast.success(t('account.passwordChanged'));
      setCurrentPassword('');
      setNewPassword('');
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (error) => toast.error(t(errorKey(error))),
  });
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Algiers',
  });

  return (
    <>
      <PageHeader title={t('account.title')} />
      <div className="grid max-w-2xl gap-6">
        <Card>
          <Field label={t('account.language')}>
            {(id) => (
              <Select
                id={id}
                className="w-auto"
                value={i18n.language}
                onChange={(e) => {
                  if (isLanguage(e.target.value)) void setLanguage(e.target.value);
                }}
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </Select>
            )}
          </Field>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">{t('account.changePassword')}</h2>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              change.mutate();
            }}
          >
            <Field label={t('account.currentPassword')}>
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label={t('account.newPassword')} hint={t('users.passwordHint')}>
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
            <Button
              type="submit"
              className="justify-self-start"
              disabled={change.isPending || !currentPassword || !newPassword}
            >
              {t('common.save')}
            </Button>
          </form>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">{t('account.sessions')}</h2>
          {sessions.isError ? <ErrorView error={sessions.error} /> : null}
          <ul className="divide-y divide-slate-100 text-sm">
            {sessions.data?.sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="min-w-0 truncate text-slate-700">
                  {session.userAgent ?? session.kind} · {session.ipPrefix ?? '—'}
                </span>
                <span className="flex items-center gap-2 text-slate-500">
                  {date.format(new Date(session.lastSeenAt))}
                  {session.current ? <Badge tone="info">{t('account.current')}</Badge> : null}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <ConfirmButton
              label={t('account.logoutAll')}
              title={t('account.logoutAll')}
              description={t('account.logoutAllConfirm')}
              onConfirm={async () => {
                await api('/v1/auth/logout-all', { method: 'POST' });
                queryClient.clear();
                await navigate({ to: '/login' });
              }}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
