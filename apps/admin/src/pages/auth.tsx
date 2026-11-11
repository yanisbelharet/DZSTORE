import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ErrorView } from '../components/states.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { Checkbox, Field, Input } from '../components/ui/field.tsx';
import { api, errorKey } from '../lib/api.ts';
import { meQuery } from '../lib/session.ts';
import type { Me } from '../lib/session.ts';

function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-sm">
        <p className="text-xs font-semibold tracking-wide text-indigo-700 uppercase">
          {t('app.name')}
        </p>
        <h1 className="mt-2 text-xl font-semibold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </Card>
    </div>
  );
}

interface LoginResult {
  twoFactor: Me['twoFactor'];
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const login = useMutation({
    mutationFn: () =>
      api<LoginResult>('/v1/auth/login', { method: 'POST', body: { email, password, remember } }),
    onSuccess: async ({ twoFactor }) => {
      queryClient.clear();
      if (twoFactor === 'enrolment_required') await navigate({ to: '/2fa/setup' });
      else if (twoFactor === 'verification_required') await navigate({ to: '/2fa/verify' });
      else await navigate({ to: '/' });
    },
  });
  return (
    <AuthLayout title={t('auth.title')} subtitle={t('auth.subtitle')}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          login.mutate();
        }}
      >
        <Field label={t('auth.email')}>
          {(id) => (
            <Input
              id={id}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
          )}
        </Field>
        <Field label={t('auth.password')}>
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
          )}
        </Field>
        <Checkbox
          label={t('auth.remember')}
          checked={remember}
          onChange={(e) => {
            setRemember(e.target.checked);
          }}
        />
        {login.isError ? (
          <p role="alert" className="text-sm text-red-700">
            {t(errorKey(login.error))}
          </p>
        ) : null}
        <Button type="submit" disabled={login.isPending || !email || !password}>
          {t('auth.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  return (
    <Field label={t('auth.code')}>
      {(id) => (
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          className="text-center font-mono text-lg tracking-[0.4em]"
          value={value}
          onChange={(e) => {
            onChange(e.target.value.replace(/\D/gu, ''));
          }}
          autoFocus
        />
      )}
    </Field>
  );
}

export function TwoFactorSetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const setup = useQuery({
    queryKey: ['2fa-setup'],
    queryFn: () =>
      api<{ secret: string; otpauthUrl: string }>('/v1/auth/2fa/setup', { method: 'POST' }),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
  });
  useEffect(() => {
    if (!setup.data) return;
    const url = setup.data.otpauthUrl;
    // Loaded on demand: only the 2FA setup needs the QR code library.
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(url, { margin: 1, width: 200 }))
      .then(setQr)
      .catch(() => {
        setQr(null);
      });
  }, [setup.data]);
  const enable = useMutation({
    mutationFn: () =>
      api<{ recoveryCodes: string[] }>('/v1/auth/2fa/enable', { method: 'POST', body: { code } }),
    onSuccess: (data) => {
      setRecoveryCodes(data.recoveryCodes);
    },
  });

  if (recoveryCodes) {
    return (
      <AuthLayout title={t('auth.recoveryTitle')} subtitle={t('auth.recoveryIntro')}>
        <ul
          className="grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-3 font-mono text-sm"
          data-testid="recovery-codes"
        >
          {recoveryCodes.map((recovery) => (
            <li key={recovery}>{recovery}</li>
          ))}
        </ul>
        <Checkbox
          className="mt-4"
          label={t('auth.recoverySaved')}
          checked={saved}
          onChange={(e) => {
            setSaved(e.target.checked);
          }}
        />
        <Button
          className="mt-4 w-full"
          disabled={!saved}
          onClick={() => {
            void queryClient
              .invalidateQueries({ queryKey: meQuery.queryKey })
              .then(() => navigate({ to: '/' }));
          }}
        >
          {t('common.continue')}
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.setupTitle')} subtitle={t('auth.setupIntro')}>
      {setup.isError ? (
        <ErrorView error={setup.error} onRetry={() => void setup.refetch()} />
      ) : null}
      {setup.data ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            enable.mutate();
          }}
        >
          {qr ? <img src={qr} alt="QR code" width={200} height={200} className="mx-auto" /> : null}
          <div className="text-sm">
            <p className="text-slate-600">{t('auth.manualSecret')}</p>
            <code
              className="mt-1 block break-all rounded bg-slate-100 p-2 font-mono text-xs"
              data-testid="totp-secret"
            >
              {setup.data.secret}
            </code>
          </div>
          <CodeInput value={code} onChange={setCode} />
          {enable.isError ? (
            <p role="alert" className="text-sm text-red-700">
              {t(errorKey(enable.error))}
            </p>
          ) : null}
          <Button type="submit" disabled={code.length !== 6 || enable.isPending}>
            {t('auth.enable')}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      )}
    </AuthLayout>
  );
}

export function TwoFactorVerifyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState('');
  const verify = useMutation({
    mutationFn: () =>
      api('/v1/auth/2fa/verify', {
        method: 'POST',
        body: useRecovery ? { recoveryCode: value } : { code: value },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
      await navigate({ to: '/' });
    },
    onError: (error) => toast.error(t(errorKey(error))),
  });
  return (
    <AuthLayout title={t('auth.verifyTitle')} subtitle={t('auth.verifyIntro')}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          verify.mutate();
        }}
      >
        {useRecovery ? (
          <Field label={t('auth.recoveryCode')}>
            {(id) => (
              <Input
                id={id}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                }}
                autoFocus
              />
            )}
          </Field>
        ) : (
          <CodeInput value={value} onChange={setValue} />
        )}
        <Button type="submit" disabled={verify.isPending || value.length < 6}>
          {t('auth.verify')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setUseRecovery(!useRecovery);
            setValue('');
          }}
        >
          {useRecovery ? t('auth.useTotp') : t('auth.useRecovery')}
        </Button>
      </form>
    </AuthLayout>
  );
}
