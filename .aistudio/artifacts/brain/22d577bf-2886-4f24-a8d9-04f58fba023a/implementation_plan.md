# Admin Bottom Horizontal Navigation Bar

A modern, bottom-docked horizontal module navigation bar for the Ekklesphere Admin Dashboard, adhering to human-centered SaaS design principles and delivering quick access to the full church management suite.

## User Review & Critical Decisions

> [!IMPORTANT]
> Based on your responses, the previous curved side tab has been reimagined as a bottom horizontal navigation bar with soft neutral styling, indigo active indicators, and the complete church management suite.

- **Confirmed Layout & Placement**: Docked bottom horizontal navigation bar with accessible module tabs positioned seamlessly at the base of the admin workspace.
- **Confirmed Module Scope**: Complete church operations suite featuring **Dashboard**, **Attendance**, **Members**, **Schedule & Services**, **Care Follow-up**, and **Broadcast Comms**.
- **Confirmed Visual Styling**: Soft neutral background with clean hairline borders, crisp typography, and subtle indigo active indicators.

---

## 1. Overview & Core Concept

### What It Does
Provides administrators, pastors, and church managers with a balanced, accessible navigation bar anchored along the bottom of the Admin Dashboard. Rather than encroaching on horizontal layout width or relying on decorative floating side tabs, it offers a predictable, thumb- and mouse-accessible module switcher.

### Target Audience & Persona
- **Senior Pastors & Executive Administrators**: Reviewing live service attendance, financial stewardship, and strategic ministry operations.
- **Pastoral Care Leads**: Transitioning rapidly into absentee follow-up tasks and care call notes.
- **Church Operations Staff**: Scheduling services, coordinating volunteer teams, and sending emergency or service reminders via SMS/Push.

### Key Value
- **Uncluttered Canvas**: Allows the central administrative dashboard cards (timeline, assignments, attendance rings) to breathe with 100% horizontal symmetry.
- **Immediate Context Switching**: Enables 1-click jumps between high-level KPIs, attendance rosters, member records, and pastoral care workflows.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Navigating Core Modules**: Clicking any tab in the bottom bar instantly switches the primary dashboard view (e.g. from the default high-level Dashboard to Member Roster or Attendance Analytics).
2. **Triggering Workflows**: Clicking "Schedule & Services", "Care Follow-up", or "Broadcast Comms" directly opens the corresponding modal or filtered worklist without digging through nested sub-menus.
3. **Active State Clarity**: The selected module is indicated with a soft lilac/indigo background pill (`bg-[#EFEDFF] text-[#6D5CF2] dark:bg-indigo-950/70 dark:text-[#8C7DFF]`) with an active icon and single-line label.
4. **Responsive Adaptability**: On desktop, tabs display both clean SVG icons and concise labels; on compact viewports, tabs scale smoothly with accessible touch targets ($\ge 44\text{px}$) and tooltips.

### Visual Identity & Theme
- **Aesthetic Direction**: Functional enterprise SaaS dashboard with calm, respectful church management aesthetics.
- **Palette**:
  - Background: Neutral surface (`#FFFFFF` in light mode, `#1A1A3A` in dark mode) with a 1px hairline border (`border-t border-[#E9EBF5] dark:border-[#2D2D55]`).
  - Active Indicator: `#6D5CF2` primary indigo text with `#EFEDFF` tint background (`dark:bg-indigo-950/70 dark:text-[#8C7DFF]`).
  - Inactive Tabs: Subtle slate (`text-[#666A86] dark:text-[#A9ACC8]`), transitioning to `#1D1B3A` / `#FFFFFF` on hover.
  - Live Tally Badges: Tabular figures for unread alerts and open follow-up tasks.
- **Typography**:
  - Font: `Plus Jakarta Sans` with single-line labels (`whitespace-nowrap shrink-0`).
  - Numbers: Tabular numerals (`font-mono tabular-nums`) for task counts and service attendance tallies.
- **Anti-Slop Restraint**:
  - Zero decorative pulsing dots or artificial telemetry tickers.
  - Clean unboxed labels without pill-sandwiches.
  - Zero-latency transitions with smooth 150ms hover feedback.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Bottom Horizontal Bar vs. Left Sidebar
- **Chosen Approach**: Bottom horizontal docked bar spanning the dashboard card or container.
- **Why**: Keeps the admin card completely symmetrical and wide, eliminating awkward side-tab offsets (`lg:pl-28`) while ensuring all 6 church management tools remain visible without horizontal scroll.
- **Alternatives Considered**: Full left sidebar (takes up 240px of valuable horizontal data room) or floating side-curved tab (which felt visually intrusive and was previously removed).

### Decision 2: Module Action Integration
- **Chosen Approach**: Hybrid navigation where core views switch dashboard tab state (`dashboard`, `workflows`, `attendance`), while specialized workflows (`Broadcast Messages`, `Services`, `Care Follow-up`) directly trigger their focused management modals.
- **Why**: Eliminates empty sub-pages and lets users accomplish their tasks with zero redundant navigation clicks.

---

## 4. Technical Architecture & Data Strategy

### Component Layout Hierarchy
```
┌────────────────────────────────────────────────────────────────────────┐
│ PortalHeader (Top Bar: Brand, Campus, Service Tally, User Profile)    │
├────────────────────────────────────────────────────────────────────────┤
│ AdminDashboard Viewport                                                │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Greeting & Context Header (Hi James! · Search & Quick Actions)   │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ Active Content Area (Cards Grid: Attendance, Calendar, Tasks)    │  │
│  │                                                                  │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ AdminBottomNav (Docked Horizontal Module Bar)                     │  │
│  │  [ Dashboard ] [ Attendance ] [ Members ] [ Schedule ] [ Care ]  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Module Tab Definitions
| Tab ID | Label | Icon | Action / View |
|---|---|---|---|
| `dashboard` | Dashboard | `Grid` | Switches to Executive Overview |
| `attendance` | Attendance | `PieChart` | Displays Live Service Tally & Records |
| `members` | Members | `Users` | Opens Member Directory & Cell Groups |
| `services` | Services | `Calendar` | Opens Service Definition & Schedule Modal |
| `followup` | Care Follow-up | `CheckSquare` | Opens Pastoral Care Absences & Tasks |
| `messages` | Broadcast | `Mail` | Opens SMS / Push / Email Broadcast Composer |

### State & Event Mapping
- `activeModule`: Tracks the currently selected bottom navigation tab.
- Connected to `EkklesphereContext` for live task badges (e.g. `followupTasks.filter(t => t.status === 'open').length`).
- Modals (`setIsAddServiceOpen`, `setIsMessageModalOpen`, `setIsFollowupModalOpen`) triggered cleanly upon tab interaction.
