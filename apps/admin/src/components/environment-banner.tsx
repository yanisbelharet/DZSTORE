import { useTranslation } from 'react-i18next';

/** Built for the free test deployment (VITE_DEPLOYMENT_ENVIRONMENT=test): shown on every page. */
export const isTestEnvironment = import.meta.env.VITE_DEPLOYMENT_ENVIRONMENT === 'test';

export function EnvironmentBanner() {
  const { t } = useTranslation();
  if (!isTestEnvironment) return null;
  return (
    <p
      role="note"
      className="bg-amber-100 px-4 py-1.5 text-center text-xs font-semibold text-amber-900"
    >
      {t('environment.test')}
    </p>
  );
}
