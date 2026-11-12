import {
  adminStoreSchema,
  combinationKey,
  mediaListSchema,
  PRODUCT_STATUSES,
  productSchema,
  variantCombinations,
} from '@dz/contracts';
import type {
  MediaDto,
  ProductDto,
  ProductInputDraft,
  ProductStatus,
  StoreLocale,
} from '@dz/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useRouteContext } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { ErrorView, PageHeader } from '../components/states.tsx';
import { Button } from '../components/ui/button.tsx';
import { Badge, Card } from '../components/ui/card.tsx';
import { Field, Input, Select } from '../components/ui/field.tsx';
import { api, ApiError, errorKey } from '../lib/api.ts';
import { can } from '../lib/session.ts';
import { STATUS_TONE } from './products-list.tsx';

type Locale = StoreLocale;
type Texts = Record<Locale, string>;
const EMPTY_TEXTS: Texts = { ar: '', fr: '' };
const LOCALES: readonly Locale[] = ['ar', 'fr'];

interface OptionState {
  key: string;
  name: Texts;
  values: { key: string; label: Texts }[];
}
interface VariantRow {
  id?: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  costPrice: string;
  weightGrams: string;
  carrierProductRef: string;
  isActive: boolean;
}
interface FormState {
  name: string;
  slug: string;
  slugTouched: boolean;
  status: ProductStatus;
  title: Texts;
  description: Texts;
  options: OptionState[];
  /** Variant data by combination key (rows of removed combinations are ignored). */
  rows: Record<string, VariantRow>;
  media: { mediaId: string; variantKey: string | null }[];
  seo: { title: Texts; description: Texts; ogImageMediaId: string | null };
}

const textsOf = (value: { ar?: string | undefined; fr?: string | undefined }): Texts => ({
  ar: value.ar ?? '',
  fr: value.fr ?? '',
});
/** Only filled languages are sent (`{ fr: 'x' }`, never `{ ar: '' }`). */
const localized = (texts: Texts) =>
  Object.fromEntries(
    LOCALES.flatMap((locale) => (texts[locale].trim() ? [[locale, texts[locale].trim()]] : [])),
  );
const money = (value: number | null) => (value === null ? '' : String(value));

