import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
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
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [customInput, setCustomInput] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      return;
    }

    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 30);

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

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
    <div ref={containerRef} className="relative w-full min-w-0 space-y-2">
      {label && (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 min-w-0">
          <label
            htmlFor={`${idPrefix}-trigger`}
            className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] leading-snug min-w-0"
          >
            {label}
          </label>
          <span className="text-[11px] font-semibold text-[#6D5CF2] dark:text-[#9D90FF] shrink-0 tabular-nums">
            {selectedList.length === 0
              ? `${GENERAL_CONGREGATION_LABEL} (None selected)`
              : `${selectedList.length} selected`}
          </span>
        </div>
      )}

      {/* Dropdown Trigger + Popover Anchor */}
      <div className="relative w-full min-w-0">
        <button
          id={`${idPrefix}-trigger`}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={`${idPrefix}-listbox`}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`w-full min-w-0 ${
            compact ? 'min-h-[38px] px-3 py-1.5' : 'min-h-[42px] px-3 py-2'
          } rounded-xl bg-white dark:bg-[#1D1D3D] border ${
            isOpen
              ? 'border-[#6D5CF2] ring-2 ring-[#6D5CF2]/20'
              : 'border-[#E9EBF5] dark:border-[#2D2D55] hover:border-[#6D5CF2]/60'
          } text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer`}
        >
          <span
            className={`min-w-0 flex-1 truncate ${
              selectedList.length > 0
                ? 'font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]'
                : 'font-medium text-[#5B5F7A] dark:text-[#A9ACC8]'
            }`}
          >
            {selectedList.length > 0
              ? selectedList.join(', ')
              : `${GENERAL_CONGREGATION_LABEL} — Select departments & ministries...`}
          </span>

          <span className="flex items-center gap-1.5 shrink-0">
            {selectedList.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#9D90FF] text-[10px] font-bold tabular-nums">
                {selectedList.length}
              </span>
            )}
            <ChevronDown
              className={`w-4 h-4 text-[#666A86] dark:text-[#A9ACC8] transition-transform duration-150 ${
                isOpen ? 'rotate-180 text-[#6D5CF2] dark:text-[#9D90FF]' : ''
              }`}
            />
          </span>
        </button>

        {/* Multi-Select Dropdown Panel */}
        {isOpen && (
          <div
            className="mt-1.5 w-full rounded-2xl bg-white dark:bg-[#191938] border border-[#DDE0F0] dark:border-[#323262] shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
          >
            {/* Search filter */}
            {normalizedOptions.length > 5 && (
              <div className="p-2 border-b border-[#E9EBF5] dark:border-[#2D2D55] bg-[#F8F9FD] dark:bg-[#14142E]">
                <div className="relative w-full min-w-0">
                  <Search className="w-3.5 h-3.5 text-[#888DA8] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    id={`${idPrefix}-search`}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search departments & ministries..."
                    aria-label="Search departments and ministries"
                    className="w-full min-w-0 min-h-[36px] pl-8 pr-7 py-1 text-xs rounded-lg bg-white dark:bg-[#1D1D3D] border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:border-[#6D5CF2] focus:ring-2 focus:ring-[#6D5CF2]/20"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      aria-label="Clear department search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-[#888DA8] hover:text-[#1D1B3A] dark:hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Scrollable checkbox options */}
            <div
              id={`${idPrefix}-listbox`}
              role="listbox"
              aria-multiselectable="true"
              aria-label={label || 'Departments and Ministries'}
              className="max-h-52 sm:max-h-60 overflow-y-auto overflow-x-hidden p-1.5 space-y-0.5"
            >
              {filteredOptions.map((opt) => {
                const isSelected = selectedKeys.has(opt.toLowerCase());
                return (
                  <button
                    key={opt}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggleOption(opt)}
                    className={`w-full min-w-0 min-h-[40px] sm:min-h-[36px] px-2.5 py-1.5 rounded-xl text-left text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#1D1B3A] dark:text-white'
                        : 'text-[#4B4F6B] dark:text-[#C5C8E0] hover:bg-[#F8F9FD] dark:hover:bg-white/5'
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
                    <span className="truncate min-w-0 flex-1">{opt}</span>
                  </button>
                );
              })}
              {filteredOptions.length === 0 && (
                <div className="py-4 px-2 text-center text-[11px] text-[#666A86] dark:text-[#A9ACC8]">
                  No matching departments or ministries found.
                </div>
              )}
            </div>

            {/* Custom add & Done footer */}
            <div className="p-2 border-t border-[#E9EBF5] dark:border-[#2D2D55] bg-[#F8F9FD] dark:bg-[#14142E] space-y-2">
              {allowCustomAdd && (
                <div className="w-full min-w-0 flex flex-col min-[380px]:flex-row items-stretch min-[380px]:items-center gap-1.5">
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
                    className="flex-1 min-w-0 min-h-[36px] px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-[#1D1D3D] border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:border-[#6D5CF2] focus:ring-2 focus:ring-[#6D5CF2]/20"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustom}
                    disabled={!customInput.trim()}
                    className="min-h-[36px] px-3 py-1 rounded-lg bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#9D90FF] text-xs font-bold flex items-center justify-center gap-1 hover:bg-[#E2DFFF] dark:hover:bg-[#343468] disabled:opacity-45 cursor-pointer shrink-0 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>Add</span>
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-2">
                  {selectedList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onChange([])}
                      className="px-2 py-1 rounded-lg font-semibold text-[#5B5F7A] dark:text-[#A9ACC8] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      Clear all ({selectedList.length})
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="ml-auto px-3 py-1 rounded-lg bg-[#6D5CF2] hover:bg-[#5B4BE0] text-white font-bold transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Selected removable tags (shown only when items are selected) */}
      {selectedList.length > 0 && (
        <div className="w-full min-w-0 flex flex-wrap items-center gap-1.5 pt-0.5">
          {selectedList.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 max-w-full min-w-0 pl-2.5 pr-1 py-0.5 rounded-lg text-[11px] font-bold bg-[#EFEDFF] dark:bg-[#2A2A55] text-[#6D5CF2] dark:text-[#9D90FF] border border-[#DDD8FF] dark:border-[#3D3D75]"
            >
              <span className="truncate">{item}</span>
              <button
                type="button"
                onClick={() => toggleOption(item)}
                aria-label={`Remove ${item}`}
                className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-[#6D5CF2]/15 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] font-semibold text-[#5B5F7A] dark:text-[#A9ACC8] hover:text-rose-600 dark:hover:text-rose-400 px-1.5 py-0.5 rounded transition-colors cursor-pointer shrink-0"
          >
            Clear all
          </button>
        </div>
      )}

      {helperText && (
        <p className="text-[10px] text-[#666A86] dark:text-[#A9ACC8] leading-relaxed">{helperText}</p>
      )}
    </div>
  );
};
