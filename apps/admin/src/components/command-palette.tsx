import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Command } from 'cmdk';
import { Activity, Home, Keyboard, Languages, LogOut, Store, UserCog, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { setLanguage } from '../i18n/index.ts';
import { can, signOut } from '../lib/session.ts';
import type { Me } from '../lib/session.ts';

function Item({
  onSelect,
  icon,
  children,
}: {
  onSelect: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm aria-selected:bg-indigo-50 aria-selected:text-indigo-900"
    >
      {icon}
      {children}
    </Command.Item>
  );
}

/** Ctrl/Cmd+K: keyboard-first navigation and actions (PRD §12). */
export function CommandPalette({
  me,
  open,
  onOpenChange,
  onShowShortcuts,
}: {
  me: Me;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowShortcuts: () => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const run = (action: () => unknown) => {
    onOpenChange(false);
    void action();
  };
  const groupClass =
    'px-1 py-1 text-xs font-medium text-slate-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1';

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={t('palette.placeholder')}
      overlayClassName="fixed inset-0 z-40 bg-slate-900/40"
      contentClassName="fixed start-1/2 top-24 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-lg bg-white shadow-2xl rtl:translate-x-1/2"
    >
      <Command.Input
        placeholder={t('palette.placeholder')}
        className="h-12 w-full border-b border-slate-200 px-4 text-sm outline-none"
      />
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-slate-500">
          {t('palette.empty')}
        </Command.Empty>
        <Command.Group heading={t('palette.navigation')} className={groupClass}>
          <Item
            icon={<Home size={16} />}
            onSelect={() => {
              run(() => navigate({ to: '/' }));
            }}
          >
            {t('nav.home')}
          </Item>
          {can(me, 'users.read') ? (
            <Item
              icon={<Users size={16} />}
              onSelect={() => {
                run(() => navigate({ to: '/users' }));
              }}
            >
              {t('nav.users')}
            </Item>
          ) : null}
          {can(me, 'stores.read') ? (
            <Item
              icon={<Store size={16} />}
              onSelect={() => {
                run(() => navigate({ to: '/stores' }));
              }}
            >
              {t('nav.stores')}
            </Item>
          ) : null}
          {can(me, 'jobs.manage') ? (
            <Item
              icon={<Activity size={16} />}
              onSelect={() => {
                run(() => navigate({ to: '/system' }));
              }}
            >
              {t('nav.system')}
            </Item>
          ) : null}
          <Item
            icon={<UserCog size={16} />}
            onSelect={() => {
              run(() => navigate({ to: '/account' }));
            }}
          >
            {t('nav.account')}
          </Item>
        </Command.Group>
        <Command.Group heading={t('palette.actions')} className={groupClass}>
          <Item
            icon={<Languages size={16} />}
            onSelect={() => {
              run(() => setLanguage(i18n.language === 'fr' ? 'en' : 'fr'));
            }}
          >
            {t('palette.switchLanguage')}
          </Item>
          <Item
            icon={<Keyboard size={16} />}
            onSelect={() => {
              run(onShowShortcuts);
            }}
          >
            {t('palette.shortcuts')}
          </Item>
          <Item
            icon={<LogOut size={16} />}
            onSelect={() => {
              run(async () => {
                await signOut(queryClient);
                await navigate({ to: '/login' });
              });
            }}
          >
            {t('nav.logout')}
          </Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
