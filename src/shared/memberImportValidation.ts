import type { Person } from '../types/ekklesphere';
import {
  deriveMonthOfBirth,
  formatBirthMonthGroupName,
  normalizeMonthName,
} from '../utils/birthMonth';
import { normalizeMemberDepartmentFields } from '../utils/memberDepartments';

export type ImportDuplicateMode = 'skip' | 'update' | 'error';

export interface MemberImportValidationSummary {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  intraFileDuplicates: number;
  newInserts: number;
  updates: number;
  skipped: number;
}

export interface ValidatedImportRow {
  rowIndex: number;
  data: Partial<Person>;
  raw: Record<string, string>;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
  isIntraFileDuplicate: boolean;
  matchedMemberId?: string;
  action: 'insert' | 'update' | 'skip' | 'error';
}

export interface ExistingMemberIndexEntry {
  id: string;
  memberId?: string;
  phoneE164?: string;
  email?: string;
}

export function mapHeaderToMemberField(rawHeader: string): keyof Person | null {
  const clean = rawHeader.trim().toUpperCase().replace(/[\s/._-]/g, '');
  if (clean === 'FIRSTNAME' || clean === 'FIRST') return 'firstName';
  if (clean === 'MIDDLENAME' || clean === 'MIDDLE') return 'middleName';
  if (clean === 'LASTNAME' || clean === 'LAST' || clean === 'SURNAME') return 'lastName';
  if (clean === 'EMAIL' || clean === 'EMAILADDRESS' || clean === 'MAIL') return 'email';
  if (clean === 'SPECIFICLOCATION' || clean === 'LOCATION' || clean === 'LANDMARK') return 'specificLocation';
  if (clean === 'REMARKS' || clean === 'REMARK' || clean === 'NOTES') return 'remarks';
  if (clean === 'ID' || clean === 'MEMBERID' || clean === 'CARDNO' || clean === 'MEMBERSHIPID') return 'memberId';
  if (clean === 'SQUADS' || clean === 'SQUAD') return 'squads';
  if (clean === 'DEPARTMENT' || clean === 'DEPT' || clean === 'MINISTRY') return 'department';
  if (
    clean === 'MEMBERSOFFICERSNAME' ||
    clean === 'OFFICERNAME' ||
    clean === 'OFFICER' ||
    clean === 'DESIGNATION'
  ) {
    return 'officerName';
  }
  if (clean === 'GENDER' || clean === 'SEX') return 'gender';
  if (clean === 'DATEOFBIRTH' || clean === 'DOB' || clean === 'BIRTHDATE') return 'dateOfBirth';
  if (
    clean === 'PHONENUMBER' ||
    clean === 'PHONE' ||
    clean === 'PHONEE164' ||
    clean === 'TELEPHONE' ||
    clean === 'MOBILE'
  ) {
    return 'phoneE164';
  }
  if (clean === 'PLACEOFRESIDENCE' || clean === 'RESIDENCE' || clean === 'TOWN') return 'placeOfResidence';
  if (
    clean === 'RESIDENTIALDIGITALADDRESS' ||
    clean === 'DIGITALADDRESS' ||
    clean === 'GHANAPOSTGPS' ||
    clean === 'GPSADDRESS'
  ) {
    return 'residentialDigitalAddress';
  }
  if (clean === 'HOMETOWN' || clean === 'HOME') return 'hometown';
  if (clean === 'OCCUPATION' || clean === 'JOB' || clean === 'PROFESSION') return 'occupation';
  if (
    clean === 'HOMECELLGROUP' ||
    clean === 'CELLGROUP' ||
    clean === 'CELL' ||
    clean === 'FELLOWSHIP' ||
    clean === 'GROUPNAME'
  ) {
    return 'homeCellGroup';
  }
  if (clean === 'MONTHOFBIRTH' || clean === 'BIRTHMONTH') return 'monthOfBirth';
  if (clean === 'MARITALSTATUS' || clean === 'MARITAL') return 'maritalStatus';
  if (clean === 'NAMEOFSPOUSE' || clean === 'SPOUSENAME' || clean === 'SPOUSE') return 'spouseName';
  if (clean === 'NUMBEROFCHILDREN' || clean === 'CHILDREN' || clean === 'NUMCHILDREN') return 'numberOfChildren';
  if (
    clean === 'NAMEOFPERSONTOCONTACTINCASEOFEMERGENCY' ||
    clean === 'EMERGENCYCONTACTPERSON' ||
    clean === 'EMERGENCYCONTACT'
  ) {
    return 'emergencyContactPerson';
  }
  if (clean === 'EMERGENCY' || clean === 'EMERGENCYPHONE' || clean === 'EMERGENCYNUMBER') {
    return 'emergencyContactPhone';
  }
  if (clean === 'IMAGE' || clean === 'IMAGEURL' || clean === 'PHOTO' || clean === 'PICTURE') return 'imageUrl';
  if (clean === 'DATEOFBAPTISM' || clean === 'BAPTISMDATE' || clean === 'BAPTISM') return 'dateOfBaptism';
  if (clean === 'DATEOFMARRIAGE' || clean === 'MARRIAGEDATE' || clean === 'MARRIAGE') return 'dateOfMarriage';
  if (clean === 'DATEOFSALVATION' || clean === 'SALVATIONDATE' || clean === 'SALVATION') return 'dateOfSalvation';
  if (clean === 'DATEOFMEMBERSHIP' || clean === 'MEMBERSHIPDATE' || clean === 'JOINEDDATE') return 'dateOfMembership';

  return null;
}

