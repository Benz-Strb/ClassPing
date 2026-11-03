# Planned feature design coverage

Scope authorized by user on 2026-11-03: include unfinished features as editable designs. Current source revision: `1d5ea82`. Visual authority: `/Users/a1/Film/project classping/DESIGN.md`.

`work.md` reports some features complete in another working context, but this checkout does not contain their screens/modules/migrations. Treat them as documented requirements until source and runtime are reconciled. No claim that these UI designs are deployed or connected.

| Frames | Feature | Evidence / rules preserved |
|---|---|---|
| P01–P03 | Admin camera/token | API list and issuance exist; room-specific confirmation, rotation invalidates previous token, one-time display, no real token in design |
| P04 | Admin courses/teacher assignment | Course APIs exist; document describes frontend; teacher-only assignment, reuse students/schedule and session locks |
| P05–P07 | Curriculum / CSV import | work.md: UTF-8, ≤200 KB / ≤500 rows, whole-file validation and atomic import, duplicate codes reject batch |
| P08 | Reference catalog | work.md: add/edit/import central information |
| P09–P10 | Knowledge catalog / RAG | work.md: source text and URL, active status; catalog and RAG ingestion are distinct; public/login/course access; no claim of configured semantic embedding provider |
| P11–P12 | Classroom connect/sync | README + work.md: OAuth/IT approval, courses/roster deduplication, read-only access; no schedule data from Classroom |
| P13, P32 | Doorway history | README + work.md: cumulative time, missing return needs review; no current event API found, data is synthetic |
| P14–P16 | Admin credit transfer | work.md: institution + previous course code + minimum credits → target course; transcript/curriculum PDF/JPG/PNG ≤10 MB; manual per-course decisions; no automatic enrollment |
| P17–P18 | Learning assistant / public chat | README + work.md: evidence-backed answers, no evidence fallback, public sources only for Open House; authenticated access follows enrollment |
| P19–P20, P24–P25 | OCR draft before leave submission | work.md: reading a draft does not submit a request; never overwrite existing reason silently; user edits; manual submission still possible on OCR failure |
| P21–P23 | Student courses/timetable/attendance details | documented mobile details with date/kind filters, room/time/status/photo and expiring signed URL; pending remains unconfirmed |
| P26–P29 | Student chat/Classroom/assignments | read-only tasks/deadlines, permission/connection/no-evidence states; no invented institutional answer or deadline |
| P30–P31 | Responsive student transfer web | work.md specifies `/transfers`; portrait design is mobile web, not a claim of a native transfer module; partial approval/rejection with reasons |

The 32 planned frames live alongside existing-role designs within the three-page Starter limit. Frame names and canvas annotations mark planned work. Main app/backend files and shared data are unchanged.

Known visual-reference adjustments: use readable secondary text `#5E6168` instead of low-contrast gray body values; use Noto Sans Thai as the editable Figma representation of a system sans with Thai support. Keep red/amber only for semantic states.

## Delivery status — 2026-11-03

[Editable Copy](https://www.figma.com/design/kaMgswYGB5XiMnEMZaFRO6): 93 หน้าจอ รวมแผนงาน 32 หน้า, prototype 8 flow. บันทึกใน Desktop แต่ยังรอ cloud sync. ตรวจภาพล่าสุดยังไม่ครบทุกหน้า. ฐานข้อเท็จจริงคือ checkout `1d5ea82`; ดีไซน์แผนงานไม่ใช่หลักฐานว่าโค้ดพัฒนาเสร็จ.

## Mobile implementation follow-up — 2026-11-03

สถานะล่าสุดใน working tree มีการพัฒนาต่อจาก checkout ที่ใช้ทำแผนงานด้านบน:

- P21–P23: มี `CoursesScreen` แล้ว ค้นหารายวิชา/กลุ่ม ดูคาบเรียนและสอบ 7 วัน เวลา/ห้อง และเปิดรายละเอียดผลเข้าเรียนพร้อม filters/ภาพจากหน้ารายงานเดิม ผ่าน `GET /me/studies` และ API reports ตามสิทธิ์นักศึกษา
- P19–P20/P24–P25: โค้ดมือถือปัจจุบันมี OCR preview ก่อนส่งและให้นักศึกษาแก้เหตุผลเอง ไม่ส่งคำขอระหว่างอ่านร่าง
- P26–P29: ปรับชื่อและหน้าแชทเป็น DPU Chat แล้ว แต่ LLM, Classroom และงาน/กำหนดส่งยังไม่เชื่อม
- Navigation 5 หมวดและหน้าล็อกอินปรับในโค้ดแล้ว; การเปลี่ยนแปลงเหล่านี้ยังไม่ได้อัปเดต/ตรวจเทียบใน Figma
- TypeScript, API build, tests 36 ข้อ และ export ทุกแพลตฟอร์มผ่าน ยังไม่ได้ตรวจหน้าจอใหม่บนมือถือจริงหรือยืนยัน deployment

## Web source follow-up — 2026-11-03

- `MainNavigation` ใช้บทบาทจาก `/me` และ session เพื่อแสดงเมนูเฉพาะงานนักศึกษา/อาจารย์/แอดมิน; ไม่เปลี่ยนกฎสิทธิ์ backend
- ช่องว่าง catalog/RAG ใน P09–P10 เชื่อมในโค้ดแล้ว: แอดมินบันทึกเนื้อหาและดัชนีใน transaction เดียว ปิดใช้งานถอน source/chunks; รายการเก่าต้องแก้ไข/บันทึกเพื่อนำเข้า และ UI แสดงสถานะรอนำเข้า/พร้อมใช้/ปิดใช้งาน
- แหล่งที่เปิดใช้เป็นสาธารณะสำหรับ DPU Chat บนมือถือ; mock provider เดิม ไม่เพิ่มหน้าแชทบนเว็บหรืออ้างว่าเชื่อม LLM จริงแล้ว
- รัน migration `20261103100000_catalog_chat_knowledge.sql` บนฐานร่วมสำเร็จแล้ว ไม่มี seed/ข้อมูลตัวอย่าง; ตรวจ rollback และสิทธิ์ service role บนฐานจำลองก่อนรันจริง
- API/web build และ tests ผ่าน; Figma ยังไม่ได้อัปเดตตาม source รอบนี้ และยังไม่ตรวจ browser/ฐานจริงครบวงจร
