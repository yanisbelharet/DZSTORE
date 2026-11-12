import { PRODUCT_STATUSES, productListSchema } from '@dz/contracts';
import type { ProductStatus } from '@dz/contracts';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useParams, useRouteContext } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorView, PageHeader } from '../components/states.tsx';
import { Button } from '../components/ui/button.tsx';
import { Badge, Card } from '../components/ui/card.tsx';
import { Input, Select } from '../components/ui/field.tsx';
import { api } from '../lib/api.ts';
import { can } from '../lib/session.ts';
import { formatDzd, readSelectedStore } from '../lib/store-selection.ts';

export const STATUS_TONE = { DRAFT: 'neutral', ACTIVE: 'success', ARCHIVED: 'warning' } as const;

/** Entry point of the catalogue: the selected (or only) store, else a store chooser. */
export function ProductsHomePage() {
  const { t } = useTranslation();
  const stores = useQuery({
    queryKey: ['stores'],
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/v1/stores'),
  });
  if (stores.isError) {
    return <ErrorView error={stores.error} onRetry={() => void stores.refetch()} />;
  }
  if (!stores.data) return null;
  const selected = readSelectedStore();
  const target =
    stores.data.items.find((store) => store.id === selected) ??
    (stores.data.items.length === 1 ? stores.data.items[0] : undefined);
  if (target)
    return <Navigate to="/stores/$storeId/products" params={{ storeId: target.id }} replace />;
  return (
    <>
      <PageHeader title={t('products.chooseStore')} />
      <ul className="grid max-w-2xl gap-2">
        {stores.data.items.map((store) => (
          <li key={store.id}>
            <Link
              to="/stores/$storeId/products"
              params={{ storeId: store.id }}
              className="block rounded-lg border border-slate-200 bg-white px-4 py-3 font-medium hover:border-indigo-300"
            >
              {store.name}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

const isStatusFilter = (value: string): value is ProductStatus | 'ALL' | '' =>
  value === '' || value === 'ALL' || (PRODUCT_STATUSES as readonly string[]).includes(value);

/** Products of a store: search (name, slug, SKU), status filter, price range. */
export function ProductsPage() {
  const { me } = useRouteContext({ from: '/_app' });
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const storeId = typeof params.storeId === 'string' ? params.storeId : '';
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ProductStatus | 'ALL' | ''>('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
    }, 250);
    return () => {
      clearTimeout(timer);
    };
  }, [search]);
  const store = useQuery({
    queryKey: ['store', storeId],
    queryFn: () => api<{ name: string }>(`/v1/stores/${storeId}`),
  });
  const products = useInfiniteQuery({
    queryKey: ['products', storeId, query, status],
    initialPageParam: '',
    queryFn: async ({ pageParam }) => {
      const search = new URLSearchParams({ limit: '50' });
      if (query) search.set('q', query);
      if (status) search.set('status', status);
      if (pageParam) search.set('cursor', pageParam);
      return productListSchema.parse(
        await api(`/v1/stores/${storeId}/products?${search.toString()}`),
      );
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = products.data?.pages.flatMap((page) => page.items) ?? [];
  const price = (min: number | null, max: number | null) =>
    min === null || max === null
      ? '—'
      : min === max
        ? formatDzd(min, i18n.language)
        : `${formatDzd(min, i18n.language)} – ${formatDzd(max, i18n.language)}`;

  return (
    <>
      <PageHeader
        title={t('products.title', { name: store.data?.name ?? '' })}
        actions={
          can(me, 'catalog.write') ? (
            <Button asChild>
              <Link to="/stores/$storeId/products/new" params={{ storeId }}>
                {t('products.new')}
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          type="search"
          aria-label={t('common.search')}
          placeholder={t('products.searchPlaceholder')}
          className="max-w-xs"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
        />
        <Select
          aria-label={t('products.status')}
          className="w-auto"
          value={status}
          onChange={(e) => {
            if (isStatusFilter(e.target.value)) setStatus(e.target.value);
          }}
        >
          <option value="">{t('products.notArchived')}</option>
          {PRODUCT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`products.statuses.${value}`)}
            </option>
          ))}
          <option value="ALL">{t('common.all')}</option>
        </Select>
      </div>
      {products.isError ? (
        <ErrorView error={products.error} onRetry={() => void products.refetch()} />
      ) : null}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3 text-start">{t('products.product')}</th>
              <th className="px-4 py-3 text-start">{t('products.status')}</th>
              <th className="px-4 py-3 text-start">{t('products.price')}</th>
              <th className="px-4 py-3 text-start">{t('products.variants')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => (
              <tr
                key={product.id}
                className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                onClick={() =>
                  void navigate({
                    to: '/stores/$storeId/products/$productId',
                    params: { storeId, productId: product.id },
                  })
                }
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {product.coverUrl ? (
                      <img
                        src={product.coverUrl}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                        className="size-10 rounded object-cover"
                      />
                    ) : (
                      <span className="size-10 rounded bg-slate-100" aria-hidden="true" />
                    )}
                    <div>
                      <Link
                        to="/stores/$storeId/products/$productId"
                        params={{ storeId, productId: product.id }}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {product.name}
                      </Link>
                      <div className="text-xs text-slate-500" dir="ltr">
                        /{product.slug}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[product.status]}>
                    {t(`products.statuses.${product.status}`)}
                  </Badge>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {price(product.priceMin, product.priceMax)}
                </td>
                <td className="px-4 py-3">{product.variantCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.isSuccess && rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">{t('products.empty')}</p>
        ) : null}
      </Card>
      {products.hasNextPage ? (
        <Button
          className="mt-4"
          variant="secondary"
          disabled={products.isFetchingNextPage}
          onClick={() => void products.fetchNextPage()}
        >
          {t('common.loadMore')}
        </Button>
      ) : null}
    </>
  );
}
