const page=figma.root.children.find(p=>p.name==='03 · Student & responsive');await figma.setCurrentPageAsync(page);
if(page.children.some(n=>n.name==='P32 · เวลานอกห้อง · แผนงาน'))return {existing:true};
// COMMON
// MOBILE_COMMON
let s=save('planMobileCourses',mobile('P21 · รายวิชาและตาราง · แผนงาน',25,'รายวิชาของฉัน','ข้อมูลตัวอย่างสมมติ · แผนงาน'));
let p=mpanel(s.main,'CS101 · กลุ่ม 01');T(p,'การเขียนโปรแกรมเบื้องต้น','Body','ink',294);T(p,'จันทร์ 09:00–12:00\nห้องตัวอย่าง 301','Body','muted',294);actions.push({id:btn(p,'รายละเอียดเข้าเรียน','Secondary','Default',294).id,to:'planMobileAttendance'});mb(s,'ผู้ช่วยการเรียน','planMobileChat');mb(s,'สรุปเข้าเรียน','mobileHome','Secondary');
s=save('planMobileAttendance',mobile('P22 · รายละเอียดเข้าเรียน · แผนงาน',26,'CS101 · การเข้าเรียน','กลุ่ม 01 · ข้อมูลตัวอย่างสมมติ'));
field(s.main,'ประเภทคาบ','ทั้งหมด / คาบเรียน / คาบสอบ',342);field(s.main,'ช่วงวันที่','1–30 พ.ย. 2569',342);p=mpanel(s.main,'2 พ.ย. · คาบเรียน');badge(p,'Present');T(p,'ห้อง 301 · 09:00–12:00\nพบครั้งแรก 09:04','Body','muted',294);evidence(p);p=mpanel(s.main,'9 พ.ย. · คาบสอบ');badge(p,'Pending');T(p,'รออาจารย์ตรวจ ยังไม่ใช่ผลยืนยัน','Body','muted',294);mb(s,'กลับรายวิชา','planMobileCourses','Secondary');
s=save('planMobileEvidence',mobile('P23 · ภาพหมดอายุ · แผนงาน',27,'ภาพประกอบเข้าเรียน'));
evidence(s.main,'Expired',240);mnotice(s.main,'ลิงก์ภาพหมดอายุ','ขอภาพใหม่ผ่านสิทธิ์บัญชีเดิม ไม่เปลี่ยนข้อมูลการเข้าเรียน','Warning');mb(s,'โหลดภาพใหม่','planMobileAttendance');mb(s,'กลับ','planMobileAttendance','Secondary');
s=save('planMobileOCR',mobile('P24 · อ่านร่างเหตุผล · แผนงาน',28,'อ่านหลักฐานเป็นร่าง','แผนงาน · ยังไม่ส่งคำขอลา'));
field(s.main,'ภาพหลักฐาน · JPG/PNG ≤10 MB','appointment-example.jpg',342);field(s.main,'เหตุผลเดิม','มีนัดตรวจตามนัดหมาย',342);mnotice(s.main,'ข้อความร่างจากหลักฐาน','มีนัดพบแพทย์ตามใบนัด');mb(s,'เลือกใช้ข้อความร่าง','planMobileOCRConfirm');mb(s,'ใช้เหตุผลเดิม','leaveForm','Secondary');
s=save('planMobileOCRConfirm',mobile('P25 · ตรวจร่างก่อนส่ง · แผนงาน',29,'ตรวจคำขอลาก่อนส่ง'));
field(s.main,'คาบที่ลา','CS101 · 9 พ.ย. 09:00',342);field(s.main,'เหตุผลที่แก้ไขได้','มีนัดพบแพทย์ตามใบนัด',342);T(s.main,'OCR ช่วยอ่านข้อมูล แต่ไม่รับรองเอกสารและไม่อนุมัติคำขอ','Body','muted',342);mb(s,'ส่งคำขอลา','leaveSending');mb(s,'กลับไปแก้','planMobileOCR','Secondary');
s=save('planMobileChat',mobile('P26 · แชทนักศึกษา · แผนงาน',30,'ผู้ช่วยของฉัน','แหล่งข้อมูลตามสิทธิ์บัญชี'));
T(s.main,'ถามเกี่ยวกับข้อมูลมหาวิทยาลัยหรือรายวิชาที่คุณลงทะเบียน','Body','muted',342);field(s.main,'ข้อความ','มีงานที่ใกล้กำหนดส่งไหม',342);mnotice(s.main,'Classroom ยังไม่เชื่อมต่อ','ยังอ่านงานและกำหนดส่งของคุณไม่ได้');mb(s,'เชื่อม Classroom','planMobileClassroom');mb(s,'ตัวอย่างไม่มีแหล่งอ้างอิง','planMobileChatNoEvidence','Secondary');
s=save('planMobileChatNoEvidence',mobile('P27 · แชทไม่มีหลักฐาน · แผนงาน',31,'ผู้ช่วยของฉัน'));
T(s.main,'ยังไม่พบข้อมูลที่ใช้ตอบคำถามนี้ได้','Heading','ink',342);T(s.main,'ลองระบุหัวข้อหรือรายวิชาให้ชัดขึ้น ระบบจะไม่เดาคำตอบเมื่อไม่มีแหล่งข้อมูลรองรับ','Body','muted',342);field(s.main,'ข้อความใหม่','พิมพ์คำถาม',342);mb(s,'กลับการสนทนา','planMobileChat','Secondary');
s=save('planMobileClassroom',mobile('P28 · สิทธิ์ Classroom · แผนงาน',32,'เชื่อมบัญชี Classroom'));
T(s.main,'อ่านรายวิชา งานและกำหนดส่ง','Title','ink',342);T(s.main,'ใช้สิทธิ์อ่านข้อมูลเท่านั้น คุณถอนการเชื่อมต่อได้ หากมหาวิทยาลัยไม่อนุญาต ให้ใช้ข้อมูลใน ClassPing ต่อ','Body','muted',342);mb(s,'อนุญาตและเชื่อมต่อ','planMobileAssignments');mb(s,'ไว้ภายหลัง','planMobileChat','Secondary');
s=save('planMobileAssignments',mobile('P29 · งานและกำหนดส่ง · แผนงาน',33,'งานในรายวิชา','อ่านอย่างเดียว · ข้อมูลตัวอย่างสมมติ'));
p=mpanel(s.main,'CS101 · งานตัวอย่าง');T(p,'ฝึกเขียนโปรแกรมเงื่อนไข','Body','ink',294);T(p,'กำหนดส่งจะแสดงจาก Classroom\nเปิดต้นทางเพื่อตรวจรายละเอียด','Body','muted',294);mnotice(s.main,'ตารางเรียนอยู่ใน ClassPing','Classroom ไม่มีวันและเวลาเรียน');mb(s,'กลับผู้ช่วย','planMobileChat','Secondary');
s=save('planMobileTransfer',mobile('P30 · ยื่นเทียบโอน · แผนงาน',34,'คำขอเทียบโอน','เว็บนักศึกษาแบบ responsive'));
field(s.main,'สถาบันเดิม','สถาบันตัวอย่าง',342);field(s.main,'วิชาเดิม / หน่วยกิต','OLD101 / 3',342);field(s.main,'ผลการเรียน · PDF/JPG/PNG ≤10 MB','transcript-example.pdf',342);T(s.main,'กรอกข้อมูลตามเอกสาร ผู้ดูแลตรวจหลักฐานและพิจารณารายวิชา','Body','muted',342);mb(s,'ส่งคำขอเทียบโอน','planMobileTransferResult');
s=save('planMobileTransferResult',mobile('P31 · ผลเทียบโอน · แผนงาน',35,'ผลคำขอเทียบโอน','ข้อมูลตัวอย่างสมมติ'));
T(s.main,'อนุมัติบางรายวิชา','Heading','ink',342);p=mpanel(s.main,'OLD101 → CS101');badge(p,'Approved');T(p,'หน่วยกิตตามคู่เทียบ · 3','Body','muted',294);p=mpanel(s.main,'OLD202');badge(p,'Rejected');T(p,'เหตุผลตัวอย่าง: หน่วยกิตไม่ถึงเกณฑ์','Body','muted',294);T(s.main,'ผลนี้ไม่เพิ่มการลงทะเบียนหรือแก้ทะเบียนอัตโนมัติ','Body','muted',342);mb(s,'กลับคำขอ','planMobileTransfer','Secondary');
s=save('planMobileDoorway',mobile('P32 · เวลานอกห้อง · แผนงาน',36,'เวลาเข้าออกของฉัน','CS101 · ข้อมูลสมมติ · แผนงาน'));
p=mpanel(s.main,'2 พ.ย. · ห้อง 301');T(p,'ออก 10:10 → กลับ 10:16\nรวม 6 นาที','Body','ink',294);mnotice(s.main,'เหตุการณ์ที่ยังไม่ครบ','หากไม่พบเวลากลับ ต้องตรวจข้อมูลก่อนสรุปผล');mb(s,'กลับรายละเอียดเข้าเรียน','planMobileAttendance','Secondary');
return {screens,actions,planned:true};
