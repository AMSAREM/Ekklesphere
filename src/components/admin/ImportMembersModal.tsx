import React, { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Download,
  Database,
  ArrowRight,
  Filter,
  Check,
  RefreshCw,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { Person, MEMBERSHIP_TABLE_HEADERS } from '../../types/ekklesphere';
import {
  validateMemberImportBatch,
  type ImportDuplicateMode,
  type MemberImportValidationSummary,
  type ValidatedImportRow,
} from '../../shared/memberImportValidation';

export interface RemoteImportValidationResult {
  summary: MemberImportValidationSummary;
  rows: ValidatedImportRow[];
  license?: {
    allowed: boolean;
    code: string;
    message: string;
    seatsUsed: number;
    seatsLimit: number;
    remainingSeats: number | null;
    wouldExceedSeatLimit: boolean;
  };
  source: 'server' | 'local';
}

interface ImportMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (
    importedMembers: Person[],
    options?: { duplicateMode: ImportDuplicateMode }
  ) => Promise<unknown> | void;
  onValidateRemote?: (
    rawRows: Record<string, unknown>[],
    duplicateMode: ImportDuplicateMode
  ) => Promise<RemoteImportValidationResult>;
  existingMembers: Person[];
}

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ImportMembersModal: React.FC<ImportMembersModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  onValidateRemote,
  existingMembers,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'paste' | 'preview'>('upload');
  const [pastedText, setPastedText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rawInputRows, setRawInputRows] = useState<Record<string, string>[]>([]);
  const [parsedRows, setParsedRows] = useState<ValidatedImportRow[]>([]);
  const [summary, setSummary] = useState<MemberImportValidationSummary | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<ImportDuplicateMode>('skip');
  const [filterMode, setFilterMode] = useState<'all' | 'actionable' | 'updates' | 'skipped' | 'errors'>('all');
  const [fileName, setFileName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifyingServer, setIsVerifyingServer] = useState(false);
  const [validationSource, setValidationSource] = useState<'server' | 'local'>('local');
  const [licenseStatus, setLicenseStatus] = useState<RemoteImportValidationResult['license'] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const runValidation = async (
    rowsToValidate: Record<string, string>[],
    mode: ImportDuplicateMode,
    switchToPreview = false
  ) => {
    setSubmitError(null);
    const existingIndex = existingMembers.map((m) => ({
      id: m.id,
      memberId: m.memberId,
      phoneE164: m.phoneE164,
      email: m.email,
    }));

    const localResult = validateMemberImportBatch(rowsToValidate, existingIndex, mode);
    setParsedRows(localResult.rows);
    setSummary(localResult.summary);
    setValidationSource('local');
    setLicenseStatus(null);
    if (switchToPreview) {
      setActiveTab('preview');
    }

    if (onValidateRemote && rowsToValidate.length > 0) {
      setIsVerifyingServer(true);
      try {
        const remote = await onValidateRemote(rowsToValidate, mode);
        setParsedRows(remote.rows);
        setSummary(remote.summary);
        setValidationSource(remote.source);
        setLicenseStatus(remote.license || null);
      } catch {
        // Keep local validation results if server dry-run is unreachable
      } finally {
        setIsVerifyingServer(false);
      }
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setParseError(null);
      setSubmitError(null);
      setIsDragging(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const parseFile = (file: File) => {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.csv') && !lowerName.endsWith('.tsv') && !lowerName.endsWith('.txt')) {
      setParseError('Unsupported file type. Please upload a .csv, .tsv, or .txt tabular file.');
      return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setParseError('File exceeds the 5 MB limit. Split large rosters into smaller batches.');
      return;
    }

    setFileName(file.name);
    setParseError(null);
    setSubmitError(null);
    setIsParsing(true);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        setIsParsing(false);
        if (results.data && results.data.length > 0) {
          setRawInputRows(results.data);
          void runValidation(results.data, duplicateMode, true);
        } else {
          setParseError('The uploaded file was empty or had no readable headers.');
        }
      },
      error: (error) => {
        setIsParsing(false);
        setParseError(`Error parsing CSV file: ${error.message}`);
      },
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    parseFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      parseFile(file);
    }
  };

  const handlePasteParse = () => {
    if (!pastedText.trim()) return;

    setParseError(null);
    setSubmitError(null);
    setIsParsing(true);
    Papa.parse<Record<string, string>>(pastedText, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        setIsParsing(false);
        if (results.data && results.data.length > 0) {
          setFileName('pasted-roster.csv');
          setRawInputRows(results.data);
          void runValidation(results.data, duplicateMode, true);
        } else {
          setParseError('Could not find valid tabular data in the pasted text.');
        }
      },
      error: (error: Error) => {
        setIsParsing(false);
        setParseError(`Error parsing pasted data: ${error.message}`);
      },
    });
  };

  const handleDuplicateModeChange = (nextMode: ImportDuplicateMode) => {
    setDuplicateMode(nextMode);
    if (rawInputRows.length > 0) {
      void runValidation(rawInputRows, nextMode, false);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [...MEMBERSHIP_TABLE_HEADERS.map((h) => h.header), 'EMAIL'].join(',');
    const csvData = `data:text/csv;charset=utf-8,${encodeURIComponent(`${headers}\n`)}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', csvData);
    downloadAnchor.setAttribute('download', 'church_membership_template.csv');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleDownloadErrorReport = () => {
    const failed = parsedRows.filter((r) => !r.isValid);
    if (failed.length === 0) return;

    const exportData = failed.map((row) => ({
      ROW_NUMBER: row.rowIndex,
      VALIDATION_STATUS: row.action.toUpperCase(),
      VALIDATION_ERRORS: row.errors.join(' | '),
      VALIDATION_WARNINGS: row.warnings.join(' | '),
      ...row.raw,
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `member_import_errors_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const actionableRows = parsedRows.filter((r) => r.action === 'insert' || r.action === 'update');
  const insertRows = parsedRows.filter((r) => r.action === 'insert');
  const updateRows = parsedRows.filter((r) => r.action === 'update');
  const skippedRows = parsedRows.filter((r) => r.action === 'skip');
  const errorRows = parsedRows.filter((r) => !r.isValid);

  const displayedRows = parsedRows.filter((r) => {
    if (filterMode === 'actionable') return r.action === 'insert' || r.action === 'update';
    if (filterMode === 'updates') return r.action === 'update';
    if (filterMode === 'skipped') return r.action === 'skip';
    if (filterMode === 'errors') return !r.isValid;
    return true;
  });

  const seatLimitBlocked = Boolean(licenseStatus?.wouldExceedSeatLimit);

  const handleFinalImport = async () => {
    if (actionableRows.length === 0 || seatLimitBlocked) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const convertedMembers: Person[] = actionableRows.map((r, i) => {
      const d = r.data;
      const initials = `${(d.firstName || 'M')[0]}${(d.lastName || 'M')[0]}`.toUpperCase();
      const generatedId = d.id || `m-import-${Date.now()}-${i}`;

      return {
        id: generatedId,
        tenantId: 'tenant-live',
        firstName: d.firstName || 'Unknown',
        middleName: d.middleName || undefined,
        lastName: d.lastName || 'Member',
        email: d.email || undefined,
        specificLocation: d.specificLocation || undefined,
        remarks: d.remarks || undefined,
        memberId: d.memberId || `MEM-${new Date().getFullYear()}-${String(i + 1).padStart(3, '0')}`,
        squads: d.squads || undefined,
        department: d.department || 'General Congregation',
        departments: Array.isArray(d.departments) ? d.departments : undefined,
        officerName: d.officerName || undefined,
        gender: d.gender || 'other',
        dateOfBirth: d.dateOfBirth || undefined,
        phoneE164: d.phoneE164 || '+233000000000',
        phoneNumber: d.phoneE164,
        placeOfResidence: d.placeOfResidence || undefined,
        residentialDigitalAddress: d.residentialDigitalAddress || undefined,
        hometown: d.hometown || undefined,
        occupation: d.occupation || undefined,
        homeCellGroup: d.homeCellGroup || d.groupName || 'General Congregation',
        groupName: d.homeCellGroup || d.groupName || 'General Congregation',
        monthOfBirth: d.monthOfBirth || undefined,
        maritalStatus: d.maritalStatus || 'Single',
        spouseName: d.spouseName || undefined,
        numberOfChildren: d.numberOfChildren || 0,
        emergencyContactPerson: d.emergencyContactPerson || undefined,
        emergencyContactPhone: d.emergencyContactPhone || undefined,
        imageUrl: d.imageUrl || undefined,
        dateOfBaptism: d.dateOfBaptism || undefined,
        dateOfMarriage: d.dateOfMarriage || undefined,
        dateOfSalvation: d.dateOfSalvation || undefined,
        dateOfMembership: d.dateOfMembership || new Date().toISOString().split('T')[0],
        status: 'member',
        autoCheckinOptedIn: true,
        avatarInitials: initials,
        joinedOn: d.dateOfMembership || new Date().toISOString().split('T')[0],
        consecutiveAbsences: 0,
      };
    });

    try {
      await onImportComplete(convertedMembers, { duplicateMode });
      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setSubmitError(err?.message || 'Failed to complete member import. Please review the errors above.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-3xl w-full max-w-5xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#6D5CF2]/10 dark:bg-[#6D5CF2]/20 flex items-center justify-center text-[#6D5CF2]">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                Import Church Members
                <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-md bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF]">
                  Schema Validated
                </span>
              </h2>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Upload CSV or TSV data with live field, calendar date, duplicate, and seat-quota verification
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-[#1D1D3D] text-[#6D5CF2] border border-[#E9EBF5] dark:border-[#2D2D55] hover:bg-[#EFEDFF]/50 transition-all cursor-pointer"
              title="Download standard CSV template"
            >
              <Download className="w-3.5 h-3.5" />
              Download Template
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close import modal"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-5 pt-3 pb-2 border-b border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#14142E] shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'upload'
                ? 'bg-[#6D5CF2] text-white shadow-xs'
                : 'text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Upload File
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'paste'
                ? 'bg-[#6D5CF2] text-white shadow-xs'
                : 'text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Paste Text
          </button>

          {parsedRows.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'preview'
                  ? 'bg-[#6D5CF2] text-white shadow-xs'
                  : 'text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Preview & Validate ({parsedRows.length})
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {(parseError || submitError) && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{submitError || parseError}</span>
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="flex flex-col items-center justify-center py-8">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`w-full max-w-xl border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-[#6D5CF2] bg-[#EFEDFF]/40 dark:bg-[#2A2A55]/40'
                    : 'border-[#CBC6F7] dark:border-[#3B3B72] hover:border-[#6D5CF2] bg-slate-50/50 dark:bg-white/[0.01] hover:bg-[#EFEDFF]/20'
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] flex items-center justify-center mb-3">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  {isDragging ? 'Drop your CSV/TSV file here' : 'Choose a CSV file or drag and drop here'}
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] max-w-sm mb-4">
                  Supports comma-delimited or tab-delimited CSV/TSV church rosters up to 5 MB.
                </p>

                <button
                  type="button"
                  disabled={isParsing}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] text-white shadow-xs hover:bg-[#5b4be0] transition-all cursor-pointer"
                >
                  {isParsing ? 'Parsing File...' : 'Browse Files'}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, .tsv, .txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* Supported headers quick reference */}
              <div className="w-full max-w-xl mt-6 p-4 rounded-2xl bg-[#F6F7FC] dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2">
                  <Info className="w-3.5 h-3.5 text-[#6D5CF2]" />
                  <span>Recognized Membership Columns (28 Schema Fields + Email):</span>
                </div>
                <div className="flex flex-wrap gap-1 text-[10px] text-[#666A86] dark:text-[#A9ACC8]">
                  {MEMBERSHIP_TABLE_HEADERS.map((h) => (
                    <span
                      key={h.header}
                      className="px-2 py-0.5 rounded-md bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] font-mono"
                    >
                      {h.header}
                    </span>
                  ))}
                  <span className="px-2 py-0.5 rounded-md bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] font-mono">
                    EMAIL
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'paste' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Paste Comma-Separated or Tab-Separated Data:
                </label>
                <textarea
                  rows={10}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="FIRST NAME,MIDDLE NAME,LASTNAME,PHONE NUMBER,EMAIL,SPECIFIC LOCATION,HOME CELL GROUP..."
                  className="w-full p-3 font-mono text-xs rounded-2xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] placeholder-slate-400"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handlePasteParse}
                  disabled={!pastedText.trim() || isParsing}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] text-white hover:bg-[#5b4be0] disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Parse & Validate</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="space-y-4">
              {/* Validation Summary Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-50 dark:bg-[#1D1D3D] p-3 rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55]">
                  <span className="text-[10px] font-bold text-[#666A86] dark:text-[#A9ACC8] uppercase tracking-wider">
                    Total Rows
                  </span>
                  <div className="text-xl font-extrabold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    {summary?.total ?? parsedRows.length}
                  </div>
                </div>

                <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-3 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    New Inserts
                  </span>
                  <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400">
                    {summary?.newInserts ?? insertRows.length}
                  </div>
                </div>

                <div className="bg-indigo-50/70 dark:bg-indigo-950/30 p-3 rounded-2xl border border-indigo-200 dark:border-indigo-800">
                  <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    Updates
                  </span>
                  <div className="text-xl font-extrabold text-indigo-700 dark:text-indigo-400">
                    {summary?.updates ?? updateRows.length}
                  </div>
                </div>

                <div className="bg-amber-50/70 dark:bg-amber-950/30 p-3 rounded-2xl border border-amber-200 dark:border-amber-800">
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    Skipped Dups
                  </span>
                  <div className="text-xl font-extrabold text-amber-700 dark:text-amber-400">
                    {summary?.skipped ?? skippedRows.length}
                  </div>
                </div>

                <div className="bg-rose-50/70 dark:bg-rose-950/30 p-3 rounded-2xl border border-rose-200 dark:border-rose-800">
                  <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Errors
                  </span>
                  <div className="text-xl font-extrabold text-rose-700 dark:text-rose-400">
                    {summary?.invalid ?? errorRows.length}
                  </div>
                </div>
              </div>

              {/* Duplicate Handling & Server Dry-Run Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-[#F6F7FC] dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    Duplicate Handling:
                  </span>
                  {(
                    [
                      { id: 'skip', label: 'Skip Existing' },
                      { id: 'update', label: 'Update Existing' },
                      { id: 'error', label: 'Treat as Errors' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleDuplicateModeChange(opt.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        duplicateMode === opt.id
                          ? 'bg-[#6D5CF2] text-white shadow-xs'
                          : 'bg-white dark:bg-[#14142E] text-[#666A86] dark:text-[#A9ACC8] border border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                      validationSource === 'server'
                        ? 'bg-emerald-100/80 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-200/70 dark:bg-white/10 text-[#666A86] dark:text-[#A9ACC8]'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {isVerifyingServer
                      ? 'Checking Server DB...'
                      : validationSource === 'server'
                      ? 'Server DB Verified'
                      : 'Client Pre-Validated'}
                  </span>

                  {onValidateRemote && (
                    <button
                      type="button"
                      disabled={isVerifyingServer || rawInputRows.length === 0}
                      onClick={() => void runValidation(rawInputRows, duplicateMode, false)}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-[#14142E] text-[#6D5CF2] border border-[#E9EBF5] dark:border-[#2D2D55] hover:bg-[#EFEDFF]/50 transition-all cursor-pointer disabled:opacity-50"
                    >
                      Re-Verify DB
                    </button>
                  )}

                  {errorRows.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDownloadErrorReport}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export Errors CSV ({errorRows.length})
                    </button>
                  )}
                </div>
              </div>

              {/* License Seat Limit Warning */}
              {licenseStatus && licenseStatus.seatsLimit > 0 && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                    seatLimitBlocked
                      ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                      : 'bg-slate-50 dark:bg-white/[0.02] border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8]'
                  }`}
                >
                  <span>
                    License Seat Quota: <b>{licenseStatus.seatsUsed}</b> used / <b>{licenseStatus.seatsLimit}</b> max
                    {summary ? ` (+${summary.newInserts} new inserts, ${summary.updates} updates require 0 extra seats)` : ''}
                  </span>
                  {seatLimitBlocked && (
                    <span className="font-bold">
                      Exceeds limit by {(licenseStatus.seatsUsed + (summary?.newInserts || 0)) - licenseStatus.seatsLimit} seat(s)
                    </span>
                  )}
                </div>
              )}

              {/* Filter Row */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Filter className="w-3.5 h-3.5 text-[#666A86] dark:text-[#A9ACC8]" />
                  <span className="text-xs font-bold text-[#666A86] dark:text-[#A9ACC8]">Filter:</span>

                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      filterMode === 'all'
                        ? 'bg-[#6D5CF2] text-white'
                        : 'bg-slate-100 dark:bg-[#1D1D3D] text-[#666A86] dark:text-[#A9ACC8]'
                    }`}
                  >
                    All ({parsedRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('actionable')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      filterMode === 'actionable'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    To Import ({actionableRows.length})
                  </button>
                  {updateRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterMode('updates')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                        filterMode === 'updates'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400'
                      }`}
                    >
                      Updates ({updateRows.length})
                    </button>
                  )}
                  {skippedRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterMode('skipped')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                        filterMode === 'skipped'
                          ? 'bg-amber-600 text-white'
                          : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      Skipped ({skippedRows.length})
                    </button>
                  )}
                  {errorRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterMode('errors')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                        filterMode === 'errors'
                          ? 'bg-rose-600 text-white'
                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      Errors ({errorRows.length})
                    </button>
                  )}
                </div>

                {fileName && (
                  <span className="text-xs font-mono text-[#666A86] dark:text-[#A9ACC8] truncate max-w-xs">
                    File: {fileName}
                  </span>
                )}
              </div>

              {/* Data Preview Table */}
              <div className="border border-[#E9EBF5] dark:border-[#2D2D55] rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-[360px]">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-[#1D1D3D] border-b border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8] z-10 font-bold">
                      <tr>
                        <th className="p-2.5 w-12 text-center">Row</th>
                        <th className="p-2.5 w-24">Action</th>
                        <th className="p-2.5">FIRST NAME</th>
                        <th className="p-2.5">MIDDLE NAME</th>
                        <th className="p-2.5">LASTNAME</th>
                        <th className="p-2.5">PHONE NUMBER</th>
                        <th className="p-2.5">EMAIL</th>
                        <th className="p-2.5">ID</th>
                        <th className="p-2.5">DEPARTMENT</th>
                        <th className="p-2.5">HOME CELL GROUP</th>
                        <th className="p-2.5">DATE OF BIRTH</th>
                        <th className="p-2.5">MARITAL STATUS</th>
                        <th className="p-2.5">Validation Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55]">
                      {displayedRows.map((row) => (
                        <tr
                          key={row.rowIndex}
                          className={`${
                            row.action === 'error'
                              ? 'bg-rose-50/40 dark:bg-rose-950/20'
                              : row.action === 'skip'
                              ? 'bg-amber-50/30 dark:bg-amber-950/15'
                              : row.action === 'update'
                              ? 'bg-indigo-50/30 dark:bg-indigo-950/15'
                              : 'hover:bg-slate-50 dark:hover:bg-white/5'
                          } transition-colors`}
                        >
                          <td className="p-2.5 text-center font-mono text-[#666A86] dark:text-[#A9ACC8]">
                            {row.rowIndex}
                          </td>
                          <td className="p-2.5">
                            {row.action === 'insert' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                                <Check className="w-3 h-3" />
                                Insert
                              </span>
                            )}
                            {row.action === 'update' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400">
                                <RefreshCw className="w-3 h-3" />
                                Update
                              </span>
                            )}
                            {row.action === 'skip' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
                                Skip
                              </span>
                            )}
                            {row.action === 'error' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400">
                                <AlertTriangle className="w-3 h-3" />
                                Error
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                            {row.data.firstName || <span className="text-rose-500 italic">Missing</span>}
                          </td>
                          <td className="p-2.5 text-[#666A86] dark:text-[#A9ACC8]">
                            {row.data.middleName || '-'}
                          </td>
                          <td className="p-2.5 font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                            {row.data.lastName || <span className="text-rose-500 italic">Missing</span>}
                          </td>
                          <td className="p-2.5 font-mono text-[#1D1B3A] dark:text-[#F2F2FA]">
                            {row.data.phoneE164 || <span className="text-rose-500 italic">Missing</span>}
                          </td>
                          <td className="p-2.5 text-[#666A86] dark:text-[#A9ACC8]">
                            {row.data.email || '-'}
                          </td>
                          <td className="p-2.5 font-mono text-[#6D5CF2]">
                            {row.data.memberId || '-'}
                          </td>
                          <td className="p-2.5 text-[#666A86] dark:text-[#A9ACC8]">
                            {row.data.department || '-'}
                          </td>
                          <td className="p-2.5 text-[#666A86] dark:text-[#A9ACC8]">
                            {row.data.homeCellGroup || '-'}
                          </td>
                          <td className="p-2.5 font-mono text-[#666A86] dark:text-[#A9ACC8]">
                            {row.data.dateOfBirth || '-'}
                          </td>
                          <td className="p-2.5 text-[#666A86] dark:text-[#A9ACC8]">
                            {row.data.maritalStatus || 'Single'}
                          </td>
                          <td className="p-2.5 max-w-md whitespace-normal">
                            {row.errors.length > 0 && (
                              <div className="text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
                                {row.errors.join('; ')}
                              </div>
                            )}
                            {row.warnings.length > 0 && (
                              <div className="text-amber-600 dark:text-amber-400 text-[10px]">
                                {row.warnings.join('; ')}
                              </div>
                            )}
                            {row.errors.length === 0 && row.warnings.length === 0 && (
                              <span className="text-slate-400 text-[10px]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between gap-2 shrink-0 flex-wrap">
          <div className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
            {parsedRows.length > 0 ? (
              <span>
                Ready to process <b className="text-emerald-600 dark:text-emerald-400">{insertRows.length}</b> new
                {updateRows.length > 0 && (
                  <>
                    {' '}
                    + <b className="text-indigo-600 dark:text-indigo-400">{updateRows.length}</b> updates
                  </>
                )}
                .
                {skippedRows.length > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 ml-1">
                    ({skippedRows.length} duplicate rows skipped)
                  </span>
                )}
                {errorRows.length > 0 && (
                  <span className="text-rose-500 ml-1">
                    ({errorRows.length} invalid rows excluded)
                  </span>
                )}
                <span className="block text-[11px] text-[#8F93AF] dark:text-[#7A7E9F] mt-0.5">
                  Imported members with a phone number or email automatically receive Member Portal credentials with a temporary generic password they can change.
                </span>
              </span>
            ) : (
              <span>Upload or paste members data to preview validation.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-200/50 dark:hover:bg-white/5 transition-all cursor-pointer"
            >
              Cancel
            </button>

            {parsedRows.length > 0 && (
              <button
                type="button"
                onClick={handleFinalImport}
                disabled={actionableRows.length === 0 || isSubmitting || seatLimitBlocked}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] text-white hover:bg-[#5b4be0] disabled:opacity-50 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>
                  {actionableRows.length > 0
                    ? `Import ${actionableRows.length} Member${actionableRows.length === 1 ? '' : 's'}`
                    : 'No Importable Rows'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