export function validateAndFormatPhone(raw: string): { valid: boolean; formatted: string } {
  let clean = raw.trim().replace(/[\s\-().]/g, '');
  if (!clean) return { valid: false, formatted: '' };

  if (clean.startsWith('00')) {
    clean = `+${clean.slice(2)}`;
  } else if (clean.startsWith('0') && clean.length === 10) {
    clean = `+233${clean.slice(1)}`;
  } else if (!clean.startsWith('+') && clean.length === 9) {
    clean = `+233${clean}`;
  } else if (!clean.startsWith('+') && clean.length >= 10 && clean.length <= 15) {
    clean = `+${clean}`;
  }

  const isValid = /^\+[1-9]\d{7,14}$/.test(clean);
  return { valid: isValid, formatted: clean };
}

function isExactCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

export function validateStrictIsoDate(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!isExactCalendarDate(year, month, day)) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (!isExactCalendarDate(year, month, day)) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

function normalizeOfficerName(raw?: string): string {
  if (!raw || !raw.trim()) return 'Member';
  const off = raw.trim().toLowerCase();
  if (off === 'member' || off === 'regular member') return 'Member';
  if (off === 'deacon') return 'Deacon';
  if (off === 'deaconess') return 'Deaconess';
  if (off === 'elder') return 'Elder';
  if (off === 'pastor') return 'Pastor';
  if (off.includes('senior pastor')) return 'Senior Pastor';
  if (off.includes('associate pastor')) return 'Associate Pastor';
  if (off.includes('youth pastor')) return 'Youth Pastor';
  if (off.includes('cell leader')) return 'Cell Leader';
  if (off.includes('usher')) return 'Usher Captain';
  return raw.trim().replace(/\b\w/g, (l) => l.toUpperCase());
}

function normalizeGender(raw?: string): { valid: boolean; value?: 'male' | 'female' | 'other' } {
  if (!raw || !raw.trim()) return { valid: true, value: undefined };
  const g = raw.trim().toLowerCase();
  if (g === 'm' || g === 'male' || g === 'man') return { valid: true, value: 'male' };
  if (g === 'f' || g === 'female' || g === 'woman') return { valid: true, value: 'female' };
  if (g === 'o' || g === 'other') return { valid: true, value: 'other' };
  return { valid: false };
}

function normalizeMaritalStatus(raw?: string): { valid: boolean; value?: string } {
  if (!raw || !raw.trim()) return { valid: true, value: undefined };
  const m = raw.trim().toLowerCase();
  if (m === 'single' || m === 'unmarried') return { valid: true, value: 'Single' };
  if (m === 'married') return { valid: true, value: 'Married' };
  if (m === 'widowed' || m === 'widow' || m === 'widower') return { valid: true, value: 'Widowed' };
  if (m === 'divorced' || m === 'separated') return { valid: true, value: 'Divorced' };
  return { valid: false };
}

