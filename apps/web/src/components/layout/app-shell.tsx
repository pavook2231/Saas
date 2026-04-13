'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { type PropsWithChildren, useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/cn';
import { canAccessControlPanel } from '@/lib/organization-access';

import { useAuth } from '../../app/providers/auth-provider';
import { useActiveWorkspace } from '../features/use-active-workspace';
import { useMobileViewport } from '../features/use-mobile-viewport';
import { Select } from '../ui/select';
import { AppSidebar } from './app-sidebar';
import { AppTopbar } from './app-topbar';
import { CalendarIcon, EventIcon, ParticipantsIcon, PointsIcon, SettingsIcon } from './nav-icons';
import { MobileShellNav, type MobileShellNavItem } from './mobile-shell-nav';
import { PageTransition } from './page-transition';

const SIDEBAR_STORAGE_KEY = 'saas.ui.sidebar-collapsed';

const displayNameFromUser = (
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string,
) => {
  const fullName = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return fullName.length > 0 ? fullName : email;
};

const mobileShellMeta = (pathname: string) => {
  if (pathname.startsWith('/control/participants')) {
    return { title: 'Участники', eyebrow: 'Мобильный режим' };
  }

  if (pathname.startsWith('/control/plays')) {
    return { title: 'Спектакли', eyebrow: 'Мобильный режим' };
  }

  if (pathname.startsWith('/control/schedule')) {
    return {
      title: 'Планирование',
      eyebrow: 'Мобильный режим',
      actionHref: '/control/plays' as Route,
      actionLabel: 'Спектакли',
    };
  }

  if (pathname.startsWith('/points')) {
    return { title: 'Баллы', eyebrow: 'Мобильный режим' };
  }

  if (pathname.startsWith('/profile')) {
    return { title: 'Ещё', eyebrow: 'Профиль и настройки' };
  }

  return { title: 'Расписание', eyebrow: 'Мобильный режим' };
};

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const {
    organizations,
    organizationsLoading,
    activeOrganization,
    activeOrganizationId,
    activeRole,
    setActiveOrganizationId,
  } = useActiveWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const isMobileViewport = useMobileViewport();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true');
  }, []);

  useEffect(() => {
    const isControlRoute = pathname === '/control' || pathname.startsWith('/control/');
    const isLegacyManagementRoute =
      pathname.startsWith('/templates') ||
      pathname.startsWith('/participants') ||
      pathname.startsWith('/settings') ||
      pathname.startsWith('/points') ||
      pathname.startsWith('/events');

    if (isControlRoute && (!activeOrganizationId || !canAccessControlPanel(activeRole as never))) {
      router.replace('/calendar');
      return;
    }

    if (!isLegacyManagementRoute) {
      return;
    }

    if (!activeOrganizationId || !canAccessControlPanel(activeRole as never)) {
      router.replace('/calendar');
      return;
    }

    if (pathname.startsWith('/templates')) {
      router.replace('/control/plays');
      return;
    }

    if (pathname.startsWith('/participants')) {
      router.replace('/control/participants');
      return;
    }

    if (pathname.startsWith('/events')) {
      router.replace('/control/schedule');
      return;
    }

    router.replace('/profile');
  }, [activeOrganizationId, activeRole, pathname, router]);

  const userDisplayName = useMemo(() => {
    if (!user) {
      return '';
    }

    return displayNameFromUser(user.firstName, user.lastName, user.email);
  }, [user]);

  const shellMeta = useMemo(() => mobileShellMeta(pathname), [pathname]);
  const hasControlAccess = Boolean(
    activeOrganizationId && canAccessControlPanel(activeRole as never),
  );
  const mobileNavItems = useMemo<MobileShellNavItem[]>(() => {
    const items: MobileShellNavItem[] = [{ href: '/calendar', label: 'Календарь', icon: CalendarIcon }];

    if (hasControlAccess) {
      items.push(
        { href: '/control/plays', label: 'Спектакли', icon: EventIcon },
        { href: '/control/participants', label: 'Люди', icon: ParticipantsIcon },
      );
    }

    items.push(
      { href: '/points', label: 'Баллы', icon: PointsIcon },
      { href: '/profile', label: 'Ещё', icon: SettingsIcon },
    );

    return items;
  }, [hasControlAccess]);

  const handleToggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      }

      return next;
    });
  };

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
    <div className={cn('app-frame', sidebarCollapsed && 'sidebar-collapsed')}>
      <AppSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        collapseButtonMode="toggle"
        pathname={pathname}
        userName={userDisplayName}
        userEmail={user?.email ?? ''}
        userAvatar={user?.avatarUrl}
        activeRole={activeRole}
        activeOrganizationId={activeOrganizationId}
        activeOrganizationName={activeOrganization?.name ?? null}
        activeOrganizationSlug={activeOrganization?.slug ?? null}
        organizationCount={organizations.length}
        onNavigate={() => setMenuOpen(false)}
        onLogout={() => void handleLogout()}
        loggingOut={loggingOut}
      />

      <div className="app-frame__main">
        {isMobileViewport ? (
          <header className="mobile-app-header">
            <div className="mobile-app-header__main">
              <div className="mobile-app-header__copy">
                <span>{shellMeta.eyebrow}</span>
                <strong>{shellMeta.title}</strong>
              </div>
              {shellMeta.actionHref && shellMeta.actionLabel ? (
                <Link className="mobile-app-header__action" href={shellMeta.actionHref}>
                  {shellMeta.actionLabel}
                </Link>
              ) : null}
            </div>
            <Select
              aria-label="Активная организация"
              className="mobile-app-header__org-select"
              value={activeOrganizationId ?? ''}
              onChange={(event) => setActiveOrganizationId(event.target.value)}
              disabled={organizationsLoading || organizations.length === 0}
            >
              {organizations.length === 0 ? (
                <option value="">
                  {organizationsLoading ? 'Загружаем организации...' : 'Организация не выбрана'}
                </option>
              ) : (
                organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))
              )}
            </Select>
          </header>
        ) : (
          <AppTopbar
            onOpenMenu={() => setMenuOpen(true)}
            userName={userDisplayName}
            userEmail={user?.email ?? ''}
            userAvatar={user?.avatarUrl}
            activeRole={activeRole}
            organizations={organizations.map((organization) => ({
              id: organization.id,
              name: organization.name,
              role: organization.role,
            }))}
            organizationsLoading={organizationsLoading}
            activeOrganizationId={activeOrganizationId}
            onOrganizationChange={setActiveOrganizationId}
            compactCalendarMobile={pathname === '/calendar'}
          />
        )}
        <main className={cn('app-frame__content', isMobileViewport && 'app-frame__content--mobile')}>
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      <div className={cn('app-mobile-sidebar', menuOpen && 'is-open')}>
        <button
          type="button"
          className="app-mobile-sidebar__backdrop"
          aria-label="Закрыть меню"
          onClick={() => setMenuOpen(false)}
        />
        <div className="app-mobile-sidebar__panel">
          <AppSidebar
            collapsed={false}
            onToggleCollapse={() => setMenuOpen(false)}
            collapseButtonMode="close"
            pathname={pathname}
            userName={userDisplayName}
            userEmail={user?.email ?? ''}
            userAvatar={user?.avatarUrl}
            activeRole={activeRole}
            activeOrganizationId={activeOrganizationId}
            activeOrganizationName={activeOrganization?.name ?? null}
            activeOrganizationSlug={activeOrganization?.slug ?? null}
            organizationCount={organizations.length}
            onNavigate={() => setMenuOpen(false)}
            onLogout={() => void handleLogout()}
            loggingOut={loggingOut}
          />
        </div>
      </div>

      {isMobileViewport ? <MobileShellNav items={mobileNavItems} pathname={pathname} /> : null}
    </div>
  );
}
