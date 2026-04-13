'use client';

import { EmptyStateCard } from './empty-state-card';
import { CreateOrganizationAction } from './create-organization-action';

export function WorkspaceOrgEmpty() {
  return (
    <div className="workspace-empty-stack">
      <EmptyStateCard
        title="Нет активной организации"
        description="Рабочее пространство ещё не настроено. Создайте первую организацию, и календарь, участники, спектакли и события сразу начнут работать с живыми данными."
      />

      <div className="workspace-empty-actions">
        <CreateOrganizationAction />
      </div>
    </div>
  );
}
