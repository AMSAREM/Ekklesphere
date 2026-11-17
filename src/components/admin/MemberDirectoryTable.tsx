import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  Upload,
  UserPlus,
  Trash2,
  Edit3,
  CheckSquare,
  X,
  PhoneCall,
  Columns,
  Eye,
  Calendar,
  MapPin,
  Shield,
  Heart,
  ChevronDown,
  Sparkles,
  ExternalLink,
  Users,
  Camera,
  LayoutGrid,
  Table2,
  ImageOff,
  Copy,
  Check,
  Settings,
  KeyRound,
} from 'lucide-react';
import { Person, MEMBERSHIP_TABLE_HEADERS } from '../../types/ekklesphere';
import { MemberAvatar } from '../common/MemberAvatar';
import { ContactCallButton } from '../common/ContactCallButton';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  CHURCH_PORTFOLIO_OPTIONS,
  getMemberPortfolio,
  isPastoralOfficerOrLeader,
} from '../../constants/portfolios';
import {
  memberMatchesChurchGroup,
  mergeSelectableCellGroups,
  mergeSelectableDepartments,
  normalizeSettingLabel,
} from '../../utils/settingsConnections';
import {
  getAutomaticMinistryKind,
  resolveAutomaticDemographicMinistries,
} from '../../utils/demographicMinistries';
import { resolveMemberDepartments } from '../../utils/memberDepartments';
import {
  getExternalImageOpenUrl,
  getImageFallbackUrls,
  probeImageProxyDiagnostic,
  rememberWorkingImageUrl,
} from '../../utils/imageUrl';
import {
  ALL_BIRTH_MONTH_GROUPS,
  resolveMemberBirthFields,
} from '../../utils/birthMonth';

interface MemberDirectoryTableProps {
  members: Person[];
  onAddMember: () => void;
  onEditMember: (member: Person) => void;
  onDeleteMember: (id: string) => void;
  onOpenImportModal: () => void;
  onCheckinMember: (id: string) => void;
  checkedInIds: Set<string>;
  canCheckIn?: boolean;
  checkInDisabledReason?: string;
  initialDepartmentFilter?: string | null;
  initialGroupFilter?: string | null;
  initialBirthMonthGroupFilter?: string | null;
  initialStatusFilter?: 'all' | 'member' | 'visitor' | 'officers' | null;
  initialPortfolioFilter?: string | null;
  initialDisplayMode?: 'table' | 'photos';
}

