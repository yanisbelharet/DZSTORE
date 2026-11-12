import { adminStoreSchema, STORE_LOCALES } from '@dz/contracts';
import type { AdminStore, StoreLocale, Theme, UpdateStoreInput } from '@dz/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ErrorView, PageHeader } from '../components/states.tsx';
import { Button } from '../components/ui/button.tsx';
import { Badge, Card } from '../components/ui/card.tsx';
import { Checkbox, Field, Input, Select } from '../components/ui/field.tsx';
import { api, errorKey } from '../lib/api.ts';
import { can } from '../lib/session.ts';

const COLOR_KEYS = ['primary', 'onPrimary', 'background', 'surface', 'text', 'muted'] as const;
const RADII = ['none', 'sm', 'md', 'lg'] as const satisfies readonly Theme['radius'][];
const LOCALE_NAMES: Record<StoreLocale, string> = { ar: 'العربية', fr: 'Français' };

// The response is validated: a contract drift shows a readable error, never a broken form.
const fetchStore = async (id: string) => adminStoreSchema.parse(await api(`/v1/stores/${id}`));

/** Stores visible to the caller, each opening its settings. */
export function StoresPage() {
  const { t } = useTranslation();
  const stores = useQuery({
    queryKey: ['stores'],
    queryFn: () =>
      api<{ items: { id: string; name: string; slug: string; isActive: boolean }[] }>('/v1/stores'),
  });
  if (stores.isError) {
    return <ErrorView error={stores.error} onRetry={() => void stores.refetch()} />;
  }
  return (
    <>
      <PageHeader title={t('stores.title')} />
      <ul className="grid max-w-2xl gap-2">
        {stores.data?.items.map((store) => (
          <li key={store.id}>
            <Link
              to="/stores/$storeId"
              params={{ storeId: store.id }}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-indigo-300"
            >
              <span>
                <span className="font-medium">{store.name}</span>
                <span className="ms-2 text-sm text-slate-500">{store.slug}</span>
              </span>
              <Badge tone={store.isActive ? 'success' : 'neutral'}>
                {store.isActive ? t('stores.active') : t('stores.inactive')}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Loads the store then renders its settings form, initialised once with its data. */
export function StoreSettingsPage() {
  const params = useParams({ strict: false });
  const storeId = typeof params.storeId === 'string' ? params.storeId : '';
  const store = useQuery({ queryKey: ['store', storeId], queryFn: () => fetchStore(storeId) });
  if (store.isError) return <ErrorView error={store.error} onRetry={() => void store.refetch()} />;
  if (!store.data) return null;
  return <StoreForm key={store.data.updatedAt} store={store.data} />;
}

interface FormState {
  name: string;
  orderPrefix: string;
  defaultLocale: StoreLocale;
  locales: StoreLocale[];
  theme: Theme;
}

function StoreForm({ store }: { store: AdminStore }) {
  const { me } = useRouteContext({ from: '/_app' });
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canManage = can(me, 'stores.manage');
  const [form, setForm] = useState<FormState>(() => ({
    name: store.name,
    orderPrefix: store.orderPrefix,
    defaultLocale: store.defaultLocale,
    locales: store.locales,
    theme: store.theme,
  }));
  const save = useMutation({
    mutationFn: async () =>
      adminStoreSchema.parse(
        await api(`/v1/stores/${store.id}`, {
          method: 'PATCH',
          body: form satisfies UpdateStoreInput,
        }),
      ),
    onSuccess: async (updated) => {
      toast.success(t('stores.saved'));
      queryClient.setQueryData(['store', store.id], updated);
      await queryClient.invalidateQueries({ queryKey: ['stores'] });
    },
    onError: (error) => toast.error(t(errorKey(error))),
  });
  const toggleLocale = (locale: StoreLocale) => {
    setForm((current) => ({
      ...current,
      locales: current.locales.includes(locale)
        ? current.locales.filter((l) => l !== locale)
        : STORE_LOCALES.filter((l) => l === locale || current.locales.includes(l)),
    }));
  };
  const defaultOffered = form.locales.includes(form.defaultLocale);

  return (
    <>
      <PageHeader title={t('stores.settings', { name: store.name })} />
      <form
        className="grid max-w-2xl gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <fieldset className="contents" disabled={!canManage}>
          <Card className="grid gap-4">
            <h2 className="font-semibold">{t('stores.general')}</h2>
            <Field label={t('stores.name')}>
              {(id) => (
                <Input
                  id={id}
                  required
                  minLength={2}
                  maxLength={80}
                  value={form.name}
                  onChange={(e) => {
                    setForm({ ...form, name: e.target.value });
                  }}
                />
              )}
            </Field>
            <Field label={t('stores.orderPrefix')} hint={t('stores.orderPrefixHint')}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  required
                  pattern="[A-Za-z]{2,4}"
                  maxLength={4}
                  aria-describedby={describedBy}
                  className="w-28 font-mono uppercase"
                  value={form.orderPrefix}
                  onChange={(e) => {
                    setForm({ ...form, orderPrefix: e.target.value.toUpperCase() });
                  }}
                />
              )}
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{t('stores.locales')}</legend>
              {STORE_LOCALES.map((locale) => (
                <Checkbox
                  key={locale}
                  label={LOCALE_NAMES[locale]}
                  checked={form.locales.includes(locale)}
                  onChange={() => {
                    toggleLocale(locale);
                  }}
                />
              ))}
            </fieldset>
            <Field
              label={t('stores.defaultLocale')}
              {...(defaultOffered ? {} : { hint: t('stores.defaultLocaleMissing') })}
            >
              {(id, describedBy) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={!defaultOffered}
                  value={form.defaultLocale}
                  onChange={(e) => {
                    const locale = STORE_LOCALES.find((l) => l === e.target.value);
                    if (locale) setForm({ ...form, defaultLocale: locale });
                  }}
                >
                  {STORE_LOCALES.map((locale) => (
                    <option key={locale} value={locale}>
                      {LOCALE_NAMES[locale]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Card>

          <Card className="grid gap-4">
            <h2 className="font-semibold">{t('stores.theme')}</h2>
            <div className="grid grid-cols-2 items-end gap-4 sm:grid-cols-3">
              {COLOR_KEYS.map((key) => (
                <Field key={key} label={t(`stores.colors.${key}`)}>
                  {(id) => (
                    <Input
                      id={id}
                      type="color"
                      className="h-10 p-1"
                      value={form.theme.colors[key]}
                      onChange={(e) => {
                        setForm({
                          ...form,
                          theme: {
                            ...form.theme,
                            colors: { ...form.theme.colors, [key]: e.target.value },
                          },
                        });
                      }}
                    />
                  )}
                </Field>
              ))}
            </div>
            <Field label={t('stores.radius')}>
              {(id) => (
                <Select
                  id={id}
                  className="w-40"
                  value={form.theme.radius}
                  onChange={(e) => {
                    const radius = RADII.find((r) => r === e.target.value);
                    if (radius) setForm({ ...form, theme: { ...form.theme, radius } });
                  }}
                >
                  {RADII.map((radius) => (
                    <option key={radius} value={radius}>
                      {t(`stores.radii.${radius}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Card>
        </fieldset>

        <Card className="grid gap-2">
          <h2 className="font-semibold">{t('stores.domains')}</h2>
          <p className="text-xs text-slate-500">{t('stores.domainsHint')}</p>
          <ul className="grid gap-1 text-sm">
            {store.domains.map((domain) => (
              <li key={domain.hostname} className="flex items-center gap-2">
                <span className="font-mono" dir="ltr">
                  {domain.hostname}
                </span>
                {domain.isPrimary ? <Badge tone="info">{t('stores.primary')}</Badge> : null}
              </li>
            ))}
            {store.domains.length === 0 ? (
              <li className="text-slate-500">{t('stores.noDomain')}</li>
            ) : null}
          </ul>
        </Card>

        {canManage ? (
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={save.isPending || form.locales.length === 0 || !defaultOffered}
            >
              {t('common.save')}
            </Button>
            <Button asChild variant="secondary">
              <Link to="/stores">{t('common.cancel')}</Link>
            </Button>
          </div>
        ) : null}
      </form>
    </>
  );
}
