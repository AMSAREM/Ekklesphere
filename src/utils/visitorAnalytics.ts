import {
  AttendanceRecord,
  CheckinMethod,
  FollowupTask,
  Person,
  ServiceInstance,
} from '../types/ekklesphere';

export interface VisitorWeeklyTrendBucket {
  weekKey: string;
  startDate: string;
  endDate: string;
  shortLabel: string;
  fullRangeLabel: string;
  isCurrentWeek: boolean;
  newRegistrations: number;
  firstTimeCheckins: number;
  returningCheckins: number;
  totalVisitorCheckins: number;
  memberCheckins: number;
  totalCheckins: number;
  visitorSharePct: number;
}

export interface ServiceVisitorComparisonRow {
  serviceId: string;
  serviceName: string;
  date: string;
  totalCheckins: number;
  visitorCheckins: number;
  firstTimeVisitors: number;
  returningVisitors: number;
  visitorSharePct: number;
}

export interface VisitorChannelItem {
  method: CheckinMethod;
  label: string;
  count: number;
  pct: number;
  color: string;
}

export interface VisitorFunnelStage {
  id: 'registered' | 'attended' | 'followed_up' | 'returning';
  label: string;
  count: number;
  pctOfRegistered: number;
  description: string;
}

export interface VisitorProfileSummary {
  person: Person;
  visitCount: number;
  firstVisitDate: string | null;
  lastVisitDate: string | null;
  lastMethod: CheckinMethod | null;
  followupTask: FollowupTask | null;
  followupState: 'unassigned' | 'open' | 'contacted' | 'resolved';
  tier: 'returning' | 'first_timer' | 'registered_only';
}

export interface VisitorAnalyticsResult {
  windowLabel: string;
  totalVisitors: number;
  newVisitors30d: number;
  checkedInVisitorsEver: number;
  firstTimeOnlyCount: number;
  returningVisitorsCount: number;
  retentionRatePct: number;
  activeServiceVisitorsCount: number;
  activeServiceTotalCheckins: number;
  activeServiceVisitorSharePct: number;
  totalVisitorCheckins30d: number;
  weekOverWeekDelta: number;
  firstTimerTasksTotal: number;
  firstTimerTasksCompletedCount: number;
  followupCompletionPct: number;
  needsFollowupCount: number;
  peakVisitorService: {
    name: string;
    date: string;
    count: number;
  } | null;
  weeklyBuckets: VisitorWeeklyTrendBucket[];
  serviceComparisons: ServiceVisitorComparisonRow[];
  channels: VisitorChannelItem[];
  funnelStages: VisitorFunnelStage[];
  topInterestGroups: Array<{ name: string; count: number; pct: number }>;
  visitorProfiles: VisitorProfileSummary[];
}

export interface ComputeVisitorAnalyticsInput {
  members: Person[];
  attendanceRecords: AttendanceRecord[];
  services: ServiceInstance[];
  currentService?: ServiceInstance | null;
  followupTasks: FollowupTask[];
  now?: Date;
}

const CHANNEL_META: Record<CheckinMethod, { label: string; color: string }> = {
  usher: { label: 'Usher Door', color: '#6D5CF2' },
  posted_qr: { label: 'QR Code Scan', color: '#8C7DFF' },
  geofence: { label: 'Auto Geofence', color: '#4FBF98' },
  beacon: { label: 'BLE Beacon', color: '#59C3C3' },
  manual: { label: 'Manual Desk', color: '#F59E0B' },
  email_link: { label: 'Email Link', color: '#64748B' },
};

const formatLocalIso = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatShortWeek = (start: Date, end: Date): string => {
  const sDay = start.getDate();
  const eDay = end.getDate();
  const sMonth = start.toLocaleDateString('en-GB', { month: 'short' });
  const eMonth = end.toLocaleDateString('en-GB', { month: 'short' });
  if (sDay === eDay && sMonth === eMonth) return `${sDay} ${sMonth}`;
  if (sMonth === eMonth) return `${sDay}–${eDay} ${sMonth}`;
  return `${sDay} ${sMonth}–${eDay} ${eMonth}`;
};

