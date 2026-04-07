'use client';

import Link from 'next/link';
import type { Route } from 'next';
import type { ComponentType, SVGProps } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { canAccessControlPanel, roleLabels } from '@/lib/organization-access';

import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DashboardIcon,
  ProfileIcon,
  SettingsIcon,
} from './nav-icons';

type NavItem = {
  href: Route;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

type AppSidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  pathname: string;
  userName: string;
  userEmail: string;
  userAvatar?: string | null;
  activeRole: string | null;
  activeOrganizationId: string | null;
  activeOrganizationName: string | null;
  activeOrganizationSlug: string | null;
  organizationCount: number;
  onNavigate?: () => void;
  onLogout: () => void;
  loggingOut: boolean;
};

const baseNav: NavItem[] = [
  { href: '/dashboard', label: 'Главная', icon: DashboardIcon },
  { href: '/calendar', label: 'Календарь', icon: CalendarIcon },
  { href: '/profile', label: 'Профиль', icon: ProfileIcon },
];

const controlNav: NavItem = {
  href: '/control/schedule',
  label: 'Панель управления',
  icon: SettingsIcon,
};

export function AppSidebar({
  collapsed,
  onToggleCollapse,
  pathname,
  userName,
  userEmail,
  userAvatar,
  activeRole,
  activeOrganizationId,
  activeOrganizationName,
  activeOrganizationSlug,
  organizationCount,
  onNavigate,
  onLogout,
  loggingOut,
}: AppSidebarProps) {
  const visibleNav = [
    ...baseNav,
    ...(activeOrganizationId && canAccessControlPanel(activeRole as never) ? [controlNav] : []),
  ];

  return (
    <aside className={cn('app-sidebar', collapsed && 'is-collapsed')}>
      <div className="app-sidebar__header">
        <div className="app-sidebar__brand">
          <div className="app-sidebar__brand-mark">Т</div>
          {!collapsed ? (
            <div>
              <p>Театр</p>
              <strong>Внутренний сервис</strong>
            </div>
          ) : null}
        </div>

        <Tooltip content={collapsed ? 'Развернуть меню' : 'Свернуть меню'}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="app-sidebar__collapse"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          >
            {collapsed ? (
              <ChevronRightIcon width={16} height={16} />
            ) : (
              <ChevronLeftIcon width={16} height={16} />
            )}
          </Button>
        </Tooltip>
      </div>

      <Card tone="subtle" className="app-sidebar__org-card">
        <div className="app-sidebar__org-copy">
          <span className="app-sidebar__eyebrow">Организация</span>
          {!collapsed ? (
            <>
              <strong>{activeOrganizationName ?? 'Не выбрана'}</strong>
              <p>
                {activeOrganizationId
                  ? `${activeOrganizationSlug ?? activeOrganizationId.slice(0, 8)} · ${organizationCount} орг.`
                  : 'Создайте организацию или примите приглашение в профиле.'}
              </p>
            </>
          ) : null}
        </div>
        {!collapsed && activeRole ? (
          <Badge variant="primary">{roleLabels[activeRole as keyof typeof roleLabels] ?? activeRole}</Badge>
        ) : null}
      </Card>

      <nav className="app-sidebar__nav">
        <span className="app-sidebar__eyebrow">Навигация</span>

        {visibleNav.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;
          const link = (
            <Link
              key={item.href}
              href={item.href}
              className={cn('app-sidebar__link', isActive && 'is-active')}
              onClick={onNavigate}
            >
              <span className="app-sidebar__icon-wrap">
                <Icon width={18} height={18} />
              </span>
              {!collapsed ? <span>{item.label}</span> : null}
            </Link>
          );

          return collapsed ? (
            <Tooltip key={item.href} content={item.label} side="right">
              {link}
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>

      <div className="app-sidebar__footer">
        <Card className="app-sidebar__profile">
          <Avatar name={userName} src={userAvatar} size="md" />
          {!collapsed ? (
            <div>
              <strong>{userName}</strong>
              <p>{userEmail}</p>
            </div>
          ) : null}
        </Card>

        <Button
          type="button"
          variant="ghost"
          size="md"
          fullWidth={!collapsed}
          className="app-sidebar__logout"
          onClick={onLogout}
          loading={loggingOut}
          aria-label="Выйти из аккаунта"
        >
          Выйти
        </Button>
      </div>
    </aside>
  );
}

