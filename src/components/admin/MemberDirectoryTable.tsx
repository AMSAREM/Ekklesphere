import React, { useState, useMemo } from 'react';
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
  Users
} from 'lucide-react';
import { Person, MEMBERSHIP_TABLE_HEADERS } from '../../types/ekklesphere';

interface MemberDirectoryTableProps {
  members: Person[];
  onAddMember: () => void;
  onEditMember: (member: Person) => void;
  onDeleteMember: (id: string) => void;
  onOpenImportModal: () => void;
  onCheckinMember: (id: string) => void;
  checkedInIds: Set<string>;
}

export const MemberDirectoryTable: React.FC<MemberDirectoryTableProps> = ({
  members,
  onAddMember,
  onEditMember,
  onDeleteMember,
  onOpenImportModal,
  onCheckinMember,
  checkedInIds,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>('all');
  const [viewPreset, setViewPreset] = useState<'all' | 'essential' | 'church' | 'spiritual'>('all');
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);

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

  // Distinct groups & departments
  const cellGroups = useMemo(() => {
    const set = new Set<string>();
    members.forEach((m) => {
      if (m.homeCellGroup) set.add(m.homeCellGroup);
      if (m.groupName) set.add(m.groupName);
    });
    return Array.from(set).filter(Boolean);
  }, [members]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    members.forEach((m) => {
      if (m.department) set.add(m.department);
    });
    return Array.from(set).filter(Boolean);
  }, [members]);

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      // Cell Group filter
      if (selectedGroupFilter !== 'all') {
        const grp = m.homeCellGroup || m.groupName || '';
        if (!grp.toLowerCase().includes(selectedGroupFilter.toLowerCase())) {
          return false;
        }
      }

      // Department filter
      if (selectedDepartmentFilter !== 'all') {
        const dept = m.department || '';
        if (!dept.toLowerCase().includes(selectedDepartmentFilter.toLowerCase())) {
          return false;
        }
      }

      // Search Query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();

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
        (m.homeCellGroup && m.homeCellGroup.toLowerCase().includes(q)) ||
        (m.squads && m.squads.toLowerCase().includes(q)) ||
        (m.officerName && m.officerName.toLowerCase().includes(q))
      );
    });
  }, [members, searchQuery, selectedGroupFilter, selectedDepartmentFilter]);

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-[#1D1D3D] p-3 rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55] shadow-xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#666A86] dark:text-[#A9ACC8]" />
          <input
            type="text"
            placeholder="Search by name, ID, phone, digital address, cell, squad..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] placeholder-[#666A86] dark:placeholder-[#A9ACC8] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* View Presets & Column Picker */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Preset Buttons */}
          <div className="flex items-center bg-slate-100 dark:bg-[#14142E] p-1 rounded-xl">
            <button
              onClick={() => applyPreset('all')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                viewPreset === 'all'
                  ? 'bg-white dark:bg-[#1D1D3D] text-[#6D5CF2] shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8]'
              }`}
            >
              All 28 Fields
            </button>
            <button
              onClick={() => applyPreset('essential')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                viewPreset === 'essential'
                  ? 'bg-white dark:bg-[#1D1D3D] text-[#6D5CF2] shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8]'
              }`}
            >
              Essential
            </button>
            <button
              onClick={() => applyPreset('church')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                viewPreset === 'church'
                  ? 'bg-white dark:bg-[#1D1D3D] text-[#6D5CF2] shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8]'
              }`}
            >
              Church & Squads
            </button>
            <button
              onClick={() => applyPreset('spiritual')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                viewPreset === 'spiritual'
                  ? 'bg-white dark:bg-[#1D1D3D] text-[#6D5CF2] shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8]'
              }`}
            >
              Spiritual Dates
            </button>
          </div>

          {/* Group Filter */}
          <select
            value={selectedGroupFilter}
            onChange={(e) => setSelectedGroupFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none"
          >
            <option value="all">All Cell Groups</option>
            {cellGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          {/* Column Picker Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsColumnPickerOpen(!isColumnPickerOpen)}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5 hover:bg-slate-100 transition-all cursor-pointer"
            >
              <Columns className="w-3.5 h-3.5 text-[#6D5CF2]" />
              <span>Columns</span>
              <ChevronDown className="w-3 h-3 text-[#666A86]" />
            </button>

            {isColumnPickerOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 max-h-80 overflow-y-auto bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-2xl shadow-xl p-3 z-30">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
                  <span className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Toggle Columns</span>
                  <button
                    onClick={() => {
                      const allTrue: Record<string, boolean> = {};
                      MEMBERSHIP_TABLE_HEADERS.forEach((h) => (allTrue[h.header] = true));
                      setVisibleColumns(allTrue);
                    }}
                    className="text-[10px] text-[#6D5CF2] font-bold hover:underline"
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

      {/* Main 28-Column Table Container */}
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
              {filteredMembers.length === 0 ? (
                <tr>
                  <td
                    colSpan={30}
                    className="py-12 text-center text-[#666A86] dark:text-[#A9ACC8]"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="w-8 h-8 text-slate-300" />
                      <span className="font-bold">No church members found matching your search.</span>
                      <button
                        onClick={onOpenImportModal}
                        className="mt-2 text-xs font-bold text-[#6D5CF2] hover:underline"
                      >
                        Import members from spreadsheet or CSV
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
                            <span className="w-6 h-6 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF] font-bold text-[10px] flex items-center justify-center shrink-0">
                              {member.avatarInitials}
                            </span>
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
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-white/10 text-[#1D1B3A] dark:text-[#F2F2FA]">
                            {member.department || 'General'}
                          </span>
                        </td>
                      )}

                      {/* 9. MEMBERS/OFFICERS NAME */}
                      {visibleColumns['MEMBERS/OFFICERS NAME'] && (
                        <td className="py-3 px-3.5">
                          {(() => {
                            const name = member.officerName || 'Member';
                            const lower = name.toLowerCase();
                            const isPastor = lower.includes('pastor');
                            const isElder = lower.includes('elder');
                            const isDeacon = lower.includes('deacon');
                            const isLeader = lower.includes('leader') || lower.includes('captain') || lower.includes('head');

                            const badgeClass = isPastor
                              ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                              : isElder
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              : isDeacon
                              ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                              : isLeader
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
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
                          {member.phoneE164}
                        </td>
                      )}

                      {/* 13. PLACE OF RESIDENCE */}
                      {visibleColumns['PLACE OF RESIDENCE'] && (
                        <td className="py-3 px-3.5 text-[#666A86] dark:text-[#A9ACC8]">
                          {member.placeOfResidence || 'Accra'}
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
                          {member.monthOfBirth || (member.dateOfBirth ? new Date(member.dateOfBirth).toLocaleString('default', { month: 'long' }) : '—')}
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
                          {member.imageUrl ? (
                            <img
                              src={member.imageUrl}
                              alt={member.firstName}
                              className="w-7 h-7 rounded-full object-cover border border-slate-200"
                            />
                          ) : (
                            <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-[10px] font-bold text-slate-500">
                              {member.avatarInitials}
                            </span>
                          )}
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
                          <button
                            onClick={() => onCheckinMember(member.id)}
                            className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              isCheckedIn
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : 'text-[#6D5CF2] hover:bg-[#EFEDFF] dark:hover:bg-[#2A2A55]'
                            }`}
                            title={isCheckedIn ? 'Checked in today' : 'Check in to current service'}
                          >
                            <CheckSquare className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onEditMember(member)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#6D5CF2] hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                            title="Edit all 28 member fields"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onDeleteMember(member.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Remove member"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
    </div>
  );
};
