# ClassPing · implementation audit

## Mobile implementation follow-up — 2026-11-03

- แก้ประเด็น profile รวมหลายงานด้วย navigation 5 หมวด แยกสถิติรวม รายวิชา การลา แชท และบัญชี; เก็บร่างเมื่อสลับแท็บ
- ลดข้อความ Login และปรับ DPU Chat ให้สอดคล้องกับโทนขาว–ดำ; แชทมี sources/loading/error แต่ยังเป็น mock provider
- เพิ่มรายวิชา ค้นหา รายละเอียด และตารางคาบจริง 7 วัน พร้อม endpoint `GET /me/studies` ที่จำกัดข้อมูลตามบัญชีนักศึกษา
- โค้ดมือถือปัจจุบันมี OCR preview ก่อนส่งใบลาแล้ว; ข้อค้นพบเรื่อง OCR ด้านล่างเป็นสถานะรอบสำรวจเก่า
- ผลตรวจ: mobile TypeScript, API build, lint ไฟล์ API ใหม่, tests 36 ข้อ และ export iOS/Android/Web ผ่าน; lint ทั้ง API มี warning เดิม 3 จุด
- ผู้ใช้แจ้งว่า flow หลักเดิมผ่านบนมือถือ ก่อนปรับหน้าจอรอบนี้; ยังไม่มีหลักฐานตรวจภาพ/การใช้งานหน้าจอใหม่บนเครื่องจริงหรือทดสอบ endpoint กับฐานข้อมูลจริงครบวงจร และยังไม่ได้แก้ Figma ตามหน้าจอใหม่


สำรวจ 2 พฤศจิกายน 2569. Source code เป็นหลักฐานหลัก; README ในโฟลเดอร์แม่มีข้อความเก่าว่าไม่มีฟีเจอร์ ซึ่งขัดกับ routes/services ปัจจุบัน.

## Facts

| พื้นที่ | หลักฐาน | ความสามารถที่พบ |
|---|---|---|
| Auth/roles | `apps/api/src/auth`, web `/login`, mobile `LoginScreen` | Google OAuth @dpu.ac.th, student/teacher/admin; แอดมินอาจมี studentId ด้วย |
| Identity | mobile `MeScreen`, `ConsentScreen`, `IdentityScreen`, `EnrollScreen`; API enrollment | consent gate, บัตรของวันนี้, สแกน front/left/right/up/down อัตโนมัติ, resume/retry |
| Courses | web `/courses`, `courses/[id]/*`; API courses/roster | สร้างและ API แก้วิชา; เพิ่มรหัสหลายคน/ลบออก; แยก duplicate/invalid; รูปลงทะเบียนและความพร้อม |
| Schedule | `schedule-view`, API schedules/sessions | ตารางประจำ, override วัน/ห้อง/เวลา, งดสอน/คืนค่า, คาบ class/exam |
| Exams | `exams-view`, API exams | ผู้คุมหลายคน, เกณฑ์เฉพาะ, lock เมื่อกล้องเปิด, confirm แทนคาบเรียน |
| Attendance | `checkin-sessions`, `checkin-view`, `review-card`, API attendance | polling 5 วินาที, evidence, counts, manual edits, confirm/reassign/reject, unknown images 7 วัน |
| Rules | `rules-view`, `attendance/decide.ts` | lateAfterMin, absentAfterMin nullable, outOfRoomLimitMin; ยังไม่มี doorway timeline ใน UI/types |
| Leave | web `/leave`, `/leave/review`; mobile LeaveScreen; API leave | คาบที่มีสิทธิ์, reason, หลักฐาน, OCR, pending/approved/rejected, reviewNote, duplicate protection |
| Reports | web reports page; mobile AttendanceSummarySection; API reports | filters, รายบุคคล/รายคาบ, counts/rate, CSV/PDF, student summary |
| Video | `live-sessions`, `live-viewer`, `recording-view`; API media/video-access | ตามวันที่, WHEP, reconnect, face boxes, HLS segments, retention, download permission |
| Admin | web `/admin/*`; API admin; safety migration | counts, users/role, reset face, list/create room; API camera list/token ไม่มีหน้าเว็บรองรับ |

## UX findings and proposals

