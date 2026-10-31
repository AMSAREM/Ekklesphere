// src/components/creator/CreatorsPanel.tsx
// Ekklesphere Creator Console (/console) - Production Multi-Tenant Platform Management
// Real-time server-backed dashboard, fail-closed licensing, audited support grants, and Act 843 governance.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  Sliders,
  Building2,
  Key,
  Globe2,
  ShieldCheck,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Edit3,
  ExternalLink,
  Save,
  Radio,
  Download,
  Users,
  Database,
  ArrowLeft,
  X,
  Copy,
  Layers,
  Sparkles,
  Lock,
  RefreshCw,
  DollarSign,
  Calendar,
  Clock,
  Eye,
  AlertCircle,
  FileText,
  Check,
  ChevronRight,
  Activity,
  Smartphone,
  Server,
  Bell,
  Flag,
  Share2,
} from 'lucide-react';
import type {
  ConsoleAlert,
  ConsoleDashboardSummary,
  ConsolePlan,
  DataPrivacyRequest,
  LandingPageConfig,
  LicensePaymentRecord,
  LicenseStatus,
  LicenseTier,
  OrganisationDetailPayload,
  PlatformAnnouncement,
  PlatformFeatureFlag,
  SupportGrantSession,
  SystemLicense,
  TenantChurch,
  UsageDailyAggregate,
} from '../../types/ekklesphere';

