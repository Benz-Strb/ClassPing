---
name: ClassPing
description: Academic Rhythm for existing web and mobile academic workspaces.
colors:
  action: "#7652C5"
  action-hover: "#5D3C9E"
  identity: "#4D3282"
  background: "#FAF8F4"
  surface: "#FFFFFF"
  ink: "#282330"
  muted: "#6D6477"
  border: "#E6DFEB"
  selected: "#EEE8F7"
  danger: "#AE2929"
  danger-bg: "#FFF0EE"
  warning: "#765000"
  warning-bg: "#FFF3D5"
  info: "#5B21B6"
  info-bg: "#F1ECF8"
typography:
  headline:
    fontFamily: "Geist, Kanit, system-ui, sans-serif"
    fontSize: "clamp(26px, 2.3vw, 32px)"
    fontWeight: 600
    lineHeight: 1.45
  title:
    fontFamily: "Geist, Kanit, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "Geist, Kanit, system-ui, sans-serif"
    fontSize: "15px"
    lineHeight: 1.6
rounded:
  control: "10px"
  card: "12px"
  surface: "16px"
  chip: "6px"
spacing:
  small: "8px"
  control: "12px"
  row: "16px"
  compact-surface: "20px"
  surface: "24px"
  workspace-gap: "28px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-disabled:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted}"
  work-surface:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
    padding: "24px"
---

# Design System: ClassPing

## Overview

**Creative North Star: "Academic Rhythm"**

Academic Rhythm puts time, course identity and the next legitimate action in a consistent reading order. Warm ground, white work surfaces and purple identity support calm, practical Thai and Latin reading. Ruled rows provide the recurring structure; decoration stays subordinate to academic records.

ClassPing and purple are retained identity commitments. This is the implemented code-led world; the decision sketch is directional rather than a pixel specification.

**Key Characteristics:**
- Fixed time/code columns beside flexible details.
- Warm light ground and restrained purple emphasis.
- Explicit attendance and recovery states.

## Colors

### Primary
Action purple marks primary actions and the current web destination; identity purple anchors brand and section headings. Selected lavender supports quieter emphasis. Hover purple is also the selected foreground.

### Neutral
Warm background surrounds white work surfaces. Ink carries records, muted carries supporting copy, and pale borders divide rows. Web declares `color-scheme: light`; native config also forces light. Dark OS readability is evidenced, not an adaptive dark theme.

### Semantic states
Danger marks errors/absence; warning marks lateness and warnings; informational lavender supports guidance. Present uses action purple, leave uses ink, and pending uses muted. Preserve labels alongside color and distinguish upcoming/ended sessions from live state.

**The State Truth Rule.** Pending and unavailable records never imply confirmed absence or attendance.

## Typography

Web uses `Geist, Kanit, system-ui, sans-serif`: Latin and numerals use Geist, Thai falls back to Kanit. Native shared Text selects Kanit for Thai strings and Geist for Latin-only strings, using bundled regular/medium/semibold/bold faces. Local font assets retain their bundled licenses.

Web page titles use the frontmatter headline ramp; sections use title, and the workspace body is 15px with inherited 1.6 leading. Native titles are 27/38 at weight 500; sections 20 at weight 500; body 16 with computed 1.5 leading, supporting copy usually 14/22. Navigation labels are 11/16. Tables and web times use tabular numerals.

Native text retains OS scaling. Home/account titles and navigation use bounded multipliers (1.8 and 1.3; brand 1.2); decorative initials disable scaling. Above fontScale 1.6, home times become a full-width row and statistics gain 96pt minimum width. Keep these local exceptions explicit; do not disable scaling globally.

## Layout

Web: a 232px rail starts at 64rem; below it, navigation becomes a sticky expandable header. Main content is capped at 1320px, with clamp(24px, 3.4vw, 48px) padding. The optional tools column is 320px with a 28px gap; below 74.99rem it moves beneath the main area. Below 39.99rem, content uses 20px side gutters, tools and directories become one column, and tables retain a horizontally scrollable 36rem minimum width. Account content caps at 800px, login at 30rem, welcome at 560px.

Native shared scroll content caps at 1040pt, with gutters 16pt below 360, 24pt below 768, otherwise 32pt. Theme also defines form 560 and desktop 1024; these are constants, not promises that every screen uses them. Student navigation becomes a 112pt rail at width 768, or landscape width at least 600; home panels then sit side by side. Account caps at 800pt. Flexible rows wrap instead of clipping.

