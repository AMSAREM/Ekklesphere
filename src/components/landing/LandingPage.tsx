import React, { useState, useEffect } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { BrandLogo } from '../common/BrandLogo';
import {
  Radio,
  Users,
  ArrowRight,
  Sun,
  Moon,
  Sparkles,
  CheckCircle2,
  Lock,
  Smartphone,
  ChevronRight,
  Zap,
  QrCode,
  ShieldCheck,
  Calendar,
  X,
  Send,
  Clock,
  Activity,
  MapPin,
  Signal,
  Eye,
  HeartHandshake,
  ExternalLink,
  ChevronDown,
  Layers,
  Check,
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const {
    landingConfig,
    setViewMode,
    theme,
    toggleTheme,
    tenants,
    switchUserRole,
    systemSettings,
    services,
    members,
    showToast,
  } = useEkklesphere();

  const [activeNav, setActiveNav] = useState<'home' | 'radar' | 'pillars' | 'schedule' | 'portals'>('home');
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [selectedRolePreview, setSelectedRolePreview] = useState<'admin' | 'usher' | 'member'>('admin');

  // Interactive Radar Simulation state
  const [simDistance, setSimDistance] = useState<number>(140);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simStep, setSimStep] = useState<string>('idle'); // 'idle' | 'locating' | 'perimeter' | 'verified'

  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    church: systemSettings.churchName || 'PIWC Kwadaso',
    congregationSize: '250-500',
    message: '',
  });

  const activeTenantsCount = tenants.filter((t) => t.status === 'active').length;
  const currentChurchName = systemSettings.churchName || 'PIWC Kwadaso';
  const currentCampus = systemSettings.campusName || 'Central Sanctuary';
  const currentGps = systemSettings.campusAddress || 'AK-039-2041, Kwadaso';

  // Handle direct role navigation
  const handleLaunchRole = (role: 'admin' | 'usher' | 'member') => {
    switchUserRole(role);
    setViewMode('app');
  };

  // Run automated radar walk-in simulation
  const handleRunRadarSimulation = () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setSimStep('locating');
    setSimDistance(240);

    setTimeout(() => {
      setSimStep('perimeter');
      setSimDistance(85);
    }, 1100);

    setTimeout(() => {
      setSimStep('verified');
      setSimDistance(25);
    }, 2400);

    setTimeout(() => {
      setIsSimulating(false);
    }, 4200);
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name.trim() || !contactForm.email.trim()) {
      showToast('Please enter your name and email address');
      return;
    }
    showToast(`Thank you ${contactForm.name}! Our sanctuary systems architect will contact you shortly.`);
    setIsContactModalOpen(false);
    setContactForm({
      name: '',
      email: '',
      phone: '',
      church: currentChurchName,
      congregationSize: '250-500',
      message: '',
    });
  };

  // Computed state for distance slider
  const getRadarZone = (dist: number) => {
    if (dist <= 40) return { label: 'Inner Sanctuary (BLE Lock)', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', status: 'Autonomous Attendance Verified' };
    if (dist <= 100) return { label: 'Campus Perimeter (Geofence)', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30', status: 'Dwell Timer Active (Anti-Driveby)' };
    return { label: 'Outside Perimeter', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30', status: 'GPS Idle · Zero Battery Consumption' };
  };

  const currentZone = getRadarZone(simDistance);

  return (
    <div className="min-h-screen bg-[#0F0F14] text-[#F3F4F6] font-['Plus_Jakarta_Sans',sans-serif] flex flex-col items-center justify-start p-3 sm:p-5 lg:p-7 relative selection:bg-[#1877F2] selection:text-white">
      
      {/* Ambient background glow accents */}
      <div 
        aria-hidden="true" 
        className="fixed top-[-150px] left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-b from-[#6D5CF2]/15 via-[#1877F2]/10 to-transparent blur-[140px] pointer-events-none -z-10" 
      />

      {/* =========================================================================
          HERO ENCLOSURE: Sleek Framed Viewport (Inspired by the Reference Layout)
          ========================================================================= */}
      <div className="w-full max-w-[1380px] rounded-[32px] sm:rounded-[44px] border border-white/20 dark:border-white/15 bg-gradient-to-b from-[#181822] via-[#14141C] to-[#111117] shadow-[0_30px_90px_rgba(0,0,0,0.65)] overflow-hidden relative min-h-[640px] sm:min-h-[720px] lg:min-h-[780px] flex flex-col justify-between">
        
        {/* Subtle radial sanctuary spotlight */}
        <div 
          aria-hidden="true"
          className="absolute top-0 right-0 w-[650px] h-[650px] bg-radial from-[#6D5CF2]/12 via-transparent to-transparent pointer-events-none"
        />

        {/* -----------------------------------------------------------------------
            TOP FLOATING NAVBAR (Inside the hero frame)
            ----------------------------------------------------------------------- */}
        <header className="relative z-20 w-full pt-4 sm:pt-6 px-4 sm:px-8">
          <div className="w-full max-w-6xl mx-auto rounded-full bg-[#1A1A24]/75 backdrop-blur-xl border border-white/12 px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3 shadow-2xl">
            
            {/* Brand Mark: Official Ekklesphere logo */}
            <button
              onClick={() => {
                setActiveNav('home');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-2.5 group cursor-pointer focus:outline-none"
              aria-label="Ekklesphere Home"
            >
              <BrandLogo size="sm" surface="dark" />
            </button>

            {/* Center Navigation Links with active highlight */}
            <nav className="hidden lg:flex items-center gap-7 text-xs font-medium text-slate-300">
              <button
                onClick={() => {
                  setActiveNav('home');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`transition-colors cursor-pointer py-1 relative ${activeNav === 'home' ? 'text-white font-semibold' : 'hover:text-white'}`}
              >
                Overview
                {activeNav === 'home' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1877F2] rounded-full" />}
              </button>
              <a
                href="#radar"
                onClick={() => setActiveNav('radar')}
                className={`transition-colors cursor-pointer py-1 relative ${activeNav === 'radar' ? 'text-white font-semibold' : 'hover:text-white'}`}
              >
                Sanctuary Radar
                {activeNav === 'radar' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1877F2] rounded-full" />}
              </a>
              <a
                href="#pillars"
                onClick={() => setActiveNav('pillars')}
                className={`transition-colors cursor-pointer py-1 relative ${activeNav === 'pillars' ? 'text-white font-semibold' : 'hover:text-white'}`}
              >
                Ministry Pillars
                {activeNav === 'pillars' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1877F2] rounded-full" />}
              </a>
              <a
                href="#schedule"
                onClick={() => setActiveNav('schedule')}
                className={`transition-colors cursor-pointer py-1 relative ${activeNav === 'schedule' ? 'text-white font-semibold' : 'hover:text-white'}`}
              >
                Service Schedule
                {activeNav === 'schedule' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1877F2] rounded-full" />}
              </a>
              <a
                href="#portals"
                onClick={() => setActiveNav('portals')}
                className={`transition-colors cursor-pointer py-1 relative ${activeNav === 'portals' ? 'text-white font-semibold' : 'hover:text-white'}`}
              >
                Role Portals
                {activeNav === 'portals' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1877F2] rounded-full" />}
              </a>
            </nav>

            {/* Right Actions: Portals, Theme, Creator & Contact */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              <button
                onClick={() => setViewMode('creator')}
                className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-medium border border-white/10 transition-colors cursor-pointer"
                title="Creator & Architecture Console"
              >
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>Creator</span>
              </button>

              <button
                onClick={toggleTheme}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-colors border border-white/10 cursor-pointer"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Moon className="w-3.5 h-3.5 text-purple-300" />}
              </button>

              <button
                onClick={() => setIsContactModalOpen(true)}
                className="px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full border border-white/30 hover:border-white/60 bg-white/5 hover:bg-white/10 text-white text-xs font-medium transition-all shadow-sm cursor-pointer"
              >
                Contact
              </button>

              <button
                onClick={() => setViewMode('app')}
                className="px-4 sm:px-5 py-1.5 sm:py-2 rounded-full bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-semibold tracking-wide shadow-md shadow-blue-600/30 hover:shadow-blue-600/50 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>Launch Portal</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </header>

        {/* -----------------------------------------------------------------------
            HERO MAIN SECTION: Split Layout with Powerful Copy & Live Sanctuary HUD
            ----------------------------------------------------------------------- */}
        <div className="relative z-10 w-full px-6 sm:px-10 lg:px-16 pt-8 sm:pt-12 pb-8 sm:pb-12 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          
          {/* Left Hero Column: Compelling Ministry Typography */}
          <div className="lg:col-span-7 space-y-6 max-w-2xl">
            
            {/* Reverent announcement kicker */}
            <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Autonomous Proximity Radar v2.4 Active</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">Ghana Act 843 Compliant</span>
            </div>

            {/* Giant Bold Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-[72px] font-bold text-white tracking-tight leading-[1.04]">
              Presence without<br />
              <span className="font-['Instrument_Serif',serif] italic font-normal text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-indigo-200 to-purple-300">
                effortless grace.
              </span>
            </h1>

            {/* Subtitle with Clear Ministry Mission */}
            <p className="text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed font-normal">
              Silent Bluetooth beacon & GPS boundary attendance, 0.4-second door steward headcount, proactive pastoral retention, and mobile money giving — engineered for vibrant congregations.
            </p>

            {/* Primary & Secondary Action Buttons (matching the reference styling) */}
            <div className="pt-2 flex flex-wrap items-center gap-3 sm:gap-4">
              <button
                onClick={() => setViewMode('app')}
                className="px-6 sm:px-8 py-3.5 rounded-full bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs sm:text-sm font-semibold tracking-wide shadow-xl shadow-blue-600/35 hover:shadow-blue-600/50 transition-all cursor-pointer transform hover:-translate-y-0.5 active:scale-95 inline-flex items-center gap-2"
              >
                <span>Launch Sanctuary Portal</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={handleRunRadarSimulation}
                className="px-6 sm:px-7 py-3.5 rounded-full border border-white/30 hover:border-white/60 bg-white/5 hover:bg-white/10 text-white text-xs sm:text-sm font-semibold tracking-wide backdrop-blur-sm transition-all cursor-pointer transform hover:-translate-y-0.5 active:scale-95 inline-flex items-center gap-2"
              >
                <Radio className={`w-4 h-4 ${isSimulating ? 'text-emerald-400 animate-spin' : 'text-blue-400'}`} />
                <span>{isSimulating ? 'Simulating Arrival...' : 'Experience Live Radar'}</span>
              </button>

              <button
                onClick={() => setViewMode('creator')}
                className="px-4 py-3.5 rounded-full text-slate-400 hover:text-white text-xs font-semibold tracking-wide transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>Creator Console</span>
              </button>
            </div>

            {/* Quick stats micro-strip */}
            <div className="pt-4 flex items-center gap-6 sm:gap-8 text-xs border-t border-white/10 text-slate-400">
              <div>
                <span className="block font-mono tabular-nums text-white font-bold text-sm sm:text-base">99.8%</span>
                <span className="text-[11px] text-slate-400">Radar Accuracy</span>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <div>
                <span className="block font-mono tabular-nums text-white font-bold text-sm sm:text-base">&lt; 0.4s</span>
                <span className="text-[11px] text-slate-400">Door Scan Speed</span>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <div>
                <span className="block font-mono tabular-nums text-emerald-400 font-bold text-sm sm:text-base">0 Wasted Mins</span>
                <span className="text-[11px] text-slate-400">Manual Headcount</span>
              </div>
            </div>

          </div>

          {/* Right Hero Column: Interactive Sanctuary Presence Card & Radar HUD */}
          <div className="lg:col-span-5 relative">
            
            {/* Glowing backdrop halo */}
            <div 
              aria-hidden="true" 
              className="absolute inset-0 bg-gradient-to-tr from-[#1877F2]/20 via-[#6D5CF2]/15 to-transparent rounded-3xl blur-2xl -z-10" 
            />

            {/* The Sanctuary Presence HUD Card */}
            <div className="w-full rounded-3xl bg-[#171722]/90 border border-white/15 p-5 sm:p-6 shadow-2xl backdrop-blur-md space-y-5">
              
              {/* Header: Campus location & Live Status */}
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white leading-tight">{currentChurchName}</h4>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <span>{currentCampus}</span>
                      <span>·</span>
                      <span className="font-mono text-slate-500">{currentGps}</span>
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>Live Service</span>
                  </div>
                  <span className="block text-[10px] text-slate-400 font-mono mt-0.5 tabular-nums">
                    {services[0]?.startsAt || '08:00'} - {services[0]?.endsAt || '10:30'}
                  </span>
                </div>
              </div>

              {/* Interactive Radar Visualizer Screen */}
              <div className="relative h-48 sm:h-52 w-full rounded-2xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center">
                
                {/* Concentric radar rings */}
                <div className="absolute w-44 h-44 rounded-full border border-blue-500/15" />
                <div className="absolute w-32 h-32 rounded-full border border-blue-500/25" />
                <div className="absolute w-20 h-20 rounded-full border border-emerald-500/35 bg-emerald-500/5 animate-pulse" />
                
                {/* Radar sweeping line */}
                <div 
                  className="absolute inset-0 origin-center pointer-events-none animate-spin"
                  style={{ animationDuration: '4s' }}
                >
                  <div className="w-1/2 h-0.5 bg-gradient-to-r from-transparent to-[#1877F2]/80" />
                </div>

                {/* Sanctuary Center Icon */}
                <div className="relative z-10 w-9 h-9 rounded-full bg-gradient-to-tr from-[#1877F2] to-[#6D5CF2] text-white flex items-center justify-center shadow-lg shadow-blue-500/40">
                  <Radio className="w-4 h-4" />
                </div>

                {/* Live Member blips */}
                <div className="absolute top-10 left-12 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/70 border border-white/10 text-[10px] text-white backdrop-blur-sm animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Ps. David Osei</span>
                </div>

                <div className="absolute bottom-10 right-10 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/70 border border-white/10 text-[10px] text-white backdrop-blur-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span>Grace Asante</span>
                </div>

                {/* Dynamic simulated walking worshiper */}
                <div 
                  className="absolute transition-all duration-700 flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 border border-emerald-500 text-[10px] text-white backdrop-blur-md shadow-lg"
                  style={{
                    top: simDistance <= 40 ? '48%' : simDistance <= 100 ? '25%' : '12%',
                    left: simDistance <= 40 ? '55%' : simDistance <= 100 ? '70%' : '80%',
                  }}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="font-semibold">You ({simDistance}m)</span>
                </div>

                {/* Bottom status bar inside radar */}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] font-mono text-slate-400 px-2 py-1 rounded bg-black/60 border border-white/5">
                  <span>BLE Beacons: 4 Active</span>
                  <span className="text-emerald-400">Lock: 100% Signal</span>
                </div>
              </div>

              {/* Live Attendance Ticker & Simulation Result */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Gathered Congregation</span>
                  <span className="font-mono tabular-nums text-white font-bold text-sm">
                    {members.length > 0 ? members.length * 12 + 184 : '842'} worshipers
                  </span>
                </div>

                <div className={`p-3 rounded-xl border ${currentZone.border} ${currentZone.bg} flex items-center justify-between transition-all`}>
                  <div className="flex items-center gap-2">
                    <Signal className={`w-4 h-4 ${currentZone.color}`} />
                    <div>
                      <span className={`text-xs font-bold block ${currentZone.color}`}>
                        {currentZone.label}
                      </span>
                      <span className="text-[10px] text-slate-300 block">
                        {currentZone.status}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleRunRadarSimulation}
                    disabled={isSimulating}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold transition-colors cursor-pointer"
                  >
                    {isSimulating ? 'Verifying...' : 'Simulate'}
                  </button>
                </div>
              </div>

              {/* Quick Persona Launch Buttons */}
              <div className="pt-2 border-t border-white/10 grid grid-cols-3 gap-2 text-center">
                <button
                  onClick={() => handleLaunchRole('admin')}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-semibold transition-all cursor-pointer group"
                >
                  <span className="block text-slate-400 text-[9px] uppercase tracking-wider group-hover:text-blue-400">Pastor</span>
                  <span>Dashboard</span>
                </button>
                <button
                  onClick={() => handleLaunchRole('usher')}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-semibold transition-all cursor-pointer group"
                >
                  <span className="block text-slate-400 text-[9px] uppercase tracking-wider group-hover:text-amber-400">Usher</span>
                  <span>Door Kiosk</span>
                </button>
                <button
                  onClick={() => handleLaunchRole('member')}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-semibold transition-all cursor-pointer group"
                >
                  <span className="block text-slate-400 text-[9px] uppercase tracking-wider group-hover:text-emerald-400">Member</span>
                  <span>Digital Pass</span>
                </button>
              </div>

            </div>

          </div>

        </div>

        {/* -----------------------------------------------------------------------
            BOTTOM BRAND / TRUST DIOCESES ROW (Matching Reference Monochromatic Row)
            ----------------------------------------------------------------------- */}
        <div className="relative z-10 w-full px-6 sm:px-12 lg:px-16 pb-6 sm:pb-8 pt-4 border-t border-white/5 bg-black/20">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 shrink-0">
              Trusted by 450+ Dioceses & Congregations:
            </span>
            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-6 sm:gap-10 text-xs font-semibold tracking-wide text-white/40">
              <span className="hover:text-white/80 transition-colors">PIWC Kwadaso</span>
              <span className="hover:text-white/80 transition-colors">Pentecost International</span>
              <span className="hover:text-white/80 transition-colors">Grace Cathedral Accra</span>
              <span className="hover:text-white/80 transition-colors">Royal Sanctuary</span>
              <span className="hover:text-white/80 transition-colors">Methodist Synod</span>
              <span className="hover:text-white/80 transition-colors">Covenant Chapel</span>
            </div>
          </div>
        </div>

      </div>

      {/* =========================================================================
          SECTION 2: INTERACTIVE RADAR DEEP DIVE & SIMULATOR
          ========================================================================= */}
      <section id="radar" className="w-full max-w-[1380px] mt-16 sm:mt-24 space-y-8">
        
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 px-2">
          <div className="space-y-2 max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-widest text-[#1877F2]">
              Sanctuary Proximity Architecture
            </span>
            <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
              Attendance that happens silently,<br />
              without touching a phone.
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed pt-1">
              Dual-lock Bluetooth Low Energy beacons and GhanaPost GPS coordinates verify worshipers as they enter the sanctuary. Our intelligent 5-minute dwell timer filters out passing traffic and cars driving on adjacent roads.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => handleLaunchRole('admin')}
              className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 transition-all cursor-pointer flex items-center gap-2"
            >
              <span>View Live Radar Admin</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Interactive Distance Playground Card */}
        <div className="p-6 sm:p-10 rounded-[32px] bg-[#171720] border border-white/10 shadow-2xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          <div className="lg:col-span-5 space-y-6">
            <span className="text-[11px] font-mono uppercase tracking-wider text-blue-400">
              Interactive Proximity Simulator
            </span>
            <h3 className="text-xl sm:text-2xl font-bold text-white">
              Drag distance to experience the perimeter transition
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Move the slider from 300 meters away to 15 meters inside the sanctuary to see how Ekklesphere transitions states from idle, to perimeter dwell, to verified check-in.
            </p>

            {/* Slider Control */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-400">Current Distance to Altar</span>
                <span className="font-mono tabular-nums text-white bg-white/10 px-2 py-0.5 rounded text-sm">
                  {simDistance} meters
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="300"
                value={simDistance}
                onChange={(e) => setSimDistance(Number(e.target.value))}
                className="w-full accent-[#1877F2] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>10m (Inner Altar)</span>
                <span>100m (Campus Gate)</span>
                <span>300m (Outside City)</span>
              </div>
            </div>

            {/* Resulting state card */}
            <div className={`p-4 rounded-2xl border ${currentZone.border} ${currentZone.bg} space-y-2`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${currentZone.color}`}>
                  {currentZone.label}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {simDistance <= 40 ? 'State: 03_VERIFIED' : simDistance <= 100 ? 'State: 02_DWELL' : 'State: 01_IDLE'}
                </span>
              </div>
              <p className="text-xs text-white font-medium leading-relaxed">
                {currentZone.status}
              </p>
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* Step 1 */}
            <div className={`p-5 rounded-2xl border transition-all ${simDistance > 100 ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/10 bg-black/30'}`}>
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-slate-300 font-mono text-xs font-bold mb-3">
                01
              </div>
              <h4 className="text-sm font-bold text-white mb-1">Dormant Outside</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                When outside 100m, GPS is sleeping. Zero battery drain occurs on member mobile devices.
              </p>
            </div>

            {/* Step 2 */}
            <div className={`p-5 rounded-2xl border transition-all ${simDistance <= 100 && simDistance > 40 ? 'border-amber-500/50 bg-amber-500/10' : 'border-white/10 bg-black/30'}`}>
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-slate-300 font-mono text-xs font-bold mb-3">
                02
              </div>
              <h4 className="text-sm font-bold text-white mb-1">Geofence Dwell</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Entering 100m boundary activates 5-minute dwell timer to eliminate drive-by vehicle false positives.
              </p>
            </div>

            {/* Step 3 */}
            <div className={`p-5 rounded-2xl border transition-all ${simDistance <= 40 ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/10 bg-black/30'}`}>
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-slate-300 font-mono text-xs font-bold mb-3">
                03
              </div>
              <h4 className="text-sm font-bold text-white mb-1">BLE Dual-Lock</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Door beacons lock attendance record instantly and push live headcount to pastoral dashboard.
              </p>
            </div>

          </div>

        </div>

      </section>

      {/* =========================================================================
          SECTION 3: FOUR MINISTRY PILLARS (Anti-Slop Grid)
          ========================================================================= */}
      <section id="pillars" className="w-full max-w-[1380px] mt-16 sm:mt-24 space-y-8">
        
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="text-xs font-bold uppercase tracking-widest text-[#1877F2]">
            Architectural Excellence
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Four Pillars Engineered for Modern Sanctuaries
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            From arrival to follow-up, every Sunday morning touchpoint operates with speed and reverence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          
          {/* Pillar 1 */}
          <div className="p-7 rounded-3xl bg-[#171720] border border-white/10 hover:border-blue-500/40 transition-all flex flex-col justify-between group shadow-xl">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-[#1877F2] flex items-center justify-center font-bold mb-5 group-hover:scale-105 transition-transform">
                <Radio className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-mono text-blue-400 uppercase tracking-widest block mb-1">Pillar 01</span>
              <h3 className="text-lg font-bold text-white mb-2">Autonomous Boundary Radar</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Zero app interaction required. Bluetooth Low Energy beacons combined with GhanaPost GPS coordinates verify presence reliably without manual roster lines.
              </p>
            </div>
            <div className="pt-6 mt-6 border-t border-white/5 flex items-center justify-between text-xs">
              <span className="text-slate-400">GhanaPost GPS</span>
              <span className="font-semibold text-emerald-400">Verified Radar</span>
            </div>
          </div>

          {/* Pillar 2 */}
          <div className="p-7 rounded-3xl bg-[#171720] border border-white/10 hover:border-amber-500/40 transition-all flex flex-col justify-between group shadow-xl">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold mb-5 group-hover:scale-105 transition-transform">
                <QrCode className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-mono text-amber-400 uppercase tracking-widest block mb-1">Pillar 02</span>
              <h3 className="text-lg font-bold text-white mb-2">High-Speed Door Usher Station</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Offline-buffered door steward terminal. Instant camera QR scan in &lt; 0.4 seconds, 1-tap manual roster search, and frictionless first-time visitor intake.
              </p>
            </div>
            <div className="pt-6 mt-6 border-t border-white/5 flex items-center justify-between text-xs">
              <span className="text-slate-400">Offline First</span>
              <span className="font-semibold text-amber-400">Zero Network Lag</span>
            </div>
          </div>

          {/* Pillar 3 */}
          <div className="p-7 rounded-3xl bg-[#171720] border border-white/10 hover:border-rose-500/40 transition-all flex flex-col justify-between group shadow-xl">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center font-bold mb-5 group-hover:scale-105 transition-transform">
                <HeartHandshake className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-mono text-rose-400 uppercase tracking-widest block mb-1">Pillar 03</span>
              <h3 className="text-lg font-bold text-white mb-2">Proactive Pastoral Care</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Automated absence triggers detect members missing 2 or 3 consecutive Sundays, immediately assigning pastoral visitation and cell leader care tasks.
              </p>
            </div>
            <div className="pt-6 mt-6 border-t border-white/5 flex items-center justify-between text-xs">
              <span className="text-slate-400">Care Retention</span>
              <span className="font-semibold text-rose-400">No One Drifts</span>
            </div>
          </div>

          {/* Pillar 4 */}
          <div className="p-7 rounded-3xl bg-[#171720] border border-white/10 hover:border-emerald-500/40 transition-all flex flex-col justify-between group shadow-xl">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold mb-5 group-hover:scale-105 transition-transform">
                <Smartphone className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest block mb-1">Pillar 04</span>
              <h3 className="text-lg font-bold text-white mb-2">Member Pass & MoMo Giving</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Congregation digital pass with upcoming service schedules, end-time countdowns, prayer request submission, and seamless MTN MoMo & Telecel Cash tithing.
              </p>
            </div>
            <div className="pt-6 mt-6 border-t border-white/5 flex items-center justify-between text-xs">
              <span className="text-slate-400">Mobile Money</span>
              <span className="font-semibold text-emerald-400">Instant Receipts</span>
            </div>
          </div>

        </div>

      </section>

      {/* =========================================================================
          SECTION 4: SERVICE SCHEDULE SHOWCASE (Highlighting End Times & Real Schedule)
          ========================================================================= */}
      <section id="schedule" className="w-full max-w-[1380px] mt-16 sm:mt-24 space-y-6">
        
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 px-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-[#1877F2]">
              Real-Time Ministry Calendar
            </span>
            <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight mt-1">
              Service Schedules with Verified Start & End Times
            </h2>
          </div>
          <button
            onClick={() => handleLaunchRole('admin')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1877F2] hover:underline cursor-pointer"
          >
            <span>Manage Church Services</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {services.slice(0, 3).map((srv, idx) => (
            <div 
              key={srv.id || idx}
              className="p-6 rounded-3xl bg-[#171720] border border-white/10 hover:border-white/20 transition-all space-y-4 shadow-xl"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-mono text-slate-400">{srv.date || 'Sunday, Nov 02'}</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  srv.status === 'closed'
                    ? 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}>
                  {srv.status === 'closed' ? 'Archived' : 'Active Service'}
                </span>
              </div>

              <div>
                <h4 className="text-base font-bold text-white leading-tight">{srv.name}</h4>
                <div className="mt-2 flex items-center gap-2 text-xs font-mono text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-[#1877F2]" />
                  <span>{srv.startsAt}</span>
                  <span className="text-slate-500">→</span>
                  <span className="text-amber-400 font-bold">{srv.endsAt || '10:30'}</span>
                  <span className="text-slate-500 text-[10px]">(End Time)</span>
                </div>
              </div>

              <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                <span className="text-slate-400">Target Attendance</span>
                <span className="font-mono tabular-nums text-white font-semibold">
                  {srv.expectedAttendance || 142} worshipers
                </span>
              </div>
            </div>
          ))}
        </div>

      </section>

      {/* =========================================================================
          SECTION 5: 1-CLICK INTERACTIVE ROLE PORTALS
          ========================================================================= */}
      <section id="portals" className="w-full max-w-[1380px] mt-16 sm:mt-24 space-y-8">
        
        <div className="text-center max-w-xl mx-auto space-y-2">
          <span className="text-xs font-bold uppercase tracking-widest text-[#1877F2]">
            Role-Based Experience
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Experience Every Portal in 1 Click
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Switch between pastoral leadership, door usher stations, and member passes immediately.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          
          {/* Pastor / Leadership */}
          <div
            onClick={() => handleLaunchRole('admin')}
            className="p-7 rounded-3xl bg-[#171720] border border-white/10 hover:border-[#1877F2] shadow-xl transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-[#1877F2] flex items-center justify-center font-bold mb-5 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-lg text-white">Pastor & Leadership Admin</h4>
              <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">
                Full attendance intelligence, demographic roster, service end-times configuration, and automated pastoral care queues for missing worshipers.
              </p>
            </div>
            <div className="mt-8 flex items-center gap-2 text-xs font-bold text-[#1877F2]">
              <span>Launch Pastor Portal</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Door Usher */}
          <div
            onClick={() => handleLaunchRole('usher')}
            className="p-7 rounded-3xl bg-[#171720] border border-white/10 hover:border-amber-500 shadow-xl transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold mb-5 group-hover:scale-105 transition-transform">
                <QrCode className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-lg text-white">Door Steward Headcount</h4>
              <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">
                Ultra-fast entrance terminal with camera QR pass scanning, manual roster tap search, offline local buffering, and rapid first-time visitor onboarding.
              </p>
            </div>
            <div className="mt-8 flex items-center gap-2 text-xs font-bold text-amber-400">
              <span>Launch Usher Kiosk</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Member Portal */}
          <div
            onClick={() => handleLaunchRole('member')}
            className="p-7 rounded-3xl bg-[#171720] border border-white/10 hover:border-emerald-500 shadow-xl transition-all cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold mb-5 group-hover:scale-105 transition-transform">
                <Smartphone className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-lg text-white">Member Digital Pass</h4>
              <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">
                Personal congregation mobile wallet pass, live proximity radar status, upcoming services RSVP, and confidential MoMo tithe receipts.
              </p>
            </div>
            <div className="mt-8 flex items-center gap-2 text-xs font-bold text-emerald-400">
              <span>Launch Member Pass</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

        </div>

      </section>

      {/* =========================================================================
          SECTION 6: ACT 843 SOVEREIGN DATA PROTECTION
          ========================================================================= */}
      <section className="w-full max-w-[1380px] mt-16 sm:mt-24 p-8 sm:p-12 rounded-[32px] sm:rounded-[40px] bg-gradient-to-r from-[#171722] via-[#14141E] to-[#12121A] border border-white/10 shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-8">
        <div className="space-y-4 max-w-2xl">
          <div className="inline-flex items-center gap-2 text-[11px] font-mono text-emerald-400 uppercase tracking-wider bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
            <Lock className="w-3.5 h-3.5" />
            <span>Sovereign Data Governance</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
            Built for Strict Act 843 Compliance & Offline Resilience
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            All 28 membership fields, proximity coordinates, and giving records are secured under AES-256 encryption. If internet connectivity drops during Sunday worship, door headcount buffers offline in local storage and auto-syncs when online.
          </p>
          <div className="flex flex-wrap items-center gap-6 pt-2 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Offline-First Buffered Headcount</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#1877F2]" />
              <span>Zero Location Tracking Outside Perimeter</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-purple-400" />
              <span>Multi-Diocese Tenant Isolation</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
          <button
            onClick={() => setIsContactModalOpen(true)}
            className="w-full sm:w-auto px-6 py-3 rounded-full bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-bold shadow-lg transition-all cursor-pointer"
          >
            Request Diocese Deployment
          </button>
          <button
            onClick={() => setViewMode('creator')}
            className="w-full sm:w-auto px-6 py-3 rounded-full border border-white/20 hover:border-white/40 bg-white/5 text-white text-xs font-bold transition-all cursor-pointer"
          >
            Creator Console
          </button>
        </div>
      </section>

      {/* =========================================================================
          SECTION 7: CLEAN EDITORIAL FOOTER
          ========================================================================= */}
      <footer className="w-full max-w-[1380px] mt-20 sm:mt-24 pt-8 pb-12 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <BrandLogo size="xs" surface="dark" />
          <span className="text-slate-600">·</span>
          <span>{currentChurchName}</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6">
          <button onClick={() => setViewMode('app')} className="hover:text-white transition-colors cursor-pointer">
            Sanctuary Portals
          </button>
          <button onClick={() => setViewMode('creator')} className="hover:text-white transition-colors cursor-pointer">
            Creator Architecture
          </button>
          <button onClick={() => setIsContactModalOpen(true)} className="hover:text-white transition-colors cursor-pointer">
            Contact Team
          </button>
          <span className="text-slate-600">·</span>
          <span className="text-slate-500 font-mono">Act 843 Compliant</span>
        </div>
      </footer>

      {/* =========================================================================
          CONTACT & DIOCESE CONSULTATION MODAL
          ========================================================================= */}
      {isContactModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-[#171720] border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative">
            <button
              onClick={() => setIsContactModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#1877F2]">
                Church Growth & Radar Architecture
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-white mt-1">
                Consult with our Sanctuary Engineers
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Connect for a tailored perimeter assessment and attendance setup for {currentChurchName}.
              </p>
            </div>

            <form onSubmit={handleContactSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Your Full Name</label>
                <input
                  type="text"
                  required
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  placeholder="e.g. Pastor David Osei"
                  className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-[#1877F2]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    placeholder="pastor@church.org"
                    className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-[#1877F2]"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                    placeholder="+233 24 000 0000"
                    className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-[#1877F2]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Church / Diocese</label>
                  <input
                    type="text"
                    value={contactForm.church}
                    onChange={(e) => setContactForm({ ...contactForm, church: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-[#1877F2]"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Congregation Size</label>
                  <select
                    value={contactForm.congregationSize}
                    onChange={(e) => setContactForm({ ...contactForm, congregationSize: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white focus:outline-none focus:border-[#1877F2]"
                  >
                    <option value="Under 150">Under 150 worshipers</option>
                    <option value="150-500">150 - 500 worshipers</option>
                    <option value="500-1500">500 - 1,500 worshipers</option>
                    <option value="1500+">1,500+ Cathedral / Multi-Campus</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Sanctuary Inquiries</label>
                <textarea
                  rows={3}
                  value={contactForm.message}
                  onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                  placeholder="Tell us about your campus perimeter, beacons, or ushering requirements..."
                  className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-[#1877F2] resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsContactModalOpen(false)}
                  className="px-5 py-2.5 rounded-full border border-white/20 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-full bg-[#1877F2] hover:bg-[#166fe5] text-white text-xs font-bold shadow-md shadow-blue-600/30 flex items-center gap-2 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Inquiry</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default LandingPage;