const formatFullWeekRange = (start: Date, end: Date): string => {
  if (formatLocalIso(start) === formatLocalIso(end)) {
    return end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const sFmt = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const eFmt = end.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${sFmt} – ${eFmt}`;
};

function parseDateIso(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return formatLocalIso(parsed);
  }
  return null;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

export function computeVisitorAnalytics(
  input: ComputeVisitorAnalyticsInput
): VisitorAnalyticsResult {
  const {
    members,
    attendanceRecords,
    services,
    currentService,
    followupTasks,
    now = new Date(),
  } = input;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowStart = new Date(today);
  windowStart.setDate(today.getDate() - 41); // 6-week rolling window (42 days inclusive)
  const thirtyDayStart = new Date(today);
  thirtyDayStart.setDate(today.getDate() - 29);

  const windowStartIso = formatLocalIso(windowStart);
  const thirtyDayStartIso = formatLocalIso(thirtyDayStart);
  const todayIso = formatLocalIso(today);

  const windowLabel = `${windowStart.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })} – ${today.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })}`;

  const visitors = members.filter((m) => m.status === 'visitor');
  const visitorById = new Map<string, Person>(visitors.map((v) => [v.id, v]));

  const serviceById = new Map<string, ServiceInstance>(services.map((s) => [s.id, s]));

  // Deduplicate records per (serviceInstanceId, personId)
  const dedupedRecordsMap = new Map<string, AttendanceRecord>();
  for (const rec of attendanceRecords) {
    const key = `${rec.serviceInstanceId || 'svc'}::${rec.personId}`;
    dedupedRecordsMap.set(key, rec);
  }
  const allRecords = Array.from(dedupedRecordsMap.values());

  // Resolve record date cleanly
  const resolveRecordDateIso = (rec: AttendanceRecord): string => {
    const svc = rec.serviceInstanceId ? serviceById.get(rec.serviceInstanceId) : undefined;
    const svcDate = parseDateIso(svc?.date);
    if (svcDate) return svcDate;
    const isoDate = parseDateIso(rec.checkedInIso);
    if (isoDate) return isoDate;
    return todayIso;
  };

  // Sort chronological records so we know 1st visit vs 2nd+ (returning) visit per visitor
  const sortedVisitorRecords = allRecords
    .filter((r) => visitorById.has(r.personId))
    .map((rec) => ({
      rec,
      dateIso: resolveRecordDateIso(rec),
    }))
    .sort((a, b) => {
      if (a.dateIso !== b.dateIso) return a.dateIso.localeCompare(b.dateIso);
      const aStamp = a.rec.checkedInIso || a.rec.checkedInAt || '';
      const bStamp = b.rec.checkedInIso || b.rec.checkedInAt || '';
      return aStamp.localeCompare(bStamp);
    });

  const visitOrdinalByRecordKey = new Map<string, number>();
  const recordsByVisitorId = new Map<
    string,
    Array<{ rec: AttendanceRecord; dateIso: string }>
  >();

  for (const entry of sortedVisitorRecords) {
    const list = recordsByVisitorId.get(entry.rec.personId) || [];
    list.push(entry);
    recordsByVisitorId.set(entry.rec.personId, list);
    const key = `${entry.rec.serviceInstanceId || 'svc'}::${entry.rec.personId}`;
    visitOrdinalByRecordKey.set(key, list.length);
  }

  // Build weekly buckets over 6-week rolling window (Mon–Sun aligned just like WeeklyAttendanceTrendChart)
  const rawBuckets: Array<{
    weekKey: string;
    startDate: string;
    endDate: string;
    shortLabel: string;
    fullRangeLabel: string;
    isCurrentWeek: boolean;
    newRegistrations: number;
    firstTimeCheckins: number;
    returningCheckins: number;
    memberCheckins: number;
  }> = [];

  const cursor = new Date(windowStart);
  while (cursor.getTime() <= today.getTime()) {
    const bStart = new Date(cursor);
    const dow = bStart.getDay();
    const daysUntilSunday = dow === 0 ? 0 : 7 - dow;
    const candidateEnd = new Date(bStart);
    candidateEnd.setDate(bStart.getDate() + daysUntilSunday);
    const bEnd = candidateEnd.getTime() > today.getTime() ? new Date(today) : candidateEnd;

    const sIso = formatLocalIso(bStart);
    const eIso = formatLocalIso(bEnd);

    rawBuckets.push({
      weekKey: `${sIso}_${eIso}`,
      startDate: sIso,
      endDate: eIso,
      shortLabel: formatShortWeek(bStart, bEnd),
      fullRangeLabel: formatFullWeekRange(bStart, bEnd),
      isCurrentWeek: eIso === todayIso,
      newRegistrations: 0,
      firstTimeCheckins: 0,
      returningCheckins: 0,
      memberCheckins: 0,
    });

    cursor.setTime(bEnd.getTime());
    cursor.setDate(cursor.getDate() + 1);
  }

  // Count new visitor registrations in each week & 30d window
  let newVisitors30d = 0;
  for (const v of visitors) {
    const joinedIso = parseDateIso(v.joinedOn) || todayIso;
    if (joinedIso >= thirtyDayStartIso && joinedIso <= todayIso) {
      newVisitors30d++;
    }
    const bucket = rawBuckets.find(
      (b) => joinedIso >= b.startDate && joinedIso <= b.endDate
    );
    if (bucket) {
      bucket.newRegistrations++;
    }
  }

  // Count check-ins per week (visitors first-time vs returning + member baseline)
  let totalVisitorCheckins30d = 0;
  for (const rec of allRecords) {
    const dateIso = resolveRecordDateIso(rec);
    const isVisitor = visitorById.has(rec.personId);
    if (isVisitor && dateIso >= thirtyDayStartIso && dateIso <= todayIso) {
      totalVisitorCheckins30d++;
    }
    if (dateIso < windowStartIso || dateIso > todayIso) continue;

    const bucket = rawBuckets.find(
      (b) => dateIso >= b.startDate && dateIso <= b.endDate
    );
    if (!bucket) continue;

    if (isVisitor) {
      const key = `${rec.serviceInstanceId || 'svc'}::${rec.personId}`;
      const visitNum = visitOrdinalByRecordKey.get(key) || 1;
      if (visitNum > 1) {
        bucket.returningCheckins++;
      } else {
        bucket.firstTimeCheckins++;
      }
    } else {
      bucket.memberCheckins++;
    }
  }

  const weeklyBuckets: VisitorWeeklyTrendBucket[] = rawBuckets.map((b) => {
    const totalVisitorCheckins = b.firstTimeCheckins + b.returningCheckins;
    const totalCheckins = totalVisitorCheckins + b.memberCheckins;
    return {
      weekKey: b.weekKey,
      startDate: b.startDate,
      endDate: b.endDate,
      shortLabel: b.shortLabel,
      fullRangeLabel: b.fullRangeLabel,
      isCurrentWeek: b.isCurrentWeek,
      newRegistrations: b.newRegistrations,
      firstTimeCheckins: b.firstTimeCheckins,
      returningCheckins: b.returningCheckins,
      totalVisitorCheckins,
      memberCheckins: b.memberCheckins,
      totalCheckins,
      visitorSharePct: pct(totalVisitorCheckins, totalCheckins),
    };
  });

  const currentWeekBucket = weeklyBuckets[weeklyBuckets.length - 1];
  const previousWeekBucket =
    weeklyBuckets.length >= 2 ? weeklyBuckets[weeklyBuckets.length - 2] : null;
  const weekOverWeekDelta =
    currentWeekBucket && previousWeekBucket
      ? currentWeekBucket.totalVisitorCheckins - previousWeekBucket.totalVisitorCheckins
      : 0;

  // Service-by-service comparison
  const serviceComparisons: ServiceVisitorComparisonRow[] = services
    .map((svc) => {
      const svcRecords = allRecords.filter(
        (r) => r.serviceInstanceId === svc.id || (!r.serviceInstanceId && services.length <= 1)
      );
      let firstTimeVisitors = 0;
      let returningVisitors = 0;
      for (const rec of svcRecords) {
        if (!visitorById.has(rec.personId)) continue;
        const key = `${rec.serviceInstanceId || 'svc'}::${rec.personId}`;
        const visitNum = visitOrdinalByRecordKey.get(key) || 1;
        if (visitNum > 1) returningVisitors++;
        else firstTimeVisitors++;
      }
      const visitorCheckins = firstTimeVisitors + returningVisitors;
      const totalCheckins = svcRecords.length;
      return {
        serviceId: svc.id,
        serviceName: svc.name,
        date: svc.date || '',
        totalCheckins,
        visitorCheckins,
        firstTimeVisitors,
        returningVisitors,
        visitorSharePct: pct(visitorCheckins, totalCheckins),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  let peakVisitorService: VisitorAnalyticsResult['peakVisitorService'] = null;
  for (const row of serviceComparisons) {
    if (
      row.visitorCheckins > 0 &&
      (!peakVisitorService || row.visitorCheckins > peakVisitorService.count)
    ) {
      peakVisitorService = {
        name: row.serviceName,
        date: row.date,
        count: row.visitorCheckins,
      };
    }
  }

  // Active service visitor share
  const activeRecords = currentService
    ? allRecords.filter(
        (r) =>
          r.serviceInstanceId === currentService.id ||
          (!r.serviceInstanceId && services.length <= 1)
      )
    : [];
  const activeServiceVisitorsCount = activeRecords.filter((r) =>
    visitorById.has(r.personId)
  ).length;
  const activeServiceTotalCheckins = activeRecords.length;
  const activeServiceVisitorSharePct = pct(
    activeServiceVisitorsCount,
    activeServiceTotalCheckins
  );

  // Visitor acquisition channels across all visitor check-ins
  const channelCounts = new Map<CheckinMethod, number>();
  for (const entry of sortedVisitorRecords) {
    channelCounts.set(entry.rec.method, (channelCounts.get(entry.rec.method) || 0) + 1);
  }
  const totalVisitorCheckinsAllTime = sortedVisitorRecords.length;
  const channels: VisitorChannelItem[] = (Object.keys(CHANNEL_META) as CheckinMethod[])
    .map((method) => {
      const count = channelCounts.get(method) || 0;
      return {
        method,
        label: CHANNEL_META[method].label,
        count,
        pct: pct(count, totalVisitorCheckinsAllTime),
        color: CHANNEL_META[method].color,
      };
    })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  // Pastoral follow-up coverage for visitors
  const taskByVisitorId = new Map<string, FollowupTask>();
  for (const task of followupTasks) {
    if (!task.personId) continue;
    const isVisitorTask = visitorById.has(task.personId) || task.reason === 'first_timer';
    if (!isVisitorTask) continue;
    const existing = taskByVisitorId.get(task.personId);
    if (!existing || task.status === 'open' || task.status === 'contacted') {
      taskByVisitorId.set(task.personId, task);
    }
  }

  const firstTimerTasks = followupTasks.filter(
    (t) => t.reason === 'first_timer' || (t.personId ? visitorById.has(t.personId) : false)
  );
  const firstTimerTasksCompletedCount = firstTimerTasks.filter(
    (t) => t.status === 'contacted' || t.status === 'resolved'
  ).length;
  const followupCompletionPct = pct(firstTimerTasksCompletedCount, firstTimerTasks.length);

  let checkedInVisitorsEver = 0;
  let firstTimeOnlyCount = 0;
  let returningVisitorsCount = 0;
  let followedUpVisitorsCount = 0;
  let needsFollowupCount = 0;

  const interestCounts = new Map<string, number>();

  const visitorProfiles: VisitorProfileSummary[] = visitors
    .map((person) => {
      const visits = recordsByVisitorId.get(person.id) || [];
      const visitCount = visits.length;
      if (visitCount > 0) checkedInVisitorsEver++;
      if (visitCount >= 2) returningVisitorsCount++;
      else if (visitCount === 1) firstTimeOnlyCount++;

      const firstVisitDate = visits[0]?.dateIso || null;
      const lastEntry = visits[visits.length - 1] || null;
      const lastVisitDate = lastEntry?.dateIso || null;
      const lastMethod = lastEntry?.rec.method || null;

      const task = taskByVisitorId.get(person.id) || null;
      let followupState: VisitorProfileSummary['followupState'] = 'unassigned';
      if (task) {
        if (task.status === 'resolved' || task.status === 'dismissed') {
          followupState = 'resolved';
          followedUpVisitorsCount++;
        } else if (task.status === 'contacted') {
          followupState = 'contacted';
          followedUpVisitorsCount++;
        } else {
          followupState = 'open';
          needsFollowupCount++;
        }
      } else {
        needsFollowupCount++;
      }

      const interestLabel =
        (person.department &&
          person.department.trim() &&
          person.department.trim().toLowerCase() !== 'general' &&
          person.department.trim()) ||
        (person.homeCellGroup && person.homeCellGroup.trim()) ||
        (person.groupName &&
          person.groupName.trim() &&
          person.groupName.trim().toLowerCase() !== 'visitors' &&
          person.groupName.trim()) ||
        'Sunday Sanctuary';
      interestCounts.set(interestLabel, (interestCounts.get(interestLabel) || 0) + 1);

      const tier: VisitorProfileSummary['tier'] =
        visitCount >= 2
          ? 'returning'
          : visitCount === 1
          ? 'first_timer'
          : 'registered_only';

      return {
        person,
        visitCount,
        firstVisitDate,
        lastVisitDate,
        lastMethod,
        followupTask: task,
        followupState,
        tier,
      };
    })
    .sort((a, b) => {
      const aDate = a.lastVisitDate || parseDateIso(a.person.joinedOn) || '';
      const bDate = b.lastVisitDate || parseDateIso(b.person.joinedOn) || '';
      return bDate.localeCompare(aDate) || b.visitCount - a.visitCount;
    });

  const totalVisitors = visitors.length;
  const retentionRatePct =
    checkedInVisitorsEver > 0
      ? pct(returningVisitorsCount, checkedInVisitorsEver)
      : totalVisitors > 0
      ? pct(returningVisitorsCount, totalVisitors)
      : 0;

  const funnelStages: VisitorFunnelStage[] = [
    {
      id: 'registered',
      label: 'Registered Visitors',
      count: totalVisitors,
      pctOfRegistered: totalVisitors > 0 ? 100 : 0,
      description: 'First-time & guest profiles in directory',
    },
    {
      id: 'attended',
      label: 'Checked In at Service',
      count: checkedInVisitorsEver,
      pctOfRegistered: pct(checkedInVisitorsEver, totalVisitors),
      description: 'Verified arrival across scheduled services',
    },
    {
      id: 'followed_up',
      label: 'Pastoral Follow-Up Completed',
      count: followedUpVisitorsCount,
      pctOfRegistered: pct(followedUpVisitorsCount, totalVisitors),
      description: 'Contacted or resolved by care leaders',
    },
    {
      id: 'returning',
      label: 'Returning (2+ Visits)',
      count: returningVisitorsCount,
      pctOfRegistered: pct(returningVisitorsCount, totalVisitors),
      description: 'Guests returning after initial visit',
    },
  ];

  const topInterestGroups = Array.from(interestCounts.entries())
    .map(([name, count]) => ({
      name,
      count,
      pct: pct(count, totalVisitors),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    windowLabel,
    totalVisitors,
    newVisitors30d,
    checkedInVisitorsEver,
    firstTimeOnlyCount,
    returningVisitorsCount,
    retentionRatePct,
    activeServiceVisitorsCount,
    activeServiceTotalCheckins,
    activeServiceVisitorSharePct,
    totalVisitorCheckins30d,
    weekOverWeekDelta,
    firstTimerTasksTotal: firstTimerTasks.length,
    firstTimerTasksCompletedCount,
    followupCompletionPct,
    needsFollowupCount,
    peakVisitorService,
    weeklyBuckets,
    serviceComparisons,
    channels,
    funnelStages,
    topInterestGroups,
    visitorProfiles,
  };
}