export function validateMemberImportBatch(
  rawRows: Record<string, unknown>[],
  existingMembers: ExistingMemberIndexEntry[],
  duplicateMode: ImportDuplicateMode = 'skip'
): {
  rows: ValidatedImportRow[];
  summary: MemberImportValidationSummary;
} {
  const existingByPhone = new Map<string, string>();
  const existingByMemberId = new Map<string, string>();
  const existingByEmail = new Map<string, string>();

  for (const m of existingMembers) {
    if (m.phoneE164) {
      const { valid, formatted } = validateAndFormatPhone(m.phoneE164);
      if (valid) existingByPhone.set(formatted, m.id);
    }
    if (m.memberId) {
      existingByMemberId.set(m.memberId.trim().toUpperCase(), m.id);
    }
    if (m.email) {
      existingByEmail.set(m.email.trim().toLowerCase(), m.id);
    }
  }

  const seenPhonesInFile = new Set<string>();
  const seenMemberIdsInFile = new Set<string>();
  const seenEmailsInFile = new Set<string>();

  const todayIso = new Date().toISOString().split('T')[0];

  const validatedRows: ValidatedImportRow[] = rawRows.map((inputRow, index) => {
    const raw: Record<string, string> = {};
    const data: Partial<Person> = {};
    const errors: string[] = [];
    const warnings: string[] = [];

    let rawChildrenValue: string | undefined;

    Object.entries(inputRow || {}).forEach(([rawKey, val]) => {
      if (val === undefined || val === null) return;
      const stringVal = String(val).trim();
      raw[rawKey] = stringVal;

      const directKeys: (keyof Person)[] = [
        'firstName',
        'middleName',
        'lastName',
        'email',
        'specificLocation',
        'remarks',
        'memberId',
        'squads',
        'department',
        'officerName',
        'gender',
        'dateOfBirth',
        'phoneE164',
        'phoneNumber',
        'placeOfResidence',
        'residentialDigitalAddress',
        'hometown',
        'occupation',
        'homeCellGroup',
        'groupName',
        'monthOfBirth',
        'maritalStatus',
        'spouseName',
        'numberOfChildren',
        'emergencyContactPerson',
        'emergencyContactPhone',
        'imageUrl',
        'dateOfBaptism',
        'dateOfMarriage',
        'dateOfSalvation',
        'dateOfMembership',
      ];

      const field = directKeys.includes(rawKey as keyof Person)
        ? (rawKey as keyof Person)
        : mapHeaderToMemberField(rawKey);

      if (!field || stringVal === '') return;

      if (field === 'numberOfChildren') {
        rawChildrenValue = stringVal;
      } else {
        (data as Record<string, unknown>)[field] = stringVal;
      }
    });

    // 1. Required Name checks
    if (!data.firstName || data.firstName.trim().length < 2) {
      errors.push('FIRST NAME is required (minimum 2 characters).');
    } else {
      data.firstName = data.firstName.trim();
    }

    if (!data.lastName || data.lastName.trim().length < 2) {
      errors.push('LASTNAME is required (minimum 2 characters).');
    } else {
      data.lastName = data.lastName.trim();
    }

    // 2. Phone number check
    const rawPhone =
      data.phoneE164 ||
      data.phoneNumber ||
      raw['PHONE NUMBER'] ||
      raw['Phone'] ||
      raw['phone'] ||
      '';
    if (!rawPhone) {
      errors.push('PHONE NUMBER is required.');
    } else {
      const { valid, formatted } = validateAndFormatPhone(rawPhone);
      if (!valid) {
        errors.push(`Invalid phone "${rawPhone}". Use E.164 or local 10-digit format (e.g. +233241234567 or 0241234567).`);
      } else {
        data.phoneE164 = formatted;
        data.phoneNumber = formatted;
      }
    }

    // 3. Optional Email validation
    if (data.email) {
      const cleanEmail = data.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        errors.push(`Invalid email address "${data.email}".`);
      } else {
        data.email = cleanEmail;
      }
    }

    // 4. Number of Children validation
    if (rawChildrenValue !== undefined) {
      if (!/^\d+$/.test(rawChildrenValue)) {
        errors.push(`NUMBER OF CHILDREN "${rawChildrenValue}" must be a non-negative whole number.`);
      } else {
        data.numberOfChildren = Number(rawChildrenValue);
      }
    } else {
      data.numberOfChildren = 0;
    }

    // 5. Gender normalization & validation
    if (data.gender) {
      const normalizedGender = normalizeGender(String(data.gender));
      if (!normalizedGender.valid) {
        errors.push(`Invalid GENDER "${data.gender}". Expected Male, Female, or Other.`);
      } else {
        data.gender = normalizedGender.value;
      }
    } else {
      data.gender = 'other';
    }

    // 6. Marital status normalization
    if (data.maritalStatus) {
      const normalizedMarital = normalizeMaritalStatus(String(data.maritalStatus));
      if (!normalizedMarital.valid) {
        warnings.push(`Unrecognized MARITAL STATUS "${data.maritalStatus}"; defaulted to Single.`);
        data.maritalStatus = 'Single';
      } else {
        data.maritalStatus = normalizedMarital.value;
      }
    } else {
      data.maritalStatus = 'Single';
    }

    // 7. Emergency phone check if numeric/phone provided
    if (data.emergencyContactPhone) {
      const cleaned = data.emergencyContactPhone.trim();
      if (/\d/.test(cleaned)) {
        const emPhone = validateAndFormatPhone(cleaned);
        if (!emPhone.valid) {
          warnings.push(`Emergency phone "${cleaned}" does not match standard phone format.`);
        } else {
          data.emergencyContactPhone = emPhone.formatted;
        }
      }
    }

    // 8. Strict Calendar Date checks
    if (data.dateOfBirth) {
      const parsed = validateStrictIsoDate(data.dateOfBirth);
      if (!parsed) {
        errors.push(`Invalid DATE OF BIRTH "${data.dateOfBirth}". Expected valid YYYY-MM-DD or DD/MM/YYYY.`);
      } else if (parsed > todayIso) {
        errors.push(`DATE OF BIRTH "${parsed}" cannot be in the future.`);
      } else {
        data.dateOfBirth = parsed;
        const derivedMonth = deriveMonthOfBirth(parsed);
        if (derivedMonth) {
          if (data.monthOfBirth) {
            const rawNormalized = normalizeMonthName(data.monthOfBirth);
            if (rawNormalized && rawNormalized !== derivedMonth) {
              warnings.push(
                `MONTH OF BIRTH "${data.monthOfBirth}" conflicted with DATE OF BIRTH; synced to ${derivedMonth}.`
              );
            }
          }
          data.monthOfBirth = derivedMonth;
        }
      }
    } else if (data.monthOfBirth) {
      const normalizedMonth = normalizeMonthName(data.monthOfBirth);
      if (normalizedMonth) {
        data.monthOfBirth = normalizedMonth;
      }
    }

    if (data.monthOfBirth) {
      const birthGroup = formatBirthMonthGroupName(data.monthOfBirth);
      if (birthGroup) {
        data.birthMonthGroup = birthGroup;
      }
    }

    if (data.dateOfBaptism) {
      const parsed = validateStrictIsoDate(data.dateOfBaptism);
      if (!parsed) {
        errors.push(`Invalid date of baptism "${data.dateOfBaptism}". Expected YYYY-MM-DD or DD/MM/YYYY.`);
      } else {
        data.dateOfBaptism = parsed;
      }
    }

    if (data.dateOfMarriage) {
      const parsed = validateStrictIsoDate(data.dateOfMarriage);
      if (!parsed) {
        warnings.push(`Date of marriage "${data.dateOfMarriage}" could not be parsed as YYYY-MM-DD or DD/MM/YYYY.`);
        delete data.dateOfMarriage;
      } else {
        data.dateOfMarriage = parsed;
      }
    }

    if (data.dateOfSalvation) {
      const parsed = validateStrictIsoDate(data.dateOfSalvation);
      if (!parsed) {
        warnings.push(`Date of salvation "${data.dateOfSalvation}" could not be parsed as YYYY-MM-DD or DD/MM/YYYY.`);
        delete data.dateOfSalvation;
      } else {
        data.dateOfSalvation = parsed;
      }
    }

    if (data.dateOfMembership) {
      const parsed = validateStrictIsoDate(data.dateOfMembership);
      if (!parsed) {
        warnings.push(`Date of membership "${data.dateOfMembership}" could not be parsed; defaulted to today.`);
        data.dateOfMembership = todayIso;
      } else {
        data.dateOfMembership = parsed;
      }
    } else {
      data.dateOfMembership = todayIso;
    }

    // 9. Defaults & normalization
    data.officerName = normalizeOfficerName(data.officerName);
    const resolvedGroup = data.homeCellGroup || data.groupName || 'General Congregation';
    data.groupName = resolvedGroup;
    data.homeCellGroup = resolvedGroup;
    const normalizedDepts = normalizeMemberDepartmentFields({
      department: data.department,
      departments: data.departments,
    });
    data.department = normalizedDepts.department;
    data.departments = normalizedDepts.departments;
    data.status = 'member';
    data.autoCheckinOptedIn = true;
    data.consecutiveAbsences = 0;

    // 10. Duplicate detection (Existing roster + Intra-file)
    const upperMemberId = data.memberId ? data.memberId.trim().toUpperCase() : undefined;
    if (upperMemberId) {
      data.memberId = data.memberId!.trim();
    }

    const matchedByPhone = data.phoneE164 ? existingByPhone.get(data.phoneE164) : undefined;
    const matchedById = upperMemberId ? existingByMemberId.get(upperMemberId) : undefined;
    const matchedByEmail = data.email ? existingByEmail.get(data.email) : undefined;
    const matchedMemberId = matchedByPhone || matchedById || matchedByEmail;

    const intraPhoneDup = Boolean(data.phoneE164 && seenPhonesInFile.has(data.phoneE164));
    const intraIdDup = Boolean(upperMemberId && seenMemberIdsInFile.has(upperMemberId));
    const intraEmailDup = Boolean(data.email && seenEmailsInFile.has(data.email));
    const isIntraFileDuplicate = intraPhoneDup || intraIdDup || intraEmailDup;

    if (data.phoneE164) seenPhonesInFile.add(data.phoneE164);
    if (upperMemberId) seenMemberIdsInFile.add(upperMemberId);
    if (data.email) seenEmailsInFile.add(data.email);

    const isExistingDuplicate = Boolean(matchedMemberId);
    const isDuplicate = isExistingDuplicate || isIntraFileDuplicate;

    if (isIntraFileDuplicate) {
      errors.push(
        intraPhoneDup
          ? `Duplicate phone ${data.phoneE164} appears in an earlier row of this file.`
          : intraIdDup
          ? `Duplicate Member ID ${upperMemberId} appears in an earlier row of this file.`
          : `Duplicate email ${data.email} appears in an earlier row of this file.`
      );
    } else if (isExistingDuplicate) {
      const matchReason = matchedByPhone
        ? `Phone ${data.phoneE164}`
        : matchedById
        ? `Member ID ${upperMemberId}`
        : `Email ${data.email}`;

      if (duplicateMode === 'error') {
        errors.push(`${matchReason} already exists in the church directory.`);
      } else if (duplicateMode === 'update') {
        warnings.push(`${matchReason} matches an existing member. Existing record will be updated.`);
      } else {
        warnings.push(`${matchReason} already exists in the church directory. Row will be skipped.`);
      }
    }

    const isValid = errors.length === 0;
    let action: ValidatedImportRow['action'] = 'insert';
    if (!isValid) {
      action = 'error';
    } else if (isExistingDuplicate) {
      action = duplicateMode === 'update' ? 'update' : 'skip';
    }

    return {
      rowIndex: index + 1,
      data,
      raw,
      isValid,
      errors,
      warnings,
      isDuplicate,
      isIntraFileDuplicate,
      matchedMemberId,
      action,
    };
  });

  const summary: MemberImportValidationSummary = {
    total: validatedRows.length,
    valid: validatedRows.filter((r) => r.isValid).length,
    invalid: validatedRows.filter((r) => !r.isValid).length,
    duplicates: validatedRows.filter((r) => r.isDuplicate).length,
    intraFileDuplicates: validatedRows.filter((r) => r.isIntraFileDuplicate).length,
    newInserts: validatedRows.filter((r) => r.action === 'insert').length,
    updates: validatedRows.filter((r) => r.action === 'update').length,
    skipped: validatedRows.filter((r) => r.action === 'skip').length,
  };

  return { rows: validatedRows, summary };
}