/** ASCII slug from a (French) name; Arabic-only names give an empty slug to type by hand. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80)
    .replace(/-+$/u, '');
}

const nextKey = (prefix: string, keys: readonly string[]) => {
  const used = keys.map((key) => Number(key.slice(prefix.length))).filter(Number.isFinite);
  return `${prefix}${String(Math.max(0, ...used) + 1)}`;
};

function initialState(product: ProductDto | undefined): FormState {
  if (!product) {
    return {
      name: '',
      slug: '',
      slugTouched: false,
      status: 'DRAFT',
      title: EMPTY_TEXTS,
      description: EMPTY_TEXTS,
      options: [],
      rows: {},
      media: [],
      seo: { title: EMPTY_TEXTS, description: EMPTY_TEXTS, ogImageMediaId: null },
    };
  }
  const rows: Record<string, VariantRow> = {};
  const keyById = new Map<string, string>();
  for (const variant of product.variants) {
    const key = combinationKey(variant.options);
    keyById.set(variant.id, key);
    rows[key] = {
      id: variant.id,
      sku: variant.sku,
      price: money(variant.price),
      compareAtPrice: money(variant.compareAtPrice),
      costPrice: money(variant.costPrice),
      weightGrams: money(variant.weightGrams),
      carrierProductRef: variant.carrierProductRef ?? '',
      isActive: variant.isActive,
    };
  }
  return {
    name: product.name,
    slug: product.slug,
    slugTouched: true,
    status: product.status,
    title: textsOf(product.content.title),
    description: textsOf(product.content.description),
    options: product.options.map((option) => ({
      key: option.key,
      name: textsOf(option.name),
      values: option.values.map((value) => ({ key: value.key, label: textsOf(value.label) })),
    })),
    rows,
    media: product.media.map((link) => ({
      mediaId: link.media.id,
      variantKey: link.variantId === null ? null : (keyById.get(link.variantId) ?? null),
    })),
    seo: {
      title: textsOf(product.seo.title),
      description: textsOf(product.seo.description),
      ogImageMediaId: product.seo.ogImageMediaId,
    },
  };
}

// Error details of the API (validation of the whole product), shown next to the form.
const errorDetailsSchema = z.union([
  z.object({
    reason: z.literal('NOT_PUBLISHABLE'),
    problems: z.array(
      z.object({ code: z.string(), locale: z.string().optional(), sku: z.string().optional() }),
    ),
  }),
  z.object({
    reason: z.literal('INVALID_VARIANTS'),
    issues: z.array(z.object({ code: z.string(), index: z.number().optional() })),
  }),
  z.object({ field: z.literal('sku'), skus: z.array(z.string()) }),
  z.object({ field: z.literal('slug') }),
  z.object({ reason: z.string() }),
]);

/** Loads the product (edit) and its store, then renders the form initialised once. */
export function ProductFormPage() {
  const params = useParams({ strict: false });
  const storeId = typeof params.storeId === 'string' ? params.storeId : '';
  const productId = typeof params.productId === 'string' ? params.productId : undefined;
  const store = useQuery({
    queryKey: ['store', storeId],
    queryFn: async () => adminStoreSchema.parse(await api(`/v1/stores/${storeId}`)),
  });
  const product = useQuery({
    queryKey: ['product', productId],
    queryFn: async () =>
      productSchema.parse(await api(`/v1/stores/${storeId}/products/${productId ?? ''}`)),
    enabled: productId !== undefined,
  });
  const failed = store.error ?? product.error;
  if (failed) return <ErrorView error={failed} />;
  if (!store.data || (productId !== undefined && !product.data)) return null;
  return (
    <ProductForm
      key={product.data?.updatedAt ?? 'new'}
      storeId={storeId}
      storeLocales={store.data.locales}
      product={product.data}
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="grid gap-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

function ProductForm({
  storeId,
  storeLocales,
  product,
}: {
  storeId: string;
  storeLocales: readonly Locale[];
  product: ProductDto | undefined;
}) {
  const { me } = useRouteContext({ from: '/_app' });
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canWrite = can(me, 'catalog.write');
  const canSeeCost = can(me, 'finance.read');
  const [form, setForm] = useState<FormState>(() => initialState(product));
  const [errors, setErrors] = useState<string[]>([]);
  const base = `/v1/stores/${storeId}/products`;
  const library = useQuery({
    queryKey: ['media', storeId],
    queryFn: async () => mediaListSchema.parse(await api(`/v1/stores/${storeId}/media?limit=100`)),
    enabled: canWrite,
  });
  const [pickerOpen, setPickerOpen] = useState(false);

  const mediaById = new Map<string, MediaDto>();
  for (const link of product?.media ?? []) mediaById.set(link.media.id, link.media);
  for (const item of library.data?.items ?? []) mediaById.set(item.id, item);

  // ─── Variants: one row per combination of option values ───
  const combos = variantCombinations(
    form.options.map((option) => ({
      key: option.key,
      name: {},
      values: option.values.map((value) => ({ key: value.key, label: {} })),
    })),
  );
  // The back office reads French first (fr/en interface), Arabic when it is the only label.
  const uiLabel = (texts: Texts) => texts.fr || texts.ar || '—';
  const comboLabel = (combo: Record<string, string>) =>
    form.options
      .map((option) => {
        const value = option.values.find((v) => v.key === combo[option.key]);
        return value ? uiLabel(value.label) : '?';
      })
      .join(' / ');
  const skuBase = (form.slug || 'SKU').toUpperCase().slice(0, 40);
  const comboKeys = combos.map(combinationKey);
  // A saved variant whose combination disappeared (e.g. the single variant of a product that
  // just got its first option) is carried over to the first new combination: it keeps its
  // identifier, SKU and amounts instead of being deleted and recreated.
  const usedIds = new Set(comboKeys.flatMap((key) => form.rows[key]?.id ?? []));
  const orphan = Object.entries(form.rows).find(
    ([key, row]) => !comboKeys.includes(key) && row.id !== undefined && !usedIds.has(row.id),
  )?.[1];
  const firstMissing = comboKeys.find((key) => form.rows[key] === undefined);
  const template = (comboKeys[0] ? form.rows[comboKeys[0]] : undefined) ?? orphan;
  const rowAt = (key: string, index: number): VariantRow => {
    const existing = form.rows[key];
    if (existing) return existing;
    if (orphan && key === firstMissing) return orphan;
    return {
      sku: combos.length === 1 ? skuBase : `${skuBase}-${String(index + 1)}`,
      price: template?.price ?? '',
      compareAtPrice: template?.compareAtPrice ?? '',
      costPrice: template?.costPrice ?? '',
      weightGrams: template?.weightGrams ?? '',
      carrierProductRef: '',
      isActive: true,
    };
  };
  const updateRow = (key: string, index: number, patch: Partial<VariantRow>) => {
    setForm((current) => ({
      ...current,
      rows: { ...current.rows, [key]: { ...rowAt(key, index), ...patch } },
    }));
  };

  const updateOption = (index: number, change: (option: OptionState) => OptionState) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, i) => (i === index ? change(option) : option)),
    }));
  };

  // ─── Submit ───
  const payload = (): ProductInputDraft => {
    const variants = combos.map((combo, index) => {
      const row = rowAt(combinationKey(combo), index);
      return {
        ...(row.id ? { id: row.id } : {}),
        sku: row.sku,
        options: combo,
        price: Number(row.price),
        compareAtPrice: row.compareAtPrice === '' ? null : Number(row.compareAtPrice),
        costPrice: Number(row.costPrice || 0),
        weightGrams: row.weightGrams === '' ? null : Number(row.weightGrams),
        carrierProductRef: row.carrierProductRef.trim() || null,
        isActive: row.isActive,
      };
    });
    const skuByKey = new Map(
      combos.map((combo, index) => [
        combinationKey(combo),
        rowAt(combinationKey(combo), index).sku,
      ]),
    );
    return {
      name: form.name,
      slug: form.slug,
      status: form.status,
      content: { title: localized(form.title), description: localized(form.description) },
      options: form.options.map((option) => ({
        key: option.key,
        name: localized(option.name),
        values: option.values.map((value) => ({ key: value.key, label: localized(value.label) })),
      })),
      variants,
      media: form.media.map((link) => ({
        mediaId: link.mediaId,
        variantSku: link.variantKey === null ? null : (skuByKey.get(link.variantKey) ?? null),
      })),
      seo: {
        title: localized(form.seo.title),
        description: localized(form.seo.description),
        ogImageMediaId: form.media.some((m) => m.mediaId === form.seo.ogImageMediaId)
          ? form.seo.ogImageMediaId
          : null,
      },
    };
  };

  const explain = (error: unknown): string[] => {
    if (!(error instanceof ApiError)) return [t(errorKey(error))];
    const details = errorDetailsSchema.safeParse(error.details);
    if (!details.success) return [t(errorKey(error))];
    const value = details.data;
    if ('problems' in value) {
      return value.problems.map((problem) =>
        t(`products.problems.${problem.code}`, {
          defaultValue: problem.code,
          locale: problem.locale ?? '',
          sku: problem.sku ?? '',
        }),
      );
    }
    if ('issues' in value) {
      return value.issues.map((issue) =>
        t(`products.issues.${issue.code}`, {
          defaultValue: issue.code,
          line: issue.index === undefined ? '' : String(issue.index + 1),
        }),
      );
    }
    if ('skus' in value) return [t('products.skuTaken', { skus: value.skus.join(', ') })];
    if ('field' in value) return [t('products.slugTaken')];
    if (value.reason === 'STALE') return [t('products.stale')];
    return [t(errorKey(error))];
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = payload();
      const result = product
        ? await api(`${base}/${product.id}`, {
            method: 'PUT',
            body: { ...body, expectedUpdatedAt: product.updatedAt },
          })
        : await api(base, { method: 'POST', body });
      return productSchema.parse(result);
    },
    onSuccess: async (saved) => {
      setErrors([]);
      toast.success(product ? t('products.saved') : t('products.created'));
      queryClient.setQueryData(['product', saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: ['products', storeId] });
      if (!product) {
        await navigate({
          to: '/stores/$storeId/products/$productId',
          params: { storeId, productId: saved.id },
        });
      }
    },
    onError: (error) => {
      setErrors(explain(error));
      toast.error(t('products.notSaved'));
    },
  });
  const action = useMutation({
    mutationFn: async (kind: 'duplicate' | 'archive' | 'restore') => {
      if (!product) throw new Error('No product');
      const result =
        kind === 'duplicate'
          ? await api(`${base}/${product.id}/duplicate`, { method: 'POST' })
          : await api(`${base}/${product.id}/status`, {
              method: 'PATCH',
              body: { status: kind === 'archive' ? 'ARCHIVED' : 'DRAFT' },
            });
      return { kind, saved: productSchema.parse(result) };
    },
    onSuccess: async ({ kind, saved }) => {
      toast.success(t(`products.done.${kind}`));
      queryClient.setQueryData(['product', saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: ['products', storeId] });
      if (kind === 'duplicate') {
        await navigate({
          to: '/stores/$storeId/products/$productId',
          params: { storeId, productId: saved.id },
        });
      }
    },
    onError: (error) => {
      setErrors(explain(error));
      toast.error(t(errorKey(error)));
    },
  });

  const required = (locale: Locale) => storeLocales.includes(locale);
  const textFields = (
    label: string,
    texts: Texts,
    onChange: (texts: Texts) => void,
    options: { maxLength: number; multiline?: boolean; publishRequired?: boolean },
  ) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {LOCALES.map((locale) => (
        <Field
          key={locale}
          label={`${label} (${t(`products.locales.${locale}`)})${
            options.publishRequired && required(locale) ? ' *' : ''
          }`}
        >
          {(id) =>
            options.multiline ? (
              <textarea
                id={id}
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
                lang={locale}
                rows={5}
                maxLength={options.maxLength}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-600 focus:outline-2 focus:outline-indigo-600/30"
                value={texts[locale]}
                onChange={(e) => {
                  onChange({ ...texts, [locale]: e.target.value });
                }}
              />
            ) : (
              <Input
                id={id}
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
                lang={locale}
                maxLength={options.maxLength}
                value={texts[locale]}
                onChange={(e) => {
                  onChange({ ...texts, [locale]: e.target.value });
                }}
              />
            )
          }
        </Field>
      ))}
    </div>
  );

  const selectedIds = new Set(form.media.map((m) => m.mediaId));
  const moveMedia = (index: number, delta: -1 | 1) => {
    setForm((current) => {
      const media = [...current.media];
      const [item] = media.splice(index, 1);
      if (item) media.splice(index + delta, 0, item);
      return { ...current, media };
    });
  };
  const thumb = (id: string) => {
    const item = mediaById.get(id);
    const src = item?.variants.find((v) => v.format === 'webp')?.url ?? item?.url;
    return src ? (
      <img src={src} alt="" width={64} height={64} className="size-16 rounded object-cover" />
    ) : (
      <span className="size-16 rounded bg-slate-100" />
    );
  };

  return (
    <>
      <PageHeader
        title={product ? product.name : t('products.new')}
        actions={
          product && canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Badge tone={STATUS_TONE[product.status]}>
                {t(`products.statuses.${product.status}`)}
              </Badge>
              <Button
                variant="secondary"
                disabled={action.isPending}
                onClick={() => {
                  action.mutate('duplicate');
                }}
              >
                {t('products.duplicate')}
              </Button>
              <Button
                variant="secondary"
                disabled={action.isPending}
                onClick={() => {
                  action.mutate(product.status === 'ARCHIVED' ? 'restore' : 'archive');
                }}
              >
                {product.status === 'ARCHIVED' ? t('products.restore') : t('products.archive')}
              </Button>
            </div>
          ) : null
        }
      />
      <form
        className="grid max-w-5xl gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        {errors.length > 0 ? (
          <Card className="border-red-200 bg-red-50" role="alert">
            <p className="mb-2 font-medium text-red-800">{t('products.notSaved')}</p>
            <ul className="list-disc ps-5 text-sm text-red-800">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </Card>
        ) : null}
        <fieldset className="contents" disabled={!canWrite}>
          <Section title={t('products.general')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('products.name')} hint={t('products.nameHint')}>
                {(id, describedBy) => (
                  <Input
                    id={id}
                    required
                    minLength={2}
                    maxLength={120}
                    aria-describedby={describedBy}
                    value={form.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setForm((current) => ({
                        ...current,
                        name,
                        slug: current.slugTouched ? current.slug : slugify(name),
                      }));
                    }}
                  />
                )}
              </Field>
              <Field label={t('products.slug')} hint={t('products.slugHint')}>
                {(id, describedBy) => (
                  <Input
                    id={id}
                    required
                    dir="ltr"
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    maxLength={80}
                    aria-describedby={describedBy}
                    value={form.slug}
                    onChange={(e) => {
                      setForm({ ...form, slug: e.target.value.toLowerCase(), slugTouched: true });
                    }}
                  />
                )}
              </Field>
              <Field label={t('products.status')} hint={t('products.statusHint')}>
                {(id, describedBy) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    value={form.status}
                    onChange={(e) => {
                      const status = PRODUCT_STATUSES.find((s) => s === e.target.value);
                      if (status) setForm({ ...form, status });
                    }}
                  >
                    {PRODUCT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t(`products.statuses.${status}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </Section>

          <Section title={t('products.content')}>
            {textFields(
              t('products.titleField'),
              form.title,
              (title) => {
                setForm({ ...form, title });
              },
              { maxLength: 150, publishRequired: true },
            )}
            {textFields(
              t('products.description'),
              form.description,
              (description) => {
                setForm({ ...form, description });
              },
              { maxLength: 5000, multiline: true },
            )}
          </Section>

          <Section title={t('products.optionsTitle')}>
            <p className="text-sm text-slate-600">{t('products.optionsHint')}</p>
            {form.options.map((option, index) => (
              <div key={option.key} className="grid gap-3 rounded-md border border-slate-200 p-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    {textFields(
                      t('products.optionName'),
                      option.name,
                      (name) => {
                        updateOption(index, (o) => ({ ...o, name }));
                      },
                      { maxLength: 40 },
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('products.removeOption')}
                    onClick={() => {
                      setForm((current) => ({
                        ...current,
                        options: current.options.filter((_, i) => i !== index),
                      }));
                    }}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
                <ul className="grid gap-2">
                  {option.values.map((value, valueIndex) => (
                    <li key={value.key} className="flex items-end gap-2">
                      <div className="flex-1">
                        {textFields(
                          t('products.optionValue', { n: valueIndex + 1 }),
                          value.label,
                          (label) => {
                            updateOption(index, (o) => ({
                              ...o,
                              values: o.values.map((v, i) =>
                                i === valueIndex ? { ...v, label } : v,
                              ),
                            }));
                          },
                          { maxLength: 40 },
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('products.removeValue')}
                        disabled={option.values.length === 1}
                        onClick={() => {
                          updateOption(index, (o) => ({
                            ...o,
                            values: o.values.filter((_, i) => i !== valueIndex),
                          }));
                        }}
                      >
                        <X size={16} />
                      </Button>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="secondary"
                  size="sm"
                  className="justify-self-start"
                  disabled={option.values.length >= 30}
                  onClick={() => {
                    updateOption(index, (o) => ({
                      ...o,
                      values: [
                        ...o.values,
                        {
                          key: nextKey(
                            'v',
                            o.values.map((v) => v.key),
                          ),
                          label: EMPTY_TEXTS,
                        },
                      ],
                    }));
                  }}
                >
                  <Plus size={14} /> {t('products.addValue')}
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              className="justify-self-start"
              disabled={form.options.length >= 3}
              onClick={() => {
                setForm((current) => ({
                  ...current,
                  options: [
                    ...current.options,
                    {
                      key: nextKey(
                        'o',
                        current.options.map((o) => o.key),
                      ),
                      name: EMPTY_TEXTS,
                      values: [{ key: 'v1', label: EMPTY_TEXTS }],
                    },
                  ],
                }));
              }}
            >
              <Plus size={14} /> {t('products.addOption')}
            </Button>
          </Section>

          <Section title={t('products.variants')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    {form.options.length > 0 ? (
                      <th className="px-2 py-2 text-start">{t('products.variant')}</th>
                    ) : null}
                    <th className="px-2 py-2 text-start">{t('products.sku')}</th>
                    <th className="px-2 py-2 text-start">{t('products.priceDa')}</th>
                    <th className="px-2 py-2 text-start">{t('products.compareAtDa')}</th>
                    {canSeeCost ? (
                      <th className="px-2 py-2 text-start">{t('products.costDa')}</th>
                    ) : null}
                    <th className="px-2 py-2 text-start">{t('products.weight')}</th>
                    <th className="px-2 py-2 text-start">{t('products.carrierRef')}</th>
                    <th className="px-2 py-2 text-start">{t('products.activeVariant')}</th>
                  </tr>
                </thead>
                <tbody>
                  {combos.map((combo, index) => {
                    const key = combinationKey(combo);
                    const row = rowAt(key, index);
                    const label = form.options.length > 0 ? comboLabel(combo) : form.name;
                    const cell = (
                      field:
                        | 'sku'
                        | 'price'
                        | 'compareAtPrice'
                        | 'costPrice'
                        | 'weightGrams'
                        | 'carrierProductRef',
                      props: ComponentProps<'input'>,
                    ) => (
                      <td className="px-2 py-1">
                        <Input
                          aria-label={`${t(`products.columns.${field}`)} — ${label}`}
                          value={row[field]}
                          onChange={(e) => {
                            updateRow(key, index, {
                              [field]:
                                field === 'sku' ? e.target.value.toUpperCase() : e.target.value,
                            });
                          }}
                          {...props}
                        />
                      </td>
                    );
                    return (
                      <tr key={key} className="border-t border-slate-100">
                        {form.options.length > 0 ? (
                          <td className="px-2 py-1 font-medium whitespace-nowrap">{label}</td>
                        ) : null}
                        {cell('sku', {
                          required: true,
                          dir: 'ltr',
                          maxLength: 64,
                          className: 'w-36 font-mono',
                        })}
                        {cell('price', {
                          required: true,
                          type: 'number',
                          min: 0,
                          step: 1,
                          inputMode: 'numeric',
                          className: 'w-28',
                        })}
                        {cell('compareAtPrice', {
                          type: 'number',
                          min: 0,
                          step: 1,
                          inputMode: 'numeric',
                          className: 'w-28',
                        })}
                        {canSeeCost
                          ? cell('costPrice', {
                              required: true,
                              type: 'number',
                              min: 0,
                              step: 1,
                              inputMode: 'numeric',
                              className: 'w-28',
                            })
                          : null}
                        {cell('weightGrams', {
                          type: 'number',
                          min: 1,
                          step: 1,
                          inputMode: 'numeric',
                          className: 'w-24',
                        })}
                        {cell('carrierProductRef', {
                          dir: 'ltr',
                          maxLength: 64,
                          className: 'w-32',
                        })}
                        <td className="px-2 py-1">
                          <input
                            type="checkbox"
                            aria-label={`${t('products.activeVariant')} — ${label}`}
                            className="size-4 accent-indigo-600"
                            checked={row.isActive}
                            onChange={(e) => {
                              updateRow(key, index, { isActive: e.target.checked });
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">{t('products.variantsHint')}</p>
          </Section>

          <Section title={t('products.images')}>
            <ol className="grid gap-2">
              {form.media.map((link, index) => (
                <li key={link.mediaId} className="flex flex-wrap items-center gap-3">
                  {thumb(link.mediaId)}
                  <span className="text-sm text-slate-500">#{index + 1}</span>
                  {form.options.length > 0 ? (
                    <Select
                      aria-label={t('products.imageVariant', { n: index + 1 })}
                      className="w-auto"
                      value={link.variantKey ?? ''}
                      onChange={(e) => {
                        const variantKey = e.target.value || null;
                        setForm((current) => ({
                          ...current,
                          media: current.media.map((m, i) =>
                            i === index ? { ...m, variantKey } : m,
                          ),
                        }));
                      }}
                    >
                      <option value="">{t('products.allVariants')}</option>
                      {combos.map((combo) => (
                        <option key={combinationKey(combo)} value={combinationKey(combo)}>
                          {comboLabel(combo)}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('products.moveUp')}
                    disabled={index === 0}
                    onClick={() => {
                      moveMedia(index, -1);
                    }}
                  >
                    <ArrowUp size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('products.moveDown')}
                    disabled={index === form.media.length - 1}
                    onClick={() => {
                      moveMedia(index, 1);
                    }}
                  >
                    <ArrowDown size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('products.removeImage')}
                    onClick={() => {
                      setForm((current) => ({
                        ...current,
                        media: current.media.filter((_, i) => i !== index),
                      }));
                    }}
                  >
                    <X size={16} />
                  </Button>
                </li>
              ))}
            </ol>
            {form.media.length === 0 ? (
              <p className="text-sm text-slate-500">{t('products.noImage')}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={form.media.length >= 30}
                onClick={() => {
                  setPickerOpen((open) => !open);
                }}
              >
                <Plus size={14} /> {t('products.addImages')}
              </Button>
              <Button asChild variant="ghost">
                <Link to="/stores/$storeId/media" params={{ storeId }}>
                  {t('media.open')}
                </Link>
              </Button>
            </div>
            {pickerOpen ? (
              <ul
                className="grid grid-cols-4 gap-2 sm:grid-cols-6"
                aria-label={t('products.library')}
              >
                {(library.data?.items ?? [])
                  .filter((item) => item.status !== 'FAILED' && !selectedIds.has(item.id))
                  .map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="block w-full overflow-hidden rounded-md border border-slate-200 hover:border-indigo-400"
                        aria-label={t('products.pickImage', {
                          alt: item.alt.fr ?? item.alt.ar ?? item.id.slice(0, 8),
                        })}
                        onClick={() => {
                          setForm((current) => ({
                            ...current,
                            media: [...current.media, { mediaId: item.id, variantKey: null }],
                          }));
                        }}
                      >
                        <img
                          src={item.variants.find((v) => v.format === 'webp')?.url ?? item.url}
                          alt=""
                          className="aspect-square w-full object-cover"
                        />
                      </button>
                    </li>
                  ))}
              </ul>
            ) : null}
          </Section>

          <Section title={t('products.seo')}>
            {textFields(
              t('products.seoTitle'),
              form.seo.title,
              (title) => {
                setForm({ ...form, seo: { ...form.seo, title } });
              },
              { maxLength: 70 },
            )}
            {textFields(
              t('products.seoDescription'),
              form.seo.description,
              (description) => {
                setForm({ ...form, seo: { ...form.seo, description } });
              },
              { maxLength: 160, multiline: true },
            )}
            <Field label={t('products.ogImage')} hint={t('products.ogImageHint')}>
              {(id, describedBy) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  className="w-auto"
                  value={form.seo.ogImageMediaId ?? ''}
                  onChange={(e) => {
                    setForm({
                      ...form,
                      seo: { ...form.seo, ogImageMediaId: e.target.value || null },
                    });
                  }}
                >
                  <option value="">{t('products.firstImage')}</option>
                  {form.media.map((link, index) => (
                    <option key={link.mediaId} value={link.mediaId}>
                      {t('products.imageN', { n: index + 1 })}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Section>
        </fieldset>

        {canWrite ? (
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>
              {t('common.save')}
            </Button>
            <Button asChild variant="secondary">
              <Link to="/stores/$storeId/products" params={{ storeId }}>
                {t('common.cancel')}
              </Link>
            </Button>
          </div>
        ) : null}
      </form>
    </>
  );
}
