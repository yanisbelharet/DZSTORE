import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ErrorView, PageHeader } from '../components/states.tsx';
import { Button } from '../components/ui/button.tsx';
import { Badge, Card } from '../components/ui/card.tsx';
import { api, errorKey } from '../lib/api.ts';

const JOB_STATUSES = ['PENDING', 'RUNNING', 'SUCCEEDED', 'DEAD', 'CANCELLED'] as const;
type JobStatus = (typeof JOB_STATUSES)[number];
const TICK_STATS = ['relayed', 'succeeded', 'retried', 'dead', 'scheduled', 'recovered'] as const;
type TickStats = Record<(typeof TICK_STATS)[number], number>;

interface QueueStats {
  items: { queue: string; status: JobStatus; count: number }[];
}

const STATUS_TONE = {
  PENDING: 'info',
  RUNNING: 'warning',
  SUCCEEDED: 'success',
  DEAD: 'danger',
  CANCELLED: 'neutral',
} as const;

/** Job pipeline: queue state, manual processing round, end-to-end test event (jobs.manage). */
export function SystemPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [lastTick, setLastTick] = useState<TickStats | null>(null);
  const stats = useQuery({
    queryKey: ['jobs', 'stats'],
    queryFn: () => api<QueueStats>('/v1/jobs/stats'),
  });

  const tick = useMutation({
    mutationFn: () => api<TickStats>('/v1/jobs/tick', { method: 'POST' }),
    onSuccess: async (result) => {
      setLastTick(result);
      toast.success(t('system.tickDone'));
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error) => toast.error(t(errorKey(error))),
  });
  const testEvent = useMutation({
    mutationFn: () => api<{ outboxEventId: string }>('/v1/jobs/test-event', { method: 'POST' }),
    onSuccess: (result) => toast.success(t('system.testEventDone', { id: result.outboxEventId })),
    onError: (error) => toast.error(t(errorKey(error))),
  });

  const rows = [...(stats.data?.items ?? [])].sort(
    (a, b) =>
      a.queue.localeCompare(b.queue) ||
      JOB_STATUSES.indexOf(a.status) - JOB_STATUSES.indexOf(b.status),
  );

  return (
    <>
      <PageHeader title={t('system.title')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-semibold">{t('system.processingTitle')}</h2>
          <p className="mt-1 text-sm text-slate-600">{t('system.processingHelp')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                tick.mutate();
              }}
              disabled={tick.isPending}
            >
              {t('system.tick')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                testEvent.mutate();
              }}
              disabled={testEvent.isPending}
            >
              {t('system.testEvent')}
            </Button>
          </div>
          {lastTick ? (
            <dl
              className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm"
              aria-label={t('system.lastTick')}
            >
              {TICK_STATS.map((key) => (
                <div key={key} className="contents">
                  <dt className="text-slate-600">{t(`system.stats.${key}`)}</dt>
                  <dd className="font-medium tabular-nums" data-testid={`tick-${key}`}>
                    {lastTick[key]}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{t('system.queueTitle')}</h2>
            <Button variant="ghost" size="sm" onClick={() => void stats.refetch()}>
              {t('system.refresh')}
            </Button>
          </div>
          {stats.isError ? (
            <ErrorView error={stats.error} onRetry={() => void stats.refetch()} />
          ) : rows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              {stats.isPending ? t('common.loading') : t('system.queueEmpty')}
            </p>
          ) : (
            <table className="mt-4 w-full text-start text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1 text-start font-medium">{t('system.queue')}</th>
                  <th className="py-1 text-start font-medium">{t('system.status')}</th>
                  <th className="py-1 text-end font-medium">{t('system.count')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.queue}:${row.status}`} className="border-t border-slate-100">
                    <td className="py-1.5 font-mono text-xs">{row.queue}</td>
                    <td className="py-1.5">
                      <Badge tone={STATUS_TONE[row.status]}>
                        {t(`system.jobStatus.${row.status}`)}
                      </Badge>
                    </td>
                    <td className="py-1.5 text-end tabular-nums">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
