import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { errorKey } from '../lib/api.ts';
import { Button } from './ui/button.tsx';
import { Card } from './ui/card.tsx';

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <Card role="alert" className="mx-auto max-w-lg text-center">
      <h2 className="text-lg font-semibold">{t('errors.title')}</h2>
      <p className="mt-2 text-sm text-slate-600">{t(errorKey(error))}</p>
      {onRetry ? (
        <Button className="mt-4" variant="secondary" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </Card>
  );
}

export function ForbiddenView() {
  const { t } = useTranslation();
  return (
    <Card className="mx-auto max-w-lg text-center" data-testid="forbidden">
      <h2 className="text-lg font-semibold">{t('errors.forbiddenTitle')}</h2>
      <p className="mt-2 text-sm text-slate-600">{t('errors.forbidden')}</p>
      <Button asChild className="mt-4" variant="secondary">
        <Link to="/">{t('nav.home')}</Link>
      </Button>
    </Card>
  );
}

export function NotFoundView() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <Card className="max-w-lg text-center">
        <h2 className="text-lg font-semibold">{t('errors.notFoundTitle')}</h2>
        <p className="mt-2 text-sm text-slate-600">{t('errors.notFound')}</p>
        <Button asChild className="mt-4" variant="secondary">
          <Link to="/">{t('nav.home')}</Link>
        </Button>
      </Card>
    </div>
  );
}

export function PageHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}
