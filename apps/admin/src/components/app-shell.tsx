import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouteContext } from '@tanstack/react-router';
import { Home, LogOut, Menu, UserCog, Users } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { isLanguage, LANGUAGES, setLanguage } from '../i18n/index.ts';
import { api } from '../lib/api.ts';
import { useHotkey } from '../lib/hotkeys.ts';
import { can, signOut } from '../lib/session.ts';
import type { Me } from '../lib/session.ts';
import { CommandPalette } from './command-palette.tsx';
import { Button } from './ui/button.tsx';
import { Dialog } from './ui/dialog.tsx';
import { Select } from './ui/field.tsx';

const STORE_KEY = 'dz.admin.store';

function readStore(): string {
  try {
    return localStorage.getItem(STORE_KEY) ?? 'all';
  } catch {
    return 'all';
  }
}

function StoreSwitcher() {
  const { t } = useTranslation();
  const [value, setValue] = useState(readStore);
  const stores = useQuery({
    queryKey: ['stores'],
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/v1/stores'),
  });
  return (
    <Select
      aria-label={t('nav.store')}
      className="h-9 w-auto max-w-48"
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        try {
          localStorage.setItem(STORE_KEY, event.target.value);
        } catch {
          // Preference only.
        }
      }}
    >
      <option value="all">{t('nav.allStores')}</option>
      {stores.data?.items.map((store) => (
        <option key={store.id} value={store.id}>
          {store.name}
        </option>
      ))}
    </Select>
  );
}

function NavLinks({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const link = (to: '/' | '/users' | '/account', icon: ReactNode, label: string) => (
    <Link
      to={to}
      onClick={onNavigate}
      activeOptions={{ exact: to === '/' }}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 data-[status=active]:bg-indigo-50 data-[status=active]:font-medium data-[status=active]:text-indigo-900"
    >
      {icon}
      {label}
    </Link>
  );
  return (
    <nav className="flex flex-col gap-1" aria-label={t('nav.menu')}>
      {link('/', <Home size={18} />, t('nav.home'))}
      {can(me, 'users.read') ? link('/users', <Users size={18} />, t('nav.users')) : null}
      {link('/account', <UserCog size={18} />, t('nav.account'))}
    </nav>
  );
}

function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    ['Ctrl / ⌘ + K', t('shortcuts.palette')],
    ['?', t('shortcuts.help')],
    ['/', t('shortcuts.search')],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('shortcuts.title')}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([keys, label]) => (
          <div key={keys} className="contents">
            <dt>
              <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs">
                {keys}
              </kbd>
            </dt>
            <dd className="text-slate-700">{label}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

/** Authenticated layout: sidebar (drawer on mobile), header, command palette. */
export function AppShell() {
  const { me } = useRouteContext({ from: '/_app' });
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useHotkey('mod+k', () => {
    setPaletteOpen((open) => !open);
  });
  useHotkey('?', () => {
    setShortcutsOpen(true);
  });

  const logout = async () => {
    await signOut(queryClient);
    await navigate({ to: '/login' });
  };

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-60 shrink-0 border-e border-slate-200 bg-white p-4 md:block">
        <div className="mb-6 px-3 text-sm font-semibold text-indigo-700">{t('app.name')}</div>
        <NavLinks me={me} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={t('nav.menu')}
            onClick={() => {
              setDrawerOpen(true);
            }}
          >
            <Menu size={20} />
          </Button>
          <StoreSwitcher />
          <div className="ms-auto flex items-center gap-2">
            <Select
              aria-label={t('account.language')}
              className="h-9 w-auto"
              value={i18n.language}
              onChange={(event) => {
                if (isLanguage(event.target.value)) void setLanguage(event.target.value);
              }}
            >
              {LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {language.toUpperCase()}
                </option>
              ))}
            </Select>
            <span className="hidden text-sm text-slate-600 sm:inline" data-testid="current-user">
              {me.user.name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('nav.logout')}
              onClick={() => void logout()}
            >
              <LogOut size={18} />
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen} title={t('nav.menu')}>
        <NavLinks
          me={me}
          onNavigate={() => {
            setDrawerOpen(false);
          }}
        />
      </Dialog>
      <CommandPalette
        me={me}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onShowShortcuts={() => {
          setShortcutsOpen(true);
        }}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
