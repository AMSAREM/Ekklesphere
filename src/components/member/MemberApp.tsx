import React, { useState } from 'react';
import { useEkklesphere } from '../../context/EkklesphereContext';
import {
  Home,
  Calendar,
  Heart,
  User,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  ChevronRight,
  Radio,
  FileText,
  Trash2,
  X,
  CreditCard,
  LogOut,
  LayoutDashboard,
  Sparkles,
} from 'lucide-react';

export const MemberApp: React.FC = () => {
  const {
    proximityStage,
    advanceProximityStage,
    resetProximity,
    memberConsents,
    updateMemberConsent,
    memberRsvps,
    toggleRsvp,
    submitDonation,
    showToast,
    attendanceRecords,
    currentUser,
    logout,
    switchUserRole,
  } = useEkklesphere();

  const [activeTab, setActiveTab] = useState<'home' | 'events' | 'give' | 'me'>('home');
  const [isQrSheetOpen, setIsQrSheetOpen] = useState(false);
  const [isConsentPromptOpen, setIsConsentPromptOpen] = useState(false);

  // Giving state
  const [giveAmount, setGiveAmount] = useState<number>(50);
  const [giveCustomAmount, setGiveCustomAmount] = useState<string>('');
  const [giveFund, setGiveFund] = useState<string>('Tithe');
  const [giveMethod, setGiveMethod] = useState<'MTN MoMo' | 'Telecel Cash' | 'Card'>('MTN MoMo');
  const [givenSuccess, setGivenSuccess] = useState(false);

  const isCheckedIn = attendanceRecords.some((r) => r.personId === 'm1');

  const eventsList = [
    { dateDay: 'Sun', dateNum: '1 Nov', title: 'Sunday Service', timeVenue: '08:00, Main hall' },
    { dateDay: 'Wed', dateNum: '4 Nov', title: 'Midweek prayer', timeVenue: '18:30, Main hall' },
    { dateDay: 'Sat', dateNum: '7 Nov', title: 'Youth fellowship', timeVenue: '16:00, Annex' },
    { dateDay: 'Sun', dateNum: '15 Nov', title: 'Harvest thanksgiving', timeVenue: '09:00, Main hall' },
  ];

  const handleGiveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalAmount = giveCustomAmount ? parseInt(giveCustomAmount, 10) : giveAmount;
    if (!finalAmount || finalAmount <= 0) {
      showToast('Please enter an amount');
      return;
    }
    submitDonation(finalAmount, giveFund, giveMethod);
    setGivenSuccess(true);
  };

  return (
    <main className="w-full flex justify-center items-center py-3 sm:py-6 px-2 sm:px-4">
      {/* Smartphone Outer Shell */}
      <div className="w-full max-w-[420px] bg-[#EEF0F8] dark:bg-[#12122B] rounded-[44px] shadow-[0_20px_60px_rgba(40,40,90,0.18)] border-4 border-[#1D1B3A] dark:border-[#2D2D55] overflow-hidden flex flex-col h-[780px] relative text-[#1D1B3A] dark:text-[#F2F2FA]">
        {/* Dynamic Island / Notch */}
        <div className="w-full pt-3 px-6 flex justify-between items-center text-[11px] font-bold text-slate-500 z-10 select-none">
          <span>09:41</span>
          <div className="w-24 h-4 bg-black rounded-full mx-auto" />
          <div className="flex items-center gap-1">
            <Radio className="w-3 h-3 text-emerald-500" />
            <span>5G</span>
          </div>
        </div>

        {/* Scrollable Viewport */}
        <div className="flex-1 overflow-y-auto px-5 pt-3 pb-6">
          {/* TAB 1: HOME */}
          {activeTab === 'home' && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Good morning, Ama
                </h1>
                <div className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] font-medium flex items-center gap-1.5">
                  <span>Accra Central Church</span>
                  <span>·</span>
                  <span className="text-[#6C5CE7] dark:text-[#8C7DFF] font-semibold">Osu North Cell</span>
                </div>
              </div>

              {/* Status Card (Changes based on Proximity Stage or CheckedIn state) */}
              <div className="bg-[#6C5CE7] dark:bg-[#8C7DFF] text-white rounded-3xl p-5 shadow-sm">
                {isCheckedIn ? (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                      <h3 className="text-lg font-bold">You’re checked in, Ama</h3>
                    </div>
                    <div className="text-xs text-white/90">
                      Sunday Service, 08:00 · Verified via Proximity Auto check-in
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={resetProximity}
                        className="bg-white/20 hover:bg-white/30 text-white rounded-xl px-3 py-1.5 text-xs font-semibold"
                      >
                        Not me / Cancel
                      </button>
                    </div>
                  </div>
                ) : proximityStage === 1 || proximityStage === 2 ? (
                  <div>
                    <h3 className="text-lg font-bold mb-1">
                      {proximityStage === 1 ? 'You’re near church' : 'At entrance, verifying dwell'}
                    </h3>
                    <div className="text-xs text-white/90">
                      {proximityStage === 1
                        ? 'About 300 m away. Device woke up and recorded approach.'
                        : 'Inside 100 m ring. Waiting a few minutes so we don’t count people driving past.'}
                    </div>
                    {/* Step indicator */}
                    <div className="flex gap-1.5 mt-3">
                      <span className="flex-1 h-1.5 rounded-full bg-white" />
                      <span
                        className={`flex-1 h-1.5 rounded-full ${
                          proximityStage >= 2 ? 'bg-white' : 'bg-white/30'
                        }`}
                      />
                      <span className="flex-1 h-1.5 rounded-full bg-white/30" />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={advanceProximityStage}
                        className="bg-white text-[#6C5CE7] rounded-xl px-3 py-1.5 text-xs font-bold shadow-sm"
                      >
                        {proximityStage === 1 ? 'Step into 100m' : 'Finish 5-min Dwell'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-lg font-bold mb-1">Sunday Service starts in 25 min</h3>
                    <div className="text-xs text-white/90 leading-relaxed mb-4">
                      {memberConsents.autoCheckin
                        ? 'Auto check-in is on. We’ll welcome you when you arrive at Accra Central.'
                        : 'Auto check-in is off. Show your personal code at the entrance.'}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setIsQrSheetOpen(true)}
                        className="bg-white text-[#6C5CE7] hover:bg-slate-100 rounded-xl px-4 py-2 text-xs font-bold shadow-sm flex items-center gap-1.5"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        Show my code
                      </button>
                      <button
                        onClick={advanceProximityStage}
                        className="bg-white/20 hover:bg-white/30 text-white rounded-xl px-3.5 py-2 text-xs font-bold"
                      >
                        Demo: I’ve arrived
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Coming up Preview */}
              <div>
                <h2 className="text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2">Coming up</h2>
                <div className="space-y-2">
                  {eventsList.slice(0, 2).map((ev) => (
                    <div
                      key={ev.title}
                      className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-2xl p-3 flex items-center gap-3 shadow-sm"
                    >
                      <div className="w-12 h-12 rounded-xl bg-[#EEEBFF] dark:bg-[#2A2A55] text-[#6C5CE7] dark:text-[#8C7DFF] flex flex-col items-center justify-center font-bold text-xs shrink-0">
                        <span>{ev.dateDay}</span>
                        <small className="text-[10px] font-semibold">{ev.dateNum}</small>
                      </div>
                      <div className="flex-1 min-w-0">
                        <b className="block text-xs font-bold truncate">{ev.title}</b>
                        <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8]">{ev.timeVenue}</span>
                      </div>
                      <button
                        onClick={() => toggleRsvp(ev.title)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${
                          memberRsvps[ev.title]
                            ? 'bg-[#DDF5EC] text-[#1E7A5F] dark:bg-[#16382F] dark:text-[#5FD3AB]'
                            : 'bg-[#EEEBFF] text-[#6C5CE7] dark:bg-[#2A2A55] dark:text-[#8C7DFF]'
                        }`}
                      >
                        {memberRsvps[ev.title] ? 'Going' : 'RSVP'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Giving Teaser */}
              <div className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-2xl p-4 shadow-sm flex items-center justify-between">
                <div>
                  <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Give to your church</b>
                  <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8]">
                    MTN MoMo, Telecel Cash or Card
                  </span>
                </div>
                <button
                  onClick={() => setActiveTab('give')}
                  className="bg-[#6C5CE7] text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-sm"
                >
                  Give
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: EVENTS */}
          {activeTab === 'events' && (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight">Events</h1>
                <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">
                  Tap RSVP to let leaders plan seating and children’s rooms.
                </p>
              </div>

              <div className="space-y-2.5">
                {eventsList.map((ev) => (
                  <div
                    key={ev.title}
                    className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-2xl p-3.5 flex items-center gap-3 shadow-sm"
                  >
                    <div className="w-12 h-12 rounded-xl bg-[#EEEBFF] dark:bg-[#2A2A55] text-[#6C5CE7] dark:text-[#8C7DFF] flex flex-col items-center justify-center font-bold text-xs shrink-0">
                      <span>{ev.dateDay}</span>
                      <small className="text-[10px] font-semibold">{ev.dateNum}</small>
                    </div>
                    <div className="flex-1 min-w-0">
                      <b className="block text-xs font-bold">{ev.title}</b>
                      <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8]">{ev.timeVenue}</span>
                    </div>
                    <button
                      onClick={() => toggleRsvp(ev.title)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${
                        memberRsvps[ev.title]
                          ? 'bg-[#DDF5EC] text-[#1E7A5F] dark:bg-[#16382F] dark:text-[#5FD3AB]'
                          : 'bg-[#EEEBFF] text-[#6C5CE7] dark:bg-[#2A2A55] dark:text-[#8C7DFF]'
                      }`}
                    >
                      {memberRsvps[ev.title] ? 'Going' : 'RSVP'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: GIVE */}
          {activeTab === 'give' && (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight">Give</h1>
                <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">
                  Your gift is recorded to your profile and receipted by email.
                </p>
              </div>

              {givenSuccess ? (
                <div className="bg-white dark:bg-[#1C1C3C] rounded-3xl p-6 text-center border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold">Thank you, Ama</h3>
                  <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] leading-relaxed">
                    GHS {giveCustomAmount || giveAmount} to {giveFund} via {giveMethod}. A receipt was sent to
                    ama@example.com.
                  </p>
                  <p className="text-[11px] text-[#8A5700] bg-[#FFEFD0] p-2 rounded-xl">
                    Demonstration mode: Simulated instant webhook confirmation.
                  </p>
                  <button
                    onClick={() => setGivenSuccess(false)}
                    className="w-full py-2.5 rounded-xl bg-[#6C5CE7] text-white text-xs font-bold shadow-sm"
                  >
                    Give again
                  </button>
                </div>
              ) : (
                <form onSubmit={handleGiveSubmit} className="space-y-3.5">
                  {/* Preset Amount Chips */}
                  <div>
                    <label className="block text-xs font-bold mb-1.5">Amount (GHS)</label>
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {[20, 50, 100, 200].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => {
                            setGiveAmount(amt);
                            setGiveCustomAmount('');
                          }}
                          className={`py-2 rounded-xl text-xs font-bold transition-all ${
                            giveAmount === amt && !giveCustomAmount
                              ? 'bg-[#6C5CE7] text-white shadow-sm'
                              : 'bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA]'
                          }`}
                        >
                          {amt}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      placeholder="Other amount (GHS)"
                      value={giveCustomAmount}
                      onChange={(e) => setGiveCustomAmount(e.target.value)}
                      className="w-full p-2.5 rounded-xl text-xs border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1C1C3C]"
                    />
                  </div>

                  {/* Fund Selector */}
                  <div>
                    <label className="block text-xs font-bold mb-1.5">Fund</label>
                    <select
                      value={giveFund}
                      onChange={(e) => setGiveFund(e.target.value)}
                      className="w-full p-2.5 rounded-xl text-xs border border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1C1C3C]"
                    >
                      <option>Tithe</option>
                      <option>Offering</option>
                      <option>Building project</option>
                      <option>Welfare</option>
                    </select>
                  </div>

                  {/* Pay With */}
                  <div>
                    <label className="block text-xs font-bold mb-1.5">Pay with</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['MTN MoMo', 'Telecel Cash', 'Card'] as const).map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setGiveMethod(method)}
                          className={`py-2 rounded-xl text-xs font-bold transition-all ${
                            giveMethod === method
                              ? 'bg-[#6C5CE7] text-white shadow-sm'
                              : 'bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA]'
                          }`}
                        >
                          {method}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-[#1D1B3A] text-white text-xs font-bold shadow-md hover:opacity-95 transition-all mt-4"
                  >
                    Give GHS {giveCustomAmount || giveAmount}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 4: ME (Privacy Centre) */}
          {activeTab === 'me' && (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight">Privacy Centre</h1>
                <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">
                  Ghana Act 843 compliant. You decide what Ekklesphere can do.
                </p>
              </div>

              {/* Privacy Toggles Card */}
              <div className="bg-white dark:bg-[#1C1C3C] rounded-3xl p-4 border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm divide-y divide-[#E3E5F2] dark:divide-[#2D2D55]">
                {/* Auto check-in */}
                <div className="py-2.5 first:pt-0 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <b className="block text-xs font-bold">Auto check-in</b>
                    <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] leading-tight block">
                      Uses location only when arriving at church. No trail saved.
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      updateMemberConsent(
                        !memberConsents.autoCheckin,
                        memberConsents.push,
                        memberConsents.sms,
                        memberConsents.email
                      )
                    }
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                      memberConsents.autoCheckin ? 'bg-[#6C5CE7]' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        memberConsents.autoCheckin ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Push notifications */}
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <b className="block text-xs font-bold">Push notifications</b>
                    <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] leading-tight block">
                      Arrival confirmations and church announcements.
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      updateMemberConsent(
                        memberConsents.autoCheckin,
                        !memberConsents.push,
                        memberConsents.sms,
                        memberConsents.email
                      )
                    }
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                      memberConsents.push ? 'bg-[#6C5CE7]' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        memberConsents.push ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* SMS reminders */}
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <b className="block text-xs font-bold">SMS reminders</b>
                    <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] leading-tight block">
                      For low-connectivity areas or zero data bundles.
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      updateMemberConsent(
                        memberConsents.autoCheckin,
                        memberConsents.push,
                        !memberConsents.sms,
                        memberConsents.email
                      )
                    }
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                      memberConsents.sms ? 'bg-[#6C5CE7]' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        memberConsents.sms ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Email receipts */}
                <div className="py-2.5 last:pb-0 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <b className="block text-xs font-bold">Email</b>
                    <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] leading-tight block">
                      Receipts and personalized check-in web links.
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      updateMemberConsent(
                        memberConsents.autoCheckin,
                        memberConsents.push,
                        memberConsents.sms,
                        !memberConsents.email
                      )
                    }
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                      memberConsents.email ? 'bg-[#6C5CE7]' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                        memberConsents.email ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* What the church holds */}
              <div>
                <h2 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2 uppercase tracking-wide">
                  What the church holds
                </h2>
                <div className="bg-white dark:bg-[#1C1C3C] rounded-2xl p-3.5 border border-[#E3E5F2] dark:border-[#2D2D55] text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#5B5F7A] dark:text-[#A9ACC8]">Name</span>
                    <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">Ama Owusu</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#5B5F7A] dark:text-[#A9ACC8]">Phone</span>
                    <b className="text-[#1D1B3A] dark:text-[#F2F2FA] font-mono">+233 24 123 4567</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#5B5F7A] dark:text-[#A9ACC8]">Email</span>
                    <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">ama@example.com</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#5B5F7A] dark:text-[#A9ACC8]">Cell Group</span>
                    <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">Osu North cell</b>
                  </div>
                </div>
              </div>

              {/* Data Rights Actions */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => showToast('Full data export (JSON/CSV) generated and sent to email.')}
                  className="py-2.5 rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] text-xs font-bold bg-white dark:bg-[#1C1C3C] flex items-center justify-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-[#6C5CE7]" />
                  Download data
                </button>
                <button
                  onClick={() => showToast('Data deletion request lodged with Data Protection Supervisor.')}
                  className="py-2.5 rounded-xl border border-[#E3E5F2] dark:border-[#2D2D55] text-xs font-bold text-[#EF5A6F] bg-white dark:bg-[#1C1C3C] flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete my data
                </button>
              </div>

              {/* Profile & Role Switcher */}
              <div className="pt-2">
                <h2 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] mb-2 uppercase tracking-wide">
                  Account & Portals
                </h2>
                <div className="bg-white dark:bg-[#1C1C3C] rounded-2xl p-3 border border-[#E3E5F2] dark:border-[#2D2D55] space-y-2">
                  <div className="text-[11px] font-semibold text-[#5B5F7A] dark:text-[#A9ACC8] flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Switch Active View:</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => switchUserRole('admin')}
                      className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 text-[#6D5CF2]" />
                      <span>Admin</span>
                    </button>
                    <button
                      onClick={() => switchUserRole('usher')}
                      className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <QrCode className="w-3.5 h-3.5 text-amber-500" />
                      <span>Usher</span>
                    </button>
                  </div>
                  <button
                    onClick={() => logout()}
                    className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center gap-1.5 transition-colors border border-rose-200 dark:border-rose-900/50 mt-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Tab Bar */}
        <nav
          className="border-t border-[#E3E5F2] dark:border-[#2D2D55] bg-white dark:bg-[#1C1C3C] grid grid-cols-4 py-2 px-1 z-10"
          aria-label="Member Navigation"
        >
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center gap-1 py-1 text-[11px] font-semibold transition-colors ${
              activeTab === 'home' ? 'text-[#6C5CE7] dark:text-[#8C7DFF]' : 'text-[#5B5F7A] dark:text-[#A9ACC8]'
            }`}
          >
            <Home className="w-5 h-5" />
            <span>Home</span>
          </button>

          <button
            onClick={() => setActiveTab('events')}
            className={`flex flex-col items-center gap-1 py-1 text-[11px] font-semibold transition-colors ${
              activeTab === 'events' ? 'text-[#6C5CE7] dark:text-[#8C7DFF]' : 'text-[#5B5F7A] dark:text-[#A9ACC8]'
            }`}
          >
            <Calendar className="w-5 h-5" />
            <span>Events</span>
          </button>

          <button
            onClick={() => setActiveTab('give')}
            className={`flex flex-col items-center gap-1 py-1 text-[11px] font-semibold transition-colors ${
              activeTab === 'give' ? 'text-[#6C5CE7] dark:text-[#8C7DFF]' : 'text-[#5B5F7A] dark:text-[#A9ACC8]'
            }`}
          >
            <Heart className="w-5 h-5" />
            <span>Give</span>
          </button>

          <button
            onClick={() => setActiveTab('me')}
            className={`flex flex-col items-center gap-1 py-1 text-[11px] font-semibold transition-colors ${
              activeTab === 'me' ? 'text-[#6C5CE7] dark:text-[#8C7DFF]' : 'text-[#5B5F7A] dark:text-[#A9ACC8]'
            }`}
          >
            <User className="w-5 h-5" />
            <span>Me</span>
          </button>
        </nav>

        {/* MODAL: QR Code Sheet */}
        {isQrSheetOpen && (
          <div className="absolute inset-0 bg-black/60 z-30 flex items-end">
            <div className="w-full bg-white dark:bg-[#1C1C3C] rounded-t-[32px] p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Your Check-in Code</h2>
                <button onClick={() => setIsQrSheetOpen(false)} className="text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">
                Show this rotating QR to an usher at the entrance or scan at the kiosk.
              </p>

              {/* Render high-contrast SVG QR */}
              <div className="bg-white p-4 rounded-2xl w-48 h-48 mx-auto flex items-center justify-center border border-slate-200 shadow-inner">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  {/* Position squares */}
                  <rect x="5" y="5" width="28" height="28" fill="#000" rx="3" />
                  <rect x="9" y="9" width="20" height="20" fill="#fff" rx="2" />
                  <rect x="13" y="13" width="12" height="12" fill="#000" rx="1" />

                  <rect x="67" y="5" width="28" height="28" fill="#000" rx="3" />
                  <rect x="71" y="9" width="20" height="20" fill="#fff" rx="2" />
                  <rect x="75" y="13" width="12" height="12" fill="#000" rx="1" />

                  <rect x="5" y="67" width="28" height="28" fill="#000" rx="3" />
                  <rect x="9" y="71" width="20" height="20" fill="#fff" rx="2" />
                  <rect x="13" y="75" width="12" height="12" fill="#000" rx="1" />

                  {/* Matrix patterns representing Ama Owusu */}
                  <rect x="40" y="8" width="6" height="6" fill="#000" />
                  <rect x="52" y="8" width="6" height="6" fill="#000" />
                  <rect x="40" y="20" width="6" height="6" fill="#000" />
                  <rect x="46" y="26" width="6" height="6" fill="#000" />
                  <rect x="40" y="40" width="12" height="12" fill="#6C5CE7" rx="2" />
                  <rect x="10" y="44" width="6" height="6" fill="#000" />
                  <rect x="22" y="44" width="6" height="6" fill="#000" />
                  <rect x="68" y="44" width="6" height="6" fill="#000" />
                  <rect x="80" y="44" width="6" height="6" fill="#000" />
                  <rect x="44" y="60" width="6" height="6" fill="#000" />
                  <rect x="56" y="60" width="6" height="6" fill="#000" />
                  <rect x="68" y="72" width="6" height="6" fill="#000" />
                  <rect x="80" y="80" width="12" height="12" fill="#000" />
                </svg>
              </div>

              <div className="text-center">
                <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                  AMA-OWUSU-ACCRA-2026
                </span>
                <span className="block text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] mt-0.5">
                  Rotating token: Refreshes every 45s
                </span>
              </div>

              <button
                onClick={() => setIsQrSheetOpen(false)}
                className="w-full py-2.5 rounded-xl bg-[#1D1B3A] text-white text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};
