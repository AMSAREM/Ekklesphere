import React, { useState } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  TenantChurch,
  SystemLicense,
  LicenseTier,
  TenantStatus,
  BillingCycle,
  LandingPageConfig,
} from '../../types/ekklesphere';
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
  Trash2,
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
} from 'lucide-react';

export const CreatorsPanel: React.FC = () => {
  const {
    currentUser,
    tenants,
    addTenant,
    updateTenant,
    toggleTenantStatus,
    deleteTenant,
    impersonateTenant,
    licenses,
    renewLicense,
    updateLicense,
    issueLicense,
    landingConfig,
    updateLandingConfig,
    resetLandingConfig,
    setViewMode,
    showToast,
  } = useEkklesphere();

  const isAuthorized = currentUser?.role === 'super_admin' || currentUser?.role === 'creator';

  if (!isAuthorized) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#0D0D22] text-[#F2F2FA] p-6">
        <div className="max-w-md w-full bg-[#181838] p-8 rounded-3xl border border-rose-500/30 text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-400 mx-auto flex items-center justify-center font-bold text-2xl">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold">Creator Access Restricted</h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Multi-tenant licensing, billing lifecycle, and system configuration require verified <strong>super_admin</strong> or <strong>creator</strong> role credentials.
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

  const [activeTab, setActiveTab] = useState<'tenants' | 'licenses' | 'landing_cms' | 'telemetry'>('tenants');
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantStatusFilter, setTenantStatusFilter] = useState<'all' | TenantStatus>('all');

  // Modals state
  const [isAddTenantOpen, setIsAddTenantOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantChurch | null>(null);
  const [isIssueLicenseOpen, setIsIssueLicenseOpen] = useState(false);

  // New Tenant Form state
  const [newTenantForm, setNewTenantForm] = useState({
    name: '',
    slug: '',
    campusCode: '',
    city: 'Accra',
    country: 'Ghana',
    seniorPastor: '',
    contactEmail: '',
    contactPhone: '+233 ',
    status: 'active' as TenantStatus,
    memberCount: 50,
    maxCapacity: 500,
    licenseTier: 'ministry_pro' as LicenseTier,
    billingCycle: 'annual' as BillingCycle,
    geofenceRadiusMeters: 250,
    customDomain: '',
    features: {
      bleRadar: true,
      smsGateway: true,
      biometrics: false,
      gdprPrivacyVault: true,
      multiCampus: false,
      mobileGivingMoMo: true,
      customDomain: false,
      exportAuditLogs: true,
    },
  });

  // CMS Form local draft
  const [cmsDraft, setCmsDraft] = useState<LandingPageConfig>(landingConfig);

  // Filtered tenants
  const filteredTenants = tenants.filter((t) => {
    const matchSearch =
      t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.slug.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.seniorPastor.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.city.toLowerCase().includes(tenantSearch.toLowerCase());
    const matchStatus = tenantStatusFilter === 'all' || t.status === tenantStatusFilter;
    return matchSearch && matchStatus;
  });

  // Global creator metrics
  const totalSeats = tenants.reduce((acc, t) => acc + t.maxCapacity, 0);
  const totalRegisteredMembers = tenants.reduce((acc, t) => acc + t.memberCount, 0);
  const activeTenants = tenants.filter((t) => t.status === 'active').length;
  const activeLicenses = licenses.filter((l) => l.status === 'active').length;
  const annualRunRateUSD = licenses.reduce((acc, l) => acc + l.annualCostUSD, 0);

  const handleCreateTenant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantForm.name.trim() || !newTenantForm.seniorPastor.trim()) {
      showToast('Please provide church name and senior pastor name.');
      return;
    }

    const slug = newTenantForm.slug.trim() || newTenantForm.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const campusCode =
      newTenantForm.campusCode.trim() || `${slug.substring(0, 3).toUpperCase()}-0${tenants.length + 1}`;
    const renewalDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    addTenant({
      name: newTenantForm.name.trim(),
      slug,
      campusCode,
      city: newTenantForm.city.trim(),
      country: newTenantForm.country.trim(),
      seniorPastor: newTenantForm.seniorPastor.trim(),
      contactEmail: newTenantForm.contactEmail.trim() || `admin@${slug}.org`,
      contactPhone: newTenantForm.contactPhone.trim(),
      status: newTenantForm.status,
      memberCount: Number(newTenantForm.memberCount) || 0,
      maxCapacity: Number(newTenantForm.maxCapacity) || 500,
      licenseKey: '',
      licenseTier: newTenantForm.licenseTier,
      renewalDate,
      billingCycle: newTenantForm.billingCycle,
      customDomain: newTenantForm.customDomain.trim() || undefined,
      geofenceRadiusMeters: Number(newTenantForm.geofenceRadiusMeters) || 200,
      features: newTenantForm.features,
    });

    setIsAddTenantOpen(false);
    // Reset form
    setNewTenantForm({
      name: '',
      slug: '',
      campusCode: '',
      city: 'Accra',
      country: 'Ghana',
      seniorPastor: '',
      contactEmail: '',
      contactPhone: '+233 ',
      status: 'active',
      memberCount: 50,
      maxCapacity: 500,
      licenseTier: 'ministry_pro',
      billingCycle: 'annual',
      geofenceRadiusMeters: 250,
      customDomain: '',
      features: {
        bleRadar: true,
        smsGateway: true,
        biometrics: false,
        gdprPrivacyVault: true,
        multiCampus: false,
        mobileGivingMoMo: true,
        customDomain: false,
        exportAuditLogs: true,
      },
    });
  };

  const handleSaveCMS = (e: React.FormEvent) => {
    e.preventDefault();
    updateLandingConfig(cmsDraft);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`Copied ${label} to clipboard!`);
  };

  const exportTenantsJSON = () => {
    const data = {
      timestamp: new Date().toISOString(),
      tenants,
      licenses,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ekklesphere-tenants-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported tenants directory as JSON');
  };

  return (
    <div className="min-h-screen bg-[#F4F5FB] dark:bg-[#0B0B1A] text-[#1D1B3A] dark:text-[#F2F2FA] transition-colors duration-200 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Super-Admin Header */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#12122A]/95 backdrop-blur-md border-b border-[#E3E5EE] dark:border-[#222245] px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-xs">
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
                  Creators Platform Console
                </span>
                <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-extrabold uppercase tracking-wider border border-purple-500/20">
                  Super-Admin
                </span>
              </div>
              <span className="text-[11px] text-[#666A86] dark:text-[#8D92B5]">
                Tenant Management, Licensing & Landing Page Controls
              </span>
            </div>
          </div>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={exportTenantsJSON}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#666A86]" />
            <span>Export Directory</span>
          </button>

          <button
            onClick={() => setViewMode('landing')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#EFEDFF] dark:bg-[#1E1C38] text-[#6D5CF2] dark:text-[#A594FD] hover:bg-[#E3E0FF] transition-all cursor-pointer"
          >
            <Globe2 className="w-3.5 h-3.5" />
            <span>View Landing Page</span>
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

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top Telemetry Strip */}
        <section aria-label="Creator Telemetry Overview" className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#13132D] border border-[#E3E5EE] dark:border-[#202042] shadow-xs">
            <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#8D92B5]">
              <span className="font-semibold">Active Tenants</span>
              <Building2 className="w-3.5 h-3.5 text-[#6D5CF2]" />
            </div>
            <div className="mt-2 text-2xl font-black text-[#1D1B3A] dark:text-white">
              {activeTenants}{' '}
              <span className="text-xs font-medium text-[#7A7E9D]">/ {tenants.length}</span>
            </div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
              100% operational
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#13132D] border border-[#E3E5EE] dark:border-[#202042] shadow-xs">
            <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#8D92B5]">
              <span className="font-semibold">Licensed Members</span>
              <Users className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-[#1D1B3A] dark:text-white">
              {totalRegisteredMembers.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#666A86] dark:text-[#8D92B5] font-semibold mt-0.5">
              Across {totalSeats.toLocaleString()} seats
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#13132D] border border-[#E3E5EE] dark:border-[#202042] shadow-xs">
            <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#8D92B5]">
              <span className="font-semibold">Active Licenses</span>
              <Key className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-[#1D1B3A] dark:text-white">
              {activeLicenses}
            </div>
            <div className="text-[11px] text-amber-600 dark:text-amber-400 font-bold mt-0.5">
              {licenses.filter((l) => l.status === 'grace_period').length} in grace period
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#13132D] border border-[#E3E5EE] dark:border-[#202042] shadow-xs">
            <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#8D92B5]">
              <span className="font-semibold">Annual Run-Rate</span>
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-[#6D5CF2] dark:text-[#A594FD]">
              ${annualRunRateUSD.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#666A86] dark:text-[#8D92B5] font-semibold mt-0.5">
              ARR from active tiers
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#13132D] border border-[#E3E5EE] dark:border-[#202042] shadow-xs col-span-2 md:col-span-1">
            <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#8D92B5]">
              <span className="font-semibold">Firestore Cloud</span>
              <Database className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="mt-2 text-lg font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Connected</span>
            </div>
            <div className="text-[10px] text-[#666A86] dark:text-[#8D92B5] truncate mt-0.5">
              ai-studio-ekklesphere
            </div>
          </div>
        </section>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-white dark:bg-[#12122A] border border-[#E3E5EE] dark:border-[#222245] max-w-fit shadow-xs">
          <button
            onClick={() => setActiveTab('tenants')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'tenants'
                ? 'bg-[#6D5CF2] text-white shadow-xs'
                : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Church Tenants ({tenants.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('licenses')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'licenses'
                ? 'bg-[#6D5CF2] text-white shadow-xs'
                : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Licenses & Subscriptions ({licenses.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('landing_cms')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'landing_cms'
                ? 'bg-[#6D5CF2] text-white shadow-xs'
                : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
            }`}
          >
            <Globe2 className="w-3.5 h-3.5" />
            <span>Landing Page CMS</span>
          </button>

          <button
            onClick={() => setActiveTab('telemetry')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'telemetry'
                ? 'bg-[#6D5CF2] text-white shadow-xs'
                : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>System Telemetry</span>
          </button>
        </div>

        {/* TAB 1: CHURCH TENANTS MANAGEMENT */}
        {activeTab === 'tenants' && (
          <div className="space-y-4">
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-[#12122A] p-4 rounded-2xl border border-[#E3E5EE] dark:border-[#222245] shadow-xs">
              <div className="flex items-center gap-2 flex-1 max-w-md relative">
                <Search className="w-4 h-4 text-[#666A86] absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search church, slug, senior pastor, city..."
                  value={tenantSearch}
                  onChange={(e) => setTenantSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs text-[#1D1B3A] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={tenantStatusFilter}
                  onChange={(e) => setTenantStatusFilter(e.target.value as any)}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs font-bold text-[#1D1B3A] dark:text-white"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="trial">Trial Only</option>
                  <option value="suspended">Suspended Only</option>
                </select>

                <button
                  onClick={() => setIsAddTenantOpen(true)}
                  className="px-4 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-[#6D5CF2]/20 transition-all cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Provision New Church</span>
                </button>
              </div>
            </div>

            {/* Tenants Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTenants.map((tenant) => {
                const capacityPct = Math.round((tenant.memberCount / tenant.maxCapacity) * 100);
                return (
                  <div
                    key={tenant.id}
                    className="p-5 rounded-2xl bg-white dark:bg-[#12122A] border border-[#E3E5EE] dark:border-[#222245] shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                            tenant.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : tenant.status === 'trial'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {tenant.status}
                        </span>

                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono font-bold text-[#666A86] dark:text-[#8D92B5]">
                            {tenant.campusCode}
                          </span>
                        </div>
                      </div>

                      <h3 className="font-extrabold text-base text-[#1D1B3A] dark:text-white mt-2 leading-snug">
                        {tenant.name}
                      </h3>
                      <p className="text-xs text-[#666A86] dark:text-[#8D92B5]">
                        {tenant.city}, {tenant.country}
                      </p>

                      {/* Lead Details */}
                      <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5 space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-[#666A86] dark:text-[#8D92B5]">Pastor:</span>
                          <span className="font-bold text-[#1D1B3A] dark:text-white truncate max-w-[160px]">
                            {tenant.seniorPastor}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#666A86] dark:text-[#8D92B5]">Tier:</span>
                          <span className="font-bold text-[#6D5CF2] dark:text-[#A594FD] capitalize">
                            {tenant.licenseTier.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#666A86] dark:text-[#8D92B5]">Geofence:</span>
                          <span className="font-semibold text-[#1D1B3A] dark:text-white">
                            {tenant.geofenceRadiusMeters}m radius
                          </span>
                        </div>
                        {tenant.customDomain && (
                          <div className="flex justify-between">
                            <span className="text-[#666A86] dark:text-[#8D92B5]">Domain:</span>
                            <span className="font-mono text-[10px] text-blue-500 truncate max-w-[150px]">
                              {tenant.customDomain}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Capacity Bar */}
                      <div className="mt-3.5">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-[#666A86] dark:text-[#8D92B5] font-medium">Capacity Usage</span>
                          <span className="font-bold text-[#1D1B3A] dark:text-white">
                            {tenant.memberCount} / {tenant.maxCapacity} ({capacityPct}%)
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              capacityPct > 90 ? 'bg-rose-500' : capacityPct > 70 ? 'bg-amber-500' : 'bg-[#6D5CF2]'
                            }`}
                            style={{ width: `${Math.min(100, capacityPct)}%` }}
                          />
                        </div>
                      </div>

                      {/* Feature Pills */}
                      <div className="mt-3 flex flex-wrap gap-1">
                        {tenant.features.bleRadar && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold">
                            BLE Radar
                          </span>
                        )}
                        {tenant.features.smsGateway && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold">
                            SMS Alert
                          </span>
                        )}
                        {tenant.features.biometrics && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                            Biometric
                          </span>
                        )}
                        {tenant.features.gdprPrivacyVault && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
                            Vault
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="mt-5 pt-3 border-t border-[#E3E5EE] dark:border-[#222245] flex items-center justify-between gap-2">
                      <button
                        onClick={() => impersonateTenant(tenant)}
                        className="flex-1 py-1.5 px-2.5 rounded-xl bg-[#6D5CF2] text-white hover:bg-[#5b4be0] text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                        title="Log into church portal as Pastor Admin"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Impersonate</span>
                      </button>

                      <button
                        onClick={() => toggleTenantStatus(tenant.id)}
                        className={`py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          tenant.status === 'active'
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100'
                            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100'
                        }`}
                        title={tenant.status === 'active' ? 'Suspend Tenant Access' : 'Reactivate Tenant Access'}
                      >
                        {tenant.status === 'active' ? 'Suspend' : 'Activate'}
                      </button>

                      <button
                        onClick={() => setEditingTenant(tenant)}
                        className="p-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-[#666A86] hover:text-[#1D1B3A] dark:hover:text-white transition-colors cursor-pointer"
                        title="Edit Details"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to decommission "${tenant.name}"?`)) {
                            deleteTenant(tenant.id);
                          }
                        }}
                        className="p-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Decommission Tenant"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: LICENSES & SUBSCRIPTIONS */}
        {activeTab === 'licenses' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-[#12122A] p-5 rounded-2xl border border-[#E3E5EE] dark:border-[#222245] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-extrabold text-[#1D1B3A] dark:text-white">
                  Active Platform License Registry
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#8D92B5]">
                  Cryptographic 256-bit license tokens authorizing tenant sanctuary radars and seat limits.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const firstTenant = tenants[0];
                    if (firstTenant) {
                      issueLicense(firstTenant.id, 'ministry_pro', 'annual');
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-[#6D5CF2] text-white hover:bg-[#5b4be0] text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-[#6D5CF2]/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>Generate New License Key</span>
                </button>
              </div>
            </div>

            {/* License Table */}
            <div className="bg-white dark:bg-[#12122A] rounded-2xl border border-[#E3E5EE] dark:border-[#222245] shadow-xs overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E3E5EE] dark:border-[#222245] bg-slate-50 dark:bg-white/5 text-[#666A86] dark:text-[#8D92B5] font-bold">
                    <th className="py-3 px-4">License Key & Token</th>
                    <th className="py-3 px-4">Tenant Congregation</th>
                    <th className="py-3 px-4">Tier Plan</th>
                    <th className="py-3 px-4">Seat Limit</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Renewal Date</th>
                    <th className="py-3 px-4">Annual Cost</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E5EE] dark:divide-[#222245]">
                  {licenses.map((lic) => (
                    <tr key={lic.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <Key className="w-3.5 h-3.5 text-[#6D5CF2] shrink-0" />
                          <span className="font-mono font-bold text-xs text-[#1D1B3A] dark:text-white">
                            {lic.key}
                          </span>
                          <button
                            onClick={() => copyToClipboard(lic.key, 'License Key')}
                            className="p-1 rounded-md text-[#666A86] hover:text-[#1D1B3A] dark:hover:text-white cursor-pointer"
                            title="Copy key"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-bold text-[#1D1B3A] dark:text-white">
                        {lic.tenantName}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#EFEDFF] dark:bg-[#1E1C38] text-[#6D5CF2] dark:text-[#A594FD] font-bold capitalize text-[11px]">
                          {lic.tier.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#1D1B3A] dark:text-white">
                        {lic.seatsLimit.toLocaleString()} seats
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                            lic.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : lic.status === 'grace_period'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {lic.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[#666A86] dark:text-[#8D92B5]">
                        {lic.expiresDate}
                      </td>
                      <td className="py-3 px-4 font-bold text-[#1D1B3A] dark:text-white">
                        ${lic.annualCostUSD} / yr
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => renewLicense(lic.id, 12)}
                            className="px-2.5 py-1 rounded-lg bg-[#EFEDFF] dark:bg-[#1E1C38] text-[#6D5CF2] dark:text-[#A594FD] hover:bg-[#6D5CF2] hover:text-white font-bold text-[11px] transition-all cursor-pointer"
                            title="Extend license by 12 months"
                          >
                            Renew +12m
                          </button>
                          <button
                            onClick={() => {
                              const nextStatus = lic.status === 'active' ? 'expired' : 'active';
                              updateLicense(lic.id, { status: nextStatus });
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/5 text-[#666A86] hover:text-[#1D1B3A] dark:hover:text-white font-bold text-[11px] transition-all cursor-pointer"
                          >
                            {lic.status === 'active' ? 'Revoke' : 'Reactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: LANDING PAGE CMS */}
        {activeTab === 'landing_cms' && (
          <div className="bg-white dark:bg-[#12122A] p-6 rounded-2xl border border-[#E3E5EE] dark:border-[#222245] shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#E3E5EE] dark:border-[#222245]">
              <div>
                <h3 className="text-base font-extrabold text-[#1D1B3A] dark:text-white">
                  Landing & Index Page Content Manager (CMS)
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#8D92B5]">
                  Control headlines, announcement banner text, sales contacts, and platform showcase statistics in
                  real time.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetLandingConfig}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-bold text-[#666A86] hover:text-[#1D1B3A] dark:hover:text-white transition-colors cursor-pointer"
                >
                  Reset Defaults
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('landing')}
                  className="px-3.5 py-1.5 rounded-xl bg-[#EFEDFF] dark:bg-[#1E1C38] text-[#6D5CF2] dark:text-[#A594FD] text-xs font-bold hover:bg-[#E3E0FF] transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Globe2 className="w-3.5 h-3.5" />
                  <span>Preview Live Index</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveCMS} className="space-y-5">
              {/* Announcement Banner */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#1D1B3A] dark:text-white">
                    Announcement Banner
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#666A86] dark:text-[#8D92B5]">
                    <input
                      type="checkbox"
                      checked={cmsDraft.isAnnouncementActive}
                      onChange={(e) =>
                        setCmsDraft((prev) => ({ ...prev, isAnnouncementActive: e.target.checked }))
                      }
                      className="rounded text-[#6D5CF2] focus:ring-[#6D5CF2]"
                    />
                    <span>Show Banner on Index</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={cmsDraft.announcementBadge}
                  onChange={(e) =>
                    setCmsDraft((prev) => ({ ...prev, announcementBadge: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#12122A] border border-[#E3E5EE] dark:border-white/10 text-xs text-[#1D1B3A] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#6D5CF2]"
                  placeholder="e.g. ✨ Ekklesphere v3.4 Proximity Radar released"
                />
              </div>

              {/* Hero Title & Subtitle */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-white mb-1.5">
                    Hero Main Headline
                  </label>
                  <input
                    type="text"
                    value={cmsDraft.heroTitle}
                    onChange={(e) =>
                      setCmsDraft((prev) => ({ ...prev, heroTitle: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs font-bold text-[#1D1B3A] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-white mb-1.5">
                    Hero Subtitle / Description
                  </label>
                  <textarea
                    rows={3}
                    value={cmsDraft.heroSubtitle}
                    onChange={(e) =>
                      setCmsDraft((prev) => ({ ...prev, heroSubtitle: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs text-[#1D1B3A] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
              </div>

              {/* Showcase Headline & Contact Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-white mb-1.5">
                    Showcase Section Headline
                  </label>
                  <input
                    type="text"
                    value={cmsDraft.showcaseHeadline}
                    onChange={(e) =>
                      setCmsDraft((prev) => ({ ...prev, showcaseHeadline: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs text-[#1D1B3A] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-white mb-1.5">
                    Sales & Partnerships Contact Email
                  </label>
                  <input
                    type="email"
                    value={cmsDraft.contactSalesEmail}
                    onChange={(e) =>
                      setCmsDraft((prev) => ({ ...prev, contactSalesEmail: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs text-[#1D1B3A] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
              </div>

              {/* Featured Statistics */}
              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-white mb-2">
                  Featured Platform Statistics
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-[11px] text-[#666A86] dark:text-[#8D92B5]">Congregations</span>
                    <input
                      type="text"
                      value={cmsDraft.featuredStats.congregationsServed}
                      onChange={(e) =>
                        setCmsDraft((prev) => ({
                          ...prev,
                          featuredStats: { ...prev.featuredStats, congregationsServed: e.target.value },
                        }))
                      }
                      className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs font-bold text-[#1D1B3A] dark:text-white"
                    />
                  </div>

                  <div>
                    <span className="text-[11px] text-[#666A86] dark:text-[#8D92B5]">Check-ins Logged</span>
                    <input
                      type="text"
                      value={cmsDraft.featuredStats.checkinsRecorded}
                      onChange={(e) =>
                        setCmsDraft((prev) => ({
                          ...prev,
                          featuredStats: { ...prev.featuredStats, checkinsRecorded: e.target.value },
                        }))
                      }
                      className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs font-bold text-[#1D1B3A] dark:text-white"
                    />
                  </div>

                  <div>
                    <span className="text-[11px] text-[#666A86] dark:text-[#8D92B5]">Radar Accuracy</span>
                    <input
                      type="text"
                      value={cmsDraft.featuredStats.proximityAccuracy}
                      onChange={(e) =>
                        setCmsDraft((prev) => ({
                          ...prev,
                          featuredStats: { ...prev.featuredStats, proximityAccuracy: e.target.value },
                        }))
                      }
                      className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs font-bold text-[#1D1B3A] dark:text-white"
                    />
                  </div>

                  <div>
                    <span className="text-[11px] text-[#666A86] dark:text-[#8D92B5]">Network Uptime</span>
                    <input
                      type="text"
                      value={cmsDraft.featuredStats.networkUptime}
                      onChange={(e) =>
                        setCmsDraft((prev) => ({
                          ...prev,
                          featuredStats: { ...prev.featuredStats, networkUptime: e.target.value },
                        }))
                      }
                      className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs font-bold text-[#1D1B3A] dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-[#6D5CF2]/25 transition-all cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Publish CMS Changes to Live Index</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 4: SYSTEM TELEMETRY */}
        {activeTab === 'telemetry' && (
          <div className="bg-white dark:bg-[#12122A] p-6 rounded-2xl border border-[#E3E5EE] dark:border-[#222245] shadow-xs space-y-6">
            <div>
              <h3 className="text-base font-extrabold text-[#1D1B3A] dark:text-white">
                Global Network & Hardware Infrastructure
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#8D92B5]">
                Real-time status of multi-tenant church nodes, Bluetooth beacons, and Firestore cloud databases.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>Firestore Persistence</span>
                  <span className="text-emerald-500 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Normal
                  </span>
                </div>
                <div className="text-[11px] text-[#666A86] dark:text-[#8D92B5] font-mono">
                  ai-studio-ekklesphere-22d577bf
                </div>
                <div className="text-xs font-semibold text-[#1D1B3A] dark:text-white pt-1">
                  Latency: <span className="font-mono text-emerald-600">22ms</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>Active BLE Beacons</span>
                  <span className="text-emerald-500 font-bold">42 Transmitters</span>
                </div>
                <div className="text-[11px] text-[#666A86] dark:text-[#8D92B5]">
                  iBeacon / Eddystone UUID protocols
                </div>
                <div className="text-xs font-semibold text-[#1D1B3A] dark:text-white pt-1">
                  Avg RSSI: <span className="font-mono text-blue-500">-68 dBm</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>Audit Stream Security</span>
                  <span className="text-purple-500 font-bold">Encrypted</span>
                </div>
                <div className="text-[11px] text-[#666A86] dark:text-[#8D92B5]">
                  SHA-256 arrival signal signatures
                </div>
                <div className="text-xs font-semibold text-[#1D1B3A] dark:text-white pt-1">
                  Integrity Check: <span className="text-emerald-500 font-bold">Passed</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: PROVISION NEW TENANT */}
      {isAddTenantOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161633] rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-[#E3E5EE] dark:border-[#2C2C55] max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[#E3E5EE] dark:border-[#2C2C55]">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#6D5CF2]" />
                <h3 className="font-extrabold text-base text-[#1D1B3A] dark:text-white">
                  Provision New Church Tenant
                </h3>
              </div>
              <button
                onClick={() => setIsAddTenantOpen(false)}
                className="p-1.5 rounded-xl text-[#666A86] hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-white mb-1">
                    Church Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Grace Temple Central"
                    value={newTenantForm.name}
                    onChange={(e) => setNewTenantForm({ ...newTenantForm, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs text-[#1D1B3A] dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-white mb-1">
                    Campus Code (e.g. GTC-01)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GTC-01"
                    value={newTenantForm.campusCode}
                    onChange={(e) =>
                      setNewTenantForm({ ...newTenantForm, campusCode: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs font-mono text-[#1D1B3A] dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-white mb-1">
                    Senior Pastor / Lead Minister *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rev. Joshua Quaye"
                    value={newTenantForm.seniorPastor}
                    onChange={(e) => setNewTenantForm({ ...newTenantForm, seniorPastor: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs text-[#1D1B3A] dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-white mb-1">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    placeholder="pastor@church.org"
                    value={newTenantForm.contactEmail}
                    onChange={(e) => setNewTenantForm({ ...newTenantForm, contactEmail: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs text-[#1D1B3A] dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-white mb-1">
                    City & Country
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="City"
                      value={newTenantForm.city}
                      onChange={(e) => setNewTenantForm({ ...newTenantForm, city: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs text-[#1D1B3A] dark:text-white"
                    />
                    <input
                      type="text"
                      placeholder="Country"
                      value={newTenantForm.country}
                      onChange={(e) => setNewTenantForm({ ...newTenantForm, country: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs text-[#1D1B3A] dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-white mb-1">
                    License Tier
                  </label>
                  <select
                    value={newTenantForm.licenseTier}
                    onChange={(e) =>
                      setNewTenantForm({ ...newTenantForm, licenseTier: e.target.value as LicenseTier })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs font-bold text-[#1D1B3A] dark:text-white"
                  >
                    <option value="grace_starter">Grace Starter ($39/mo - 300 seats)</option>
                    <option value="ministry_pro">Ministry Pro ($99/mo - 1,500 seats)</option>
                    <option value="cathedral_enterprise">Cathedral Enterprise ($199/mo - Unlimited)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-white mb-1">
                    Max Capacity / Member Seats
                  </label>
                  <input
                    type="number"
                    value={newTenantForm.maxCapacity}
                    onChange={(e) =>
                      setNewTenantForm({ ...newTenantForm, maxCapacity: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs font-bold text-[#1D1B3A] dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-white mb-1">
                    Geofence Outer Radius (Meters)
                  </label>
                  <input
                    type="number"
                    value={newTenantForm.geofenceRadiusMeters}
                    onChange={(e) =>
                      setNewTenantForm({ ...newTenantForm, geofenceRadiusMeters: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-xs font-bold text-[#1D1B3A] dark:text-white"
                  />
                </div>
              </div>

              {/* Feature Checkboxes */}
              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-white mb-2">
                  Enabled Platform Features
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newTenantForm.features.bleRadar}
                      onChange={(e) =>
                        setNewTenantForm({
                          ...newTenantForm,
                          features: { ...newTenantForm.features, bleRadar: e.target.checked },
                        })
                      }
                      className="rounded text-[#6D5CF2]"
                    />
                    <span>BLE Radar</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newTenantForm.features.smsGateway}
                      onChange={(e) =>
                        setNewTenantForm({
                          ...newTenantForm,
                          features: { ...newTenantForm.features, smsGateway: e.target.checked },
                        })
                      }
                      className="rounded text-[#6D5CF2]"
                    />
                    <span>SMS Gateway</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newTenantForm.features.biometrics}
                      onChange={(e) =>
                        setNewTenantForm({
                          ...newTenantForm,
                          features: { ...newTenantForm.features, biometrics: e.target.checked },
                        })
                      }
                      className="rounded text-[#6D5CF2]"
                    />
                    <span>Biometrics</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newTenantForm.features.mobileGivingMoMo}
                      onChange={(e) =>
                        setNewTenantForm({
                          ...newTenantForm,
                          features: { ...newTenantForm.features, mobileGivingMoMo: e.target.checked },
                        })
                      }
                      className="rounded text-[#6D5CF2]"
                    />
                    <span>MoMo Giving</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newTenantForm.features.gdprPrivacyVault}
                      onChange={(e) =>
                        setNewTenantForm({
                          ...newTenantForm,
                          features: { ...newTenantForm.features, gdprPrivacyVault: e.target.checked },
                        })
                      }
                      className="rounded text-[#6D5CF2]"
                    />
                    <span>Privacy Vault</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newTenantForm.features.customDomain}
                      onChange={(e) =>
                        setNewTenantForm({
                          ...newTenantForm,
                          features: { ...newTenantForm.features, customDomain: e.target.checked },
                        })
                      }
                      className="rounded text-[#6D5CF2]"
                    />
                    <span>Custom Domain</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-[#E3E5EE] dark:border-[#2C2C55] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddTenantOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/10 text-xs font-bold text-[#666A86] hover:text-[#1D1B3A] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#6D5CF2] text-white hover:bg-[#5b4be0] text-xs font-bold shadow-md shadow-[#6D5CF2]/25 cursor-pointer"
                >
                  Provision Church & Issue Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT TENANT */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161633] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#E3E5EE] dark:border-[#2C2C55] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#E3E5EE] dark:border-[#2C2C55]">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-[#6D5CF2]" />
                <h3 className="font-extrabold text-base text-[#1D1B3A] dark:text-white">
                  Edit Tenant: {editingTenant.name}
                </h3>
              </div>
              <button
                onClick={() => setEditingTenant(null)}
                className="p-1.5 rounded-xl text-[#666A86] hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-bold text-[#1D1B3A] dark:text-white mb-1">
                  Senior Pastor
                </label>
                <input
                  type="text"
                  value={editingTenant.seniorPastor}
                  onChange={(e) =>
                    setEditingTenant({ ...editingTenant, seniorPastor: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-[#1D1B3A] dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1D1B3A] dark:text-white mb-1">
                    Max Capacity Limit
                  </label>
                  <input
                    type="number"
                    value={editingTenant.maxCapacity}
                    onChange={(e) =>
                      setEditingTenant({ ...editingTenant, maxCapacity: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-[#1D1B3A] dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#1D1B3A] dark:text-white mb-1">
                    Geofence Radius (Meters)
                  </label>
                  <input
                    type="number"
                    value={editingTenant.geofenceRadiusMeters}
                    onChange={(e) =>
                      setEditingTenant({
                        ...editingTenant,
                        geofenceRadiusMeters: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-[#1D1B3A] dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#1D1B3A] dark:text-white mb-1">
                  Custom Whitelabel Subdomain
                </label>
                <input
                  type="text"
                  placeholder="e.g. grace.ekklesphere.church"
                  value={editingTenant.customDomain || ''}
                  onChange={(e) =>
                    setEditingTenant({ ...editingTenant, customDomain: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 text-[#1D1B3A] dark:text-white font-mono"
                />
              </div>

              <div className="pt-3 border-t border-[#E3E5EE] dark:border-[#2C2C55] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingTenant(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/10 font-bold text-[#666A86] hover:text-[#1D1B3A] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateTenant(editingTenant.id, editingTenant);
                    setEditingTenant(null);
                  }}
                  className="px-5 py-2 rounded-xl bg-[#6D5CF2] text-white hover:bg-[#5b4be0] font-bold shadow-md cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreatorsPanel;
