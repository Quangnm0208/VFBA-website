import { DashboardIcon } from '@sanity/icons/Dashboard';
import { UsersIcon } from '@sanity/icons/Users';
import { CogIcon } from '@sanity/icons/Cog';
import { useMemo } from 'react';
import { useClient, type Tool } from 'sanity';
import { useRouter } from 'sanity/router';
import { createApi } from './api';
import { Gate } from './Gate';
import { LeadsApp } from './LeadsApp';
import { OverviewApp, type Navigate } from './OverviewApp';
import { StaffApp } from './StaffApp';

/**
 * Studio tools of the Admin Portal. The Studio runs with `auth.loginMethod: 'token'` (sanity.config.ts), so its own client carries
 * the person's Sanity session token; the portal API receives that token and asks Sanity who owns it.
 */
function useApi() {
  const client = useClient({ apiVersion: '2025-02-19' });
  // The token is read at call time, so a renewed session is picked up without a reload.
  return useMemo(() => createApi(() => client.config().token), [client]);
}

function useGo(): Navigate {
  const router = useRouter();
  return (path) => {
    try {
      router.navigateUrl({ path });
    } catch {
      window.location.assign(path);
    }
  };
}

function OverviewTool() {
  const api = useApi();
  const go = useGo();
  return <Gate api={api} title="">{(me) => <OverviewApp api={api} me={me} go={go} />}</Gate>;
}
function LeadsTool() {
  const api = useApi();
  return <Gate api={api} title="">{(me) => <LeadsApp api={api} me={me} />}</Gate>;
}
function StaffTool() {
  const api = useApi();
  return <Gate api={api} title="">{(me) => <StaffApp api={api} me={me} />}</Gate>;
}

export const overviewTool: Tool = { name: 'overview', title: 'Tổng quan', icon: DashboardIcon, component: OverviewTool };
export const leadsTool: Tool = { name: 'leads', title: 'Quản lý Lead', icon: UsersIcon, component: LeadsTool };
export const staffTool: Tool = { name: 'staff', title: 'Quản trị nhân sự', icon: CogIcon, component: StaffTool };
