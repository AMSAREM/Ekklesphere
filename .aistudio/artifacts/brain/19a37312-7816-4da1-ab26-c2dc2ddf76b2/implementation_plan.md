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

***

## 1. Overview & Core Concept

### What It Does
Ekklesphere modernizes church administration by eliminating manual paper registers and headcounts. Members who opt in are recognized seamlessly as they arrive on campus. Usher teams have high-speed scan and offline search tools for members without smartphones, and pastoral teams receive automated follow-up assignments whenever a member misses consecutive services—ensuring nobody quietly drifts away.

### Target Personas
1.  **Church Admin & Pastors (James & Ruth)**: Monitor attendance trends, assign care calls for absentees, oversee services, schedule volunteers, and broadcast announcements.
2.  **Church Members (Ama Owusu & others)**: Experience automatic hands-free check-in upon arrival, review service events, give via MTN MoMo / Telecel Cash, and manage their privacy consents.
3.  **Ushers & Greeters**: Run the fast, installable PWA at entrance doors to scan QR codes, search by phone number or name, register first-time visitors, and cache records offline during network drops.

### Key Value Delivered
*   **Zero-Friction Attendance**: Attendance takes care of itself via geofencing and entrance BLE beacons without battery drain.
*   **Timely Pastoral Care**: Surfaces consecutive absences at 2 weeks (group leader) and 3 weeks (pastor) before members detach permanently.
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

### Surface Breakdown & Key User Flows

#### A. Admin Dashboard (Desktop Viewport)
```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│  [Ekklesphere Portal Bar:  • Admin Dashboard  |  • Member Mobile App  |  • Usher PWA  | 🛰️ Sim] │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌────┐  Dashboard  Workflows  Integrations   [Search...]   [Light/Dark]  [Export CSV] [+ Add Svc]│
│ │ ⊞  │ ──────────────────────────────────────────────────────────────────────────────────────│
│ │ 👤 │  Hi, James! • •                                                                        │
│ │ 🥧 │  What are your plans for today?          [+]  [Check In]  [Follow up]  [Message]       │
│ │ 🔔 │                                                                                       │
│ │ 📅 │ ┌───────────────────┐ ┌────────────────────┐ ┌────────────────────┐                   │
│ │ ✉️ │ │ Notifications     │ │ Assignments        │ │ Calendar & Events  │                   │
│ │ 📋 │ │ • Sunday Briefing │ │ • Call Kofi Mensah │ │ Oct 26 - Nov 1     │                   │
│ │ 💬 │ │ • Pastor Ruth msg │ │   (absent 3 weeks) │ │ [Mon] [Tue] [Wed]..│                   │
│ └────┘ └───────────────────┘ └────────────────────┘ └────────────────────┘                   │
│        ┌───────────────────────────────┐ ┌───────────────┐ ┌────────────────────────────────┐│
│        │ Today's Tasks                 │ │ Turn on auto  │ │ Attendance 79%   Opt-in 65%    ││
│        │ • Brief greeters (90%)        │ │ check-in!     │ │ 412 / 520        187 to go     ││
│        │ • Check beacons (50%)         │ │ [Invite bt]   │ ├────────────────────────────────┤│
│        │ • Send reminders (10%)        │ └───────────────┘ │ Leaders' Meeting (Wed 06:30 PM)││
│        └───────────────────────────────┘                   └────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### B. Member Mobile App (Interactive Device Frame)
*   **Home Tab**: Dynamic status card showing service countdown ("Sunday Service starts in 25 minutes"), auto-check-in verification steps, "Show my code" QR button, and quick "Demo: I've arrived" proximity trigger.
*   **Events Tab**: Service calendar, youth fellowship, midweek prayer with one-tap RSVP.
*   **Giving Tab**: Support church funds (Tithe, Offering, Building, Welfare) with quick preset chips (20, 50, 100, 200 GHS) and MTN MoMo / Telecel Cash / Card selection with instant confirmation.
*   **Privacy Centre Tab**: Plain-English switches for Auto check-in, Push, SMS, and Email, verified profile details, and "Download my data" / "Delete my data" request handlers.

#### C. Usher PWA (Door & Greeter Tool)
*   **Live Service Counter**: Active counter (408+ checked in), first-time visitors indicator, and live service picker.
*   **Offline Mode Switch & Banner**: Real-time switch to test offline queueing; displays pending check-ins banner with "Sync now" reconciliation.
*   **Quick Scan & Live Search**: Instant telephone and name search; one-tap check-in with green confirmation flash card and avatar display.
*   **Add Visitor Sheet**: 30-second first-time visitor registration (Name, Phone, How did you hear, Prayer request) with automated welcome follow-up scheduled.

#### D. Interactive Proximity & Geofence Radar Simulator
*   Visual interactive campus radar showing the Accra Central Church campus, the Outer Ring (300 m), and Inner Ring (100 m).
*   Controls to step through or simulate:
    1.  *Approaching campus* (OS wakes app at 300 m).
    2.  *Entering inner ring* (100 m, dwell timer starts ticking 5:00 → 0:00).
    3.  *Entrance BLE beacon detected* (bypasses dwell for immediate high confidence).
    4.  *Signed payload sent to API* with idempotency UUID.
    5.  *Push notification delivered* to member's phone and reflected immediately in Admin and Usher totals.

***

## 3. Key Product Decisions & Trade-Offs

*   **Unified Reactive In-Memory Store with LocalStorage Persistence**:
    *   *Decision*: Use a comprehensive client-side reactive store modeling the exact PostgreSQL/PostGIS schema and entities (tenants, campuses, persons, service_instances, attendance_signals, attendance_records, followup_tasks, donations, and audit_log).
    *   *Why*: Allows instant, zero-latency feedback across all three portals in the sandbox without requiring external database provisioning or credential walls, while preserving the exact database data contracts.
*   **Full Ghana Act 843 Privacy Guarantees**:
    *   *Decision*: Enforce zero continuous location polling. The simulator and member apps only generate arrival/dwell signals inside configured service windows.
    *   *Why*: Directly honors the mandatory privacy-by-design requirement in Section 4.2 of the brief.
*   **Multi-Role State Synchronisation**:
    *   *Decision*: Checking in a member in either the Member App, Usher PWA, or Proximity Simulator immediately updates the Admin Dashboard's live progress rings, task tallies, and member lists via shared reactive state.
    *   *Why*: Demonstrates real-time operational synergy across church staff and congregation.

***

## 4. Technical Architecture & Data Strategy

### System Component Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Ekklesphere Applet                            │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                     Portal Switcher Bar                        │   │
│   │    [Admin Dashboard] [Member App] [Usher PWA] [Proximity Sim]  │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                                │                                       │
│        ┌───────────────────────┼───────────────────────┐               │
│        ▼                       ▼                       ▼               │
│  ┌───────────────┐     ┌───────────────┐       ┌───────────────┐       │
│  │Admin Dashboard│     │Member Mobile  │       │   Usher PWA   │       │
│  │ - Hero Cards  │     │ - Check-in St │       │ - Scan / Srch │       │
│  │ - Calendar    │     │ - QR Code     │       │ - Visitor Form│       │
│  │ - Tasks & Care│     │ - MoMo Giving │       │ - Offline Sync│       │
│  │ - Rings & Metr│     │ - Privacy Ctr │       │ - Live Tally  │       │
│  └───────┬───────┘     └───────┬───────┘       └───────┬───────┘       │
│          │                     │                       │               │
│          └─────────────────────┼───────────────────────┘               │
│                                ▼                                       │
│             ┌────────────────────────────────────┐                     │
│             │   Proximity & Geofence Engine      │                     │
│             │  • 300m Outer Ring Approach        │                     │
│             │  • 100m Inner Ring & Dwell Timer   │                     │
│             │  • BLE Entrance Beacon Trigger     │                     │
│             │  • Confidence Resolver (High/Med)  │                     │
│             └──────────────────┬─────────────────┘                     │
│                                ▼                                       │
│             ┌────────────────────────────────────┐                     │
│             │    Central State & Entity Store    │                     │
│             │  • Tenants, Campuses & Services    │                     │
│             │  • Persons & Households            │                     │
│             │  • Attendance Records & Signals    │                     │
│             │  • Care Tasks (Absent 2/3 weeks)   │                     │
│             │  • Donations & Audit Log           │                     │
│             └────────────────────────────────────┘                     │
└────────────────────────────────────────────────────────────────────────┘
```

