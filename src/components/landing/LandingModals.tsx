import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  HeartHandshake,
  Loader2,
  Plus,
  Users,
  X,
} from 'lucide-react';

interface LandingDemoModalProps {
  isOpen: boolean;
  mode?: 'demo' | 'contact';
  onClose: () => void;
  onNavigate: (path: string) => void;
  contactSalesEmail?: string;
}

export const LandingDemoModal: React.FC<LandingDemoModalProps> = ({
  isOpen,
  mode = 'demo',
  onClose,
  onNavigate,
  contactSalesEmail = 'sales@ekklesphere.com',
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [churchName, setChurchName] = useState('');
  const [interest, setInterest] = useState('People & care');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedLeadId, setSubmittedLeadId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isContact = mode === 'contact';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/public/landing-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadType: isContact ? 'contact_inquiry' : 'demo_request',
          email: email.trim(),
          fullName: fullName.trim() || undefined,
          phone: phone.trim() || undefined,
          churchName: churchName.trim() || undefined,
          interest,
          message: message.trim() || undefined,
          sourceSection: isContact ? 'footer_contact' : 'landing_demo_modal',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(
          data?.message || 'Unable to submit right now. Please check your details and try again.'
        );
        return;
      }
      setSubmittedLeadId(data?.leadId || 'received');
    } catch {
      setErrorMsg('Network error reaching the platform server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setSubmittedLeadId(null);
    setErrorMsg(null);
    setMessage('');
    onClose();
  };

  const handleRouteClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    resetAndClose();
    onNavigate(path);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-modal-title"
      className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6 overflow-y-auto"
    >
      <div
        onClick={resetAndClose}
        className="fixed inset-0 bg-[#071827]/70 backdrop-blur-sm"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-[490px] rounded-2xl border border-white/25 bg-[#f7f3ec] p-6 sm:p-9 text-[#0b1f33] shadow-2xl my-auto">
        <button
          type="button"
          onClick={resetAndClose}
          aria-label="Close demo request"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-[#d9d4ca] text-[#0b1f33] transition-colors hover:bg-[#0b1f33] hover:text-white cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#647180]">
          {isContact ? 'Direct to the platform creator' : 'Start a conversation'}
        </div>

        <h2
          id="demo-modal-title"
          className="mt-3 text-3xl sm:text-4xl font-bold leading-[0.98] tracking-[-0.04em] text-[#0b1f33]"
        >
          {isContact ? (
            <>
              Speak directly
              <br />
              <em className="font-display font-normal italic">with our team.</em>
            </>
          ) : (
            <>
              Let’s make room
              <br />
              <em className="font-display font-normal italic">for ministry.</em>
            </>
          )}
        </h2>

        <p className="mt-2.5 text-sm leading-relaxed text-[#5c6876]">
          {isContact
            ? `Your message goes directly into the Platform Creator inbox (${contactSalesEmail}).`
            : 'Tell us a little about your church and we’ll show you Ekklesphere in context.'}
        </p>

        {!submittedLeadId ? (
          <form onSubmit={handleSubmit} className="mt-5 grid gap-3.5">
            {errorMsg && (
              <div
                role="alert"
                className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800"
              >
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="grid gap-1 text-[11px] font-bold tracking-wide text-[#5c6876]">
                <span>Your name</span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Pastor / Admin name"
                  className="w-full rounded-md border border-[#d8d2c8] bg-[#fffdf9] px-3 py-2 text-sm font-normal text-[#0b1f33] outline-none transition focus:border-[#e1ad3f] focus:ring-2 focus:ring-[#e1ad3f]/25"
                />
              </label>

              <label className="grid gap-1 text-[11px] font-bold tracking-wide text-[#5c6876]">
                <span>Phone / WhatsApp</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+233 24 000 0000"
                  className="w-full rounded-md border border-[#d8d2c8] bg-[#fffdf9] px-3 py-2 text-sm font-normal text-[#0b1f33] outline-none transition focus:border-[#e1ad3f] focus:ring-2 focus:ring-[#e1ad3f]/25"
                />
              </label>
            </div>

            <label className="grid gap-1 text-[11px] font-bold tracking-wide text-[#5c6876]">
              <span>Work email *</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourchurch.org"
                className="w-full rounded-md border border-[#d8d2c8] bg-[#fffdf9] px-3 py-2 text-sm font-normal text-[#0b1f33] outline-none transition focus:border-[#e1ad3f] focus:ring-2 focus:ring-[#e1ad3f]/25"
              />
            </label>

            <label className="grid gap-1 text-[11px] font-bold tracking-wide text-[#5c6876]">
              <span>Church name {isContact ? '' : '*'}</span>
              <input
                type="text"
                required={!isContact}
                value={churchName}
                onChange={(e) => setChurchName(e.target.value)}
                placeholder="Your church or fellowship"
                className="w-full rounded-md border border-[#d8d2c8] bg-[#fffdf9] px-3 py-2 text-sm font-normal text-[#0b1f33] outline-none transition focus:border-[#e1ad3f] focus:ring-2 focus:ring-[#e1ad3f]/25"
              />
            </label>

            <label className="grid gap-1 text-[11px] font-bold tracking-wide text-[#5c6876]">
              <span>What are you exploring?</span>
              <select
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
                className="w-full rounded-md border border-[#d8d2c8] bg-[#fffdf9] px-3 py-2 text-sm font-normal text-[#0b1f33] outline-none transition focus:border-[#e1ad3f] focus:ring-2 focus:ring-[#e1ad3f]/25"
              >
                <option>People &amp; care</option>
                <option>Teams &amp; scheduling</option>
                <option>Church-wide operations</option>
                <option>Multi-campus pricing &amp; SLA</option>
              </select>
            </label>

            <label className="grid gap-1 text-[11px] font-bold tracking-wide text-[#5c6876]">
              <span>Note for the creator (optional)</span>
              <textarea
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Congregation size, campuses, or timeline..."
                className="w-full rounded-md border border-[#d8d2c8] bg-[#fffdf9] px-3 py-2 text-sm font-normal text-[#0b1f33] outline-none transition focus:border-[#e1ad3f] focus:ring-2 focus:ring-[#e1ad3f]/25"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#0b1f33] px-6 py-3 text-xs font-bold text-[#fffdf9] shadow-md transition-colors hover:bg-[#122e48] disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Sending to creator...</span>
                </>
              ) : (
                <>
                  <span>{isContact ? 'Send inquiry' : 'Request my demo'}</span>
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="mt-6 rounded-xl border border-[#d9d4ca] bg-[#fffdf9] p-6 text-center">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#e4efdd] text-[#4f704b]">
              <Check className="h-5 w-5" />
            </div>
            <div className="mt-3 text-lg font-bold text-[#0b1f33]">
              Received by the Platform Creator.
            </div>
            <p className="mt-1 text-xs text-[#5c6876]">
              We logged your request for {churchName || email} and will follow up shortly.
            </p>
            <div className="mt-2 font-mono text-[10px] text-[#7a8490]">
              Ref: {submittedLeadId}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={resetAndClose}
                className="inline-flex items-center rounded-full border border-[#d9d4ca] px-4 py-2 text-xs font-bold text-[#0b1f33] hover:bg-[#f1ede5] cursor-pointer"
              >
                Done
              </button>
              <a
                href="/app?auth=org_signup"
                onClick={(e) => handleRouteClick(e, '/app?auth=org_signup')}
                className="inline-flex items-center gap-1 rounded-full bg-[#0b1f33] px-4 py-2 text-xs font-bold text-white hover:bg-[#122e48]"
              >
                <span>Start 14-day trial now</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        )}

        <div className="mt-5 border-t border-[#d9d4ca] pt-4 text-xs text-[#5c6876]">
          Want immediate access?{' '}
          <a
            href="/app?auth=login"
            onClick={(e) => handleRouteClick(e, '/app?auth=login')}
            className="font-bold text-[#0b1f33] underline underline-offset-2 hover:text-[#9c6912]"
          >
            Sign in
          </a>{' '}
          or{' '}
          <a
            href="/app?auth=signup"
            onClick={(e) => handleRouteClick(e, '/app?auth=signup')}
            className="font-bold text-[#0b1f33] underline underline-offset-2 hover:text-[#9c6912]"
          >
            Sign up
          </a>
        </div>
      </div>
    </div>
  );
};

interface LandingQuickPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
}

const QUICK_ACTIONS = [
  {
    id: 'follow-up',
    title: 'New follow-up',
    subtitle: 'Keep a care note moving',
    feedback: 'Care follow-up workflow',
    icon: HeartHandshake,
  },
  {
    id: 'team',
    title: 'Add a team task',
    subtitle: 'Give someone the next right thing',
    feedback: 'Volunteer team scheduling',
    icon: Users,
  },
  {
    id: 'event',
    title: 'Plan an event',
    subtitle: 'Make the next gathering clear',
    feedback: 'Sunday service & event coordination',
    icon: CalendarDays,
  },
];

export const LandingQuickPanel: React.FC<LandingQuickPanelProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const [selectedAction, setSelectedAction] = useState<(typeof QUICK_ACTIONS)[number] | null>(
    null
  );
  const [quickEmail, setQuickEmail] = useState('');
  const [quickChurch, setQuickChurch] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [quickSent, setQuickSent] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuickError(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleQuickLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEmail.trim()) return;
    setIsSending(true);
    setQuickError(null);
    try {
      const res = await fetch('/api/public/landing-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadType: 'quick_interest',
          email: quickEmail.trim(),
          churchName: quickChurch.trim() || undefined,
          interest: selectedAction?.feedback || 'Quick action preview',
          sourceSection: `quick_panel:${selectedAction?.id || 'general'}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setQuickError(err?.message || 'Could not send request.');
        return;
      }
      setQuickSent(true);
    } catch {
      setQuickError('Network error reaching server.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-panel-title"
      className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6"
    >
      <div
        onClick={onClose}
        className="absolute inset-0 bg-[#071827]/70 backdrop-blur-sm"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-[440px] rounded-2xl border border-white/25 bg-[#f7f3ec] p-6 sm:p-8 text-[#0b1f33] shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close quick add"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-[#d9d4ca] text-[#0b1f33] transition-colors hover:bg-[#0b1f33] hover:text-white cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#e1ad3f] text-[#0b1f33]">
          <Plus className="h-5 w-5" />
        </div>

        <div className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[#647180]">
          Quick add
        </div>

        <h2
          id="quick-panel-title"
          className="mt-2 text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-[#0b1f33]"
        >
          What needs your attention?
        </h2>

        <div className="mt-5 grid gap-2.5">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            const active = selectedAction?.id === action.id;
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  setSelectedAction(action);
                  setQuickSent(false);
                  setQuickError(null);
                }}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all cursor-pointer ${
                  active
                    ? 'border-[#e1ad3f] bg-[#fff9e9]'
                    : 'border-[#ded8ce] bg-[#fffdf9] hover:translate-x-1 hover:border-[#e1ad3f] hover:bg-[#fff9e9]'
                }`}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e8eff2] text-[#4c6f85]">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <div className="text-xs font-bold text-[#0b1f33]">{action.title}</div>
                  <div className="text-[11px] text-[#6c7573]">{action.subtitle}</div>
                </div>
              </button>
            );
          })}
        </div>

        {selectedAction && !quickSent && (
          <form
            onSubmit={handleQuickLeadSubmit}
            className="mt-4 space-y-2.5 rounded-xl border border-[#ded8ce] bg-[#fffdf9] p-3.5"
          >
            <div className="text-xs font-bold text-[#0b1f33]">
              Try {selectedAction.title.toLowerCase()} with your church
            </div>
            {quickError && (
              <div className="text-[11px] font-medium text-rose-700">{quickError}</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="email"
                required
                value={quickEmail}
                onChange={(e) => setQuickEmail(e.target.value)}
                placeholder="you@church.org"
                className="rounded-md border border-[#d8d2c8] bg-white px-2.5 py-1.5 text-xs text-[#0b1f33] outline-none focus:border-[#e1ad3f]"
              />
              <input
                type="text"
                value={quickChurch}
                onChange={(e) => setQuickChurch(e.target.value)}
                placeholder="Church name"
                className="rounded-md border border-[#d8d2c8] bg-white px-2.5 py-1.5 text-xs text-[#0b1f33] outline-none focus:border-[#e1ad3f]"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="submit"
                disabled={isSending}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0b1f33] px-3.5 py-1.5 text-[11px] font-bold text-white hover:bg-[#122e48] disabled:opacity-60 cursor-pointer"
              >
                {isSending ? 'Sending...' : 'Notify Creator'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigate('/app?auth=org_signup');
                }}
                className="text-[11px] font-bold text-[#0b1f33] underline cursor-pointer"
              >
                Or launch 14-day trial
              </button>
            </div>
          </form>
        )}

        {quickSent && (
          <div
            aria-live="polite"
            className="mt-4 flex items-center justify-between gap-2 rounded-lg bg-[#edf4e9] px-3 py-2 text-xs font-medium text-[#4a6b43]"
          >
            <span>Sent to the creator! Ready to open your church workspace?</span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigate('/app?auth=org_signup');
              }}
              className="shrink-0 font-bold underline cursor-pointer"
            >
              Open app
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
