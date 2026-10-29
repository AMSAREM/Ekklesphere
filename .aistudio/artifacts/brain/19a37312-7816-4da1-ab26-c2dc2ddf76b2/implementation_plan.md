# Ekklesphere: Dashboard Vertically Centered Curved Sidebar Layout

Position the sidebar navigation with its signature curved bracket decorations smoothly integrated into the left side of the primary dashboard card, aligned vertically at the exact center of the card height.

***

## User Review & Critical Decisions

> [!IMPORTANT]
> The architectural and placement choices below reflect the answers confirmed in Phase 1:

*   **Confirmed Placement**: Left side of the card with smooth radial-gradient curved brackets connecting the purple tab into the soft card boundary.
*   **Confirmed Vertical Alignment**: Vertically centered along the card height (`top: 50%`, `transform: translateY(-50%)`), matching the reference mockup visual balance.
*   **Mobile / Tablet Responsiveness**: Retains the floating bottom dock navigation on mobile and tablet screens (< 1024px), transitioning smoothly to the vertically centered curved sidebar on desktop (≥ 1024px).

***

## 1. Overview & Core Concept

### What It Does
Restores and refines the signature visual element of the Ekklesphere Admin Dashboard: a curved purple navigation tab that flows seamlessly into the white/slate card border, centered vertically along the side. The tab provides quick access to Dashboard, Members Roster, Live Attendance, Notifications, Services Schedule, Broadcast Messages, Follow-up Queue, Staff Chat, and Settings.

### Target Persona
*   **Church Administrators & Executive Pastors**: Experience an elegant, bespoke dashboard interface that reflects high visual polish without layout bleeding, text collisions, or awkward offsets.

### Key Value Delivered
*   **Aesthetic Balance**: Perfect vertical centering along the card height provides balanced optical weight and generous breathing room.
*   **Zero Text Overlap**: Restores proper left padding (`lg:pl-24`) to ensure dashboard headings, search bar, and hero cards remain crisp, legible, and uninhibited.

***

## 2. User Experience & Visual Design

### Visual Identity & Theme
*   **Signature Element**: The purple sidebar tab (`#6D5CF2` in light mode, `#8C7DFF` in dark mode) features smooth curved transition brackets (`::before` and `::after` radial gradients of 26px radius) that create a fluid, carved cutout aesthetic connecting the tab to the card.
*   **Vertical Center Mathematics**:
    *   Desktop (`lg:`): `position: absolute; left: 0; top: 50%; transform: translateY(-50%); width: 60px; border-radius: 0 32px 32px 0;`
    *   Curved Connectors: Top bracket `top: -26px; background: radial-gradient(circle at 100% 0, transparent 26px, var(--brand) 26.5px)` and bottom bracket `bottom: -26px; background: radial-gradient(circle at 100% 100%, transparent 26px, var(--brand) 26.5px)`.
*   **Card Container Math**:
    *   Outer Card: `relative max-w-[1360px] mx-auto rounded-[36px] bg-[#F6F7FC] dark:bg-[#14142E] shadow-[0_20px_60px_rgba(60,50,140,0.12)] border border-[#E9EBF5] dark:border-[#2D2D55]`.
    *   Internal Padding: `p-4 sm:p-7 lg:py-8 lg:pr-10 lg:pl-24` ensuring 96px clearance for the curved sidebar tab.

### Layout Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [Ekklesphere Portal Bar: • Admin Dashboard | • Member App | • Usher | 🛰️]  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Dashboard Card                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │  Top Bar: [Tabs]                     [Search...]      [Dark] [CSV] [+]  │ │
│ │                                                                         │ │
│ │  Hi, James! • •                                                         │ │
│(╭╮)What are your plans for today?   [+] [Organized] [Notes] [Collaborate] │ │
│ │││                                                                       │ │
│ │⊞│  [Notifications]       [Assignments]         [May 2026 Calendar]      │ │
│ │👤│                                                                       │ │
│ │🥧│  [Today's tasks]       [Go Premium /         [Attendance 79%]         │ │
│ │🔔│                        Auto Check-in]                                │ │
│ │📅│                                             [Leaders' Meeting]       │ │
│ │✉️│                                                                       │ │
│ │📋│                                                                       │ │
│ │💬│                                                                       │ │
│ │⚙️│                                                                       │ │
│(╰╯)                                                                       │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

***

## 3. Key Technical Decisions & Trade-Offs

*   **Decision 1: CSS Pseudo-Elements vs. Inline SVG for Curved Connectors**
    *   *Chosen Approach*: CSS radial-gradient pseudo-elements (`.side-curved-tab::before` and `::after`) tied directly to `--brand` variable.
    *   *Why*: Automatically adapts between light mode (`#6D5CF2`) and dark mode (`#8C7DFF`), zero DOM overhead, and crisp pixel alignment at any zoom level.
*   **Decision 2: Vertical Centering via Flex vs. Absolute Coordinates**
    *   *Chosen Approach*: `absolute left-0 top-1/2 -translate-y-1/2` anchored to the relative dashboard card.
    *   *Why*: Guarantees true vertical centering regardless of content height changes (e.g. expanding tasks, active modals, search results).

***

## 4. Technical Implementation Steps

1.  **CSS Tokens in `src/index.css`**:
    *   Add responsive `.side-curved-tab` styling with `::before` and `::after` radial gradients matching `var(--brand)` in light and dark mode.
2.  **Dashboard Card Markup in `src/components/admin/AdminDashboard.tsx`**:
    *   Set the parent card container to `relative max-w-[1360px] mx-auto my-4 sm:my-6 bg-[#F6F7FC] dark:bg-[#14142E] rounded-[28px] sm:rounded-[36px] p-4 sm:p-7 lg:py-8 lg:pr-10 lg:pl-24`.
    *   Position `<nav>` with `fixed bottom-4 left-1/2 -translate-x-1/2 z-50 ... lg:translate-x-0 lg:bottom-auto lg:absolute lg:left-0 lg:top-1/2 lg:-translate-y-1/2 lg:w-[60px] lg:rounded-r-[32px] lg:rounded-l-none lg:side-curved-tab`.
3.  **Verification**:
    *   Run `lint_applet` and `compile_applet` to confirm 0 compilation or styling errors.
