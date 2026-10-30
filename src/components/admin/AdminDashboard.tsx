import React, { useState, useRef, useEffect } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  Grid,
  Users,
  PieChart,
  Bell,
  Calendar as CalendarIcon,
  Mail,
  CheckSquare,
  MessageCircle,
  Search,
  Settings,
  Trash2,
  Edit3,
  Clock,
  Plus,
  Share2,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Download,
  PhoneCall,
  Check,
  X,
  Send,
  Radio,
  HelpCircle,
  ChevronDown,
  LogOut,
  Sparkles,
  ShieldCheck,
  UserPlus,
  Filter,
  QrCode,
  Smartphone,
  Upload,
} from 'lucide-react';
import { ProximitySimulator } from '../simulator/ProximitySimulator';
import { AddMemberModal } from './AddMemberModal';
import { SystemSettingsPanel } from './SystemSettingsPanel';
import { MemberDirectoryTable } from './MemberDirectoryTable';
import { ImportMembersModal } from './ImportMembersModal';
import { Person } from '../../types/ekklesphere';

export const AdminDashboard: React.FC = () => {

  const {
    theme,
    setTheme,
    toggleTheme,
    adminSubTab,
    setAdminSubTab,
    searchQuery,
    setSearchQuery,
    isAddServiceOpen,
    setIsAddServiceOpen,
    isFollowupModalOpen,
    setIsFollowupModalOpen,
    members,
    totalCheckedInCount,
    expectedAttendance,
    attendancePercentage,
    optInPercentage,
    checkInPerson,
    showToast,
    followupTasks,
    resolveFollowupTask,
    addFollowupTask,
    currentService,
    services,
    setActiveServiceId,
    activeServiceId,
    currentUser,
    logout,
    setIsHelpModalOpen,
    deleteMember,
    batchImportMembers,
    attendanceRecords,
    systemSettings,
  } = useEkklesphere();

  // Active sub-navigation tabs inside Admin
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workflows' | 'members' | 'integrations' | 'proximity' | 'settings'>('dashboard');
  const [activeModule, setActiveModule] = useState<'dashboard' | 'attendance' | 'members' | 'services' | 'followup' | 'messages' | 'settings'>('dashboard');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Sync activeTab with adminSubTab from header
  useEffect(() => {
    if (adminSubTab) {
      setActiveTab(adminSubTab as any);
      if (adminSubTab === 'workflows') {
        setActiveModule('members');
      } else if (adminSubTab === 'dashboard') {
        setActiveModule('dashboard');
      } else if (adminSubTab === 'settings') {
        setActiveModule('settings');
      }
    }
  }, [adminSubTab]);

  const checkedInMemberIds = React.useMemo(
    () => new Set(attendanceRecords.map((r) => r.personId)),
    [attendanceRecords]
  );

  const openFollowupCount = followupTasks.filter((t) => t.status === 'open').length;

  // Search filter
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Person | null>(null);

  // Notifications clear state
  const [notificationsCleared, setNotificationsCleared] = useState(false);

  // Calendar day selector
  const [selectedDay, setSelectedDay] = useState<number>(29);

  // Modals
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isNewAssignmentOpen, setIsNewAssignmentOpen] = useState(false);
  const [selectedCareTask, setSelectedCareTask] = useState<string | null>(null);

  // New assignment form state
  const [newAssignMemberId, setNewAssignMemberId] = useState('');
  const [newAssignReason, setNewAssignReason] = useState<'absent_2' | 'absent_3' | 'first_timer' | 'manual'>('absent_3');
  const [newAssignNotes, setNewAssignNotes] = useState('');

  // Broadcast message form state
  const [broadcastChannel, setBroadcastChannel] = useState<'push' | 'sms' | 'email'>('push');
  const [broadcastAudience, setBroadcastAudience] = useState('All active members (520)');
  const [broadcastSubject, setBroadcastSubject] = useState('Sunday Service Reminder');
  const [broadcastBody, setBroadcastBody] = useState(
    'Welcome to Accra Central Church! Service begins at 08:00 AM. If you have auto check-in enabled, your arrival will be marked automatically.'
  );

  const daysList = [
    { name: 'Mon', date: 26 },
    { name: 'Tue', date: 27 },
    { name: 'Wed', date: 28 },
    { name: 'Thu', date: 29 },
    { name: 'Fri', date: 30 },
    { name: 'Sat', date: 31 },
    { name: 'Sun', date: 1 },
  ];

  const eventsByDay: Record<number, Array<{ time: string; title: string; location: string }>> = {
    28: [{ time: '06:30 - 08:00 PM', title: 'Midweek prayer', location: 'Main hall' }],
    29: [
      { time: '05:30 - 06:30 PM', title: 'Leaders’ prayer', location: 'Church office' },
      { time: '07:00 - 08:30 PM', title: 'Choir rehearsal', location: 'Annex' },
    ],
    30: [{ time: '06:00 - 07:30 PM', title: 'Ushers & Greeters briefing', location: 'Foyer' }],
    31: [{ time: '04:00 - 05:30 PM', title: 'Youth fellowship', location: 'Annex' }],
    1: [
      { time: '08:00 - 09:30 AM', title: 'First service', location: 'Main hall' },
      { time: '10:30 - 12:00 PM', title: 'Second service', location: 'Main hall' },
    ],
  };

  const handleQuickArrivalCheckin = () => {
    // Pick an unchecked member
    const unchecked = members.find((m) => m.id !== 'm1' && m.id !== 'm2' && m.id !== 'm3');
    if (unchecked) {
      checkInPerson(unchecked.id, 'geofence', 85, 'Auto check-in approach dwell');
    } else {
      showToast('All listed priority members are checked in!');
    }
  };

  const handleExportCSV = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Member,Phone,Group,Status,ConsecutiveAbsences,AutoCheckin']
        .concat(
          members.map(
            (m) =>
              `"${m.firstName} ${m.lastName}","${m.phoneE164}","${m.groupName}","${m.status}",${m.consecutiveAbsences},${m.autoCheckinOptedIn}`
          )
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ekklesphere-attendance-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Attendance report exported as CSV');
    setIsExportModalOpen(false);
  };

  const handleBroadcastSend = (e: React.FormEvent) => {
    e.preventDefault();
    showToast(`Broadcast sent via ${broadcastChannel.toUpperCase()} to ${broadcastAudience}!`);
    setIsMessageModalOpen(false);
  };

  const handleCreateAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssignMemberId) {
      showToast('Please select a member');
      return;
    }
    addFollowupTask(newAssignMemberId, newAssignReason, newAssignNotes);
    setIsNewAssignmentOpen(false);
    setNewAssignMemberId('');
    setNewAssignNotes('');
  };

  return (
    <main className="relative max-w-[1360px] w-full mx-auto my-1.5 sm:my-3 lg:my-4 bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl sm:rounded-3xl lg:rounded-[36px] pt-4 sm:pt-6 pb-24 sm:pb-28 lg:pb-8 px-3 sm:px-6 lg:pl-[88px] lg:pr-8 shadow-lg lg:shadow-[0_20px_60px_rgba(60,50,140,0.12)] border border-[#E9EBF5] dark:border-[#2D2D55] min-h-[calc(100vh-80px)] lg:min-h-[900px] transition-all duration-200">
      {/* Signature Purple Navigation Bar - Fixed to Left Screen Edge on Desktop & Centered Floating Pill on Mobile */}
      <aside
        aria-label="Admin Module Navigation"
        className="fixed z-50 bottom-4 left-1/2 -translate-x-1/2 lg:translate-x-0 lg:bottom-auto lg:top-20 lg:left-0 w-auto max-w-[calc(100vw-32px)] lg:w-[64px] bg-[#6D5CF2] rounded-full lg:rounded-r-[28px] lg:rounded-l-none flex flex-row lg:flex-col items-center justify-around sm:justify-center lg:justify-start gap-1 sm:gap-2 lg:gap-2.5 px-3 py-1.5 sm:px-4 sm:py-2 lg:py-5 lg:px-0 shadow-[0_16px_40px_rgba(40,30,120,0.35)] lg:shadow-[0_12px_32px_rgba(40,30,120,0.25)] border border-white/20 lg:border-none backdrop-blur-md transition-all duration-200"
      >
        {/* 1. Dashboard */}
        <div className="relative group">
          <button
            onClick={() => {
              setActiveTab('dashboard');
              setActiveModule('dashboard');
            }}
            aria-label="Dashboard Overview"
            aria-current={activeTab === 'dashboard' && activeModule === 'dashboard' ? 'page' : undefined}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full lg:rounded-[14px] flex items-center justify-center transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'dashboard' && activeModule === 'dashboard'
                ? 'bg-white text-[#6D5CF2] shadow-[0_6px_14px_rgba(40,30,120,0.25)] font-bold scale-105'
                : 'text-white/85 hover:text-white hover:bg-white/20'
            }`}
          >
            <Grid className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Dashboard</span>
          </span>
        </div>

        {/* 2. Members & Roster */}
        <div className="relative group">
          <button
            onClick={() => {
              setActiveTab('workflows');
              setActiveModule('members');
            }}
            aria-label="Members Directory"
            aria-current={activeTab === 'workflows' ? 'page' : undefined}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full lg:rounded-[14px] flex items-center justify-center transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'workflows'
                ? 'bg-white text-[#6D5CF2] shadow-[0_6px_14px_rgba(40,30,120,0.25)] font-bold scale-105'
                : 'text-white/85 hover:text-white hover:bg-white/20'
            }`}
          >
            <Users className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Members & Roster</span>
            <span className="px-1.5 py-0.2 bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-[10px] rounded-full font-bold">
              {members.length}
            </span>
          </span>
        </div>

        {/* 3. Live Attendance */}
        <div className="relative group">
          <button
            onClick={() => {
              setActiveTab('dashboard');
              setActiveModule('attendance');
              showToast(`Attendance: ${totalCheckedInCount} / ${expectedAttendance} (${attendancePercentage}%)`);
            }}
            aria-label="Live Attendance"
            aria-current={activeModule === 'attendance' ? 'page' : undefined}
            className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-full lg:rounded-[14px] flex items-center justify-center transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeModule === 'attendance'
                ? 'bg-white text-[#6D5CF2] shadow-[0_6px_14px_rgba(40,30,120,0.25)] font-bold scale-105'
                : 'text-white/85 hover:text-white hover:bg-white/20'
            }`}
          >
            <PieChart className="w-5 h-5 shrink-0" />
            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#59E0AE] border-2 border-[#6D5CF2] animate-pulse" />
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Live Attendance</span>
            <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 dark:text-emerald-600 text-[10px] rounded-full font-extrabold">
              {attendancePercentage}%
            </span>
          </span>
        </div>

        {/* 4. Schedule & Services */}
        <div className="relative group">
          <button
            onClick={() => setIsAddServiceOpen(true)}
            aria-label="Schedule Service"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full lg:rounded-[14px] flex items-center justify-center transition-all duration-150 cursor-pointer text-white/85 hover:text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95"
          >
            <CalendarIcon className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Schedule Service</span>
          </span>
        </div>

        {/* 5. Care Follow-up */}
        <div className="relative group">
          <button
            onClick={() => setIsFollowupModalOpen(true)}
            aria-label="Care Follow-up Queue"
            className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full lg:rounded-[14px] flex items-center justify-center transition-all duration-150 cursor-pointer text-white/85 hover:text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95"
          >
            <CheckSquare className="w-5 h-5 shrink-0" />
            {followupTasks.filter((t) => t.status === 'open').length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#EF5A6F] border-2 border-[#6D5CF2]" />
            )}
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Care Follow-up</span>
            {followupTasks.filter((t) => t.status === 'open').length > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-500/20 text-rose-300 text-[10px] rounded-full font-bold">
                {followupTasks.filter((t) => t.status === 'open').length}
              </span>
            )}
          </span>
        </div>

        {/* 6. Broadcast Comms */}
        <div className="relative group">
          <button
            onClick={() => setIsMessageModalOpen(true)}
            aria-label="Broadcast Messages"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full lg:rounded-[14px] flex items-center justify-center transition-all duration-150 cursor-pointer text-white/85 hover:text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95"
          >
            <Mail className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Broadcast Comms</span>
          </span>
        </div>

        {/* 7. Proximity Radar */}
        <div className="relative group">
          <button
            onClick={() => {
              setActiveTab('proximity');
              showToast('Proximity & Geofencing Radar Suite active');
            }}
            aria-label="Proximity Radar"
            aria-current={activeTab === 'proximity' ? 'page' : undefined}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full lg:rounded-[14px] flex items-center justify-center transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'proximity'
                ? 'bg-white text-[#6D5CF2] shadow-[0_6px_14px_rgba(40,30,120,0.25)] font-bold scale-105'
                : 'text-white/85 hover:text-white hover:bg-white/20'
            }`}
          >
            <Radio className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Proximity Radar</span>
          </span>
        </div>

        {/* 8. Settings */}
        <div className="relative group">
          <button
            onClick={() => {
              setActiveTab('settings');
              setActiveModule('settings');
              showToast('System & Campus Settings');
            }}
            aria-label="System Settings"
            aria-current={activeTab === 'settings' ? 'page' : undefined}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full lg:rounded-[14px] flex items-center justify-center transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'settings'
                ? 'bg-white text-[#6D5CF2] shadow-[0_6px_14px_rgba(40,30,120,0.25)] font-bold scale-105'
                : 'text-white/85 hover:text-white hover:bg-white/20'
            }`}
          >
            <Settings className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>System Settings</span>
          </span>
        </div>
      </aside>

      {/* Main Content & Active Views */}
      <div className="flex-1 min-w-0 w-full">



        {/* Main Content View based on Tab */}
        {activeTab === 'dashboard' && (
        <>
          {/* Hero Greeting Section: Responsive 2-col on mobile, 4-col on tablet, 6-col on desktop */}
          <section className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 my-2 sm:my-4 items-stretch">
            {/* Left Welcome Box */}
            <div className="col-span-2 sm:col-span-2 md:col-span-4 lg:col-span-2 flex flex-col justify-center">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA] leading-tight mb-2">
                Hi, {currentUser?.name ? currentUser.name.split(' ')[0] : 'Pastor David'}!
                <span className="inline-flex gap-1 ml-2.5 align-middle">
                  <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#6D5CF2] border-2 border-[#F6F7FC] dark:border-[#14142E] inline-block shadow-sm" />
                  <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#59C3C3] border-2 border-[#F6F7FC] dark:border-[#14142E] inline-block -ml-2 shadow-sm" />
                </span>
                <br />
                What are your plans for today?
              </h1>
              <p className="text-xs sm:text-sm text-[#666A86] dark:text-[#A9ACC8] max-w-[36ch] leading-relaxed mb-3 sm:mb-4">
                This platform takes care of proximity attendance and pastoral follow-up, so you can focus on your congregation.
              </p>
              
              {/* Quick Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setEditingMember(null);
                    setIsAddMemberOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 bg-[#6D5CF2] hover:bg-[#5b4be0] text-white rounded-xl px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs font-bold shadow-sm transition-all cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add member
                </button>
                <button
                  onClick={() => setIsAddServiceOpen(true)}
                  className="inline-flex items-center gap-1.5 bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] hover:bg-[#E2DEFF] dark:hover:bg-[#343468] rounded-xl px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs font-bold transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add service
                </button>
                <button
                  onClick={() => {
                    setActiveTab('settings');
                    setActiveModule('settings');
                    showToast('System & Campus Settings');
                  }}
                  className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] rounded-xl px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs font-bold hover:bg-slate-50 dark:hover:bg-white/5 transition-all shadow-xs cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  Settings
                </button>
                <button
                  onClick={() => setIsExportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] rounded-xl px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs font-bold hover:bg-slate-50 dark:hover:bg-white/5 transition-all shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  Export
                </button>
              </div>
            </div>

            {/* Dash Tile: Add shortcut */}
            <button
              onClick={() => showToast('Shortcut builder: Choose any report or action to pin here.')}
              className="col-span-1 border-2 border-dashed border-[#CBC6F7] dark:border-[#3B3B72] rounded-2xl sm:rounded-3xl p-3 sm:p-4 flex flex-col items-center justify-center gap-1.5 sm:gap-2 hover:bg-[#EFEDFF]/40 dark:hover:bg-[#2A2A55]/20 transition-colors group min-h-[110px] sm:min-h-[130px] cursor-pointer"
              aria-label="Add shortcut tile"
            >
              <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#6D5CF2] text-white flex items-center justify-center group-hover:scale-105 transition-transform">
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
              <span className="text-[11px] sm:text-xs font-semibold text-[#6D5CF2] dark:text-[#8C7DFF] text-center">Add shortcut</span>
            </button>

            {/* Tile 1: Check people in */}
            <button
              onClick={handleQuickArrivalCheckin}
              className="col-span-1 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-3 sm:p-4 shadow-[0_10px_30px_rgba(60,50,140,0.08)] border border-[#E9EBF5] dark:border-[#2D2D55] text-left flex flex-col justify-between hover:shadow-md transition-shadow group min-h-[110px] sm:min-h-[130px] cursor-pointer"
            >
              <svg className="w-12 h-10 sm:w-[68px] sm:h-[58px] mb-1 group-hover:scale-105 transition-transform" viewBox="0 0 68 58" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect className="stroke-[#1D1B3A] dark:stroke-[#F2F2FA] fill-white dark:fill-[#1D1D3D]" x="10" y="12" width="38" height="36" rx="6" />
                <path className="stroke-[#1D1B3A] dark:stroke-[#F2F2FA]" d="M10 23h38M21 8v8M37 8v8" />
                <circle className="fill-[#6D5CF2] stroke-none" cx="48" cy="42" r="11" />
                <path d="m43 42 4 4 7-8" stroke="#fff" strokeWidth="2.5" />
              </svg>
              <div>
                <b className="block text-xs sm:text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] leading-tight">Check people in</b>
                <small className="text-[10px] sm:text-xs text-[#666A86] dark:text-[#A9ACC8] truncate block">Counts arrivals live</small>
              </div>
            </button>

            {/* Tile 2: Follow up */}
            <button
              onClick={() => setIsFollowupModalOpen(true)}
              className="col-span-1 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-3 sm:p-4 shadow-[0_10px_30px_rgba(60,50,140,0.08)] border border-[#E9EBF5] dark:border-[#2D2D55] text-left flex flex-col justify-between hover:shadow-md transition-shadow group min-h-[110px] sm:min-h-[130px] cursor-pointer"
            >
              <svg className="w-12 h-10 sm:w-[68px] sm:h-[58px] mb-1 group-hover:scale-105 transition-transform" viewBox="0 0 68 58" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle className="stroke-[#1D1B3A] dark:stroke-[#F2F2FA] fill-white dark:fill-[#1D1D3D]" cx="26" cy="20" r="9" />
                <path className="fill-[#EFEDFF] dark:fill-[#2A2A55] stroke-[#1D1B3A] dark:stroke-[#F2F2FA]" d="M10 48c1-10 8-14 16-14s15 4 16 14z" />
                <path className="fill-[#6D5CF2] stroke-none" d="M50 26c-6-5-12 1-6 7l6 6 6-6c6-6 0-12-6-7z" />
              </svg>
              <div>
                <b className="block text-xs sm:text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] leading-tight">Follow up</b>
                <small className="text-[10px] sm:text-xs text-[#666A86] dark:text-[#A9ACC8] truncate block">No one drifts away</small>
              </div>
            </button>

            {/* Tile 3: Message members */}
            <button
              onClick={() => setIsMessageModalOpen(true)}
              className="col-span-1 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-3 sm:p-4 shadow-[0_10px_30px_rgba(60,50,140,0.08)] border border-[#E9EBF5] dark:border-[#2D2D55] text-left flex flex-col justify-between hover:shadow-md transition-shadow group min-h-[110px] sm:min-h-[130px] cursor-pointer"
            >
              <svg className="w-12 h-10 sm:w-[68px] sm:h-[58px] mb-1 group-hover:scale-105 transition-transform" viewBox="0 0 68 58" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect className="stroke-[#1D1B3A] dark:stroke-[#F2F2FA] fill-white dark:fill-[#1D1D3D]" x="8" y="10" width="34" height="22" rx="8" />
                <path className="stroke-[#1D1B3A] dark:stroke-[#F2F2FA] fill-white dark:fill-[#1D1D3D]" d="M16 32v8l8-8" />
                <rect className="fill-[#6D5CF2] stroke-none" x="28" y="26" width="32" height="20" rx="8" />
                <path d="M36 36h16" stroke="#fff" strokeWidth="2" />
              </svg>
              <div>
                <b className="block text-xs sm:text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] leading-tight">Message members</b>
                <small className="text-[10px] sm:text-xs text-[#666A86] dark:text-[#A9ACC8] truncate block">Push, SMS & email</small>
              </div>
            </button>
          </section>

          {/* Cards Grid: Responsive across mobile (1 col), tablet (2 cols), desktop (6 cols) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 sm:gap-5">
            {/* 1. Notifications Card (Tablet 1 col, Desktop Span 2) */}
            <section id="notifications-card" className="md:col-span-1 lg:col-span-2 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Notifications</h2>
                  <button
                    onClick={() => {
                      setNotificationsCleared(!notificationsCleared);
                      showToast(notificationsCleared ? 'Notifications restored' : 'Notifications cleared');
                    }}
                    className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#EF5A6F] flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {notificationsCleared ? 'Restore' : 'Clear'}
                  </button>
                </div>

                {!notificationsCleared ? (
                  <div className="space-y-3">
                    {/* Floating Upcoming Event Card */}
                    <div className="relative bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl p-3.5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          <span className="w-2 h-2 rounded-full bg-[#4FBF98]" />
                          Upcoming event
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => showToast('Editing event briefing')}
                            className="p-1 rounded-lg text-[#666A86] hover:text-[#6D5CF2]"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-2.5">
                        Sunday service briefing · Duration: 45 min
                      </div>
                      <div className="flex items-center gap-3 pt-2 border-t border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="w-3.5 h-3.5 text-[#6D5CF2]" />
                          Sun, 1 Nov
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#6D5CF2]" />
                          07:00 - 07:45 AM
                        </span>
                      </div>
                    </div>

                    {/* Follow-up Note Card */}
                    <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-3.5 border border-[#E9EBF5] dark:border-[#2D2D55]">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                        <Mail className="w-3.5 h-3.5 text-[#6D5CF2]" />
                        Message · Pastoral Care
                      </div>
                      <div className="text-xs text-[#666A86] dark:text-[#A9ACC8]">Note from Pastor Ruth:</div>
                      <div className="mt-2 bg-[#F6F7FC] dark:bg-[#14142E] rounded-xl p-2.5 text-xs text-[#666A86] dark:text-[#A9ACC8] italic">
                        “Kofi Mensah answered the call. He had fever last week and says he will join 2nd service.”
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10 text-xs text-[#666A86] dark:text-[#A9ACC8]">
                    All caught up. Tap Restore to view previous alerts.
                  </div>
                )}
              </div>
            </section>

            {/* 2. Assignments Card (Tablet 1 col, Desktop Span 2) */}
            <section className="md:col-span-1 lg:col-span-2 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Assignments</h2>
                  <button
                    onClick={() => setIsFollowupModalOpen(true)}
                    className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#6D5CF2] flex items-center gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    View all ({followupTasks.filter((t) => t.status === 'open').length})
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-2.5">
                  <span className="bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] text-xs font-semibold px-2 py-0.5 rounded-md">
                    Pastoral care
                  </span>
                  <span className="bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] text-xs font-semibold px-2 py-0.5 rounded-md">
                    Osu North cell
                  </span>
                </div>

                <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] leading-snug mb-3">
                  Call Kofi Mensah, absent three weeks in a row
                </h3>

                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="bg-[#7AD3B6]/20 text-[#12503D] dark:text-[#7AD3B6] text-xs font-bold px-3 py-1 rounded-full">
                    Care call
                  </span>
                  <span className="bg-[#FFE2E6] dark:bg-[#4A2229] text-[#C9314F] dark:text-[#FF9AAA] text-xs font-bold px-3 py-1 rounded-full">
                    High Priority
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
                  <span className="text-[#666A86] dark:text-[#A9ACC8]">Assigned to</span>
                  <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                    <span className="w-6 h-6 rounded-full bg-[#F2B8A6] text-[#5A2A1E] font-bold text-[10px] flex items-center justify-center">
                      RL
                    </span>
                    Ruth Larbi (Pastor)
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsNewAssignmentOpen(true)}
                className="mt-4 w-full border-2 border-dashed border-[#CBC6F7] dark:border-[#3B3B72] rounded-2xl py-3 text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center justify-center gap-1.5 hover:bg-[#EFEDFF]/40 dark:hover:bg-[#2A2A55]/20 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add new assignment
              </button>
            </section>

            {/* 3. Calendar & Timeline (Tablet Span 2, Desktop Span 2) */}
            <section className="md:col-span-2 lg:col-span-2 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Oct 26 - Nov 1</h2>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => showToast('Previous week schedule')}
                      className="p-1 rounded-lg text-[#666A86] hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => showToast('Next week schedule')}
                      className="p-1 rounded-lg text-[#666A86] hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 7-day selector */}
                <div className="grid grid-cols-7 gap-1 text-center mb-4">
                  {daysList.map((d) => (
                    <button
                      key={d.date}
                      onClick={() => setSelectedDay(d.date)}
                      className={`flex flex-col items-center py-1.5 rounded-xl transition-all ${
                        selectedDay === d.date
                          ? 'bg-[#6D5CF2] text-white shadow-sm font-bold'
                          : 'text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/5'
                      }`}
                    >
                      <span className="text-[10px] uppercase font-semibold">{d.name}</span>
                      <b className="text-xs">{d.date}</b>
                    </button>
                  ))}
                </div>

                {/* Events list for selected day */}
                <div className="space-y-2">
                  {(eventsByDay[selectedDay] || []).length > 0 ? (
                    eventsByDay[selectedDay].map((ev, idx) => (
                      <div
                        key={idx}
                        className="bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl p-2.5 flex items-center gap-2.5 border border-[#E9EBF5] dark:border-[#2D2D55]"
                      >
                        <div className="w-8 h-8 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center justify-center shrink-0">
                          <CalendarIcon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                            {ev.title}
                          </b>
                          <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                            {ev.time} · {ev.location}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-xs text-[#666A86] dark:text-[#A9ACC8]">
                      No services or events scheduled for this day.
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] text-xs text-[#666A86] dark:text-[#A9ACC8] flex justify-between items-center">
                <span>Active Service:</span>
                <span className="font-bold text-[#6D5CF2]">{currentService.name.split(',')[0]}</span>
              </div>
            </section>

            {/* 4. Today's Tasks (Tablet Span 2, Desktop Span 3) */}
            <section className="md:col-span-2 lg:col-span-3 bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Today’s tasks</h2>
                  {/* Avatar stack */}
                  <div className="flex -space-x-2">
                    <span className="w-6 h-6 rounded-full bg-[#6D5CF2] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-[#1D1D3D]">
                      RL
                    </span>
                    <span className="w-6 h-6 rounded-full bg-[#59C3C3] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-[#1D1D3D]">
                      KA
                    </span>
                    <span className="w-6 h-6 rounded-full bg-[#F29F6D] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-[#1D1D3D]">
                      EQ
                    </span>
                    <span className="w-6 h-6 rounded-full bg-[#1D1B3A] text-white text-[9px] font-bold flex items-center justify-center border-2 border-white dark:border-[#1D1D3D]">
                      +4
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                  <button
                    onClick={() => showToast('Editing task list')}
                    className="hover:text-[#1D1B3A] flex items-center gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => showToast('Sharing checklist with Sunday team')}
                    className="hover:text-[#1D1B3A] flex items-center gap-1"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Share
                  </button>
                </div>
              </div>

              {/* Task Row 1 */}
              <div className="p-3 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] mb-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Brief the greeters</b>
                  <em className="text-[11px] not-italic text-[#666A86] dark:text-[#A9ACC8]">1 Nov 07:00 AM</em>
                </div>
                <div className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  <em>Duration:</em> <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">00 h 45 m</b>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] min-w-[120px]">
                  <span>90%</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] overflow-hidden">
                    <div className="h-full bg-[#6D5CF2] rounded-full" style={{ width: '90%' }} />
                  </div>
                </div>
                <span className="text-xs text-[#666A86] dark:text-[#A9ACC8] font-semibold">4 + 16</span>
              </div>

              {/* Task Row 2 */}
              <div className="p-3 rounded-2xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] mb-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Check entrance beacons</b>
                  <em className="text-[11px] not-italic text-[#666A86] dark:text-[#A9ACC8]">31 Oct 04:00 PM</em>
                </div>
                <div className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  <em>Duration:</em> <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">01 h 00 m</b>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] min-w-[120px]">
                  <span>50%</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] overflow-hidden">
                    <div className="h-full bg-[#6D5CF2] rounded-full" style={{ width: '50%' }} />
                  </div>
                </div>
                <span className="text-xs text-[#666A86] dark:text-[#A9ACC8] font-semibold">2 + 3</span>
              </div>

              {/* Task Row 3 */}
              <div className="p-3 rounded-2xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Send service reminders</b>
                  <em className="text-[11px] not-italic text-[#666A86] dark:text-[#A9ACC8]">31 Oct 06:00 PM</em>
                </div>
                <div className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  <em>Duration:</em> <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">00 h 30 m</b>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] min-w-[120px]">
                  <span>10%</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] overflow-hidden">
                    <div className="h-full bg-[#6D5CF2] rounded-full" style={{ width: '10%' }} />
                  </div>
                </div>
                <span className="text-xs text-[#666A86] dark:text-[#A9ACC8] font-semibold">1 + 187</span>
              </div>
            </section>

            {/* 5. Promo Card (Tablet 1 col, Desktop Span 1) */}
            <section className="md:col-span-1 lg:col-span-1 bg-[#6D5CF2] text-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-between text-center shadow-[0_10px_30px_rgba(109,92,242,0.3)]">
              <svg className="w-16 h-16 sm:w-20 sm:h-20 mb-1" viewBox="0 0 84 84" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="20" y="38" width="44" height="30" rx="5" fill="#8C7DFF" />
                <rect x="16" y="30" width="52" height="12" rx="4" fill="#8C7DFF" />
                <path d="M42 30v38M42 30c-8-12-18-6-12 0M42 30c8-12 18-6 12 0" />
                <path d="M10 18v8M6 22h8M72 14v6M69 17h6" />
              </svg>
              <div>
                <h2 className="text-sm sm:text-base font-bold mb-1">Turn on auto check-in!</h2>
                <p className="text-xs text-white/90 leading-snug mb-3">
                  36% of members still sign in by hand. Invite them to switch it on.
                </p>
              </div>
              <button
                onClick={() => {
                  showToast('Invitation SMS & Push queued for 187 members');
                }}
                className="w-full bg-[#1D1B3A] hover:bg-[#1D1B3A]/90 text-white rounded-xl py-2 text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                Invite members
              </button>
            </section>

            {/* 6. Metrics & Meetings (Tablet 1 col, Desktop Span 2) */}
            <div className="md:col-span-1 lg:col-span-2 flex flex-col gap-4">
              {/* Row with two Circular Progress Rings */}
              <div className="grid grid-cols-2 gap-3">
                {/* Ring 1: Attendance */}
                <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col items-center text-center">
                  <div className="relative w-16 h-16 mb-2">
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 60 60">
                      <circle cx="30" cy="30" r="25" fill="none" stroke="#EFEDFF" strokeWidth="6" />
                      <circle
                        cx="30"
                        cy="30"
                        r="25"
                        fill="none"
                        stroke="#4FBF98"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={`${(157 * attendancePercentage) / 100} 157`}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center font-bold text-xs tabular-nums text-[#1D1B3A] dark:text-[#F2F2FA]">
                      {attendancePercentage}%
                    </span>
                  </div>
                  <small className="text-[10px] font-bold text-[#6D5CF2] tracking-wider uppercase">ATTENDANCE</small>
                  <b className="text-xs text-[#1D1B3A] dark:text-[#F2F2FA]">Sunday Service</b>
                  <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
                    {totalCheckedInCount} of {expectedAttendance}
                  </span>
                </div>

                {/* Ring 2: Auto Check-In Opt-In */}
                <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col items-center text-center">
                  <div className="relative w-16 h-16 mb-2">
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 60 60">
                      <circle cx="30" cy="30" r="25" fill="none" stroke="#EFEDFF" strokeWidth="6" />
                      <circle
                        cx="30"
                        cy="30"
                        r="25"
                        fill="none"
                        stroke="#EF5A6F"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={`${(157 * optInPercentage) / 100} 157`}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center font-bold text-xs tabular-nums text-[#1D1B3A] dark:text-[#F2F2FA]">
                      {optInPercentage}%
                    </span>
                  </div>
                  <small className="text-[10px] font-bold text-[#6D5CF2] tracking-wider uppercase">AUTO CHECK-IN</small>
                  <b className="text-xs text-[#1D1B3A] dark:text-[#F2F2FA]">Opt-in rate</b>
                  <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">187 to go</span>
                </div>
              </div>

              {/* Leaders Meeting Card */}
              <section className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Leaders’ meeting</h2>
                  <button
                    onClick={() => showToast('Editing leaders meeting agenda')}
                    className="text-xs text-[#666A86] hover:text-[#6D5CF2]"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-xs text-[#666A86] dark:text-[#A9ACC8] font-semibold">
                  Wed, 4 Nov at 06:30 PM
                </span>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] my-2 leading-relaxed">
                  Easter planning and cell group reports, church office, room 2.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => showToast('Reschedule modal opened')}
                    className="flex-1 bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-1.5 text-xs font-bold hover:opacity-90 transition-all"
                  >
                    Reschedule
                  </button>
                  <button
                    onClick={() => showToast('Invite accepted for Leaders meeting')}
                    className="flex-1 bg-[#6D5CF2] text-white rounded-xl py-1.5 text-xs font-bold hover:bg-[#5b4be0] transition-all"
                  >
                    Accept invite
                  </button>
                </div>
              </section>
            </div>
          </div>
        </>
      )}

      {/* Workflows / Members Directory Tab: Complete 28 Columns Table & Care Workflows */}
      {(activeTab === 'workflows' || activeTab === 'members') && (
        <div className="mt-4 space-y-5">
          <MemberDirectoryTable
            members={members}
            onAddMember={() => {
              setEditingMember(null);
              setIsAddMemberOpen(true);
            }}
            onEditMember={(m) => {
              setEditingMember(m);
              setIsAddMemberOpen(true);
            }}
            onDeleteMember={(id) => {
              const target = members.find((m) => m.id === id);
              if (window.confirm(`Are you sure you want to remove ${target?.firstName} ${target?.lastName} from the member directory?`)) {
                deleteMember(id);
              }
            }}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            onCheckinMember={(id) => {
              checkInPerson(id, 'usher', 95);
            }}
            checkedInIds={checkedInMemberIds}
          />
        </div>
      )}

      {/* Integrations Tab: Beacons, Webhooks, Paystack, Geofence Config */}
      {activeTab === 'integrations' && (
        <div className="mt-4 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              Hardware & Service Integrations
            </h2>
            <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
              Manage entrance BLE beacons, PostGIS geofence rings, SMS gateways (Hubtel/Arkesel), and Paystack.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Geofence Engine */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm">
              <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2 flex items-center justify-between">
                <span>PostGIS Campus Geofencing</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3">
                Outer Ring: 300 m (App approach wake-up)
                <br />
                Inner Ring: 100 m (5-min dwell required)
              </p>
              <div className="bg-[#F6F7FC] dark:bg-[#14142E] p-2.5 rounded-xl text-xs font-mono text-[#6D5CF2] dark:text-[#8C7DFF] mb-3">
                POINT(5.5560, -0.1969)
              </div>
              <button
                onClick={() => showToast('Geofence test calibrated at Accra Central campus')}
                className="w-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-2 text-xs font-bold cursor-pointer hover:opacity-90 transition-all"
              >
                Test Radius Accuracy
              </button>
            </div>

            {/* BLE Beacons */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm">
              <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2 flex items-center justify-between">
                <span>Entrance BLE Beacons</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3">
                UUID: b7826da4-4d5e...
                <br />
                Major: 1 · Minor: 101 (Main Sanctuary Door)
              </p>
              <div className="bg-[#F6F7FC] dark:bg-[#14142E] p-2.5 rounded-xl text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3">
                Scanned only inside service window to protect battery.
              </div>
              <button
                onClick={() => showToast('Entrance Beacon pinged: Signal strength -58 dBm (Strong)')}
                className="w-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-2 text-xs font-bold cursor-pointer hover:opacity-90 transition-all"
              >
                Ping Beacon
              </button>
            </div>

            {/* Paystack & MoMo */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm">
              <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2 flex items-center justify-between">
                <span>Paystack & Mobile Money</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3">
                MTN Mobile Money, Telecel Cash & Cards active with automated webhook verification.
              </p>
              <div className="bg-[#F6F7FC] dark:bg-[#14142E] p-2.5 rounded-xl text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3">
                Settlement Currency: GHS (Ghana Cedis)
              </div>
              <button
                onClick={() => showToast('Payment gateway webhook verified')}
                className="w-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-2 text-xs font-bold cursor-pointer hover:opacity-90 transition-all"
              >
                Test MoMo Webhook
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proximity & Geofencing Radar Diagnostic Suite */}
      {activeTab === 'proximity' && (
        <div className="mt-4 animate-in fade-in">
          <ProximitySimulator />
        </div>
      )}

      {/* System Settings & Campus Parameters Suite */}
      {activeTab === 'settings' && (
        <div className="mt-4 animate-in fade-in">
          <SystemSettingsPanel />
        </div>
      )}
      </div>

      {/* MODAL 1: Add New Service */}
      {isAddServiceOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Schedule New Service</h3>
              <button onClick={() => setIsAddServiceOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Service Name</label>
                <input
                  type="text"
                  defaultValue="Sunday Youth & Praise, 16:00"
                  className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Start Time</label>
                  <input
                    type="time"
                    defaultValue="16:00"
                    className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Expected Attendance</label>
                  <input
                    type="number"
                    defaultValue="300"
                    className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Dwell Rule (Minutes)</label>
                <input
                  type="number"
                  defaultValue="5"
                  className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                />
                <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                  Geofence auto check-in requires 5 min presence inside 100 m ring.
                </span>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setIsAddServiceOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  showToast('New service scheduled and geofence window assigned.');
                  setIsAddServiceOpen(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold shadow-sm"
              >
                Create Service
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Broadcast Messages */}
      {isMessageModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <form
            onSubmit={handleBroadcastSend}
            className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Message Members</h3>
              <button type="button" onClick={() => setIsMessageModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Delivery Channel</label>
                <div className="flex gap-2">
                  {(['push', 'sms', 'email'] as const).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setBroadcastChannel(ch)}
                      className={`flex-1 py-2 rounded-xl font-bold uppercase transition-all ${
                        broadcastChannel === ch
                          ? 'bg-[#6D5CF2] text-white'
                          : 'bg-slate-100 dark:bg-black/20 text-[#666A86] dark:text-[#A9ACC8]'
                      }`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Audience</label>
                <select
                  value={broadcastAudience}
                  onChange={(e) => setBroadcastAudience(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                >
                  <option>All active members (520)</option>
                  <option>Absent members last 2 weeks (14)</option>
                  <option>First-time visitors this month (32)</option>
                  <option>Osu North cell group (28)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Subject</label>
                <input
                  type="text"
                  value={broadcastSubject}
                  onChange={(e) => setBroadcastSubject(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Message Body</label>
                <textarea
                  rows={4}
                  value={broadcastBody}
                  onChange={(e) => setBroadcastBody(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => setIsMessageModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold shadow-sm flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Send Broadcast
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: Follow-up Queue & Outcome Log */}
      {isFollowupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-2xl w-full p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Pastoral Care Follow-up Queue
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Automated absence triggers: 2 weeks = Cell leader, 3 weeks = Pastoral team.
                </p>
              </div>
              <button onClick={() => setIsFollowupModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {followupTasks.map((t) => (
                <div
                  key={t.id}
                  className="p-4 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <b className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">{t.personName}</b>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFE2E6] text-[#C9314F]">
                        {t.reason === 'absent_3'
                          ? 'Absent 3 Weeks'
                          : t.reason === 'absent_2'
                          ? 'Absent 2 Weeks'
                          : 'First Timer'}
                      </span>
                    </div>
                    <div className="text-[#666A86] dark:text-[#A9ACC8]">
                      {t.groupName} · Assigned to: <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">{t.assignedToName}</b>
                    </div>
                    {t.outcome && (
                      <div className="mt-1 text-emerald-600 dark:text-emerald-400 italic">Outcome: {t.outcome}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {t.status === 'open' ? (
                      <>
                        <button
                          onClick={() => {
                            showToast(`Dialing ${t.personName}...`);
                            resolveFollowupTask(t.id, 'Contacted via phone. Returning this Sunday.');
                          }}
                          className="bg-[#6D5CF2] text-white px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 shadow-sm"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          Log Call
                        </button>
                        <button
                          onClick={() => resolveFollowupTask(t.id, 'Excused absence (traveling)')}
                          className="bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] px-3 py-1.5 rounded-xl font-semibold"
                        >
                          Mark Excused
                        </button>
                      </>
                    ) : (
                      <span className="text-emerald-500 font-bold flex items-center gap-1">
                        <Check className="w-4 h-4" /> Resolved
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 mt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex justify-end">
              <button
                onClick={() => setIsFollowupModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#1D1B3A] text-white font-bold text-xs"
              >
                Close Queue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: New Assignment */}
      {isNewAssignmentOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <form
            onSubmit={handleCreateAssignment}
            className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">New Care Assignment</h3>
              <button type="button" onClick={() => setIsNewAssignmentOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Member</label>
                <select
                  value={newAssignMemberId}
                  onChange={(e) => setNewAssignMemberId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                >
                  <option value="">Select member...</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.firstName} {m.lastName} ({m.groupName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Reason</label>
                <select
                  value={newAssignReason}
                  onChange={(e) => setNewAssignReason(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                >
                  <option value="absent_3">Absent 3 consecutive weeks (Pastoral Care)</option>
                  <option value="absent_2">Absent 2 consecutive weeks (Cell Leader)</option>
                  <option value="first_timer">First-time visitor welcome</option>
                  <option value="manual">Manual care inquiry</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-[#1D1B3A] dark:text-[#F2F2FA]">Notes / Context</label>
                <textarea
                  rows={3}
                  value={newAssignNotes}
                  onChange={(e) => setNewAssignNotes(e.target.value)}
                  placeholder="e.g. Check on family wellbeing after hospitalization"
                  className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA]"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => setIsNewAssignmentOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold shadow-sm"
              >
                Assign Task
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 5: Export CSV confirmation */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-center max-h-[90vh] overflow-y-auto">
            <div className="w-12 h-12 rounded-2xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] mx-auto flex items-center justify-center mb-3">
              <Download className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
              Download Attendance Export
            </h3>
            <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-4 leading-relaxed">
              Generates a full audit register for {currentService.name.split(',')[0]} including member names,
              cell groups, and check-in methods.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#666A86] dark:text-[#A9ACC8]"
              >
                Cancel
              </button>
              <button
                onClick={handleExportCSV}
                className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold shadow-sm"
              >
                Download CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Add / Edit Member Modal */}
      <AddMemberModal
        isOpen={isAddMemberOpen}
        onClose={() => {
          setIsAddMemberOpen(false);
          setEditingMember(null);
        }}
        initialData={editingMember}
      />

      {/* MODAL 7: Import Members with Validation */}
      <ImportMembersModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={(imported) => {
          batchImportMembers(imported);
        }}
        existingMembers={members}
      />
    </main>
  );
};

