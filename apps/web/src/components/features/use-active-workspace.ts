'use client';

import { useMemo } from 'react';

import { useAuth } from '@/app/providers/auth-provider';
import { useWorkspace } from '@/app/providers/workspace-provider';

export function useActiveWorkspace() {
  const { accessToken, user } = useAuth();
  const {
    organizations,
    organizationsLoading,
    activeOrganization,
    activeOrganizationId,
    activeRole,
    setActiveOrganizationId,
    refreshOrganizations,
  } = useWorkspace();

  return useMemo(() => {
    const activeMembership =
      activeOrganizationId
        ? user?.memberships.find(
            (membership) => membership.organizationId === activeOrganizationId,
          ) ?? null
        : null;

    return {
      accessToken,
      organizations,
      organizationsLoading,
      activeOrganization,
      activeMembership,
      activeOrganizationId,
      activeRole: activeRole ?? activeMembership?.role ?? null,
      setActiveOrganizationId,
      refreshOrganizations,
      user,
    };
  }, [
    accessToken,
    activeOrganization,
    activeOrganizationId,
    activeRole,
    organizations,
    organizationsLoading,
    refreshOrganizations,
    setActiveOrganizationId,
    user,
  ]);
}
