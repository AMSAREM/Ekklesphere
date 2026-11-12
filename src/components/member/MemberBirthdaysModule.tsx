// src/components/member/MemberBirthdaysModule.tsx
// Birthdays module for MemberApp:
// 1. Displays a congratulatory birthday card when a member logs in on their birthday,
//    with a built-in option to share a "Happy Birthday" post to the church wall.
// 2. Surfaces congregation birthdays (today & upcoming) and the interactive Church Wall feed.

import React, { useMemo, useState } from 'react';
import {
  Cake,
  Calendar,
  CheckCircle2,
  Heart,
  MessageSquarePlus,
  Send,
  Sparkles,
} from 'lucide-react';
import type { ChurchWallPost, Person } from '../../types/ekklesphere';

export interface UpcomingBirthdayItem {
  member: Person;
  isToday: boolean;
  daysUntil: number;
  monthDayLabel: string;
}

/**
 * Parses month (1-12) and day (1-31) from YYYY-MM-DD or ISO date string without timezone shifts.
 */
export function parseBirthMonthDay(dateOfBirth?: string): { month: number; day: number } | null {
  if (!dateOfBirth || typeof dateOfBirth !== 'string') return null;
  const trimmed = dateOfBirth.trim();
  const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const month = Number.parseInt(ymd[2], 10);
    const day = Number.parseInt(ymd[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { month, day };
    }
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
  };
}

/**
 * Returns true if the given dateOfBirth falls on the referenceDate's month and day.
 */
export function isBirthdayToday(
  dateOfBirth?: string,
  referenceDate: Date = new Date()
): boolean {
  const parts = parseBirthMonthDay(dateOfBirth);
  if (!parts) return false;
  return parts.month === referenceDate.getMonth() + 1 && parts.day === referenceDate.getDate();
}

