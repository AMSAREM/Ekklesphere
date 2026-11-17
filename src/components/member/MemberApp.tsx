import React, { useState, useEffect, useRef } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  Home,
  Calendar,
  Heart,
  User,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  Radio,
  FileText,
  Trash2,
  CreditCard,
  LogOut,
  LayoutDashboard,
  BookOpen,
  Clock,
  ArrowUpRight,
  Download,
  Check,
  MapPin,
  Navigation,
  AlertTriangle,
  RefreshCw,
  Play,
  Square,
  Crosshair,
  Bell,
  Sparkles,
  Send,
  Cake,
  KeyRound,
  Users,
  Phone,
  Edit3,
} from 'lucide-react';
import { MemberQrScannerModal } from './MemberQrScannerModal';
import { MemberProfileEditorModal } from './MemberProfileEditorModal';
import { ChurchLocationMiniMap } from './ChurchLocationMiniMap';
import { DigitalMemberCard, getCanonicalMemberId } from './DigitalMemberCard';
import { MemberAttendanceStreakCard } from './MemberAttendanceStreakCard';
import {
  MemberBirthdaysModule,
  formatBirthdayMonthDay,
} from './MemberBirthdaysModule';
import {
  findMatchingChurchGroup,
  getCurrencyDisplay,
  mergeSelectableCellGroups,
  mergeSelectableDepartments,
} from '../../utils/settingsConnections';
import {
  formatBirthMonthGroupName,
  resolveMemberBirthFields,
} from '../../utils/birthMonth';

const PRIMARY_CAMPUS_SITE_ID = '00000000-0000-0000-0000-000000000001';

function computeDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export const MemberApp: React.FC = () => {
  const {
    systemSettings,
    churchGroups,
    members,
    services,
    currentService,
    hasScheduledService,
    checkInEligibility,
    memberConsents,
    updateMemberConsent,
    memberRsvps,
    toggleRsvp,
    submitDonation,
    showToast,
    attendanceRecords,
    checkInPerson,
    removeCheckIn,
    refreshLivePremise,
    setChurchPremiseLocation,
    updateMember,
    currentUser,
    setCurrentUser,
    logout,
    switchUserRole,
    pushPermissionStatus,
    isPushSubscribed,
    requestPushPermission,
    sendTestPushNotification,
    churchWallPosts,
    addChurchWallPost,
    toggleChurchWallAmen,
    setIsChangePasswordModalOpen,
  } = useEkklesphere();

  const [activeTab, setActiveTab] = useState<'home' | 'events' | 'give' | 'me'>('home');
  const [isQrSheetOpen, setIsQrSheetOpen] = useState(false);
  const [qrInitialContext, setQrInitialContext] = useState<string | undefined>(undefined);
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);

  // Live Hardware GPS Proximity & Verification State
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'acquiring' | 'watching' | 'verifying' | 'error'>('idle');
  const [livePosition, setLivePosition] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
    distanceM: number | null;
  } | null>(null);
  const [gpsFeedback, setGpsFeedback] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const autoVerifiedRef = useRef<boolean>(false);

  const currency = getCurrencyDisplay(systemSettings.currency);

  // Giving state
  const [giveAmount, setGiveAmount] = useState<number>(currency.presetAmounts[1] || 50);
  const [giveCustomAmount, setGiveCustomAmount] = useState<string>('');
  const [giveFund, setGiveFund] = useState<string>('Tithe');
  const [giveMethod, setGiveMethod] = useState<'MTN MoMo' | 'Telecel Cash' | 'Card'>('MTN MoMo');
  const [givenSuccess, setGivenSuccess] = useState(false);

  useEffect(() => {
    if (!currency.presetAmounts.includes(giveAmount) && !giveCustomAmount) {
      setGiveAmount(currency.presetAmounts[1] || currency.presetAmounts[0]);
    }
  }, [systemSettings.currency]);

  // Resolve real signed-in member identity
  const matchedMember = members.find(
    (m) =>
      m.id === currentUser?.memberId ||
      (currentUser?.email && m.email?.toLowerCase() === currentUser.email.toLowerCase())
  );
  const targetPersonId = matchedMember?.id || currentUser?.memberId || currentUser?.id || 'unlinked-member';
  const memberDisplayName = matchedMember
    ? `${matchedMember.firstName} ${matchedMember.lastName}`
    : currentUser?.name || 'Church Member';
  const memberFirstName = matchedMember?.firstName || memberDisplayName.split(' ')[0] || 'Member';
  const memberCode = getCanonicalMemberId(matchedMember, targetPersonId);
  const memberInitials =
    matchedMember?.avatarInitials ||
    currentUser?.initials ||
    memberDisplayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') ||
    'MB';
  const memberGroup = matchedMember?.groupName || matchedMember?.homeCellGroup || 'General Congregation';
  const memberDepartment = matchedMember?.department;
  const memberEmail = matchedMember?.email || currentUser?.email || systemSettings.contactEmail;
  const memberPhone = matchedMember?.phoneE164 || systemSettings.contactPhone;

  const { cellOrFellowshipGroup, ministryGroup } = findMatchingChurchGroup(churchGroups, {
    groupName: matchedMember?.groupName,
    homeCellGroup: matchedMember?.homeCellGroup,
    department: matchedMember?.department,
  });
  const selectableCellGroups = mergeSelectableCellGroups(churchGroups, members);
  const selectableDepartments = mergeSelectableDepartments(churchGroups, members);

  const [isEditingMyGroups, setIsEditingMyGroups] = useState(false);
  const [draftCellGroup, setDraftCellGroup] = useState(memberGroup);
  const [draftDepartment, setDraftDepartment] = useState(memberDepartment || 'General Congregation');
  const [isSavingMyGroups, setIsSavingMyGroups] = useState(false);

  useEffect(() => {
    if (!isEditingMyGroups) {
      setDraftCellGroup(memberGroup);
      setDraftDepartment(memberDepartment || 'General Congregation');
    }
  }, [memberGroup, memberDepartment, isEditingMyGroups]);

  const [localPhotoOverride, setLocalPhotoOverride] = useState<string | null>(() => {
    try {
      return localStorage.getItem(`ekklesphere_member_photo_${targetPersonId}`);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      setLocalPhotoOverride(localStorage.getItem(`ekklesphere_member_photo_${targetPersonId}`));
    } catch {
      setLocalPhotoOverride(null);
    }
  }, [targetPersonId]);

  const memberPhotoUrl = matchedMember?.imageUrl || localPhotoOverride || currentUser?.avatar || null;

  const getMemberAuthHeaders = (): HeadersInit => {
    const token =
      currentUser?.token ||
      (typeof window !== 'undefined' ? localStorage.getItem('ekklesphere_token') : null);
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const handleUpdateMemberPhoto = async (dataUrl: string) => {
    try {
      localStorage.setItem(`ekklesphere_member_photo_${targetPersonId}`, dataUrl);
    } catch {
      // Ignore storage quota errors
    }
    setLocalPhotoOverride(dataUrl);

    if (matchedMember) {
      await updateMember(matchedMember.id, { imageUrl: dataUrl });
    } else {
      try {
        const res = await fetch('/api/members/me/profile', {
          method: 'PATCH',
          headers: getMemberAuthHeaders(),
          body: JSON.stringify({ imageUrl: dataUrl }),
        });
        if (!res.ok) {
          showToast('Photo cached locally — sign in to save to your member profile.');
        } else {
          showToast('Profile photo saved to database!');
        }
      } catch {
        showToast('Network error saving photo to database.');
      }
    }
    if (currentUser) {
      setCurrentUser({ ...currentUser, avatar: dataUrl });
    }
  };

  const [localDobOverride, setLocalDobOverride] = useState<string>(() => {
    try {
      return localStorage.getItem(`ekklesphere_member_dob_${targetPersonId}`) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      setLocalDobOverride(localStorage.getItem(`ekklesphere_member_dob_${targetPersonId}`) || '');
    } catch {
      setLocalDobOverride('');
    }
  }, [targetPersonId]);

  const memberDateOfBirth = matchedMember?.dateOfBirth || localDobOverride || undefined;

  const memberBirthFields = resolveMemberBirthFields({
    dateOfBirth: memberDateOfBirth,
    monthOfBirth: matchedMember?.monthOfBirth,
    birthMonthGroup: matchedMember?.birthMonthGroup,
  });

  const handleSaveMemberBirthday = async (dateOfBirth: string) => {
    const resolvedBirth = resolveMemberBirthFields({ dateOfBirth });
    try {
      localStorage.setItem(`ekklesphere_member_dob_${targetPersonId}`, dateOfBirth);
    } catch {
      // ignore storage quota
    }
    setLocalDobOverride(dateOfBirth);
    if (matchedMember) {
      await updateMember(matchedMember.id, {
        dateOfBirth,
        monthOfBirth: resolvedBirth.monthOfBirth,
        birthMonthGroup: resolvedBirth.birthMonthGroup,
      });
    } else {
      try {
        const res = await fetch('/api/members/me/profile', {
          method: 'PATCH',
          headers: getMemberAuthHeaders(),
          body: JSON.stringify({
            dateOfBirth,
            monthOfBirth: resolvedBirth.monthOfBirth,
            birthMonthGroup: resolvedBirth.birthMonthGroup,
          }),
        });
        if (res.ok) {
          showToast(
            resolvedBirth.birthMonthGroup
              ? `Birthday saved — assigned to ${resolvedBirth.birthMonthGroup}!`
              : 'Birthday saved to your member profile in database!'
          );
        } else {
          const errBody = await res.json().catch(() => ({}));
          showToast(errBody?.message || 'Could not save birthday to database.');
        }
      } catch {
        showToast('Network error saving birthday.');
      }
    }
  };

  const handleSaveMyGroups = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextCell = draftCellGroup.trim() || 'General Congregation';
    const nextDept = draftDepartment.trim() || 'General Congregation';
    setIsSavingMyGroups(true);
    try {
      if (matchedMember) {
        await updateMember(matchedMember.id, {
          groupName: nextCell,
          homeCellGroup: nextCell,
          department: nextDept,
        });
      } else {
        const res = await fetch('/api/members/me/profile', {
          method: 'PATCH',
          headers: getMemberAuthHeaders(),
          body: JSON.stringify({
            groupName: nextCell,
            homeCellGroup: nextCell,
            department: nextDept,
          }),
        });
        if (res.ok) {
          showToast('Ministry & fellowship preferences saved.');
        } else {
          const errBody = await res.json().catch(() => ({}));
          showToast(errBody?.message || 'Could not update group preferences.');
        }
      }
      setIsEditingMyGroups(false);
    } finally {
      setIsSavingMyGroups(false);
    }
  };

  const myAttendanceRecord = currentService.id
    ? attendanceRecords.find(
        (r) =>
          r.personId === targetPersonId &&
          (r.serviceInstanceId === currentService.id ||
            (!r.serviceInstanceId && services.length === 1))
      )
    : undefined;
  const isCheckedIn = Boolean(myAttendanceRecord);
  const isPremiseConfigured =
    systemSettings.campusLatitude !== null && systemSettings.campusLongitude !== null;

  useEffect(() => {
    if (!isCheckedIn) {
      autoVerifiedRef.current = false;
    }
  }, [isCheckedIn]);

  // Recalculate live distance whenever Admin updates church premise coordinates
  useEffect(() => {
    if (!livePosition) return;
    const updatedDist =
      systemSettings.campusLatitude !== null && systemSettings.campusLongitude !== null
        ? computeDistanceMeters(
            systemSettings.campusLatitude,
            systemSettings.campusLongitude,
            livePosition.lat,
            livePosition.lng
          )
        : null;
    if (updatedDist !== livePosition.distanceM) {
      setLivePosition((prev) => (prev ? { ...prev, distanceM: updatedDist } : null));
    }
  }, [systemSettings.campusLatitude, systemSettings.campusLongitude]);

  // Cleanup geolocation watcher on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const verifyArrivalWithServer = async (
    lat: number,
    lng: number,
    accuracy: number,
    source: 'geofence' | 'web'
  ) => {
    if (!hasScheduledService || !currentService.id) {
      autoVerifiedRef.current = false;
      setRejectionReason(checkInEligibility.message);
      setGpsStatus(watchIdRef.current !== null ? 'watching' : 'idle');
      showToast(checkInEligibility.message);
      return;
    }

    setGpsStatus('verifying');
    setRejectionReason(null);
    try {
      const res = await fetch('/api/attendance/events', {
        method: 'POST',
        headers: getMemberAuthHeaders(),
        body: JSON.stringify({
          clientEventId: crypto.randomUUID(),
          siteId: PRIMARY_CAMPUS_SITE_ID,
          personId: targetPersonId,
          personName: memberDisplayName,
          serviceInstanceId: currentService.id,
          type: source === 'web' ? 'manual_in' : 'enter',
          source,
          platform: 'web',
          lat,
          lng,
          accuracyM: Math.round(accuracy),
          isMock: false,
          deviceTime: new Date().toISOString(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRejectionReason(data.message || data.error || 'Could not verify church premise.');
        setGpsStatus(watchIdRef.current !== null ? 'watching' : 'error');
        return;
      }

      if (data.checkin_recorded === false || data.checkin_blocked_reason) {
        autoVerifiedRef.current = false;
        const blockedMsg = data.checkin_blocked_message || checkInEligibility.message;
        setRejectionReason(blockedMsg);
        setGpsStatus(watchIdRef.current !== null ? 'watching' : 'idle');
        showToast(blockedMsg);
        return;
      }

      const isWithinFence =
        data.distance_m !== null
          ? data.distance_m <= (data.site_radius_m || systemSettings.innerGeofenceMeters || 60) + 25
          : false;

      const isAccepted =
        (data.status === 'accepted' ||
          (data.status === 'flagged' &&
            !data.flag_reasons?.some((r: string) => r.startsWith('outside_') || r.includes('mock')))) &&
        isWithinFence;

      if (isAccepted) {
        const confidence = Math.max(70, Math.min(99, Math.round(100 - accuracy / 3)));
        const checkedIn = checkInPerson(
          targetPersonId,
          'geofence',
          confidence,
          `Verified Live GPS (${data.distance_m ?? 0}m from premise, ±${Math.round(accuracy)}m)`
        );
        if (!checkedIn) {
          autoVerifiedRef.current = false;
          setRejectionReason(checkInEligibility.message);
          setGpsStatus(watchIdRef.current !== null ? 'watching' : 'idle');
          return;
        }
        await refreshLivePremise();
        setRejectionReason(null);
        setGpsFeedback(
          `Verified inside ${systemSettings.campusName} (${data.distance_m ?? 0}m from center).`
        );
        setGpsStatus(watchIdRef.current !== null ? 'watching' : 'idle');
      } else {
        autoVerifiedRef.current = false;
        const distLabel = data.distance_m != null ? `${data.distance_m}m` : 'outside range';
        const msg = `Check-in declined: your live GPS is ${distLabel} from ${systemSettings.campusName} (must be within ${systemSettings.innerGeofenceMeters}m geofence).`;
        setRejectionReason(msg);
        setGpsStatus(watchIdRef.current !== null ? 'watching' : 'idle');
        showToast(`Outside church premise (${distLabel})`);
      }
    } catch (err: unknown) {
      autoVerifiedRef.current = false;
      const errMsg = err instanceof Error ? err.message : 'Network error';
      setRejectionReason(`Server verification failed: ${errMsg}`);
      setGpsStatus(watchIdRef.current !== null ? 'watching' : 'error');
    }
  };

  const handleVerifyMyGpsNow = () => {
    if (!isPremiseConfigured) {
      setRejectionReason('Church premise GPS location has not been set by the Admin yet.');
      return;
    }
    if (!hasScheduledService) {
      setRejectionReason(checkInEligibility.message);
      showToast(checkInEligibility.message);
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('error');
      setRejectionReason('Geolocation is not supported on this device/browser.');
      return;
    }

    setGpsStatus('acquiring');
    setRejectionReason(null);
    setGpsFeedback('Acquiring high-accuracy GPS fix from your device...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist =
          systemSettings.campusLatitude !== null && systemSettings.campusLongitude !== null
            ? computeDistanceMeters(
                systemSettings.campusLatitude,
                systemSettings.campusLongitude,
                pos.coords.latitude,
                pos.coords.longitude
              )
            : null;

        setLivePosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy * 10) / 10,
          distanceM: dist,
        });
        verifyArrivalWithServer(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, 'web');
      },
      (err) => {
        setGpsStatus('error');
        if (err.code === err.PERMISSION_DENIED) {
          setRejectionReason('Location permission denied. Enable browser location access to verify arrival.');
        } else {
          setRejectionReason(`GPS signal error: ${err.message}`);
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const startAutoProximityRadar = () => {
    if (!isPremiseConfigured) {
      setRejectionReason('Church premise GPS location has not been set by the Admin yet.');
      return;
    }
    if (!hasScheduledService) {
      setRejectionReason(checkInEligibility.message);
      showToast(checkInEligibility.message);
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('error');
      setRejectionReason('Geolocation is not supported on this device/browser.');
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setGpsStatus('acquiring');
    setRejectionReason(null);
    setGpsFeedback('Live GPS proximity radar active — monitoring real distance to church premise...');

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const dist =
          systemSettings.campusLatitude !== null && systemSettings.campusLongitude !== null
            ? computeDistanceMeters(
                systemSettings.campusLatitude,
                systemSettings.campusLongitude,
                pos.coords.latitude,
                pos.coords.longitude
              )
            : null;

        setLivePosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy * 10) / 10,
          distanceM: dist,
        });
        setGpsStatus('watching');

        if (
          memberConsents.autoCheckin &&
          !isCheckedIn &&
          !autoVerifiedRef.current &&
          dist !== null &&
          dist <= systemSettings.innerGeofenceMeters + Math.min(Math.round(pos.coords.accuracy), 50)
        ) {
          autoVerifiedRef.current = true;
          verifyArrivalWithServer(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, 'geofence');
        }
      },
      (err) => {
        setGpsStatus('error');
        setRejectionReason(`Live GPS stream interrupted: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );

    watchIdRef.current = id;
  };

  const stopAutoProximityRadar = () => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGpsStatus('idle');
    setGpsFeedback('Live proximity radar paused.');
  };

  const eventsList = services.map((svc) => {
    let parsedDate: Date | null = null;
    if (svc.date && /^\d{4}-\d{2}-\d{2}$/.test(svc.date)) {
      const [y, m, d] = svc.date.split('-').map(Number);
      const candidate = new Date(y, m - 1, d);
      if (!Number.isNaN(candidate.getTime())) parsedDate = candidate;
    } else if (svc.startsAt && svc.startsAt.includes('T')) {
      const candidate = new Date(svc.startsAt);
      if (!Number.isNaN(candidate.getTime())) parsedDate = candidate;
    }

    const startObj = new Date(svc.startsAt);
    const endObj = new Date(svc.endsAt);
    const isValidStart = !Number.isNaN(startObj.getTime());
    const isValidEnd = !Number.isNaN(endObj.getTime());
    const dateDay = parsedDate
      ? parsedDate.toLocaleDateString('en-GB', { weekday: 'short' })
      : isValidStart
      ? startObj.toLocaleDateString('en-GB', { weekday: 'short' })
      : 'Sun';
    const dateNum = parsedDate
      ? parsedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : isValidStart
      ? startObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const startTimeStr = isValidStart
      ? startObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : svc.startsAt;
    const endTimeStr = isValidEnd
      ? endObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : svc.endsAt;

    return {
      id: svc.id,
      dateDay,
      dateNum,
      title: svc.name,
      timeVenue: `${ parsedDate ? `${dateNum} · ` : '' }${startTimeStr} – ${endTimeStr}, ${systemSettings.campusName}`,
      category: svc.status === 'open' ? 'Open Check-In' : 'Scheduled Service',
      desc: `${systemSettings.churchName} gathering at ${systemSettings.campusName}.`,
    };
  });

  const handleGiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalAmount = giveCustomAmount ? parseInt(giveCustomAmount, 10) : giveAmount;
    if (!finalAmount || finalAmount <= 0) {
      showToast('Please enter a valid amount');
      return;
    }
    const ok = await submitDonation(finalAmount, giveFund, giveMethod);
    if (ok) {
      setGivenSuccess(true);
    }
  };

  /* =========================================================================
     TAB CONTENT COMPONENTS
     ========================================================================= */

  const renderHomeContent = () => {
    const isRadarRunning = watchIdRef.current !== null;
    const liveDist = livePosition?.distanceM ?? null;
    const isInsideInner = liveDist !== null && liveDist <= systemSettings.innerGeofenceMeters;
    const isInsideOuter =
      liveDist !== null &&
      liveDist > systemSettings.innerGeofenceMeters &&
      liveDist <= systemSettings.outerGeofenceMeters;

    return (
      <div className="space-y-4 sm:space-y-6">
        {/* Welcome & Member Identity Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-[#1C1C3C] p-4 sm:p-5 rounded-3xl border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm min-w-0">
          <div className="min-w-0">
            {(() => {
              const tenantName = (
                systemSettings.churchName ||
                currentUser?.organizationName ||
                ''
              ).trim();
              const campusLabel = (systemSettings.campusName || '').trim();
              const showCampus =
                Boolean(campusLabel) &&
                campusLabel.toLowerCase() !== tenantName.toLowerCase();
              return (
                <>
                  {tenantName && (
                    <p
                      title={tenantName}
                      className="text-sm sm:text-base font-bold tracking-tight text-[#5E4AE3] dark:text-[#9D92FF] truncate mb-0.5"
                    >
                      {tenantName}
                    </p>
                  )}
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA] break-words">
                    Welcome, {memberDisplayName}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-[#5B5F7A] dark:text-[#A9ACC8] tabular-nums">
                    {showCampus && (
                      <>
                        <span className="font-medium truncate max-w-full">{campusLabel}</span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span className="font-semibold text-[#1D1B3A] dark:text-[#E2E4F3] truncate max-w-full">
                      {memberGroup}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      ID: <span className="font-mono font-bold">{memberCode}</span>
                    </span>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0 shrink-0">
            <button
              type="button"
              onClick={() => setIsProfileEditorOpen(true)}
              className="min-h-[42px] px-3.5 py-2 rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-[#1D1B3A] dark:text-[#F2F2FA] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#6C5CE7] dark:text-[#8C7DFF]" />
              <span>Edit Profile</span>
            </button>
            <button
              type="button"
              onClick={() => setIsQrSheetOpen(true)}
              className="flex-1 sm:flex-none min-h-[42px] px-4 py-2 rounded-2xl bg-[#EEEBFF] hover:bg-[#E0DCFF] dark:bg-[#2A2A55] dark:hover:bg-[#343468] text-[#6C5CE7] dark:text-[#8C7DFF] text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
            >
              <QrCode className="w-4 h-4 shrink-0" />
              <span>Check-in Pass &amp; Scanner</span>
            </button>
          </div>
        </div>

        {/* Congratulatory Birthday Card when signed-in member logs in on their birthday */}
        <MemberBirthdaysModule
          section="greeting"
          memberId={targetPersonId}
          memberFirstName={memberFirstName}
          memberDisplayName={memberDisplayName}
          memberDateOfBirth={memberDateOfBirth}
          churchName={systemSettings.churchName}
          members={members}
          wallPosts={churchWallPosts}
          currentActorId={currentUser?.id || targetPersonId}
          onShareToWall={addChurchWallPost}
          onToggleAmen={toggleChurchWallAmen}
          onSaveBirthdayDate={handleSaveMemberBirthday}
        />

        {/* Real Hardware GPS Proximity & Live Attendance Card */}
        <div className="bg-[#6C5CE7] dark:bg-[#7D6DF8] text-white rounded-3xl p-5 sm:p-6 shadow-md transition-all space-y-4">
          {!isPremiseConfigured ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-amber-400/20 text-amber-200 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold">
                      Church Premise Location Not Set Yet
                    </h3>
                    <p className="text-xs text-white/90">
                      Live GPS check-in activates as soon as your Admin pins the church premise coordinates.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  onClick={() => refreshLivePremise()}
                  className="bg-white text-[#6C5CE7] hover:bg-slate-100 rounded-2xl px-4 py-2.5 text-xs font-bold shadow-sm flex items-center gap-2 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Check Premise Status</span>
                </button>
                <button
                  onClick={() => setIsQrSheetOpen(true)}
                  className="bg-white/20 hover:bg-white/30 text-white rounded-2xl px-4 py-2.5 text-xs font-bold flex items-center gap-2 transition-colors"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Show My Entry Code</span>
                </button>
              </div>
            </div>
          ) : !hasScheduledService ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-amber-400/20 text-amber-200 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold">
                      {checkInEligibility.reasonCode === 'NO_SERVICE_SCHEDULED'
                        ? 'No Service Scheduled Right Now'
                        : 'Service Check-In Closed'}
                    </h3>
                    <p className="text-xs text-white/90">
                      {checkInEligibility.message}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  onClick={() => refreshLivePremise()}
                  className="bg-white text-[#6C5CE7] hover:bg-slate-100 rounded-2xl px-4 py-2.5 text-xs font-bold shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Service Schedule</span>
                </button>
                <button
                  onClick={() => setIsQrSheetOpen(true)}
                  className="bg-white/20 hover:bg-white/30 text-white rounded-2xl px-4 py-2.5 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Show My Entry Code</span>
                </button>
              </div>
            </div>
          ) : isCheckedIn ? (
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-emerald-400/20 text-emerald-300 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">You’re checked in, {memberFirstName}</h3>
                    <p className="text-xs text-white/90">
                      {currentService.name} · {myAttendanceRecord?.note || `Verified (${myAttendanceRecord?.method})`}
                    </p>
                  </div>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/20 text-xs font-bold">
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                  Present ({myAttendanceRecord?.checkedInAt})
                </span>
              </div>

              {/* Church Mini-Map Preview & Device Native Map Integration */}
              {isPremiseConfigured && (
                <div className="mt-3">
                  <ChurchLocationMiniMap
                    churchName={systemSettings.churchName}
                    campusName={systemSettings.campusName}
                    campusAddress={systemSettings.campusAddress}
                    latitude={systemSettings.campusLatitude!}
                    longitude={systemSettings.campusLongitude!}
                    innerRadiusM={systemSettings.innerGeofenceMeters}
                    outerRadiusM={systemSettings.outerGeofenceMeters}
                    livePosition={livePosition}
                    isCheckedIn={true}
                    onToast={showToast}
                  />
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-white/20 flex flex-wrap items-center justify-between gap-3 text-xs text-white/90">
                <span className="flex items-center gap-1.5 font-mono">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {systemSettings.campusName} ({systemSettings.campusLatitude?.toFixed(5)},{' '}
                    {systemSettings.campusLongitude?.toFixed(5)})
                  </span>
                </span>
                <button
                  onClick={() => {
                    removeCheckIn(targetPersonId);
                    autoVerifiedRef.current = false;
                    setGpsFeedback(null);
                  }}
                  className="bg-white/20 hover:bg-white/30 text-white rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors"
                >
                  Reset Check-in
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold">{currentService.name}</h3>
                  <p className="text-xs text-white/90 mt-0.5 flex flex-wrap items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>{systemSettings.campusName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">
                      ({systemSettings.campusLatitude?.toFixed(5)}, {systemSettings.campusLongitude?.toFixed(5)})
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{systemSettings.innerGeofenceMeters}m perimeter</span>
                  </p>
                </div>
                <span className="text-xs bg-white/20 px-3 py-1 rounded-full font-semibold w-fit">
                  {gpsStatus === 'watching'
                    ? 'Live Radar On'
                    : gpsStatus === 'acquiring' || gpsStatus === 'verifying'
                    ? 'Verifying GPS...'
                    : 'Live GPS Ready'}
                </span>
              </div>

              {/* Mini-Map Preview & Device Native Map Integration */}
              {isPremiseConfigured && (
                <ChurchLocationMiniMap
                  churchName={systemSettings.churchName}
                  campusName={systemSettings.campusName}
                  campusAddress={systemSettings.campusAddress}
                  latitude={systemSettings.campusLatitude!}
                  longitude={systemSettings.campusLongitude!}
                  innerRadiusM={systemSettings.innerGeofenceMeters}
                  outerRadiusM={systemSettings.outerGeofenceMeters}
                  livePosition={livePosition}
                  isCheckedIn={false}
                  onToast={showToast}
                />
              )}

              {/* Live Device Telemetry Readout when acquired */}
              {livePosition && (
                <div className="bg-black/20 rounded-2xl p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <span className="text-white/70 block text-[11px]">Your Live GPS</span>
                    <span className="font-mono font-bold">
                      {livePosition.lat.toFixed(5)}, {livePosition.lng.toFixed(5)}
                    </span>
                  </div>
                  <div>
                    <span className="text-white/70 block text-[11px]">Distance to Premise</span>
                    <span className="font-mono font-bold text-sm">
                      {liveDist !== null ? `${liveDist.toLocaleString()} m` : '--'}
                    </span>
                    <span className="text-white/75 ml-1.5 text-[11px]">
                      (±{Math.round(livePosition.accuracy)}m)
                    </span>
                  </div>
                  <div>
                    <span className="text-white/70 block text-[11px]">Geofence Zone</span>
                    <span className="font-bold">
                      {isInsideInner
                        ? `Inside Premise (≤${systemSettings.innerGeofenceMeters}m)`
                        : isInsideOuter
                        ? `Approaching (≤${systemSettings.outerGeofenceMeters}m)`
                        : `Outside Premise (>${systemSettings.innerGeofenceMeters}m)`}
                    </span>
                  </div>
                </div>
              )}

              {rejectionReason && (
                <div className="bg-rose-950/60 border border-rose-300/30 rounded-2xl p-3 text-xs text-rose-100 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                  <span>{rejectionReason}</span>
                </div>
              )}

              {gpsFeedback && !rejectionReason && (
                <p className="text-xs text-white/90 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  <span>{gpsFeedback}</span>
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={handleVerifyMyGpsNow}
                  disabled={gpsStatus === 'acquiring' || gpsStatus === 'verifying'}
                  className="bg-white text-[#6C5CE7] hover:bg-slate-100 rounded-2xl px-4 py-2.5 text-xs font-bold shadow-md flex items-center gap-2 transition-colors disabled:opacity-60"
                >
                  <Navigation className="w-4 h-4" />
                  <span>
                    {gpsStatus === 'acquiring' || gpsStatus === 'verifying'
                      ? 'Checking Live GPS...'
                      : 'Verify My GPS & Check In'}
                  </span>
                </button>

                {!isRadarRunning ? (
                  <button
                    onClick={startAutoProximityRadar}
                    className="bg-white/20 hover:bg-white/30 text-white rounded-2xl px-4 py-2.5 text-xs font-bold flex items-center gap-2 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Start Auto-Proximity Radar</span>
                  </button>
                ) : (
                  <button
                    onClick={stopAutoProximityRadar}
                    className="bg-white/25 hover:bg-white/35 text-white rounded-2xl px-4 py-2.5 text-xs font-bold flex items-center gap-2 transition-colors"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop Radar</span>
                  </button>
                )}

                <button
                  onClick={() => setIsQrSheetOpen(true)}
                  className="bg-white/15 hover:bg-white/25 text-white rounded-2xl px-4 py-2.5 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Show My Entry Code</span>
                </button>
              </div>

              {/* Live Geofence Production Test & Calibration Bar */}
              <div className="pt-3 border-t border-white/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-white/85 font-semibold text-[11px] flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5 text-amber-300" />
                  <span>Live Production Calibration:</span>
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={async () => {
                      if (livePosition) {
                        await setChurchPremiseLocation({
                          lat: livePosition.lat,
                          lng: livePosition.lng,
                          accuracyM: livePosition.accuracy,
                        });
                        showToast(`Church premise aligned to your live GPS coordinates!`);
                      } else {
                        handleVerifyMyGpsNow();
                      }
                    }}
                    className="px-2.5 py-1 rounded-xl bg-white/20 hover:bg-white/30 text-white text-[11px] font-bold transition-all cursor-pointer"
                    title="Aligns the church campus premise to where you are standing right now for testing"
                  >
                    Set Premise to My GPS
                  </button>
                  <button
                    onClick={() => {
                      if (systemSettings.campusLatitude !== null && systemSettings.campusLongitude !== null) {
                        verifyArrivalWithServer(
                          systemSettings.campusLatitude,
                          systemSettings.campusLongitude,
                          5,
                          'geofence'
                        );
                        showToast('Testing arrival inside sanctuary (0m)...');
                      } else {
                        showToast('Please set campus premise coordinates first');
                      }
                    }}
                    className="px-2.5 py-1 rounded-xl bg-emerald-500/40 hover:bg-emerald-500/60 text-white text-[11px] font-bold transition-all cursor-pointer"
                  >
                    Test Inside (0m)
                  </button>
                  <button
                    onClick={() => {
                      if (systemSettings.campusLatitude !== null && systemSettings.campusLongitude !== null) {
                        // Offset by ~400 meters
                        verifyArrivalWithServer(
                          systemSettings.campusLatitude + 0.0036,
                          systemSettings.campusLongitude + 0.0036,
                          10,
                          'geofence'
                        );
                        showToast('Testing location outside perimeter (400m)...');
                      }
                    }}
                    className="px-2.5 py-1 rounded-xl bg-rose-500/40 hover:bg-rose-500/60 text-white text-[11px] font-bold transition-all cursor-pointer"
                  >
                    Test Outside (400m)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Weekly Attendance Streak & Digital Badges Indicator */}
        <MemberAttendanceStreakCard
          personId={targetPersonId}
          member={matchedMember}
          isCheckedInToday={isCheckedIn}
          attendanceRecords={attendanceRecords}
          onShowToast={showToast}
        />

        {/* Birthdays & Church Wall Module */}
        <MemberBirthdaysModule
          section="wall"
          memberId={targetPersonId}
          memberFirstName={memberFirstName}
          memberDisplayName={memberDisplayName}
          memberDateOfBirth={memberDateOfBirth}
          churchName={systemSettings.churchName}
          members={members}
          wallPosts={churchWallPosts}
          currentActorId={currentUser?.id || targetPersonId}
          onShareToWall={addChurchWallPost}
          onToggleAmen={toggleChurchWallAmen}
          onSaveBirthdayDate={handleSaveMemberBirthday}
        />

        {/* Web Push Notification Card (Brief Section 3.3 & 6.2) */}
        <div className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-5 shadow-sm space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/40">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Smart Push Notifications & Radar Alert
                  </h3>
                  {pushPermissionStatus === 'granted' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  ) : pushPermissionStatus === 'denied' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300">
                      Blocked in Browser
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      Setup Needed
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] mt-0.5">
                  {systemSettings.enablePushNotifications
                    ? `Instant arrival confirmations ("Welcome ${memberFirstName}, you are checked in"), service reminders, and care notes.`
                    : `Push alerts are paused by church admin. Arrival checks will confirm in-app${systemSettings.smsGatewayProvider ? ` with ${systemSettings.smsGatewayProvider} SMS fallback` : ''}.`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 sm:pt-0 shrink-0">
              {!systemSettings.enablePushNotifications ? (
                <span className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-[#5B5F7A] dark:text-[#A9ACC8] text-xs font-bold">
                  Paused in Settings
                </span>
              ) : pushPermissionStatus !== 'granted' ? (
                <button
                  type="button"
                  onClick={() => requestPushPermission()}
                  className="px-4 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5A48DE] text-white text-xs font-bold shadow-md shadow-indigo-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Enable Push Notifications</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => sendTestPushNotification()}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Simulate Arrival Push</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Two-column grid on desktop/tablets */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* Today's Sermon & Bulletin */}
          <div className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6C5CE7] dark:text-[#8C7DFF] flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                Today’s Message
              </span>
              <span className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">
                {systemSettings.seniorPastor}
              </span>
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Walking in Grace & Steadfast Faith
              </h3>
              <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] mt-1 leading-relaxed">
                Scripture: 2 Corinthians 9:8 · "God is able to bless you abundantly, so that in all things having all that you need, you will abound in every good work."
              </p>
            </div>
            <div className="pt-2 flex items-center justify-between border-t border-[#E3E5F2] dark:border-[#2D2D55] text-xs">
              <span className="text-[#5B5F7A] dark:text-[#A9ACC8] font-medium">
                Fellowship: {memberGroup}
              </span>
              <button
                onClick={() => showToast('Sermon study notes downloaded to your device.')}
                className="text-[#6C5CE7] dark:text-[#8C7DFF] font-bold hover:underline flex items-center gap-1"
              >
                <span>Download Notes</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Giving Shortcut Card */}
          <div className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5" />
                  Faithful Giving
                </span>
                <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8]">Paystack / MoMo</span>
              </div>
              <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Give Tithes & Offerings
              </h3>
              <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] mt-1">
                Quick donation with MTN MoMo, Telecel Cash, or Visa/Mastercard. Instant church receipt.
              </p>
            </div>

            <div className="pt-4 flex items-center gap-2">
              {currency.presetAmounts.slice(1, 4).map((amt) => (
                <button
                  key={amt}
                  onClick={() => {
                    setGiveAmount(amt);
                    setGiveCustomAmount('');
                    setActiveTab('give');
                  }}
                  className="flex-1 py-2 rounded-xl text-xs font-bold border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 hover:bg-[#EEEBFF] hover:border-[#6C5CE7] text-[#1D1B3A] dark:text-[#F2F2FA] transition-all tabular-nums"
                >
                  {currency.code} {amt}
                </button>
              ))}
              <button
                onClick={() => setActiveTab('give')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#6C5CE7] hover:bg-[#5b4be0] text-white transition-colors shrink-0 shadow-sm"
              >
                Give
              </button>
            </div>
          </div>
        </div>

        {/* My Ministry & Cell Group Connection Card */}
        <div className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-[#EEEBFF] dark:bg-[#2A2A55] text-[#6C5CE7] dark:text-[#8C7DFF] flex items-center justify-center shrink-0">
                <Users className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  My Ministry &amp; Cell Group
                </h3>
                <p className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8]">
                  Synced with {systemSettings.churchName} Ministries &amp; Cell Directory
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab('me');
                setIsEditingMyGroups(true);
              }}
              className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#6C5CE7]" />
              <span>Update Ministry / Cell</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Cell / Fellowship Group */}
            <div className="rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50/70 dark:bg-black/20 p-3.5 space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#6C5CE7] dark:text-[#8C7DFF]">
                Cell / Fellowship Group
              </div>
              <div className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                {cellOrFellowshipGroup?.name || memberGroup}
              </div>
              {cellOrFellowshipGroup ? (
                <div className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] space-y-0.5">
                  <div>
                    Leader: <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">{cellOrFellowshipGroup.leaderName || 'Assigned by Pastor'}</span>
                    {cellOrFellowshipGroup.leaderPhone && (
                      <span className="ml-1.5 font-mono">· {cellOrFellowshipGroup.leaderPhone}</span>
                    )}
                  </div>
                  {(cellOrFellowshipGroup.meetingDay || cellOrFellowshipGroup.meetingTime || cellOrFellowshipGroup.meetingLocation) && (
                    <div>
                      {[cellOrFellowshipGroup.meetingDay, cellOrFellowshipGroup.meetingTime, cellOrFellowshipGroup.meetingLocation]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8]">
                  Leader &amp; schedule appear once linked to an active cell group.
                </div>
              )}
            </div>

            {/* Serving Ministry / Department */}
            <div className="rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50/70 dark:bg-black/20 p-3.5 space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Serving Ministry / Department
              </div>
              <div className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                {ministryGroup?.name || memberDepartment || 'General Congregation'}
              </div>
              {ministryGroup ? (
                <div className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] space-y-0.5">
                  <div>
                    Ministry Lead: <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">{ministryGroup.leaderName || systemSettings.seniorPastor}</span>
                    {ministryGroup.leaderPhone && (
                      <span className="ml-1.5 font-mono">· {ministryGroup.leaderPhone}</span>
                    )}
                  </div>
                  {(ministryGroup.meetingDay || ministryGroup.meetingTime || ministryGroup.meetingLocation) && (
                    <div>
                      {[ministryGroup.meetingDay, ministryGroup.meetingTime, ministryGroup.meetingLocation]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8]">
                  Join a serving ministry from your Me profile to connect with department leads.
                </div>
              )}
            </div>

            {/* Automatic Birth Month Fellowship Group */}
            <div className="rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50/70 dark:bg-black/20 p-3.5 space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Cake className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Birth Month Group</span>
              </div>
              <div className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                {memberBirthFields.birthMonthGroup || 'Unassigned'}
              </div>
              {memberBirthFields.monthOfBirth ? (
                <div className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8]">
                  {(() => {
                    const peerCount = members.filter((m) => {
                      const resolved = resolveMemberBirthFields({
                        dateOfBirth: m.dateOfBirth,
                        monthOfBirth: m.monthOfBirth,
                        birthMonthGroup: m.birthMonthGroup,
                      });
                      return resolved.monthOfBirth === memberBirthFields.monthOfBirth;
                    }).length;
                    return `Connected to your ${memberBirthFields.monthOfBirth} Date of Birth · ${peerCount} congregation member${peerCount === 1 ? '' : 's'} in this group.`;
                  })()}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsProfileEditorOpen(true)}
                  className="text-[11px] font-bold text-[#6C5CE7] dark:text-[#8C7DFF] hover:underline cursor-pointer"
                >
                  Add your Date of Birth to auto-join →
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Coming Up Events Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#6C5CE7]" />
              <span>Upcoming Gatherings</span>
            </h2>
            <button
              onClick={() => setActiveTab('events')}
              className="text-xs font-bold text-[#6C5CE7] dark:text-[#8C7DFF] hover:underline"
            >
              View all ({eventsList.length})
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {eventsList.slice(0, 2).map((ev) => (
              <div
                key={ev.id}
                className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-4 flex items-center gap-3.5 shadow-sm"
              >
                <div className="w-13 h-13 rounded-2xl bg-[#EEEBFF] dark:bg-[#2A2A55] text-[#6C5CE7] dark:text-[#8C7DFF] flex flex-col items-center justify-center font-bold text-xs shrink-0">
                  <span className="text-[11px] uppercase tracking-wider">{ev.dateDay}</span>
                  <span className="text-sm font-extrabold">{ev.dateNum.split(' ')[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-[#6C5CE7] dark:text-[#8C7DFF] uppercase tracking-wider block">
                    {ev.category}
                  </span>
                  <b className="block text-xs sm:text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                    {ev.title}
                  </b>
                  <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span className="truncate">{ev.timeVenue}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setQrInitialContext(ev.title);
                      setIsQrSheetOpen(true);
                    }}
                    title={`Scan QR check-in for ${ev.title}`}
                    aria-label={`Scan QR for ${ev.title}`}
                    className="p-2 rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-[#F6F7FC] dark:bg-white/5 text-[#6C5CE7] dark:text-[#8C7DFF] hover:border-[#6C5CE7]/60 transition-colors cursor-pointer"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleRsvp(ev.title, ev.id)}
                    className={`text-xs font-bold px-3.5 py-2 rounded-xl transition-all shrink-0 ${
                      memberRsvps[ev.title]
                        ? 'bg-[#DDF5EC] text-[#1E7A5F] dark:bg-[#16382F] dark:text-[#5FD3AB]'
                        : 'bg-[#EEEBFF] text-[#6C5CE7] dark:bg-[#2A2A55] dark:text-[#8C7DFF] hover:bg-[#6C5CE7] hover:text-white'
                    }`}
                  >
                    {memberRsvps[ev.title] ? 'Going ✓' : 'RSVP'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderEventsContent = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
            Church Events & Services
          </h1>
          <p className="text-xs sm:text-sm text-[#5B5F7A] dark:text-[#A9ACC8]">
            RSVP helps pastoral leadership plan seating, children's ministry, and hospitality.
          </p>
        </div>
        <span className="text-xs font-semibold text-[#5B5F7A] dark:text-[#A9ACC8]">
          {systemSettings.churchName} · {systemSettings.campusName}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
        {eventsList.map((ev) => (
          <div
            key={ev.id}
            className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-4 sm:p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow"
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-13 h-13 rounded-2xl bg-[#EEEBFF] dark:bg-[#2A2A55] text-[#6C5CE7] dark:text-[#8C7DFF] flex flex-col items-center justify-center font-bold text-xs shrink-0">
                    <span className="text-[11px] uppercase tracking-wider">{ev.dateDay}</span>
                    <span className="text-sm font-extrabold">{ev.dateNum.split(' ')[0]}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[#6C5CE7] dark:text-[#8C7DFF] uppercase tracking-wider">
                      {ev.category}
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      {ev.title}
                    </h3>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-[#5B5F7A] dark:text-[#A9ACC8]">
                  {memberRsvps[ev.title] ? 'Attending' : 'Open'}
                </span>
              </div>
              <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] leading-relaxed mb-3">
                {ev.desc}
              </p>
            </div>

            <div className="pt-3 border-t border-[#E3E5F2] dark:border-[#2D2D55] flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>{ev.timeVenue}</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setQrInitialContext(ev.title);
                    setIsQrSheetOpen(true);
                  }}
                  className="text-xs font-bold px-3 py-2 rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-[#F6F7FC] dark:bg-white/5 text-[#1D1B3A] dark:text-[#F2F2FA] hover:border-[#6C5CE7]/60 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5 text-[#6C5CE7] dark:text-[#8C7DFF]" />
                  <span>Scan QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleRsvp(ev.title, ev.id)}
                  className={`text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm cursor-pointer ${
                    memberRsvps[ev.title]
                      ? 'bg-[#DDF5EC] text-[#1E7A5F] dark:bg-[#16382F] dark:text-[#5FD3AB]'
                      : 'bg-[#6C5CE7] text-white hover:bg-[#5b4be0]'
                  }`}
                >
                  {memberRsvps[ev.title] ? 'Reserved ✓' : 'RSVP Now'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderGiveContent = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
            Tithe & Offering Portal
          </h1>
          <p className="text-xs sm:text-sm text-[#5B5F7A] dark:text-[#A9ACC8]">
            Your giving is recorded directly to your confidential church profile and receipted via email.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="w-4 h-4" />
          <span>Paystack Encrypted</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Donation Form */}
        <div className="lg:col-span-7">
          {givenSuccess ? (
            <div className="bg-white dark:bg-[#1C1C3C] rounded-3xl p-6 sm:p-8 text-center border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm space-y-4 animate-in fade-in">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Thank you for your gift, {memberFirstName}!
              </h3>
              <p className="text-xs sm:text-sm text-[#5B5F7A] dark:text-[#A9ACC8] leading-relaxed max-w-md mx-auto">
                {currency.code} {giveCustomAmount || giveAmount} received for <b>{giveFund}</b> via <b>{giveMethod}</b>. A formal
                statement has been sent to <b>{memberEmail}</b>.
              </p>
              <div className="text-[11px] text-[#8A5700] dark:text-[#F5B84A] bg-[#FFEFD0] dark:bg-[#3D2E10] p-3 rounded-2xl max-w-md mx-auto font-medium">
                {systemSettings.churchName} finance ledger updated.
              </div>
              <button
                onClick={() => setGivenSuccess(false)}
                className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-[#6C5CE7] hover:bg-[#5b4be0] text-white text-xs font-bold shadow-md transition-all"
              >
                Make Another Gift
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleGiveSubmit}
              className="bg-white dark:bg-[#1C1C3C] rounded-3xl p-5 sm:p-6 border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm space-y-4"
            >
              {/* Preset Amount Chips */}
              <div>
                <label className="block text-xs font-bold mb-2 text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Select Amount ({currency.code})
                </label>
                <div className="grid grid-cols-4 gap-2 mb-2.5">
                  {currency.presetAmounts.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        setGiveAmount(amt);
                        setGiveCustomAmount('');
                      }}
                      className={`py-2.5 rounded-2xl text-xs font-bold transition-all tabular-nums ${
                        giveAmount === amt && !giveCustomAmount
                          ? 'bg-[#6C5CE7] text-white shadow-sm ring-2 ring-[#6C5CE7]/30'
                          : 'bg-slate-50 dark:bg-black/20 border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-100'
                      }`}
                    >
                      {currency.code} {amt}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  placeholder={`Or enter custom amount (e.g. ${currency.presetAmounts[3] * 2})`}
                  value={giveCustomAmount}
                  onChange={(e) => setGiveCustomAmount(e.target.value)}
                  className="w-full p-3 rounded-2xl text-xs border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6C5CE7]"
                />
              </div>

              {/* Fund Selector */}
              <div>
                <label className="block text-xs font-bold mb-2 text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Designation Fund
                </label>
                <select
                  value={giveFund}
                  onChange={(e) => setGiveFund(e.target.value)}
                  className="w-full p-3 rounded-2xl text-xs border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6C5CE7]"
                >
                  <option>Tithe (10% Income)</option>
                  <option>Sunday Offering</option>
                  <option>Building Sanctuary Project</option>
                  <option>Welfare & Benevolence</option>
                  <option>Missions & Outreach</option>
                </select>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold mb-2 text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['MTN MoMo', 'Telecel Cash', 'Card'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setGiveMethod(method)}
                      className={`py-3 px-2 rounded-2xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${
                        giveMethod === method
                          ? 'bg-[#6C5CE7] text-white shadow-sm ring-2 ring-[#6C5CE7]/30'
                          : 'bg-slate-50 dark:bg-black/20 border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-100'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>{method}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-[#1D1B3A] dark:bg-[#6C5CE7] hover:bg-[#282855] text-white text-xs sm:text-sm font-bold shadow-lg transition-all mt-4 tabular-nums"
              >
                Proceed to Give {currency.code} {giveCustomAmount || giveAmount}
              </button>
            </form>
          )}
        </div>

        {/* Right: Summary & Statement */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-[#1C1C3C] rounded-3xl p-5 border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm">
            <h3 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] uppercase tracking-wide mb-3">
              Giving Receipt & Statement
            </h3>
            <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] leading-relaxed">
              Receipts are sent automatically to <span className="font-semibold">{memberEmail}</span>. You can request a consolidated statement at any time.
            </p>

            <button
              onClick={() => showToast(`Giving statement PDF emailed to ${memberEmail}.`)}
              className="mt-4 w-full py-2.5 rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] text-xs font-bold bg-slate-50 dark:bg-black/20 hover:bg-slate-100 dark:hover:bg-black/30 flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#6C5CE7]" />
              <span>Download Statement (PDF)</span>
            </button>
          </div>

          <div className="bg-[#EEEBFF] dark:bg-[#2A2A55] rounded-3xl p-5 text-xs text-[#1D1B3A] dark:text-[#F2F2FA]">
            <b className="block font-bold mb-1 flex items-center gap-1.5 text-[#6C5CE7] dark:text-[#8C7DFF]">
              <ShieldCheck className="w-4 h-4" />
              Church Financial Transparency
            </b>
            <p className="opacity-90 leading-relaxed text-[11px]">
              All mobile transactions through Ekklesphere are verified via licensed payment aggregators. No PINs or card secrets are stored on church servers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderMeContent = () => (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
            Me
          </h1>
          <p className="text-xs sm:text-sm text-[#5B5F7A] dark:text-[#A9ACC8]">
            Your Digital Member Card for on-site event registration, official profile, and privacy controls.
          </p>
        </div>
        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Act 843 Protected</span>
        </span>
      </div>

      {/* Digital Member Card for On-Site Event Registration */}
      <DigitalMemberCard
        memberId={memberCode}
        fullName={memberDisplayName}
        photoUrl={memberPhotoUrl}
        initials={memberInitials}
        churchName={systemSettings.churchName}
        campusName={systemSettings.campusName}
        groupName={memberGroup}
        department={memberDepartment}
        joinedOn={matchedMember?.joinedOn}
        activeServiceName={currentService.name}
        isCheckedIn={isCheckedIn}
        checkedInAt={myAttendanceRecord?.checkedInAt}
        onUpdatePhoto={handleUpdateMemberPhoto}
        onOpenScanner={() => setIsQrSheetOpen(true)}
        onNotify={showToast}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Privacy Permissions */}
        <div className="bg-white dark:bg-[#1C1C3C] rounded-3xl p-5 border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] uppercase tracking-wide">
              Automated Presence &amp; Communication Consents
            </h2>
            <span className="text-[11px] font-semibold text-[#6C5CE7] dark:text-[#8C7DFF]">
              {systemSettings.requireExplicitConsent ? 'Act 843 Explicit Opt-In' : 'Standard Consent'}
            </span>
          </div>
          <div className="divide-y divide-[#E3E5F2] dark:divide-[#2D2D55]">
            {/* Auto check-in */}
            <div className="py-3 first:pt-0 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Proximity Auto Check-in
                </b>
                <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] leading-tight block">
                  Verifies live GPS within {systemSettings.innerGeofenceMeters}m of {systemSettings.campusName} only on arrival. No location trails stored.
                </span>
              </div>
              <button
                onClick={() =>
                  updateMemberConsent(
                    !memberConsents.autoCheckin,
                    memberConsents.push,
                    memberConsents.sms,
                    memberConsents.email
                  )
                }
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  memberConsents.autoCheckin ? 'bg-[#6C5CE7]' : 'bg-slate-300 dark:bg-slate-700'
                }`}
                aria-label="Toggle auto checkin"
              >
                <span
                  className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm ${
                    memberConsents.autoCheckin ? 'left-[26px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Push notifications */}
            <div className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Push Notifications
                </b>
                <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] leading-tight block">
                  Arrival confirmations, service updates, and prayer requests.
                </span>
              </div>
              <button
                onClick={() =>
                  updateMemberConsent(
                    memberConsents.autoCheckin,
                    !memberConsents.push,
                    memberConsents.sms,
                    memberConsents.email
                  )
                }
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  memberConsents.push ? 'bg-[#6C5CE7]' : 'bg-slate-300 dark:bg-slate-700'
                }`}
                aria-label="Toggle push notifications"
              >
                <span
                  className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm ${
                    memberConsents.push ? 'left-[26px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* SMS reminders */}
            <div className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">SMS Reminders</b>
                <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] leading-tight block">
                  Offline fallback notifications when mobile data is unavailable.
                </span>
              </div>
              <button
                onClick={() =>
                  updateMemberConsent(
                    memberConsents.autoCheckin,
                    memberConsents.push,
                    !memberConsents.sms,
                    memberConsents.email
                  )
                }
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  memberConsents.sms ? 'bg-[#6C5CE7]' : 'bg-slate-300 dark:bg-slate-700'
                }`}
                aria-label="Toggle SMS reminders"
              >
                <span
                  className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm ${
                    memberConsents.sms ? 'left-[26px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Email receipts */}
            <div className="py-3 last:pb-0 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Email Receipts</b>
                <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] leading-tight block">
                  Donation receipts, sermon notes, and announcements.
                </span>
              </div>
              <button
                onClick={() =>
                  updateMemberConsent(
                    memberConsents.autoCheckin,
                    memberConsents.push,
                    memberConsents.sms,
                    !memberConsents.email
                  )
                }
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  memberConsents.email ? 'bg-[#6C5CE7]' : 'bg-slate-300 dark:bg-slate-700'
                }`}
                aria-label="Toggle email receipts"
              >
                <span
                  className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm ${
                    memberConsents.email ? 'left-[26px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Member Profile & Data Rights */}
        <div className="space-y-4 min-w-0">
          <div className="bg-white dark:bg-[#1C1C3C] rounded-3xl p-4 sm:p-5 border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm space-y-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] uppercase tracking-wide">
                Official Church Records
              </h2>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsEditingMyGroups((prev) => !prev)}
                  className="text-[11px] font-semibold text-[#5B5F7A] dark:text-[#A9ACC8] hover:text-[#6C5CE7] dark:hover:text-[#8C7DFF] hover:underline cursor-pointer"
                >
                  {isEditingMyGroups ? 'Close Quick Edit' : 'Quick Cell Edit'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsProfileEditorOpen(true)}
                  className="min-h-[34px] px-3 py-1 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[11px] font-bold text-[#6C5CE7] dark:text-[#9D90FF] hover:bg-[#E2DFFF] dark:hover:bg-[#343468] flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3 h-3 shrink-0" />
                  <span>Edit My Details</span>
                </button>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8] shrink-0">Member ID</span>
                <b className="text-[#1D1B3A] dark:text-[#F2F2FA] font-mono tabular-nums text-right break-all min-w-0">{memberCode}</b>
              </div>
              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8] shrink-0">Full Name</span>
                <b className="text-[#1D1B3A] dark:text-[#F2F2FA] text-right break-words min-w-0">
                  {[matchedMember?.firstName, matchedMember?.middleName, matchedMember?.lastName].filter(Boolean).join(' ') || memberDisplayName}
                </b>
              </div>
              {matchedMember?.preferredName && matchedMember.preferredName !== memberDisplayName && (
                <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                  <span className="text-[#5B5F7A] dark:text-[#A9ACC8] shrink-0">Preferred Name</span>
                  <b className="text-[#1D1B3A] dark:text-[#F2F2FA] text-right break-words min-w-0">{matchedMember.preferredName}</b>
                </div>
              )}
              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8] shrink-0">Phone</span>
                <b className="text-[#1D1B3A] dark:text-[#F2F2FA] font-mono text-right break-all min-w-0">{memberPhone || 'Not set'}</b>
              </div>
              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8] shrink-0">Registered Email</span>
                <b className="text-[#1D1B3A] dark:text-[#F2F2FA] text-right break-all min-w-0">{memberEmail || 'Not set'}</b>
              </div>
              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8] shrink-0">Cell / Fellowship Group</span>
                <b className="text-[#1D1B3A] dark:text-[#F2F2FA] text-right break-words min-w-0">{memberGroup}</b>
              </div>
              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8] shrink-0">Ministry / Department</span>
                <b className="text-[#1D1B3A] dark:text-[#F2F2FA] text-right break-words min-w-0">{memberDepartment || 'General Congregation'}</b>
              </div>
              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8] inline-flex items-center gap-1 shrink-0">
                  <Cake className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                  <span>Birthday</span>
                </span>
                <b className="text-[#1D1B3A] dark:text-[#F2F2FA] text-right min-w-0">
                  {memberDateOfBirth
                    ? formatBirthdayMonthDay(memberDateOfBirth)
                    : memberBirthFields.monthOfBirth || 'Not set'}
                </b>
              </div>
              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8] shrink-0">Birth Month Group</span>
                <b className="text-[#6C5CE7] dark:text-[#9D90FF] text-right break-words min-w-0">
                  {memberBirthFields.birthMonthGroup ||
                    formatBirthMonthGroupName(memberBirthFields.monthOfBirth) ||
                    'Not assigned'}
                </b>
              </div>
              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8] shrink-0">Residence</span>
                <b className="text-[#1D1B3A] dark:text-[#F2F2FA] text-right break-words min-w-0">
                  {[matchedMember?.placeOfResidence, matchedMember?.residentialDigitalAddress].filter(Boolean).join(' · ') || 'Not set'}
                </b>
              </div>
              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8] shrink-0">Occupation &amp; Marital</span>
                <b className="text-[#1D1B3A] dark:text-[#F2F2FA] text-right break-words min-w-0">
                  {[matchedMember?.occupation, matchedMember?.maritalStatus].filter(Boolean).join(' · ') || 'Not set'}
                </b>
              </div>
              <div className="flex items-start justify-between gap-3 py-1.5">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8] shrink-0">Emergency Contact</span>
                <b className="text-[#1D1B3A] dark:text-[#F2F2FA] text-right break-words min-w-0">
                  {[matchedMember?.emergencyContactPerson, matchedMember?.emergencyContactPhone].filter(Boolean).join(' · ') || 'Not set'}
                </b>
              </div>
            </div>

            {isEditingMyGroups && (
              <form
                onSubmit={handleSaveMyGroups}
                className="p-3.5 rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50/80 dark:bg-black/20 space-y-3"
              >
                <div>
                  <label className="block text-[11px] font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Cell / Fellowship Group
                  </label>
                  <select
                    value={draftCellGroup}
                    onChange={(e) => setDraftCellGroup(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1C1C3C] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6C5CE7]"
                  >
                    {selectableCellGroups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                    {!selectableCellGroups.includes(draftCellGroup) && (
                      <option value={draftCellGroup}>{draftCellGroup}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Serving Ministry / Department
                  </label>
                  <select
                    value={draftDepartment}
                    onChange={(e) => setDraftDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1C1C3C] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6C5CE7]"
                  >
                    {selectableDepartments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                    {!selectableDepartments.includes(draftDepartment) && (
                      <option value={draftDepartment}>{draftDepartment}</option>
                    )}
                  </select>
                </div>

                {(() => {
                  const preview = findMatchingChurchGroup(churchGroups, {
                    groupName: draftCellGroup,
                    homeCellGroup: draftCellGroup,
                    department: draftDepartment,
                  });
                  const matchedInfo = preview.ministryGroup || preview.cellOrFellowshipGroup;
                  if (!matchedInfo) return null;
                  return (
                    <div className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] flex items-center gap-1.5">
                      <Phone className="w-3 h-3 text-[#6C5CE7] shrink-0" />
                      <span>
                        Lead: <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">{matchedInfo.leaderName || systemSettings.seniorPastor}</b>
                        {matchedInfo.meetingDay ? ` · ${matchedInfo.meetingDay}` : ''}
                        {matchedInfo.meetingTime ? ` ${matchedInfo.meetingTime}` : ''}
                      </span>
                    </div>
                  );
                })()}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEditingMyGroups(false)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-[#5B5F7A] dark:text-[#A9ACC8] hover:bg-slate-200/70 dark:hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingMyGroups}
                    className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#6C5CE7] hover:bg-[#5b4be0] text-white disabled:opacity-50"
                  >
                    {isSavingMyGroups ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            )}

            {/* Data Protection Actions */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => showToast(`Full data export generated for ${memberEmail}.`)}
                className="py-2.5 rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] text-xs font-bold bg-slate-50 dark:bg-black/20 hover:bg-slate-100 flex items-center justify-center gap-1.5 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-[#6C5CE7]" />
                <span>Export My Data</span>
              </button>
              <button
                onClick={() => showToast('Data deletion inquiry sent to Data Protection Officer.')}
                className="py-2.5 rounded-2xl border border-rose-200 dark:border-rose-900/40 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-100/50 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete My Record</span>
              </button>
            </div>
          </div>

          {/* Account Security & Password */}
          <div className="bg-white dark:bg-[#1C1C3C] rounded-3xl p-5 border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] uppercase tracking-wide flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#6D5CF2]" />
                <span>Account Password & Security</span>
              </h2>
              <span className="text-[11px] font-semibold text-[#5B5F7A] dark:text-[#A9ACC8]">
                {currentUser?.mustChangePassword ? 'Temporary Password Active' : 'Personal Password'}
              </span>
            </div>
            <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] leading-relaxed">
              {currentUser?.mustChangePassword
                ? 'Your account was provisioned with a temporary onboarding password. Update it to a personal password at any time.'
                : 'Sign in with your registered email address or phone number. You can update your password whenever needed.'}
            </p>
            <button
              type="button"
              onClick={() => setIsChangePasswordModalOpen(true)}
              className="w-full py-2.5 rounded-2xl text-xs font-bold bg-[#6D5CF2] hover:bg-[#5b4be0] text-white flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>{currentUser?.mustChangePassword ? 'Set Personal Password' : 'Change Password'}</span>
            </button>
          </div>

          {/* Account Session & Verified Portal Switcher */}
          <div className="bg-white dark:bg-[#1C1C3C] rounded-3xl p-5 border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm space-y-3">
            {(currentUser?.is_creator ||
              ['creator', 'super_admin', 'admin', 'pastor'].includes(
                currentUser?.verifiedRole || currentUser?.role || 'member'
              )) && (
              <>
                <h2 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] uppercase tracking-wide flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  <span>Switch Active Portal</span>
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => switchUserRole('admin')}
                    className="py-2.5 px-3 rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <LayoutDashboard className="w-4 h-4 text-[#6D5CF2]" />
                    <span>Pastor Admin</span>
                  </button>
                  <button
                    onClick={() => switchUserRole('usher')}
                    className="py-2.5 px-3 rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <QrCode className="w-4 h-4 text-amber-500" />
                    <span>Door Usher</span>
                  </button>
                </div>
              </>
            )}

            <button
              onClick={() => logout()}
              className="w-full py-2.5 rounded-2xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out from Ekklesphere</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  /* =========================================================================
     MAIN RENDER
     ========================================================================= */

  return (
    <main className="relative max-w-[1360px] w-[calc(100%-12px)] sm:w-[calc(100%-24px)] lg:w-[calc(100%-32px)] mx-auto my-1.5 sm:my-3 lg:my-4 bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl sm:rounded-3xl lg:rounded-[36px] pt-4 sm:pt-6 pb-24 sm:pb-28 lg:pb-8 px-3 sm:px-6 lg:pl-[88px] lg:pr-8 shadow-lg lg:shadow-[0_20px_60px_rgba(60,50,140,0.12)] border border-[#E9EBF5] dark:border-[#2D2D55] min-h-[calc(100dvh-76px)] min-w-0 overflow-x-clip transition-all duration-200">
      {/* Navigation Bar - Responsive Floating Dock on Mobile & Signature Left Tab on Desktop */}
      <aside
        aria-label="Member Navigation"
        className="fixed z-50 bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 lg:translate-x-0 lg:bottom-auto lg:top-20 lg:left-0 w-[calc(100%-16px)] max-w-md lg:w-[64px] bg-[#6D5CF2]/95 dark:bg-[#5E4EE0]/95 backdrop-blur-xl rounded-2xl sm:rounded-full lg:rounded-r-[28px] lg:rounded-l-none grid grid-cols-5 lg:flex lg:flex-col items-center justify-items-center sm:justify-center lg:justify-start gap-1 sm:gap-2 lg:gap-2.5 px-2 py-1.5 sm:px-4 sm:py-2 lg:py-5 lg:px-0 pb-[max(0.375rem,env(safe-area-inset-bottom))] lg:pb-5 shadow-[0_12px_36px_rgba(40,30,120,0.35)] lg:shadow-[0_12px_32px_rgba(40,30,120,0.25)] border border-white/20 lg:border-none transition-all duration-200 select-none touch-manipulation"
      >
        {/* 1. Home */}
        <div className="relative group w-full min-w-0 flex justify-center">
          <button
            onClick={() => setActiveTab('home')}
            aria-label="Home"
            aria-current={activeTab === 'home' && !isQrSheetOpen ? 'page' : undefined}
            className={`w-full max-w-[56px] min-w-0 min-h-[46px] lg:min-w-0 lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl sm:rounded-full lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'home' && !isQrSheetOpen
                ? 'bg-white text-[#6D5CF2] shadow-[0_4px_12px_rgba(40,30,120,0.25)] font-bold'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
          >
            <Home className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold tracking-tight truncate max-w-full">Home</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50">
            <span>Home</span>
          </span>
        </div>

        {/* 2. Services & Events */}
        <div className="relative group w-full min-w-0 flex justify-center">
          <button
            onClick={() => setActiveTab('events')}
            aria-label="Events"
            aria-current={activeTab === 'events' ? 'page' : undefined}
            className={`w-full max-w-[56px] min-h-[46px] lg:min-w-0 lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl sm:rounded-full lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'events'
                ? 'bg-white text-[#6D5CF2] shadow-[0_4px_12px_rgba(40,30,120,0.25)] font-bold'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
          >
            <Calendar className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold tracking-tight">Events</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50">
            <span>Events</span>
          </span>
        </div>

        {/* 3. Giving */}
        <div className="relative group w-full min-w-0 flex justify-center">
          <button
            onClick={() => setActiveTab('give')}
            aria-label="Give"
            aria-current={activeTab === 'give' ? 'page' : undefined}
            className={`w-full max-w-[56px] min-h-[46px] lg:min-w-0 lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl sm:rounded-full lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'give'
                ? 'bg-white text-[#6D5CF2] shadow-[0_4px_12px_rgba(40,30,120,0.25)] font-bold'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
          >
            <Heart className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold tracking-tight">Give</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50">
            <span>Give</span>
          </span>
        </div>

        {/* 4. Scanner & Pass */}
        <div className="relative group w-full min-w-0 flex justify-center">
          <button
            onClick={() => setIsQrSheetOpen(true)}
            aria-label="Scan & Pass"
            className="w-full max-w-[56px] min-h-[46px] lg:min-w-0 lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl sm:rounded-full lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 text-white/80 hover:text-white hover:bg-white/15 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95"
          >
            <QrCode className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold tracking-tight">Scan</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50">
            <span>Scan & Pass</span>
          </span>
        </div>

        {/* 5. Me (Digital Member Card & Profile) */}
        <div className="relative group w-full min-w-0 flex justify-center">
          <button
            onClick={() => setActiveTab('me')}
            aria-label="Me"
            aria-current={activeTab === 'me' ? 'page' : undefined}
            className={`w-full max-w-[56px] min-h-[46px] lg:min-w-0 lg:w-11 lg:h-11 px-1 py-1 lg:px-0 rounded-xl sm:rounded-full lg:rounded-[14px] flex flex-col lg:flex-row items-center justify-center gap-0.5 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'me'
                ? 'bg-white text-[#6D5CF2] shadow-[0_4px_12px_rgba(40,30,120,0.25)] font-bold'
                : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
          >
            <User className="w-4.5 h-4.5 sm:w-5 sm:h-5 shrink-0" />
            <span className="lg:hidden text-[10px] leading-tight font-semibold tracking-tight">Me</span>
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50">
            <span>Me</span>
          </span>
        </div>
      </aside>

      {/* Main Member Content Area */}
      <div className="flex-1 min-w-0 w-full">
        <div className="w-full space-y-4 sm:space-y-6">
          <div className="min-h-[500px]">
            {activeTab === 'home' && renderHomeContent()}
            {activeTab === 'events' && renderEventsContent()}
            {activeTab === 'give' && renderGiveContent()}
            {activeTab === 'me' && renderMeContent()}
          </div>
        </div>
      </div>

      <MemberQrScannerModal
        isOpen={isQrSheetOpen}
        onClose={() => {
          setIsQrSheetOpen(false);
          setQrInitialContext(undefined);
        }}
        currentUserMember={matchedMember}
        initialFellowshipContext={qrInitialContext}
      />

      <MemberProfileEditorModal
        isOpen={isProfileEditorOpen}
        onClose={() => setIsProfileEditorOpen(false)}
        member={matchedMember}
        fallbackName={currentUser?.name}
        fallbackEmail={currentUser?.email}
        fallbackPhone={currentUser?.phone}
        fallbackPhotoUrl={memberPhotoUrl}
      />
    </main>
  );
};
