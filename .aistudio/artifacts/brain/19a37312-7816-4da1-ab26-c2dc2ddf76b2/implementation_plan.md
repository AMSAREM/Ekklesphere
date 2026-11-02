# Ekklesphere: Church Management & Proximity Attendance System

A comprehensive church management platform tailored for low-friction attendance, pastoral care, and community engagement. Its signature capability is privacy-first automated attendance when an opted-in member arrives at church premises, alongside dedicated usher tools, member self-service, and proactive pastoral care workflows.

***

## User Review & Critical Decisions

> [!IMPORTANT]
> The architectural and design decisions below have been aligned with the user clarifications and project specifications.

*   **Confirmed Unified Portal Architecture**: A top portal bar provides seamless instant switching between the **Admin Dashboard** (executive leadership and pastoral operations), **Member Mobile App** (interactive mobile device simulation with QR, giving, events, and privacy centre), and **Usher PWA** (high-speed door scanning, offline sync simulation, and visitor intake), as well as a live **Proximity Simulator**.
*   **Confirmed Pilot Dataset**: Pre-loaded with Accra Central Church pilot data, including 10+ realistic members, multiple Sunday services (08:00 and 10:30), midweek fellowships, cell groups (Osu North, Choir, Youth, Ushers), active follow-up care queues for members absent 2–3 consecutive weeks, giving funds (Tithe, Welfare, Building), and live check-in counts.
*   **Confirmed Geofence & Proximity Simulation**: An interactive campus radar and approach simulator accurately models outer geofence entry (300 m approach signal), inner ring entry (100 m), configurable 5-minute dwell timer, entrance BLE beacon triggers, device payload signing, and real-time push/SMS confirmation.
*   **Mandatory Location Privacy & Ghana Act 843 Compliance**: Geofencing is simulated strictly on-device; raw location trails are never stored or transmitted. Members retain single-tap consent withdrawal, complete data access, and export/erasure rights.
*   **Member Attendance Frequency Chart (Recharts)**: A minimal, professional chart visualizing attendance frequency over configurable periods (4w, 8w, 12w, 24w) for individual members (with streak, on-time percentage, and check-in channel breakdown) and full congregation cohort distributions.
*   **MemberApp Attendance Streak & Digital Badges**: A visual streak flame indicator on the MemberApp Home tab rewarding consistent weekly attendance with 5 progressive digital milestone badges (Pilgrim of Faith, Steadfast Believer, Sanctuary Pillar, Sanctuary Anchor, and Grace Ambassador) and motivational scripture cards.

***

## 1. Overview & Core Concept

### What It Does
Ekklesphere modernizes church administration by eliminating manual paper registers and headcounts. Members who opt in are recognized seamlessly as they arrive on campus. Usher teams have high-speed scan and offline search tools for members without smartphones, and pastoral teams receive automated follow-up assignments whenever a member misses consecutive services—ensuring nobody quietly drifts away.

### Target Personas
1.  **Church Admin & Pastors (James & Ruth)**: Monitor attendance trends, assign care calls for absentees, oversee services, schedule volunteers, and broadcast announcements.
2.  **Church Members (Ama Owusu & others)**: Experience automatic hands-free check-in upon arrival, review service events, track attendance streaks, unlock digital badges, give via MTN MoMo / Telecel Cash, and manage their privacy consents.
3.  **Ushers & Greeters**: Run the fast, installable PWA at entrance doors to scan QR codes, search by phone number or name, register first-time visitors, and cache records offline during network drops.

### Key Value Delivered
*   **Zero-Friction Attendance**: Attendance takes care of itself via geofencing and entrance BLE beacons without battery drain.
*   **Timely Pastoral Care**: Surfaces consecutive absences at 2 weeks (group leader) and 3 weeks (pastor) before members detach permanently.
*   **Member Engagement & Gamification**: Weekly attendance streak indicator with inspiring scriptures and unlocked milestone badges.
*   **Offline-First Resilience**: Designed for African network realities with local queuing, idempotent client UUIDs, and low-data operation.

***

## 2. User Experience & Visual Design

### Visual Identity & Theme
*   **Aesthetic Direction**: Soft-card executive dashboard based on the reference design (`1001403593.jpg`), featuring rounded white cards (`rounded-3xl`), a light lavender/slate canvas (`#EEF0F8` in light mode, `#12122B` in dark mode), and a slim purple navigation side tab with custom curved anchor junctions.
*   **Color Palette**:
    *   *Primary / Brand*: Indigo `#6D5CF2` (sidebar, primary actions, active indicators, progress accents).
    *   *Dark Accent / Headings*: Deep Navy `#1D1B3A` (bold display typography, dark buttons).
    *   *Surfaces & Tints*: Soft Lilac `#EFEDFF`, Neutral White `#FFFFFF`, Card border `#E3E5F2`.
    *   *Semantic Accents*: Mint Green `#4FBF98` / `#7AD3B6` (attendance success, verified arrivals), Coral Pink `#EF5A6F` / `#FFE2E6` (high-priority care calls), Warm Gold `#D9A441` (notices).
*   **Typography**: Plus Jakarta Sans display and body hierarchy with `font-variant-numeric: tabular-nums` for timestamps, counts, and financial amounts.
*   **Card Architecture**: Generous 20–24px internal padding, subtle layered elevation (`shadow-sm` and `shadow-md`), cleanly decoupled unboxed metadata separated by `·`, and no cluttering pseudo-technical badges.

### Visual Analytics & Engagement Components
*   **Weekly Attendance Trend Chart (`recharts`)**: Aggregate 30-day weekly attendance volume, punctuality ratio, and channel breakdown.
*   **Member Attendance Frequency Chart (`recharts`)**: Period selector (`4w`, `8w`, `12w`, `24w`), individual member inspection, and congregation cohort distributions.
*   **Member Attendance Streak & Digital Badges Card**:
    *   Real-time weekly streak counter (`🔥 N-Week Attendance Streak`).
    *   5-week Sunday presence dots timeline with live check-in checkmarks.
    *   Progress bar to the next milestone badge.
    *   Interactive showcase shelf for all 5 progressive badges (Pilgrim of Faith, Steadfast Believer, Sanctuary Pillar, Sanctuary Anchor, Grace Ambassador).
    *   Detail modal with scripture encouragement and badge sharing.

***

## 3. Verification Plan

### Automated & Manual Checks
1.  **Build Verification**: Run `compile_applet` to ensure strict TypeScript compilation, zero broken imports, and proper Tailwind CSS v4 styling.
2.  **Vitest Test Suite**: 70 unit & integration tests covering security, role access, digital member card lookup, member attendance frequency calculations, and attendance streak milestone thresholds.
3.  **Member App Flow**: Test full self-service experience: check-in status countdown, streak counter, unlocked digital badges, QR generation, giving via MoMo, event RSVP, and privacy toggle persistence.
4.  **Admin Dashboard Visual Parity**: Verify matching layout with `1001403593.jpg` (curved purple side tab, greeting header, hero tiles, notifications, assignments, calendar, tasks, progress rings, and leaders' meeting).
5.  **Usher PWA Flow**: Test member search by name/phone, one-tap check-in, offline switch with pending sync queue and reconciliation toast, and visitor intake.
6.  **Proximity Engine Test**: Step through the outer ring, inner ring dwell, and beacon triggers; confirm that a check-in event increments the attendance rings and live counts seamlessly.
