import { useRouteContext } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '../components/states.tsx';
import { Card } from '../components/ui/card.tsx';

export function HomePage() {
  const { me } = useRouteContext({ from: '/_app' });
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('home.title', { name: me.user.name })} />
      <Card>
        <p className="text-sm text-slate-700">{t('home.intro')}</p>
      </Card>
    </>
  );
}
