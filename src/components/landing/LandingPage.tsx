import React, { useState } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { LandingImages } from '../../assets/images';
import {
  ShieldCheck,
  Radio,
  Users,
  Compass,
  ArrowRight,
  Sun,
  Moon,
  Sparkles,
  Layers,
  Key,
  CheckCircle2,
  Lock,
  Smartphone,
  ChevronRight,
  Zap,
  Globe2,
  Sliders,
  Play,
  HeartHandshake,
  QrCode,
  Building2,
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const {
    landingConfig,
    setViewMode,
    theme,
    toggleTheme,
    tenants,
    licenses,
    switchUserRole,
  } = useEkklesphere();

  const activeTenantsCount = tenants.filter((t) => t.status === 'active').length;
  const activeLicensesCount = licenses.filter((l) => l.status === 'active').length;

  const handleLaunchRole = (role: 'admin' | 'usher' | 'member') => {
    switchUserRole(role);
    setViewMode('app');
  };

  return (
    <div className="min-h-screen bg-[#F5F6FA] dark:bg-[#0A0A18] text-[#1D1B3A] dark:text-[#F2F2FA] transition-colors duration-200 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Dynamic Announcement Bar */}
      {landingConfig.isAnnouncementActive && (
        <aside
          aria-label="System announcement"
          className="bg-gradient-to-r from-[#6D5CF2] via-[#8574F8] to-[#4F46E5] text-white py-2 px-4 text-xs font-medium text-center relative z-20 flex items-center justify-center gap-2 shadow-sm"
        >
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/20 text-white font-bold text-[10px] uppercase tracking-wider backdrop-blur-xs">
            <Sparkles className="w-3 h-3 text-amber-300" /> Live Platform
          </span>
          <span className="truncate max-w-xl">{landingConfig.announcementBadge}</span>
          <button
            onClick={() => setViewMode('creator')}
            className="hidden sm:inline-flex items-center gap-1 text-[11px] underline font-bold hover:text-white/80 transition-colors ml-1 cursor-pointer"
          >
            Manage in Creator Panel <ChevronRight className="w-3 h-3" />
          </button>
        </aside>
      )}

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/85 dark:bg-[#0E0E24]/85 border-b border-[#E3E5EE] dark:border-[#1E1E3A] transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#6D5CF2] to-[#4F46E5] flex items-center justify-center text-white font-black text-xl shadow-md shadow-[#6D5CF2]/25 ring-2 ring-[#6D5CF2]/30">
              <Radio className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg sm:text-xl tracking-tight text-[#1D1B3A] dark:text-[#FFFFFF]">
                  Ekklesphere
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#6D5CF2]/10 dark:bg-[#6D5CF2]/20 text-[#6D5CF2] dark:text-[#A594FD] border border-[#6D5CF2]/20">
                  Sovereign Church OS
                </span>
              </div>
              <span className="hidden sm:block text-[11px] font-medium text-[#7A7E9D] dark:text-[#8D92B5]">
                Presence Radar & Multi-Tenant Sanctuary Platform
              </span>
            </div>
          </div>

          {/* Center Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
            <a href="#features" className="hover:text-[#6D5CF2] dark:hover:text-white transition-colors">
              Platform Features
            </a>
            <a href="#showcase" className="hover:text-[#6D5CF2] dark:hover:text-white transition-colors">
              Hardware & Kiosks
            </a>
            <a href="#experiences" className="hover:text-[#6D5CF2] dark:hover:text-white transition-colors">
              Live Portals
            </a>
            <a href="#licensing" className="hover:text-[#6D5CF2] dark:hover:text-white transition-colors">
              Licensing Tiers
            </a>
            <a href="#tenants-network" className="hover:text-[#6D5CF2] dark:hover:text-white transition-colors">
              Campus Network
            </a>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer border border-[#E9EBF5] dark:border-white/10"
              title={theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Creator Console Access */}
            <button
              onClick={() => setViewMode('creator')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#EFEDFF] dark:bg-[#1E1C38] text-[#6D5CF2] dark:text-[#A594FD] hover:bg-[#E3E0FF] dark:hover:bg-[#28264A] transition-all cursor-pointer border border-[#6D5CF2]/20"
              title="Open Creator Multi-Tenant Control Panel"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Creators Panel</span>
              <span className="sm:hidden">Creator</span>
            </button>

            {/* Launch App / Enter Portal */}
            <button
              onClick={() => setViewMode('app')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] hover:bg-[#5b4be0] text-white shadow-md shadow-[#6D5CF2]/30 transition-all cursor-pointer transform active:scale-95"
            >
              <span>Launch Church App</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Hero Section */}
      <section className="relative pt-12 pb-16 sm:pt-20 sm:pb-24 overflow-hidden border-b border-[#E3E5EE] dark:border-[#1E1E3A]">
        {/* Ambient Gradient Background Glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[900px] h-[400px] bg-radial from-[#6D5CF2]/15 via-[#6D5CF2]/5 to-transparent blur-3xl pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EFEDFF] dark:bg-[#1F1E3A] border border-[#6D5CF2]/30 text-[#6D5CF2] dark:text-[#A594FD] text-xs font-bold shadow-xs">
              <Radio className="w-3.5 h-3.5 animate-spin" />
              <span>Next-Gen Autonomous Presence & Pastoral Care</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-[#1D1B3A] dark:text-[#FFFFFF] leading-[1.12]">
              {landingConfig.heroTitle}
            </h1>

            <p className="text-sm sm:text-base md:text-lg text-[#666A86] dark:text-[#A0A5C2] leading-relaxed max-w-2xl mx-auto">
              {landingConfig.heroSubtitle}
            </p>

            {/* CTA Button Group */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => setViewMode('app')}
                className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-[#6D5CF2] hover:bg-[#5C4BD9] text-white text-sm font-bold shadow-xl shadow-[#6D5CF2]/25 flex items-center justify-center gap-2 transition-all cursor-pointer transform hover:-translate-y-0.5 active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Launch Interactive Demo</span>
              </button>

              <button
                onClick={() => setViewMode('creator')}
                className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-white dark:bg-[#16162E] hover:bg-slate-50 dark:hover:bg-[#202040] text-[#1D1B3A] dark:text-[#F2F2FA] text-sm font-bold border border-[#E3E5EE] dark:border-[#2C2C50] shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Sliders className="w-4 h-4 text-[#6D5CF2]" />
                <span>Control Tenants & Licenses</span>
              </button>
            </div>

            {/* Quick Metrics Bar */}
            <div className="pt-8 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto">
              <div className="p-3 sm:p-4 rounded-2xl bg-white/70 dark:bg-[#121226]/80 backdrop-blur-xs border border-[#E3E5EE] dark:border-[#1E1E3A] text-left">
                <div className="text-xl sm:text-2xl font-black text-[#6D5CF2] dark:text-[#8C7DFF]">
                  {landingConfig.featuredStats.congregationsServed}
                </div>
                <div className="text-[11px] font-semibold text-[#666A86] dark:text-[#8D92B5]">
                  Congregations Served
                </div>
              </div>
              <div className="p-3 sm:p-4 rounded-2xl bg-white/70 dark:bg-[#121226]/80 backdrop-blur-xs border border-[#E3E5EE] dark:border-[#1E1E3A] text-left">
                <div className="text-xl sm:text-2xl font-black text-[#6D5CF2] dark:text-[#8C7DFF]">
                  {landingConfig.featuredStats.checkinsRecorded}
                </div>
                <div className="text-[11px] font-semibold text-[#666A86] dark:text-[#8D92B5]">
                  Check-ins Logged
                </div>
              </div>
              <div className="p-3 sm:p-4 rounded-2xl bg-white/70 dark:bg-[#121226]/80 backdrop-blur-xs border border-[#E3E5EE] dark:border-[#1E1E3A] text-left">
                <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {landingConfig.featuredStats.proximityAccuracy}
                </div>
                <div className="text-[11px] font-semibold text-[#666A86] dark:text-[#8D92B5]">
                  Radar Precision
                </div>
              </div>
              <div className="p-3 sm:p-4 rounded-2xl bg-white/70 dark:bg-[#121226]/80 backdrop-blur-xs border border-[#E3E5EE] dark:border-[#1E1E3A] text-left">
                <div className="text-xl sm:text-2xl font-black text-[#6D5CF2] dark:text-[#8C7DFF]">
                  {landingConfig.featuredStats.networkUptime}
                </div>
                <div className="text-[11px] font-semibold text-[#666A86] dark:text-[#8D92B5]">
                  Platform SLA
                </div>
              </div>
            </div>
          </div>

          {/* Hero Sanctuary Visual Showcase */}
          <div className="mt-12 sm:mt-16 relative max-w-5xl mx-auto">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl border-4 border-white dark:border-[#222245] group">
              <img
                src={LandingImages.churchHeroGathering}
                alt="Modern Church Sanctuary Congregation Gathering with warm architectural light"
                className="w-full h-[280px] sm:h-[460px] md:h-[540px] object-cover transition-transform duration-700 group-hover:scale-102"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex flex-col justify-end p-5 sm:p-8 text-white">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/25 border border-emerald-400/40 text-emerald-300 text-xs font-bold mb-2 backdrop-blur-md">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      Live Sunday Morning Service Radar Active
                    </div>
                    <h3 className="text-lg sm:text-2xl font-black tracking-tight text-white drop-shadow-md">
                      Accra Central Cathedral — Independence Avenue
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-200 drop-shadow-xs max-w-xl">
                      Automated Bluetooth LE beacons and 300m boundary geofencing logging 408 verified members
                      with zero physical queues.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 p-3 rounded-2xl">
                    <div className="text-center px-2">
                      <div className="text-lg sm:text-xl font-black text-white font-mono">408</div>
                      <div className="text-[10px] uppercase font-bold text-slate-300">Present</div>
                    </div>
                    <div className="w-px h-8 bg-white/20" />
                    <div className="text-center px-2">
                      <div className="text-lg sm:text-xl font-black text-amber-300 font-mono">520</div>
                      <div className="text-[10px] uppercase font-bold text-slate-300">Expected</div>
                    </div>
                    <div className="w-px h-8 bg-white/20" />
                    <div className="text-center px-2">
                      <div className="text-lg sm:text-xl font-black text-emerald-400 font-mono">78%</div>
                      <div className="text-[10px] uppercase font-bold text-slate-300">Capacity</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Spotlight with Generated Images */}
      <section id="showcase" className="py-16 sm:py-24 bg-white dark:bg-[#0E0E22] transition-colors border-b border-[#E3E5EE] dark:border-[#1E1E3A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#6D5CF2] dark:text-[#A594FD]">
              Hardware & In-Person Kiosks
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-[#1D1B3A] dark:text-[#FFFFFF] tracking-tight">
              {landingConfig.showcaseHeadline}
            </h2>
            <p className="text-xs sm:text-sm text-[#666A86] dark:text-[#8D92B5]">
              Seamless coexistence of high-tech autonomy and warm hospitality at sanctuary doors.
            </p>
          </div>

          {/* 2-Column Showcase Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
            {/* Card 1: Foyer Check-in Kiosk */}
            <div className="rounded-3xl bg-[#F8F9FD] dark:bg-[#14142B] border border-[#E3E5EE] dark:border-[#222242] p-6 sm:p-8 flex flex-col justify-between overflow-hidden group hover:shadow-xl transition-all">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EFEDFF] dark:bg-[#1F1E3A] text-[#6D5CF2] dark:text-[#A594FD] text-xs font-bold">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Welcome Desk & Door Kiosks</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-[#1D1B3A] dark:text-[#FFFFFF]">
                  Sub-Second Door Usher Station
                </h3>
                <p className="text-xs sm:text-sm text-[#666A86] dark:text-[#A0A5C2] leading-relaxed">
                  Equip door stewards and ushers with tablet and smartphone check-in terminals. Supports offline
                  queuing, zero connectivity buffering, instant first-time visitor registration, and dynamic QR
                  scanning without bottlenecks.
                </p>
              </div>

              <div className="mt-6 rounded-2xl overflow-hidden border border-[#E3E5EE] dark:border-[#222242] shadow-md relative">
                <img
                  src={LandingImages.mobileCheckinKiosk}
                  alt="Modern church foyer check-in desk with tablet stand and welcoming door stewards"
                  className="w-full h-56 sm:h-72 object-cover transition-transform duration-500 group-hover:scale-102"
                />
                <div className="absolute bottom-3 left-3 bg-black/75 backdrop-blur-md text-white text-[11px] font-semibold px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Instant Family Check-in & Offline Buffer Queue</span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[#E3E5EE] dark:border-[#222242] flex items-center justify-between">
                <span className="text-xs font-bold text-[#666A86] dark:text-[#8D92B5]">
                  Door Scanner Station
                </span>
                <button
                  onClick={() => handleLaunchRole('usher')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#6D5CF2] dark:text-[#A594FD] hover:underline cursor-pointer"
                >
                  Test Usher Scanner <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Card 2: Pastoral Analytics & Radar */}
            <div className="rounded-3xl bg-[#F8F9FD] dark:bg-[#14142B] border border-[#E3E5EE] dark:border-[#222242] p-6 sm:p-8 flex flex-col justify-between overflow-hidden group hover:shadow-xl transition-all">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                  <Radio className="w-3.5 h-3.5" />
                  <span>Pastoral Care Telemetry</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-[#1D1B3A] dark:text-[#FFFFFF]">
                  Real-Time Radar & 28-Field Roster
                </h3>
                <p className="text-xs sm:text-sm text-[#666A86] dark:text-[#A0A5C2] leading-relaxed">
                  Pastoral leaders access real-time presence heatmaps, automatic alerts when congregants miss 2 or
                  3 consecutive weeks, 28-field verified demographic registry, cell group distribution, and
                  integrated MTN MoMo / Telecel Cash giving.
                </p>
              </div>

              <div className="mt-6 rounded-2xl overflow-hidden border border-[#E3E5EE] dark:border-[#222242] shadow-md relative">
                <img
                  src={LandingImages.pastorAnalyticsScreen}
                  alt="Pastoral attendance analytics screen with geofence telemetry and membership graphs"
                  className="w-full h-56 sm:h-72 object-cover transition-transform duration-500 group-hover:scale-102"
                />
                <div className="absolute bottom-3 left-3 bg-black/75 backdrop-blur-md text-white text-[11px] font-semibold px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  <span>Proactive Absentee Alerts & Care Workflows</span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[#E3E5EE] dark:border-[#222242] flex items-center justify-between">
                <span className="text-xs font-bold text-[#666A86] dark:text-[#8D92B5]">
                  Pastor Admin Console
                </span>
                <button
                  onClick={() => handleLaunchRole('admin')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#6D5CF2] dark:text-[#A594FD] hover:underline cursor-pointer"
                >
                  Test Pastor Dashboard <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Interactive Experience Switcher */}
      <section id="experiences" className="py-16 sm:py-20 border-b border-[#E3E5EE] dark:border-[#1E1E3A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#6D5CF2] dark:text-[#A594FD]">
              Instant Role Exploration
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-[#1D1B3A] dark:text-[#FFFFFF]">
              Experience Every Portal in 1 Click
            </h2>
            <p className="text-xs sm:text-sm text-[#666A86] dark:text-[#8D92B5]">
              Switch roles immediately with fully pre-populated demo data and simulated hardware signals.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Pastor Admin */}
            <div
              onClick={() => handleLaunchRole('admin')}
              className="p-5 rounded-2xl bg-white dark:bg-[#121226] border border-[#E3E5EE] dark:border-[#222240] hover:border-[#6D5CF2] dark:hover:border-[#6D5CF2] shadow-xs hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-[#6D5CF2] flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm sm:text-base text-[#1D1B3A] dark:text-white">
                  Pastor Admin
                </h4>
                <p className="text-xs text-[#666A86] dark:text-[#8D92B5] mt-1.5 leading-relaxed">
                  View real-time church attendance, 28-field roster, automated care tasks, and campus settings.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#E3E5EE] dark:border-[#222240] flex items-center justify-between text-xs font-bold text-[#6D5CF2] dark:text-[#A594FD]">
                <span>Launch Portal</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* 2. Door Usher */}
            <div
              onClick={() => handleLaunchRole('usher')}
              className="p-5 rounded-2xl bg-white dark:bg-[#121226] border border-[#E3E5EE] dark:border-[#222240] hover:border-[#6D5CF2] dark:hover:border-[#6D5CF2] shadow-xs hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-500 flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition-transform">
                  <QrCode className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm sm:text-base text-[#1D1B3A] dark:text-white">
                  Door Usher Scanner
                </h4>
                <p className="text-xs text-[#666A86] dark:text-[#8D92B5] mt-1.5 leading-relaxed">
                  Fast door check-in, offline queue sync, quick search, and first-time guest registration.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#E3E5EE] dark:border-[#222240] flex items-center justify-between text-xs font-bold text-blue-500">
                <span>Launch Scanner</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* 3. Member Pass */}
            <div
              onClick={() => handleLaunchRole('member')}
              className="p-5 rounded-2xl bg-white dark:bg-[#121226] border border-[#E3E5EE] dark:border-[#222240] hover:border-[#6D5CF2] dark:hover:border-[#6D5CF2] shadow-xs hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition-transform">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm sm:text-base text-[#1D1B3A] dark:text-white">
                  Member Mobile Pass
                </h4>
                <p className="text-xs text-[#666A86] dark:text-[#8D92B5] mt-1.5 leading-relaxed">
                  Personal QR pass, cellular geofence auto check-in, MTN MoMo giving, and event RSVP.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#E3E5EE] dark:border-[#222240] flex items-center justify-between text-xs font-bold text-emerald-500">
                <span>Launch Pass</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* 4. Creator Console */}
            <div
              onClick={() => setViewMode('creator')}
              className="p-5 rounded-2xl bg-gradient-to-br from-[#6D5CF2]/10 to-[#4F46E5]/10 border-2 border-[#6D5CF2]/40 dark:border-[#6D5CF2]/50 hover:border-[#6D5CF2] shadow-xs hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between relative overflow-hidden"
            >
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#6D5CF2] text-white text-[9px] font-extrabold uppercase">
                New
              </div>
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#6D5CF2] text-white flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition-transform shadow-md shadow-[#6D5CF2]/30">
                  <Sliders className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm sm:text-base text-[#1D1B3A] dark:text-white">
                  Creators Platform
                </h4>
                <p className="text-xs text-[#666A86] dark:text-[#8D92B5] mt-1.5 leading-relaxed">
                  Control all church tenants, generate license keys, configure landing CMS, and view global quotas.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#6D5CF2]/20 flex items-center justify-between text-xs font-bold text-[#6D5CF2] dark:text-[#A594FD]">
                <span>Open Console</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Licensing Tiers Comparison */}
      <section id="licensing" className="py-16 sm:py-24 bg-white dark:bg-[#0E0E22] transition-colors border-b border-[#E3E5EE] dark:border-[#1E1E3A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[#6D5CF2] dark:text-[#A594FD]">
              Flexible Church Licensing
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-[#1D1B3A] dark:text-[#FFFFFF] tracking-tight">
              Transparent Plans for Every Congregation Size
            </h2>
            <p className="text-xs sm:text-sm text-[#666A86] dark:text-[#8D92B5]">
              Managed and provisioned dynamically inside the Creator Control Panel.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch max-w-6xl mx-auto">
            {/* Grace Starter */}
            <div className="p-7 rounded-3xl bg-[#F8F9FD] dark:bg-[#14142B] border border-[#E3E5EE] dark:border-[#222242] flex flex-col justify-between hover:shadow-lg transition-all">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg text-[#1D1B3A] dark:text-white">Grace Starter</h3>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-200 dark:bg-white/10 text-[#666A86] dark:text-slate-300">
                    Single Campus
                  </span>
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl sm:text-4xl font-black text-[#1D1B3A] dark:text-white">$39</span>
                  <span className="text-xs text-[#666A86] dark:text-[#8D92B5]">/ month</span>
                </div>
                <p className="text-xs text-[#666A86] dark:text-[#8D92B5] mt-2">
                  Ideal for emerging churches and community fellowship plants.
                </p>

                <div className="mt-6 space-y-3 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Up to 300 Registered Members</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Usher Door Scanner & QR Pass</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>28-Field Member Directory</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>MoMo & Card Giving Portal</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#9A9EB8] line-through">
                    <CheckCircle2 className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                    <span>BLE Proximity Radar</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setViewMode('creator')}
                className="w-full mt-8 py-2.5 rounded-xl bg-white dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 font-bold text-xs text-[#1D1B3A] dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                Provision Starter License
              </button>
            </div>

            {/* Ministry Pro (Featured) */}
            <div className="p-7 rounded-3xl bg-white dark:bg-[#161633] border-2 border-[#6D5CF2] shadow-2xl shadow-[#6D5CF2]/15 flex flex-col justify-between relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[#6D5CF2] text-white text-[10px] font-extrabold uppercase tracking-wider shadow-sm">
                Most Popular
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg text-[#1D1B3A] dark:text-white">Ministry Pro</h3>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#EFEDFF] dark:bg-[#6D5CF2]/20 text-[#6D5CF2] dark:text-[#A594FD]">
                    Up to 3 Campuses
                  </span>
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl sm:text-4xl font-black text-[#6D5CF2] dark:text-[#A594FD]">$99</span>
                  <span className="text-xs text-[#666A86] dark:text-[#8D92B5]">/ month</span>
                </div>
                <p className="text-xs text-[#666A86] dark:text-[#8D92B5] mt-2">
                  Designed for growing churches requiring automated attendance radar.
                </p>

                <div className="mt-6 space-y-3 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Up to 1,500 Registered Members</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>BLE Proximity Radar (Sub-Meter)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Automated Absentee Care Triggers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>SMS Gateway (Hubtel) Integration</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Custom Whitelabel Subdomain</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setViewMode('creator')}
                className="w-full mt-8 py-2.5 rounded-xl bg-[#6D5CF2] text-white font-bold text-xs hover:bg-[#5b4be0] shadow-md shadow-[#6D5CF2]/30 transition-all cursor-pointer"
              >
                Provision Ministry Pro
              </button>
            </div>

            {/* Cathedral Enterprise */}
            <div className="p-7 rounded-3xl bg-[#F8F9FD] dark:bg-[#14142B] border border-[#E3E5EE] dark:border-[#222242] flex flex-col justify-between hover:shadow-lg transition-all">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg text-[#1D1B3A] dark:text-white">Cathedral Enterprise</h3>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                    Unlimited Campuses
                  </span>
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl sm:text-4xl font-black text-[#1D1B3A] dark:text-white">$199</span>
                  <span className="text-xs text-[#666A86] dark:text-[#8D92B5]">/ month</span>
                </div>
                <p className="text-xs text-[#666A86] dark:text-[#8D92B5] mt-2">
                  For mega-churches, dioceses, and multi-branch denominations.
                </p>

                <div className="mt-6 space-y-3 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Unlimited Members & Campuses</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Biometric Check-in Verification</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>GDPR & Data Protection Privacy Vault</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Immutable Audit Log Stream</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Dedicated SLA & Database Partition</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setViewMode('creator')}
                className="w-full mt-8 py-2.5 rounded-xl bg-white dark:bg-white/5 border border-[#E3E5EE] dark:border-white/10 font-bold text-xs text-[#1D1B3A] dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                Provision Cathedral License
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Campus Tenants Network Showcase */}
      <section id="tenants-network" className="py-16 sm:py-20 border-b border-[#E3E5EE] dark:border-[#1E1E3A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 mb-8">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#6D5CF2] dark:text-[#A594FD]">
                Active Congregations
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-[#1D1B3A] dark:text-[#FFFFFF] mt-1">
                Connected Church Campuses
              </h2>
              <p className="text-xs sm:text-sm text-[#666A86] dark:text-[#8D92B5]">
                {activeTenantsCount} church tenants configured with live licenses and geofence radars.
              </p>
            </div>

            <button
              onClick={() => setViewMode('creator')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#EFEDFF] dark:bg-[#1E1C38] text-[#6D5CF2] dark:text-[#A594FD] hover:bg-[#E3E0FF] transition-all cursor-pointer"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Add Church in Creator Panel</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tenants.map((tenant) => (
              <div
                key={tenant.id}
                className="p-5 rounded-2xl bg-white dark:bg-[#121226] border border-[#E3E5EE] dark:border-[#222240] hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
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
                    <span className="text-[10px] font-mono text-[#666A86] dark:text-[#8D92B5]">
                      {tenant.campusCode}
                    </span>
                  </div>

                  <h4 className="font-extrabold text-base text-[#1D1B3A] dark:text-white mt-2">
                    {tenant.name}
                  </h4>
                  <p className="text-xs text-[#666A86] dark:text-[#8D92B5]">
                    {tenant.city}, {tenant.country}
                  </p>
                  <p className="text-[11px] text-[#7A7E9D] dark:text-[#7D82A5] mt-1">
                    Senior Pastor: <span className="font-semibold">{tenant.seniorPastor}</span>
                  </p>

                  <div className="mt-4 pt-3 border-t border-[#E3E5EE] dark:border-[#222240] flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-[#1D1B3A] dark:text-white">{tenant.memberCount}</span>
                      <span className="text-[#666A86] dark:text-[#8D92B5]"> / {tenant.maxCapacity} seats</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-[#666A86] dark:text-slate-300">
                      {tenant.licenseTier.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-2 flex items-center gap-2">
                  <button
                    onClick={() => {
                      // Impersonate or launch app as this church
                      setViewMode('app');
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-[#EFEDFF] dark:bg-[#1E1C38] text-[#6D5CF2] dark:text-[#A594FD] hover:bg-[#6D5CF2] hover:text-white text-xs font-bold transition-all cursor-pointer text-center"
                  >
                    Enter Church App
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Creator Platform Callout Footer Banner */}
      <section className="py-12 bg-gradient-to-r from-[#1D1B3A] via-[#24214D] to-[#121124] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-amber-300 text-[10px] font-extrabold uppercase tracking-wider">
              <Key className="w-3 h-3" /> System Administrators & Platform Owners
            </div>
            <h3 className="text-xl sm:text-2xl font-black">
              Manage Multi-Tenant Architecture & License Distribution
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
              Add new church branches, generate 256-bit license keys, tweak geofence perimeters, and update live
              landing page announcements directly in the Creators Panel.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setViewMode('creator')}
              className="px-5 py-3 rounded-xl bg-white text-[#1D1B3A] hover:bg-slate-100 text-xs font-black shadow-lg transition-all cursor-pointer flex items-center gap-2"
            >
              <Sliders className="w-4 h-4 text-[#6D5CF2]" />
              <span>Open Creators Panel</span>
            </button>
          </div>
        </div>
      </section>

      {/* Public Footer */}
      <footer className="mt-auto py-8 bg-[#EAECEF] dark:bg-[#070712] border-t border-[#DDE0EB] dark:border-[#17172B] text-xs text-[#666A86] dark:text-[#7F84A8] transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-[#1D1B3A] dark:text-white">Ekklesphere</span>
            <span>&copy; {new Date().getFullYear()} Sovereign Sanctuary Operating System.</span>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <button
              onClick={() => setViewMode('creator')}
              className="hover:text-[#6D5CF2] dark:hover:text-white transition-colors cursor-pointer"
            >
              Creators Console
            </button>
            <span>&bull;</span>
            <button
              onClick={() => setViewMode('app')}
              className="hover:text-[#6D5CF2] dark:hover:text-white transition-colors cursor-pointer"
            >
              Church App Portals
            </button>
            <span>&bull;</span>
            <a
              href={`mailto:${landingConfig.contactSalesEmail}`}
              className="hover:text-[#6D5CF2] dark:hover:text-white transition-colors"
            >
              {landingConfig.contactSalesEmail}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
