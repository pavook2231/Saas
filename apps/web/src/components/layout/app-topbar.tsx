import Link from 'next/link';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { roleLabels } from '@/lib/organization-access';

import { MenuIcon } from './nav-icons';

type OrganizationOption = {
  id: string;
  name: string;
  role: string;
};

type AppTopbarProps = {
  onOpenMenu: () => void;
  userName: string;
  userEmail: string;
  userAvatar?: string | null;
  activeRole: string | null;
  organizations: OrganizationOption[];
  organizationsLoading: boolean;
  activeOrganizationId: string | null;
  onOrganizationChange: (organizationId: string) => void;
  compactCalendarMobile?: boolean;
};

export function AppTopbar({
  onOpenMenu,
  userName,
  userEmail,
  userAvatar,
  activeRole,
  organizations,
  organizationsLoading,
  activeOrganizationId,
  onOrganizationChange,
  compactCalendarMobile = false,
}: AppTopbarProps) {
  return (
    <header className={cn('app-topbar', compactCalendarMobile && 'app-topbar--calendar-mobile-compact')}>
      <div className="app-topbar__left">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="app-topbar__menu-button"
          onClick={onOpenMenu}
        >
          <MenuIcon width={18} height={18} />
          <span>Меню</span>
        </Button>

        <div className="app-topbar__title">
          <span>Рабочее пространство</span>
          <strong>Внутренний сервис театра</strong>
        </div>

        <div className="app-topbar__workspace">
          <Select
            aria-label="Активная организация"
            className="app-topbar__org-select"
            value={activeOrganizationId ?? ''}
            onChange={(event) => onOrganizationChange(event.target.value)}
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
        </div>
      </div>

      <div className="app-topbar__right">
        {activeRole ? (
          <Badge variant="neutral">{roleLabels[activeRole as keyof typeof roleLabels] ?? activeRole}</Badge>
        ) : null}
        <Link href="/profile" className="app-topbar__profile">
          <Avatar name={userName} src={userAvatar} size="sm" />
          <div>
            <strong>{userName}</strong>
            <p>{userEmail}</p>
          </div>
        </Link>
      </div>
    </header>
  );
}

