import React, { useState } from 'react';
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
  Sliders,
  CheckCircle2,
  List,
  LayoutGrid,
  Sparkles,
  MapPin,
  ExternalLink,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const {
    theme,
    setTheme,
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
    attendanceRecords,
  } = useEkklesphere();

  // Active sub-navigation tabs inside Admin
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workflows' | 'integrations'>('dashboard');
  const [activeSideNav, setActiveSideNav] = useState<string>('dashboard');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Notifications clear & items state
  const [notificationsCleared, setNotificationsCleared] = useState(false);
  const [upcomingEvent, setUpcomingEvent] = useState({
    title: 'Sunday service briefing',
    duration: 'Duration: 45 min',
    date: 'Sun, 1 Nov',
    time: '07:00 - 07:45 AM',
  });
  const [isEditEventOpen, setIsEditEventOpen] = useState(false);

  // Calendar week & day navigation state
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [selectedDay, setSelectedDay] = useState<number>(29);

  // Today's tasks state & view mode
  const [taskViewMode, setTaskViewMode] = useState<'list' | 'grid'>('list');
  const [tasksList, setTasksList] = useState([
    {
      id: 't1',
      title: 'Brief the greeters',
      time: '1 Nov 07:00 AM',
      duration: '00 h 45 m',
      progress: 90,
      volunteers: '4 + 16',
      completed: false,
    },
    {
      id: 't2',
      title: 'Check entrance beacons',
      time: '31 Oct 04:00 PM',
      duration: '01 h 00 m',
      progress: 50,
      volunteers: '2 + 3',
      completed: false,
    },
    {
      id: 't3',
      title: 'Send service reminders',
      time: '31 Oct 06:00 PM',
      duration: '00 h 30 m',
      progress: 10,
      volunteers: '1 + 187',
      completed: false,
    },
  ]);

  // Leaders' meeting state
  const [leadersMeetingAccepted, setLeadersMeetingAccepted] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [leadersMeetingTime, setLeadersMeetingTime] = useState('Wed, 4 Nov at 06:30 PM');

  // Modals & Drawers
  const [isAddServiceOpen, setIsAddServiceOpen] = useState(false);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [isFollowupModalOpen, setIsFollowupModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isNewAssignmentOpen, setIsNewAssignmentOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAddShortcutOpen, setIsAddShortcutOpen] = useState(false);
  const [selectedCareTask, setSelectedCareTask] = useState<string | null>(null);

  // Shortcuts pinned in hero
  const [customShortcuts, setCustomShortcuts] = useState<string[]>([]);
  const [newShortcutName, setNewShortcutName] = useState('');

  // Chat messages
  const [chatMessages, setChatMessages] = useState([
    { sender: 'Ruth Larbi (Pastor)', text: 'Greeter team is assembled at main entrance.', time: '07:15 AM' },
    { sender: 'Akosua Darko (Usher Lead)', text: 'North foyer tablet is synced and running.', time: '07:22 AM' },
  ]);
  const [newChatMessage, setNewChatMessage] = useState('');

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

  // Dynamic calendar calculations based on week offset
  const getDaysForWeek = (offset: number) => {
    if (offset === 0) {
      return [
        { name: 'Mon', date: 26 },
        { name: 'Tue', date: 27 },
        { name: 'Wed', date: 28 },
        { name: 'Thu', date: 29 },
        { name: 'Fri', date: 30 },
        { name: 'Sat', date: 31 },
        { name: 'Sun', date: 1 },
      ];
    } else if (offset < 0) {
      return [
        { name: 'Mon', date: 19 },
        { name: 'Tue', date: 20 },
        { name: 'Wed', date: 21 },
        { name: 'Thu', date: 22 },
        { name: 'Fri', date: 23 },
        { name: 'Sat', date: 24 },
        { name: 'Sun', date: 25 },
      ];
    } else {
      return [
        { name: 'Mon', date: 2 },
        { name: 'Tue', date: 3 },
        { name: 'Wed', date: 4 },
        { name: 'Thu', date: 5 },
        { name: 'Fri', date: 6 },
        { name: 'Sat', date: 7 },
        { name: 'Sun', date: 8 },
      ];
    }
  };

  const currentDaysList = getDaysForWeek(weekOffset);
  const weekLabel =
    weekOffset === 0 ? 'Oct 26 - Nov 1' : weekOffset < 0 ? 'Oct 19 - Oct 25' : 'Nov 2 - Nov 8';

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
    4: [{ time: '06:30 - 08:00 PM', title: 'Leaders’ Board Meeting', location: 'Room 2' }],
    7: [{ time: '04:00 - 05:30 PM', title: 'Youth choir practice', location: 'Annex' }],
  };

  const handleQuickArrivalCheckin = () => {
    // Pick an unchecked member
    const unchecked = members.find((m) => !attendanceRecords.some((r) => r.personId === m.id));
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

  const handleToggleTask = (taskId: string) => {
    setTasksList((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, completed: !t.completed, progress: !t.completed ? 100 : t.progress }
          : t
      )
    );
    showToast('Task status updated');
  };

  const handleShareChecklist = () => {
    const summary = tasksList.map((t) => `${t.completed ? '[x]' : '[ ]'} ${t.title} (${t.time})`).join('\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`Sunday Tasks:\n${summary}`);
      showToast('Checklist copied to clipboard!');
    } else {
      showToast('Checklist prepared for WhatsApp broadcast');
    }
  };

  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatMessage.trim()) return;
    setChatMessages((prev) => [
      ...prev,
      {
        sender: 'James (Admin)',
        text: newChatMessage,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setNewChatMessage('');
    showToast('Message sent to Staff Channel');
  };

  const handleAddShortcut = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShortcutName.trim()) return;
    setCustomShortcuts((prev) => [...prev, newShortcutName.trim()]);
    setNewShortcutName('');
    setIsAddShortcutOpen(false);
    showToast('Shortcut pinned to header');
  };

  // Filtered members for search results
  const searchResults = searchQuery
    ? members.filter(
        (m) =>
          `${m.firstName} ${m.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.phoneE164.includes(searchQuery) ||
          m.groupName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="relative max-w-[1360px] mx-auto my-4 sm:my-6 bg-[#F6F7FC] dark:bg-[#14142E] rounded-[28px] sm:rounded-[36px] p-4 sm:p-7 lg:py-8 lg:pr-10 lg:pl-24 pb-24 lg:pb-8 shadow-[0_20px_60px_rgba(60,50,140,0.12)] border border-[#E9EBF5] dark:border-[#2D2D55] min-h-[920px]">
      {/* Optimized Dual-Mode Navigation Bar (Floating Bottom Dock on Mobile/Tablet + Sleek Curved Sidebar on Desktop) */}
      <nav
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[#6D5CF2]/95 backdrop-blur-md text-white rounded-full p-1.5 shadow-[0_12px_36px_rgba(40,30,120,0.4)] flex flex-row items-center gap-1 border border-white/20 max-w-[95vw] overflow-x-auto scrollbar-none lg:translate-x-0 lg:bottom-auto lg:fixed-none lg:side-curved-tab lg:absolute lg:left-0 lg:top-[104px] lg:w-[60px] lg:rounded-r-[32px] lg:rounded-l-none lg:flex-col lg:gap-1.5 lg:py-3.5 lg:overflow-visible lg:shadow-lg lg:shadow-indigo-600/20"
        aria-label="Admin Navigation"
      >
        {/* 1. Dashboard */}
        <div className="group relative">
          <button
            onClick={() => {
              setActiveSideNav('dashboard');
              setActiveTab('dashboard');
            }}
            aria-current={activeSideNav === 'dashboard' ? 'page' : undefined}
            className={`relative w-10 h-10 lg:w-11 lg:h-11 rounded-2xl flex items-center justify-center transition-all ${
              activeSideNav === 'dashboard'
                ? 'bg-white text-[#6D5CF2] shadow-md shadow-indigo-900/30 scale-105'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
            aria-label="Dashboard"
          >
            <Grid className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:block absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#1D1B3A] text-white text-[11px] font-semibold rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            Dashboard
          </span>
        </div>

        {/* 2. Members */}
        <div className="group relative">
          <button
            onClick={() => {
              setActiveSideNav('members');
              setActiveTab('workflows');
            }}
            aria-current={activeSideNav === 'members' ? 'page' : undefined}
            className={`relative w-10 h-10 lg:w-11 lg:h-11 rounded-2xl flex items-center justify-center transition-all ${
              activeSideNav === 'members'
                ? 'bg-white text-[#6D5CF2] shadow-md shadow-indigo-900/30 scale-105'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
            aria-label="Members Directory"
          >
            <Users className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:block absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#1D1B3A] text-white text-[11px] font-semibold rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            Members Roster
          </span>
        </div>

        {/* 3. Attendance */}
        <div className="group relative">
          <button
            onClick={() => {
              setActiveSideNav('attendance');
              setIsAttendanceModalOpen(true);
            }}
            aria-current={activeSideNav === 'attendance' ? 'page' : undefined}
            className={`relative w-10 h-10 lg:w-11 lg:h-11 rounded-2xl flex items-center justify-center transition-all ${
              activeSideNav === 'attendance'
                ? 'bg-white text-[#6D5CF2] shadow-md shadow-indigo-900/30 scale-105'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
            aria-label="Attendance Live"
          >
            <PieChart className="w-5 h-5 shrink-0" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#59E0AE] border-2 border-[#6D5CF2]" />
          </button>
          <span className="hidden lg:block absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#1D1B3A] text-white text-[11px] font-semibold rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            Attendance Live (79%)
          </span>
        </div>

        {/* 4. Notifications */}
        <div className="group relative">
          <button
            onClick={() => {
              setActiveSideNav('notifications');
              setNotificationsCleared(false);
              showToast('Showing notifications and service briefings');
            }}
            aria-current={activeSideNav === 'notifications' ? 'page' : undefined}
            className={`relative w-10 h-10 lg:w-11 lg:h-11 rounded-2xl flex items-center justify-center transition-all ${
              activeSideNav === 'notifications'
                ? 'bg-white text-[#6D5CF2] shadow-md shadow-indigo-900/30 scale-105'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 shrink-0" />
            {!notificationsCleared && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-400 border-2 border-[#6D5CF2]" />
            )}
          </button>
          <span className="hidden lg:block absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#1D1B3A] text-white text-[11px] font-semibold rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            Notifications (2)
          </span>
        </div>

        {/* 5. Services */}
        <div className="group relative">
          <button
            onClick={() => {
              setActiveSideNav('services');
              setIsAddServiceOpen(true);
            }}
            aria-current={activeSideNav === 'services' ? 'page' : undefined}
            className={`relative w-10 h-10 lg:w-11 lg:h-11 rounded-2xl flex items-center justify-center transition-all ${
              activeSideNav === 'services'
                ? 'bg-white text-[#6D5CF2] shadow-md shadow-indigo-900/30 scale-105'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
            aria-label="Services Schedule"
          >
            <CalendarIcon className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:block absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#1D1B3A] text-white text-[11px] font-semibold rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            Services & Schedule
          </span>
        </div>

        {/* 6. Messages */}
        <div className="group relative">
          <button
            onClick={() => {
              setActiveSideNav('messages');
              setIsMessageModalOpen(true);
            }}
            aria-current={activeSideNav === 'messages' ? 'page' : undefined}
            className={`relative w-10 h-10 lg:w-11 lg:h-11 rounded-2xl flex items-center justify-center transition-all ${
              activeSideNav === 'messages'
                ? 'bg-white text-[#6D5CF2] shadow-md shadow-indigo-900/30 scale-105'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
            aria-label="Broadcast Messages"
          >
            <Mail className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:block absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#1D1B3A] text-white text-[11px] font-semibold rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            Broadcast Messages
          </span>
        </div>

        {/* 7. Follow-up */}
        <div className="group relative">
          <button
            onClick={() => {
              setActiveSideNav('followup');
              setIsFollowupModalOpen(true);
            }}
            aria-current={activeSideNav === 'followup' ? 'page' : undefined}
            className={`relative w-10 h-10 lg:w-11 lg:h-11 rounded-2xl flex items-center justify-center transition-all ${
              activeSideNav === 'followup'
                ? 'bg-white text-[#6D5CF2] shadow-md shadow-indigo-900/30 scale-105'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
            aria-label="Pastoral Care Follow-up"
          >
            <CheckSquare className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:block absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#1D1B3A] text-white text-[11px] font-semibold rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            Care Follow-up Queue
          </span>
        </div>

        {/* 8. Chat */}
        <div className="group relative">
          <button
            onClick={() => {
              setActiveSideNav('chat');
              setIsChatOpen(true);
            }}
            aria-current={activeSideNav === 'chat' ? 'page' : undefined}
            className={`relative w-10 h-10 lg:w-11 lg:h-11 rounded-2xl flex items-center justify-center transition-all ${
              activeSideNav === 'chat'
                ? 'bg-white text-[#6D5CF2] shadow-md shadow-indigo-900/30 scale-105'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
            aria-label="Staff Coordination Chat"
          >
            <MessageCircle className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:block absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-[#1D1B3A] text-white text-[11px] font-semibold rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            Staff Coordination Chat
          </span>
        </div>
      </nav>

      {/* Top Header Row with Overflow Protection */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        {/* Top tabs */}
        <div className="flex items-center gap-4 sm:gap-6 font-semibold text-xs sm:text-sm overflow-x-auto scrollbar-none pb-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-1.5 py-1 whitespace-nowrap transition-colors ${
              activeTab === 'dashboard'
                ? 'text-[#1D1B3A] dark:text-[#F2F2FA] font-bold border-b-2 border-[#6D5CF2]'
                : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
            }`}
          >
            <Grid className="w-4 h-4 text-[#6D5CF2] shrink-0" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('workflows')}
            className={`flex items-center gap-1.5 py-1 whitespace-nowrap transition-colors ${
              activeTab === 'workflows'
                ? 'text-[#1D1B3A] dark:text-[#F2F2FA] font-bold border-b-2 border-[#6D5CF2]'
                : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
            }`}
          >
            <CheckSquare className="w-4 h-4 text-[#6D5CF2] shrink-0" />
            Workflows
          </button>
          <button
            onClick={() => setActiveTab('integrations')}
            className={`flex items-center gap-1.5 py-1 whitespace-nowrap transition-colors ${
              activeTab === 'integrations'
                ? 'text-[#1D1B3A] dark:text-[#F2F2FA] font-bold border-b-2 border-[#6D5CF2]'
                : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white'
            }`}
          >
            <Plus className="w-4 h-4 text-[#6D5CF2] shrink-0" />
            Integrations
          </button>
        </div>

        {/* Search with Live Dropdown */}
        <div className="relative flex-1 max-w-xs">
          <div className="flex items-center gap-2 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-2xl px-3.5 py-2 text-xs sm:text-sm text-[#666A86] dark:text-[#A9ACC8] shadow-sm">
            <Search className="w-4 h-4 shrink-0 text-[#6D5CF2]" />
            <input
              type="text"
              placeholder="Search member, phone or cell..."
              value={searchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-0 outline-none text-[#1D1B3A] dark:text-[#F2F2FA] placeholder-[#666A86] dark:placeholder-[#A9ACC8] text-xs"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Dropdown Results */}
          {isSearchFocused && searchQuery && (
            <div className="absolute left-0 right-0 top-11 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-2xl shadow-xl z-30 p-2 text-xs space-y-1 max-h-60 overflow-y-auto">
              {searchResults.length > 0 ? (
                searchResults.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => {
                      checkInPerson(m.id, 'usher', 95);
                      setSearchQuery('');
                    }}
                    className="p-2 rounded-xl hover:bg-[#EFEDFF] dark:hover:bg-[#2A2A55] cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div>
                      <b className="block text-[#1D1B3A] dark:text-[#F2F2FA]">
                        {m.firstName} {m.lastName}
                      </b>
                      <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                        {m.phoneE164} · {m.groupName}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold bg-[#6D5CF2] text-white px-2 py-0.5 rounded-lg">
                      Check in
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-3 text-center text-slate-400">No members matching "{searchQuery}"</div>
              )}
            </div>
          )}
        </div>

        {/* Right Action Cluster */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          {/* Segmented Light/Dark switcher */}
          <div className="flex bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl p-0.5 text-xs font-semibold shrink-0">
            <button
              onClick={() => setTheme('light')}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg transition-all ${
                theme === 'light'
                  ? 'bg-[#EFEDFF] text-[#6D5CF2] shadow-sm'
                  : 'text-[#666A86] hover:text-[#1D1B3A]'
              }`}
            >
              <Sun className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Light</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg transition-all ${
                theme === 'dark'
                  ? 'bg-[#2A2A55] text-[#8C7DFF] shadow-sm'
                  : 'text-[#A9ACC8] hover:text-white'
              }`}
            >
              <Moon className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Dark</span>
            </button>
          </div>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-9 h-9 rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-center text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white transition-colors shrink-0"
            title="System Settings"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-xl px-3 py-2 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-50 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-[#6D5CF2] shrink-0" />
            <span className="hidden sm:inline">Export</span>
            <span className="bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded px-1 text-[10px] uppercase font-bold">
              CSV
            </span>
          </button>

          <button
            onClick={() => setIsAddServiceOpen(true)}
            className="flex items-center gap-1.5 bg-[#1D1B3A] dark:bg-[#6D5CF2] text-white rounded-xl px-3.5 py-2 text-xs font-bold hover:opacity-95 shadow-sm transition-all whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Add service</span>
          </button>
        </div>
      </header>

      {/* Main Content View based on Tab */}
      {activeTab === 'dashboard' && (
        <>
          {/* Hero Greeting Section */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4 my-4 sm:my-6 items-stretch">
            {/* Left Welcome Box */}
            <div className="lg:col-span-2 flex flex-col justify-center min-w-0">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA] leading-tight mb-2">
                Hi, James!
                <span className="inline-flex gap-1 ml-2.5 align-middle">
                  <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#6D5CF2] border-2 border-[#F6F7FC] dark:border-[#14142E] inline-block shadow-sm" />
                  <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#59C3C3] border-2 border-[#F6F7FC] dark:border-[#14142E] inline-block -ml-2 shadow-sm" />
                </span>
                <br />
                What are your plans for today?
              </h1>
              <p className="text-xs sm:text-sm text-[#666A86] dark:text-[#A9ACC8] max-w-[40ch] leading-relaxed">
                This platform is designed to take care of attendance and follow-up, so you can focus on your people.
              </p>

              {/* Pinned shortcuts strip if any */}
              {customShortcuts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {customShortcuts.map((sc, i) => (
                    <span
                      key={i}
                      className="bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1"
                    >
                      {sc}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Dash Tile: Add shortcut */}
            <button
              onClick={() => setIsAddShortcutOpen(true)}
              className="border-2 border-dashed border-[#CBC6F7] dark:border-[#3B3B72] rounded-3xl p-4 flex flex-col items-center justify-center gap-2 hover:bg-[#EFEDFF]/40 dark:hover:bg-[#2A2A55]/20 transition-colors group min-h-[120px] text-center"
              aria-label="Add shortcut tile"
            >
              <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#6D5CF2] text-white flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                <Plus className="w-5 h-5" />
              </span>
              <span className="text-xs font-semibold text-[#6D5CF2] dark:text-[#8C7DFF]">Add shortcut</span>
            </button>

            {/* Tile 1: Check people in */}
            <button
              onClick={handleQuickArrivalCheckin}
              className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 shadow-[0_10px_30px_rgba(60,50,140,0.08)] border border-[#E9EBF5] dark:border-[#2D2D55] text-left flex flex-col justify-between hover:shadow-md transition-shadow group min-h-[120px]"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform shrink-0">
                <PieChart className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <b className="block text-xs sm:text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                  Check people in
                </b>
                <small className="text-[11px] sm:text-xs text-[#666A86] dark:text-[#A9ACC8] truncate block">
                  Counts arrivals live
                </small>
              </div>
            </button>

            {/* Tile 2: Follow up */}
            <button
              onClick={() => setIsFollowupModalOpen(true)}
              className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 shadow-[0_10px_30px_rgba(60,50,140,0.08)] border border-[#E9EBF5] dark:border-[#2D2D55] text-left flex flex-col justify-between hover:shadow-md transition-shadow group min-h-[120px]"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#FFE2E6] dark:bg-[#4A2229] text-[#C9314F] dark:text-[#FF9AAA] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform shrink-0">
                <CheckSquare className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <b className="block text-xs sm:text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                  Follow up
                </b>
                <small className="text-[11px] sm:text-xs text-[#666A86] dark:text-[#A9ACC8] truncate block">
                  No one drifts away
                </small>
              </div>
            </button>

            {/* Tile 3: Message members */}
            <button
              onClick={() => setIsMessageModalOpen(true)}
              className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 shadow-[0_10px_30px_rgba(60,50,140,0.08)] border border-[#E9EBF5] dark:border-[#2D2D55] text-left flex flex-col justify-between hover:shadow-md transition-shadow group min-h-[120px]"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#DDF5EC] dark:bg-[#16382F] text-[#1E7A5F] dark:text-[#5FD3AB] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform shrink-0">
                <Mail className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <b className="block text-xs sm:text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                  Message members
                </b>
                <small className="text-[11px] sm:text-xs text-[#666A86] dark:text-[#A9ACC8] truncate block">
                  Push, SMS and email
                </small>
              </div>
            </button>
          </section>

          {/* Cards Grid: 6 Columns Desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 sm:gap-5">
            {/* 1. Notifications Card (Span 2) */}
            <section className="lg:col-span-2 bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 sm:p-5 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between overflow-hidden">
              <div>
                <div className="flex items-center justify-between mb-3.5">
                  <h2 className="text-sm sm:text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Notifications</h2>
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
                          <span className="w-2 h-2 rounded-full bg-[#4FBF98] shrink-0" />
                          Upcoming event
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setIsEditEventOpen(true)}
                            className="p-1 rounded-lg text-[#666A86] hover:text-[#6D5CF2] transition-colors"
                            title="Edit Event Details"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-2.5 truncate">
                        {upcomingEvent.title} · {upcomingEvent.duration}
                      </div>
                      <div className="flex items-center gap-3 pt-2 border-t border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="w-3.5 h-3.5 text-[#6D5CF2] shrink-0" />
                          {upcomingEvent.date}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#6D5CF2] shrink-0" />
                          {upcomingEvent.time}
                        </span>
                      </div>
                    </div>

                    {/* Follow-up Note Card */}
                    <div
                      onClick={() => setIsFollowupModalOpen(true)}
                      className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-3.5 border border-[#E9EBF5] dark:border-[#2D2D55] cursor-pointer hover:border-[#6D5CF2] transition-colors"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                        <Mail className="w-3.5 h-3.5 text-[#6D5CF2] shrink-0" />
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

            {/* 2. Assignments Card (Span 2) */}
            <section className="lg:col-span-2 bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 sm:p-5 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between overflow-hidden">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm sm:text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Assignments</h2>
                  <button
                    onClick={() => setIsFollowupModalOpen(true)}
                    className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#6D5CF2] flex items-center gap-1 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    View all ({followupTasks.filter((t) => t.status === 'open').length})
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                  <span className="bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] text-xs font-semibold px-2 py-0.5 rounded-md">
                    Pastoral care
                  </span>
                  <span className="bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] text-xs font-semibold px-2 py-0.5 rounded-md">
                    Osu North cell
                  </span>
                </div>

                <h3 className="text-sm sm:text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] leading-snug mb-3">
                  Call Kofi Mensah, absent three weeks in a row
                </h3>

                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="bg-[#7AD3B6]/20 text-[#12503D] dark:text-[#7AD3B6] text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                    Care call
                  </span>
                  <span className="bg-[#FFE2E6] dark:bg-[#4A2229] text-[#C9314F] dark:text-[#FF9AAA] text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                    High Priority
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
                  <span className="text-[#666A86] dark:text-[#A9ACC8]">Assigned to</span>
                  <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5 truncate">
                    <span className="w-6 h-6 rounded-full bg-[#F2B8A6] text-[#5A2A1E] font-bold text-[10px] flex items-center justify-center shrink-0">
                      RL
                    </span>
                    Ruth Larbi (Pastor)
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsNewAssignmentOpen(true)}
                className="mt-4 w-full border-2 border-dashed border-[#CBC6F7] dark:border-[#3B3B72] rounded-2xl py-2.5 text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center justify-center gap-1.5 hover:bg-[#EFEDFF]/40 dark:hover:bg-[#2A2A55]/20 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add new assignment
              </button>
            </section>

            {/* 3. Calendar & Timeline (Span 2) */}
            <section className="lg:col-span-2 bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 sm:p-5 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col justify-between overflow-hidden">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm sm:text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">{weekLabel}</h2>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setWeekOffset((w) => w - 1);
                        showToast('Shifted to previous week schedule');
                      }}
                      className="p-1 rounded-lg text-[#666A86] hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                      title="Previous week"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setWeekOffset((w) => w + 1);
                        showToast('Shifted to next week schedule');
                      }}
                      className="p-1 rounded-lg text-[#666A86] hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                      title="Next week"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 7-day selector */}
                <div className="grid grid-cols-7 gap-1 text-center mb-3">
                  {currentDaysList.map((d) => (
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
                          <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] truncate block">
                            {ev.time} · {ev.location}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-xs text-[#666A86] dark:text-[#A9ACC8]">
                      No events scheduled for this day.
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] text-xs text-[#666A86] dark:text-[#A9ACC8] flex justify-between items-center">
                <span className="truncate">Active Service:</span>
                <span className="font-bold text-[#6D5CF2] truncate ml-1">{currentService.name.split(',')[0]}</span>
              </div>
            </section>

            {/* 4. Today's Tasks (Span 3) */}
            <section className="lg:col-span-3 bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 sm:p-5 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <h2 className="text-sm sm:text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Today’s tasks</h2>
                  {/* Avatar stack */}
                  <div className="flex -space-x-2">
                    <span className="w-6 h-6 rounded-full bg-[#6D5CF2] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-[#1D1D3D] shrink-0">
                      RL
                    </span>
                    <span className="w-6 h-6 rounded-full bg-[#59C3C3] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-[#1D1D3D] shrink-0">
                      KA
                    </span>
                    <span className="w-6 h-6 rounded-full bg-[#F29F6D] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-[#1D1D3D] shrink-0">
                      EQ
                    </span>
                    <span className="w-6 h-6 rounded-full bg-[#1D1B3A] text-white text-[9px] font-bold flex items-center justify-center border-2 border-white dark:border-[#1D1D3D] shrink-0">
                      +4
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                  {/* View mode toggle */}
                  <div className="flex bg-[#F6F7FC] dark:bg-[#14142E] rounded-lg p-0.5 border border-[#E9EBF5] dark:border-[#2D2D55]">
                    <button
                      onClick={() => setTaskViewMode('list')}
                      className={`p-1 rounded ${
                        taskViewMode === 'list' ? 'bg-[#6D5CF2] text-white' : 'text-[#666A86]'
                      }`}
                      title="List View"
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setTaskViewMode('grid')}
                      className={`p-1 rounded ${
                        taskViewMode === 'grid' ? 'bg-[#6D5CF2] text-white' : 'text-[#666A86]'
                      }`}
                      title="Grid View"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={handleShareChecklist}
                    className="hover:text-[#1D1B3A] dark:hover:text-white flex items-center gap-1 transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Share
                  </button>
                </div>
              </div>

              {/* Tasks rendering based on viewMode */}
              <div className={taskViewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5' : 'space-y-2.5'}>
                {tasksList.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => handleToggleTask(t.id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                      t.completed
                        ? 'bg-[#DDF5EC]/50 border-emerald-300 dark:border-emerald-800'
                        : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]'
                    } flex flex-col sm:flex-row sm:items-center justify-between gap-2.5`}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span
                        className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                          t.completed ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {t.completed && <Check className="w-3 h-3" />}
                      </span>
                      <div className="min-w-0">
                        <b
                          className={`block text-xs font-bold truncate ${
                            t.completed
                              ? 'line-through text-slate-400 dark:text-slate-500'
                              : 'text-[#1D1B3A] dark:text-[#F2F2FA]'
                          }`}
                        >
                          {t.title}
                        </b>
                        <em className="text-[11px] not-italic text-[#666A86] dark:text-[#A9ACC8] truncate block">
                          {t.time}
                        </em>
                      </div>
                    </div>

                    <div className="text-xs text-[#666A86] dark:text-[#A9ACC8] shrink-0">
                      <em>Duration:</em> <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">{t.duration}</b>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] min-w-[100px] shrink-0">
                      <span>{t.progress}%</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] overflow-hidden">
                        <div
                          className="h-full bg-[#6D5CF2] rounded-full transition-all duration-300"
                          style={{ width: `${t.progress}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-[#666A86] dark:text-[#A9ACC8] font-semibold shrink-0">
                      {t.volunteers}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* 5. Promo Card (Span 1) */}
            <section className="lg:col-span-1 bg-[#6D5CF2] text-white rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-between text-center shadow-[0_10px_30px_rgba(109,92,242,0.3)] overflow-hidden">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/20 flex items-center justify-center mb-2 shrink-0">
                <Bell className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold mb-1">Turn on auto check-in!</h2>
                <p className="text-xs text-white/90 leading-snug mb-3">
                  36% of members still sign in by hand. Invite them to switch it on.
                </p>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(true)}
                className="w-full bg-[#1D1B3A] hover:bg-[#1D1B3A]/90 text-white rounded-xl py-2 text-xs font-bold transition-all shadow-sm"
              >
                Invite members
              </button>
            </section>

            {/* 6. Metrics & Meetings (Span 2) */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              {/* Row with two Circular Progress Rings */}
              <div className="grid grid-cols-2 gap-3">
                {/* Ring 1: Attendance */}
                <div
                  onClick={() => setIsAttendanceModalOpen(true)}
                  className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-3.5 sm:p-4 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col items-center text-center cursor-pointer hover:border-[#6D5CF2] transition-colors"
                >
                  <div className="relative w-14 h-14 sm:w-16 sm:h-16 mb-2">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 60 60">
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
                  <b className="text-xs text-[#1D1B3A] dark:text-[#F2F2FA] truncate">Sunday Service</b>
                  <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] tabular-nums">
                    {totalCheckedInCount} of {expectedAttendance}
                  </span>
                </div>

                {/* Ring 2: Auto Check-In Opt-In */}
                <div
                  onClick={() => setIsInviteModalOpen(true)}
                  className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-3.5 sm:p-4 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col items-center text-center cursor-pointer hover:border-[#6D5CF2] transition-colors"
                >
                  <div className="relative w-14 h-14 sm:w-16 sm:h-16 mb-2">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 60 60">
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
                  <b className="text-xs text-[#1D1B3A] dark:text-[#F2F2FA] truncate">Opt-in rate</b>
                  <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">187 to go</span>
                </div>
              </div>

              {/* Leaders Meeting Card */}
              <section className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 shadow-[0_10px_30px_rgba(60,50,140,0.07)] border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Leaders’ meeting</h2>
                  <button
                    onClick={() => setIsRescheduleOpen(true)}
                    className="text-xs text-[#666A86] hover:text-[#6D5CF2] p-1"
                    title="Edit Meeting"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-xs text-[#666A86] dark:text-[#A9ACC8] font-semibold block">
                  {leadersMeetingTime}
                </span>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] my-2 leading-relaxed">
                  Easter planning and cell group reports, church office, room 2.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsRescheduleOpen(true)}
                    className="flex-1 bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-2 text-xs font-bold hover:opacity-90 transition-all"
                  >
                    Reschedule
                  </button>
                  <button
                    onClick={() => {
                      setLeadersMeetingAccepted(!leadersMeetingAccepted);
                      showToast(leadersMeetingAccepted ? 'Meeting invite removed' : 'Meeting invite accepted!');
                    }}
                    className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                      leadersMeetingAccepted
                        ? 'bg-[#1E7A5F] text-white'
                        : 'bg-[#6D5CF2] text-white hover:bg-[#5b4be0]'
                    }`}
                  >
                    {leadersMeetingAccepted ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Accepted
                      </>
                    ) : (
                      'Accept invite'
                    )}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </>
      )}

      {/* Workflows Tab: Members Roster & Care Follow-up list */}
      {activeTab === 'workflows' && (
        <div className="mt-4 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Member Directory & Care Workflows
              </h2>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Track membership status, cell groups, and consecutive absences under Act 843 privacy rules.
              </p>
            </div>
            <button
              onClick={() => setIsNewAssignmentOpen(true)}
              className="bg-[#6D5CF2] text-white rounded-xl px-4 py-2.5 text-xs font-bold flex items-center gap-1.5 shadow-sm self-start sm:self-auto shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              New Care Follow-up
            </button>
          </div>

          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[600px]">
              <thead>
                <tr className="border-b border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]">
                  <th className="pb-3 font-semibold">Member</th>
                  <th className="pb-3 font-semibold">Phone (E.164)</th>
                  <th className="pb-3 font-semibold">Cell Group</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Auto Check-in</th>
                  <th className="pb-3 font-semibold">Consecutive Absences</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55]">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <td className="py-3 font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] font-bold text-[11px] flex items-center justify-center shrink-0">
                        {m.avatarInitials}
                      </span>
                      <span className="truncate">
                        {m.firstName} {m.lastName}
                      </span>
                    </td>
                    <td className="py-3 text-[#666A86] dark:text-[#A9ACC8] font-mono tabular-nums">{m.phoneE164}</td>
                    <td className="py-3 text-[#666A86] dark:text-[#A9ACC8] truncate">{m.groupName}</td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          m.status === 'member'
                            ? 'bg-[#DDF5EC] text-[#1E7A5F] dark:bg-[#16382F] dark:text-[#5FD3AB]'
                            : 'bg-[#FFEFD0] text-[#8A5700] dark:bg-[#3D2E10] dark:text-[#F5B84A]'
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="py-3">
                      {m.autoCheckinOptedIn ? (
                        <span className="text-[#1E7A5F] dark:text-[#5FD3AB] font-semibold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Opted In
                        </span>
                      ) : (
                        <span className="text-[#666A86] dark:text-[#A9ACC8]">Manual only</span>
                      )}
                    </td>
                    <td className="py-3 font-bold tabular-nums">
                      {m.consecutiveAbsences > 0 ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] ${
                            m.consecutiveAbsences >= 3
                              ? 'bg-[#FFE2E6] text-[#C9314F] font-bold'
                              : 'bg-[#FFEFD0] text-[#8A5700]'
                          }`}
                        >
                          {m.consecutiveAbsences} {m.consecutiveAbsences === 1 ? 'service' : 'services'}
                        </span>
                      ) : (
                        <span className="text-[#666A86] dark:text-[#A9ACC8] font-normal">Active (0)</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {m.consecutiveAbsences >= 2 ? (
                        <button
                          onClick={() => {
                            setIsFollowupModalOpen(true);
                            setSelectedCareTask(m.id);
                          }}
                          className="bg-[#FFE2E6] dark:bg-[#4A2229] text-[#C9314F] dark:text-[#FF9AAA] px-2.5 py-1 rounded-lg font-bold hover:opacity-90 transition-opacity"
                        >
                          Care Call
                        </button>
                      ) : (
                        <button
                          onClick={() => checkInPerson(m.id, 'usher', 95)}
                          className="bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] px-2.5 py-1 rounded-lg font-bold hover:bg-[#6D5CF2] hover:text-white transition-all"
                        >
                          Check In
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Integrations Tab: Beacons, Webhooks, Paystack, Geofence Config */}
      {activeTab === 'integrations' && (
        <div className="mt-4 space-y-5">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              Hardware & Service Integrations
            </h2>
            <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
              Manage entrance BLE beacons, PostGIS geofence rings, SMS gateways (Hubtel/Arkesel), and Paystack.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Geofence Engine */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2 flex items-center justify-between">
                  <span>PostGIS Campus Geofencing</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3 leading-relaxed">
                  Outer Ring: 300 m (App approach wake-up)
                  <br />
                  Inner Ring: 100 m (5-min dwell required)
                </p>
                <div className="bg-[#F6F7FC] dark:bg-[#14142E] p-2.5 rounded-xl text-xs font-mono text-[#6D5CF2] dark:text-[#8C7DFF] mb-3 truncate">
                  POINT(5.5560, -0.1969)
                </div>
              </div>
              <button
                onClick={() => showToast('Geofence test calibrated at Accra Central campus')}
                className="w-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-2 text-xs font-bold hover:bg-[#6D5CF2] hover:text-white transition-colors"
              >
                Test Radius Accuracy
              </button>
            </div>

            {/* BLE Beacons */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2 flex items-center justify-between">
                  <span>Entrance BLE Beacons</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3 leading-relaxed">
                  UUID: b7826da4-4d5e...
                  <br />
                  Major: 1 · Minor: 101 (Main Sanctuary Door)
                </p>
                <div className="bg-[#F6F7FC] dark:bg-[#14142E] p-2.5 rounded-xl text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3">
                  Scanned only inside service window to protect battery.
                </div>
              </div>
              <button
                onClick={() => showToast('Entrance Beacon pinged: Signal strength -58 dBm (Strong)')}
                className="w-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-2 text-xs font-bold hover:bg-[#6D5CF2] hover:text-white transition-colors"
              >
                Ping Beacon
              </button>
            </div>

            {/* Paystack & MoMo */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2 flex items-center justify-between">
                  <span>Paystack & Mobile Money</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3 leading-relaxed">
                  MTN Mobile Money, Telecel Cash & Cards active with automated webhook verification.
                </p>
                <div className="bg-[#F6F7FC] dark:bg-[#14142E] p-2.5 rounded-xl text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3">
                  Settlement Currency: GHS (Ghana Cedis)
                </div>
              </div>
              <button
                onClick={() => showToast('Payment gateway webhook verified')}
                className="w-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] rounded-xl py-2 text-xs font-bold hover:bg-[#6D5CF2] hover:text-white transition-colors"
              >
                Test MoMo Webhook
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Add New Service */}
      {isAddServiceOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-md w-full p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] animate-in fade-in">
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
                <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] block mt-1">
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
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleBroadcastSend}
            className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-lg w-full p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] animate-in fade-in"
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

      {/* MODAL 3: Follow-up Queue */}
      {isFollowupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-2xl w-full p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[85vh] flex flex-col animate-in fade-in">
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
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                          className="bg-[#6D5CF2] text-white px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 shadow-sm whitespace-nowrap"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          Log Call
                        </button>
                        <button
                          onClick={() => resolveFollowupTask(t.id, 'Excused absence (traveling)')}
                          className="bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap"
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
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateAssignment}
            className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-md w-full p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] animate-in fade-in"
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
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-sm w-full p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-center animate-in fade-in">
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

      {/* MODAL 6: Edit Upcoming Event */}
      {isEditEventOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-md w-full p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] animate-in fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Edit Briefing Event</h3>
              <button onClick={() => setIsEditEventOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Event Title</label>
                <input
                  type="text"
                  value={upcomingEvent.title}
                  onChange={(e) => setUpcomingEvent({ ...upcomingEvent, title: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold mb-1">Date</label>
                  <input
                    type="text"
                    value={upcomingEvent.date}
                    onChange={(e) => setUpcomingEvent({ ...upcomingEvent, date: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Time</label>
                  <input
                    type="text"
                    value={upcomingEvent.time}
                    onChange={(e) => setUpcomingEvent({ ...upcomingEvent, time: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setIsEditEventOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  showToast('Briefing event updated!');
                  setIsEditEventOpen(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: Reschedule Leaders' Meeting */}
      {isRescheduleOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-sm w-full p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] animate-in fade-in">
            <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-3">Reschedule Leaders’ Meeting</h3>
            <div className="space-y-3 text-xs mb-4">
              <div>
                <label className="block font-semibold mb-1">Proposed Date & Time</label>
                <input
                  type="text"
                  value={leadersMeetingTime}
                  onChange={(e) => setLeadersMeetingTime(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsRescheduleOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  showToast('Reschedule notification sent to board members.');
                  setIsRescheduleOpen(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 8: Attendance Live Breakdown */}
      {isAttendanceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-md w-full p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] max-h-[85vh] flex flex-col animate-in fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Attendance Breakdown</h3>
              <button onClick={() => setIsAttendanceModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 text-xs">
              <div className="p-3 bg-[#EFEDFF] dark:bg-[#2A2A55] rounded-2xl flex items-center justify-between font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
                <span>Total Checked In</span>
                <span className="text-base tabular-nums">{totalCheckedInCount}</span>
              </div>
              <div className="space-y-1.5 pt-2">
                <span className="font-semibold text-slate-500 uppercase text-[10px]">By Cell Group:</span>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span>Osu North cell</span>
                  <b className="tabular-nums">114</b>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span>Youth Fellowship</span>
                  <b className="tabular-nums">98</b>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span>Choir & Music Ministry</span>
                  <b className="tabular-nums">76</b>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span>Men’s Fellowship</span>
                  <b className="tabular-nums">64</b>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span>Women’s Fellowship</span>
                  <b className="tabular-nums">60</b>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsAttendanceModalOpen(false)}
              className="mt-4 w-full py-2.5 rounded-xl bg-[#1D1B3A] text-white text-xs font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* MODAL 9: Invite Members to Auto Check-in */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-md w-full p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] animate-in fade-in">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Auto Check-in Invitations</h3>
              <button onClick={() => setIsInviteModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-4 leading-relaxed">
              187 members currently record attendance manually. Send an invitation explaining that location is only
              checked when arriving on campus.
            </p>
            <div className="bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl p-3 text-xs space-y-2 mb-4">
              <div className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">Invitation SMS Copy:</div>
              <p className="text-slate-500 italic">
                “Hello Ama! Skip the queue this Sunday with Ekklesphere Auto Check-in. Your phone checks you in
                automatically when you arrive at Accra Central. Tap to enable: ekkle.app/optin”
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  showToast('Invitations sent to 187 members via SMS and Push!');
                  setIsInviteModalOpen(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold shadow-sm"
              >
                Send to 187 Members
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 10: System Settings */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-md w-full p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] animate-in fade-in space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">System Settings</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Church Tenant</label>
                <input
                  type="text"
                  disabled
                  value="Accra Central Church (Accra Central, Ghana)"
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-black/40 text-slate-500 font-semibold"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold mb-1">Outer Geofence</label>
                  <input
                    type="text"
                    defaultValue="300 meters"
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-black/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Inner Dwell Ring</label>
                  <input
                    type="text"
                    defaultValue="100 meters"
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-black/20"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold mb-1">Data Retention Period (Act 843)</label>
                <select className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-black/20">
                  <option>Raw signals: 90 days, Records: 2 years</option>
                  <option>Raw signals: 30 days, Records: 1 year</option>
                  <option>Raw signals: 180 days, Records: 5 years</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  showToast('System configuration saved');
                  setIsSettingsOpen(false);
                }}
                className="py-2.5 px-5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER 11: Staff Coordination Chat */}
      {isChatOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end">
          <div className="bg-white dark:bg-[#1D1D3D] w-full max-w-sm h-full p-5 shadow-2xl flex flex-col justify-between border-l border-[#E9EBF5] dark:border-[#2D2D55] animate-in slide-in-from-right">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-[#6D5CF2]" />
                  <div>
                    <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Staff Channel</h3>
                    <span className="text-[10px] text-emerald-500 font-semibold">● 8 Ushers & Pastors online</span>
                  </div>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 overflow-y-auto max-h-[70vh] pr-1 text-xs">
                {chatMessages.map((msg, i) => (
                  <div key={i} className="p-3 bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl">
                    <div className="flex justify-between items-center mb-1">
                      <b className="text-[11px] text-[#6D5CF2]">{msg.sender}</b>
                      <span className="text-[10px] text-slate-400">{msg.time}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">{msg.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleSendChatMessage} className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <input
                type="text"
                placeholder="Type team update..."
                value={newChatMessage}
                onChange={(e) => setNewChatMessage(e.target.value)}
                className="flex-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-black/20 text-xs"
              />
              <button type="submit" className="bg-[#6D5CF2] text-white p-2.5 rounded-xl">
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 12: Add Shortcut */}
      {isAddShortcutOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleAddShortcut}
            className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-sm w-full p-6 shadow-xl border border-[#E9EBF5] dark:border-[#2D2D55] animate-in fade-in"
          >
            <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2">Pin Custom Shortcut</h3>
            <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mb-3">
              Add a quick link or tag to your executive greeting section.
            </p>
            <input
              type="text"
              placeholder="e.g. Baptism List, Choir Roster"
              value={newShortcutName}
              onChange={(e) => setNewShortcutName(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-black/20 text-xs mb-4"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsAddShortcutOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold"
              >
                Cancel
              </button>
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-[#6D5CF2] text-white text-xs font-bold">
                Pin Tile
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