| พบจากโค้ด | ผลต่อผู้ใช้ | ข้อเสนอ (ต้องแก้โค้ด) |
|---|---|---|
| global nav แสดงทุกบทบาท | นักศึกษาเห็นลิงก์ตรวจใบลา/กล้อง | role-aware shell; ยังบังคับสิทธิ์ที่ API |
| course link เปิด students | งานตรวจการเข้าเรียนต้องกดเพิ่ม | เปิด checkin เป็นค่าเริ่มต้น |
| forms/lists รวมกันแบบยาว | hierarchy ไม่ชัด | จัด form/list/action ให้แยกงานและใช้ shared components |
| native browser confirm | ข้อความและ focus ไม่สม่ำเสมอ | accessible confirmation ที่ระบุผลกระทบ |
| table overflow บนมือถือ | ต้องเลื่อนเพื่อหารหัส/ปุ่ม | stack cells เป็น record list โดยคงข้อมูลและ action |
| ข้อมูลรอตรวจกับรายชื่อกระจาย | เสี่ยงข้ามสิ่งที่ต้องตัดสินใจ | decision band → evidence → allowed actions |
| mobile profile รวม summary และลา | งานหลักไม่มีลำดับชัด | summary entry พร้อมทางเข้าลา/บัญชี; ไม่เพิ่มฟีเจอร์ |
| รูป signed URL อายุสั้น | หลักฐานอาจโหลดไม่ได้ | expired/missing/retry states และขอลิงก์ใหม่ผ่าน endpoint เดิม |
| settings outOfRoom มีแต่ field | เสี่ยงตีความว่ารายงานพร้อม | คง field ไม่สร้างข้อมูล tracking ปลอม |
| leave OCR ทำระหว่างส่ง | README ร่างฟอร์มก่อนส่งไม่ตรงจริง | แสดงสถานะ OCR หลังส่งให้อาจารย์ใช้ประกอบ |

## Runtime evidence

- `npm run dev:web` เริ่ม Next.js ได้; `http://localhost:3000/login` ตอบ HTTP 200
- `http://localhost:3001/me` ไม่มีบริการตอบ; ไม่เปิด backend runners กับฐานข้อมูลจริงเพื่อจำลองการตรวจเข้าเรียน
- In-app browser host unavailable. ไม่อ้างว่าทดสอบ OAuth/ใบหน้า/กล้อง/การอนุมัติจริงผ่านแล้ว
- Figma MCP สร้าง foundations และ teacher main flow 9 หน้าสำเร็จ; screenshot แรกพบ horizontal Auto Layout ตั้งแกนผิด จึงแก้ primary/counter sizing แล้ว
- การจับภาพหลังแก้ถูกบล็อกเพราะ MCP quota Starter เต็ม; เตรียม development plugin เพื่อสร้างต่อ/ตรวจใน Desktop โดยไม่ใช้ MCP
- ข้อมูลตัวอย่างไม่มีภาพบัตร รูปใบหน้า credentials หรือข้อมูลฐานข้อมูลจริง

## Implementation gaps and planned designs

Classroom sync, chatbot/RAG, transfer credits, doorway entry/exit report, statistics outside API, admin room edit/delete, frontend camera token management และ OCR form-draft ก่อนส่ง: ยังไม่มีครบใน implementation ที่ตรวจ. รอบ 3 พฤศจิกายนเพิ่มดีไซน์แผนงานที่มีหลักฐานแล้ว ดู [PLANNED-FEATURES.md](PLANNED-FEATURES.md); ไม่เพิ่มสถิติหรือข้อกล่าวอ้างที่ไม่มี API รองรับ.

## SLCM reference update — 2026-11-03

ตาม DESIGN.md ที่โฟลเดอร์แม่ฉบับใหม่ ปรับไฟล์ Copy ผ่าน local development plugin `ClassPing — Apply DESIGN.md`: canvas #EFEFEF, primary/ink #000000, Kanit, spacing 2/4/8/12/16/24/32/48/64 และ radius controls 4/8px. แผงดำใช้ข้อความสีอ่อนเพื่อแก้ข้อขัดแย้งเรื่อง contrast ใน reference; คงสีเตือน/ผิดพลาดเฉพาะสถานะจริง.

รายงานที่อ่านจากปลั๊กอินสำเร็จ: 93 screens, 2052 text nodes, 449 instances, 60 variables, 586 connected prototype nodes, 8 starting points, missing targets []. ตรวจภาพ foundations และภาพรวมหน้ามือถือแล้ว แต่ยังไม่ได้ตรวจภาพใหม่ครบทุกหน้า. พบ loading text 3 จุด ratio 4.27:1; เตรียมตัวแก้ใน source แล้ว แต่ยังยืนยันผล rerun รุ่นแก้นี้ใน Figma ไม่ได้ เนื่องจาก native UI automation มี noWindowsAvailable / state changed และคำสั่งบางครั้งไม่เปลี่ยน UI. ไม่อ้างว่า contrast ทั้งหมดผ่านแล้ว.

ไฟล์เดิมยังเป็น Copy `kaMgswYGB5XiMnEMZaFRO6`; cloud sync รอบนี้ยังไม่ได้ยืนยัน. แก้รูปลักษณ์และ tokens โดยคง editable layers/components/Auto Layout และ prototype; ไม่แก้ app/API. หลัง merge main สาขา Film-mac มีโค้ดฟีเจอร์เพิ่มเติม จึงไม่ใช้ audit checkout 1d5ea82 เป็นคำยืนยันสถานะ implementation ล่าสุดของสาขานี้.

