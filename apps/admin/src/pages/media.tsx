import { MEDIA_INPUT_TYPES, MEDIA_MAX_BYTES, mediaListSchema, mediaSchema } from '@dz/contracts';
import type { MediaDto } from '@dz/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ErrorView, PageHeader } from '../components/states.tsx';
import { Button } from '../components/ui/button.tsx';
import { Badge, Card } from '../components/ui/card.tsx';
import { ConfirmButton } from '../components/ui/dialog.tsx';
import { Field, Input } from '../components/ui/field.tsx';
import { api, errorKey } from '../lib/api.ts';
import { can } from '../lib/session.ts';

const STATUS_TONE = { PROCESSING: 'info', READY: 'success', FAILED: 'danger' } as const;

/** Store media library: upload, processing state, alternative text, deletion. */
export function MediaPage() {
  const { me } = useRouteContext({ from: '/_app' });
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const params = useParams({ strict: false });
  const storeId = typeof params.storeId === 'string' ? params.storeId : '';
  const canWrite = can(me, 'catalog.write');
  const base = `/v1/stores/${storeId}/media`;
  const store = useQuery({
    queryKey: ['store', storeId],
    queryFn: () => api<{ name: string }>(`/v1/stores/${storeId}`),
  });
  const media = useQuery({
    queryKey: ['media', storeId],
    queryFn: async () => mediaListSchema.parse(await api(`${base}?limit=100`)),
    // Variants are generated in the background: refresh while some are still processing.
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === 'PROCESSING') ? 3_000 : false,
  });
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        if (file.size > MEDIA_MAX_BYTES) throw new Error(t('media.tooLarge', { name: file.name }));
      }
      // One request per file, in sequence: each is small and independently retryable.
      for (const file of files) mediaSchema.parse(await api(base, { method: 'POST', body: file }));
      return files.length;
    },
    onSuccess: (count) => toast.success(t('media.uploaded', { count })),
    onError: (error) =>
      toast.error(
        error instanceof Error && error.name === 'Error' ? error.message : t(errorKey(error)),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['media', storeId] }),
  });

  if (media.isError) return <ErrorView error={media.error} onRetry={() => void media.refetch()} />;
  const items = media.data?.items ?? [];
  return (
    <>
      <PageHeader title={t('media.title', { name: store.data?.name ?? '' })} />
      {canWrite ? (
        <Card className="mb-6 grid max-w-3xl gap-2">
          <Field label={t('media.upload')} hint={t('media.uploadHint')}>
            {(id, describedBy) => (
              <Input
                id={id}
                type="file"
                multiple
                accept={MEDIA_INPUT_TYPES.join(',')}
                aria-describedby={describedBy}
                disabled={upload.isPending}
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])];
                  event.target.value = '';
                  if (files.length > 0) upload.mutate(files);
                }}
              />
            )}
          </Field>
          {upload.isPending ? (
            <p className="text-sm text-slate-600" role="status">
              {t('media.uploading', { count: upload.variables.length })}
            </p>
          ) : null}
        </Card>
      ) : null}
      {media.data && items.length === 0 ? (
        <p className="text-slate-500">{t('media.empty')}</p>
      ) : null}
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.id}>
            <MediaCard item={item} base={base} canWrite={canWrite} />
          </li>
        ))}
      </ul>
    </>
  );
}

function Thumbnail({ item }: { item: MediaDto }) {
  const small = (format: 'avif' | 'webp') => item.variants.find((v) => v.format === format);
  const avif = small('avif');
  const webp = small('webp');
  const alt = item.alt.fr ?? item.alt.ar ?? '';
  return (
    <picture>
      {avif ? <source srcSet={avif.url} type="image/avif" /> : null}
      <img
        src={webp?.url ?? item.url}
        alt={alt}
        width={item.width}
        height={item.height}
        loading="lazy"
        decoding="async"
        className="aspect-square w-full rounded-md bg-slate-100 object-cover"
      />
    </picture>
  );
}

function MediaCard({ item, base, canWrite }: { item: MediaDto; base: string; canWrite: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [alt, setAlt] = useState({ ar: item.alt.ar ?? '', fr: item.alt.fr ?? '' });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['media', item.storeId] });
  const saveAlt = useMutation({
    mutationFn: () =>
      api(`${base}/${item.id}`, {
        method: 'PATCH',
        body: {
          alt: {
            ...(alt.ar.trim() ? { ar: alt.ar.trim() } : {}),
            ...(alt.fr.trim() ? { fr: alt.fr.trim() } : {}),
          },
        },
      }),
    onSuccess: async () => {
      toast.success(t('media.altSaved'));
      await refresh();
    },
    onError: (error) => toast.error(t(errorKey(error))),
  });

  return (
    <Card className="grid gap-3 p-3">
      <Thumbnail item={item} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <Badge tone={STATUS_TONE[item.status]}>{t(`media.status.${item.status}`)}</Badge>
        <span dir="ltr">
          {item.width}×{item.height}
        </span>
        {item.variants.length > 0 ? (
          <span>{t('media.variants', { count: item.variants.length })}</span>
        ) : null}
      </div>
      {canWrite ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            saveAlt.mutate();
          }}
        >
          <Field label={t('media.altAr')}>
            {(id) => (
              <Input
                id={id}
                dir="rtl"
                lang="ar"
                maxLength={200}
                value={alt.ar}
                onChange={(e) => {
                  setAlt({ ...alt, ar: e.target.value });
                }}
              />
            )}
          </Field>
          <Field label={t('media.altFr')}>
            {(id) => (
              <Input
                id={id}
                lang="fr"
                maxLength={200}
                value={alt.fr}
                onChange={(e) => {
                  setAlt({ ...alt, fr: e.target.value });
                }}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="secondary" disabled={saveAlt.isPending}>
              {t('media.saveAlt')}
            </Button>
            <ConfirmButton
              label={t('media.delete')}
              title={t('media.delete')}
              description={t('media.deleteConfirm')}
              onConfirm={async () => {
                try {
                  await api(`${base}/${item.id}`, { method: 'DELETE' });
                  toast.success(t('media.deleted'));
                  await refresh();
                } catch (error) {
                  toast.error(t(errorKey(error)));
                  throw error;
                }
              }}
            />
          </div>
        </form>
      ) : null}
    </Card>
  );
}
