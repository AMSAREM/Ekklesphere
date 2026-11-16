import React, { useEffect, useState } from 'react';
import { ArrowUpRight, CalendarDays, Check, Plus, Users, X, HeartHandshake } from 'lucide-react';

interface LandingDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
}

export const LandingDemoModal: React.FC<LandingDemoModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const [email, setEmail] = useState('');
  const [churchName, setChurchName] = useState('');
  const [interest, setInterest] = useState('People & care');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const handleRouteClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onClose();
    onNavigate(path);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-modal-title"
      className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6"
    >
      <div
        onClick={onClose}
        className="absolute inset-0 bg-[#071827]/70 backdrop-blur-sm"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-[470px] rounded-2xl border border-white/25 bg-[#f7f3ec] p-6 sm:p-10 text-[#0b1f33] shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close demo request"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-[#d9d4ca] text-[#0b1f33] transition-colors hover:bg-[#0b1f33] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#647180]">
          Start a conversation
        </div>

        <h2
          id="demo-modal-title"
          className="mt-4 text-3xl sm:text-4xl font-bold leading-[0.98] tracking-[-0.04em] text-[#0b1f33]"
        >
          Let’s make room
          <br />
          <em className="font-display font-normal italic">for ministry.</em>
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-[#5c6876]">
          Tell us a little about your church and we’ll show you Ekklesphere in context.
        </p>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <label className="grid gap-1.5 text-[11px] font-bold tracking-wide text-[#5c6876]">
              <span>Work email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourchurch.org"
                className="w-full rounded-md border border-[#d8d2c8] bg-[#fffdf9] px-3.5 py-2.5 text-sm font-normal text-[#0b1f33] outline-none transition focus:border-[#e1ad3f] focus:ring-2 focus:ring-[#e1ad3f]/25"
              />
            </label>

            <label className="grid gap-1.5 text-[11px] font-bold tracking-wide text-[#5c6876]">
              <span>Church name</span>
              <input
                type="text"
                required
                value={churchName}
                onChange={(e) => setChurchName(e.target.value)}
                placeholder="Your church"
                className="w-full rounded-md border border-[#d8d2c8] bg-[#fffdf9] px-3.5 py-2.5 text-sm font-normal text-[#0b1f33] outline-none transition focus:border-[#e1ad3f] focus:ring-2 focus:ring-[#e1ad3f]/25"
              />
            </label>

            <label className="grid gap-1.5 text-[11px] font-bold tracking-wide text-[#5c6876]">
              <span>What are you exploring?</span>
              <select
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
                className="w-full rounded-md border border-[#d8d2c8] bg-[#fffdf9] px-3.5 py-2.5 text-sm font-normal text-[#0b1f33] outline-none transition focus:border-[#e1ad3f] focus:ring-2 focus:ring-[#e1ad3f]/25"
              >
                <option>People &amp; care</option>
                <option>Teams &amp; scheduling</option>
                <option>Church-wide operations</option>
              </select>
            </label>

            <button
              type="submit"
              className="mt-2 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#0b1f33] px-6 py-3 text-xs font-bold text-[#fffdf9] shadow-md transition-colors hover:bg-[#122e48]"
            >
              <span>Request my demo</span>
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <div className="mt-6 rounded-xl border border-[#d9d4ca] bg-[#fffdf9] p-6 text-center">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#e4efdd] text-[#4f704b]">
              <Check className="h-5 w-5" />
            </div>
            <div className="mt-3 text-lg font-bold text-[#0b1f33]">You’re on the list.</div>
            <p className="mt-1 text-xs text-[#5c6876]">
              We’ll follow up with a personal walkthrough for {churchName || 'your church'} soon.
            </p>
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                onClose();
              }}
              className="mt-4 inline-flex items-center rounded-full border border-[#d9d4ca] px-4 py-2 text-xs font-bold text-[#0b1f33] hover:bg-[#f1ede5]"
            >
              Done
            </button>
          </div>
        )}

        <div className="mt-6 border-t border-[#d9d4ca] pt-4 text-xs text-[#5c6876]">
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
    feedback: 'New follow-up ready to add in your church workspace.',
    icon: HeartHandshake,
  },
  {
    id: 'team',
    title: 'Add a team task',
    subtitle: 'Give someone the next right thing',
    feedback: 'Team task ready to assign in your church workspace.',
    icon: Users,
  },
  {
    id: 'event',
    title: 'Plan an event',
    subtitle: 'Make the next gathering clear',
    feedback: 'Event planner ready to open in your church workspace.',
    icon: CalendarDays,
  },
];

export const LandingQuickPanel: React.FC<LandingQuickPanelProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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

      <div className="relative z-10 w-full max-w-[430px] rounded-2xl border border-white/25 bg-[#f7f3ec] p-6 sm:p-8 text-[#0b1f33] shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close quick add"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-[#d9d4ca] text-[#0b1f33] transition-colors hover:bg-[#0b1f33] hover:text-white"
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
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => setFeedback(action.feedback)}
                className="flex items-center gap-3 rounded-xl border border-[#ded8ce] bg-[#fffdf9] p-3 text-left transition-all hover:translate-x-1 hover:border-[#e1ad3f] hover:bg-[#fff9e9]"
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

        {feedback && (
          <div
            aria-live="polite"
            className="mt-4 flex items-center justify-between gap-2 rounded-lg bg-[#edf4e9] px-3 py-2 text-xs font-medium text-[#4a6b43]"
          >
            <span>{feedback}</span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigate('/app?auth=login');
              }}
              className="shrink-0 font-bold underline"
            >
              Open app
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
