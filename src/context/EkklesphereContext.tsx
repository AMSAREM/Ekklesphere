import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Person,
  ServiceInstance,
  AttendanceRecord,
  FollowupTask,
  Donation,
  AuditLogItem,
  CheckinMethod,
  ServerDwellJob,
  GeofenceSignalKind,
} from '../types/ekklesphere';

interface EkklesphereContextType {
  // Navigation & Theme
  activePortal: 'admin' | 'member' | 'usher' | 'simulator';
  setActivePortal: (portal: 'admin' | 'member' | 'usher' | 'simulator') => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;

  // Active Service
  activeServiceId: string;
  setActiveServiceId: (id: string) => void;
  services: ServiceInstance[];
  currentService: ServiceInstance;

  // People & Members
  members: Person[];
  visitorsCount: number;
  addVisitor: (name: string, phone: string, howHeard: string) => void;
  updateMemberConsent: (autoCheckin: boolean, push: boolean, sms: boolean, email: boolean) => void;

  // Attendance Records & Metrics
  attendanceRecords: AttendanceRecord[];
  totalCheckedInCount: number;
  expectedAttendance: number;
  attendancePercentage: number;
  autoCheckinOptedInCount: number;
  totalMembersCount: number;
  optInPercentage: number;

  // Check-in Actions
  checkInPerson: (personId: string, method: CheckinMethod, confidence?: number, note?: string) => boolean;
  removeCheckIn: (personId: string) => void;

  // Usher PWA Offline simulation
  isUsherOnline: boolean;
  setIsUsherOnline: (online: boolean) => void;
  pendingSyncCount: number;
  syncUsherCheckins: () => number;

  // Proximity Simulator & Server BullMQ Dwell Job
  proximityStage: 0 | 1 | 2 | 3; // 0=Outside, 1=300m Outer, 2=100m Inner/Dwell, 3=Checked In
  dwellTimerSeconds: number;
  isBeaconDetected: boolean;
  setIsBeaconDetected: (detected: boolean) => void;
  advanceProximityStage: () => void;
  resetProximity: () => void;
  triggerBeaconScan: () => void;
  triggerDwellComplete: () => void;
  serverDwellJob: ServerDwellJob;
  sendSimulatedSignal: (kind: GeofenceSignalKind) => void;
  fastForwardServerDwellJob: () => void;
  simulateDrivePast: () => void;

  // Follow-up & Pastoral Care
  followupTasks: FollowupTask[];
  resolveFollowupTask: (taskId: string, outcome: string) => void;
  addFollowupTask: (personId: string, reason: 'absent_2' | 'absent_3' | 'first_timer' | 'manual', notes: string) => void;

  // Member App States
  memberConsents: {
    autoCheckin: boolean;
    push: boolean;
    sms: boolean;
    email: boolean;
  };
  memberRsvps: Record<string, boolean>;
  toggleRsvp: (eventName: string) => void;
  donations: Donation[];
  submitDonation: (amountGhs: number, fund: string, method: 'MTN MoMo' | 'Telecel Cash' | 'Card') => void;

