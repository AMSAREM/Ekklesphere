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
  BookOpen,
  Clock,
  ArrowUpRight,
  Download,
  Users,
  Check,
  MapPin,
  Flame,
  Settings,
  Scan,
} from 'lucide-react';
import { MemberQrScannerModal } from './MemberQrScannerModal';

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
    setIsSettingsModalOpen,
    isSettingsModalOpen,
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
    {
      dateDay: 'Sun',
      dateNum: '1 Nov',
      title: 'Sunday Service',
      timeVenue: '08:00, Main hall',
      category: 'Worship',
      desc: 'Join us for praise, prophetic worship, and communion fellowship.',
    },
    {
      dateDay: 'Wed',
      dateNum: '4 Nov',
      title: 'Midweek Prayer & Communion',
      timeVenue: '18:30, Main hall',
      category: 'Prayer',
      desc: 'Intensive prayer session and biblical exposition on faith and grace.',
    },
    {
      dateDay: 'Sat',
      dateNum: '7 Nov',
      title: 'Youth Fellowship & Games',
      timeVenue: '16:00, Annex',
      category: 'Youth',
      desc: 'Interactive workshop on career discernment followed by board games.',
    },
    {
      dateDay: 'Sun',
      dateNum: '15 Nov',
      title: 'Harvest Thanksgiving Celebration',
      timeVenue: '09:00, Main hall',
      category: 'Special',
      desc: 'Annual church-wide praise and thanksgiving offering for the year.',
    },
  ];

  const handleGiveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalAmount = giveCustomAmount ? parseInt(giveCustomAmount, 10) : giveAmount;
    if (!finalAmount || finalAmount <= 0) {
      showToast('Please enter a valid amount');
      return;
    }
    submitDonation(finalAmount, giveFund, giveMethod);
    setGivenSuccess(true);
  };

  /* =========================================================================
     TAB CONTENT COMPONENTS (Shared between Native/Responsive and Phone Mockup)
     ========================================================================= */

  const renderHomeContent = () => (
    <div className="space-y-4 sm:space-y-6">
      {/* Welcome & Member Badge Header (shown in responsive mode) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-[#1C1C3C] p-4 sm:p-5 rounded-3xl border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-[#5B5F7A] dark:text-[#A9ACC8]">Accra Central Church</span>
            <span className="text-[#5B5F7A] dark:text-[#A9ACC8]">·</span>
            <span className="text-xs font-bold text-[#6C5CE7] dark:text-[#8C7DFF]">Osu North Cell</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
            Good morning, Ama Owusu
          </h1>
          <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] mt-0.5">
            Member ID: <span className="font-mono font-bold">AMA-OWUSU-ACCRA-2026</span>
          </p>
        </div>

        <div className="flex items-center gap-2 pt-1 sm:pt-0">
          <button
            onClick={() => setIsQrSheetOpen(true)}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-2xl bg-[#EEEBFF] hover:bg-[#E0DCFF] dark:bg-[#2A2A55] dark:hover:bg-[#343468] text-[#6C5CE7] dark:text-[#8C7DFF] text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <QrCode className="w-4 h-4" />
            <span>Check-in Scanner</span>
          </button>
        </div>
      </div>

      {/* Proximity & Live Attendance Status Card */}
      <div className="bg-[#6C5CE7] dark:bg-[#7D6DF8] text-white rounded-3xl p-5 sm:p-6 shadow-md transition-all">
        {isCheckedIn ? (
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-400/20 text-emerald-300 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">You’re checked in, Ama</h3>
                  <p className="text-xs text-white/90">
                    Sunday Service, 08:00 · Verified via Proximity Auto check-in
                  </p>
                </div>
              </div>
              <span className="hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/20 text-xs font-bold">
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                Present
              </span>
            </div>

            <div className="mt-4 pt-4 border-t border-white/20 flex flex-wrap items-center justify-between gap-3 text-xs text-white/90">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                Accra Central Sanctuary · Cell Seat Assigned
              </span>
              <button
                onClick={resetProximity}
                className="bg-white/20 hover:bg-white/30 text-white rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                Not me / Reset Check-in
              </button>
            </div>
          </div>
        ) : proximityStage === 1 || proximityStage === 2 ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Radio className="w-5 h-5 text-amber-300 animate-pulse" />
              <h3 className="text-lg font-bold">
                {proximityStage === 1 ? 'Approaching Accra Central (300m)' : 'At Entrance · Verifying Dwell (100m)'}
              </h3>
            </div>
            <p className="text-xs text-white/90 leading-relaxed max-w-xl">
              {proximityStage === 1
                ? 'Device woke up and registered approach inside outer geofence ring. Ready for entrance verification.'
                : 'Inside 100m perimeter. Dwell timer active to prevent drive-by check-ins. Almost verified!'}
            </p>

            {/* Stepper */}
            <div className="flex gap-2 mt-4 max-w-sm">
              <div className="flex-1 h-2 rounded-full bg-white" />
              <div
                className={`flex-1 h-2 rounded-full transition-all ${
                  proximityStage >= 2 ? 'bg-white' : 'bg-white/30'
                }`}
              />
              <div className="flex-1 h-2 rounded-full bg-white/30" />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={advanceProximityStage}
                className="bg-white text-[#6C5CE7] hover:bg-slate-100 rounded-xl px-4 py-2 text-xs font-bold shadow-sm transition-colors"
              >
                {proximityStage === 1 ? 'Step into 100m Ring' : 'Complete 5-min Dwell & Check In'}
              </button>
              <button
                onClick={resetProximity}
                className="bg-white/20 hover:bg-white/30 text-white rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg sm:text-xl font-bold">Sunday Service starts in 25 min</h3>
              <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full font-semibold">08:00 AM</span>
            </div>
            <p className="text-xs sm:text-sm text-white/90 leading-relaxed max-w-xl mb-4">
              {memberConsents.autoCheckin
                ? 'Automatic proximity check-in is active. We’ll welcome you seamlessly when you step onto church premises.'
                : 'Auto check-in is currently turned off in privacy settings. You can show your digital QR code at any usher station.'}
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => setIsQrSheetOpen(true)}
                className="bg-white text-[#6C5CE7] hover:bg-slate-100 rounded-2xl px-4 py-2.5 text-xs font-bold shadow-md flex items-center gap-2 transition-colors"
              >
                <QrCode className="w-4 h-4" />
                <span>Show My Entry Code</span>
              </button>
              <button
                onClick={advanceProximityStage}
                className="bg-white/20 hover:bg-white/30 text-white rounded-2xl px-4 py-2.5 text-xs font-bold transition-colors"
              >
                Demo: I’ve Arrived
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Two-column grid on desktop/tablets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Today's Sermon & Bulletin */}
        <div className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6C5CE7] dark:text-[#8C7DFF] flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              Today’s Message
            </span>
            <span className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8]">Rev. Dr. Mensa Otabil</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
              Walking in Supernatural Grace & Favor
            </h3>
            <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] mt-1 leading-relaxed">
              Scripture: 2 Corinthians 9:8 · "God is able to bless you abundantly, so that in all things having all that you need, you will abound in every good work."
            </p>
          </div>
          <div className="pt-2 flex items-center justify-between border-t border-[#E3E5F2] dark:border-[#2D2D55] text-xs">
            <span className="text-[#5B5F7A] dark:text-[#A9ACC8] font-medium">Cell Group: Osu North</span>
            <button
              onClick={() => showToast('Sermon study notes downloaded to your device.')}
              className="text-[#6C5CE7] dark:text-[#8C7DFF] font-bold hover:underline flex items-center gap-1"
            >
              <span>Download Notes</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Giving Shortcut Card */}
        <div className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5" />
                Faithful Giving
              </span>
              <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8]">Paystack / MoMo</span>
            </div>
            <h3 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Give Tithes & Offerings</h3>
            <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] mt-1">
              Quick donation with MTN MoMo, Telecel Cash, or Visa/Mastercard. Instant tax-compliant church receipt.
            </p>
          </div>

          <div className="pt-4 flex items-center gap-2">
            {[50, 100, 200].map((amt) => (
              <button
                key={amt}
                onClick={() => {
                  setGiveAmount(amt);
                  setGiveCustomAmount('');
                  setActiveTab('give');
                }}
                className="flex-1 py-2 rounded-xl text-xs font-bold border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 hover:bg-[#EEEBFF] hover:border-[#6C5CE7] text-[#1D1B3A] dark:text-[#F2F2FA] transition-all"
              >
                GHS {amt}
              </button>
            ))}
            <button
              onClick={() => setActiveTab('give')}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#6C5CE7] hover:bg-[#5b4be0] text-white transition-colors shrink-0 shadow-sm"
            >
              Give
            </button>
          </div>
        </div>
      </div>

      {/* Coming Up Events Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA] flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#6C5CE7]" />
            <span>Upcoming Gatherings</span>
          </h2>
          <button
            onClick={() => setActiveTab('events')}
            className="text-xs font-bold text-[#6C5CE7] dark:text-[#8C7DFF] hover:underline"
          >
            View all ({eventsList.length})
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {eventsList.slice(0, 2).map((ev) => (
            <div
              key={ev.title}
              className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-4 flex items-center gap-3.5 shadow-sm"
            >
              <div className="w-13 h-13 rounded-2xl bg-[#EEEBFF] dark:bg-[#2A2A55] text-[#6C5CE7] dark:text-[#8C7DFF] flex flex-col items-center justify-center font-bold text-xs shrink-0">
                <span className="text-[11px] uppercase tracking-wider">{ev.dateDay}</span>
                <span className="text-sm font-extrabold">{ev.dateNum.split(' ')[0]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-bold text-[#6C5CE7] dark:text-[#8C7DFF] uppercase tracking-wider block">
                  {ev.category}
                </span>
                <b className="block text-xs sm:text-sm font-bold text-[#1D1B3A] dark:text-[#F2F2FA] truncate">
                  {ev.title}
                </b>
                <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span className="truncate">{ev.timeVenue}</span>
                </span>
              </div>
              <button
                onClick={() => toggleRsvp(ev.title)}
                className={`text-xs font-bold px-3.5 py-2 rounded-xl transition-all shrink-0 ${
                  memberRsvps[ev.title]
                    ? 'bg-[#DDF5EC] text-[#1E7A5F] dark:bg-[#16382F] dark:text-[#5FD3AB]'
                    : 'bg-[#EEEBFF] text-[#6C5CE7] dark:bg-[#2A2A55] dark:text-[#8C7DFF] hover:bg-[#6C5CE7] hover:text-white'
                }`}
              >
                {memberRsvps[ev.title] ? 'Going ✓' : 'RSVP'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderEventsContent = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
            Church Events & Services
          </h1>
          <p className="text-xs sm:text-sm text-[#5B5F7A] dark:text-[#A9ACC8]">
            RSVP helps pastoral leadership plan seating, children's ministry, and hospitality.
          </p>
        </div>
        <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-[#6C5CE7] dark:text-[#8C7DFF] w-fit">
          Accra Central Parish
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
        {eventsList.map((ev) => (
          <div
            key={ev.title}
            className="bg-white dark:bg-[#1C1C3C] border border-[#E3E5F2] dark:border-[#2D2D55] rounded-3xl p-4 sm:p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow"
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-13 h-13 rounded-2xl bg-[#EEEBFF] dark:bg-[#2A2A55] text-[#6C5CE7] dark:text-[#8C7DFF] flex flex-col items-center justify-center font-bold text-xs shrink-0">
                    <span className="text-[11px] uppercase tracking-wider">{ev.dateDay}</span>
                    <span className="text-sm font-extrabold">{ev.dateNum.split(' ')[0]}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-[#6C5CE7] dark:text-[#8C7DFF] uppercase tracking-wider">
                      {ev.category}
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                      {ev.title}
                    </h3>
                  </div>
                </div>
                <span
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                    memberRsvps[ev.title]
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {memberRsvps[ev.title] ? 'Attending' : 'Open'}
                </span>
              </div>
              <p className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] leading-relaxed mb-3">
                {ev.desc}
              </p>
            </div>

            <div className="pt-3 border-t border-[#E3E5F2] dark:border-[#2D2D55] flex items-center justify-between">
              <span className="text-xs text-[#5B5F7A] dark:text-[#A9ACC8] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>{ev.timeVenue}</span>
              </span>
              <button
                onClick={() => toggleRsvp(ev.title)}
                className={`text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-sm ${
                  memberRsvps[ev.title]
                    ? 'bg-[#DDF5EC] text-[#1E7A5F] dark:bg-[#16382F] dark:text-[#5FD3AB]'
                    : 'bg-[#6C5CE7] text-white hover:bg-[#5b4be0]'
                }`}
              >
                {memberRsvps[ev.title] ? 'Reserved ✓' : 'RSVP Now'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderGiveContent = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
            Tithe & Offering Portal
          </h1>
          <p className="text-xs sm:text-sm text-[#5B5F7A] dark:text-[#A9ACC8]">
            Your giving is recorded directly to your confidential church profile and receipted via email.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-full w-fit">
          <ShieldCheck className="w-4 h-4" />
          <span>Paystack Encrypted</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Donation Form */}
        <div className="lg:col-span-7">
          {givenSuccess ? (
            <div className="bg-white dark:bg-[#1C1C3C] rounded-3xl p-6 sm:p-8 text-center border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm space-y-4 animate-in fade-in">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Thank you for your gift, Ama!</h3>
              <p className="text-xs sm:text-sm text-[#5B5F7A] dark:text-[#A9ACC8] leading-relaxed max-w-md mx-auto">
                GHS {giveCustomAmount || giveAmount} received for <b>{giveFund}</b> via <b>{giveMethod}</b>. A formal
                statement has been sent to <b>ama@example.com</b>.
              </p>
              <div className="text-[11px] text-[#8A5700] dark:text-[#F5B84A] bg-[#FFEFD0] dark:bg-[#3D2E10] p-3 rounded-2xl max-w-md mx-auto font-medium">
                Accra Central Church finance system synchronized. Cell group record updated.
              </div>
              <button
                onClick={() => setGivenSuccess(false)}
                className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-[#6C5CE7] hover:bg-[#5b4be0] text-white text-xs font-bold shadow-md transition-all"
              >
                Make Another Gift
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleGiveSubmit}
              className="bg-white dark:bg-[#1C1C3C] rounded-3xl p-5 sm:p-6 border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm space-y-4"
            >
              {/* Preset Amount Chips */}
              <div>
                <label className="block text-xs font-bold mb-2 text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Select Amount (GHS)
                </label>
                <div className="grid grid-cols-4 gap-2 mb-2.5">
                  {[20, 50, 100, 200].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        setGiveAmount(amt);
                        setGiveCustomAmount('');
                      }}
                      className={`py-2.5 rounded-2xl text-xs font-bold transition-all ${
                        giveAmount === amt && !giveCustomAmount
                          ? 'bg-[#6C5CE7] text-white shadow-sm ring-2 ring-[#6C5CE7]/30'
                          : 'bg-slate-50 dark:bg-black/20 border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-100'
                      }`}
                    >
                      GHS {amt}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  placeholder="Or enter custom amount (e.g. 350)"
                  value={giveCustomAmount}
                  onChange={(e) => setGiveCustomAmount(e.target.value)}
                  className="w-full p-3 rounded-2xl text-xs border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6C5CE7]"
                />
              </div>

              {/* Fund Selector */}
              <div>
                <label className="block text-xs font-bold mb-2 text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Designation Fund
                </label>
                <select
                  value={giveFund}
                  onChange={(e) => setGiveFund(e.target.value)}
                  className="w-full p-3 rounded-2xl text-xs border border-[#E3E5F2] dark:border-[#2D2D55] bg-slate-50 dark:bg-black/20 text-[#1D1B3A] dark:text-[#F2F2FA] outline-none focus:ring-2 focus:ring-[#6C5CE7]"
                >
                  <option>Tithe (10% Income)</option>
                  <option>Sunday Offering</option>
                  <option>Building Sanctuary Project</option>
                  <option>Welfare & Benevolence</option>
                  <option>Foreign Missions & Outreach</option>
                </select>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold mb-2 text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['MTN MoMo', 'Telecel Cash', 'Card'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setGiveMethod(method)}
                      className={`py-3 px-2 rounded-2xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${
                        giveMethod === method
                          ? 'bg-[#6C5CE7] text-white shadow-sm ring-2 ring-[#6C5CE7]/30'
                          : 'bg-slate-50 dark:bg-black/20 border border-[#E3E5F2] dark:border-[#2D2D55] text-[#1D1B3A] dark:text-[#F2F2FA] hover:bg-slate-100'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>{method}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-[#1D1B3A] dark:bg-[#6C5CE7] hover:bg-[#282855] text-white text-xs sm:text-sm font-bold shadow-lg transition-all mt-4"
              >
                Proceed to Give GHS {giveCustomAmount || giveAmount}
              </button>
            </form>
          )}
        </div>

        {/* Right: Summary & Statement */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-[#1C1C3C] rounded-3xl p-5 border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm">
            <h3 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] uppercase tracking-wide mb-3">
              Giving Statement Summary (2026)
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs pb-2 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8]">Year-to-Date Tithe</span>
                <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">GHS 1,200.00</span>
              </div>
              <div className="flex justify-between items-center text-xs pb-2 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8]">Offerings & Welfare</span>
                <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">GHS 250.00</span>
              </div>
              <div className="flex justify-between items-center text-xs pt-1">
                <span className="font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Total Contributed</span>
                <span className="font-extrabold text-[#6C5CE7] dark:text-[#8C7DFF] text-sm">GHS 1,450.00</span>
              </div>
            </div>

            <button
              onClick={() => showToast('Annual church tax statement PDF emailed to ama@example.com.')}
              className="mt-4 w-full py-2.5 rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] text-xs font-bold bg-slate-50 dark:bg-black/20 hover:bg-slate-100 dark:hover:bg-black/30 flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#6C5CE7]" />
              <span>Download Tax Statement (PDF)</span>
            </button>
          </div>

          <div className="bg-[#EEEBFF] dark:bg-[#2A2A55] rounded-3xl p-5 text-xs text-[#1D1B3A] dark:text-[#F2F2FA]">
            <b className="block font-bold mb-1 flex items-center gap-1.5 text-[#6C5CE7] dark:text-[#8C7DFF]">
              <ShieldCheck className="w-4 h-4" />
              Church Financial Transparency
            </b>
            <p className="opacity-90 leading-relaxed text-[11px]">
              All mobile transactions through Ekklesphere are verified via Bank of Ghana certified aggregators. No bank
              pins are stored on our servers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderMeContent = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D1B3A] dark:text-[#F2F2FA]">
            Privacy & Profile Centre
          </h1>
          <p className="text-xs sm:text-sm text-[#5B5F7A] dark:text-[#A9ACC8]">
            Ghana Data Protection Act (Act 843) compliant. You maintain complete control over your records.
          </p>
        </div>
        <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 w-fit flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Consent Active</span>
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Privacy Permissions */}
        <div className="bg-white dark:bg-[#1C1C3C] rounded-3xl p-5 border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm space-y-4">
          <h2 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] uppercase tracking-wide">
            Automated Presence & Communication Consents
          </h2>
          <div className="divide-y divide-[#E3E5F2] dark:divide-[#2D2D55]">
            {/* Auto check-in */}
            <div className="py-3 first:pt-0 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Proximity Auto Check-in
                </b>
                <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] leading-tight block">
                  Uses device bluetooth and entrance geofence only when arriving. No tracking trails saved.
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
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  memberConsents.autoCheckin ? 'bg-[#6C5CE7]' : 'bg-slate-300 dark:bg-slate-700'
                }`}
                aria-label="Toggle auto checkin"
              >
                <span
                  className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm ${
                    memberConsents.autoCheckin ? 'left-[26px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Push notifications */}
            <div className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">
                  Push Notifications
                </b>
                <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] leading-tight block">
                  Arrival confirmations, service updates, and cell prayer requests.
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
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  memberConsents.push ? 'bg-[#6C5CE7]' : 'bg-slate-300 dark:bg-slate-700'
                }`}
                aria-label="Toggle push notifications"
              >
                <span
                  className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm ${
                    memberConsents.push ? 'left-[26px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* SMS reminders */}
            <div className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">SMS Reminders</b>
                <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] leading-tight block">
                  Offline fallback notifications when mobile data is depleted.
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
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  memberConsents.sms ? 'bg-[#6C5CE7]' : 'bg-slate-300 dark:bg-slate-700'
                }`}
                aria-label="Toggle SMS reminders"
              >
                <span
                  className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm ${
                    memberConsents.sms ? 'left-[26px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Email receipts */}
            <div className="py-3 last:pb-0 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <b className="block text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA]">Email Receipts</b>
                <span className="text-[11px] text-[#5B5F7A] dark:text-[#A9ACC8] leading-tight block">
                  Donation tax receipts, sermon notes, and prayer guides.
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
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  memberConsents.email ? 'bg-[#6C5CE7]' : 'bg-slate-300 dark:bg-slate-700'
                }`}
                aria-label="Toggle email receipts"
              >
                <span
                  className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm ${
                    memberConsents.email ? 'left-[26px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Member Profile & Data Rights */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#1C1C3C] rounded-3xl p-5 border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm space-y-3">
            <h2 className="text-xs font-bold text-[#1D1B3A] dark:text-[#F2F2FA] uppercase tracking-wide">
              Official Church Records
            </h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8]">Full Legal Name</span>
                <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">Ama Owusu</b>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8]">Phone (Ghana MoMo)</span>
                <b className="text-[#1D1B3A] dark:text-[#F2F2FA] font-mono">+233 24 123 4567</b>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#E3E5F2] dark:border-[#2D2D55]">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8]">Registered Email</span>
                <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">ama@example.com</b>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[#5B5F7A] dark:text-[#A9ACC8]">Fellowship Cell</span>
                <b className="text-[#1D1B3A] dark:text-[#F2F2FA]">Osu North Cell (Leader: Bro. Kwame)</b>
              </div>
            </div>

            {/* Data Protection Actions */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => showToast('Full data export (JSON & PDF) generated and emailed.')}
                className="py-2.5 rounded-2xl border border-[#E3E5F2] dark:border-[#2D2D55] text-xs font-bold bg-slate-50 dark:bg-black/20 hover:bg-slate-100 flex items-center justify-center gap-1.5 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-[#6C5CE7]" />
                <span>Export My Data</span>
              </button>
              <button
                onClick={() => showToast('Data deletion inquiry sent to Data Protection Officer.')}
                className="py-2.5 rounded-2xl border border-rose-200 dark:border-rose-900/40 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-100/50 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete My Record</span>
              </button>
            </div>
          </div>

          {/* Sign Out Action */}
          <div className="bg-white dark:bg-[#1C1C3C] rounded-3xl p-5 border border-[#E3E5F2] dark:border-[#2D2D55] shadow-sm">
            <button
              onClick={() => logout()}
              className="w-full py-3 rounded-2xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out from Ekklesphere</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  /* =========================================================================
     MAIN RENDER: ADAPTIVE TO ALL SCREENS & VIEWPORTS
     ========================================================================= */

  return (
    <main className="relative max-w-[1360px] w-full mx-auto my-1.5 sm:my-3 lg:my-4 bg-[#F6F7FC] dark:bg-[#14142E] rounded-2xl sm:rounded-3xl lg:rounded-[36px] pt-4 sm:pt-6 pb-24 sm:pb-28 lg:pb-8 px-3 sm:px-6 lg:pl-[88px] lg:pr-8 shadow-lg lg:shadow-[0_20px_60px_rgba(60,50,140,0.12)] border border-[#E9EBF5] dark:border-[#2D2D55] min-h-[calc(100vh-80px)] lg:min-h-[900px] transition-all duration-200">
      {/* Signature Purple Navigation Bar - Fixed to Left Screen Edge on Desktop & Centered Floating Pill on Mobile */}
      <aside
        aria-label="Member Navigation"
        className="fixed z-50 bottom-4 left-1/2 -translate-x-1/2 lg:translate-x-0 lg:bottom-auto lg:top-20 lg:left-0 w-auto max-w-[calc(100vw-32px)] lg:w-[64px] bg-[#6D5CF2] rounded-full lg:rounded-r-[28px] lg:rounded-l-none flex flex-row lg:flex-col items-center justify-around sm:justify-center lg:justify-start gap-1 sm:gap-2 lg:gap-2.5 px-3 py-1.5 sm:px-4 sm:py-2 lg:py-5 lg:px-0 shadow-[0_16px_40px_rgba(40,30,120,0.35)] lg:shadow-[0_12px_32px_rgba(40,30,120,0.25)] border border-white/20 lg:border-none backdrop-blur-md transition-all duration-200"
      >
        {/* 1. Home */}
        <div className="relative group">
          <button
            onClick={() => setActiveTab('home')}
            aria-label="Home Feed"
            aria-current={activeTab === 'home' && !isQrSheetOpen ? 'page' : undefined}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full lg:rounded-[14px] flex items-center justify-center transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'home' && !isQrSheetOpen
                ? 'bg-white text-[#6D5CF2] shadow-[0_6px_14px_rgba(40,30,120,0.25)] font-bold scale-105'
                : 'text-white/85 hover:text-white hover:bg-white/20'
            }`}
          >
            <Home className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Home</span>
          </span>
        </div>

        {/* 2. Services & Events */}
        <div className="relative group">
          <button
            onClick={() => setActiveTab('events')}
            aria-label="Services & Calendar"
            aria-current={activeTab === 'events' ? 'page' : undefined}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full lg:rounded-[14px] flex items-center justify-center transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'events'
                ? 'bg-white text-[#6D5CF2] shadow-[0_6px_14px_rgba(40,30,120,0.25)] font-bold scale-105'
                : 'text-white/85 hover:text-white hover:bg-white/20'
            }`}
          >
            <Calendar className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Services</span>
          </span>
        </div>

        {/* 3. Giving */}
        <div className="relative group">
          <button
            onClick={() => setActiveTab('give')}
            aria-label="Tithes & Giving"
            aria-current={activeTab === 'give' ? 'page' : undefined}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full lg:rounded-[14px] flex items-center justify-center transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'give'
                ? 'bg-white text-[#6D5CF2] shadow-[0_6px_14px_rgba(40,30,120,0.25)] font-bold scale-105'
                : 'text-white/85 hover:text-white hover:bg-white/20'
            }`}
          >
            <Heart className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Giving</span>
          </span>
        </div>

        {/* 4. Scanner & Pass */}
        <div className="relative group">
          <button
            onClick={() => setIsQrSheetOpen(true)}
            aria-label="Check-in Scanner & Pass"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full lg:rounded-[14px] flex items-center justify-center text-white/85 hover:text-white hover:bg-white/20 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95"
          >
            <QrCode className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Scan & Pass</span>
          </span>
        </div>

        {/* 5. Profile & Settings */}
        <div className="relative group">
          <button
            onClick={() => setActiveTab('me')}
            aria-label="Profile & Settings"
            aria-current={activeTab === 'me' ? 'page' : undefined}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full lg:rounded-[14px] flex items-center justify-center transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 active:scale-95 ${
              activeTab === 'me'
                ? 'bg-white text-[#6D5CF2] shadow-[0_6px_14px_rgba(40,30,120,0.25)] font-bold scale-105'
                : 'text-white/85 hover:text-white hover:bg-white/20'
            }`}
          >
            <User className="w-5 h-5 shrink-0" />
          </button>
          <span className="hidden lg:group-hover:flex items-center gap-1.5 absolute left-[70px] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1D1B3A] dark:bg-[#F2F2FA] text-white dark:text-[#1D1B3A] text-xs font-bold rounded-xl shadow-xl pointer-events-none whitespace-nowrap z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <span>Profile</span>
          </span>
        </div>
      </aside>

      {/* Main Member Content Area */}
      <div className="flex-1 min-w-0 w-full">
        <div className="w-full space-y-4 sm:space-y-6">
          {/* Active Tab View */}
          <div className="min-h-[500px]">
            {activeTab === 'home' && renderHomeContent()}
            {activeTab === 'events' && renderEventsContent()}
            {activeTab === 'give' && renderGiveContent()}
            {activeTab === 'me' && renderMeContent()}
          </div>
        </div>
      </div>

      {/* Check-in Scanner Modal: Simulates camera access to scan other member QR codes or show entry code */}
      <MemberQrScannerModal
        isOpen={isQrSheetOpen}
        onClose={() => setIsQrSheetOpen(false)}
      />
    </main>
  );
};
