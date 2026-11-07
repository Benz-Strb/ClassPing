# Academic Rhythm review evidence

User selected `.impeccable/mocks/decision/timetable.html` on 2026-11-07 after confirming all existing routes/screens, all roles, purple and ClassPing preserved. Code-led; no approved raster comp exists.

Contract: `apps/web/.impeccable/surfaces/apps-web-src-app-layout-tsx.md`.

Web: `web-matrix.json` records 26 routes at 360, 768 and 1440px, plus responsive-menu interactions. Files `web-<route>-<width>.png` match the route names in the matrix. `desktop.png` and `mobile.png` mirror /courses. Final captures use production preview localhost:4175; browser-only synthetic sessions/API fixtures, no backend mutation. Some routes intentionally show empty data or unavailable media; fixtures are not real university data. Editing fields and responsive navigation are exercised; OAuth and destructive/server mutations are not exercised.

Native: `phone-*-ios.png` are xcrun Simulator captures on iPhone 17 Pro iOS 26.5. A temporary standalone Metro review harness in /tmp/classping-native-review imports the shipping components with synthetic API fixtures; it is not part of the repository or shipping bundle. `phone-large-type-ios.png` tests accessibility text size. `tablet-ios.png` is required to show an actual iPad app render, not the launcher or an OS alert. Header, camera and onboarding permissions are not evidence of real facial verification or real attendance.

Detector `/tmp/classping-design-detect.json` ran once on web source; only two Geist font warnings. Geist is intentionally retained for Latin/time data alongside Kanit Thai, matching the approved cross-platform system. No detector ran on native because it scans web syntax. App intentionally uses a light theme for classroom/daytime use; OS dark appearance must retain readable forced-light UI.

Not verified: native Android rendering; real camera/face/OCR success; signed-in live backend end-to-end changes; every keyboard and font-scale combination. API authorization and business rules remain unchanged.

## Final handoff

Additional production captures `web-root-guest-*`, `web-root-student-*`, `web-callback-*` and `web-reports-*` have a separate `fix-checks.json` (12 captures). Updated reports replace the earlier matrix report files. The bounded verdict in `verdict-web-ios.md` resolves four listed material fixes; it is not whole-app certification. Android recapture in `finish-review.md` stays open: no Android SDK/JDK/emulator and less than 1 GB free disk. Final production preview uses localhost:4179. Native review harness is stopped and both simulators were restored to the actual localhost:8081 application, not fixtures.

Native rail follow-up: `rail-heights-ios.png` and `rail-heights-large-ios.png` render the shipping StudentTabBar in native 112×393pt and 112×280pt row containers. Account is auto-revealed within each scroll viewport. These are component-height tests, not screenshots of rotated 852×393 or 600×280 full app windows. Reviewer resolved that bounded issue; full orientation matrix remains unverified.

## User scope update — 2026-11-07

The user explicitly deferred Android. Current delivery is web+iOS. The original Android recapture report remains historical evidence, not a blocking requirement for this delivery; no Android verification is claimed. Application platform support and API/authorization behavior were not removed or changed.
