import React, { useState } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import { SystemSettings } from '../../types/ekklesphere';
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
} from 'lucide-react';

interface SystemSettingsPanelProps {
  onClose?: () => void;
  isModal?: boolean;
}

export const SystemSettingsPanel: React.FC<SystemSettingsPanelProps> = ({ onClose, isModal }) => {
  const {
    systemSettings,
    updateSystemSettings,
    resetSystemSettings,
    showToast,
    auditLogs,
  } = useEkklesphere();

  const [activeTab, setActiveTab] = useState<'general' | 'proximity' | 'pastoral' | 'privacy' | 'gateways'>('general');
  const [formData, setFormData] = useState<SystemSettings>({ ...systemSettings });
  const [hasChanges, setHasChanges] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>('Just now');

  const handleChange = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value };
      setHasChanges(true);
      return next;
    });
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    updateSystemSettings(formData);
    setHasChanges(false);
    setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  };

  const handleReset = () => {
    if (window.confirm('Restore default campus configuration for Accra Central Church?')) {
      resetSystemSettings();
      setFormData({ ...systemSettings });
      setHasChanges(false);
    }
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
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#F6F7FC] dark:bg-[#14142E] hover:bg-slate-200 dark:hover:bg-white/10 text-[#666A86] dark:text-[#A9ACC8] border border-[#E9EBF5] dark:border-[#2D2D55] transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
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

        {/* TAB 2: Proximity & Geofencing Automation */}
        {activeTab === 'proximity' && (
          <div className="space-y-5">
            <div className="bg-white dark:bg-[#1D1D3D] rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs space-y-6">
              <div>
                <h3 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2 mb-1">
                  <Radio className="w-4 h-4 text-[#6D5CF2]" />
                  <span>Two-Tier Proximity Radar Engine</span>
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                  Calibrate the outer approach wake-up circle and inner sanctuary dwell perimeter to guarantee accurate check-ins without battery drain.
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
                    Wakes device background task when member arrives within this distance of Accra Central.
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
                    Discards proximity events if the device moves faster than 15 km/h across the perimeter, preventing false check-ins from passing road traffic on Independence Ave.
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
                    Automatically directs absentee follow-ups to Osu North cell, Ridge Fellowship, or Youth leaders rather than centralized pastors.
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
                  {auditLogs.length} verified security audit logs stored for Accra Central campus.
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
          </div>
        )}

        {/* Save Bar Footer */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between gap-4">
          <div className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
            Last saved: <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">{lastSavedTime}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#1D1B3A] dark:hover:text-white"
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
      </form>
    </div>
  );
};
