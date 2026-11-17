import React, { useMemo, useState } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import {
  GENERAL_CONGREGATION_LABEL,
  isGeneralCongregationLabel,
  parseMemberDepartments,
} from '../../utils/memberDepartments';

interface MultiDepartmentSelectorProps {
  value: string[];
  onChange: (next: string[]) => void;
  options: string[];
  label?: string;
  helperText?: string;
  compact?: boolean;
  idPrefix?: string;
  allowCustomAdd?: boolean;
}

export const MultiDepartmentSelector: React.FC<MultiDepartmentSelectorProps> = ({
  value,
  onChange,
  options,
  label,
  helperText,
  compact = false,
  idPrefix = 'multi-dept',
  allowCustomAdd = true,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [customInput, setCustomInput] = useState('');

  const selectedList = useMemo(() => parseMemberDepartments(value), [value]);
  const selectedKeys = useMemo(
    () => new Set(selectedList.map((item) => item.toLowerCase())),
    [selectedList]
  );

  const normalizedOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const raw of options) {
      const clean = String(raw || '').trim().replace(/\s+/g, ' ');
      if (!clean || isGeneralCongregationLabel(clean)) continue;
      const key = clean.toLowerCase();
      if (!seen.has(key)) seen.set(key, clean);
    }
    for (const active of selectedList) {
      const key = active.toLowerCase();
      if (!seen.has(key)) seen.set(key, active);
    }
    return Array.from(seen.values());
  }, [options, selectedList]);

  const filteredOptions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return normalizedOptions;
    return normalizedOptions.filter((opt) => opt.toLowerCase().includes(q));
  }, [normalizedOptions, searchTerm]);

  const toggleOption = (option: string) => {
    const key = option.toLowerCase();
    if (selectedKeys.has(key)) {
      onChange(selectedList.filter((item) => item.toLowerCase() !== key));
    } else {
      onChange([...selectedList, option]);
    }
  };

  const handleAddCustom = () => {
    const parsed = parseMemberDepartments(customInput);
    if (parsed.length === 0) return;
    const merged = parseMemberDepartments([...selectedList, ...parsed]);
    onChange(merged);
    setCustomInput('');
  };

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor={`${idPrefix}-search`}
            className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]"
          >
            {label}
          </label>
          <span className="text-[11px] font-semibold text-[#6D5CF2] dark:text-[#9D90FF]">
            {selectedList.length === 0
              ? `${GENERAL_CONGREGATION_LABEL} (None selected)`
              : `${selectedList.length} selected`}
          </span>
        </div>
      )}

      {/* Selected chips summary */}
      <div
        className={`flex flex-wrap items-center gap-1.5 ${
          compact ? 'p-2' : 'p-2.5'
        } rounded-xl bg-[#F8F9FD] dark:bg-[#14142E] border border-[#E3E5F2] dark:border-[#2D2D55]`}
      >
        {selectedList.length === 0 ? (
          <span className="text-[11px] font-medium text-[#5B5F7A] dark:text-[#A9ACC8]">
            {GENERAL_CONGREGATION_LABEL} — select one or more ministries/departments below
          </span>
        ) : (
          <>
            {selectedList.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#9D90FF] border border-[#DDD8FF] dark:border-[#3D3D75]"
              >
                <span>{item}</span>
                <button
                  type="button"
                  onClick={() => toggleOption(item)}
                  aria-label={`Remove ${item}`}
                  className="p-0.5 rounded hover:bg-[#6D5CF2]/15 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => onChange([])}
              className="ml-auto text-[10px] font-bold text-[#5B5F7A] dark:text-[#A9ACC8] hover:text-rose-600 dark:hover:text-rose-400 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
            >
              Clear all
            </button>
          </>
        )}
      </div>

      {/* Filter search when options list grows */}
      {normalizedOptions.length > 6 && (
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#888DA8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id={`${idPrefix}-search`}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter departments & ministries..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
          />
        </div>
      )}

      {/* Multi-select checkbox grid */}
      <div
        role="group"
        aria-label={label || 'Departments and Ministries'}
        className={`grid ${
          compact ? 'grid-cols-1 sm:grid-cols-2 max-h-40' : 'grid-cols-1 sm:grid-cols-2 max-h-48'
        } gap-1.5 overflow-y-auto pr-0.5`}
      >
        {filteredOptions.map((opt) => {
          const isSelected = selectedKeys.has(opt.toLowerCase());
          return (
            <button
              key={opt}
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              onClick={() => toggleOption(opt)}
              className={`min-h-[36px] px-2.5 py-1.5 rounded-xl border text-left text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#EFEDFF] dark:bg-[#2A2A55] border-[#6D5CF2] text-[#1D1B3A] dark:text-white shadow-2xs'
                  : 'bg-white dark:bg-[#1C1C3C] border-[#E3E5F2] dark:border-[#2D2D55] text-[#4B4F6B] dark:text-[#B9BCD4] hover:border-[#6D5CF2]/50 hover:bg-[#F8F9FD] dark:hover:bg-[#22224A]'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                  isSelected
                    ? 'bg-[#6D5CF2] border-[#6D5CF2] text-white'
                    : 'border-[#C9CDE0] dark:border-[#3E3E6E] bg-white dark:bg-[#14142E]'
                }`}
              >
                {isSelected && <Check className="w-3 h-3 stroke-[2.75]" />}
              </span>
              <span className="truncate">{opt}</span>
            </button>
          );
        })}
        {filteredOptions.length === 0 && (
          <div className="col-span-full py-3 px-2 text-center text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
            No matching departments or ministries found.
          </div>
        )}
      </div>

      {/* Custom add option */}
      {allowCustomAdd && (
        <div className="flex items-center gap-1.5 pt-0.5">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustom();
              }
            }}
            placeholder="Add another ministry or department..."
            aria-label="Add custom department or ministry"
            className="flex-1 min-w-0 px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-[#1D1D3D] border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6D5CF2]"
          />
          <button
            type="button"
            onClick={handleAddCustom}
            disabled={!customInput.trim()}
            className="min-h-[32px] px-2.5 py-1.5 rounded-xl bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#9D90FF] text-xs font-bold flex items-center gap-1 hover:bg-[#E2DFFF] dark:hover:bg-[#343468] disabled:opacity-45 cursor-pointer shrink-0 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>
      )}

      {helperText && (
        <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8]">{helperText}</p>
      )}
    </div>
  );
};
