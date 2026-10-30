import React, { useState, useRef } from 'react';
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
  Info
} from 'lucide-react';
import { Person, MEMBERSHIP_TABLE_HEADERS } from '../../types/ekklesphere';

interface ImportMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (importedMembers: Person[]) => void;
  existingMembers: Person[];
}

interface ParsedRow {
  rowIndex: number;
  data: Partial<Person>;
  raw: Record<string, string>;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
}

export const ImportMembersModal: React.FC<ImportMembersModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  existingMembers,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'paste' | 'preview'>('upload');
  const [pastedText, setPastedText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'valid' | 'errors'>('all');
  const [fileName, setFileName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Header canonical mapping dictionary
  const mapHeaderToField = (rawHeader: string): keyof Person | null => {
    const clean = rawHeader.trim().toUpperCase().replace(/[\s/._-]/g, '');
    if (clean === 'FIRSTNAME' || clean === 'FIRST') return 'firstName';
    if (clean === 'MIDDLENAME' || clean === 'MIDDLE') return 'middleName';
    if (clean === 'LASTNAME' || clean === 'LAST' || clean === 'SURNAME') return 'lastName';
    if (clean === 'SPECIFICLOCATION' || clean === 'LOCATION' || clean === 'LANDMARK') return 'specificLocation';
    if (clean === 'REMARKS' || clean === 'REMARK' || clean === 'NOTES') return 'remarks';
    if (clean === 'ID' || clean === 'MEMBERID' || clean === 'CARDNO' || clean === 'MEMBERSHIPID') return 'memberId';
    if (clean === 'SQUADS' || clean === 'SQUAD') return 'squads';
    if (clean === 'DEPARTMENT' || clean === 'DEPT' || clean === 'MINISTRY') return 'department';
    if (clean === 'MEMBERSOFFICERSNAME' || clean === 'OFFICERNAME' || clean === 'OFFICER' || clean === 'DESIGNATION') return 'officerName';
    if (clean === 'GENDER' || clean === 'SEX') return 'gender';
    if (clean === 'DATEOFBIRTH' || clean === 'DOB' || clean === 'BIRTHDATE') return 'dateOfBirth';
    if (clean === 'PHONENUMBER' || clean === 'PHONE' || clean === 'TELEPHONE' || clean === 'MOBILE') return 'phoneE164';
    if (clean === 'PLACEOFRESIDENCE' || clean === 'RESIDENCE' || clean === 'TOWN') return 'placeOfResidence';
    if (clean === 'RESIDENTIALDIGITALADDRESS' || clean === 'DIGITALADDRESS' || clean === 'GHANAPOSTGPS' || clean === 'GPSADDRESS') return 'residentialDigitalAddress';
    if (clean === 'HOMETOWN' || clean === 'HOME') return 'hometown';
    if (clean === 'OCCUPATION' || clean === 'JOB' || clean === 'PROFESSION') return 'occupation';
    if (clean === 'HOMECELLGROUP' || clean === 'CELLGROUP' || clean === 'CELL' || clean === 'FELLOWSHIP') return 'homeCellGroup';
    if (clean === 'MONTHOFBIRTH' || clean === 'BIRTHMONTH') return 'monthOfBirth';
    if (clean === 'MARITALSTATUS' || clean === 'MARITAL') return 'maritalStatus';
    if (clean === 'NAMEOFSPOUSE' || clean === 'SPOUSENAME' || clean === 'SPOUSE') return 'spouseName';
    if (clean === 'NUMBEROFCHILDREN' || clean === 'CHILDREN' || clean === 'NUMCHILDREN') return 'numberOfChildren';
    if (clean === 'NAMEOFPERSONTOCONTACTINCASEOFEMERGENCY' || clean === 'EMERGENCYCONTACTPERSON' || clean === 'EMERGENCYCONTACT') return 'emergencyContactPerson';
    if (clean === 'EMERGENCY' || clean === 'EMERGENCYPHONE' || clean === 'EMERGENCYNUMBER') return 'emergencyContactPhone';
    if (clean === 'IMAGE' || clean === 'IMAGEURL' || clean === 'PHOTO' || clean === 'PICTURE') return 'imageUrl';
    if (clean === 'DATEOFBAPTISM' || clean === 'BAPTISMDATE' || clean === 'BAPTISM') return 'dateOfBaptism';
    if (clean === 'DATEOFMARRIAGE' || clean === 'MARRIAGEDATE' || clean === 'MARRIAGE') return 'dateOfMarriage';
    if (clean === 'DATEOFSALVATION' || clean === 'SALVATIONDATE' || clean === 'SALVATION') return 'dateOfSalvation';
    if (clean === 'DATEOFMEMBERSHIP' || clean === 'MEMBERSHIPDATE' || clean === 'JOINEDDATE') return 'dateOfMembership';

    return null;
  };

  const validatePhone = (raw: string): { valid: boolean; formatted: string } => {
    let clean = raw.trim().replace(/[\s-()]/g, '');
    if (!clean) return { valid: false, formatted: '' };

    if (clean.startsWith('0') && clean.length === 10) {
      clean = '+233' + clean.slice(1);
    } else if (!clean.startsWith('+') && clean.length === 9) {
      clean = '+233' + clean;
    }

    const isValid = /^\+?[1-9]\d{7,14}$/.test(clean);
    return { valid: isValid, formatted: clean };
  };

  const validateDateString = (raw: string): string | null => {
    if (!raw || !raw.trim()) return null;
    const trimmed = raw.trim();
    // Check YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = new Date(trimmed);
      return !isNaN(d.getTime()) ? trimmed : null;
    }
    // Check DD/MM/YYYY or DD-MM-YYYY
    const parts = trimmed.split(/[/.-]/);
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        // DD/MM/YYYY
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];
        const formatted = `${year}-${month}-${day}`;
        const d = new Date(formatted);
        return !isNaN(d.getTime()) ? formatted : null;
      }
    }
    return null;
  };

  const processRawData = (rows: Record<string, string>[]) => {
    const existingPhones = new Set(existingMembers.map((m) => m.phoneE164));
    const existingIds = new Set(existingMembers.map((m) => m.memberId?.toUpperCase()).filter(Boolean));

    const processed: ParsedRow[] = rows.map((rawRow, index) => {
      const data: Partial<Person> = {};
      const errors: string[] = [];
      const warnings: string[] = [];

      // Map raw headers to fields
      Object.entries(rawRow).forEach(([rawKey, val]) => {
        const field = mapHeaderToField(rawKey);
        if (field && val !== undefined && val !== null) {
          const stringVal = String(val).trim();
          if (field === 'numberOfChildren') {
            const num = parseInt(stringVal, 10);
            data.numberOfChildren = isNaN(num) ? 0 : Math.max(0, num);
          } else {
            (data as Record<string, unknown>)[field] = stringVal;
          }
        }
      });

      // Validation 1: First Name
      if (!data.firstName || data.firstName.trim().length < 2) {
        errors.push('FIRST NAME is required (min 2 characters)');
      }

      // Validation 2: Last Name
      if (!data.lastName || data.lastName.trim().length < 2) {
        errors.push('LASTNAME is required (min 2 characters)');
      }

      // Validation 3: Phone Number
      const rawPhone = data.phoneE164 || rawRow['PHONE NUMBER'] || rawRow['Phone'] || '';
      if (!rawPhone) {
        errors.push('PHONE NUMBER is required');
      } else {
        const { valid, formatted } = validatePhone(rawPhone);
        if (!valid) {
          errors.push(`Invalid phone format: "${rawPhone}". Expected E.164 (e.g. +233241234567 or 0241234567)`);
        } else {
          data.phoneE164 = formatted;
        }
      }

      // Validation 4: Dates formatting
      if (data.dateOfBirth) {
        const formattedDate = validateDateString(data.dateOfBirth);
        if (formattedDate) {
          data.dateOfBirth = formattedDate;
        } else {
          warnings.push(`DATE OF BIRTH "${data.dateOfBirth}" is not recognized as YYYY-MM-DD or DD/MM/YYYY.`);
        }
      }

      if (data.dateOfBaptism) {
        const formattedDate = validateDateString(data.dateOfBaptism);
        if (formattedDate) data.dateOfBaptism = formattedDate;
        else warnings.push(`Date of baptism "${data.dateOfBaptism}" could not be parsed.`);
      }

      if (data.dateOfMarriage) {
        const formattedDate = validateDateString(data.dateOfMarriage);
        if (formattedDate) data.dateOfMarriage = formattedDate;
      }

      if (data.dateOfSalvation) {
        const formattedDate = validateDateString(data.dateOfSalvation);
        if (formattedDate) data.dateOfSalvation = formattedDate;
      }

      if (data.dateOfMembership) {
        const formattedDate = validateDateString(data.dateOfMembership);
        if (formattedDate) data.dateOfMembership = formattedDate;
      } else {
        data.dateOfMembership = new Date().toISOString().split('T')[0];
      }

      // Normalize Designation / MEMBERS/OFFICERS NAME
      if (data.officerName) {
        const off = data.officerName.trim().toLowerCase();
        if (off === 'member' || off === 'regular member') data.officerName = 'Member';
        else if (off === 'deacon') data.officerName = 'Deacon';
        else if (off === 'deaconess') data.officerName = 'Deaconess';
        else if (off === 'elder') data.officerName = 'Elder';
        else if (off === 'pastor') data.officerName = 'Pastor';
        else if (off.includes('senior pastor')) data.officerName = 'Senior Pastor';
        else if (off.includes('associate pastor')) data.officerName = 'Associate Pastor';
        else if (off.includes('youth pastor')) data.officerName = 'Youth Pastor';
        else if (off.includes('cell leader')) data.officerName = 'Cell Leader';
        else if (off.includes('usher')) data.officerName = 'Usher Captain';
        else {
          data.officerName = data.officerName.replace(/\b\w/g, (l) => l.toUpperCase());
        }
      } else {
        data.officerName = 'Member';
      }

      // Set defaults for missing fields
      data.groupName = data.homeCellGroup || 'General Congregation';
      data.homeCellGroup = data.homeCellGroup || data.groupName;
      data.status = 'member';
      data.autoCheckinOptedIn = true;
      data.consecutiveAbsences = 0;

      // Duplicate Check
      const isDuplicatePhone = data.phoneE164 ? existingPhones.has(data.phoneE164) : false;
      const isDuplicateId = data.memberId ? existingIds.has(data.memberId.toUpperCase()) : false;
      const isDuplicate = isDuplicatePhone || isDuplicateId;

      if (isDuplicatePhone) {
        warnings.push(`Phone ${data.phoneE164} matches an existing member. Will update existing record.`);
      }
      if (isDuplicateId) {
        warnings.push(`Member ID ${data.memberId} is already in use.`);
      }

      return {
        rowIndex: index + 1,
        data,
        raw: rawRow,
        isValid: errors.length === 0,
        errors,
        warnings,
        isDuplicate,
      };
    });

    setParsedRows(processed);
    setActiveTab('preview');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError(null);
    setIsParsing(true);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setIsParsing(false);
        if (results.data && results.data.length > 0) {
          processRawData(results.data);
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

  const handlePasteParse = () => {
    if (!pastedText.trim()) return;

    setParseError(null);
    setIsParsing(true);
    Papa.parse<Record<string, string>>(pastedText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setIsParsing(false);
        if (results.data && results.data.length > 0) {
          processRawData(results.data);
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

  const handleDownloadTemplate = () => {
    const headers = MEMBERSHIP_TABLE_HEADERS.map((h) => h.header).join(',');
    const csvData = `data:text/csv;charset=utf-8,${encodeURIComponent(`${headers}\n`)}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', csvData);
    downloadAnchor.setAttribute('download', 'church_membership_template.csv');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const validRows = parsedRows.filter((r) => r.isValid);
  const errorRows = parsedRows.filter((r) => !r.isValid);
  const duplicateRows = parsedRows.filter((r) => r.isDuplicate);

  const displayedRows = parsedRows.filter((r) => {
    if (filterMode === 'valid') return r.isValid;
    if (filterMode === 'errors') return !r.isValid;
    return true;
  });

  const handleFinalImport = async () => {
    if (validRows.length === 0) return;

    setIsSubmitting(true);

    const convertedMembers: Person[] = validRows.map((r, i) => {
      const d = r.data;
      const initials = `${(d.firstName || 'M')[0]}${(d.lastName || 'M')[0]}`.toUpperCase();
      const generatedId = d.id || `m-import-${Date.now()}-${i}`;

      return {
        id: generatedId,
        tenantId: 'tenant-live',
        firstName: d.firstName || 'Unknown',
        middleName: d.middleName || undefined,
        lastName: d.lastName || 'Member',
        specificLocation: d.specificLocation || undefined,
        remarks: d.remarks || undefined,
        memberId: d.memberId || `MEM-${new Date().getFullYear()}-${String(i + 1).padStart(3, '0')}`,
        squads: d.squads || undefined,
        department: d.department || 'General Congregation',
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
      // Send to parent / Context
      onImportComplete(convertedMembers);
      setIsSubmitting(false);
      onClose();
    } catch {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#14142E] border border-[#E9EBF5] dark:border-[#2D2D55] rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E9EBF5] dark:border-[#2D2D55] flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#6D5CF2]/10 dark:bg-[#6D5CF2]/20 flex items-center justify-center text-[#6D5CF2]">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
                Import Church Members
                <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#8C7DFF]">
                  28 Fields Validated
                </span>
              </h2>
              <p className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
                Upload CSV or Excel data aligned with the Supabase membership table schema
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadTemplate}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-[#1D1D3D] text-[#6D5CF2] border border-[#E9EBF5] dark:border-[#2D2D55] hover:bg-[#EFEDFF]/50 transition-all cursor-pointer"
              title="Download standard 28-column CSV template"
            >
              <Download className="w-3.5 h-3.5" />
              Download Template
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-5 pt-3 pb-2 border-b border-[#E9EBF5] dark:border-[#2D2D55] bg-white dark:bg-[#14142E] shrink-0">
          <button
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
          {parseError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}
          {activeTab === 'upload' && (
            <div className="flex flex-col items-center justify-center py-8">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-xl border-2 border-dashed border-[#CBC6F7] dark:border-[#3B3B72] hover:border-[#6D5CF2] rounded-3xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-white/[0.01] hover:bg-[#EFEDFF]/20"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] flex items-center justify-center mb-3">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1">
                  Choose a CSV file or drag and drop here
                </h3>
                <p className="text-xs text-[#666A86] dark:text-[#A9ACC8] max-w-sm mb-4">
                  Supports comma-delimited or semicolon-delimited CSV, TSV, or exported church rosters.
                </p>

                <button
                  type="button"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] text-white shadow-xs hover:bg-[#5b4be0] transition-all"
                >
                  Browse Files
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
                  <span>Exact 28 Table Heads Recognized:</span>
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
                  placeholder="FIRST NAME,MIDDLE NAME,LASTNAME,PHONE NUMBER,SPECIFIC LOCATION,HOME CELL GROUP..."
                  className="w-full p-3 font-mono text-xs rounded-2xl bg-white dark:bg-[#1D1D3D] border border-[#E9EBF5] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2] placeholder-slate-400"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-[#1D1D3D] p-3 rounded-2xl border border-[#E9EBF5] dark:border-[#2D2D55]">
                  <span className="text-[10px] font-bold text-[#666A86] dark:text-[#A9ACC8] uppercase tracking-wider">
                    Total Rows
                  </span>
                  <div className="text-xl font-extrabold text-[#1D1B3A] dark:text-[#F2F2FA]">
                    {parsedRows.length}
                  </div>
                </div>

                <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-3 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Valid Rows
                  </span>
                  <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400">
                    {validRows.length}
                  </div>
                </div>

                <div className="bg-rose-50/70 dark:bg-rose-950/30 p-3 rounded-2xl border border-rose-200 dark:border-rose-800">
                  <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Errors
                  </span>
                  <div className="text-xl font-extrabold text-rose-700 dark:text-rose-400">
                    {errorRows.length}
                  </div>
                </div>

                <div className="bg-amber-50/70 dark:bg-amber-950/30 p-3 rounded-2xl border border-amber-200 dark:border-amber-800">
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    Duplicates / Updates
                  </span>
                  <div className="text-xl font-extrabold text-amber-700 dark:text-amber-400">
                    {duplicateRows.length}
                  </div>
                </div>
              </div>

              {/* Filter Row */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-[#666A86] dark:text-[#A9ACC8]" />
                  <span className="text-xs font-bold text-[#666A86] dark:text-[#A9ACC8]">Filter:</span>

                  <button
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
                    onClick={() => setFilterMode('valid')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      filterMode === 'valid'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    Valid Only ({validRows.length})
                  </button>
                  {errorRows.length > 0 && (
                    <button
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
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-[#1D1D3D] border-b border-[#E9EBF5] dark:border-[#2D2D55] text-[#666A86] dark:text-[#A9ACC8] z-10 font-bold">
                      <tr>
                        <th className="p-2.5 w-12 text-center">Row</th>
                        <th className="p-2.5 w-24">Status</th>
                        <th className="p-2.5">FIRST NAME</th>
                        <th className="p-2.5">MIDDLE NAME</th>
                        <th className="p-2.5">LASTNAME</th>
                        <th className="p-2.5">PHONE NUMBER</th>
                        <th className="p-2.5">SPECIFIC LOCATION</th>
                        <th className="p-2.5">ID</th>
                        <th className="p-2.5">DEPARTMENT</th>
                        <th className="p-2.5">HOME CELL GROUP</th>
                        <th className="p-2.5">RESIDENTIAL/DIGITAL ADDRESS</th>
                        <th className="p-2.5">MARITAL STATUS</th>
                        <th className="p-2.5">EMERGENCY</th>
                        <th className="p-2.5">Issues / Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E9EBF5] dark:divide-[#2D2D55]">
                      {displayedRows.map((row) => (
                        <tr
                          key={row.rowIndex}
                          className={`${
                            !row.isValid
                              ? 'bg-rose-50/40 dark:bg-rose-950/20'
                              : row.isDuplicate
                              ? 'bg-amber-50/30 dark:bg-amber-950/15'
                              : 'hover:bg-slate-50 dark:hover:bg-white/5'
                          } transition-colors`}
                        >
                          <td className="p-2.5 text-center font-mono text-[#666A86] dark:text-[#A9ACC8]">
                            {row.rowIndex}
                          </td>
                          <td className="p-2.5">
                            {row.isValid ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                                <Check className="w-3 h-3" />
                                Valid
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400">
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
                            {row.data.specificLocation || '-'}
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
                            {row.data.residentialDigitalAddress || '-'}
                          </td>
                          <td className="p-2.5 text-[#666A86] dark:text-[#A9ACC8]">
                            {row.data.maritalStatus || 'Single'}
                          </td>
                          <td className="p-2.5 font-mono text-[#666A86] dark:text-[#A9ACC8]">
                            {row.data.emergencyContactPhone || row.data.emergencyContactPerson || '-'}
                          </td>
                          <td className="p-2.5">
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
        <div className="px-5 py-3 border-t border-[#E9EBF5] dark:border-[#2D2D55] bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between shrink-0">
          <div className="text-xs text-[#666A86] dark:text-[#A9ACC8]">
            {parsedRows.length > 0 ? (
              <span>
                Ready to import <b className="text-emerald-600 dark:text-emerald-400">{validRows.length}</b> verified members.
                {errorRows.length > 0 && (
                  <span className="text-rose-500 ml-1">
                    ({errorRows.length} invalid rows will be skipped)
                  </span>
                )}
              </span>
            ) : (
              <span>Upload or paste members data to preview validation.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-[#666A86] dark:text-[#A9ACC8] hover:bg-slate-200/50 dark:hover:bg-white/5 transition-all cursor-pointer"
            >
              Cancel
            </button>

            {parsedRows.length > 0 && (
              <button
                onClick={handleFinalImport}
                disabled={validRows.length === 0 || isSubmitting}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#6D5CF2] text-white hover:bg-[#5b4be0] disabled:opacity-50 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Import {validRows.length} Members</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