### Core Entities & Data Schema Alignment
*   **Tenant & Campus**: Accra Central Church (`slug: accra-central`, Timezone: `Africa/Accra`, Inner Radius: 100 m, Outer Radius: 300 m).
*   **Persons**: Comprehensive member roster with phone numbers (`+233...`), cell groups, household links, and check-in statuses.
*   **Service Instances**: Sunday 1st Service (08:00), Sunday 2nd Service (10:30), Midweek Prayer (Wed 18:30).
*   **Attendance Signals & Records**: Client UUID idempotency, method (`geofence`, `beacon`, `usher`, `posted_qr`, `email_link`), and confidence score (75–100%).
*   **Follow-up Tasks**: Automatic absence triggers for members missing 2 consecutive services (group leader task) or 3 consecutive services (pastoral care call, e.g. Kofi Mensah).
*   **Donations**: Giving records supporting MTN MoMo, Telecel Cash, card with receipts and fund allocations.

***

## 5. Verification Plan

### Automated & Manual Checks
1.  **Build Verification**: Run `compile_applet` to ensure strict TypeScript compilation, zero broken imports, and proper Tailwind CSS v4 styling.
2.  **Admin Dashboard Visual Parity**: Verify matching layout with `1001403593.jpg` (curved purple side tab, greeting header, hero tiles, notifications, assignments, calendar, tasks, progress rings, and leaders' meeting).
3.  **Member App Flow**: Test full self-service experience: check-in status countdown, QR generation, giving via MoMo, event RSVP, and privacy toggle persistence.
4.  **Usher PWA Flow**: Test member search by name/phone, one-tap check-in, offline switch with pending sync queue and reconciliation toast, and visitor intake.
5.  **Proximity Engine Test**: Step through the outer ring, inner ring dwell, and beacon triggers; confirm that a check-in event increments the attendance rings and live counts seamlessly.
