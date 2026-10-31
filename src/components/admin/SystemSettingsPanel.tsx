import React, { useState } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { SystemSettings, ChurchGroup, ChurchGroupCategory, Person } from '../../types/ekklesphere';
import {
  Building2,
  Radio,
  HeartHandshake,
  ShieldCheck,
  Send,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sliders,
  MapPin,
  Clock,
  Bell,
  Smartphone,
  CreditCard,
  FileText,
  HelpCircle,
  Sparkles,
  X,
  Users,
  Plus,
  Search,
  Edit3,
  Trash2,
  Check,
  Phone,
  Mail,
  Calendar,
  Filter,
  Eye,
  UserCheck,
  ChevronRight,
  ExternalLink,
  Layers,
  MessageSquare,
  Navigation,
  Crosshair,
} from 'lucide-react';

interface SystemSettingsPanelProps {
  onClose?: () => void;
  isModal?: boolean;
}

export const SystemSettingsPanel: React.FC<SystemSettingsPanelProps> = ({ onClose, isModal }) => {
  const {
    currentUser,
    systemSettings,
    updateSystemSettings,
    resetSystemSettings,
    setChurchPremiseLocation,
    clearChurchPremiseLocation,
    showToast,
    auditLogs,
    churchGroups,
    addChurchGroup,
    updateChurchGroup,
    deleteChurchGroup,
    toggleChurchGroupStatus,
    getGroupMembers,
    members,
    pushPermissionStatus,
    pushSubscribersCount,
    requestPushPermission,
    sendTestPushNotification,
  } = useEkklesphere();

  const isSettingsAdmin =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'creator';

  const [activeTab, setActiveTab] = useState<'general' | 'groups' | 'proximity' | 'pastoral' | 'privacy' | 'gateways'>('general');
  const [formData, setFormData] = useState<SystemSettings>({ ...systemSettings });
  const [hasChanges, setHasChanges] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>('Just now');
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [gpsCaptureError, setGpsCaptureError] = useState<string | null>(null);
  const [latInput, setLatInput] = useState<string>(
    systemSettings.campusLatitude != null ? String(systemSettings.campusLatitude) : ''
  );
  const [lngInput, setLngInput] = useState<string>(
    systemSettings.campusLongitude != null ? String(systemSettings.campusLongitude) : ''
  );
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);
  const [sharedMapLink, setSharedMapLink] = useState('');
  const [isResolvingMapLink, setIsResolvingMapLink] = useState(false);

  React.useEffect(() => {
    if (!hasChanges) {
      setFormData({ ...systemSettings });
      setLatInput(systemSettings.campusLatitude != null ? String(systemSettings.campusLatitude) : '');
      setLngInput(systemSettings.campusLongitude != null ? String(systemSettings.campusLongitude) : '');
    }
  }, [
    systemSettings.campusLatitude,
    systemSettings.campusLongitude,
    systemSettings.campusName,
    systemSettings.churchName,
    systemSettings.innerGeofenceMeters,
    systemSettings.outerGeofenceMeters,
    hasChanges,
  ]);

  // Groups Management Local States
  const [groupFilterCategory, setGroupFilterCategory] = useState<'all' | 'ministry' | 'fellowship' | 'cell_group'>('all');
  const [groupFilterStatus, setGroupFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [viewingMembersGroup, setViewingMembersGroup] = useState<ChurchGroup | null>(null);

  // Group Form State
  const [groupName, setGroupName] = useState('');
  const [groupCategory, setGroupCategory] = useState<ChurchGroupCategory>('cell_group');
  const [groupLeader, setGroupLeader] = useState('');
  const [groupLeaderPhone, setGroupLeaderPhone] = useState('');
  const [groupLeaderEmail, setGroupLeaderEmail] = useState('');
  const [groupAssistant, setGroupAssistant] = useState('');
  const [groupDay, setGroupDay] = useState('Wednesdays');
  const [groupTime, setGroupTime] = useState('18:30 - 19:45');
  const [groupLocation, setGroupLocation] = useState('');
  const [groupDemographic, setGroupDemographic] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupActive, setGroupActive] = useState(true);
  const [groupErrors, setGroupErrors] = useState<Record<string, string>>({});

  const openAddGroupModal = (category: ChurchGroupCategory = 'cell_group') => {
    setEditingGroupId(null);
    setGroupName('');
    setGroupCategory(category);
    setGroupLeader('');
    setGroupLeaderPhone('+233 ');
    setGroupLeaderEmail('');
    setGroupAssistant('');
    setGroupDay(category === 'cell_group' ? 'Wednesdays' : category === 'ministry' ? 'Saturdays' : 'Monthly 2nd Saturday');
    setGroupTime(category === 'cell_group' ? '18:30 - 19:45' : '16:00 - 17:30');
    setGroupLocation('');
    setGroupDemographic('');
    setGroupDescription('');
    setGroupActive(true);
    setGroupErrors({});
    setIsGroupModalOpen(true);
  };

  const openEditGroupModal = (group: ChurchGroup) => {
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setGroupCategory(group.category);
    setGroupLeader(group.leaderName);
    setGroupLeaderPhone(group.leaderPhone || '');
    setGroupLeaderEmail(group.leaderEmail || '');
    setGroupAssistant(group.assistantLeader || '');
    setGroupDay(group.meetingDay || '');
    setGroupTime(group.meetingTime || '');
    setGroupLocation(group.meetingLocation || '');
    setGroupDemographic(group.targetDemographic || '');
    setGroupDescription(group.description);
    setGroupActive(group.active);
    setGroupErrors({});
    setIsGroupModalOpen(true);
  };

  const handleSaveGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!groupName.trim()) errors.name = 'Group name is required';
    if (!groupLeader.trim()) errors.leader = 'Primary leader name is required';

    if (Object.keys(errors).length > 0) {
      setGroupErrors(errors);
      return;
    }

    if (editingGroupId) {
      updateChurchGroup(editingGroupId, {
        name: groupName.trim(),
        category: groupCategory,
        leaderName: groupLeader.trim(),
        leaderPhone: groupLeaderPhone.trim() || undefined,
        leaderEmail: groupLeaderEmail.trim() || undefined,
        assistantLeader: groupAssistant.trim() || undefined,
        meetingDay: groupDay.trim() || undefined,
        meetingTime: groupTime.trim() || undefined,
        meetingLocation: groupLocation.trim() || undefined,
        targetDemographic: groupDemographic.trim() || undefined,
        description: groupDescription.trim(),
        active: groupActive,
      });
    } else {
      addChurchGroup({
        name: groupName.trim(),
        category: groupCategory,
        leaderName: groupLeader.trim(),
        leaderPhone: groupLeaderPhone.trim() || undefined,
        leaderEmail: groupLeaderEmail.trim() || undefined,
        assistantLeader: groupAssistant.trim() || undefined,
        meetingDay: groupDay.trim() || undefined,
        meetingTime: groupTime.trim() || undefined,
        meetingLocation: groupLocation.trim() || undefined,
        targetDemographic: groupDemographic.trim() || undefined,
        description: groupDescription.trim(),
        active: groupActive,
      });
    }

    setIsGroupModalOpen(false);
  };

  const handleChange = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value };
      setHasChanges(true);
      return next;
    });
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isSettingsAdmin) {
      showToast('Access Denied: Only administrators can modify church geofence parameters.');
      return;
    }
    let updatedPayload: SystemSettings = { ...formData };

    if (latInput.trim() !== '' && lngInput.trim() !== '') {
      const parsedLat = Number(latInput);
      const parsedLng = Number(lngInput);
      if (
        Number.isNaN(parsedLat) ||
        Number.isNaN(parsedLng) ||
        parsedLat < -90 ||
        parsedLat > 90 ||
        parsedLng < -180 ||
        parsedLng > 180
      ) {
        setGpsCaptureError('Enter valid Latitude (-90 to 90) and Longitude (-180 to 180).');
        showToast('Invalid GPS coordinates entered');
        return;
      }
      updatedPayload = {
        ...updatedPayload,
        campusLatitude: parsedLat,
        campusLongitude: parsedLng,
      };
      await setChurchPremiseLocation({
        lat: parsedLat,
        lng: parsedLng,
        accuracyM: updatedPayload.campusLocationAccuracyM ?? null,
        churchName: updatedPayload.churchName,
        campusName: updatedPayload.campusName,
        campusAddress: updatedPayload.campusAddress,
        innerGeofenceMeters: updatedPayload.innerGeofenceMeters,
        outerGeofenceMeters: updatedPayload.outerGeofenceMeters,
        dwellTimeMinutes: updatedPayload.dwellTimeMinutes,
      });
    }

    updateSystemSettings(updatedPayload);
    setFormData(updatedPayload);
    setHasChanges(false);
    setGpsCaptureError(null);
    setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  };

  const handleCaptureCurrentPremiseGps = () => {
    if (!navigator.geolocation) {
      setGpsCaptureError('Browser geolocation is not available on this device.');
      return;
    }
    setIsCapturingGps(true);
    setGpsCaptureError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const accuracyM = Math.round(pos.coords.accuracy * 10) / 10;

        setLatInput(String(lat));
        setLngInput(String(lng));
        const nextForm: SystemSettings = {
          ...formData,
          campusLatitude: lat,
          campusLongitude: lng,
          campusLocationAccuracyM: accuracyM,
          campusLocationUpdatedAt: new Date().toISOString(),
        };
        setFormData(nextForm);
        await setChurchPremiseLocation({
          lat,
          lng,
          accuracyM,
          churchName: nextForm.churchName,
          campusName: nextForm.campusName,
          campusAddress: nextForm.campusAddress,
          innerGeofenceMeters: nextForm.innerGeofenceMeters,
          outerGeofenceMeters: nextForm.outerGeofenceMeters,
          dwellTimeMinutes: nextForm.dwellTimeMinutes,
        });
        setHasChanges(false);
        setIsCapturingGps(false);
      },
      (err) => {
        setIsCapturingGps(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsCaptureError('Location permission denied. Allow location access in your browser or enter coordinates manually below.');
        } else {
          setGpsCaptureError(`Could not acquire GPS fix: ${err.message}`);
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleSaveManualCoordinates = async () => {
    const parsedLat = Number(latInput);
    const parsedLng = Number(lngInput);
    if (
      latInput.trim() === '' ||
      lngInput.trim() === '' ||
      Number.isNaN(parsedLat) ||
      Number.isNaN(parsedLng) ||
      parsedLat < -90 ||
      parsedLat > 90 ||
      parsedLng < -180 ||
      parsedLng > 180
    ) {
      setGpsCaptureError('Please enter valid Latitude (-90 to 90) and Longitude (-180 to 180).');
      return;
    }
    setGpsCaptureError(null);
    const ok = await setChurchPremiseLocation({
      lat: parsedLat,
      lng: parsedLng,
      accuracyM: null,
      churchName: formData.churchName,
      campusName: formData.campusName,
      campusAddress: formData.campusAddress,
      innerGeofenceMeters: formData.innerGeofenceMeters,
      outerGeofenceMeters: formData.outerGeofenceMeters,
      dwellTimeMinutes: formData.dwellTimeMinutes,
    });
    if (ok) {
      setFormData((prev) => ({
        ...prev,
        campusLatitude: parsedLat,
        campusLongitude: parsedLng,
        campusLocationAccuracyM: null,
        campusLocationUpdatedAt: new Date().toISOString(),
      }));
      setHasChanges(false);
    }
  };

  const handleResolveSharedMapLink = async () => {
    if (!sharedMapLink.trim()) {
      setGpsCaptureError('Paste a shared Google Maps or WhatsApp location link first.');
      return;
    }
    setIsResolvingMapLink(true);
    setGpsCaptureError(null);
    try {
      const res = await fetch('/api/campus-premise/resolve-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: sharedMapLink.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setGpsCaptureError(data.message || 'Could not extract coordinates from that shared link.');
        return;
      }

      const updatedCampusName =
        data.placeName && (!formData.campusName || formData.campusName === 'Main Church Premise')
          ? data.placeName
          : formData.campusName;

      setLatInput(String(data.lat));
      setLngInput(String(data.lng));

      const ok = await setChurchPremiseLocation({
        lat: data.lat,
        lng: data.lng,
        accuracyM: null,
        churchName: formData.churchName,
        campusName: updatedCampusName,
        campusAddress: formData.campusAddress,
        innerGeofenceMeters: formData.innerGeofenceMeters,
        outerGeofenceMeters: formData.outerGeofenceMeters,
        dwellTimeMinutes: formData.dwellTimeMinutes,
      });

      if (ok) {
        setFormData((prev) => ({
          ...prev,
          campusName: updatedCampusName,
          campusLatitude: data.lat,
          campusLongitude: data.lng,
          campusLocationAccuracyM: null,
          campusLocationUpdatedAt: new Date().toISOString(),
        }));
        setSharedMapLink('');
        setHasChanges(false);
      }
    } catch (err: unknown) {
      setGpsCaptureError(err instanceof Error ? err.message : 'Failed to resolve shared Google Maps link.');
    } finally {
      setIsResolvingMapLink(false);
    }
  };

  const handleClearPremise = async () => {
    await clearChurchPremiseLocation();
    setLatInput('');
    setLngInput('');
    setFormData((prev) => ({
      ...prev,
      campusLatitude: null,
      campusLongitude: null,
      campusLocationAccuracyM: null,
      campusLocationUpdatedAt: null,
    }));
  };

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    resetSystemSettings();
    setConfirmReset(false);
    setLatInput('');
    setLngInput('');
    setHasChanges(false);
  };

  const renderPremiseGpsSetupCard = () => {
    const isConfigured = formData.campusLatitude != null && formData.campusLongitude != null;
    return (
      <div
        className={`rounded-2xl p-4 sm:p-5 border-2 transition-all space-y-4 ${
          isConfigured
            ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-400/50 dark:border-emerald-700/60'
            : 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-400/60 dark:border-amber-700/60'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                <Crosshair className="w-4 h-4 text-[#6D5CF2]" />
                <span>Church Premise GPS Coordinates (Live Geofence Anchor)</span>
              </span>
              {isConfigured ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Live Premise Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Not Set Yet — Required for Live Check-in
                </span>
              )}
            </div>
            <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1">
              Stand on your church premise and tap <b>Use My Current GPS Location</b>, or enter exact Latitude &amp; Longitude below. All member devices immediately verify attendance against this point.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleCaptureCurrentPremiseGps}
              disabled={isCapturingGps}
              className="px-4 py-2.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold shadow-sm flex items-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-60"
            >
              <Navigation className={`w-3.5 h-3.5 ${isCapturingGps ? 'animate-spin' : ''}`} />
              <span>{isCapturingGps ? 'Capturing Live GPS...' : 'Use My Current GPS Location'}</span>
            </button>
            {isConfigured && (
              <button
                type="button"
                onClick={handleClearPremise}
                className="px-3 py-2.5 rounded-xl bg-white dark:bg-[#14142E] hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 text-xs font-bold transition-all cursor-pointer"
              >
                Clear Pin
              </button>
            )}
          </div>
        </div>

        {isConfigured && (
          <div className="p-3 rounded-xl bg-white dark:bg-[#14142E] border border-emerald-200 dark:border-emerald-900/50 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">{formData.campusName || 'Church Premise'}:</span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                {formData.campusLatitude?.toFixed(6)}, {formData.campusLongitude?.toFixed(6)}
              </span>
              {formData.campusLocationAccuracyM != null && (
                <span className="text-[11px] font-mono text-[#666A86] dark:text-[#A9ACC8]">
                  (±{formData.campusLocationAccuracyM}m GPS accuracy)
                </span>
              )}
            </div>
            <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
              Active Perimeter: <b className="text-[#1D1B3A] dark:text-white">{formData.innerGeofenceMeters}m</b>
              {formData.campusLocationUpdatedAt
                ? ` · Updated ${new Date(formData.campusLocationUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : ''}
            </span>
          </div>
        )}

        {gpsCaptureError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{gpsCaptureError}</span>
          </div>
        )}

        {/* Paste Shared Google Maps / WhatsApp Location Link */}
        <div className="pt-1">
          <label className="block text-[11px] font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
            Paste Shared Google Maps or WhatsApp Location Link
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="e.g. https://maps.app.goo.gl/... or https://maps.google.com/?q=5.6037,-0.1870"
              value={sharedMapLink}
              onChange={(e) => setSharedMapLink(e.target.value)}
              className="flex-1 px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
            />
            <button
              type="button"
              onClick={handleResolveSharedMapLink}
              disabled={isResolvingMapLink}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-60"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{isResolvingMapLink ? 'Resolving...' : 'Extract & Pin Link'}</span>
            </button>
          </div>
        </div>

        {/* Manual Latitude / Longitude Entry */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-1">
          <div>
            <label className="block text-[11px] font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
              Premise Latitude (-90 to 90)
            </label>
            <input
              type="number"
              step="any"
              placeholder="e.g. 5.603717"
              value={latInput}
              onChange={(e) => {
                setLatInput(e.target.value);
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
              Premise Longitude (-180 to 180)
            </label>
            <input
              type="number"
              step="any"
              placeholder="e.g. -0.186964"
              value={lngInput}
              onChange={(e) => {
                setLngInput(e.target.value);
                setHasChanges(true);
              }}
              className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
            />
          </div>
          <button
            type="button"
            onClick={handleSaveManualCoordinates}
            className="px-4 py-2 rounded-xl bg-[#1D1B3A] dark:bg-[#2A2A55] hover:bg-[#2b2855] text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 h-[34px]"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Pin Coordinates</span>
          </button>
        </div>
      </div>
    );
  };

  const handleTestSms = () => {
    showToast(`Test SMS dispatched via ${formData.smsGatewayProvider} using Sender ID: "${formData.smsSenderId}"`);
  };

  const handleExportAudit = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(auditLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `ekklesphere-audit-log-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Audit log JSON exported successfully');
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
              System & Campus Parameters
            </span>
            <span className="text-[#666A86] dark:text-[#A9ACC8]">·</span>
            <span className="text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
              Ghana Act 843 Compliant
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
            System Settings
          </h2>
          <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1 max-w-xl">
            Configure church profile, PostGIS geofence radii, BLE signal thresholds, pastoral care alert rules, and communications gateways.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          {hasChanges && (
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-xl flex items-center gap-1 border border-amber-500/20">
              <AlertCircle className="w-3.5 h-3.5" />
              Unsaved changes
            </span>
          )}
          <button
            type="button"
            onClick={handleReset}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
              confirmReset
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-[#F6F7FC] dark:bg-[#14142E] hover:bg-slate-200 dark:hover:bg-white/10 text-[#666A86] dark:text-[#A9ACC8] border-[#E9EBF5] dark:border-[#2D2D55]'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{confirmReset ? 'Click Again to Confirm Reset' : 'Reset Defaults'}</span>
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
              hasChanges
                ? 'bg-[#6D5CF2] hover:bg-[#5b4be0] text-white scale-102'
                : 'bg-[#6D5CF2]/90 hover:bg-[#6D5CF2] text-white'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Settings</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Settings"
              className="p-2 rounded-xl text-[#666A86] hover:text-[#1D1B3A] dark:text-[#A9ACC8] dark:hover:text-white bg-[#F6F7FC] dark:bg-[#14142E] hover:bg-slate-200 dark:hover:bg-white/10 border border-[#E9EBF5] dark:border-[#2D2D55] transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'general'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Campus Profile</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('groups')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'groups'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Ministries & Cell Groups</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'groups'
                ? 'bg-white/20 text-white'
                : 'bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF]'
            }`}
          >
            {churchGroups.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('proximity')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'proximity'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Proximity & Geofencing</span>
        </button>

        <button
          onClick={() => setActiveTab('pastoral')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'pastoral'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <HeartHandshake className="w-3.5 h-3.5" />
          <span>Pastoral Care Rules</span>
        </button>

        <button
          onClick={() => setActiveTab('privacy')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'privacy'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Privacy & Governance</span>
        </button>

        <button
          onClick={() => setActiveTab('gateways')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'gateways'
              ? 'bg-[#6D5CF2] text-white shadow-xs'
              : 'bg-white dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA] border border-[#E9EBF5] dark:border-[#2D2D55]'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>SMS & Paystack Gateways</span>
        </button>
      </div>

      {/* Main Form Content */}
      <form onSubmit={handleSave} className="space-y-5">
        {/* TAB 1: General & Campus Profile */}
        {activeTab === 'general' && (
          <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs space-y-5">
            {renderPremiseGpsSetupCard()}

            <div>
              <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2 mb-1">
                <Building2 className="w-4 h-4 text-[#6D5CF2]" />
                <span>Church & Campus Identity</span>
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                These details appear across the Member mobile app, Usher check-in tool, and pastoral broadcast notifications.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Church Organization Name
                </label>
                <input
                  type="text"
                  value={formData.churchName}
                  onChange={(e) => handleChange('churchName', e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Campus Name
                </label>
                <input
                  type="text"
                  value={formData.campusName}
                  onChange={(e) => handleChange('campusName', e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  <span>Physical Sanctuary Address</span>
                </label>
                <input
                  type="text"
                  value={formData.campusAddress}
                  onChange={(e) => handleChange('campusAddress', e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Senior Pastor / Head Minister
                </label>
                <input
                  type="text"
                  value={formData.seniorPastor}
                  onChange={(e) => handleChange('seniorPastor', e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Contact Phone (E.164)
                </label>
                <input
                  type="text"
                  value={formData.contactPhone}
                  onChange={(e) => handleChange('contactPhone', e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Administrative Email
                </label>
                <input
                  type="email"
                  value={formData.contactEmail}
                  onChange={(e) => handleChange('contactEmail', e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Timezone
                  </label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => handleChange('timezone', e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  >
                    <option value="Africa/Accra (GMT)">Africa/Accra (GMT)</option>
                    <option value="Africa/Lagos (WAT)">Africa/Lagos (WAT)</option>
                    <option value="Africa/Nairobi (EAT)">Africa/Nairobi (EAT)</option>
                    <option value="Europe/London (BST/GMT)">Europe/London</option>
                    <option value="America/New_York (EST)">America/New_York (EST)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Currency
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) => handleChange('currency', e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  >
                    <option value="GHS (Ghana Cedi)">GHS (Ghana Cedi)</option>
                    <option value="USD ($)">USD ($)</option>
                    <option value="GBP (£)">GBP (£)</option>
                    <option value="EUR (€)">EUR (€)</option>
                    <option value="NGN (₦)">NGN (₦)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Ministries, Fellowships & Cell Groups Management */}
        {activeTab === 'groups' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Top Overview & Action Header Card */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#6D5CF2] animate-pulse" />
                    <span className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8]">
                      Congregational Structure & Leadership
                    </span>
                    <span className="text-[#666A86] dark:text-[#A9ACC8]">·</span>
                    <span className="text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
                      {formData.campusName || systemSettings.campusName}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#6D5CF2]" />
                    <span>Ministries, Fellowships & Cell Groups</span>
                  </h3>
                  <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1 max-w-2xl leading-relaxed">
                    Administrate church functional departments, demographic fellowships, and neighborhood home cell small groups. Assign pastoral leaders, set meeting times, configure venues, and track member allocations.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <button
                    type="button"
                    onClick={() => openAddGroupModal('cell_group')}
                    className="bg-[#6D5CF2] hover:bg-[#5b4be0] text-white rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add New Group</span>
                  </button>
                </div>
              </div>

              {/* Group Metric KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-5">
                {/* 1. Total Groups */}
                <div
                  onClick={() => setGroupFilterCategory('all')}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer ${
                    groupFilterCategory === 'all'
                      ? 'bg-[#EFEDFF]/60 dark:bg-[#2A2A55]/40 border-[#6D5CF2]'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8]">
                    <span className="font-semibold">Total Groups</span>
                    <Layers className="w-4 h-4 text-[#6D5CF2]" />
                  </div>
                  <div className="text-2xl font-extrabold text-[#1D1B3A] dark:text-[#F2F2FA] mt-1">
                    {churchGroups.length}
                  </div>
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-1 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{churchGroups.filter((g) => g.active).length} Active Across Campus</span>
                  </div>
                </div>

                {/* 2. Ministries */}
                <div
                  onClick={() => setGroupFilterCategory('ministry')}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer ${
                    groupFilterCategory === 'ministry'
                      ? 'bg-[#EFEDFF]/60 dark:bg-[#2A2A55]/40 border-[#6D5CF2]'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8]">
                    <span className="font-semibold">Ministries</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF]">
                      Department
                    </span>
                  </div>
                  <div className="text-2xl font-extrabold text-[#6D5CF2] dark:text-[#8C7DFF] mt-1">
                    {churchGroups.filter((g) => g.category === 'ministry').length}
                  </div>
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Choir, Ushers, Media, Children, Prayer
                  </div>
                </div>

                {/* 3. Fellowships */}
                <div
                  onClick={() => setGroupFilterCategory('fellowship')}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer ${
                    groupFilterCategory === 'fellowship'
                      ? 'bg-sky-50 dark:bg-sky-950/30 border-sky-400'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] hover:border-sky-400/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8]">
                    <span className="font-semibold">Fellowships</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300">
                      Demographic
                    </span>
                  </div>
                  <div className="text-2xl font-extrabold text-sky-600 dark:text-sky-400 mt-1">
                    {churchGroups.filter((g) => g.category === 'fellowship').length}
                  </div>
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Men, Women, Youth, Teens, Couples
                  </div>
                </div>

                {/* 4. Cell Groups */}
                <div
                  onClick={() => setGroupFilterCategory('cell_group')}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer ${
                    groupFilterCategory === 'cell_group'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] hover:border-emerald-500/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-[#666A86] dark:text-[#A9ACC8]">
                    <span className="font-semibold">Cell Groups</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                      Home Cells
                    </span>
                  </div>
                  <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                    {churchGroups.filter((g) => g.category === 'cell_group').length}
                  </div>
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Neighborhood & area fellowships
                  </div>
                </div>
              </div>
            </div>

            {/* Filter, Search & Quick Category Selector Toolbar */}
            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-4 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setGroupFilterCategory('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    groupFilterCategory === 'all'
                      ? 'bg-[#6D5CF2] text-white shadow-xs'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
                  }`}
                >
                  All ({churchGroups.length})
                </button>
                <button
                  type="button"
                  onClick={() => setGroupFilterCategory('ministry')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    groupFilterCategory === 'ministry'
                      ? 'bg-[#6D5CF2] text-white shadow-xs'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
                  }`}
                >
                  Ministries ({churchGroups.filter((g) => g.category === 'ministry').length})
                </button>
                <button
                  type="button"
                  onClick={() => setGroupFilterCategory('fellowship')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    groupFilterCategory === 'fellowship'
                      ? 'bg-[#6D5CF2] text-white shadow-xs'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
                  }`}
                >
                  Fellowships ({churchGroups.filter((g) => g.category === 'fellowship').length})
                </button>
                <button
                  type="button"
                  onClick={() => setGroupFilterCategory('cell_group')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    groupFilterCategory === 'cell_group'
                      ? 'bg-[#6D5CF2] text-white shadow-xs'
                      : 'bg-[#F6F7FC] dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-[#F2F2FA]'
                  }`}
                >
                  Cell Groups ({churchGroups.filter((g) => g.category === 'cell_group').length})
                </button>
              </div>

              {/* Search & Status Filter */}
              <div className="flex items-center gap-2 flex-1 md:flex-initial">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#666A86] dark:text-[#A9ACC8]" />
                  <input
                    type="text"
                    placeholder="Search by name, leader, location..."
                    value={groupSearchQuery}
                    onChange={(e) => setGroupSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] placeholder-[#666A86] dark:placeholder-[#A9ACC8] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                  {groupSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setGroupSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <select
                  value={groupFilterStatus}
                  onChange={(e) => setGroupFilterStatus(e.target.value as any)}
                  className="px-2.5 py-1.5 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] font-semibold"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>
            </div>

            {/* Groups Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {churchGroups
                .filter((group) => {
                  if (groupFilterCategory !== 'all' && group.category !== groupFilterCategory) return false;
                  if (groupFilterStatus === 'active' && !group.active) return false;
                  if (groupFilterStatus === 'inactive' && group.active) return false;
                  if (!groupSearchQuery.trim()) return true;
                  const q = groupSearchQuery.toLowerCase();
                  return (
                    group.name.toLowerCase().includes(q) ||
                    group.leaderName.toLowerCase().includes(q) ||
                    (group.meetingLocation && group.meetingLocation.toLowerCase().includes(q)) ||
                    (group.meetingDay && group.meetingDay.toLowerCase().includes(q)) ||
                    (group.description && group.description.toLowerCase().includes(q))
                  );
                })
                .map((group) => {
                  const enrolledMembers = getGroupMembers(group.name);
                  const isMinistry = group.category === 'ministry';
                  const isFellowship = group.category === 'fellowship';
                  const isCell = group.category === 'cell_group';

                  return (
                    <div
                      key={group.id}
                      className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs flex flex-col justify-between hover:shadow-md transition-all group"
                    >
                      <div>
                        {/* Top Badges & Status Toggle */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                              isMinistry
                                ? 'bg-[#EFEDFF] text-[#6D5CF2] dark:bg-[#2A2A55] dark:text-[#8C7DFF]'
                                : isFellowship
                                ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            }`}
                          >
                            {isMinistry ? 'Ministry' : isFellowship ? 'Fellowship' : 'Cell Group'}
                          </span>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleChurchGroupStatus(group.id)}
                              className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full transition-all cursor-pointer ${
                                group.active
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                                  : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-white/20'
                              }`}
                              title={group.active ? 'Click to deactivate' : 'Click to activate'}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  group.active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                                }`}
                              />
                              <span>{group.active ? 'Active' : 'Inactive'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Title & Description */}
                        <h4 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] leading-tight mb-1.5">
                          {group.name}
                        </h4>
                        <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] line-clamp-2 leading-relaxed mb-3.5">
                          {group.description}
                        </p>

                        {/* Leader & Assistant */}
                        <div className="bg-[#F6F7FC] dark:bg-[#14142E] rounded-xl p-3 border border-[#E9EBF5] dark:border-[#2D2D55] mb-3 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#666A86] dark:text-[#A9ACC8] font-medium">Primary Leader</span>
                            <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] font-bold text-[9px] flex items-center justify-center shrink-0">
                                {group.leaderName
                                  .split(' ')
                                  .map((n) => n[0])
                                  .slice(0, 2)
                                  .join('')}
                              </span>
                              <span>{group.leaderName}</span>
                            </span>
                          </div>

                          {group.leaderPhone && (
                            <div className="flex items-center justify-between text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3 text-[#6D5CF2]" />
                                <span>Phone</span>
                              </span>
                              <a
                                href={`tel:${group.leaderPhone.replace(/\s+/g, '')}`}
                                className="font-mono text-[#6D5CF2] dark:text-[#8C7DFF] hover:underline"
                              >
                                {group.leaderPhone}
                              </a>
                            </div>
                          )}

                          {group.assistantLeader && (
                            <div className="flex items-center justify-between text-[11px] text-[#666A86] dark:text-[#A9ACC8] pt-1 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
                              <span>Assistant / Co-Leader</span>
                              <span className="font-medium text-[#1D1B3A] dark:text-[#F2F2FA]">
                                {group.assistantLeader}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Schedule & Venue Information */}
                        <div className="space-y-1.5 text-xs text-[#666A86] dark:text-[#A9ACC8] mb-4">
                          {(group.meetingDay || group.meetingTime) && (
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-[#6D5CF2] shrink-0" />
                              <span className="truncate">
                                {group.meetingDay} {group.meetingTime ? `· ${group.meetingTime}` : ''}
                              </span>
                            </div>
                          )}
                          {group.meetingLocation && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              <span className="truncate">{group.meetingLocation}</span>
                            </div>
                          )}
                          {group.targetDemographic && (
                            <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] italic">
                              Focus: {group.targetDemographic}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Footer with Members Count & Actions */}
                      <div className="pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setViewingMembersGroup(group)}
                          className="text-xs font-bold text-[#6D5CF2] dark:text-[#8C7DFF] hover:underline flex items-center gap-1"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>{enrolledMembers.length} enrolled</span>
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditGroupModal(group)}
                            className="p-1.5 rounded-lg text-[#666A86] dark:text-[#A9ACC8] hover:text-[#6D5CF2] hover:bg-[#EFEDFF] dark:hover:bg-[#2A2A55] transition-colors"
                            title="Edit Group"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirmDeleteGroupId === group.id) {
                                deleteChurchGroup(group.id);
                                setConfirmDeleteGroupId(null);
                              } else {
                                setConfirmDeleteGroupId(group.id);
                                setTimeout(() => setConfirmDeleteGroupId(null), 3500);
                              }
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              confirmDeleteGroupId === group.id
                                ? 'bg-rose-600 text-white'
                                : 'text-[#666A86] dark:text-[#A9ACC8] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                            }`}
                            title={confirmDeleteGroupId === group.id ? 'Click again to confirm delete' : 'Delete Group'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Empty Search State */}
            {churchGroups.filter((group) => {
              if (groupFilterCategory !== 'all' && group.category !== groupFilterCategory) return false;
              if (groupFilterStatus === 'active' && !group.active) return false;
              if (groupFilterStatus === 'inactive' && group.active) return false;
              if (!groupSearchQuery.trim()) return true;
              const q = groupSearchQuery.toLowerCase();
              return (
                group.name.toLowerCase().includes(q) ||
                group.leaderName.toLowerCase().includes(q) ||
                (group.meetingLocation && group.meetingLocation.toLowerCase().includes(q))
              );
            }).length === 0 && (
              <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl p-10 text-center border border-[#E9EBF5] dark:border-[#2D2D55]">
                <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">No matching groups found</h4>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] mt-1 max-w-sm mx-auto">
                  Try adjusting your search query or category filters, or click "Add New Group" to create one.
                </p>
                <button
                  type="button"
                  onClick={() => openAddGroupModal('cell_group')}
                  className="mt-4 bg-[#6D5CF2] text-white rounded-xl px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Group</span>
                </button>
              </div>
            )}
          </div>
        )}


        {/* TAB 2: Proximity & Geofencing Automation */}
        {activeTab === 'proximity' && (
          <div className="space-y-5">
            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs space-y-6">
              {renderPremiseGpsSetupCard()}

              <div>
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2 mb-1">
                  <Radio className="w-4 h-4 text-[#6D5CF2]" />
                  <span>Two-Tier Proximity Radar Engine</span>
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Calibrate the outer approach wake-up circle and inner sanctuary dwell perimeter around your configured church premise coordinates.
                </p>
              </div>

              {/* Interactive Visual Radar Simulator Card */}
              <div className="bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl p-4 sm:p-5 border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                  <div>
                    <h4 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      Campus Radar Visualization (Live Geometry)
                    </h4>
                    <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                      Outer Geofence: <strong className="text-[#6D5CF2]">{formData.outerGeofenceMeters}m</strong> · Inner Perimeter: <strong className="text-emerald-500">{formData.innerGeofenceMeters}m</strong> · Dwell Required: <strong className="text-[#1D1B3A] dark:text-white">{formData.dwellTimeMinutes} mins</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      PostGIS GPS Active
                    </span>
                  </div>
                </div>

                {/* SVG Visual Representation */}
                <div className="relative w-full h-44 bg-white dark:bg-[#1A1A38] rounded-xl flex items-center justify-center overflow-hidden border border-[#E9EBF5] dark:border-[#2D2D55]/60">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 bg-[radial-gradient(#6D5CF2_1px,transparent_1px)] [background-size:16px_16px] opacity-15" />
                  
                  {/* Outer Geofence Ring */}
                  <div
                    style={{
                      width: `${Math.min(260, Math.max(140, (formData.outerGeofenceMeters / 1000) * 260))}px`,
                      height: `${Math.min(260, Math.max(140, (formData.outerGeofenceMeters / 1000) * 260))}px`,
                    }}
                    className="rounded-full border-2 border-dashed border-[#6D5CF2]/50 bg-[#6D5CF2]/5 flex items-center justify-center transition-all duration-300 relative group"
                  >
                    <span className="absolute top-1 text-[9px] font-bold text-[#6D5CF2] tracking-wider uppercase">
                      Outer Ring ({formData.outerGeofenceMeters}m Approach)
                    </span>

                    {/* Inner Geofence Ring */}
                    <div
                      style={{
                        width: `${Math.min(130, Math.max(60, (formData.innerGeofenceMeters / 300) * 130))}px`,
                        height: `${Math.min(130, Math.max(60, (formData.innerGeofenceMeters / 300) * 130))}px`,
                      }}
                      className="rounded-full border-2 border-emerald-500/70 bg-emerald-500/15 flex items-center justify-center transition-all duration-300 relative"
                    >
                      <span className="absolute bottom-1 text-[8px] font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        Inner ({formData.innerGeofenceMeters}m)
                      </span>

                      {/* Sanctuary Center Marker */}
                      <div className="w-6 h-6 rounded-full bg-[#6D5CF2] text-white flex items-center justify-center shadow-md animate-pulse">
                        <MapPin className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sliders & Calibration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                    <span>Outer Geofence Radius (Approach Wake-up)</span>
                    <span className="text-[#6D5CF2] font-mono text-xs">{formData.outerGeofenceMeters} meters</span>
                  </div>
                  <input
                    type="range"
                    min="150"
                    max="800"
                    step="50"
                    value={formData.outerGeofenceMeters}
                    onChange={(e) => handleChange('outerGeofenceMeters', parseInt(e.target.value, 10))}
                    className="w-full accent-[#6D5CF2] cursor-pointer"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Wakes device background task when member arrives within this distance of {formData.campusName || systemSettings.campusName}.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                    <span>Inner Perimeter Radius (Sanctuary Grounds)</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono text-xs">{formData.innerGeofenceMeters} meters</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="200"
                    step="10"
                    value={formData.innerGeofenceMeters}
                    onChange={(e) => handleChange('innerGeofenceMeters', parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Sanctuary gates perimeter where dwell timer begins counting down.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                    <span>Mandatory Dwell Verification Time</span>
                    <span className="text-[#1D1B3A] dark:text-[#F2F2FA] font-mono text-xs">{formData.dwellTimeMinutes} minutes</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="1"
                    value={formData.dwellTimeMinutes}
                    onChange={(e) => handleChange('dwellTimeMinutes', parseInt(e.target.value, 10))}
                    className="w-full accent-[#6D5CF2] cursor-pointer"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Member must remain inside perimeter for this duration to confirm attendance.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                    <span>BLE Beacon Sensitivity Threshold</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-mono text-xs">{formData.bleBeaconRssiThreshold} dBm</span>
                  </div>
                  <input
                    type="range"
                    min="-85"
                    max="-50"
                    step="5"
                    value={formData.bleBeaconRssiThreshold}
                    onChange={(e) => handleChange('bleBeaconRssiThreshold', parseInt(e.target.value, 10))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                    Required signal strength from sanctuary door beacon (-70 dBm standard).
                  </p>
                </div>
              </div>

              {/* Service Window Timers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Pre-Service Check-in Window (Minutes Before)
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="90"
                    value={formData.serviceWindowBeforeMinutes}
                    onChange={(e) => handleChange('serviceWindowBeforeMinutes', parseInt(e.target.value, 10) || 45)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    E.g. 45 min allows early arrivals and choir rehearsal check-in.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Post-Service Grace Window (Minutes After)
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="60"
                    value={formData.serviceWindowAfterMinutes}
                    onChange={(e) => handleChange('serviceWindowAfterMinutes', parseInt(e.target.value, 10) || 30)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                  <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Keeps check-in active for delayed arrivals or usher reconciliation.
                  </p>
                </div>
              </div>

              {/* Toggle: Drive-by Protection */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div className="max-w-lg">
                  <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Drive-by Speed & False-Positive Filter
                  </div>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Discards proximity events if the device moves faster than 15 km/h across the perimeter, preventing false check-ins from passing road traffic.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={formData.driveByProtection}
                    onChange={(e) => handleChange('driveByProtection', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6D5CF2]" />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Pastoral Care Rules */}
        {activeTab === 'pastoral' && (
          <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs space-y-6">
            <div>
              <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2 mb-1">
                <HeartHandshake className="w-4 h-4 text-[#6D5CF2]" />
                <span>Automated Pastoral Care & Retention Triggers</span>
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Proactive rules that automatically generate care tasks when members miss consecutive services.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Consecutive Absences Alert Threshold
                </label>
                <select
                  value={formData.absenteeThresholdServices}
                  onChange={(e) => handleChange('absenteeThresholdServices', parseInt(e.target.value, 10))}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                >
                  <option value={2}>2 Consecutive Services (Early Warning · Recommended)</option>
                  <option value={3}>3 Consecutive Services (Critical Inactivity Flag)</option>
                  <option value={4}>4 Consecutive Services</option>
                </select>
                <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                  Once reached, a follow-up assignment is dispatched to the pastoral care queue.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  First-Timer Welcome Follow-up SLA
                </label>
                <select
                  value={formData.firstTimerFollowupHours}
                  onChange={(e) => handleChange('firstTimerFollowupHours', parseInt(e.target.value, 10))}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                >
                  <option value={24}>Within 24 Hours (Best Practice for Visitor Retention)</option>
                  <option value={48}>Within 48 Hours</option>
                  <option value={72}>Within 72 Hours</option>
                </select>
                <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                  Due date assigned to the Welcome Team when a visitor registers at the door.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div>
                  <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Auto-Assign Care Tasks to Cell Group Leaders
                  </div>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Automatically directs absentee follow-ups to assigned home cell, ministry, or youth leaders rather than centralized pastors.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={formData.autoAssignCellLeaders}
                    onChange={(e) => handleChange('autoAssignCellLeaders', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6D5CF2]" />
                </label>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div>
                  <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Push Notification Alerts for Leaders
                  </div>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Pings usher heads and pastoral ministers immediately when an attendance anomaly or critical absentee flag is logged.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={formData.enablePushNotifications}
                    onChange={(e) => handleChange('enablePushNotifications', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6D5CF2]" />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Privacy & Governance */}
        {activeTab === 'privacy' && (
          <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs space-y-6">
            <div>
              <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2 mb-1">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Data Protection & Ghana Act 843 Governance</span>
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Enforces member data rights, explicit consent toggles, and secure audit retention in accordance with Ghana Data Protection Commission standards.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div className="max-w-lg">
                  <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Strict Explicit Consent Requirement
                  </div>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Prohibits automated proximity scanning on members until they affirmatively tap "Agree & Opt In" inside their mobile experience.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={formData.requireExplicitConsent}
                    onChange={(e) => handleChange('requireExplicitConsent', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6D5CF2]" />
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Audit Log & Proximity Signal Retention Period
                </label>
                <select
                  value={formData.auditLogRetentionDays}
                  onChange={(e) => handleChange('auditLogRetentionDays', parseInt(e.target.value, 10))}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                >
                  <option value={30}>30 Days (Privacy-First Minimum)</option>
                  <option value={90}>90 Days (Quarterly Audit Recommended)</option>
                  <option value={180}>180 Days (Half-Yearly)</option>
                  <option value={365}>365 Days (Annual Compliance)</option>
                </select>
                <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                  Signals and raw GPS lat/lng approach breadcrumbs older than this period are purged automatically.
                </p>
              </div>
            </div>

            {/* Audit Log Tools */}
            <div className="pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  System Audit Trail & Compliance Export
                </div>
                <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                  {auditLogs.length} verified security audit logs stored for {formData.campusName || systemSettings.campusName}.
                </div>
              </div>
              <button
                type="button"
                onClick={handleExportAudit}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] hover:bg-[#E2DEFF] dark:hover:bg-[#343468] transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Export Audit JSON</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: Gateways (SMS & Payment) */}
        {activeTab === 'gateways' && (
          <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs space-y-6">
            <div>
              <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2 mb-1">
                <Send className="w-4 h-4 text-[#6D5CF2]" />
                <span>Communication & Mobile Money Gateways</span>
              </h3>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Setup SMS broadcast endpoints (Hubtel / Arkesel / Twilio) and verified Mobile Money / Paystack webhooks.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Primary SMS Gateway Provider
                </label>
                <select
                  value={formData.smsGatewayProvider}
                  onChange={(e) => handleChange('smsGatewayProvider', e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                >
                  <option value="Hubtel Ghana">Hubtel Ghana (Recommended for Local MTN/Telecel)</option>
                  <option value="Arkesel SMS">Arkesel SMS Gateway</option>
                  <option value="Twilio Global">Twilio Global Messaging</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  SMS Sender ID (Mask)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={11}
                    value={formData.smsSenderId}
                    onChange={(e) => handleChange('smsSenderId', e.target.value.toUpperCase())}
                    className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] font-mono uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleTestSms}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] hover:bg-[#E2DEFF] dark:hover:bg-[#343468] transition-all cursor-pointer whitespace-nowrap"
                  >
                    Send Test
                  </button>
                </div>
                <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] mt-1">
                  Max 11 alphanumeric characters approved by National Communications Authority (NCA).
                </p>
              </div>
            </div>

            {/* Gateway status badges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      Paystack & MTN MoMo Webhook
                    </div>
                    <div className="text-[10px] text-[#666A86] dark:text-[#A9ACC8]">
                      Settlement currency: GHS (Live)
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  Verified
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      Cloud Firestore Synchronization
                    </div>
                    <div className="text-[10px] text-[#666A86] dark:text-[#A9ACC8]">
                      Real-time offline caching active
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-[#6D5CF2] dark:text-[#8C7DFF] bg-[#6D5CF2]/10 px-2 py-0.5 rounded-full">
                  Connected
                </span>
              </div>
            </div>

            {/* Web Push Notification Gateway Engine (Brief Section 2.1 & 3.3) */}
            <div className="pt-4 border-t border-[#E9EBF5] dark:border-[#2D2D55] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5">
                    <Bell className="w-4 h-4 text-[#6D5CF2]" />
                    <span>Web Push & Mobile Arrival Engine (FCM / APNs)</span>
                  </h4>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                    Sends high-priority time-sensitive arrival confirmations, absence alerts, and service reminders.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#5B5F7A] dark:text-[#A9ACC8]">
                    {pushSubscribersCount} device{pushSubscribersCount === 1 ? '' : 's'} registered
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enablePushNotifications}
                      onChange={(e) => handleChange('enablePushNotifications', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6D5CF2]" />
                  </label>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="text-xs">
                  <div className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Browser Service Worker Status
                  </div>
                  <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-0.5">
                    Permission: <strong className="uppercase">{pushPermissionStatus}</strong> · Service Worker: <strong className="text-emerald-600 dark:text-emerald-400">/sw.js Active</strong>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {pushPermissionStatus !== 'granted' && (
                    <button
                      type="button"
                      onClick={() => requestPushPermission()}
                      className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] hover:bg-[#5b4be0] text-white shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>Enable on this terminal</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => sendTestPushNotification()}
                    className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-bold bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] hover:bg-[#E2DEFF] dark:hover:bg-[#343468] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Send Broadcast Test Push</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Save Bar Footer (for system parameters) */}
        {activeTab !== 'groups' && (
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between gap-4">
            <div className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
              Last saved: <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">{lastSavedTime}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] hover:bg-[#5b4be0] text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save System Settings</span>
              </button>
            </div>
          </div>
        )}
      </form>

      {/* MODAL 1: Add / Edit Church Group */}
      {isGroupModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div
            className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-[#E9EBF5] dark:border-[#2D2D55] animate-in zoom-in-95 duration-150 my-auto max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  {editingGroupId ? 'Edit Congregational Group' : 'Add New Congregational Group'}
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Set leadership, schedule, meeting venue, and group classification.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGroupModalOpen(false)}
                className="p-1.5 rounded-xl text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGroup} className="space-y-4 text-xs">
              {/* Category Selection Cards */}
              <div>
                <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1.5">
                  Group Category <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setGroupCategory('cell_group')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      groupCategory === 'cell_group'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200'
                        : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>Cell Group</span>
                      {groupCategory === 'cell_group' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                    </div>
                    <div className="text-[10px] mt-0.5 opacity-80">Home Small Group</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGroupCategory('ministry')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      groupCategory === 'ministry'
                        ? 'bg-[#EFEDFF] dark:bg-[#2A2A55] border-[#6D5CF2] text-[#6D5CF2] dark:text-[#8C7DFF]'
                        : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>Ministry</span>
                      {groupCategory === 'ministry' && <Check className="w-3.5 h-3.5 text-[#6D5CF2]" />}
                    </div>
                    <div className="text-[10px] mt-0.5 opacity-80">Department Unit</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGroupCategory('fellowship')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      groupCategory === 'fellowship'
                        ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-400 text-sky-900 dark:text-sky-200'
                        : 'bg-[#F6F7FC] dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>Fellowship</span>
                      {groupCategory === 'fellowship' && <Check className="w-3.5 h-3.5 text-sky-600" />}
                    </div>
                    <div className="text-[10px] mt-0.5 opacity-80">Demographic Wing</div>
                  </button>
                </div>
              </div>

              {/* Group Name */}
              <div>
                <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Group / Ministry Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Choir & Music Ministry, Men’s Fellowship, Home Cell"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border ${
                    groupErrors.name ? 'border-rose-500' : 'border-[#E9EBF5] dark:border-[#2D2D55]'
                  } text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]`}
                />
                {groupErrors.name && <p className="text-[10px] text-rose-500 mt-1">{groupErrors.name}</p>}
              </div>

              {/* Leaders Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Primary Leader Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Leader full name"
                    value={groupLeader}
                    onChange={(e) => setGroupLeader(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border ${
                      groupErrors.leader ? 'border-rose-500' : 'border-[#E9EBF5] dark:border-[#2D2D55]'
                    } text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]`}
                  />
                  {groupErrors.leader && <p className="text-[10px] text-rose-500 mt-1">{groupErrors.leader}</p>}
                </div>

                <div>
                  <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Leader Phone (Ghana / International)
                  </label>
                  <input
                    type="text"
                    placeholder="+233 24 111 2233"
                    value={groupLeaderPhone}
                    onChange={(e) => setGroupLeaderPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Leader Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="leader@church.org"
                    value={groupLeaderEmail}
                    onChange={(e) => setGroupLeaderEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Assistant / Co-Leader
                  </label>
                  <input
                    type="text"
                    placeholder="Assistant leader full name"
                    value={groupAssistant}
                    onChange={(e) => setGroupAssistant(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
              </div>

              {/* Schedule Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Meeting Day / Frequency
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Wednesdays, Every 2nd Saturday"
                    value={groupDay}
                    onChange={(e) => setGroupDay(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                    Meeting Time Window
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 18:30 - 19:45, 08:00 - 10:00"
                    value={groupTime}
                    onChange={(e) => setGroupTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                  />
                </div>
              </div>

              {/* Meeting Location */}
              <div>
                <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Meeting Location / Venue Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. Main Sanctuary Hall, Home Cell Venue, Online / Hybrid"
                  value={groupLocation}
                  onChange={(e) => setGroupLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              {/* Demographic / Target focus */}
              <div>
                <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Target Audience / Demographics Focus
                </label>
                <input
                  type="text"
                  placeholder="e.g. Vocalists, Married couples, Young Adults (Ages 18-35)"
                  value={groupDemographic}
                  onChange={(e) => setGroupDemographic(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Purpose & Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe the mission, objectives, or activities of this group..."
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="groupActiveToggle"
                  checked={groupActive}
                  onChange={(e) => setGroupActive(e.target.checked)}
                  className="w-4 h-4 rounded text-[#6D5CF2] focus:ring-[#6D5CF2] cursor-pointer"
                />
                <label htmlFor="groupActiveToggle" className="text-xs font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] cursor-pointer">
                  Group is actively meeting and available in roster selectors
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
                <button
                  type="button"
                  onClick={() => setIsGroupModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] hover:bg-[#5b4be0] text-white shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingGroupId ? 'Update Group' : 'Save Group'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: View Enrolled Members in Group */}
      {viewingMembersGroup && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div
            className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-[#E9EBF5] dark:border-[#2D2D55] animate-in zoom-in-95 duration-150 my-auto max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      viewingMembersGroup.category === 'ministry'
                        ? 'bg-[#EFEDFF] text-[#6D5CF2] dark:bg-[#2A2A55] dark:text-[#8C7DFF]'
                        : viewingMembersGroup.category === 'fellowship'
                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    }`}
                  >
                    {viewingMembersGroup.category.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-[#666A86] dark:text-[#A9ACC8]">·</span>
                  <span className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                    Leader: <strong className="text-[#1D1B3A] dark:text-[#F2F2FA]">{viewingMembersGroup.leaderName}</strong>
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  {viewingMembersGroup.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingMembersGroup(null)}
                className="p-1.5 rounded-xl text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Members List */}
            <div className="flex-1 overflow-y-auto py-4 space-y-2.5">
              <div className="text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] flex items-center justify-between">
                <span>Enrolled Congregation Members</span>
                <span className="font-bold text-[#6D5CF2] dark:text-[#8C7DFF]">
                  {getGroupMembers(viewingMembersGroup.name).length} members
                </span>
              </div>

              {getGroupMembers(viewingMembersGroup.name).length > 0 ? (
                <div className="space-y-2">
                  {getGroupMembers(viewingMembersGroup.name).map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-2xl bg-[#F6F7FC] dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] font-bold text-xs flex items-center justify-center shrink-0">
                          {m.avatarInitials}
                        </span>
                        <div className="min-w-0 truncate">
                          <div className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                            {m.firstName} {m.lastName} {m.preferredName ? `(${m.preferredName})` : ''}
                          </div>
                          <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] font-mono">
                            {m.phoneE164}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 text-right">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                            m.status === 'member'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          {m.status}
                        </span>
                        <span
                          className={`text-[10px] font-bold ${
                            m.autoCheckinOptedIn
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {m.autoCheckinOptedIn ? 'Auto In' : 'Manual'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl p-6 border border-[#E9EBF5] dark:border-[#2D2D55]">
                  <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    No members currently assigned to {viewingMembersGroup.name}
                  </p>
                  <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] mt-1 max-w-xs mx-auto">
                    You can assign members to this group when registering new members or editing existing members in the Roster.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between">
              <span className="text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                Meeting Day: <strong className="text-[#1D1B3A] dark:text-[#F2F2FA]">{viewingMembersGroup.meetingDay || 'Not set'}</strong>
              </span>
              <button
                type="button"
                onClick={() => setViewingMembersGroup(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] hover:bg-[#6D5CF2] hover:text-white transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