export function formatBirthdayMonthDay(dateOfBirth?: string): string {
  const parts = parseBirthMonthDay(dateOfBirth);
  if (!parts) return '';
  const sample = new Date(2024, parts.month - 1, parts.day);
  return sample.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function getUpcomingBirthdays(
  members: Person[],
  referenceDate: Date = new Date(),
  windowDays = 14
): UpcomingBirthdayItem[] {
  const todayMidnight = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const currentYear = todayMidnight.getFullYear();

  const list: UpcomingBirthdayItem[] = [];
  for (const member of members) {
    const parts = parseBirthMonthDay(member.dateOfBirth);
    if (!parts) continue;

    let candidate = new Date(currentYear, parts.month - 1, parts.day);
    if (candidate.getTime() < todayMidnight.getTime()) {
      candidate = new Date(currentYear + 1, parts.month - 1, parts.day);
    }

    const diffDays = Math.round(
      (candidate.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays >= 0 && diffDays <= windowDays) {
      list.push({
        member,
        isToday: diffDays === 0,
        daysUntil: diffDays,
        monthDayLabel: formatBirthdayMonthDay(member.dateOfBirth),
      });
    }
  }

  return list.sort((a, b) => {
    if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
    return `${a.member.firstName} ${a.member.lastName}`.localeCompare(
      `${b.member.firstName} ${b.member.lastName}`
    );
  });
}

export function buildHappyBirthdayWallPost(firstName: string, churchName?: string): string {
  const name = firstName.trim() || 'Friend';
  const churchClause = churchName?.trim() ? ` with my ${churchName.trim()} family` : '';
  return `Happy Birthday to me (${name})! Grateful to God for another blessed year of life, grace, and fellowship${churchClause}.`;
}

interface MemberBirthdaysModuleProps {
  section?: 'greeting' | 'wall' | 'all';
  memberId: string;
  memberFirstName: string;
  memberDisplayName: string;
  memberDateOfBirth?: string;
  churchName: string;
  members: Person[];
  wallPosts: ChurchWallPost[];
  currentActorId: string;
  onShareToWall: (input: {
    message: string;
    category?: 'birthday' | 'testimony' | 'celebration';
    targetMemberId?: string;
    targetMemberName?: string;
  }) => Promise<ChurchWallPost>;
  onToggleAmen: (postId: string) => Promise<void>;
  onSaveBirthdayDate?: (dateOfBirth: string) => Promise<void> | void;
}

export const MemberBirthdaysModule: React.FC<MemberBirthdaysModuleProps> = ({
  section = 'all',
  memberId,
  memberFirstName,
  memberDisplayName,
  memberDateOfBirth,
  churchName,
  members,
  wallPosts,
  currentActorId,
  onShareToWall,
  onToggleAmen,
  onSaveBirthdayDate,
}) => {
  const isTodayBirthday = useMemo(
    () => isBirthdayToday(memberDateOfBirth),
    [memberDateOfBirth]
  );

  const upcomingBirthdays = useMemo(() => getUpcomingBirthdays(members, new Date(), 14), [members]);

  const [selfPostText, setSelfPostText] = useState<string>(() =>
    buildHappyBirthdayWallPost(memberFirstName, churchName)
  );
  const [hasSharedOwnBirthday, setHasSharedOwnBirthday] = useState<boolean>(false);
  const [isSharingOwn, setIsSharingOwn] = useState<boolean>(false);

  const [wallComposerText, setWallComposerText] = useState<string>('');
  const [composerTarget, setComposerTarget] = useState<{ id: string; name: string } | null>(null);
  const [isPostingWall, setIsPostingWall] = useState<boolean>(false);

  const [dobInput, setDobInput] = useState<string>(memberDateOfBirth || '');
  const [showDobForm, setShowDobForm] = useState<boolean>(false);

  const handleShareOwnBirthday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selfPostText.trim() || isSharingOwn) return;
    setIsSharingOwn(true);
    try {
      await onShareToWall({
        message: selfPostText.trim(),
        category: 'birthday',
        targetMemberId: memberId,
        targetMemberName: memberDisplayName,
      });
      setHasSharedOwnBirthday(true);
    } finally {
      setIsSharingOwn(false);
    }
  };

  const handleSubmitWallWish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallComposerText.trim() || isPostingWall) return;
    setIsPostingWall(true);
    try {
      await onShareToWall({
        message: wallComposerText.trim(),
        category: 'birthday',
        targetMemberId: composerTarget?.id,
        targetMemberName: composerTarget?.name,
      });
      setWallComposerText('');
      setComposerTarget(null);
    } finally {
      setIsPostingWall(false);
    }
  };

  const handleQuickWish = (celebrant: Person) => {
    setComposerTarget({
      id: celebrant.id,
      name: `${celebrant.firstName} ${celebrant.lastName}`.trim(),
    });
    setWallComposerText(
      `Happy Birthday, ${celebrant.firstName}! Praying God's joy, peace, and abundant grace over your new year.`
    );
    const input = document.getElementById('church-wall-wish-input');
    input?.focus();
  };

  const handleSaveDob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dobInput || !onSaveBirthdayDate) return;
    await onSaveBirthdayDate(dobInput);
    setShowDobForm(false);
  };

  const showGreeting = section !== 'wall' && isTodayBirthday;
  const showWall = section !== 'greeting';

  if (!showGreeting && !showWall) {
    return null;
  }

  return (
    <section aria-label="Birthdays and Church Wall" className="space-y-4">
      {/* Congratulatory Card when signed-in member logs in on their birthday */}
      {showGreeting && (
        <div
          role="region"
          aria-label="Birthday greeting"
          className="relative overflow-hidden rounded-3xl border border-amber-300/60 dark:border-amber-500/40 bg-gradient-to-br from-amber-50 via-orange-50/70 to-white dark:from-[#2B2111] dark:via-[#231B2E] dark:to-[#1C1C3C] p-5 sm:p-6 shadow-md"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/25">
                <Cake className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Celebrating you today</span>
                </div>
                <h2 className="mt-0.5 text-lg sm:text-xl font-extrabold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Happy Birthday, {memberFirstName}!
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-[#5B5F7A] dark:text-[#C5C8DF] leading-relaxed">
                  Your {churchName || 'church'} family celebrates with you today. “The Lord bless you
                  and keep you; the Lord make His face shine upon you.” (Numbers 6:24–25)
                </p>
              </div>
            </div>
          </div>

          {hasSharedOwnBirthday ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300/60 dark:border-emerald-700/60 bg-emerald-50/90 dark:bg-emerald-950/50 px-4 py-3 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Your “Happy Birthday” post is live on the Church Wall below!</span>
              </span>
              <button
                type="button"
                onClick={() => setHasSharedOwnBirthday(false)}
                className="font-bold underline hover:opacity-80 cursor-pointer"
              >
                Post another note
              </button>
            </div>
          ) : (
            <form onSubmit={handleShareOwnBirthday} className="mt-4 space-y-2.5">
              <label
                htmlFor="birthday-self-post"
                className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]"
              >
                Share a “Happy Birthday” post to the Church Wall
              </label>
              <textarea
                id="birthday-self-post"
                rows={2}
                value={selfPostText}
                onChange={(e) => setSelfPostText(e.target.value)}
                maxLength={600}
                className="w-full rounded-2xl border border-amber-300/70 dark:border-white/15 bg-white dark:bg-[#14142E] p-3 text-xs sm:text-sm text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8]">
                  Visible to members of {churchName || 'your congregation'}
                </span>
                <button
                  type="submit"
                  disabled={isSharingOwn || !selfPostText.trim()}
                  className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 text-xs font-bold shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isSharingOwn ? 'Sharing...' : 'Share Happy Birthday to Church Wall'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Congregation Birthdays & Church Wall Card */}
      {showWall && (
        <div className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-5 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-200/70 dark:border-amber-800/50">
              <Cake className="w-4.5 h-4.5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                Birthdays & Church Wall
              </h3>
              <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">
                Celebrate milestones and send warm “Happy Birthday” blessings to members.
              </p>
            </div>
          </div>

          {!memberDateOfBirth && onSaveBirthdayDate && (
            <button
              type="button"
              onClick={() => setShowDobForm((prev) => !prev)}
              className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-[#EEEBFF] dark:bg-[#2A2A55] text-[#6C5CE7] dark:text-[#8C7DFF] text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
            >
              {showDobForm ? 'Close' : 'Add your birthday'}
            </button>
          )}
        </div>

        {/* Inline Birthday Setup when Member has no DOB saved */}
        {showDobForm && onSaveBirthdayDate && (
          <form
            onSubmit={handleSaveDob}
            className="rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 p-4 flex flex-col sm:flex-row sm:items-end gap-3"
          >
            <div className="flex-1">
              <label
                htmlFor="member-dob-input"
                className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-1"
              >
                Your Date of Birth
              </label>
              <input
                id="member-dob-input"
                type="date"
                value={dobInput}
                onChange={(e) => setDobInput(e.target.value)}
                required
                className="w-full rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#14142E] px-3 py-2 text-xs text-[#1D1B3A] dark:text-[#F2F2FA]"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#6C5CE7] hover:bg-[#5b4be0] text-white text-xs font-bold cursor-pointer"
            >
              Save Birthday
            </button>
          </form>
        )}

        {/* Today & Upcoming Birthdays List */}
        <div>
          <h4 className="text-xs font-bold text-[#5B5F7A] dark:text-[#A9ACC8] mb-2.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#6C5CE7]" aria-hidden="true" />
            <span>Today & Next 14 Days ({upcomingBirthdays.length})</span>
          </h4>

          {upcomingBirthdays.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E3E5F2] dark:border-[#2D2D55] p-4 text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">
              No member birthdays listed in the next 14 days yet. Share a blessing on the Church Wall below.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {upcomingBirthdays.slice(0, 6).map((item) => (
                <div
                  key={item.member.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50/70 dark:bg-black/20 p-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#EEEBFF] dark:bg-[#2A2A55] text-[#6C5CE7] dark:text-[#8C7DFF] flex items-center justify-center text-xs font-bold shrink-0">
                      {item.member.avatarInitials || item.member.firstName.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                        {item.member.firstName} {item.member.lastName}
                      </p>
                      <p className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8]">
                        {item.isToday
                          ? 'Birthday today!'
                          : `${item.monthDayLabel} · in ${item.daysUntil} day${item.daysUntil === 1 ? '' : 's'}`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleQuickWish(item.member)}
                    className="shrink-0 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 px-2.5 py-1.5 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    Wish
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Church Wall Composer */}
        <form onSubmit={handleSubmitWallWish} className="space-y-2 border-t border-[#E3E5F2] dark:border-[#2D2D55] pt-4">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="church-wall-wish-input"
              className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-1.5"
            >
              <MessageSquarePlus className="w-3.5 h-3.5 text-[#6C5CE7]" aria-hidden="true" />
              <span>
                {composerTarget
                  ? `Happy Birthday wish for ${composerTarget.name}`
                  : 'Post a Happy Birthday note on the Church Wall'}
              </span>
            </label>
            {composerTarget && (
              <button
                type="button"
                onClick={() => setComposerTarget(null)}
                className="text-[11px] text-[#5B5F7A] hover:underline cursor-pointer"
              >
                Clear recipient
              </button>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="church-wall-wish-input"
              type="text"
              value={wallComposerText}
              onChange={(e) => setWallComposerText(e.target.value)}
              placeholder="Write a warm “Happy Birthday” blessing for the church wall..."
              maxLength={600}
              className="flex-1 rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 px-3.5 py-2.5 text-xs text-[#1D1B3A] dark:text-[#F2F2FA] focus:outline-none focus:ring-2 focus:ring-[#6C5CE7]"
            />
            <button
              type="submit"
              disabled={!wallComposerText.trim() || isPostingWall}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-[#6C5CE7] hover:bg-[#5b4be0] text-white px-4 py-2.5 text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isPostingWall ? 'Posting...' : 'Post to Wall'}</span>
            </button>
          </div>
        </form>

        {/* Live Church Wall Feed */}
        <div className="space-y-2.5">
          {wallPosts.length === 0 ? (
            <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">
              No birthday posts on the Church Wall yet. Be the first to celebrate!
            </p>
          ) : (
            <ul className="space-y-2.5">
              {wallPosts.slice(0, 8).map((post) => {
                const reacted = post.amens.includes(currentActorId);
                return (
                  <li
                    key={post.id}
                    className="rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50/70 dark:bg-black/20 p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#EEEBFF] dark:bg-[#2A2A55] text-[#6C5CE7] dark:text-[#8C7DFF] flex items-center justify-center text-[11px] font-bold shrink-0">
                          {post.authorInitials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                            {post.authorName}
                          </p>
                          <p className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8]">
                            {new Date(post.createdAt).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </p>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                        <Cake className="w-3 h-3" aria-hidden="true" />
                        <span>Happy Birthday</span>
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-[#1D1B3A] dark:text-[#E5E7F5] leading-relaxed">
                      {post.message}
                    </p>

                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => onToggleAmen(post.id)}
                        aria-pressed={reacted}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${
                          reacted
                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            : 'bg-white dark:bg-[#14142E] text-[#5B5F7A] dark:text-[#A9ACC8] hover:text-rose-600 border border-[#E3E5F2] dark:border-[#2D2D55]'
                        }`}
                      >
                        <Heart
                          className={`w-3.5 h-3.5 ${reacted ? 'fill-current' : ''}`}
                          aria-hidden="true"
                        />
                        <span>Celebrate ({post.amens.length})</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        </div>
      )}
    </section>
  );
};