  // Audit Logs & Toasts
  auditLogs: AuditLogItem[];
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const INITIAL_SERVICES: ServiceInstance[] = [
  {
    id: 'svc-sun-1',
    serviceId: 'def-sun-1',
    campusId: 'campus-accra-central',
    name: 'Sunday first service, 08:00',
    startsAt: '08:00',
    endsAt: '09:30',
    status: 'open',
    expectedAttendance: 520,
  },
  {
    id: 'svc-sun-2',
    serviceId: 'def-sun-2',
    campusId: 'campus-accra-central',
    name: 'Sunday second service, 10:30',
    startsAt: '10:30',
    endsAt: '12:00',
    status: 'scheduled',
    expectedAttendance: 480,
  },
  {
    id: 'svc-wed-midweek',
    serviceId: 'def-wed-1',
    campusId: 'campus-accra-central',
    name: 'Midweek prayer, Wed 18:30',
    startsAt: '18:30',
    endsAt: '20:00',
    status: 'scheduled',
    expectedAttendance: 210,
  },
];

const INITIAL_MEMBERS: Person[] = [
  {
    id: 'm1',
    tenantId: 'tenant-accra',
    firstName: 'Ama',
    lastName: 'Owusu',
    preferredName: 'Ama',
    phoneE164: '+233241234567',
    email: 'ama@example.com',
    status: 'member',
    groupName: 'Osu North cell',
    autoCheckinOptedIn: true,
    avatarInitials: 'AO',
    joinedOn: '2023-01-15',
    consecutiveAbsences: 0,
  },
  {
    id: 'm2',
    tenantId: 'tenant-accra',
    firstName: 'Kwame',
    lastName: 'Mensah',
    phoneE164: '+233201112233',
    email: 'kwame@example.com',
    status: 'member',
    groupName: 'Choir',
    autoCheckinOptedIn: true,
    avatarInitials: 'KM',
    joinedOn: '2022-04-10',
    consecutiveAbsences: 0,
  },
  {
    id: 'm3',
    tenantId: 'tenant-accra',
    firstName: 'Efua',
    lastName: 'Asante',
    phoneE164: '+233551234567',
    email: 'efua@example.com',
    status: 'member',
    groupName: 'Youth',
    autoCheckinOptedIn: true,
    avatarInitials: 'EA',
    joinedOn: '2024-02-01',
    consecutiveAbsences: 0,
  },
  {
    id: 'm4',
    tenantId: 'tenant-accra',
    firstName: 'Yaw',
    lastName: 'Boateng',
    phoneE164: '+233244556677',
    status: 'member',
    groupName: 'Osu North cell',
    autoCheckinOptedIn: true,
    avatarInitials: 'YB',
    joinedOn: '2021-08-20',
    consecutiveAbsences: 0,
  },
  {
    id: 'm5',
    tenantId: 'tenant-accra',
    firstName: 'Akosua',
    lastName: 'Darko',
    phoneE164: '+233273344556',
    status: 'member',
    groupName: 'Ushers',
    autoCheckinOptedIn: true,
    avatarInitials: 'AD',
    joinedOn: '2023-06-12',
    consecutiveAbsences: 0,
  },
  {
    id: 'm6',
    tenantId: 'tenant-accra',
    firstName: 'Kofi',
    lastName: 'Mensah',
    phoneE164: '+233246677889',
    status: 'member',
    groupName: 'Men’s fellowship',
    autoCheckinOptedIn: false,
    avatarInitials: 'KM',
    joinedOn: '2020-03-05',
    consecutiveAbsences: 3,
    notes: 'Absent for 3 weeks consecutive. Pastoral care call scheduled.',
  },
  {
    id: 'm7',
    tenantId: 'tenant-accra',
    firstName: 'Esi',
    lastName: 'Quaye',
    phoneE164: '+233507788990',
    status: 'member',
    groupName: 'Choir',
    autoCheckinOptedIn: true,
    avatarInitials: 'EQ',
    joinedOn: '2023-11-04',
    consecutiveAbsences: 0,
  },
  {
    id: 'm8',
    tenantId: 'tenant-accra',
    firstName: 'Nana',
    lastName: 'Addo',
    phoneE164: '+233208899001',
    status: 'member',
    groupName: 'Youth',
    autoCheckinOptedIn: true,
    avatarInitials: 'NA',
    joinedOn: '2024-05-18',
    consecutiveAbsences: 2,
    notes: 'Absent for 2 weeks. Group leader notified.',
  },
  {
    id: 'm9',
    tenantId: 'tenant-accra',
    firstName: 'Adwoa',
    lastName: 'Sarpong',
    phoneE164: '+233541122334',
    status: 'member',
    groupName: 'Women’s fellowship',
    autoCheckinOptedIn: true,
    avatarInitials: 'AS',
    joinedOn: '2022-10-14',
    consecutiveAbsences: 0,
  },
  {
    id: 'm10',
    tenantId: 'tenant-accra',
    firstName: 'Kojo',
    lastName: 'Appiah',
    phoneE164: '+233269988776',
    status: 'member',
    groupName: 'Osu North cell',
    autoCheckinOptedIn: true,
    avatarInitials: 'KA',
    joinedOn: '2023-09-30',
    consecutiveAbsences: 0,
  },
];

const INITIAL_FOLLOWUPS: FollowupTask[] = [
  {
    id: 'task-1',
    personId: 'm6',
    personName: 'Kofi Mensah',
    groupName: 'Osu North / Men’s Fellowship',
    reason: 'absent_3',
    assignedToName: 'Ruth Larbi',
    status: 'open',
    dueOn: '2026-11-02',
    createdAt: '2026-10-28',
  },
  {
    id: 'task-2',
    personId: 'm8',
    personName: 'Nana Addo',
    groupName: 'Youth Fellowship',
    reason: 'absent_2',
    assignedToName: 'Kojo Appiah (Cell Leader)',
    status: 'open',
    dueOn: '2026-11-01',
    createdAt: '2026-10-29',
  },
];

const EkklesphereContext = createContext<EkklesphereContextType | undefined>(undefined);

export const EkklesphereProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePortal, setActivePortal] = useState<'admin' | 'member' | 'usher' | 'simulator'>('admin');
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [activeServiceId, setActiveServiceId] = useState<string>('svc-sun-1');
  const [services] = useState<ServiceInstance[]>(INITIAL_SERVICES);
  const [members, setMembers] = useState<Person[]>(INITIAL_MEMBERS);
  const [visitorsCount, setVisitorsCount] = useState<number>(3);
  const [followupTasks, setFollowupTasks] = useState<FollowupTask[]>(INITIAL_FOLLOWUPS);
  const [isUsherOnline, setIsUsherOnline] = useState<boolean>(true);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);

  // Proximity simulator states & Server BullMQ Dwell Job
  const [proximityStage, setProximityStage] = useState<0 | 1 | 2 | 3>(0);
  const [dwellTimerSeconds, setDwellTimerSeconds] = useState<number>(300); // 5 min
  const [isBeaconDetected, setIsBeaconDetected] = useState<boolean>(false);
  const [serverDwellJob, setServerDwellJob] = useState<ServerDwellJob>({
    jobId: 'job-dwell-m1-idle',
    queue: 'attendance:dwell-check',
    personId: 'm1',
    personName: 'Ama Owusu',
    campusId: 'campus-accra-central',
    serviceInstanceId: 'svc-sun-1',
    status: 'idle',
    startedAt: '--:--',
    delayMs: 300000,
    remainingSeconds: 300,
  });

  // Member App states
  const [memberConsents, setMemberConsents] = useState({
    autoCheckin: true,
    push: true,
    sms: false,
    email: true,
  });
  const [memberRsvps, setMemberRsvps] = useState<Record<string, boolean>>({
    'Sunday Service': true,
    'Midweek prayer': false,
    'Youth fellowship': false,
    'Harvest thanksgiving': true,
  });
  const [donations, setDonations] = useState<Donation[]>([
    {
      id: 'don-1',
      personId: 'm1',
      personName: 'Ama Owusu',
      fundId: 'tithe',
      fundName: 'Tithe',
      amountMinor: 15000,
      currency: 'GHS',
      method: 'momo',
      provider: 'MTN MoMo',
      status: 'paid',
      paidAt: '2026-10-25',
    },
  ]);

  // Initial checked-in records (matches prototype baseline 408 + individual members checked in)
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() => {
    const records: AttendanceRecord[] = [
      {
        id: 'rec-m1',
        tenantId: 'tenant-accra',
        personId: 'm1',
        serviceInstanceId: 'svc-sun-1',
        campusId: 'campus-accra-central',
        method: 'geofence',
        confidence: 85,
        checkedInAt: '07:45 AM',
        late: false,
      },
      {
        id: 'rec-m2',
        tenantId: 'tenant-accra',
        personId: 'm2',
        serviceInstanceId: 'svc-sun-1',
        campusId: 'campus-accra-central',
        method: 'beacon',
        confidence: 95,
        checkedInAt: '07:50 AM',
        late: false,
      },
      {
        id: 'rec-m3',
        tenantId: 'tenant-accra',
        personId: 'm3',
        serviceInstanceId: 'svc-sun-1',
        campusId: 'campus-accra-central',
        method: 'usher',
        confidence: 98,
        checkedInAt: '07:58 AM',
        late: false,
      },
    ];
    return records;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([
    {
      id: 'log-1',
      actor: 'System',
      action: 'Service window opened',
      entityType: 'ServiceInstance',
      timestamp: '07:00 AM',
      details: 'Check-in window active for Sunday first service',
    },
    {
      id: 'log-2',
      actor: 'Ama Owusu (Device)',
      action: 'Signed Arrival Signal Verified',
      entityType: 'AttendanceSignal',
      timestamp: '07:45 AM',
      details: 'Inner ring dwell 5m satisfied, confidence 85%',
    },
  ]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 2800);
  };

  const setTheme = (t: 'light' | 'dark', notify: boolean = true) => {
    setThemeState(t);
    try {
      localStorage.setItem('ekklesphere_theme', t);
    } catch {
      // Ignore in private storage sandbox
    }
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.style.colorScheme = 'light';
    }
    if (notify) {
      showToast(`Switched to ${t === 'dark' ? 'Dark' : 'Light'} Mode`);
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    let initialTheme: 'light' | 'dark' = 'light';
    try {
      const saved = localStorage.getItem('ekklesphere_theme') as 'light' | 'dark' | null;
      if (saved === 'dark' || saved === 'light') {
        initialTheme = saved;
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        initialTheme = 'dark';
      }
    } catch {
      // Fallback to light
    }
    setTheme(initialTheme, false);
  }, []);

  const currentService = services.find((s) => s.id === activeServiceId) || services[0];

  // Dynamic attendance tally:
  // Baseline count (408 expected in prototype) + additional checked-in members beyond the initial 3 + visitors
  const baseCount = 408;
  const currentCheckedInMemberCount = members.filter((m) =>
    attendanceRecords.some((r) => r.personId === m.id)
  ).length;
  // Net added beyond the initial 3
  const netAddedMembers = Math.max(0, currentCheckedInMemberCount - 3);
  const totalCheckedInCount = baseCount + netAddedMembers + (visitorsCount - 3);
  const expectedAttendance = currentService.expectedAttendance;
  const attendancePercentage = Math.min(100, Math.round((totalCheckedInCount / expectedAttendance) * 100));

  const totalMembersCount = 520;
  const autoCheckinOptedInCount = 333 + (memberConsents.autoCheckin ? 1 : 0);
  const optInPercentage = Math.round((autoCheckinOptedInCount / totalMembersCount) * 100);

  // Check-in action (handles offline queue vs instant online update)
  const checkInPerson = (
    personId: string,
    method: CheckinMethod,
    confidence: number = 90,
    note?: string
  ): boolean => {
    const existing = attendanceRecords.find((r) => r.personId === personId);
    if (existing) {
      return false; // Already checked in
    }

    const person = members.find((m) => m.id === personId);
    const newRecord: AttendanceRecord = {
      id: `rec-${personId}-${Date.now()}`,
      tenantId: 'tenant-accra',
      personId,
      serviceInstanceId: activeServiceId,
      campusId: 'campus-accra-central',
      method,
      confidence,
      checkedInAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      late: false,
      note,
      waitingToSync: !isUsherOnline,
    };

    setAttendanceRecords((prev) => [newRecord, ...prev]);

    if (!isUsherOnline) {
      setPendingSyncCount((c) => c + 1);
      showToast(`${person?.firstName || 'Member'} saved locally. Will sync when online.`);
    } else {
      showToast(`${person?.firstName || 'Member'} checked in (${method})`);
    }

    setAuditLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        actor: method === 'usher' ? 'Usher Desk' : `${person?.firstName || 'Member'} Device`,
        action: 'Attendance Recorded',
        entityType: 'AttendanceRecord',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: `Method: ${method}, Confidence: ${confidence}%`,
      },
      ...prev,
    ]);

    return true;
  };

  const removeCheckIn = (personId: string) => {
    setAttendanceRecords((prev) => prev.filter((r) => r.personId !== personId));
    const person = members.find((m) => m.id === personId);
    showToast(`Check-in removed for ${person?.firstName || 'Member'}`);
  };

  const addVisitor = (name: string, phone: string, howHeard: string) => {
    setVisitorsCount((c) => c + 1);
    const parts = name.trim().split(' ');
    const firstName = parts[0] || 'Visitor';
    const lastName = parts.slice(1).join(' ') || '';
    const newId = `vis-${Date.now()}`;

    const newPerson: Person = {
      id: newId,
      tenantId: 'tenant-accra',
      firstName,
      lastName,
      phoneE164: phone ? (phone.startsWith('+') ? phone : `+233${phone.replace(/\D/g, '')}`) : '',
      status: 'visitor',
      groupName: 'First-time Visitor',
      autoCheckinOptedIn: false,
      avatarInitials: `${firstName[0] || 'V'}${lastName[0] || 'I'}`,
      joinedOn: new Date().toISOString().split('T')[0],
      consecutiveAbsences: 0,
      notes: `Heard via: ${howHeard}`,
    };

    setMembers((prev) => [newPerson, ...prev]);

    // Check them in immediately
    checkInPerson(newId, 'usher', 95, `Visitor registration. Heard via ${howHeard}`);

    // Create visitor follow-up task
    setFollowupTasks((prev) => [
      {
        id: `task-vis-${Date.now()}`,
        personId: newId,
        personName: name,
        groupName: 'Visitors Welcome Team',
        reason: 'first_timer',
        assignedToName: 'Welcome Ministry (Pastor Ruth)',
        status: 'open',
        dueOn: 'Tomorrow 10:00 AM',
        createdAt: new Date().toISOString().split('T')[0],
      },
      ...prev,
    ]);

    showToast(`${name} added! Welcome follow-up task created.`);
  };

  const syncUsherCheckins = (): number => {
    if (!isUsherOnline) {
      showToast('Cannot sync while offline. Reconnect first.');
      return 0;
    }
    const count = pendingSyncCount;
    setAttendanceRecords((prev) => prev.map((r) => ({ ...r, waitingToSync: false })));
    setPendingSyncCount(0);
    showToast(`Synced ${count} check-in${count === 1 ? '' : 's'} to server.`);
    return count;
  };

  const updateMemberConsent = (autoCheckin: boolean, push: boolean, sms: boolean, email: boolean) => {
    setMemberConsents({ autoCheckin, push, sms, email });
    setMembers((prev) =>
      prev.map((m) => (m.id === 'm1' ? { ...m, autoCheckinOptedIn: autoCheckin } : m))
    );
    showToast(
      autoCheckin
        ? 'Auto check-in activated. Location is used only when arriving at church.'
        : 'Auto check-in deactivated. Background location is stopped.'
    );
  };

  const toggleRsvp = (eventName: string) => {
    setMemberRsvps((prev) => {
      const next = !prev[eventName];
      showToast(next ? `RSVP confirmed for ${eventName}` : `RSVP removed for ${eventName}`);
      return { ...prev, [eventName]: next };
    });
  };

  const submitDonation = (
    amountGhs: number,
    fund: string,
    method: 'MTN MoMo' | 'Telecel Cash' | 'Card'
  ) => {
    const newDonation: Donation = {
      id: `don-${Date.now()}`,
      personId: 'm1',
      personName: 'Ama Owusu',
      fundId: fund.toLowerCase().replace(/\s+/g, '-'),
      fundName: fund,
      amountMinor: amountGhs * 100,
      currency: 'GHS',
      method: method === 'Card' ? 'card' : 'momo',
      provider: method,
      status: 'paid',
      paidAt: new Date().toISOString().split('T')[0],
    };
    setDonations((prev) => [newDonation, ...prev]);
    showToast(`Thank you! GHS ${amountGhs} given to ${fund} via ${method}.`);
  };

  const resolveFollowupTask = (taskId: string, outcome: string) => {
    setFollowupTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: 'resolved', outcome, resolvedAt: new Date().toISOString() }
          : t
      )
    );
    showToast(`Care task marked resolved: ${outcome}`);
  };

  const addFollowupTask = (
    personId: string,
    reason: 'absent_2' | 'absent_3' | 'first_timer' | 'manual',
    notes: string
  ) => {
    const person = members.find((m) => m.id === personId);
    const newTask: FollowupTask = {
      id: `task-${Date.now()}`,
      personId,
      personName: person ? `${person.firstName} ${person.lastName}` : 'Member',
      groupName: person?.groupName || 'General',
      reason,
      assignedToName: 'Pastor Ruth',
      status: 'open',
      dueOn: 'In 3 days',
      createdAt: new Date().toISOString().split('T')[0],
    };
    setFollowupTasks((prev) => [newTask, ...prev]);
    showToast(`Follow-up assignment created for ${newTask.personName}`);
  };

  // Server BullMQ Delayed Dwell Job Countdown Effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (serverDwellJob.status === 'waiting') {
      interval = setInterval(() => {
        setServerDwellJob((prev) => {
          if (prev.status !== 'waiting') return prev;
          if (prev.remainingSeconds <= 1) {
            // Dwell timer elapsed on server!
            // Execute automatic attendance resolution:
            setTimeout(() => {
              setProximityStage(3);
              checkInPerson('m1', 'geofence', 85, '5-minute dwell verified at Accra Central campus (BullMQ delayed job)');
              showToast('Server Dwell Job resolved: Ama Owusu auto checked in (85% confidence).');
            }, 0);

            return {
              ...prev,
              status: 'completed_resolved',
              remainingSeconds: 0,
              resolvedRecordId: 'rec-m1-geofence',
            };
          }

          setDwellTimerSeconds(prev.remainingSeconds - 1);
          return {
            ...prev,
            remainingSeconds: prev.remainingSeconds - 1,
          };
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [serverDwellJob.status]);

  // Server-side Geofence Signal Processor
  const sendSimulatedSignal = (kind: GeofenceSignalKind) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (kind === 'enter_outer') {
      setProximityStage(1);
      setAuditLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          actor: 'Ama Owusu (Device Android)',
          action: 'SIGNAL: enter_outer (300m)',
          entityType: 'AttendanceSignal',
          timestamp,
          details: 'Outer boundary crossed. OS woke app; approach signal recorded without GPS poll.',
        },
        ...prev,
      ]);
      showToast('enter_outer: Device entered 300m perimeter. Approach signal recorded.');
    } else if (kind === 'enter_inner') {
      setProximityStage(2);
      setDwellTimerSeconds(300);
      const newJobId = `job-dwell-${Date.now().toString().slice(-6)}`;

      setServerDwellJob({
        jobId: newJobId,
        queue: 'attendance:dwell-check',
        personId: 'm1',
        personName: 'Ama Owusu',
        campusId: 'campus-accra-central',
        serviceInstanceId: activeServiceId,
        status: 'waiting',
        startedAt: timestamp,
        delayMs: 300000,
        remainingSeconds: 300,
      });

      setAuditLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          actor: 'Server BullMQ Engine',
          action: 'JOB: Dwell Delayed Task Queued',
          entityType: 'DelayedJob',
          timestamp,
          details: `Enqueued 5-min delayed job ${newJobId}. Waiting for dwell threshold before check-in.`,
        },
        ...prev,
      ]);
      showToast('enter_inner: Server enqueued 5-min delayed dwell job. Timer started.');
    } else if (kind === 'exit_inner') {
      setProximityStage(1);

      setServerDwellJob((prev) => {
        if (prev.status === 'waiting') {
          setAuditLogs((logs) => [
            {
              id: `log-${Date.now()}`,
              actor: 'Server BullMQ Engine',
              action: 'JOB CANCELLED: Exit before dwell',
              entityType: 'DelayedJob',
              timestamp,
              details: `Delayed job ${prev.jobId} cancelled. exit_inner received before 5m threshold (drove past).`,
            },
            ...logs,
          ]);

          return {
            ...prev,
            status: 'cancelled_exit',
            cancellationReason: 'Device left inner 100m ring before 5m dwell elapsed (anti-drive-past protection).',
          };
        }
        return prev;
      });

      showToast('exit_inner: Device departed inner ring. Server cancelled pending dwell job.');
    } else if (kind === 'exit_outer') {
      setProximityStage(0);
      setAuditLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          actor: 'Ama Owusu (Device)',
          action: 'SIGNAL: exit_outer (>300m)',
          entityType: 'AttendanceSignal',
          timestamp,
          details: 'Device completely departed campus vicinity. No active monitoring.',
        },
        ...prev,
      ]);
      showToast('exit_outer: Device departed campus vicinity (>300m).');
    } else if (kind === 'beacon_sighting') {
      triggerBeaconScan();
    }
  };

  // Step-by-step approach helper for simulator
  const advanceProximityStage = () => {
    if (proximityStage === 0) {
      sendSimulatedSignal('enter_outer');
    } else if (proximityStage === 1) {
      sendSimulatedSignal('enter_inner');
    } else if (proximityStage === 2) {
      fastForwardServerDwellJob();
    }
  };

  // Instant trigger for Entrance BLE Beacon
  const triggerBeaconScan = () => {
    setIsBeaconDetected(true);
    setProximityStage(3);
    // Mark server dwell job as superseded/resolved if active
    setServerDwellJob((prev) => ({
      ...prev,
      status: 'completed_resolved',
      remainingSeconds: 0,
      resolvedRecordId: 'rec-m1-beacon',
    }));
    checkInPerson('m1', 'beacon', 95, 'BLE Entrance Beacon sighted inside service window');
    showToast('Entrance BLE beacon detected! Immediate check-in confirmed (95% confidence).');
  };

  // Fast forward the server dwell countdown
  const fastForwardServerDwellJob = () => {
    setProximityStage(3);
    setDwellTimerSeconds(0);
    setServerDwellJob((prev) => ({
      ...prev,
      status: 'completed_resolved',
      remainingSeconds: 0,
      resolvedRecordId: 'rec-m1-geofence',
    }));
    checkInPerson('m1', 'geofence', 85, '5-minute dwell verified at Accra Central campus (BullMQ delayed job)');
    showToast('Fast-forward: 5-minute dwell verified on server. Auto check-in completed.');
  };

  const triggerDwellComplete = () => {
    fastForwardServerDwellJob();
  };

  // Anti-drive-past simulation demonstration: enters inner ring, then exits within 2.5 seconds
  const simulateDrivePast = () => {
    showToast('Simulating member driving past campus at 40 km/h...');
    sendSimulatedSignal('enter_outer');

    setTimeout(() => {
      sendSimulatedSignal('enter_inner');
      showToast('Entered 100m ring. Server 5-min delayed job enqueued...');

      setTimeout(() => {
        sendSimulatedSignal('exit_inner');
        showToast('Member drove past! exit_inner signal sent. Server cancelled the job.');
      }, 2500);
    }, 1000);
  };

  const resetProximity = () => {
    setProximityStage(0);
    setDwellTimerSeconds(300);
    setIsBeaconDetected(false);
    setServerDwellJob({
      jobId: 'job-dwell-m1-idle',
      queue: 'attendance:dwell-check',
      personId: 'm1',
      personName: 'Ama Owusu',
      campusId: 'campus-accra-central',
      serviceInstanceId: activeServiceId,
      status: 'idle',
      startedAt: '--:--',
      delayMs: 300000,
      remainingSeconds: 300,
    });
    removeCheckIn('m1');
    showToast('Proximity simulation reset. Person is outside campus (>300m).');
  };

  return (
    <EkklesphereContext.Provider
      value={{
        activePortal,
        setActivePortal,
        theme,
        setTheme,
        toggleTheme,
        activeServiceId,
        setActiveServiceId,
        services,
        currentService,
        members,
        visitorsCount,
        addVisitor,
        updateMemberConsent,
        attendanceRecords,
        totalCheckedInCount,
        expectedAttendance,
        attendancePercentage,
        autoCheckinOptedInCount,
        totalMembersCount,
        optInPercentage,
        checkInPerson,
        removeCheckIn,
        isUsherOnline,
        setIsUsherOnline,
        pendingSyncCount,
        syncUsherCheckins,
        proximityStage,
        dwellTimerSeconds,
        isBeaconDetected,
        setIsBeaconDetected,
        advanceProximityStage,
        resetProximity,
        triggerBeaconScan,
        triggerDwellComplete,
        serverDwellJob,
        sendSimulatedSignal,
        fastForwardServerDwellJob,
        simulateDrivePast,
        followupTasks,
        resolveFollowupTask,
        addFollowupTask,
        memberConsents,
        memberRsvps,
        toggleRsvp,
        donations,
        submitDonation,
        auditLogs,
        toastMessage,
        showToast,
      }}
    >
      {children}
    </EkklesphereContext.Provider>
  );
};

export const useEkklesphere = () => {
  const context = useContext(EkklesphereContext);
  if (!context) {
    throw new Error('useEkklesphere must be used within an EkklesphereProvider');
  }
  return context;
};
