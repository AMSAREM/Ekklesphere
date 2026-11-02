import React, { useState, useMemo } from 'react';
import {
  Flame,
  Award,
  Sparkles,
  Trophy,
  Crown,
  Shield,
  Star,
  ChevronRight,
  Check,
  Calendar,
  Share2,
  X,
  Info,
} from 'lucide-react';
import { AttendanceRecord, Person } from '../../types/ekklesphere';

export interface AttendanceBadge {
  id: string;
  name: string;
  title: string;
  description: string;
  streakRequired: number;
  tier: 'bronze' | 'silver' | 'gold' | 'diamond';
  icon: 'star' | 'flame' | 'shield' | 'trophy' | 'crown';
  scripture: string;
  scriptureRef: string;
}

export const ATTENDANCE_BADGES: AttendanceBadge[] = [
  {
    id: 'first_step',
    name: 'Pilgrim of Faith',
    title: 'First Sunday Fellowship',
    description: 'Attended and checked in for your first service at the sanctuary.',
    streakRequired: 1,
    tier: 'bronze',
    icon: 'star',
    scripture: 'I was glad when they said to me, “Let us go to the house of the Lord!”',
    scriptureRef: 'Psalm 122:1',
  },
  {
    id: 'bronze_fellowship',
    name: 'Steadfast Believer',
    title: '3-Week Consistency Badge',
    description: 'Maintained 3 consecutive weeks of devoted Sunday worship.',
    streakRequired: 3,
    tier: 'bronze',
    icon: 'shield',
    scripture: 'Let us hold unswervingly to the hope we profess, for he who promised is faithful.',
    scriptureRef: 'Hebrews 10:23',
  },
  {
    id: 'silver_pillar',
    name: 'Sanctuary Pillar',
    title: '5-Week Fellowship Badge',
    description: 'Half a season of faithful attendance with your church family.',
    streakRequired: 5,
    tier: 'silver',
    icon: 'flame',
    scripture: 'And let us consider how we may spur one another on toward love and good deeds.',
    scriptureRef: 'Hebrews 10:24',
  },
  {
    id: 'gold_sanctuary',
    name: 'Sanctuary Anchor',
    title: '8-Week Unbroken Streak',
    description: 'Two full months of steadfast, uninterrupted attendance and fellowship.',
    streakRequired: 8,
    tier: 'gold',
    icon: 'trophy',
    scripture: 'Rooted and built up in him, strengthened in the faith as you were taught.',
    scriptureRef: 'Colossians 2:7',
  },
  {
    id: 'diamond_ambassador',
    name: 'Grace Ambassador',
    title: '12-Week Champion Badge',
    description: 'Quarter season of unbroken devotion, an inspiration to the entire congregation.',
    streakRequired: 12,
    tier: 'diamond',
    icon: 'crown',
    scripture: 'Well done, good and faithful servant! You have been faithful with a few things.',
    scriptureRef: 'Matthew 25:21',
  },
];

interface MemberAttendanceStreakCardProps {
  personId: string;
  member?: Person;
  isCheckedInToday: boolean;
  attendanceRecords: AttendanceRecord[];
  onShowToast: (message: string) => void;
  className?: string;
}

const TIER_STYLES = {
  bronze: {
    bg: 'bg-amber-500/10 dark:bg-amber-500/20',
    border: 'border-amber-500/30 dark:border-amber-500/40',
    text: 'text-amber-700 dark:text-amber-300',
    glow: 'shadow-amber-500/10',
    gradient: 'from-amber-500 to-amber-700',
  },
  silver: {
    bg: 'bg-slate-300/20 dark:bg-slate-300/10',
    border: 'border-slate-300/40 dark:border-slate-300/30',
    text: 'text-slate-700 dark:text-slate-200',
    glow: 'shadow-slate-400/10',
    gradient: 'from-slate-400 to-slate-600',
  },
  gold: {
    bg: 'bg-yellow-500/10 dark:bg-yellow-500/20',
    border: 'border-yellow-500/40 dark:border-yellow-500/50',
    text: 'text-yellow-700 dark:text-yellow-300',
    glow: 'shadow-yellow-500/20',
    gradient: 'from-amber-400 to-yellow-600',
  },
  diamond: {
    bg: 'bg-indigo-500/15 dark:bg-indigo-500/25',
    border: 'border-indigo-500/40 dark:border-indigo-500/50',
    text: 'text-indigo-700 dark:text-indigo-300',
    glow: 'shadow-indigo-500/20',
    gradient: 'from-indigo-500 via-purple-500 to-pink-500',
  },
};