## Verification status

Update 2026-11-03: ตามคำสั่งเพิ่มฟีเจอร์ที่ยังไม่เสร็จและใช้วิธี Desktop เดิม ปรับฉบับ Copy `kaMgswYGB5XiMnEMZaFRO6` เป็น white/ink/green ตาม DESIGN.md ที่โฟลเดอร์แม่แล้ว. ปลั๊กอินรายงาน 93 หน้าจอ (เว็บ 57, มือถือ/responsive 36), รวม planned 32 หน้า, variables 59, connected prototype nodes 586 และ flow starts 8 ไม่มี missing targets. ตรวจภาพหน้า login ที่เรนเดอร์แล้ว; ยังไม่ถือว่าตรวจภาพใหม่ทุกหน้าครบ. Figma แจ้งว่าการเปลี่ยนแปลงบันทึกในเครื่องและรอ reconnect จึงยังยืนยัน cloud sync ไม่ได้. ไฟล์ต้นฉบับ `dXSwty7php1cJQxH7Vllnl` ไม่ถูกเขียนทับในรอบนี้.

- ฉบับเต็ม: https://www.figma.com/design/kaMgswYGB5XiMnEMZaFRO6 — สำเนาใน Drafts ทีม Lunch Rush ของบัญชี Desktop เพราะบัญชีนี้ดูไฟล์ MCP ต้นฉบับได้อย่างเดียว
### Historical baseline — ก่อนปรับรอบ 3 พฤศจิกายน

ตัวเลขและ contrast ด้านล่างเป็นผลรอบก่อน ไม่ใช่ผล QA ของดีไซน์ล่าสุดทั้งหมด.

- รัน development plugin ใน Figma Desktop สำเร็จ: 60 หน้าจอ/สถานะ (เว็บ 36, มือถือและ responsive 24), component variants 43 ใน 7 families, instances 332, variables 54, text styles 7, prototype links 262
- Structural report: ไม่มี top-level horizontal overflow หรือ missing prototype targets. นี่ไม่ใช่ข้อพิสูจน์ว่าทุก interaction เชื่อม backend แล้ว
- ตรวจภาพหน้าเช็คชื่อหลังแก้ horizontal Auto Layout และหน้าสรุปนักศึกษาหลังแก้ข้อความไทยใน Notice/Field ให้ fill ความกว้าง; ทั้งสองแก้จากภาพที่พบจริง. เนื้อหา mobile ที่ยาวอยู่ใน scroll area; footer ไม่ทับ controls
- Native renderer ส่งออก PNG ของทุก top-level design frame ไปยังปลั๊กอินได้; การบันทึก ZIP ผ่าน save dialog ไม่สำเร็จ จึงไม่แนบไฟล์ภาพ QA และไม่อ้างว่าตรวจภาพทุกหน้าด้วยตาครบแล้ว
- Contrast คู่ข้อความหลัก: 5.56–12.75:1; `node --check design/figma-plugin/code.js` ผ่าน
- หน้ามือถืออ้างอิง screens/types และข้อกำหนดใน README ตามที่ผู้ใช้อนุญาตเมื่อเปิด runtime ไม่ได้. แยก feature ที่เป็นแผนไว้ใน PLANNED-FEATURES.md
- โค้ดแอป/API และข้อมูลจริงไม่ถูกแก้. ยังต้องทดสอบ authenticated flows, กล้องจริง, mobile device, font scaling และ dark theme ก่อนนำไป production

## Web source follow-up — 2026-11-03

- `MainNavigation` ใช้บทบาทจาก `/me` และ session เพื่อแสดงเมนูเฉพาะงานนักศึกษา/อาจารย์/แอดมิน; ไม่เปลี่ยนกฎสิทธิ์ backend
- ช่องว่าง catalog/RAG ใน P09–P10 เชื่อมในโค้ดแล้ว: แอดมินบันทึกเนื้อหาและดัชนีใน transaction เดียว ปิดใช้งานถอน source/chunks; รายการเก่าต้องแก้ไข/บันทึกเพื่อนำเข้า และ UI แสดงสถานะรอนำเข้า/พร้อมใช้/ปิดใช้งาน
- แหล่งที่เปิดใช้เป็นสาธารณะสำหรับ DPU Chat บนมือถือ; mock provider เดิม ไม่เพิ่มหน้าแชทบนเว็บหรืออ้างว่าเชื่อม LLM จริงแล้ว
- รัน migration `20261103100000_catalog_chat_knowledge.sql` บนฐานร่วมสำเร็จแล้ว ไม่มี seed/ข้อมูลตัวอย่าง; ตรวจ rollback และสิทธิ์ service role บนฐานจำลองก่อนรันจริง
- API/web build และ tests ผ่าน; Figma ยังไม่ได้อัปเดตตาม source รอบนี้ และยังไม่ตรวจ browser/ฐานจริงครบวงจร