Safe-area ownership: App owns top/left/right. StudentNavigator owns the bottom inset in its navigation (`max(8, bottom)`), or main content in wide mode. Login and public chat use bottom SafeAreaView wrappers. New child screens must preserve this single-owner relationship.

The signature row uses a fixed time/code column beside flexible content: web agenda 68px (56px on phone), native home 64pt; state moves below details on narrow web screens. Standard targets are at least 48px/pt; native account avatar explicitly uses 44pt.

## Elevation & Depth

White surfaces, warm ground and thin rules create depth without a global shadow token. Existing report cards/fields still use legacy Tailwind shadow-sm; this is retained drift, not the preferred recipe for new work. Dialog backdrop uses #28233066. Web color transitions are 150ms ease only when reduced motion is not requested; enabled buttons move down 1px on press. Native enabled Pressable uses 0.72 pressed opacity.

## Shapes

Work surfaces use 16px/pt corners; smaller cards use 12. Web workspace buttons/fields use 10px; native shared inputs use 12pt. State chips use 6px, brand marks 8–9, and avatars are circular. Prefer ruled internal rows over nested cards.

## Components

- **Buttons:** purple/white primary, lavender/purple secondary, bordered white neutral. Shared native Pressable owns minimum target, pressed and disabled behavior. Disabled controls remain opaque on warm ground with muted text and an outline. Native disabled foreground flows through context to nested shared Text, and immediate ActivityIndicator inherits muted; web nested spans inherit button foreground.
- **Inputs:** visible labels, white background, readable muted placeholders and purple selection/caret. Web fields receive the workspace outline; shared native inputs have 12pt horizontal padding. Preserve actual per-screen border styling.
- **Focus:** web focus-visible is a 2px action outline with 3px offset; skip link appears on focus. Preserve semantic links, labels, current-page attributes and native selected/expanded states. Keyboard and VoiceOver coverage are not established by still captures.
- **Navigation:** web current destination is solid action purple/white; secondary tabs use a purple bottom rule. Native five-section navigation uses drawn SVG icons, purple selected foreground and top rule, with inactive scenes hidden from accessibility. `StudentTabBar` keeps compact bottom navigation fixed; its wide rail alone uses a native vertical ScrollView without shared content gutters, revealing the selected destination on tab, layout and content-size changes. Short-height and enlarged-text component captures do not establish full OS-orientation coverage.
- **Cards and lists:** white surfaces with pale borders, 20–24px padding and thin internal separators. Course rows prioritize code, description and a trailing action. Native home panels use 20pt padding.
- **Feedback:** loading, empty, forbidden, failed and disabled are distinct states. Web alert surfaces use danger tones; status copy uses muted. Keep permission recovery routed to account and transient failures retryable where implemented.

Sources of truth: `apps/web/src/app/globals.css` owns base tokens, Tailwind role aliases, fonts, focus and disabled state; `academic.css` owns the final workspace overrides. Native `src/ui/theme.ts` owns palette/layout constants and `primitives.tsx` owns shared text, controls and scrolling. `StudentTabBar.tsx` owns tab definitions, navigation styling and wide-rail scroll/reveal behavior; `StudentNavigator` owns scene composition and safe-area handoff. `HomeStudies`, `AttendanceSummarySection` and `AccountScreen` own their composition and local scaling. Preserve API authorization and existing behavior when extending screens.

Evidence boundary: `.impeccable/review/verdict-web-ios.md` ships only the four scored fixes (export labels, disabled Send, attachment documentation and late entry/callback/staff captures). Representative desktop, phone, tablet, large-text and chat captures support this documentation. The user deferred Android on 2026-11-07; this delivery covers web and iOS. Earlier Android recapture findings in `finish-review.md` remain historical evidence, not a blocker for this delivery. Android visual verification, live OAuth/backend, physical devices and full accessibility/orientation coverage are unproven. No new raster assets ship; icons are authored SVG.

## Do's and Don'ts

### Do:
- **Do** reuse shared tokens and primitives for future screens.
- **Do** preserve visible labels, actionable recovery copy and distinct pending states.
- **Do** let long Thai text, names and course details wrap.

### Don't:
- **Don't** equate pending or unavailable attendance with absence.
- **Don't** use color alone to communicate status.
- **Don't** introduce a dark palette without a separate implementation and review.
