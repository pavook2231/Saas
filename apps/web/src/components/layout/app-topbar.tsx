import Link from 'next/link';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

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
}: AppTopbarProps) {
  return (
    <header className="app-topbar">
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
          <span>Активная организация</span>
          <strong>Расписание, состав и постановки в одном потоке</strong>
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
        {activeRole ? <Badge variant="neutral">{activeRole}</Badge> : null}
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