export const MemberAttendanceStreakCard: React.FC<MemberAttendanceStreakCardProps> = ({
  personId,
  member,
  isCheckedInToday,
  attendanceRecords,
  onShowToast,
  className = '',
}) => {
  const [selectedBadge, setSelectedBadge] = useState<AttendanceBadge | null>(null);

  // Calculate current streak & past 5 weeks participation
  const { currentStreak, pastWeeks, nextBadge, progressToNextPct } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Generate past 6 Sundays/week anchors
    const weeks: Array<{ label: string; date: Date; attended: boolean }> = [];
    const dow = today.getDay();
    const daysSinceSunday = dow; // 0 for Sun

    const latestSunday = new Date(today);
    latestSunday.setDate(today.getDate() - daysSinceSunday);

    for (let i = 4; i >= 0; i--) {
      const sun = new Date(latestSunday);
      sun.setDate(latestSunday.getDate() - i * 7);

      const sunIso = sun.toISOString().split('T')[0];
      const startRange = new Date(sun);
      startRange.setDate(sun.getDate() - 3);
      const endRange = new Date(sun);
      endRange.setDate(sun.getDate() + 3);

      const startIso = startRange.toISOString().split('T')[0];
      const endIso = endRange.toISOString().split('T')[0];

      // Check if person checked in during this week
      const attended =
        (i === 0 && isCheckedInToday) ||
        attendanceRecords.some((rec) => {
          if (rec.personId !== personId) return false;
          let recDate = rec.checkedInIso?.split('T')[0];
          if (!recDate && rec.checkedInAt) {
            const p = new Date(rec.checkedInAt);
            if (!isNaN(p.getTime())) recDate = p.toISOString().split('T')[0];
          }
          if (!recDate) recDate = today.toISOString().split('T')[0];
          return recDate >= startIso && recDate <= endIso;
        });

      weeks.push({
        label: i === 0 ? 'Today' : sun.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        date: sun,
        attended,
      });
    }

    // Determine current consecutive weekly streak
    // Base streak derived from member consecutive absences if member is regular, plus today
    let streak = 0;
    const reversed = [...weeks].reverse();
    for (const w of reversed) {
      if (w.attended) streak++;
      else break;
    }

    // If member has no consecutive absences, award their baseline streak
    if (member && (member.consecutiveAbsences || 0) === 0) {
      streak = Math.max(streak, isCheckedInToday ? 4 : 3);
    } else if (isCheckedInToday) {
      streak = Math.max(streak, 1);
    }

    // Determine next badge threshold
    const unlockedBadges = ATTENDANCE_BADGES.filter((b) => streak >= b.streakRequired);
    const next = ATTENDANCE_BADGES.find((b) => streak < b.streakRequired) || null;

    let progress = 100;
    if (next) {
      const prevThreshold =
        unlockedBadges.length > 0
          ? unlockedBadges[unlockedBadges.length - 1].streakRequired
          : 0;
      const span = next.streakRequired - prevThreshold;
      const currentInSpan = Math.max(0, streak - prevThreshold);
      progress = span > 0 ? Math.min(100, Math.round((currentInSpan / span) * 100)) : 0;
    }

    return {
      currentStreak: streak,
      pastWeeks: weeks,
      nextBadge: next,
      progressToNextPct: progress,
    };
  }, [personId, member, isCheckedInToday, attendanceRecords]);

  const renderBadgeIcon = (icon: AttendanceBadge['icon'], classNameStr = 'w-4 h-4') => {
    switch (icon) {
      case 'star':
        return <Star className={classNameStr} />;
      case 'shield':
        return <Shield className={classNameStr} />;
      case 'flame':
        return <Flame className={classNameStr} />;
      case 'trophy':
        return <Trophy className={classNameStr} />;
      case 'crown':
        return <Crown className={classNameStr} />;
      default:
        return <Award className={classNameStr} />;
    }
  };

  const unlockedCount = ATTENDANCE_BADGES.filter((b) => currentStreak >= b.streakRequired).length;

  return (
    <>
      <section
        className={`bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-5 shadow-sm space-y-4 ${className}`}
        aria-label="Weekly Attendance Streak & Badges"
      >
        {/* Top Header Row: Streak Counter & Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#6C5CE7] to-[#8C7DFF] text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                <Flame className="w-6 h-6 animate-pulse" />
              </div>
              {currentStreak >= 3 && (
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-black text-amber-950 ring-2 ring-white dark:ring-[#1C1C3C]">
                  ★
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  {currentStreak > 0 ? `${currentStreak}-Week Attendance Streak` : 'Start Your Streak'}
                </h3>
                {currentStreak >= 3 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    <Sparkles className="w-3 h-3" />
                    Consistent
                  </span>
                )}
              </div>
              <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] mt-0.5">
                {currentStreak > 0
                  ? isCheckedInToday
                    ? 'Checked in today! Your streak is burning bright.'
                    : 'Check in today to keep your weekly streak burning!'
                  : 'Arrive at service to begin your weekly fellowship streak.'}
              </p>
            </div>
          </div>

          {/* Quick Badges Unlocked Summary */}
          <div className="flex items-center gap-2 self-start sm:self-center">
            <span className="text-xs font-semibold text-[#5B5F7A] dark:text-[#A9ACC8]">
              Badges:
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#EEEBFF] dark:bg-[#2A2A55] text-[#6C5CE7] dark:text-[#8C7DFF] text-xs font-bold font-mono">
              <Trophy className="w-3.5 h-3.5" />
              {unlockedCount} / {ATTENDANCE_BADGES.length} Unlocked
            </span>
          </div>
        </div>

        {/* 5-Week Check-in Dots Timeline */}
        <div>
          <div className="flex items-center justify-between text-xs text-[#5B5F7A] dark:text-[#A9ACC8] mb-2 font-medium">
            <span>Recent Sunday Services:</span>
            <span>{isCheckedInToday ? '✓ Present today' : 'Check in today'}</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {pastWeeks.map((week, idx) => (
              <div
                key={idx}
                className={`flex flex-col items-center justify-center p-2 rounded-2xl border text-center transition-all ${
                  week.attended
                    ? 'bg-[#EEEBFF] dark:bg-[#2A2A55] border-[#6C5CE7]/30 text-[#6C5CE7] dark:text-[#8C7DFF]'
                    : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 text-xs font-bold ${
                    week.attended
                      ? 'bg-[#6C5CE7] text-white shadow-xs'
                      : 'bg-slate-200 dark:bg-white/10 text-slate-400'
                  }`}
                >
                  {week.attended ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '·'}
                </div>
                <span className="text-[10px] font-bold block truncate max-w-full">
                  {week.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Progress Toward Next Badge */}
        {nextBadge && (
          <div className="bg-[#F8F9FD] dark:bg-[#14142E] rounded-2xl p-3 border border-[#E3E5F2] dark:border-[#2D2D55]">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Next Milestone:
                </span>
                <span className="font-bold text-[#6C5CE7] dark:text-[#8C7DFF]">
                  {nextBadge.name}
                </span>
              </div>
              <span className="text-[11px] font-mono text-[#5B5F7A] dark:text-[#A9ACC8]">
                {currentStreak} / {nextBadge.streakRequired} weeks
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#6C5CE7] to-[#4FBF98] rounded-full transition-all duration-500"
                style={{ width: `${progressToNextPct}%` }}
              />
            </div>
            <p className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] mt-1.5 flex items-center justify-between">
              <span>
                {nextBadge.streakRequired - currentStreak === 1
                  ? 'Only 1 more Sunday needed to unlock!'
                  : `${nextBadge.streakRequired - currentStreak} more consecutive weeks to unlock`}
              </span>
              <span className="font-bold text-amber-600 dark:text-amber-400">
                +{nextBadge.streakRequired * 10} Faith Pts
              </span>
            </p>
          </div>
        )}

        {/* Digital Badges Showcase Shelf */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#5B5F7A] dark:text-[#A9ACC8] flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-[#6C5CE7]" />
              <span>Digital Attendance Badges</span>
            </h4>
            <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8]">
              Tap any badge for scripture & details
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {ATTENDANCE_BADGES.map((badge) => {
              const isUnlocked = currentStreak >= badge.streakRequired;
              const tierTheme = TIER_STYLES[badge.tier];

              return (
                <button
                  key={badge.id}
                  type="button"
                  onClick={() => setSelectedBadge(badge)}
                  className={`relative p-3 rounded-2xl border text-center flex flex-col items-center justify-between gap-1.5 transition-all cursor-pointer group ${
                    isUnlocked
                      ? `${tierTheme.bg} ${tierTheme.border} ${tierTheme.glow} shadow-sm hover:scale-[1.02]`
                      : 'bg-slate-50/50 dark:bg-white/5 border-dashed border-slate-200 dark:border-white/10 opacity-60 hover:opacity-80'
                  }`}
                >
                  {isUnlocked && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500" />
                  )}
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                      isUnlocked
                        ? `bg-gradient-to-tr ${tierTheme.gradient} text-white shadow-xs`
                        : 'bg-slate-200 dark:bg-white/10 text-slate-400'
                    }`}
                  >
                    {renderBadgeIcon(badge.icon, 'w-5 h-5')}
                  </div>
                  <div className="min-w-0 w-full">
                    <span
                      className={`block text-xs font-bold truncate ${
                        isUnlocked
                          ? 'text-[#1D1B3A] dark:text-[#F2F2FA]'
                          : 'text-[#5B5F7A] dark:text-[#A9ACC8]'
                      }`}
                    >
                      {badge.name}
                    </span>
                    <span className="text-[10px] font-semibold text-[#5B5F7A] dark:text-[#A9ACC8] block truncate font-mono">
                      {badge.streakRequired} {badge.streakRequired === 1 ? 'wk' : 'wks'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* BADGE DETAIL & SCRIPTURE MODAL */}
      {selectedBadge && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white dark:bg-[#1D1D3D] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E9EBF5] dark:border-[#2D2D55] animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#E9EBF5] dark:border-[#2D2D55]">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-[#6C5CE7]" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#5B5F7A] dark:text-[#A9ACC8]">
                  Digital Attendance Badge
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBadge(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Badge Hero */}
            <div className="text-center py-5">
              <div
                className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-3 bg-gradient-to-tr ${
                  TIER_STYLES[selectedBadge.tier].gradient
                } text-white`}
              >
                {renderBadgeIcon(selectedBadge.icon, 'w-9 h-9')}
              </div>
              <h3 className="text-lg font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                {selectedBadge.name}
              </h3>
              <p className="text-xs font-semibold text-[#6C5CE7] dark:text-[#8C7DFF] mt-0.5">
                {selectedBadge.title} · {selectedBadge.streakRequired}-Week Milestone
              </p>
              <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] mt-2 max-w-sm mx-auto leading-relaxed">
                {selectedBadge.description}
              </p>

              {/* Status Pill */}
              <div className="mt-3">
                {currentStreak >= selectedBadge.streakRequired ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <Check className="w-3.5 h-3.5" />
                    Unlocked & Earned!
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                    In Progress ({currentStreak}/{selectedBadge.streakRequired} weeks)
                  </span>
                )}
              </div>
            </div>

            {/* Scripture Encouragement Box */}
            <div className="p-4 rounded-2xl bg-[#F8F9FD] dark:bg-[#14142E] border border-[#E3E5F2] dark:border-[#2D2D55] text-xs">
              <p className="italic text-[#1D1B3A] dark:text-[#F2F2FA] leading-relaxed">
                "{selectedBadge.scripture}"
              </p>
              <p className="font-bold text-[#6C5CE7] dark:text-[#8C7DFF] mt-1.5 text-right">
                — {selectedBadge.scriptureRef}
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => {
                  const shareText = `I have earned the ${selectedBadge.name} badge for consistent worship at Ekklesphere Church! 🔥 ${currentStreak}-week streak.`;
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    navigator.clipboard.writeText(shareText);
                    onShowToast('Badge achievement copied to clipboard!');
                  } else {
                    onShowToast(shareText);
                  }
                  setSelectedBadge(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#6C5CE7] hover:bg-[#5b4be0] text-white text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Badge</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedBadge(null)}
                className="px-4 py-2.5 rounded-xl border border-[#E9EBF5] dark:border-[#2D2D55] text-xs font-bold text-[#5B5F7A] dark:text-[#A9ACC8] hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
