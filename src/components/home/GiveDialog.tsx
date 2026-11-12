// src/components/home/GiveDialog.tsx
// Accessible focus-trapped giving modal with preset amounts, Mobile Money networks
// (MTN MoMo, Telecel Cash, AT Money), phone validation, and single startGiving() stub.

import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ShieldCheck, Smartphone, X } from 'lucide-react';
import {
  MOBILE_MONEY_NETWORKS,
  startGiving,
  validateMobileMoneyPhone,
} from '../../services/churchHomeService';
import type { Church, GivingResult, MobileMoneyNetwork } from '../../types/churchHome';

export interface GiveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  church: Church;
}

const PRESET_AMOUNTS = [20, 50, 100, 200, 500];
const FUNDS = ['Tithe', 'Sunday Offering', 'Welfare & Mercy', 'Building Fund', 'Missions'];

export const GiveDialog: React.FC<GiveDialogProps> = ({ isOpen, onClose, church }) => {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(50);
  const [customAmount, setCustomAmount] = useState<string>('50');
  const [fund, setFund] = useState<string>(FUNDS[0]);
  const [network, setNetwork] = useState<MobileMoneyNetwork>('mtn_momo');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [donorName, setDonorName] = useState<string>('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<GivingResult | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectPreset = (amount: number) => {
    setSelectedPreset(amount);
    setCustomAmount(String(amount));
    setAmountError(null);
    setResult(null);
  };

  const handleAmountChange = (val: string) => {
    setCustomAmount(val);
    const num = Number(val);
    setSelectedPreset(PRESET_AMOUNTS.includes(num) ? num : null);
    setAmountError(null);
    setResult(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setResult(null);

    const parsedAmount = Number.parseFloat(customAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setAmountError('Enter a valid amount greater than GHS 0.');
      return;
    }

    const phoneValidation = validateMobileMoneyPhone(phoneNumber);
    if (!phoneValidation.valid) {
      setPhoneError(phoneValidation.error || 'Enter a valid Mobile Money phone number.');
      return;
    }

    setPhoneError(null);
    setAmountError(null);
    setIsSubmitting(true);

    try {
      const response = await startGiving({
        churchId: church.id,
        churchSlug: church.slug,
        amountGhs: parsedAmount,
        fund,
        network,
        phoneNumber: phoneValidation.normalized,
        donorName: donorName.trim() || undefined,
      });
      setResult(response);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="give-dialog-title"
        aria-describedby="give-dialog-subtitle"
        className="w-full max-w-lg rounded-2xl border p-6 shadow-2xl sm:p-7"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="give-dialog-title" className="font-display text-2xl font-semibold">
              Give to {church.shortName || church.name}
            </h2>
            <p
              id="give-dialog-subtitle"
              className="mt-1 text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              Select an amount and Mobile Money network. Preview stub only — no live payment is
              processed.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close giving dialog"
            className="rounded-lg p-2 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
          {/* Preset amounts */}
          <div>
            <span className="block text-sm font-medium">Choose amount (GHS)</span>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {PRESET_AMOUNTS.map((amount) => {
                const active = selectedPreset === amount;
                return (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => handleSelectPreset(amount)}
                    className="rounded-xl border py-2.5 font-mono text-sm font-semibold tabular-nums transition-colors"
                    style={{
                      backgroundColor: active ? 'var(--brand)' : 'var(--surface-muted)',
                      borderColor: active ? 'var(--brand)' : 'var(--border)',
                      color: active ? 'var(--brand-ink)' : 'var(--text)',
                    }}
                  >
                    {amount}
                  </button>
                );
              })}
            </div>

            <label htmlFor="give-custom-amount" className="mt-3 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Or enter another amount (GHS)
            </label>
            <input
              id="give-custom-amount"
              type="number"
              min="1"
              step="any"
              inputMode="decimal"
              value={customAmount}
              onChange={(e) => handleAmountChange(e.target.value)}
              className="mt-1.5 w-full rounded-xl border px-3.5 py-2.5 font-mono text-sm tabular-nums"
              style={{
                backgroundColor: 'var(--surface-muted)',
                borderColor: amountError ? '#DC2626' : 'var(--border)',
                color: 'var(--text)',
              }}
            />
            {amountError && (
              <p role="alert" className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                {amountError}
              </p>
            )}
          </div>

          {/* Designation */}
          <div>
            <label htmlFor="give-fund-select" className="block text-sm font-medium">
              Designation
            </label>
            <select
              id="give-fund-select"
              value={fund}
              onChange={(e) => setFund(e.target.value)}
              className="mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm"
              style={{
                backgroundColor: 'var(--surface-muted)',
                borderColor: 'var(--border)',
                color: 'var(--text)',
              }}
            >
              {FUNDS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          {/* Mobile Money network selector */}
          <fieldset>
            <legend className="text-sm font-medium">Mobile Money network</legend>
            <div className="mt-2 grid grid-cols-3 gap-2.5">
              {MOBILE_MONEY_NETWORKS.map((net) => {
                const selected = network === net.id;
                return (
                  <label
                    key={net.id}
                    className="flex cursor-pointer flex-col items-center justify-center rounded-xl border px-2 py-3 text-center text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor: selected ? 'var(--deep)' : 'var(--surface-muted)',
                      borderColor: selected ? 'var(--brand)' : 'var(--border)',
                      color: selected ? 'var(--deep-ink)' : 'var(--text)',
                    }}
                  >
                    <input
                      type="radio"
                      name="momo-network"
                      value={net.id}
                      checked={selected}
                      onChange={() => {
                        setNetwork(net.id);
                        setResult(null);
                      }}
                      className="sr-only"
                    />
                    <Smartphone className="mb-1 h-4 w-4" aria-hidden="true" />
                    <span>{net.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Phone input with validation */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="give-momo-phone" className="block text-sm font-medium">
                Mobile Money number
              </label>
              <input
                id="give-momo-phone"
                type="tel"
                inputMode="tel"
                placeholder="024 123 4567"
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value);
                  setPhoneError(null);
                  setResult(null);
                }}
                aria-invalid={Boolean(phoneError)}
                className="mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm"
                style={{
                  backgroundColor: 'var(--surface-muted)',
                  borderColor: phoneError ? '#DC2626' : 'var(--border)',
                  color: 'var(--text)',
                }}
              />
            </div>

            <div>
              <label htmlFor="give-donor-name" className="block text-sm font-medium">
                Your name (optional)
              </label>
              <input
                id="give-donor-name"
                type="text"
                placeholder="For receipt record"
                value={donorName}
                onChange={(e) => setDonorName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm"
                style={{
                  backgroundColor: 'var(--surface-muted)',
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                }}
              />
            </div>
          </div>

          {phoneError && (
            <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
              {phoneError}
            </p>
          )}

          {result && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl border p-4 text-sm"
              style={{
                backgroundColor: 'var(--surface-muted)',
                borderColor: result.status === 'stub_ready' ? 'var(--brand)' : '#DC2626',
              }}
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2
                  className="mt-0.5 h-4.5 w-4.5 shrink-0"
                  style={{ color: 'var(--brand)' }}
                  aria-hidden="true"
                />
                <p className="leading-relaxed">{result.message}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <ShieldCheck className="h-4 w-4" style={{ color: 'var(--brand)' }} aria-hidden="true" />
              Payment stub ready for Paystack / Hubtel
            </span>

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-95 disabled:opacity-60"
              style={{
                backgroundColor: 'var(--brand)',
                color: 'var(--brand-ink)',
              }}
            >
              {isSubmitting ? 'Preparing...' : 'Continue to give'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