export const CreatorsPanel: React.FC = () => {
  const { currentUser, setViewMode, showToast } = useEkklesphere();

  // Authentication Guard
  const isAuthorized =
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'creator' ||
    Boolean(currentUser?.is_creator);

  // Active Console Navigation Tab
  type ConsoleTab =
    | 'dashboard'
    | 'organisations'
    | 'licenses'
    | 'plans'
    | 'usage'
    | 'alerts'
    | 'announcements'
    | 'feature_flags'
    | 'data_requests'
    | 'audit_log'
    | 'landing_cms';

  const [activeTab, setActiveTab] = useState<ConsoleTab>('dashboard');

  // Loading & Error States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Core Data States from /api/console/*
  const [summary, setSummary] = useState<ConsoleDashboardSummary | null>(null);
  const [organisations, setOrganisations] = useState<TenantChurch[]>([]);
  const [licenses, setLicenses] = useState<SystemLicense[]>([]);
  const [plans, setPlans] = useState<ConsolePlan[]>([]);
  const [usageDaily, setUsageDaily] = useState<UsageDailyAggregate[]>([]);
  const [alerts, setAlerts] = useState<ConsoleAlert[]>([]);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [featureFlags, setFeatureFlags] = useState<PlatformFeatureFlag[]>([]);
  const [dataRequests, setDataRequests] = useState<DataPrivacyRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [landingCms, setLandingCms] = useState<LandingPageConfig | null>(null);
  const [activeSupportGrant, setActiveSupportGrant] = useState<SupportGrantSession | null>(null);

  // Selected Organisation 6-Tab Workspace
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedOrgDetail, setSelectedOrgDetail] = useState<OrganisationDetailPayload | null>(null);
  const [orgWorkspaceTab, setOrgWorkspaceTab] = useState<
    'overview' | 'license' | 'usage' | 'users' | 'sites' | 'audit'
  >('overview');
  const [loadingOrgDetail, setLoadingOrgDetail] = useState<boolean>(false);

  // Filter States
  const [orgSearch, setOrgSearch] = useState<string>('');
  const [orgStatusFilter, setOrgStatusFilter] = useState<string>('all');
  const [orgTierFilter, setOrgTierFilter] = useState<string>('all');
  const [licenseSearch, setLicenseSearch] = useState<string>('');
  const [licenseStatusFilter, setLicenseStatusFilter] = useState<string>('all');

  // Modals & Drawers
  const [isProvisionOrgOpen, setIsProvisionOrgOpen] = useState<boolean>(false);
  const [isIssueLicenseOpen, setIsIssueLicenseOpen] = useState<boolean>(false);
  const [isPaymentDrawerOpen, setIsPaymentDrawerOpen] = useState<boolean>(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState<boolean>(false);
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState<boolean>(false);
  const [isLicenseActionOpen, setIsLicenseActionOpen] = useState<boolean>(false);
  const [targetLicenseForAction, setTargetLicenseForAction] = useState<SystemLicense | null>(null);

  // Forms State
  const [newOrgForm, setNewOrgForm] = useState({
    name: '',
    slug: '',
    orgType: 'church' as 'church' | 'organisation',
    city: 'Accra',
    country: 'Ghana',
    seniorPastor: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '+233 ',
    initialPlan: 'grace_starter' as LicenseTier,
    autoIssueTrial: true,
  });

  const [paymentForm, setPaymentForm] = useState({
    licenseId: '',
    organizationId: '',
    amount: 1200,
    currency: 'GHS' as 'GHS' | 'USD',
    method: 'momo' as 'momo' | 'bank' | 'cash',
    reference: '',
    notes: '',
  });

  const [supportGrantForm, setSupportGrantForm] = useState({
    organizationId: '',
    reason: '',
    durationMinutes: 30,
  });

  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    body: '',
    severity: 'info' as 'info' | 'warning' | 'critical',
    targetTiers: [] as LicenseTier[],
    expiresInDays: 7,
  });

  const [licenseActionForm, setLicenseActionForm] = useState({
    action: 'renew' as 'renew' | 'upgrade' | 'downgrade' | 'start_trial' | 'suspend' | 'reactivate' | 'revoke',
    targetTier: 'ministry_pro' as LicenseTier,
    durationMonths: 12,
    reason: '',
  });

  // Auth header helper
  const getConsoleHeaders = useCallback(() => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [currentUser]);

  // Fetch all console data from server
  const loadConsoleData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setApiError(null);

    const headers = getConsoleHeaders();

    try {
      const [
        dashRes,
        orgsRes,
        licsRes,
        plansRes,
        usageRes,
        alertsRes,
        annRes,
        ffRes,
        drRes,
        auditRes,
        cmsRes,
        grantsRes,
      ] = await Promise.all([
        fetch('/api/console/dashboard', { headers }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/console/organisations', { headers }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/console/licenses', { headers }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/console/plans', { headers }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/console/usage?days=30', { headers }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/console/alerts', { headers }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/console/announcements', { headers }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/console/feature-flags', { headers }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/console/data-requests', { headers }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/console/audit-log?limit=50', { headers }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/console/landing-cms', { headers }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/console/support-grants', { headers }).then((r) => (r.ok ? r.json() : null)),
      ]);

      if (dashRes) setSummary(dashRes);
      if (orgsRes?.organisations) setOrganisations(orgsRes.organisations);
      if (licsRes?.licenses) setLicenses(licsRes.licenses);
      if (plansRes?.plans) setPlans(plansRes.plans);
      if (usageRes?.usage) setUsageDaily(usageRes.usage);
      if (alertsRes?.alerts) setAlerts(alertsRes.alerts);
      if (annRes?.announcements) setAnnouncements(annRes.announcements);
      if (ffRes?.featureFlags) setFeatureFlags(ffRes.featureFlags);
      if (drRes?.dataRequests) setDataRequests(drRes.dataRequests);
      if (auditRes?.auditLogs) setAuditLogs(auditRes.auditLogs);
      if (cmsRes?.landingConfig) setLandingCms(cmsRes.landingConfig);

      if (grantsRes?.supportGrants) {
        const active = grantsRes.supportGrants.find((g: SupportGrantSession) => g.active);
        setActiveSupportGrant(active || null);
      }
    } catch (err: any) {
      console.error('[Console] Data fetch failed:', err);
      setApiError(err?.message || 'Failed to load platform console state from server.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getConsoleHeaders]);

  useEffect(() => {
    if (isAuthorized) {
      loadConsoleData();
    }
  }, [isAuthorized, loadConsoleData]);

  // Load selected organisation detail (6-tab payload)
  const loadOrgDetail = useCallback(async (orgId: string) => {
    setLoadingOrgDetail(true);
    setSelectedOrgId(orgId);
    try {
      const res = await fetch(`/api/console/organisations/${orgId}`, {
        headers: getConsoleHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedOrgDetail(data);
      } else {
        showToast('Could not load organisation detail.');
      }
    } catch {
      showToast('Network error loading organisation detail.');
    } finally {
      setLoadingOrgDetail(false);
    }
  }, [getConsoleHeaders, showToast]);

  // Trigger Nightly Rollup
  const triggerManualRollup = async () => {
    try {
      const res = await fetch('/api/console/cron/rollup', {
        method: 'POST',
        headers: getConsoleHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Rollup complete: Processed ${data.processedOrganizations} orgs, ${data.totalCheckins} checkins.`);
        loadConsoleData(true);
      } else {
        showToast(data?.message || 'Rollup failed.');
      }
    } catch {
      showToast('Network error triggering rollup.');
    }
  };

  // Create Organisation handler
  const handleProvisionOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgForm.name.trim()) {
      showToast('Organisation name is required.');
      return;
    }

    try {
      const res = await fetch('/api/console/organisations', {
        method: 'POST',
        headers: getConsoleHeaders(),
        body: JSON.stringify(newOrgForm),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Organisation "${data.organisation.name}" provisioned with 14-day trial!`);
        setIsProvisionOrgOpen(false);
        setNewOrgForm({
          name: '',
          slug: '',
          orgType: 'church',
          city: 'Accra',
          country: 'Ghana',
          seniorPastor: '',
          contactName: '',
          contactEmail: '',
          contactPhone: '+233 ',
          initialPlan: 'grace_starter',
          autoIssueTrial: true,
        });
        loadConsoleData(true);
      } else {
        showToast(data?.message || 'Failed to provision organisation.');
      }
    } catch {
      showToast('Network error provisioning organisation.');
    }
  };

  // License Action Handler (Renew, Upgrade, Suspend, Revoke)
  const handleLicenseAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetLicenseForAction) return;

    try {
      const res = await fetch(`/api/console/licenses/${targetLicenseForAction.id}/action`, {
        method: 'POST',
        headers: getConsoleHeaders(),
        body: JSON.stringify({
          action: licenseActionForm.action,
          targetTier: licenseActionForm.targetTier,
          durationMonths: licenseActionForm.durationMonths,
          reason: licenseActionForm.reason || 'Admin console action',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`License updated: ${licenseActionForm.action.toUpperCase()} complete.`);
        setIsLicenseActionOpen(false);
        setTargetLicenseForAction(null);
        loadConsoleData(true);
        if (selectedOrgId) loadOrgDetail(selectedOrgId);
      } else {
        showToast(data?.message || 'License action failed.');
      }
    } catch {
      showToast('Network error updating license.');
    }
  };

  // Record Manual Payment Handler
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.reference.trim() || paymentForm.amount <= 0) {
      showToast('Valid reference and positive amount required.');
      return;
    }

    const licenseId = paymentForm.licenseId || (licenses[0]?.id ?? '');
    try {
      const res = await fetch(`/api/console/licenses/${licenseId}/payments`, {
        method: 'POST',
        headers: getConsoleHeaders(),
        body: JSON.stringify({
          amount: Number(paymentForm.amount),
          currency: paymentForm.currency,
          method: paymentForm.method,
          reference: paymentForm.reference.trim(),
          notes: paymentForm.notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Payment recorded: ${paymentForm.currency} ${paymentForm.amount} via ${paymentForm.method.toUpperCase()}`);
        setIsPaymentDrawerOpen(false);
        setPaymentForm({
          licenseId: '',
          organizationId: '',
          amount: 1200,
          currency: 'GHS',
          method: 'momo',
          reference: '',
          notes: '',
        });
        loadConsoleData(true);
        if (selectedOrgId) loadOrgDetail(selectedOrgId);
      } else {
        showToast(data?.message || 'Failed to record payment.');
      }
    } catch {
      showToast('Network error recording payment.');
    }
  };

  // Audited Support Access ("View as Organisation Admin")
  const handleCreateSupportGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportGrantForm.reason.trim() || supportGrantForm.reason.trim().length < 10) {
      showToast('A clear audit reason (min 10 characters) is required for support access.');
      return;
    }

    try {
      const res = await fetch('/api/console/support-grants', {
        method: 'POST',
        headers: getConsoleHeaders(),
        body: JSON.stringify(supportGrantForm),
      });
      const data = await res.json();
      if (res.ok) {
        setActiveSupportGrant(data.supportGrant);
        setIsSupportModalOpen(false);
        showToast(`Support grant active for ${data.supportGrant.organizationName}. Read-only access enabled.`);
      } else {
        showToast(data?.message || 'Could not grant support access.');
      }
    } catch {
      showToast('Network error granting support access.');
    }
  };

  const handleRevokeSupportGrant = async () => {
    if (!activeSupportGrant) return;
    try {
      const res = await fetch(`/api/console/support-grants/${activeSupportGrant.id}/revoke`, {
        method: 'POST',
        headers: getConsoleHeaders(),
      });
      if (res.ok) {
        setActiveSupportGrant(null);
        showToast('Support session revoked. Read-only mode exited.');
      }
    } catch {
      showToast('Error revoking support session.');
    }
  };

  // Alert Action (Acknowledge / Resolve)
  const handleAlertStatus = async (alertId: string, status: 'acknowledged' | 'resolved') => {
    try {
      const res = await fetch(`/api/console/alerts/${alertId}`, {
        method: 'PATCH',
        headers: getConsoleHeaders(),
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        showToast(`Alert marked as ${status}.`);
        loadConsoleData(true);
      }
    } catch {
      showToast('Error updating alert.');
    }
  };

  // Announcement Broadcast Handler
  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementForm.title.trim() || !announcementForm.body.trim()) {
      showToast('Title and body are required.');
      return;
    }

    try {
      const res = await fetch('/api/console/announcements', {
        method: 'POST',
        headers: getConsoleHeaders(),
        body: JSON.stringify(announcementForm),
      });
      if (res.ok) {
        showToast('Platform announcement broadcasted!');
        setIsAnnouncementModalOpen(false);
        setAnnouncementForm({
          title: '',
          body: '',
          severity: 'info',
          targetTiers: [],
          expiresInDays: 7,
        });
        loadConsoleData(true);
      } else {
        showToast('Failed to broadcast announcement.');
      }
    } catch {
      showToast('Network error broadcasting announcement.');
    }
  };

  // Feature Flag Toggle
  const handleToggleFeatureFlag = async (key: string, enabledGlobally: boolean) => {
    try {
      const res = await fetch(`/api/console/feature-flags/${key}`, {
        method: 'PATCH',
        headers: getConsoleHeaders(),
        body: JSON.stringify({ enabledGlobally }),
      });
      if (res.ok) {
        showToast(`Flag "${key}" updated.`);
        loadConsoleData(true);
      }
    } catch {
      showToast('Error toggling feature flag.');
    }
  };

  // Data Privacy Request Status Handler
  const handleUpdateDataRequest = async (id: string, status: 'in_progress' | 'completed' | 'rejected') => {
    try {
      const res = await fetch(`/api/console/data-requests/${id}`, {
        method: 'PATCH',
        headers: getConsoleHeaders(),
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        showToast(`Data request updated to ${status}.`);
        loadConsoleData(true);
      }
    } catch {
      showToast('Error updating request.');
    }
  };

  // Landing CMS Save Handler
  const handleSaveLandingCms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!landingCms) return;
    try {
      const res = await fetch('/api/console/landing-cms', {
        method: 'PUT',
        headers: getConsoleHeaders(),
        body: JSON.stringify(landingCms),
      });
      if (res.ok) {
        showToast('Landing page CMS saved to Supabase Postgres!');
      } else {
        showToast('Failed to save CMS settings.');
      }
    } catch {
      showToast('Error saving landing CMS.');
    }
  };

  // Filtered lists
  const filteredOrganisations = useMemo(() => {
    return organisations.filter((org) => {
      const q = orgSearch.trim().toLowerCase();
      const matchSearch =
        !q ||
        org.name.toLowerCase().includes(q) ||
        org.slug.toLowerCase().includes(q) ||
        (org.seniorPastor && org.seniorPastor.toLowerCase().includes(q)) ||
        (org.city && org.city.toLowerCase().includes(q));
      const matchStatus = orgStatusFilter === 'all' || org.status === orgStatusFilter;
      const matchTier = orgTierFilter === 'all' || org.licenseTier === orgTierFilter;
      return matchSearch && matchStatus && matchTier;
    });
  }, [organisations, orgSearch, orgStatusFilter, orgTierFilter]);

  const filteredLicenses = useMemo(() => {
    return licenses.filter((lic) => {
      const q = licenseSearch.trim().toLowerCase();
      const matchSearch =
        !q ||
        lic.key.toLowerCase().includes(q) ||
        (lic.tenantName && lic.tenantName.toLowerCase().includes(q)) ||
        lic.tier.toLowerCase().includes(q);
      const matchStatus = licenseStatusFilter === 'all' || lic.status === licenseStatusFilter;
      return matchSearch && matchStatus;
    });
  }, [licenses, licenseSearch, licenseStatusFilter]);

  // Non-creator fallback view
  if (!isAuthorized) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#0D0D22] text-[#F2F2FA] p-6">
        <div className="max-w-md w-full bg-[#181838] p-8 rounded-3xl border border-rose-500/30 text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-400 mx-auto flex items-center justify-center font-bold text-2xl">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold">Creator Access Restricted</h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Multi-tenant licensing, commercial ledger, telemetry aggregates, and platform governance require verified{' '}
            <strong>app_metadata.creator === true</strong> credentials.
          </p>
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs">
            Current Account Role: <span className="font-bold text-amber-400">{currentUser?.role || 'Guest'}</span>
          </div>
          <button
            onClick={() => setViewMode('app')}
            className="w-full py-2.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Return to Church Application
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#E6E7F0] dark:bg-[#0D0D22] text-[#1D1B3A] dark:text-[#F2F2FA] transition-colors duration-200">
      {/* 1. PERSISTENT AUDITED SUPPORT ACCESS BANNER ("View as Organisation Admin") */}
      {activeSupportGrant && (
        <aside
          aria-label="Active Support Grant Mode"
          className="sticky top-0 z-50 w-full bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold shadow-md flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-950 shrink-0" />
            <span>
              READ-ONLY SUPPORT SESSION ACTIVE: <strong>{activeSupportGrant.organizationName}</strong> · Grant ID:{' '}
              <code className="bg-amber-600/30 px-1 py-0.5 rounded font-mono text-[11px]">{activeSupportGrant.id.slice(0, 8)}</code>
              {' · '}Expires {new Date(activeSupportGrant.expiresAt).toLocaleTimeString()} · All mutations blocked.
            </span>
          </div>
          <button
            onClick={handleRevokeSupportGrant}
            className="px-3 py-1 rounded-lg bg-slate-950 text-white font-bold hover:bg-slate-900 transition-colors text-[11px] cursor-pointer"
          >
            Exit Support View
          </button>
        </aside>
      )}

      {/* 2. CONSOLE TOP HEADER */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-[#151532]/90 backdrop-blur-md border-b border-[#D8DAE8] dark:border-[#202046] px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setViewMode('landing')}
            className="p-2 rounded-xl text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title="Return to Public Landing Page"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#6D5CF2] to-[#4F46E5] text-white flex items-center justify-center font-black shadow-md shadow-[#6D5CF2]/25">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base sm:text-lg text-[#1D1B3A] dark:text-white tracking-tight">
                  Ekklesphere Creator Console
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-extrabold uppercase tracking-wider border border-emerald-500/20">
                  Supabase Verified
                </span>
              </div>
              <span className="text-[11px] text-[#666A86] dark:text-[#8D92B5]">
                Multi-Tenant Licensing, ARR Ledger & Governance Radar
              </span>
            </div>
          </div>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={triggerManualRollup}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Execute Usage Rollup Cron"
          >
            <RotateCw className={`w-3.5 h-3.5 text-[#6D5CF2] ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Run Rollup</span>
          </button>

          <a
            href="/api/console/audit-log/export.csv"
            download="ekklesphere-audit-log.csv"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#666A86]" />
            <span>Audit CSV</span>
          </a>

          <button
            onClick={() => setViewMode('landing')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#EFEDFF] dark:bg-[#1E1C38] text-[#6D5CF2] dark:text-[#A594FD] hover:bg-[#E3E0FF] transition-all cursor-pointer"
          >
            <Globe2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Landing Page</span>
          </button>

          <button
            onClick={() => setViewMode('app')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#6D5CF2] hover:bg-[#5b4be0] text-white shadow-md shadow-[#6D5CF2]/25 transition-all cursor-pointer"
          >
            <span>Launch Church App</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 3. NAVIGATION RAIL & TABS */}
      <nav aria-label="Console Modules" className="bg-white dark:bg-[#151532] border-b border-[#D8DAE8] dark:border-[#202046] px-4 sm:px-6 lg:px-8 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 min-w-max py-2">
          {(
            [
              { id: 'dashboard', label: 'Executive Dashboard', icon: Activity },
              { id: 'organisations', label: 'Organisations', icon: Building2, count: organisations.length },
              { id: 'licenses', label: 'Licenses & Payments', icon: Key, count: licenses.length },
              { id: 'plans', label: 'Plans Catalog', icon: Layers },
              { id: 'usage', label: 'Usage Aggregates', icon: Smartphone },
              { id: 'alerts', label: 'Alerts Triage', icon: Bell, count: summary?.openAlertsCount || alerts.filter((a) => a.status === 'open').length },
              { id: 'announcements', label: 'Announcements', icon: Radio },
              { id: 'feature_flags', label: 'Feature Flags', icon: Flag },
              { id: 'data_requests', label: 'Data Requests (Act 843)', icon: FileText, count: dataRequests.filter((d) => d.status === 'pending').length },
              { id: 'audit_log', label: 'Audit Trail', icon: ShieldCheck },
              { id: 'landing_cms', label: 'Landing Page CMS', icon: Globe2 },
            ] as Array<{ id: ConsoleTab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }>
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id !== 'organisations') setSelectedOrgId(null);
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#6D5CF2] text-white shadow-md shadow-[#6D5CF2]/20'
                    : 'text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* API Error Notification */}
      {apiError && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{apiError}</span>
            </div>
            <button
              onClick={() => loadConsoleData(true)}
              className="px-2.5 py-1 rounded-lg bg-rose-500 text-white text-[11px] hover:bg-rose-600"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {loading ? (
          <div className="p-16 text-center space-y-3">
            <RotateCw className="w-8 h-8 animate-spin text-[#6D5CF2] mx-auto" />
            <p className="text-xs text-[#666A86] font-bold">Connecting to Supabase Platform Engine...</p>
          </div>
        ) : (
          <>
            {/* TAB 1: EXECUTIVE DASHBOARD */}
            {activeTab === 'dashboard' && summary && (
              <div className="space-y-6">
                {/* High-Signal KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
                  <div className="p-4 rounded-2xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs">
                    <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8]">
                      <span className="font-semibold">Organisations</span>
                      <Building2 className="w-4 h-4 text-[#6D5CF2]" />
                    </div>
                    <div className="mt-2 text-2xl font-black">
                      {summary.organisationsByStatus.active + summary.organisationsByStatus.trial}
                    </div>
                    <div className="text-[11px] text-[#666A86] mt-0.5">
                      {summary.organisationsByStatus.active} active · {summary.organisationsByStatus.trial} trial
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs">
                    <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8]">
                      <span className="font-semibold">Normalized ARR</span>
                      <DollarSign className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="mt-2 text-2xl font-black font-mono">
                      ${summary.annualRunRateUSD.toLocaleString()}
                    </div>
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
                      USD Normalized Run-Rate
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs">
                    <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8]">
                      <span className="font-semibold">Manual Ledger</span>
                      <span className="text-[11px] font-mono text-indigo-500">GHS / USD</span>
                    </div>
                    <div className="mt-2 text-2xl font-black font-mono">
                      ₵{summary.paymentsTotalGHS.toLocaleString()}
                    </div>
                    <div className="text-[11px] text-[#666A86] mt-0.5">
                      + ${summary.paymentsTotalUSD.toLocaleString()} USD collected
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs">
                    <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8]">
                      <span className="font-semibold">Renewals Watch</span>
                      <Clock className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="mt-2 text-2xl font-black font-mono text-amber-500">
                      {summary.expiringIn30Days.length}
                    </div>
                    <div className="text-[11px] text-[#666A86] mt-0.5">
                      {summary.expiringIn7Days.length} critical in 7 days
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs">
                    <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8]">
                      <span className="font-semibold">Engine Health</span>
                      <Server className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-lg">Healthy</span>
                    </div>
                    <div className="text-[11px] text-[#666A86] mt-0.5 font-mono">
                      {summary.storageBackend === 'supabase' ? 'Supabase Postgres 16' : 'Relational Dev Sandbox'}
                    </div>
                  </div>
                </div>

                {/* 14-Day Check-in Telemetry Chart */}
                <div className="p-5 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-extrabold text-sm text-[#1D1B3A] dark:text-white">
                        14-Day Platform Check-ins & GPS Anti-Spoofing Radar
                      </h3>
                      <p className="text-xs text-[#666A86]">
                        Aggregated arrival signals, perimeter grace reviews, and rejected mock-location attempts.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-[#6D5CF2] text-xs font-bold font-mono">
                      Privacy Preserving (0 PII)
                    </span>
                  </div>

                  <div className="grid grid-cols-7 sm:grid-cols-14 gap-2 pt-2">
                    {summary.checkinsTrend.map((t) => (
                      <div key={t.date} className="flex flex-col items-center gap-1.5">
                        <div className="w-full bg-slate-100 dark:bg-white/5 rounded-xl h-28 flex flex-col justify-end p-1 relative group">
                          {t.checkins > 0 ? (
                            <div
                              style={{ height: `${Math.min(100, Math.max(12, t.checkins * 4))}%` }}
                              className="w-full rounded-lg bg-gradient-to-t from-[#6D5CF2] to-[#8C7EFF] transition-all"
                            />
                          ) : (
                            <div className="h-1 w-full bg-slate-300 dark:bg-white/10 rounded" />
                          )}
                          {t.mockAttempts > 0 && (
                            <div
                              title={`${t.mockAttempts} GPS spoof attempts rejected`}
                              className="w-2 h-2 rounded-full bg-rose-500 absolute top-1 right-1"
                            />
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-[#666A86]">{t.date.slice(5)}</span>
                        <span className="text-[10px] font-bold font-mono text-[#1D1B3A] dark:text-white">
                          {t.checkins}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Active vs Inactive & Limit Watchlist */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Top Active Organisations */}
                  <div className="p-5 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-sm">Top Active Organisations (30d Check-ins)</h4>
                      <button
                        onClick={() => setActiveTab('organisations')}
                        className="text-xs font-bold text-[#6D5CF2] hover:underline"
                      >
                        View All
                      </button>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-white/5">
                      {summary.topOrganisations.length === 0 ? (
                        <p className="text-xs text-[#666A86] py-4 text-center">No check-ins recorded in past 30 days.</p>
                      ) : (
                        summary.topOrganisations.map((org) => (
                          <div
                            key={org.id}
                            onClick={() => {
                              setActiveTab('organisations');
                              loadOrgDetail(org.id);
                            }}
                            className="py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-white/5 px-2 rounded-xl transition-colors cursor-pointer"
                          >
                            <div className="space-y-0.5">
                              <span className="text-xs font-bold block">{org.name}</span>
                              <span className="text-[11px] text-[#666A86]">
                                {org.city} · Tier: <span className="font-mono">{org.tier}</span>
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400 block">
                                {org.checkins30d} check-ins
                              </span>
                              <span className="text-[11px] text-[#666A86] font-mono">
                                {org.seatsUsed} / {org.seatsLimit} seats
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Near Or Over Limit Watchlist */}
                  <div className="p-5 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <h4 className="font-extrabold text-sm">Near or Over Limits Watchlist</h4>
                      </div>
                      <span className="text-xs font-mono text-amber-500 font-bold">
                        {summary.nearOrOverLimits.length} alerted
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-white/5">
                      {summary.nearOrOverLimits.length === 0 ? (
                        <div className="py-6 text-center space-y-1">
                          <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                          <p className="text-xs font-bold text-[#666A86]">All organisations within safe operating limits (&lt;80%).</p>
                        </div>
                      ) : (
                        summary.nearOrOverLimits.map((item) => (
                          <div key={item.id} className="py-3 flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold block">{item.name}</span>
                              <span className="text-[11px] text-[#666A86] font-mono">
                                Seats: {item.seatsUsed}/{item.seatsLimit} ({item.seatUtilizationPct}%) · Sites:{' '}
                                {item.sitesUsed}/{item.sitesLimit} ({item.siteUtilizationPct}%)
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setActiveTab('organisations');
                                loadOrgDetail(item.id);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-xs hover:bg-amber-500/20"
                            >
                              Upgrade Tier
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: ORGANISATIONS DIRECTORY & 6-TAB WORKSPACE */}
            {activeTab === 'organisations' && (
              <div className="space-y-6">
                {selectedOrgId && selectedOrgDetail ? (
                  /* 6-TAB DETAIL WORKSPACE */
                  <div className="space-y-6">
                    {/* Workspace Header */}
                    <div className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <button
                          onClick={() => {
                            setSelectedOrgId(null);
                            setSelectedOrgDetail(null);
                          }}
                          className="text-xs font-bold text-[#6D5CF2] hover:underline flex items-center gap-1 mb-1 cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" /> Back to Organisations Directory
                        </button>
                        <div className="flex items-center gap-3">
                          <h2 className="text-xl sm:text-2xl font-black">{selectedOrgDetail.organisation.name}</h2>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                              selectedOrgDetail.organisation.status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : selectedOrgDetail.organisation.status === 'trial'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {selectedOrgDetail.organisation.status.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-[#666A86] font-mono">
                          ID: {selectedOrgDetail.organisation.id} · Slug: {selectedOrgDetail.organisation.slug} · City:{' '}
                          {selectedOrgDetail.organisation.city}, {selectedOrgDetail.organisation.country}
                        </p>
                      </div>

                      {/* Header Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSupportGrantForm({
                              organizationId: selectedOrgDetail.organisation.id,
                              reason: '',
                              durationMinutes: 30,
                            });
                            setIsSupportModalOpen(true);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 shadow-md flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View as Org Admin</span>
                        </button>

                        <button
                          onClick={() => {
                            setPaymentForm((prev) => ({
                              ...prev,
                              organizationId: selectedOrgDetail.organisation.id,
                              licenseId: selectedOrgDetail.license?.id || '',
                            }));
                            setIsPaymentDrawerOpen(true);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 shadow-md flex items-center gap-1.5 cursor-pointer"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>Record Payment</span>
                        </button>
                      </div>
                    </div>

                    {/* 6 Workspace Tabs Navigation */}
                    <div className="flex items-center gap-1 border-b border-[#D8DAE8] dark:border-[#25254A] pb-1 overflow-x-auto">
                      {(
                        [
                          { id: 'overview', label: '1. Overview' },
                          { id: 'license', label: '2. License & Limits' },
                          { id: 'usage', label: '3. Usage & Anti-Spoofing' },
                          { id: 'users', label: '4. Users (Privacy Safe)' },
                          { id: 'sites', label: '5. Geofence Sites' },
                          { id: 'audit', label: '6. Org Audit Trail' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setOrgWorkspaceTab(tab.id)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            orgWorkspaceTab === tab.id
                              ? 'bg-[#6D5CF2] text-white shadow-xs'
                              : 'text-[#666A86] hover:bg-slate-100 dark:hover:bg-white/5'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Workspace Tab 1: Overview */}
                    {orgWorkspaceTab === 'overview' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                          <h4 className="font-extrabold text-sm">Church & Leadership Profile</h4>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5">
                              <span className="text-[#666A86]">Senior Pastor</span>
                              <span className="font-bold">{selectedOrgDetail.organisation.seniorPastor || '—'}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5">
                              <span className="text-[#666A86]">Contact Person</span>
                              <span className="font-bold">{selectedOrgDetail.organisation.contactName || '—'}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5">
                              <span className="text-[#666A86]">Contact Email</span>
                              <span className="font-mono">{selectedOrgDetail.organisation.contactEmail || '—'}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5">
                              <span className="text-[#666A86]">Contact Phone</span>
                              <span className="font-mono">{selectedOrgDetail.organisation.contactPhone || '—'}</span>
                            </div>
                            <div className="flex justify-between py-1">
                              <span className="text-[#666A86]">Custom Domain</span>
                              <span className="font-mono">{selectedOrgDetail.organisation.customDomain || 'Standard *.run.app'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                          <h4 className="font-extrabold text-sm">Proximity & Service Infrastructure</h4>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5">
                              <span className="text-[#666A86]">Geofence Radius</span>
                              <span className="font-mono font-bold">{selectedOrgDetail.organisation.geofenceRadiusMeters} meters</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5">
                              <span className="text-[#666A86]">Sites Registered</span>
                              <span className="font-mono font-bold">{selectedOrgDetail.sites.length} site(s)</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5">
                              <span className="text-[#666A86]">Push Notifications</span>
                              <span className={selectedOrgDetail.organisation.pushConfigured ? 'text-emerald-500 font-bold' : 'text-slate-400'}>
                                {selectedOrgDetail.organisation.pushConfigured ? 'Configured & Active' : 'Unconfigured'}
                              </span>
                            </div>
                            <div className="flex justify-between py-1">
                              <span className="text-[#666A86]">SMS Gateway (Hubtel/Arkesel)</span>
                              <span className={selectedOrgDetail.organisation.smsConfigured ? 'text-emerald-500 font-bold' : 'text-slate-400'}>
                                {selectedOrgDetail.organisation.smsConfigured ? 'Active' : 'Unconfigured'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Workspace Tab 2: License & Limits */}
                    {orgWorkspaceTab === 'license' && (
                      <div className="space-y-6">
                        <div className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="font-extrabold text-sm">Active License Credentials</h4>
                            {selectedOrgDetail.license && (
                              <button
                                onClick={() => {
                                  setTargetLicenseForAction(selectedOrgDetail.license);
                                  setIsLicenseActionOpen(true);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold hover:bg-[#5b4be0]"
                              >
                                Modify License / Renew
                              </button>
                            )}
                          </div>

                          {selectedOrgDetail.license ? (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 space-y-1">
                                <span className="text-[#666A86] block">License Key</span>
                                <span className="font-mono font-bold text-sm block select-all">{selectedOrgDetail.license.key}</span>
                              </div>
                              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 space-y-1">
                                <span className="text-[#666A86] block">Tier & Status</span>
                                <span className="font-bold text-sm block uppercase font-mono">
                                  {selectedOrgDetail.license.tier} · {selectedOrgDetail.license.status}
                                </span>
                              </div>
                              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 space-y-1">
                                <span className="text-[#666A86] block">Expiration / Renewal</span>
                                <span className="font-mono font-bold text-sm block">
                                  {selectedOrgDetail.license.expiresDate || '—'}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="p-8 text-center text-xs text-rose-500 font-bold bg-rose-500/10 rounded-2xl">
                              No active license found. Operational writes for this organisation fail closed.
                            </div>
                          )}
                        </div>

                        {/* Payment History for Org */}
                        <div className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                          <h4 className="font-extrabold text-sm">Payment History</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="border-b border-slate-200 dark:border-white/10 text-[#666A86]">
                                  <th className="py-2">Reference</th>
                                  <th className="py-2">Amount</th>
                                  <th className="py-2">Channel</th>
                                  <th className="py-2">Date</th>
                                  <th className="py-2">Recorded By</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono">
                                {selectedOrgDetail.payments.length === 0 ? (
                                  <tr>
                                    <td colSpan={5} className="py-4 text-center text-[#666A86]">
                                      No payment transactions recorded yet.
                                    </td>
                                  </tr>
                                ) : (
                                  selectedOrgDetail.payments.map((p) => (
                                    <tr key={p.id}>
                                      <td className="py-2 font-bold">{p.reference}</td>
                                      <td className="py-2 font-bold text-emerald-600 dark:text-emerald-400">
                                        {p.currency} {p.amount.toLocaleString()}
                                      </td>
                                      <td className="py-2 uppercase">{p.method}</td>
                                      <td className="py-2">{p.paidAt.slice(0, 10)}</td>
                                      <td className="py-2">{p.recordedByEmail}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Workspace Tab 3: Usage */}
                    {orgWorkspaceTab === 'usage' && (
                      <div className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                        <h4 className="font-extrabold text-sm">Daily Usage & Mock GPS Telemetry (30 Days)</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs font-mono">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-white/10 text-[#666A86]">
                                <th className="py-2">Date</th>
                                <th className="py-2">Check-ins</th>
                                <th className="py-2">Flagged</th>
                                <th className="py-2">Rejected</th>
                                <th className="py-2">Mock GPS Attempts</th>
                                <th className="py-2">Active Users</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                              {selectedOrgDetail.usageDaily.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="py-4 text-center text-[#666A86]">
                                    No daily aggregates rolled up for this organisation yet.
                                  </td>
                                </tr>
                              ) : (
                                selectedOrgDetail.usageDaily.map((u) => (
                                  <tr key={u.usageDate}>
                                    <td className="py-2 font-bold">{u.usageDate}</td>
                                    <td className="py-2 font-bold text-emerald-600 dark:text-emerald-400">
                                      {u.checkinsCount}
                                    </td>
                                    <td className="py-2 text-amber-500">{u.flaggedCount}</td>
                                    <td className="py-2 text-rose-500">{u.rejectedCount}</td>
                                    <td className="py-2 text-rose-600 font-bold">{u.mockLocationAttempts}</td>
                                    <td className="py-2">{u.activeUsers}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Workspace Tab 4: Users (Zero PII, Role counts only) */}
                    {orgWorkspaceTab === 'users' && (
                      <div className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-extrabold text-sm">Role & Seat Distribution</h4>
                            <p className="text-xs text-[#666A86]">
                              In compliance with Act 843, congregation member PII and GPS trails are never exposed in Creator Console.
                            </p>
                          </div>
                          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-bold">
                            Act 843 Protected
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 text-center">
                            <span className="text-xs text-[#666A86] block">Total Registered</span>
                            <span className="text-xl font-black font-mono mt-1 block">
                              {selectedOrgDetail.usersSummary.totalMembersCount}
                            </span>
                          </div>
                          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 text-center">
                            <span className="text-xs text-[#666A86] block">Visitors</span>
                            <span className="text-xl font-black font-mono mt-1 block text-blue-500">
                              {selectedOrgDetail.usersSummary.visitorsCount}
                            </span>
                          </div>
                          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 text-center">
                            <span className="text-xs text-[#666A86] block">Auto-Checkin Opted In</span>
                            <span className="text-xl font-black font-mono mt-1 block text-emerald-500">
                              {selectedOrgDetail.usersSummary.optedInProximityCount}
                            </span>
                          </div>
                          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 text-center">
                            <span className="text-xs text-[#666A86] block">Staff Seats Active</span>
                            <span className="text-xl font-black font-mono mt-1 block text-purple-500">
                              {selectedOrgDetail.usersSummary.staffAccounts.length}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Workspace Tab 5: Sites */}
                    {orgWorkspaceTab === 'sites' && (
                      <div className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                        <h4 className="font-extrabold text-sm">Sanctuary Premise & Geofence Sites</h4>
                        <div className="divide-y divide-slate-100 dark:divide-white/5">
                          {selectedOrgDetail.sites.map((site) => (
                            <div key={site.id} className="py-3 flex items-center justify-between">
                              <div className="space-y-0.5">
                                <span className="text-xs font-bold block">{site.name}</span>
                                <span className="text-[11px] text-[#666A86] font-mono">
                                  GPS: {site.lat.toFixed(5)}, {site.lng.toFixed(5)} · Inner: {site.radius_m}m · Outer:{' '}
                                  {site.outer_radius_m}m
                                </span>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  site.active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {site.active ? 'ACTIVE' : 'INACTIVE'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Workspace Tab 6: Audit */}
                    {orgWorkspaceTab === 'audit' && (
                      <div className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                        <h4 className="font-extrabold text-sm">Organisation-Scoped Audit Trail</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs font-mono">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-white/10 text-[#666A86]">
                                <th className="py-2">Timestamp</th>
                                <th className="py-2">Actor</th>
                                <th className="py-2">Action</th>
                                <th className="py-2">IP</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                              {selectedOrgDetail.audit.length === 0 ? (
                                <tr>
                                  <td colSpan={4} className="py-4 text-center text-[#666A86]">
                                    No audit entries recorded for this organisation yet.
                                  </td>
                                </tr>
                              ) : (
                                selectedOrgDetail.audit.map((log) => (
                                  <tr key={log.id}>
                                    <td className="py-2">{new Date(log.createdAt).toLocaleString()}</td>
                                    <td className="py-2">{log.actorEmail}</td>
                                    <td className="py-2 font-bold text-[#6D5CF2]">{log.action}</td>
                                    <td className="py-2">{log.ipAddress || '—'}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* DIRECTORY LISTING */
                  <div className="space-y-4">
                    {/* Controls Bar */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 flex-1">
                        <div className="relative flex-1 min-w-[200px]">
                          <Search className="w-4 h-4 text-[#666A86] absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={orgSearch}
                            onChange={(e) => setOrgSearch(e.target.value)}
                            placeholder="Search by name, pastor, city, slug..."
                            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] text-xs font-medium focus:outline-none focus:border-[#6D5CF2]"
                          />
                        </div>

                        <select
                          value={orgStatusFilter}
                          onChange={(e) => setOrgStatusFilter(e.target.value)}
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] text-xs font-bold"
                        >
                          <option value="all">All Statuses</option>
                          <option value="active">Active</option>
                          <option value="trial">Trial</option>
                          <option value="suspended">Suspended</option>
                          <option value="archived">Archived</option>
                        </select>

                        <select
                          value={orgTierFilter}
                          onChange={(e) => setOrgTierFilter(e.target.value)}
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] text-xs font-bold"
                        >
                          <option value="all">All Tiers</option>
                          <option value="grace_starter">Grace Starter</option>
                          <option value="ministry_pro">Ministry Pro</option>
                          <option value="cathedral_enterprise">Cathedral Enterprise</option>
                        </select>
                      </div>

                      <button
                        onClick={() => setIsProvisionOrgOpen(true)}
                        className="px-4 py-2 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold hover:bg-[#5b4be0] shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Provision Organisation</span>
                      </button>
                    </div>

                    {/* Table of Organisations */}
                    <div className="p-4 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-white/10 text-[#666A86]">
                            <th className="py-2.5 px-3">Organisation</th>
                            <th className="py-2.5 px-3">Type</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">License Tier</th>
                            <th className="py-2.5 px-3">Location</th>
                            <th className="py-2.5 px-3">Seats</th>
                            <th className="py-2.5 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                          {filteredOrganisations.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-[#666A86]">
                                No organisations found matching the filter criteria.
                              </td>
                            </tr>
                          ) : (
                            filteredOrganisations.map((org) => (
                              <tr
                                key={org.id}
                                className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                                onClick={() => loadOrgDetail(org.id)}
                              >
                                <td className="py-3 px-3">
                                  <span className="font-bold block text-sm">{org.name}</span>
                                  <span className="text-[11px] text-[#666A86] font-mono">{org.slug}</span>
                                </td>
                                <td className="py-3 px-3 capitalize font-medium">{org.orgType}</td>
                                <td className="py-3 px-3">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                                      org.status === 'active'
                                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                        : org.status === 'trial'
                                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                    }`}
                                  >
                                    {org.status.toUpperCase()}
                                  </span>
                                </td>
                                <td className="py-3 px-3 font-mono font-bold">{org.licenseTier}</td>
                                <td className="py-3 px-3 text-[#666A86]">
                                  {org.city}, {org.country}
                                </td>
                                <td className="py-3 px-3 font-mono">
                                  {org.memberCount} / {org.maxCapacity}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <span className="text-[#6D5CF2] font-bold text-xs hover:underline flex items-center justify-end gap-1">
                                    Manage <ChevronRight className="w-3.5 h-3.5" />
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: LICENSES & BILLING LEDGER */}
            {activeTab === 'licenses' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="w-4 h-4 text-[#666A86] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={licenseSearch}
                        onChange={(e) => setLicenseSearch(e.target.value)}
                        placeholder="Search by license key, organisation..."
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] text-xs font-medium focus:outline-none focus:border-[#6D5CF2]"
                      />
                    </div>

                    <select
                      value={licenseStatusFilter}
                      onChange={(e) => setLicenseStatusFilter(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] text-xs font-bold"
                    >
                      <option value="all">All Statuses</option>
                      <option value="active">Active</option>
                      <option value="trial">Trial</option>
                      <option value="grace_period">Grace Period</option>
                      <option value="expired">Expired</option>
                      <option value="suspended">Suspended</option>
                      <option value="revoked">Revoked</option>
                    </select>
                  </div>

                  <button
                    onClick={() => setIsPaymentDrawerOpen(true)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>Record Manual Payment</span>
                  </button>
                </div>

                <div className="p-4 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-white/10 text-[#666A86]">
                        <th className="py-2.5 px-3">License Key</th>
                        <th className="py-2.5 px-3">Organisation</th>
                        <th className="py-2.5 px-3">Tier</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Expires</th>
                        <th className="py-2.5 px-3">ARR (USD)</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {filteredLicenses.map((lic) => (
                        <tr key={lic.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                          <td className="py-3 px-3 font-bold select-all">{lic.key}</td>
                          <td className="py-3 px-3 font-sans font-bold">{lic.tenantName}</td>
                          <td className="py-3 px-3 uppercase">{lic.tier}</td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                lic.status === 'active'
                                  ? 'bg-emerald-500/10 text-emerald-600'
                                  : lic.status === 'trial'
                                  ? 'bg-amber-500/10 text-amber-600'
                                  : 'bg-rose-500/10 text-rose-600'
                              }`}
                            >
                              {lic.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-3">{lic.expiresDate || '—'}</td>
                          <td className="py-3 px-3 font-bold">${lic.annualCostUSD}</td>
                          <td className="py-3 px-3 text-right font-sans">
                            <button
                              onClick={() => {
                                setTargetLicenseForAction(lic);
                                setIsLicenseActionOpen(true);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#6D5CF2]/10 text-[#6D5CF2] text-xs font-bold hover:bg-[#6D5CF2]/20"
                            >
                              Actions
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: PLANS CATALOG */}
            {activeTab === 'plans' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {plans.map((p) => (
                  <div
                    key={p.id}
                    className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-base">{p.name}</h4>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-[#6D5CF2] text-xs font-mono font-bold">
                        {p.id}
                      </span>
                    </div>

                    <p className="text-xs text-[#666A86] leading-relaxed">{p.description}</p>

                    <div className="py-2 border-y border-slate-100 dark:border-white/5 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#666A86]">Monthly Cost</span>
                        <span className="font-mono font-bold">${p.monthlyCostUSD} USD</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#666A86]">Annual Cost</span>
                        <span className="font-mono font-bold">${p.annualCostUSD} USD</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#666A86]">Seat Limit</span>
                        <span className="font-mono font-bold">{p.seatsLimit.toLocaleString()} members</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#666A86]">Sites Limit</span>
                        <span className="font-mono font-bold">{p.sitesLimit} campuses</span>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      <span className="font-bold text-[11px] text-[#666A86] block">Default Feature Flags</span>
                      <div className="grid grid-cols-2 gap-1 font-mono text-[11px]">
                        {Object.entries(p.featureFlags).map(([flag, val]) => (
                          <div key={flag} className="flex items-center gap-1">
                            <span className={val ? 'text-emerald-500' : 'text-slate-400'}>
                              {val ? '✓' : '✗'}
                            </span>
                            <span className="truncate">{flag}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB 5: USAGE AGGREGATES */}
            {activeTab === 'usage' && (
              <div className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm">Cross-Organisation Daily Usage Telemetry (Last 30 Days)</h4>
                  <span className="text-xs font-mono text-[#666A86]">{usageDaily.length} records</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-white/10 text-[#666A86]">
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Organisation</th>
                        <th className="py-2.5 px-3">Check-ins</th>
                        <th className="py-2.5 px-3">Flagged Margin</th>
                        <th className="py-2.5 px-3">Rejected Outside</th>
                        <th className="py-2.5 px-3">Mock GPS Rejected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {usageDaily.map((u, i) => (
                        <tr key={`${u.organizationId}-${u.usageDate}-${i}`}>
                          <td className="py-2.5 px-3 font-bold">{u.usageDate}</td>
                          <td className="py-2.5 px-3 font-sans font-medium">{u.organizationName || u.organizationId}</td>
                          <td className="py-2.5 px-3 font-bold text-emerald-600 dark:text-emerald-400">
                            {u.checkinsCount}
                          </td>
                          <td className="py-2.5 px-3 text-amber-500">{u.flaggedCount}</td>
                          <td className="py-2.5 px-3 text-rose-500">{u.rejectedCount}</td>
                          <td className="py-2.5 px-3 text-rose-600 font-bold">{u.mockLocationAttempts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 6: ALERTS TRIAGE */}
            {activeTab === 'alerts' && (
              <div className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm">Proactive Platform Alerts</h4>
                  <span className="text-xs font-mono text-amber-500 font-bold">
                    {alerts.filter((a) => a.status === 'open').length} open
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-white/5">
                  {alerts.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#666A86]">No active platform alerts.</div>
                  ) : (
                    alerts.map((alert) => (
                      <div key={alert.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono ${
                                alert.severity === 'critical'
                                  ? 'bg-rose-500/10 text-rose-600'
                                  : alert.severity === 'warning'
                                  ? 'bg-amber-500/10 text-amber-600'
                                  : 'bg-blue-500/10 text-blue-600'
                              }`}
                            >
                              {alert.severity}
                            </span>
                            <span className="font-bold text-xs">{alert.title}</span>
                          </div>
                          <p className="text-xs text-[#666A86]">{alert.message}</p>
                          <span className="text-[10px] text-[#8D92B5] font-mono">
                            Org: {alert.organizationName || alert.organizationId || 'Global'} · Created:{' '}
                            {new Date(alert.createdAt).toLocaleString()}
                          </span>
                        </div>

                        {alert.status === 'open' && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleAlertStatus(alert.id, 'acknowledged')}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/10 text-xs font-bold hover:bg-slate-200"
                            >
                              Acknowledge
                            </button>
                            <button
                              onClick={() => handleAlertStatus(alert.id, 'resolved')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500"
                            >
                              Resolve
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 7: ANNOUNCEMENTS */}
            {activeTab === 'announcements' && (
              <div className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm">Platform Announcements</h4>
                  <button
                    onClick={() => setIsAnnouncementModalOpen(true)}
                    className="px-3 py-1.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold hover:bg-[#5b4be0] flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Compose Announcement
                  </button>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-white/5">
                  {announcements.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#666A86]">No broadcasted announcements.</div>
                  ) : (
                    announcements.map((a) => (
                      <div key={a.id} className="py-3.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs">{a.title}</span>
                          <span className="text-[10px] text-[#666A86] font-mono">
                            Expires: {a.expiresAt ? new Date(a.expiresAt).toLocaleDateString() : 'Permanent'}
                          </span>
                        </div>
                        <p className="text-xs text-[#666A86]">{a.body}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 8: FEATURE FLAGS */}
            {activeTab === 'feature_flags' && (
              <div className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                <h4 className="font-extrabold text-sm">Global Feature Flags Matrix</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-white/10 text-[#666A86]">
                        <th className="py-2.5 px-3">Flag Key</th>
                        <th className="py-2.5 px-3">Name & Description</th>
                        <th className="py-2.5 px-3">Enabled Tiers</th>
                        <th className="py-2.5 px-3 text-right">Global Override</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {featureFlags.map((ff) => (
                        <tr key={ff.key}>
                          <td className="py-3 px-3 font-mono font-bold text-[#6D5CF2]">{ff.key}</td>
                          <td className="py-3 px-3">
                            <span className="font-bold block">{ff.name}</span>
                            <span className="text-[11px] text-[#666A86]">{ff.description}</span>
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px]">{ff.enabledTiers.join(', ') || 'None'}</td>
                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => handleToggleFeatureFlag(ff.key, !ff.enabledGlobally)}
                              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                                ff.enabledGlobally
                                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {ff.enabledGlobally ? 'Globally Enabled' : 'Disabled Globally'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 9: DATA REQUESTS (ACT 843 / GDPR) */}
            {activeTab === 'data_requests' && (
              <div className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-extrabold text-sm">Data Subject Rights (Ghana Act 843 SLA Tracker)</h4>
                    <p className="text-xs text-[#666A86]">
                      Members hold statutory rights to export their attendance and request profile deletion.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 text-[#6D5CF2] text-xs font-bold">
                    30-Day Statutory SLA
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-white/10 text-[#666A86]">
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Organisation</th>
                        <th className="py-2.5 px-3">Requested By</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Due Date</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {dataRequests.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-[#666A86]">
                            No pending data privacy requests.
                          </td>
                        </tr>
                      ) : (
                        dataRequests.map((dr) => (
                          <tr key={dr.id}>
                            <td className="py-3 px-3 uppercase font-bold text-[#6D5CF2]">{dr.requestType}</td>
                            <td className="py-3 px-3 font-sans font-medium">{dr.organizationName || dr.organizationId}</td>
                            <td className="py-3 px-3">{dr.requestedByEmail}</td>
                            <td className="py-3 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  dr.status === 'completed'
                                    ? 'bg-emerald-500/10 text-emerald-600'
                                    : dr.status === 'in_progress'
                                    ? 'bg-amber-500/10 text-amber-600'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {dr.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-3 px-3">{new Date(dr.dueAt).toLocaleDateString()}</td>
                            <td className="py-3 px-3 text-right font-sans">
                              {dr.status === 'pending' && (
                                <button
                                  onClick={() => handleUpdateDataRequest(dr.id, 'in_progress')}
                                  className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 font-bold text-xs"
                                >
                                  Start
                                </button>
                              )}
                              {dr.status === 'in_progress' && (
                                <button
                                  onClick={() => handleUpdateDataRequest(dr.id, 'completed')}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-xs"
                                >
                                  Complete
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 10: AUDIT TRAIL */}
            {activeTab === 'audit_log' && (
              <div className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm">Platform Immutable Audit Trail</h4>
                  <a
                    href="/api/console/audit-log/export.csv"
                    download="ekklesphere-audit-log.csv"
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-white/10 border border-[#D8DAE8] text-xs font-bold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Export Full CSV
                  </a>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-white/10 text-[#666A86]">
                        <th className="py-2 px-2">Timestamp</th>
                        <th className="py-2 px-2">Actor</th>
                        <th className="py-2 px-2">Action</th>
                        <th className="py-2 px-2">Target Type</th>
                        <th className="py-2 px-2">IP Address</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="py-2 px-2">{new Date(log.created_at).toLocaleString()}</td>
                          <td className="py-2 px-2 font-sans font-bold">{log.actor_email}</td>
                          <td className="py-2 px-2 font-bold text-[#6D5CF2]">{log.action}</td>
                          <td className="py-2 px-2">{log.target_type}</td>
                          <td className="py-2 px-2">{log.ip_address || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 11: LANDING CMS */}
            {activeTab === 'landing_cms' && landingCms && (
              <form onSubmit={handleSaveLandingCms} className="p-6 rounded-3xl bg-white dark:bg-[#181838] border border-[#D8DAE8] dark:border-[#25254A] shadow-xs space-y-4 max-w-3xl">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm">Landing Page CMS Configuration</h4>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold hover:bg-[#5b4be0] flex items-center gap-1.5 shadow-md"
                  >
                    <Save className="w-4 h-4" /> Save to Supabase
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-bold text-[#666A86] block mb-1">Hero Main Title</label>
                    <input
                      type="text"
                      value={landingCms.heroTitle}
                      onChange={(e) => setLandingCms({ ...landingCms, heroTitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-bold"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-[#666A86] block mb-1">Hero Subtitle</label>
                    <textarea
                      rows={2}
                      value={landingCms.heroSubtitle}
                      onChange={(e) => setLandingCms({ ...landingCms, heroSubtitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-[#666A86] block mb-1">Announcement Badge Text</label>
                      <input
                        type="text"
                        value={landingCms.announcementBadge}
                        onChange={(e) => setLandingCms({ ...landingCms, announcementBadge: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-[#666A86] block mb-1">Contact / Sales Email</label>
                      <input
                        type="email"
                        value={landingCms.contactSalesEmail}
                        onChange={(e) => setLandingCms({ ...landingCms, contactSalesEmail: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                      />
                    </div>
                  </div>
                </div>
              </form>
            )}
          </>
        )}
      </main>

      {/* PROVISION ORGANISATION MODAL */}
      {isProvisionOrgOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white dark:bg-[#181838] rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base">Provision New Organisation</h3>
              <button onClick={() => setIsProvisionOrgOpen(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleProvisionOrg} className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Church / Organisation Name *</label>
                <input
                  type="text"
                  required
                  value={newOrgForm.name}
                  onChange={(e) => setNewOrgForm({ ...newOrgForm, name: e.target.value })}
                  placeholder="e.g. Calvary Baptist Cathedral"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">Senior Pastor / Head</label>
                  <input
                    type="text"
                    value={newOrgForm.seniorPastor}
                    onChange={(e) => setNewOrgForm({ ...newOrgForm, seniorPastor: e.target.value })}
                    placeholder="Pastor in Charge"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">Initial Plan Tier</label>
                  <select
                    value={newOrgForm.initialPlan}
                    onChange={(e) => setNewOrgForm({ ...newOrgForm, initialPlan: e.target.value as LicenseTier })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-bold"
                  >
                    <option value="grace_starter">Grace Starter (150 seats)</option>
                    <option value="ministry_pro">Ministry Pro (750 seats)</option>
                    <option value="cathedral_enterprise">Cathedral Enterprise (2,500 seats)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">City</label>
                  <input
                    type="text"
                    value={newOrgForm.city}
                    onChange={(e) => setNewOrgForm({ ...newOrgForm, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">Country</label>
                  <input
                    type="text"
                    value={newOrgForm.country}
                    onChange={(e) => setNewOrgForm({ ...newOrgForm, country: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-indigo-500/10 text-[#6D5CF2] text-[11px] font-bold">
                ✓ Auto-issues 14-day trial license with 7-day grace period. Fail-closed policy applies after expiration.
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsProvisionOrgOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold hover:bg-[#5b4be0]"
                >
                  Confirm Provisioning
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD MANUAL PAYMENT DRAWER / MODAL */}
      {isPaymentDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-[#181838] rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base">Record Offline Manual Payment</h3>
              <button onClick={() => setIsPaymentDrawerOpen(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">Amount *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">Currency</label>
                  <select
                    value={paymentForm.currency}
                    onChange={(e) => setPaymentForm({ ...paymentForm, currency: e.target.value as 'GHS' | 'USD' })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-bold"
                  >
                    <option value="GHS">GHS (Ghanaian Cedis)</option>
                    <option value="USD">USD (US Dollars)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">Channel</label>
                  <select
                    value={paymentForm.method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value as 'momo' | 'bank' | 'cash' })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-bold uppercase"
                  >
                    <option value="momo">Mobile Money (MTN/Telecel)</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="cash">Direct Cash Receipt</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1">Payment Reference *</label>
                  <input
                    type="text"
                    required
                    value={paymentForm.reference}
                    onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                    placeholder="e.g. MOMO-REF-99214"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">Notes / Receipt Detail</label>
                <textarea
                  rows={2}
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  placeholder="e.g. Annual renewal payment confirmed via MTN MoMo merchant statement"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentDrawerOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AUDITED SUPPORT ACCESS MODAL ("View as Organisation Admin") */}
      {isSupportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-[#181838] rounded-3xl p-6 shadow-2xl border border-amber-500/30 space-y-4">
            <div className="flex items-center gap-2 text-amber-500 font-black text-base">
              <ShieldCheck className="w-5 h-5" />
              <span>Audited Read-Only Support Access</span>
            </div>

            <p className="text-xs text-[#666A86] leading-relaxed">
              Entering "View as Organisation Admin" grants a strictly time-limited, read-only session to inspect setup and verify attendance telemetry.
              All mutations are blocked at the server and an immutable entry is recorded in the platform audit log.
            </p>

            <form onSubmit={handleCreateSupportGrant} className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Audit Reason (min 10 characters) *</label>
                <textarea
                  required
                  rows={3}
                  value={supportGrantForm.reason}
                  onChange={(e) => setSupportGrantForm({ ...supportGrantForm, reason: e.target.value })}
                  placeholder="e.g. Customer support ticket #412: diagnosing geofence outer ring arrival detection"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                />
              </div>

              <div>
                <label className="font-bold block mb-1">Session Duration</label>
                <select
                  value={supportGrantForm.durationMinutes}
                  onChange={(e) => setSupportGrantForm({ ...supportGrantForm, durationMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-bold"
                >
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes (Recommended)</option>
                  <option value={60}>60 Minutes</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSupportModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400"
                >
                  Grant Read-Only Access
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LICENSE ACTION MODAL */}
      {isLicenseActionOpen && targetLicenseForAction && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-[#181838] rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base">License Lifecycle Action</h3>
              <button onClick={() => setIsLicenseActionOpen(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#666A86] font-mono">
              Key: {targetLicenseForAction.key} · Tier: {targetLicenseForAction.tier}
            </p>

            <form onSubmit={handleLicenseAction} className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Action</label>
                <select
                  value={licenseActionForm.action}
                  onChange={(e) => setLicenseActionForm({ ...licenseActionForm, action: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-bold uppercase"
                >
                  <option value="renew">Renew (Extend Expiration)</option>
                  <option value="upgrade">Upgrade Tier</option>
                  <option value="downgrade">Downgrade Tier</option>
                  <option value="suspend">Suspend Access (Fail-Closed)</option>
                  <option value="reactivate">Reactivate</option>
                  <option value="revoke">Revoke License</option>
                </select>
              </div>

              {(licenseActionForm.action === 'upgrade' || licenseActionForm.action === 'downgrade') && (
                <div>
                  <label className="font-bold block mb-1">Target Tier</label>
                  <select
                    value={licenseActionForm.targetTier}
                    onChange={(e) => setLicenseActionForm({ ...licenseActionForm, targetTier: e.target.value as LicenseTier })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-bold"
                  >
                    <option value="grace_starter">Grace Starter</option>
                    <option value="ministry_pro">Ministry Pro</option>
                    <option value="cathedral_enterprise">Cathedral Enterprise</option>
                  </select>
                </div>
              )}

              {licenseActionForm.action === 'renew' && (
                <div>
                  <label className="font-bold block mb-1">Extension Duration (Months)</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={licenseActionForm.durationMonths}
                    onChange={(e) => setLicenseActionForm({ ...licenseActionForm, durationMonths: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono font-bold"
                  />
                </div>
              )}

              <div>
                <label className="font-bold block mb-1">Audit Reason *</label>
                <input
                  type="text"
                  required
                  value={licenseActionForm.reason}
                  onChange={(e) => setLicenseActionForm({ ...licenseActionForm, reason: e.target.value })}
                  placeholder="e.g. Annual renewal payment confirmed"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsLicenseActionOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold hover:bg-[#5b4be0]"
                >
                  Apply Action
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ANNOUNCEMENT MODAL */}
      {isAnnouncementModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-[#181838] rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-base">Broadcast Platform Announcement</h3>
              <button onClick={() => setIsAnnouncementModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAnnouncement} className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={announcementForm.title}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                  placeholder="e.g. Scheduled Maintenance: Sunday Service Window Protected"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                />
              </div>

              <div>
                <label className="font-bold block mb-1">Body *</label>
                <textarea
                  required
                  rows={3}
                  value={announcementForm.body}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, body: e.target.value })}
                  placeholder="Announcement message for church administrators..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">Severity</label>
                  <select
                    value={announcementForm.severity}
                    onChange={(e) => setAnnouncementForm({ ...announcementForm, severity: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-bold uppercase"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1">Expires In (Days)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={announcementForm.expiresInDays}
                    onChange={(e) => setAnnouncementForm({ ...announcementForm, expiresInDays: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAnnouncementModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold hover:bg-[#5b4be0]"
                >
                  Broadcast
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
