import { Dialog as RadixDialog } from 'radix-ui';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from './button.tsx';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-slate-900/40" />
        <RadixDialog.Content className="fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl rtl:translate-x-1/2">
          <RadixDialog.Title className="text-lg font-semibold">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-2 text-sm text-slate-600">
              {description}
            </RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          <div className="mt-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Explicit confirmation before any critical action (PRD §11). */
export function ConfirmButton({
  label,
  title,
  description,
  onConfirm,
  variant = 'danger',
  children,
}: {
  label: string;
  title: string;
  description: string;
  onConfirm: () => Promise<unknown>;
  variant?: 'danger' | 'secondary' | 'primary';
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        onClick={() => {
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={title} description={description}>
        {children}
        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setOpen(false);
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant={variant}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onConfirm()
                .then(() => {
                  setOpen(false);
                })
                .catch(() => undefined)
                .finally(() => {
                  setBusy(false);
                });
            }}
          >
            {t('common.confirm')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
