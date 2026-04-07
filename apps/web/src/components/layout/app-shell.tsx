'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type PropsWithChildren, useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/cn';

import { useActiveWorkspace } from '../features/use-active-workspace';
import { useAuth } from '../../app/providers/auth-provider';
import { AppSidebar } from './app-sidebar';
import { PageTransition } from './page-transition';
import { AppTopbar } from './app-topbar';

const SIDEBAR_STORAGE_KEY = 'saas.ui.sidebar-collapsed';

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true');
  }, []);

  const userDisplayName = useMemo(() => {
    if (!user) {
      return '';
    }

    return displayNameFromUser(user.firstName, user.lastName, user.email);
  }, [user]);

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
        />
        <main className="app-frame__content">
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
            onToggleCollapse={() => undefined}
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
    </div>
  );
}