export const MemberDirectoryTable: React.FC<MemberDirectoryTableProps> = ({
  members,
  onAddMember,
  onEditMember,
  onDeleteMember,
  onOpenImportModal,
  onCheckinMember,
  checkedInIds,
  canCheckIn = true,
  checkInDisabledReason,
  initialDepartmentFilter,
  initialGroupFilter,
  initialBirthMonthGroupFilter,
  initialStatusFilter,
  initialPortfolioFilter,
  initialDisplayMode,
}) => {
  const { churchGroups, requestOpenSettings, requestOpenUserManagement } = useEkklesphere();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>(initialGroupFilter || 'all');
  const [selectedBirthMonthGroupFilter, setSelectedBirthMonthGroupFilter] = useState<string>(
    initialBirthMonthGroupFilter || 'all'
  );
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>(
    initialDepartmentFilter || 'all'
  );
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<
    'all' | 'member' | 'visitor' | 'officers'
  >(initialStatusFilter || 'all');
  const [selectedPortfolioFilter, setSelectedPortfolioFilter] = useState<string>(
    initialPortfolioFilter || 'all'
  );
  const [viewPreset, setViewPreset] = useState<'all' | 'essential' | 'church' | 'spiritual'>('all');

  useEffect(() => {
    if (initialDepartmentFilter !== undefined) {
      setSelectedDepartmentFilter(initialDepartmentFilter || 'all');
    }
  }, [initialDepartmentFilter]);

  useEffect(() => {
    if (initialGroupFilter !== undefined) {
      setSelectedGroupFilter(initialGroupFilter || 'all');
    }
  }, [initialGroupFilter]);

  useEffect(() => {
    if (initialBirthMonthGroupFilter !== undefined) {
      setSelectedBirthMonthGroupFilter(initialBirthMonthGroupFilter || 'all');
    }
  }, [initialBirthMonthGroupFilter]);

  useEffect(() => {
    if (initialStatusFilter !== undefined) {
      setSelectedStatusFilter(initialStatusFilter || 'all');
    }
  }, [initialStatusFilter]);

  useEffect(() => {
    if (initialPortfolioFilter !== undefined) {
      setSelectedPortfolioFilter(initialPortfolioFilter || 'all');
    }
  }, [initialPortfolioFilter]);

  const [displayMode, setDisplayMode] = useState<'table' | 'photos'>(initialDisplayMode || 'table');

  useEffect(() => {
    if (initialDisplayMode) {
      setDisplayMode(initialDisplayMode);
    }
  }, [initialDisplayMode]);
  const [photosOnlyFilter, setPhotosOnlyFilter] = useState(false);
  const [previewMember, setPreviewMember] = useState<Person | null>(null);
  const [previewAttemptIndex, setPreviewAttemptIndex] = useState(0);
  const [previewDiagnostic, setPreviewDiagnostic] = useState<string | null>(null);
  const [gridAttemptIndices, setGridAttemptIndices] = useState<Record<string, number>>({});
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  const [confirmDeleteMemberId, setConfirmDeleteMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmDeleteMemberId) return;
    const t = setTimeout(() => setConfirmDeleteMemberId(null), 5000);
    return () => clearTimeout(t);
  }, [confirmDeleteMemberId]);

  const openPhotoPreview = (member: Person) => {
    setPreviewAttemptIndex(0);
    setPreviewDiagnostic(null);
    setCopiedUrl(false);
    setPreviewMember(member);
  };

  useEffect(() => {
    if (!previewMember?.imageUrl) {
      setPreviewDiagnostic(null);
      return;
    }
    const candidates = getImageFallbackUrls(previewMember.imageUrl, 'full');
    if (previewAttemptIndex < candidates.length) {
      return;
    }
    let cancelled = false;
    probeImageProxyDiagnostic(previewMember.imageUrl).then((msg) => {
      if (!cancelled && msg) {
        setPreviewDiagnostic(msg);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [previewMember, previewAttemptIndex]);

  // Column visibility state for all 28 headers
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    MEMBERSHIP_TABLE_HEADERS.forEach((h) => {
      initial[h.header] = true;
    });
    return initial;
  });

  const toggleColumn = (header: string) => {
    setVisibleColumns((prev) => ({
      ...prev,
      [header]: !prev[header],
    }));
  };

  const applyPreset = (preset: 'all' | 'essential' | 'church' | 'spiritual') => {
    setViewPreset(preset);
    const updated: Record<string, boolean> = {};

    MEMBERSHIP_TABLE_HEADERS.forEach((h) => {
      if (preset === 'all') {
        updated[h.header] = true;
      } else if (preset === 'essential') {
        const essentials = [
          'FIRST NAME',
          'LASTNAME',
          'ID',
          'PHONE NUMBER',
          'HOME CELL GROUP',
          'DEPARTMENT',
          'RESIDENTIAL/DIGITAL ADDRESS',
          'MARITAL STATUS',
        ];
        updated[h.header] = essentials.includes(h.header);
      } else if (preset === 'church') {
        const churchCols = [
          'FIRST NAME',
          'LASTNAME',
          'ID',
          'SQUADS',
          'DEPARTMENT',
          'MEMBERS/OFFICERS NAME',
          'HOME CELL GROUP',
          'date of membership',
          'date of baptism',
        ];
        updated[h.header] = churchCols.includes(h.header);
      } else if (preset === 'spiritual') {
        const spiritualCols = [
          'FIRST NAME',
          'LASTNAME',
          'ID',
          'date of salvation',
          'date of baptism',
          'date of marriage',
          'date of membership',
          'REMARKS',
        ];
        updated[h.header] = spiritualCols.includes(h.header);
      }
    });

    setVisibleColumns(updated);
  };

  // Distinct groups & departments synced with Settings churchGroups
  const cellGroups = useMemo(
    () => mergeSelectableCellGroups(churchGroups, members),
    [churchGroups, members]
  );

  const departments = useMemo(
    () =>
      mergeSelectableDepartments(churchGroups, members).filter(
        (d) =>
          d.toLowerCase() !== 'general congregation' ||
          members.some((m) => resolveMemberDepartments(m).length === 0)
      ),
    [churchGroups, members]
  );

  const uploadedPhotosCount = useMemo(
    () => members.filter((m) => Boolean(m.imageUrl && m.imageUrl.trim().length > 0)).length,
    [members]
  );

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if ((photosOnlyFilter || displayMode === 'photos') && !(m.imageUrl && m.imageUrl.trim().length > 0)) {
        return false;
      }

      // Status / Visitor / Officers filter
      if (selectedStatusFilter === 'visitor' && m.status !== 'visitor') {
        return false;
      }
      if (selectedStatusFilter === 'member' && m.status !== 'member') {
        return false;
      }
      if (selectedStatusFilter === 'officers' && !isPastoralOfficerOrLeader(m)) {
        return false;
      }

      // Portfolio / Designation filter
      if (selectedPortfolioFilter !== 'all') {
        if (getMemberPortfolio(m).toLowerCase() !== selectedPortfolioFilter.toLowerCase()) {
          return false;
        }
      }

      // Cell Group / Ministry filter
      if (selectedGroupFilter !== 'all') {
        const needle = normalizeSettingLabel(selectedGroupFilter).toLowerCase();
        const homeCell = normalizeSettingLabel(m.homeCellGroup).toLowerCase();
        const grp = normalizeSettingLabel(m.groupName).toLowerCase();
        const memberDepts = resolveMemberDepartments(m);
        const autoDepts = resolveAutomaticDemographicMinistries(m).names;
        const matchesDept =
          memberMatchesChurchGroup(m, selectedGroupFilter) ||
          memberDepts.some((d) => d.toLowerCase().includes(needle)) ||
          autoDepts.some((d) => d.toLowerCase().includes(needle));
        if (
          !homeCell.includes(needle) &&
          !grp.includes(needle) &&
          !matchesDept
        ) {
          return false;
        }
      }

      // Department filter
      if (selectedDepartmentFilter !== 'all') {
        const memberDepts = resolveMemberDepartments(m);
        const autoDepts = resolveAutomaticDemographicMinistries(m).names;
        const needle = normalizeSettingLabel(selectedDepartmentFilter).toLowerCase();
        if (needle === 'general congregation') {
          if (memberDepts.length > 0) {
            return false;
          }
        } else if (
          !memberMatchesChurchGroup(m, selectedDepartmentFilter) &&
          !memberDepts.some((d) => d.toLowerCase().includes(needle)) &&
          !autoDepts.some((d) => d.toLowerCase().includes(needle))
        ) {
          return false;
        }
      }

      // Birth Month Group filter
      if (selectedBirthMonthGroupFilter !== 'all') {
        const resolvedBirth = resolveMemberBirthFields({
          dateOfBirth: m.dateOfBirth,
          monthOfBirth: m.monthOfBirth,
          birthMonthGroup: m.birthMonthGroup,
        });
        if ((resolvedBirth.birthMonthGroup || '').toLowerCase() !== selectedBirthMonthGroupFilter.toLowerCase()) {
          return false;
        }
      }

      // Search Query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const resolvedBirth = resolveMemberBirthFields({
        dateOfBirth: m.dateOfBirth,
        monthOfBirth: m.monthOfBirth,
        birthMonthGroup: m.birthMonthGroup,
      });
      const autoDepts = resolveAutomaticDemographicMinistries(m).names;

      return (
        (m.firstName && m.firstName.toLowerCase().includes(q)) ||
        (m.middleName && m.middleName.toLowerCase().includes(q)) ||
        (m.lastName && m.lastName.toLowerCase().includes(q)) ||
        (m.memberId && m.memberId.toLowerCase().includes(q)) ||
        (m.phoneE164 && m.phoneE164.includes(q)) ||
        (m.residentialDigitalAddress && m.residentialDigitalAddress.toLowerCase().includes(q)) ||
        (m.specificLocation && m.specificLocation.toLowerCase().includes(q)) ||
        (m.placeOfResidence && m.placeOfResidence.toLowerCase().includes(q)) ||
        (m.hometown && m.hometown.toLowerCase().includes(q)) ||
        (m.department && m.department.toLowerCase().includes(q)) ||
        resolveMemberDepartments(m).some((d) => d.toLowerCase().includes(q)) ||
        autoDepts.some((d) => d.toLowerCase().includes(q)) ||
        (m.homeCellGroup && m.homeCellGroup.toLowerCase().includes(q)) ||
        (m.squads && m.squads.toLowerCase().includes(q)) ||
        (resolvedBirth.monthOfBirth && resolvedBirth.monthOfBirth.toLowerCase().includes(q)) ||
        (resolvedBirth.birthMonthGroup && resolvedBirth.birthMonthGroup.toLowerCase().includes(q)) ||
        getMemberPortfolio(m).toLowerCase().includes(q)
      );
    });
  }, [
    members,
    searchQuery,
    selectedStatusFilter,
    selectedPortfolioFilter,
    selectedGroupFilter,
    selectedDepartmentFilter,
    selectedBirthMonthGroupFilter,
    photosOnlyFilter,
    displayMode,
  ]);

  // Export full 28 columns CSV
  const handleExportCSV = () => {
    const headers = MEMBERSHIP_TABLE_HEADERS.map((h) => `"${h.header}"`).join(',');
    const rows = filteredMembers.map((m) => {
      return MEMBERSHIP_TABLE_HEADERS.map((h) => {
        let val = ((m as unknown) as Record<string, unknown>)[h.key];
        if (h.key === 'groupName' || h.key === 'homeCellGroup') {
          val = m.homeCellGroup || m.groupName;
        }
        if (val === undefined || val === null) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',');
    });

    const csvContent = `data:text/csv;charset=utf-8,${encodeURIComponent(
      `${headers}\n${rows.join('\n')}`
    )}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', csvContent);
    downloadAnchor.setAttribute('download', `church_membership_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Action Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-[#1D1D3D] p-4 sm:p-5 rounded-3xl border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              Church Membership Directory
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF]">
              {members.length} Enrolled
            </span>
          </div>
          <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
            Full 28-field demographic, residence, squads, digital address & spiritual milestone records synced with Supabase.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            onClick={onOpenImportModal}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap active:scale-95"
            title="Import members from CSV or Excel with validation"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Members</span>
            <span className="px-1.5 py-0.2 bg-emerald-800 text-[10px] rounded-md font-mono">
              CSV
            </span>
          </button>

          <button
            onClick={onAddMember}
            className="bg-[#6D5CF2] hover:bg-[#5b4be0] text-white rounded-xl px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap active:scale-95"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Member</span>
          </button>

          <button
            type="button"
            onClick={() => requestOpenUserManagement({ filter: 'all' })}
            className="bg-[#EFEDFF] dark:bg-[#2A2A55] border border-[#6D5CF2]/25 text-[#6D5CF2] dark:text-[#9D90FF] hover:bg-[#E2DEFF] dark:hover:bg-[#35356B] rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer whitespace-nowrap"
            title="Manage member & staff login credentials and roles"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Users &amp; Credentials</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer whitespace-nowrap"
            title="Export full 28-column dataset to CSV"
          >
            <Download className="w-3.5 h-3.5 text-[#6D5CF2]" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter and View Toolbar */}
      <div className="bg-white dark:bg-[#1D1D3D] p-3 sm:p-4 rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs flex flex-col gap-3 min-w-0 w-full">
        {/* Top Row: Search + View Mode & Column Utilities */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 min-w-0 w-full">
          {/* Search */}
          <div className="relative w-full lg:flex-1 lg:max-w-md min-w-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#666A86] dark:text-[#A9ACC8] pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, ID, phone, digital address, cell, squad..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-[38px] pl-8 pr-8 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] placeholder-[#666A86] dark:placeholder-[#A9ACC8] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear member search"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Display Mode, Photo Filter, Groups & Column Picker */}
          <div className="flex flex-wrap items-center gap-2 min-w-0 w-full lg:w-auto lg:justify-end">
            {/* Photo Gallery / Uploaded Photos Toggle */}
            <div className="inline-flex items-center bg-slate-100 dark:bg-[#14142E] p-1 rounded-xl max-w-full overflow-x-auto shrink-0">
              <button
                type="button"
                onClick={() => setDisplayMode('table')}
                className={`min-h-[30px] px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                  displayMode === 'table'
                    ? 'bg-white dark:bg-[#1D1D3D] text-[#6D5CF2] shadow-xs'
                    : 'text-[#666A86] dark:text-[#A9ACC8]'
                }`}
              >
                <Table2 className="w-3 h-3 shrink-0" />
                <span>Table</span>
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('photos')}
                className={`min-h-[30px] px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 tabular-nums ${
                  displayMode === 'photos'
                    ? 'bg-white dark:bg-[#1D1D3D] text-[#6D5CF2] shadow-xs'
                    : 'text-[#666A86] dark:text-[#A9ACC8]'
                }`}
              >
                <LayoutGrid className="w-3 h-3 shrink-0" />
                <span>Uploaded Photos ({uploadedPhotosCount})</span>
              </button>
            </div>

            {displayMode === 'table' && (
              <button
                type="button"
                onClick={() => setPhotosOnlyFilter((prev) => !prev)}
                className={`min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                  photosOnlyFilter
                    ? 'bg-[#EFEDFF] dark:bg-[#2A2A55] border-[#6D5CF2] text-[#6D5CF2] dark:text-[#8C7DFF]'
                    : 'bg-slate-50 dark:bg-[#14142E] border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]'
                }`}
                title="Filter table to members who have uploaded photos"
              >
                <Camera className="w-3.5 h-3.5 shrink-0" />
                <span>With Photo ({uploadedPhotosCount})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => requestOpenSettings('groups')}
              title="Add or edit ministries, departments & cell groups in Settings"
              className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#6D5CF2] dark:text-[#8C7DFF] flex items-center gap-1.5 hover:border-[#6D5CF2]/50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Settings className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Manage Groups</span>
            </button>

            {/* Column Picker Dropdown */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsColumnPickerOpen(!isColumnPickerOpen)}
                className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer whitespace-nowrap"
              >
                <Columns className="w-3.5 h-3.5 text-[#6D5CF2] shrink-0" />
                <span>Columns</span>
                <ChevronDown className="w-3 h-3 text-[#666A86] shrink-0" />
              </button>

              {isColumnPickerOpen && (
                <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 w-64 max-w-[calc(100vw-2rem)] max-h-80 overflow-y-auto bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-2xl shadow-xl p-3 z-30">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                    <span className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Toggle Columns</span>
                    <button
                      type="button"
                      onClick={() => {
                        const allTrue: Record<string, boolean> = {};
                        MEMBERSHIP_TABLE_HEADERS.forEach((h) => (allTrue[h.header] = true));
                        setVisibleColumns(allTrue);
                      }}
                      className="text-[10px] text-[#6D5CF2] font-bold hover:underline cursor-pointer"
                    >
                      Select All
                    </button>
                  </div>
                  <div className="space-y-1">
                    {MEMBERSHIP_TABLE_HEADERS.map((col) => (
                      <label
                        key={col.header}
                        className="flex items-center gap-2 text-[11px] text-[#1D1B3A] dark:text-[#F2F2FA] cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 p-1 rounded-lg"
                      >
                        <input
                          type="checkbox"
                          checked={!!visibleColumns[col.header]}
                          onChange={() => toggleColumn(col.header)}
                          className="rounded text-[#6D5CF2] focus:ring-[#6D5CF2]"
                        />
                        <span className="font-mono text-[10px]">{col.header}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Row: Field Presets + Responsive Multi-Filter Bar */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 pt-2.5 border-t border-[#E9EBF5] dark:border-[#2D2D55] min-w-0 w-full">
          {/* Preset Buttons */}
          <div className="inline-flex items-center bg-slate-100 dark:bg-[#14142E] p-1 rounded-xl gap-0.5 max-w-full overflow-x-auto self-start shrink-0">
            <button
              type="button"
              onClick={() => applyPreset('all')}
              className={`min-h-[30px] px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                viewPreset === 'all'
                  ? 'bg-white dark:bg-[#1D1D3D] text-[#6D5CF2] shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8]'
              }`}
            >
              All 28 Fields
            </button>
            <button
              type="button"
              onClick={() => applyPreset('essential')}
              className={`min-h-[30px] px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                viewPreset === 'essential'
                  ? 'bg-white dark:bg-[#1D1D3D] text-[#6D5CF2] shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8]'
              }`}
            >
              Essential
            </button>
            <button
              type="button"
              onClick={() => applyPreset('church')}
              className={`min-h-[30px] px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                viewPreset === 'church'
                  ? 'bg-white dark:bg-[#1D1D3D] text-[#6D5CF2] shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8]'
              }`}
            >
              Church & Squads
            </button>
            <button
              type="button"
              onClick={() => applyPreset('spiritual')}
              className={`min-h-[30px] px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                viewPreset === 'spiritual'
                  ? 'bg-white dark:bg-[#1D1D3D] text-[#6D5CF2] shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8]'
              }`}
            >
              Spiritual Dates
            </button>
          </div>

          {/* Responsive Filter Selects */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 w-full xl:w-auto xl:flex xl:flex-wrap xl:items-center xl:justify-end min-w-0">
            {/* Status / Visitors / Officers Filter */}
            <select
              aria-label="Filter by congregation status"
              value={selectedStatusFilter}
              onChange={(e) =>
                setSelectedStatusFilter(
                  e.target.value as 'all' | 'member' | 'visitor' | 'officers'
                )
              }
              className="w-full xl:w-auto xl:max-w-[175px] min-w-0 min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] truncate cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="member">Registered Members</option>
              <option value="visitor">Visitors / Guests</option>
              <option value="officers">Church Officers &amp; Leaders</option>
            </select>

            {/* Portfolio / Designation Filter */}
            <select
              aria-label="Filter by church portfolio"
              value={selectedPortfolioFilter}
              onChange={(e) => setSelectedPortfolioFilter(e.target.value)}
              className="w-full xl:w-auto xl:max-w-[175px] min-w-0 min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] truncate cursor-pointer"
            >
              <option value="all">All Portfolios</option>
              {CHURCH_PORTFOLIO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Department Filter */}
            <select
              aria-label="Filter by department"
              value={selectedDepartmentFilter}
              onChange={(e) => setSelectedDepartmentFilter(e.target.value)}
              className="w-full xl:w-auto xl:max-w-[175px] min-w-0 min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] truncate cursor-pointer"
            >
              <option value="all">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            {/* Group Filter */}
            <select
              aria-label="Filter by cell group or ministry"
              value={selectedGroupFilter}
              onChange={(e) => setSelectedGroupFilter(e.target.value)}
              className="w-full xl:w-auto xl:max-w-[175px] min-w-0 min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] truncate cursor-pointer"
            >
              <option value="all">All Cell Groups</option>
              {cellGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            {/* Birth Month Group Filter */}
            <select
              aria-label="Filter by birth month group"
              value={selectedBirthMonthGroupFilter}
              onChange={(e) => setSelectedBirthMonthGroupFilter(e.target.value)}
              className="w-full sm:col-span-2 md:col-span-1 xl:w-auto xl:max-w-[185px] min-w-0 min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] truncate cursor-pointer"
            >
              <option value="all">All Birth Month Groups</option>
              {ALL_BIRTH_MONTH_GROUPS.map((bg) => (
                <option key={bg.groupName} value={bg.groupName}>
                  {bg.groupName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Uploaded Member Photos Gallery Mode */}
      {displayMode === 'photos' && (
        <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm p-5">
          {filteredMembers.length === 0 ? (
            <div className="py-12 text-center text-[#666A86] dark:text-[#A9ACC8]">
              <Camera className="w-10 h-10 mx-auto mb-2.5 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                No uploaded member photos match your current filter
              </p>
              <p className="text-xs mt-1 max-w-md mx-auto">
                Members can upload their portrait on their Digital Pass, or you can edit any member profile to upload a photo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredMembers.map((member) => {
                const candidates = getImageFallbackUrls(member.imageUrl, 'card');
                const attemptIndex = gridAttemptIndices[member.id] ?? 0;
                const resolvedImg = attemptIndex < candidates.length ? candidates[attemptIndex] : null;
                return (
                <div
                  key={member.id}
                  className="group rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] bg-[#F6F7FC] dark:bg-[#14142E] overflow-hidden flex flex-col justify-between transition-all hover:shadow-md hover:border-[#6D5CF2]/50"
                >
                  <button
                    type="button"
                    onClick={() => openPhotoPreview(member)}
                    className="relative aspect-square w-full overflow-hidden bg-slate-200 dark:bg-[#232347] cursor-pointer flex items-center justify-center"
                  >
                    {resolvedImg ? (
                      <img
                        src={resolvedImg}
                        alt={`${member.firstName} ${member.lastName}`}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        decoding="async"
                        onLoad={() => rememberWorkingImageUrl(member.imageUrl, 'card', resolvedImg)}
                        onError={() =>
                          setGridAttemptIndices((prev) => ({
                            ...prev,
                            [member.id]: (prev[member.id] ?? 0) + 1,
                          }))
                        }
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-1.5 px-3 text-center text-[#666A86] dark:text-[#A9ACC8]">
                        <ImageOff className="w-6 h-6 opacity-70" />
                        <span className="text-[11px] font-semibold">
                          Click to inspect URL
                        </span>
                      </div>
                    )}
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold backdrop-blur-xs">
                      View
                    </span>
                  </button>
                  <div className="p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                          {member.firstName} {member.lastName}
                        </div>
                        <div className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] truncate">
                          {member.homeCellGroup || member.groupName || 'General Congregation'}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-[#6D5CF2] dark:text-[#8C7DFF] shrink-0">
                        {member.memberId || 'ID Pending'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-[#E9EBF5] dark:border-[#2D2D55]">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={!canCheckIn || checkedInIds.has(member.id)}
                          onClick={() => onCheckinMember(member.id)}
                          title={
                            !canCheckIn
                              ? checkInDisabledReason || 'Schedule a service window first'
                              : checkedInIds.has(member.id)
                              ? 'Checked in today'
                              : 'Check in to active service'
                          }
                          className={`p-1 rounded-lg transition-colors ${
                            !canCheckIn
                              ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                              : checkedInIds.has(member.id)
                              ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 cursor-default'
                              : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer'
                          }`}
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                        </button>
                        <ContactCallButton
                          compact
                          contactName={`${member.firstName} ${member.lastName}`}
                          contactPhone={member.phoneE164 || member.phoneNumber}
                          contactEmail={member.email}
                          contactRole={getMemberPortfolio(member)}
                          contactGroup={member.homeCellGroup || member.groupName}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            requestOpenUserManagement({
                              memberId: member.id,
                              searchQuery: `${member.firstName} ${member.lastName}`.trim(),
                            })
                          }
                          className="p-1 rounded-lg text-[#6D5CF2] hover:bg-[#EFEDFF] dark:hover:bg-[#2A2A55] transition-colors cursor-pointer"
                          title="Manage login & credentials"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEditMember(member)}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold text-[#666A86] dark:text-[#A9ACC8] hover:text-[#6D5CF2] hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1"
                          title="Edit member profile"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        {confirmDeleteMemberId === member.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteMemberId(null);
                              onDeleteMember(member.id);
                            }}
                            className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold hover:bg-rose-700 cursor-pointer"
                          >
                            Confirm
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteMemberId(member.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Delete member"
                            aria-label={`Delete ${member.firstName} ${member.lastName}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Main 28-Column Table Container */}
      {displayMode === 'table' && (
      <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl border border-[#E9EBF5] dark:border-[#2D2D55] shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[620px] scrollbar-thin">
          <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
            <thead className="sticky top-0 bg-[#F6F7FC] dark:bg-[#14142E] border-b border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8] font-extrabold z-10 shadow-xs">
              <tr>
                {/* Fixed Counter / Select column */}
                <th className="py-3 px-3 w-10 text-center font-mono">#</th>

                {/* 28 Dynamic Exact User Headers */}
                {MEMBERSHIP_TABLE_HEADERS.map((col) => {
                  if (!visibleColumns[col.header]) return null;
                  return (
                    <th
                      key={col.header}
                      className="py-3 px-3.5 tracking-wider uppercase text-[11px] font-bold text-[#1D1B3A] dark:text-[#F2F2FA]"
                    >
                      {col.header}
                    </th>
                  );
                })}

                {/* Sticky Right Actions Column */}
                <th className="py-3 px-4 text-right sticky right-0 bg-[#F6F7FC] dark:bg-[#14142E] shadow-[-6px_0_12px_rgba(0,0,0,0.03)] z-10">
                  ACTIONS
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55]">
              {members.length === 0 ? (
                <tr>
                  <td colSpan={30} className="py-16 text-center text-[#666A86] dark:text-[#A9ACC8]">
                    <div className="max-w-md mx-auto flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-50/70 dark:bg-white/[0.02] border border-dashed border-[#6D5CF2]/30 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-[#EFEDFF] dark:bg-[#6D5CF2]/20 flex items-center justify-center text-[#6D5CF2] mb-3 shadow-xs">
                        <Users className="w-7 h-7" />
                      </div>
                      <h4 className="text-base font-extrabold text-[#1D1B3A] dark:text-white mb-1">
                        No Members in Congregation Yet
                      </h4>
                      <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] leading-relaxed mb-5">
                        Your church database is clean and ready. Upload your church membership spreadsheet (CSV) with GhanaPost GPS & demographic fields, or add your first member manually.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={onOpenImportModal}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5B4BE2] text-white text-xs font-extrabold shadow-sm cursor-pointer transition-all hover:scale-[1.02]"
                        >
                          <Upload className="w-4 h-4" />
                          <span>Import Members (CSV)</span>
                        </button>
                        <button
                          type="button"
                          onClick={onAddMember}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-[#1F1F38] border border-slate-200 dark:border-white/10 text-xs font-bold text-[#1D1B3A] dark:text-white hover:bg-slate-50 cursor-pointer transition-all"
                        >
                          <UserPlus className="w-4 h-4 text-[#6D5CF2]" />
                          <span>Add Single Member</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={30} className="py-12 text-center text-[#666A86] dark:text-[#A9ACC8]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="w-8 h-8 text-slate-300" />
                      <span className="font-bold">No church members found matching your search.</span>
                      <button
                        onClick={onOpenImportModal}
                        className="mt-2 text-xs font-bold text-[#6D5CF2] hover:underline cursor-pointer"
                      >
                        Import additional members from spreadsheet or CSV
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member, index) => {
                  const isCheckedIn = checkedInIds.has(member.id);

                  return (
                    <tr
                      key={member.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors group"
                    >
                      {/* Row Index */}
                      <td className="py-3 px-3 text-center font-mono text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                        {index + 1}
                      </td>

                      {/* 1. FIRST NAME */}
                      {visibleColumns['FIRST NAME'] && (
                        <td className="py-3 px-3.5 font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          <div className="flex items-center gap-2">
                            <MemberAvatar
                              src={member.imageUrl}
                              name={`${member.firstName} ${member.lastName}`}
                              initials={member.avatarInitials}
                              sizeClass="w-7 h-7"
                              textClass="text-[10px] font-bold"
                              onClick={
                                member.imageUrl ? () => openPhotoPreview(member) : undefined
                              }
                            />
                            <span>{member.firstName}</span>
                          </div>
                        </td>
                      )}

                      {/* 2. MIDDLE NAME */}
                      {visibleColumns['MIDDLE NAME'] && (
                        <td className="py-3 px-3.5 text-[#666A86] dark:text-[#A9ACC8]">
                          {member.middleName || '—'}
                        </td>
                      )}

                      {/* 3. LASTNAME */}
                      {visibleColumns['LASTNAME'] && (
                        <td className="py-3 px-3.5 font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                          {member.lastName}
                        </td>
                      )}

                      {/* 4. SPECIFIC LOCATION */}
                      {visibleColumns['SPECIFIC LOCATION'] && (
                        <td className="py-3 px-3.5 text-[#666A86] dark:text-[#A9ACC8]">
                          {member.specificLocation ? (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                              <span>{member.specificLocation}</span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}

                      {/* 5. REMARKS */}
                      {visibleColumns['REMARKS'] && (
                        <td className="py-3 px-3.5 text-[#666A86] dark:text-[#A9ACC8] max-w-[200px] truncate" title={member.remarks || member.notes || ''}>
                          {member.remarks || member.notes || '—'}
                        </td>
                      )}

                      {/* 6. ID */}
                      {visibleColumns['ID'] && (
                        <td className="py-3 px-3.5 font-mono text-[#6D5CF2] dark:text-[#8C7DFF] font-semibold">
                          {member.memberId || `ACC-${member.id.slice(0, 6)}`}
                        </td>
                      )}

                      {/* 7. SQUADS */}
                      {visibleColumns['SQUADS'] && (
                        <td className="py-3 px-3.5">
                          {member.squads ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF]">
                              {member.squads}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}

                      {/* 8. DEPARTMENT */}
                      {visibleColumns['DEPARTMENT'] && (
                        <td className="py-3 px-3.5">
                          {(() => {
                            const depts = resolveMemberDepartments(member);
                            const explicitKinds = new Set(
                              depts
                                .map((d) => getAutomaticMinistryKind(d))
                                .filter((k): k is NonNullable<typeof k> => Boolean(k))
                            );
                            const autoMinistries = resolveAutomaticDemographicMinistries(
                              member
                            ).ministries.filter((am) => !explicitKinds.has(am.kind));

                            return (
                              <div className="flex flex-wrap gap-1 max-w-[240px]">
                                {depts.length > 0 ? (
                                  depts.map((deptName) => (
                                    <span
                                      key={deptName}
                                      className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-white/10 text-[#1D1B3A] dark:text-[#F2F2FA]"
                                    >
                                      {deptName}
                                    </span>
                                  ))
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-white/10 text-[#666A86] dark:text-[#A9ACC8]">
                                    General
                                  </span>
                                )}
                                {autoMinistries.map((am) => (
                                  <span
                                    key={am.kind}
                                    title={am.reason}
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                      am.kind === 'youth'
                                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                                        : am.kind === 'women'
                                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60'
                                        : 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60'
                                    }`}
                                  >
                                    {am.name} · Auto
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </td>
                      )}

                      {/* 9. MEMBERS/OFFICERS NAME */}
                      {visibleColumns['MEMBERS/OFFICERS NAME'] && (
                        <td className="py-3 px-3.5">
                          {(() => {
                            const name = getMemberPortfolio(member);
                            const lower = name.toLowerCase();
                            const isPastor = lower.includes('pastor') || lower.includes('evangelist');
                            const isElder = lower.includes('elder');
                            const isDeacon = lower.includes('deacon');
                            const isLeader =
                              lower.includes('leader') ||
                              lower.includes('captain') ||
                              lower.includes('head') ||
                              lower.includes('director') ||
                              lower.includes('coordinator') ||
                              lower.includes('treasurer') ||
                              lower.includes('secretary');
                            const isGuest = lower === 'guest' || member.status === 'visitor';

                            const badgeClass = isPastor
                              ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                              : isElder
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              : isDeacon
                              ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                              : isLeader
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : isGuest
                              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                              : 'bg-slate-100 dark:bg-white/10 text-[#666A86] dark:text-[#A9ACC8] border-slate-200 dark:border-slate-700';

                            return (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${badgeClass}`}
                              >
                                {name}
                              </span>
                            );
                          })()}
                        </td>
                      )}

                      {/* 10. GENDER */}
                      {visibleColumns['GENDER'] && (
                        <td className="py-3 px-3.5 capitalize text-[#666A86] dark:text-[#A9ACC8]">
                          {member.gender || '—'}
                        </td>
                      )}

                      {/* 11. DATE OF BIRTH */}
                      {visibleColumns['DATE OF BIRTH'] && (
                        <td className="py-3 px-3.5 font-mono text-[#666A86] dark:text-[#A9ACC8]">
                          {member.dateOfBirth || '—'}
                        </td>
                      )}

                      {/* 12. PHONE NUMBER */}
                      {visibleColumns['PHONE NUMBER'] && (
                        <td className="py-3 px-3.5 font-mono text-[#1D1B3A] dark:text-[#F2F2FA]">
                          <div className="inline-flex items-center gap-1.5">
                            <span>{member.phoneE164 || member.phoneNumber || '—'}</span>
                            {(member.phoneE164 || member.phoneNumber) && (
                              <ContactCallButton
                                compact
                                contactName={`${member.firstName} ${member.lastName}`.trim()}
                                contactPhone={member.phoneE164 || member.phoneNumber}
                                contactEmail={member.email}
                                contactRole={getMemberPortfolio(member)}
                                contactGroup={member.homeCellGroup || member.groupName}
                              />
                            )}
                          </div>
                        </td>
                      )}

                      {/* 13. PLACE OF RESIDENCE */}
                      {visibleColumns['PLACE OF RESIDENCE'] && (
                        <td className="py-3 px-3.5 text-[#666A86] dark:text-[#A9ACC8]">
                          {member.placeOfResidence || '—'}
                        </td>
                      )}

                      {/* 14. RESIDENTIAL/DIGITAL ADDRESS */}
                      {visibleColumns['RESIDENTIAL/DIGITAL ADDRESS'] && (
                        <td className="py-3 px-3.5">
                          {member.residentialDigitalAddress ? (
                            <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-extrabold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
                              {member.residentialDigitalAddress}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}

                      {/* 15. HOMETOWN */}
                      {visibleColumns['HOMETOWN'] && (
                        <td className="py-3 px-3.5 text-[#666A86] dark:text-[#A9ACC8]">
                          {member.hometown || '—'}
                        </td>
                      )}

                      {/* 16. OCCUPATION */}
                      {visibleColumns['OCCUPATION'] && (
                        <td className="py-3 px-3.5 text-[#666A86] dark:text-[#A9ACC8]">
                          {member.occupation || '—'}
                        </td>
                      )}

                      {/* 17. HOME CELL GROUP */}
                      {visibleColumns['HOME CELL GROUP'] && (
                        <td className="py-3 px-3.5 text-[#1D1B3A] dark:text-[#F2F2FA] font-semibold">
                          {member.homeCellGroup || member.groupName}
                        </td>
                      )}

                      {/* 18. MONTH OF BIRTH */}
                      {visibleColumns['MONTH OF BIRTH'] && (
                        <td className="py-3 px-3.5 text-[#666A86] dark:text-[#A9ACC8]">
                          {(() => {
                            const resolved = resolveMemberBirthFields({
                              dateOfBirth: member.dateOfBirth,
                              monthOfBirth: member.monthOfBirth,
                              birthMonthGroup: member.birthMonthGroup,
                            });
                            if (!resolved.monthOfBirth) return '—';
                            return (
                              <div className="leading-tight">
                                <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] block">
                                  {resolved.monthOfBirth}
                                </span>
                                {resolved.birthMonthGroup && (
                                  <span className="text-[10px] text-[#6D5CF2] dark:text-[#9D90FF]">
                                    {resolved.birthMonthGroup}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                      )}

                      {/* 19. MARITAL STATUS */}
                      {visibleColumns['MARITAL STATUS'] && (
                        <td className="py-3 px-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              member.maritalStatus === 'Married'
                                ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
                                : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {member.maritalStatus || 'Single'}
                          </span>
                        </td>
                      )}

                      {/* 20. NAME OF SPOUSE */}
                      {visibleColumns['NAME OF SPOUSE'] && (
                        <td className="py-3 px-3.5 text-[#666A86] dark:text-[#A9ACC8]">
                          {member.spouseName || '—'}
                        </td>
                      )}

                      {/* 21. NUMBER OF CHILDREN */}
                      {visibleColumns['NUMBER OF CHILDREN'] && (
                        <td className="py-3 px-3.5 font-mono text-center">
                          {member.numberOfChildren ?? 0}
                        </td>
                      )}

                      {/* 22. NAME OF PERSON TO CONTACT IN CASE OF EMERGENCY */}
                      {visibleColumns['NAME OF PERSON TO CONTACT IN CASE OF EMERGENCY'] && (
                        <td className="py-3 px-3.5 text-[#666A86] dark:text-[#A9ACC8]">
                          {member.emergencyContactPerson || '—'}
                        </td>
                      )}

                      {/* 23. EMERGENCY */}
                      {visibleColumns['EMERGENCY'] && (
                        <td className="py-3 px-3.5 font-mono text-xs text-rose-600 dark:text-rose-400">
                          {member.emergencyContactPhone || '—'}
                        </td>
                      )}

                      {/* 24. IMAGE */}
                      {visibleColumns['IMAGE'] && (
                        <td className="py-3 px-3.5">
                          <div className="flex items-center gap-2">
                            <MemberAvatar
                              src={member.imageUrl}
                              name={`${member.firstName} ${member.lastName}`}
                              initials={member.avatarInitials}
                              sizeClass="w-8 h-8"
                              textClass="text-[10px] font-bold"
                              onClick={
                                member.imageUrl ? () => openPhotoPreview(member) : undefined
                              }
                            />
                            {member.imageUrl && (
                              <button
                                type="button"
                                onClick={() => openPhotoPreview(member)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6D5CF2] dark:text-[#9D90FF] hover:underline cursor-pointer"
                                title="View image & URL"
                              >
                                <Eye className="w-3 h-3" />
                                <span>View</span>
                              </button>
                            )}
                          </div>
                        </td>
                      )}

                      {/* 25. date of baptism */}
                      {visibleColumns['date of baptism'] && (
                        <td className="py-3 px-3.5 font-mono text-[#666A86] dark:text-[#A9ACC8]">
                          {member.dateOfBaptism || '—'}
                        </td>
                      )}

                      {/* 26. date of marriage */}
                      {visibleColumns['date of marriage'] && (
                        <td className="py-3 px-3.5 font-mono text-[#666A86] dark:text-[#A9ACC8]">
                          {member.dateOfMarriage || '—'}
                        </td>
                      )}

                      {/* 27. date of salvation */}
                      {visibleColumns['date of salvation'] && (
                        <td className="py-3 px-3.5 font-mono text-[#666A86] dark:text-[#A9ACC8]">
                          {member.dateOfSalvation || '—'}
                        </td>
                      )}

                      {/* 28. date of membership */}
                      {visibleColumns['date of membership'] && (
                        <td className="py-3 px-3.5 font-mono text-[#666A86] dark:text-[#A9ACC8]">
                          {member.dateOfMembership || member.joinedOn || '—'}
                        </td>
                      )}

                      {/* Sticky Right Action Buttons */}
                      <td className="py-3 px-4 text-right sticky right-0 bg-white/95 dark:bg-[#1D1D3D]/95 backdrop-blur-xs shadow-[-6px_0_12px_rgba(0,0,0,0.03)]">
                        <div className="flex items-center justify-end gap-1.5">
                          <ContactCallButton
                            compact
                            contactName={`${member.firstName} ${member.lastName}`.trim()}
                            contactPhone={member.phoneE164 || member.phoneNumber}
                            contactEmail={member.email}
                            contactRole={getMemberPortfolio(member)}
                            contactGroup={member.homeCellGroup || member.groupName}
                          />

                          <button
                            type="button"
                            disabled={!canCheckIn}
                            onClick={() => onCheckinMember(member.id)}
                            className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                              isCheckedIn
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : 'text-[#6D5CF2] hover:bg-[#EFEDFF] dark:hover:bg-[#2A2A55]'
                            }`}
                            title={
                              !canCheckIn
                                ? checkInDisabledReason || 'No service scheduled for check-in'
                                : isCheckedIn
                                ? 'Checked in today'
                                : 'Check in to current service'
                            }
                          >
                            <CheckSquare className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              requestOpenUserManagement({
                                memberId: member.id,
                                searchQuery: `${member.firstName} ${member.lastName}`.trim(),
                              })
                            }
                            className="p-1.5 rounded-lg text-[#6D5CF2] hover:bg-[#EFEDFF] dark:hover:bg-[#2A2A55] transition-colors cursor-pointer"
                            title="Manage login & credentials"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onEditMember(member)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#6D5CF2] hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                            title="Edit all 28 member fields"
                            aria-label={`Edit ${member.firstName} ${member.lastName}`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {confirmDeleteMemberId === member.id ? (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteMemberId(null);
                                onDeleteMember(member.id);
                              }}
                              className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold transition-colors cursor-pointer"
                            >
                              Confirm
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMemberId(member.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                              title="Delete member"
                              aria-label={`Delete ${member.firstName} ${member.lastName}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div className="px-4 py-3 bg-[#F6F7FC] dark:bg-[#14142E] border-t border-[#E9EBF5] dark:border-[#2D2D55] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#666A86] dark:text-[#A9ACC8]">
          <span>
            Showing <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">{filteredMembers.length}</b> of <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">{members.length}</b> registered members across all 28 schema columns.
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>{checkedInIds.size} checked in today</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#6D5CF2]" />
              <span>{members.filter((m) => m.autoCheckinOptedIn).length} auto-checkin opted in</span>
            </span>
          </div>
        </div>
      </div>
      )}

      {/* Member Photo Preview Lightbox Modal */}
      {previewMember && previewMember.imageUrl && (() => {
        const previewCandidates = getImageFallbackUrls(previewMember.imageUrl, 'full');
        const resolvedPreviewUrl =
          previewAttemptIndex < previewCandidates.length ? previewCandidates[previewAttemptIndex] : null;
        const externalUrl = getExternalImageOpenUrl(previewMember.imageUrl);
        return (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setPreviewMember(null)}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-sm w-full overflow-hidden border border-[#E9EBF5] dark:border-[#2D2D55] shadow-2xl"
            >
              <div className="aspect-square w-full bg-slate-100 dark:bg-[#14142E] relative flex items-center justify-center">
                {resolvedPreviewUrl ? (
                  <img
                    src={resolvedPreviewUrl}
                    alt={`${previewMember.firstName} ${previewMember.lastName}`}
                    referrerPolicy="no-referrer"
                    decoding="async"
                    onLoad={() =>
                      rememberWorkingImageUrl(previewMember.imageUrl, 'full', resolvedPreviewUrl)
                    }
                    onError={() => setPreviewAttemptIndex((prev) => prev + 1)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="p-6 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-[#232347] text-[#666A86] dark:text-[#A9ACC8] flex items-center justify-center mx-auto">
                      <ImageOff className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                        Inline image preview unavailable
                      </p>
                      <p className="text-[11px] text-[#666A86] dark:text-[#A9ACC8] leading-relaxed">
                        {previewDiagnostic ||
                          'This image host may require permission or block embedded previews. You can open the URL directly below.'}
                      </p>
                    </div>
                    {externalUrl && (
                      <a
                        href={externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Image URL</span>
                      </a>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewMember(null)}
                  aria-label="Close photo preview"
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-extrabold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                      {previewMember.firstName} {previewMember.lastName}
                    </h4>
                    <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] truncate">
                      {previewMember.homeCellGroup || previewMember.groupName || 'General Congregation'}
                      {previewMember.memberId ? ` · ${previewMember.memberId}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const target = previewMember;
                        setPreviewMember(null);
                        onEditMember(target);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold shrink-0 cursor-pointer"
                    >
                      Edit Profile
                    </button>
                    {confirmDeleteMemberId === previewMember.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          const targetId = previewMember.id;
                          setConfirmDeleteMemberId(null);
                          setPreviewMember(null);
                          onDeleteMember(targetId);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shrink-0 cursor-pointer"
                      >
                        Confirm Delete
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteMemberId(previewMember.id)}
                        className="px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold shrink-0 cursor-pointer"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {externalUrl && (
                  <div className="pt-2.5 border-t border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-[#666A86] dark:text-[#A9ACC8] truncate">
                      {externalUrl}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard?.writeText(externalUrl);
                            setCopiedUrl(true);
                            setTimeout(() => setCopiedUrl(false), 1800);
                          } catch {}
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/10 text-[11px] font-semibold text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-200 dark:hover:bg-white/15 cursor-pointer"
                      >
                        {copiedUrl ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                      <a
                        href={externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#EFEDFF] dark:bg-[#2A2A55] text-[11px] font-semibold text-[#6D5CF2] dark:text-[#9D90FF] hover:opacity-90"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Open</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
