# Screen and capability coverage

ข้อเท็จจริง = route/screen/service ที่พบ. ชื่อ frame คือข้อเสนอรูปแบบใหม่ ไม่ใช่ชื่อ route ใหม่ที่สร้างแล้ว. ต้นแบบล่าสุดมี 93 หน้าจอ/สถานะ (เว็บ 57, mobile/responsive 36) รวมแผนงาน P01–P32 จำนวน 32 หน้า ดู [รายละเอียดแผนงาน](PLANNED-FEATURES.md); prototype มี 8 จุดเริ่มต้นและ 586 connected nodes ไม่มีปลายทางขาดจากรายงานปลั๊กอิน. บันทึกใน Figma Desktop แล้ว แต่ยังรอ cloud sync. ยังไม่ได้ตรวจภาพใหม่ครบทุกหน้า. มีหน้าจออ้างอิง และแผ่น foundations/product map.

| Implementation | Proposed Figma frames | Capability retained |
|---|---|---|
| `/`, `/login`, `/auth/callback` | W01, S01, W04/W05 | Google OAuth, domain, loading/error, student mobile handoff; callback เป็น transition ไม่จำเป็นต้องมีหน้ากรอกข้อมูล |
| `/courses` | T01/T02, W02/W03/W04 | list/create, code/name/section, empty/loading/error |
| course `/checkin` | T03 | previous day, next day back toward today, class/exam, upcoming/live/ended |
| course `/checkin/[sessionId]` | T04–T09, R01 | counts, evidence, names/code, first seen, updatedBy, face-not-enrolled, manual present/late/absent |
| `review-card` | T05–T08 | confirm/reassign/reject; reassign only unseen; reject confirmation; unknown evidence retention |
| course `/students` | T10 | multiple codes, added/duplicate/invalid result, ready/not-enrolled/not-logged-in, remove |
| course `/schedule` | T11/T12 | recurring schedule, date override, room/time, cancel/undo, locked begun sessions |
| course `/exams` | T13–T15, W08 | add/edit/delete, per-exam rules/proctors, replace-class confirmation, locked exam proctors-only |
| course `/rules` | T16 | late, absent-at-end nullable, absent cutoff, outOfRoomLimitMin; no invented doorway statistics |
| course `/reports` | T17 | kind/session/date/student filters + reset, counts/rate, student/session summaries, CSV/PDF |
| `/leave/review` | T18/T19 | student/session/reason/evidence/OCR, review note, approve/reject, terminal outcome |
| `/leave` | W07 | student web alternative; one evidence PDF/JPG/PNG ≤10 MB; history and decision |
| `/live` | T20 | date-scoped sessions, camera open/closed/missing, live/recording navigation |
| `/live/[sessionId]` | T21 | connecting/reconnecting/stopped, people list, box toggle, match/review/unknown semantics |
| recording route | T22, W06 | segment playback/download permissions, no audio, retention, no-recording state |
| `/me` | T23 / S15 / W05 | role/profile/student code, sign out, role-specific destinations |
| `/admin` | A01 | actual available user/course/room counts (synthetic values in mockup) |
| `/admin/users` | A02/A03, W09 | roles, reset face, confirmation, disabled reset, last-admin error |
| `/admin/rooms` | A04 | list/create name; no room edit/delete invented |
| mobile ConsentScreen | S02/S03 | privacy purpose, access, retention, withdrawal, reject path, separate CCTV notice |
| mobile IdentityScreen | S04/E01 | online card of today, full card/date/code guidance, replace/error |
| mobile EnrollScreen | S05–S10/E02/E03 | native permission/settings, 5 automatic poses, progress, retry/resume, change card |
| mobile MeScreen + AttendanceSummarySection | S11/S15/E05/E06 | fullName/email/role/studentId, enrollment complete, aggregate/per-course counts/rate, error retry, no courses |
| mobile LeaveScreen | S12–S14/E04/E07/E08 | eligible session, reason, image evidence, submitting, pending/approved/rejected history, review note, OCR failure, validation |

## Required behavior represented by component states

Button default/hover/focus/disabled/loading; field label/value/focus/error/disabled; status vocabulary; notice success/warning/error/info; image available/missing/expired. Remaining API error messages use these states and must preserve payload fields and recovery actions.

## API-only and incomplete work

- `PATCH /courses/:id` exists but existing web has no course-edit form. Reuse T02 fields if this frontend capability is added; do not claim it already ships.
- `/admin/cameras` and camera token issuance exist in API but not web. A04 documents the gap; no token/credential mock data is created.
- `outOfRoomLimitMin` exists; no doorway event/timeline data in current AttendanceRow. Setting is preserved without fabricated reports.
- README Classroom/chatbot/transfer plans are intentionally excluded from implemented-feature screens.

## Prototype versus product

Figma click links demonstrate navigation and outcomes. Google sign-in, camera preview, uploads, automatic pose progression, playback/download and form submission are not real integrations inside Figma. Pose-preview hotspots simulate automatic transitions for review only. Backend remains the authority for all actual decisions.

## Mobile source update — 2026-11-03

| Source ปัจจุบัน | ความสามารถที่เพิ่ม/ปรับ |
|---|---|
| `StudentNavigator` | 5 หมวด, safe area, Android Back, rail จอกว้าง, คงร่างใบลา/แชทระหว่างสลับแท็บ |
| `LoginScreen` | ลดข้อความ คง Google OAuth @dpu.ac.th และเพิ่มทางเข้า DPU Chat |
| `ChatScreen` | DPU Chat, คำถาม/คำตอบแยกส่วน, แหล่งอ้างอิง, composer, loading/error; backend ยัง mock |
| `CoursesScreen`, `GET /me/studies` | ค้นหาวิชา/กลุ่ม รายละเอียด ตาราง 7 วัน คาบเรียน/สอบ เวลาไทย ห้อง และเปิดผลเข้าเรียน; จำกัดตาม enrollment |

ตารางนี้อ้างอิงโค้ดใน working tree ไม่ยืนยันว่า Figma frames เดิมตรงกับหน้าจอใหม่. TypeScript/API build/tests 36 ข้อ/Expo export ผ่าน ยังไม่ได้ตรวจภาพใหม่บนมือถือจริง

## Web source follow-up — 2026-11-03

- `MainNavigation` ใช้บทบาทจาก `/me` และ session เพื่อแสดงเมนูเฉพาะงานนักศึกษา/อาจารย์/แอดมิน; ไม่เปลี่ยนกฎสิทธิ์ backend
- ช่องว่าง catalog/RAG ใน P09–P10 เชื่อมในโค้ดแล้ว: แอดมินบันทึกเนื้อหาและดัชนีใน transaction เดียว ปิดใช้งานถอน source/chunks; รายการเก่าต้องแก้ไข/บันทึกเพื่อนำเข้า และ UI แสดงสถานะรอนำเข้า/พร้อมใช้/ปิดใช้งาน
- แหล่งที่เปิดใช้เป็นสาธารณะสำหรับ DPU Chat บนมือถือ; mock provider เดิม ไม่เพิ่มหน้าแชทบนเว็บหรืออ้างว่าเชื่อม LLM จริงแล้ว
- รัน migration `20261103100000_catalog_chat_knowledge.sql` บนฐานร่วมสำเร็จแล้ว ไม่มี seed/ข้อมูลตัวอย่าง; ตรวจ rollback และสิทธิ์ service role บนฐานจำลองก่อนรันจริง
- API/web build และ tests ผ่าน; Figma ยังไม่ได้อัปเดตตาม source รอบนี้ และยังไม่ตรวจ browser/ฐานจริงครบวงจร
