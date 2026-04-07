'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { type PropsWithChildren, useMemo, useState } from 'react';

import { useAuth } from '../providers/auth-provider';

type NavItem = {
  href: Route;
  label: string;
  badge?: string;
};

const primaryNav: NavItem[] = [
  { href: '/calendar', label: 'Календарь' },
  { href: '/templates', label: 'Спектакли' },
  { href: '/events', label: 'Репетиции / События' },
  { href: '/participants', label: 'Участники' },
  { href: '/points', label: 'Баллы' },
  { href: '/settings', label: 'Настройки' },
];

const initialsFromUser = (
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string,
) => {
  const source = `${firstName ?? ''}${lastName ?? ''}`.trim();

  if (source.length > 0) {
    return source
      .slice(0, 2)
      .toUpperCase();
  }

  return email.slice(0, 2).toUpperCase();
};

const displayNameFromUser = (
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string,
) => {
  const fullName = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return fullName.length > 0 ? fullName : email;
};

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const userDisplayName = useMemo(() => {
    if (!user) {
      return '';
    }

    return displayNameFromUser(user.firstName, user.lastName, user.email);
  }, [user]);

  const userInitials = useMemo(() => {
    if (!user) {
      return '';
    }

    return initialsFromUser(user.firstName, user.lastName, user.email);
  }, [user]);

  const activeOrganizationId = user?.memberships[0]?.organizationId ?? null;
  const activeRole = user?.memberships[0]?.role ?? null;

  const handleLogout = async () => {
    setLoggingOut(true);

    try {
      await logout();
      router.replace('/auth');
    } finally {
      setLoggingOut(false);
      setMenuOpen(false);
    }
  };

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="workspace-brand">
          <div className="workspace-brand-mark">RL</div>
          <div>
            <p>RPGLife SaaS</p>
            <strong>Управление труппой</strong>
          </div>
        </div>

        <section className="workspace-org-card">
          <span className="workspace-section-caption">Текущая организация</span>
          <strong>{activeOrganizationId ? 'Подключена' : 'Не выбрана'}</strong>
          <small>
            {activeOrganizationId
              ? `${activeOrganizationId.slice(0, 8)}...`
              : 'Выбор организации добавим следующим этапом'}
          </small>
        </section>

        <nav className="workspace-nav">
          <span className="workspace-section-caption">Навигация</span>
          {primaryNav.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`workspace-nav-link${isActive ? ' active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span>{item.label}</span>
                {item.badge ? <small>{item.badge}</small> : null}
              </Link>
            );
          })}
        </nav>

        <div className="workspace-sidebar-footer">
          <div className="workspace-user-card">
            <div className="workspace-user-avatar">{userInitials}</div>
            <div>
              <strong>{userDisplayName}</strong>
              <small>{activeRole ?? 'MEMBER'}</small>
            </div>
          </div>

          <button
            type="button"
            className="workspace-logout-button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
          >
            {loggingOut ? 'Выходим...' : 'Выйти'}
          </button>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="workspace-topbar">
          <button
            type="button"
            className="workspace-menu-button"
            onClick={() => setMenuOpen((current) => !current)}
          >
            Меню
          </button>

          <div className="workspace-topbar-meta">
            <span className="workspace-topbar-caption">Роль</span>
            <strong>{activeRole ?? 'MEMBER'}</strong>
          </div>

          <div className="workspace-topbar-user">
            <div className="workspace-user-avatar compact">{userInitials}</div>
            <div>
              <strong>{userDisplayName}</strong>
              <small>{user?.email}</small>
            </div>
          </div>
        </header>

        <main className="workspace-content">{children}</main>
      </div>

      <div className={`workspace-mobile-sheet${menuOpen ? ' open' : ''}`}>
        <div className="workspace-mobile-backdrop" onClick={() => setMenuOpen(false)} />
        <aside className="workspace-mobile-panel">
          <div className="workspace-brand mobile">
            <div className="workspace-brand-mark">RL</div>
            <div>
              <p>RPGLife SaaS</p>
              <strong>Навигация</strong>
            </div>
          </div>

          <nav className="workspace-nav mobile">
            {primaryNav.map((item) => {
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`workspace-nav-link${isActive ? ' active' : ''}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            className="workspace-logout-button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
          >
            {loggingOut ? 'Выходим...' : 'Выйти'}
          </button>
        </aside>
      </div>
    </div>
  );
}

