'use client';

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  organizationsApi,
  type OrganizationSummary,
} from '@/app/lib/api/organizations';

import { useAuth } from './auth-provider';

type WorkspaceContextValue = {
  organizations: OrganizationSummary[];
  organizationsLoading: boolean;
  activeOrganization: OrganizationSummary | null;
  activeOrganizationId: string | null;
  activeRole: OrganizationSummary['role'] | null;
  setActiveOrganizationId: (organizationId: string) => void;
  refreshOrganizations: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const getStorageKey = (userId: string) => `saas.active-organization-id.${userId}`;

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const { accessToken, status, user } = useAuth();
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [activeOrganizationId, setActiveOrganizationIdState] = useState<string | null>(null);

  const resolveAndSetActiveOrganization = useCallback(
    (items: OrganizationSummary[]) => {
      if (!user || typeof window === 'undefined') {
        setActiveOrganizationIdState(items[0]?.id ?? null);
        return;
      }

      const savedId = window.localStorage.getItem(getStorageKey(user.id));
      const preferredId = [activeOrganizationId, savedId].find(
        (candidate) => candidate && items.some((item) => item.id === candidate),
      );

      setActiveOrganizationIdState(preferredId ?? items[0]?.id ?? null);
    },
    [activeOrganizationId, user],
  );

  const refreshOrganizations = useCallback(async () => {
    if (!accessToken || status !== 'authenticated') {
      setOrganizations([]);
      setActiveOrganizationIdState(null);
      setOrganizationsLoading(false);
      return;
    }

    setOrganizationsLoading(true);

    try {
      const response = await organizationsApi.listMyOrganizations({
        accessToken,
      });

      setOrganizations(response);
      resolveAndSetActiveOrganization(response);
    } catch {
      setOrganizations([]);
      setActiveOrganizationIdState(null);
    } finally {
      setOrganizationsLoading(false);
    }
  }, [accessToken, resolveAndSetActiveOrganization, status]);

  useEffect(() => {
    if (status !== 'authenticated' || !accessToken) {
      setOrganizations([]);
      setActiveOrganizationIdState(null);
      return;
    }

    void refreshOrganizations();
  }, [accessToken, refreshOrganizations, status]);

  useEffect(() => {
    if (!user || typeof window === 'undefined') {
      return;
    }

    if (!activeOrganizationId) {
      window.localStorage.removeItem(getStorageKey(user.id));
      return;
    }

    window.localStorage.setItem(getStorageKey(user.id), activeOrganizationId);
  }, [activeOrganizationId, user]);

  const setActiveOrganizationId = useCallback((organizationId: string) => {
    setActiveOrganizationIdState(organizationId);
  }, []);

  const activeOrganization = useMemo(
    () =>
      activeOrganizationId
        ? organizations.find((item) => item.id === activeOrganizationId) ?? null
        : null,
    [activeOrganizationId, organizations],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      organizations,
      organizationsLoading,
      activeOrganization,
      activeOrganizationId: activeOrganization?.id ?? null,
      activeRole: activeOrganization?.role ?? null,
      setActiveOrganizationId,
      refreshOrganizations,
    }),
    [
      activeOrganization,
      organizations,
      organizationsLoading,
      refreshOrganizations,
      setActiveOrganizationId,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export const useWorkspace = (): WorkspaceContextValue => {
  const context = useContext(WorkspaceContext);

  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }

  return context;
};
