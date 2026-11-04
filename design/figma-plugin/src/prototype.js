async function wirePrototype(frameIds, pages) {
  const edges = [];
  const missing = [];
  const teacherPage=pages.find(p=>p.name==='02 · Teacher & admin');
  await figma.setCurrentPageAsync(teacherPage);
  let rejected=teacherPage.children.find(n=>n.name==='T19b · ไม่อนุมัติใบลา');
  if(!rejected){
    const approved=await figma.getNodeByIdAsync(frameIds.leaveReviewed);
    rejected=approved.clone();rejected.name='T19b · ไม่อนุมัติใบลา';rejected.x=0;rejected.y=19200;
    for(const n of rejected.findAllWithCriteria({types:['TEXT']})){
      for(const segment of n.getStyledTextSegments(['fontName']))await figma.loadFontAsync(segment.fontName);
      if(n.characters==='อนุมัติคำขอลาแล้ว')n.characters='ไม่อนุมัติคำขอลา';
    }
    const lib=figma.root.children.find(p=>p.name==='01 · System & product map');
    const statusSet=lib.children.find(n=>n.name==='CP/Status');
    for(const n of rejected.findAllWithCriteria({types:['INSTANCE']})){
      const mc=await n.getMainComponentAsync();
      if(mc?.parent?.name==='CP/Status')n.swapComponent(statusSet.children.find(c=>c.name==='Status=Rejected'));
    }
  }
  frameIds.leaveRejected=rejected.id;
  const routes = {
    webLogin: {'เข้าสู่ระบบด้วย Google':'courses'},
    createCourse: {'สร้างรายวิชา':'students','ยกเลิก':'courses'},
    review: {'ยืนยันว่าใช่':'reviewDone','เปลี่ยนเป็นคนอื่น':'reassign','ไม่ใช่นักศึกษาวิชานี้':'rejectFace'},
    reassign: {'บันทึกคนที่ถูกต้อง':'reviewDone','ยกเลิก':'review'},
    rejectFace: {'ยืนยันไม่ใช่':'attendance','กลับไปตรวจ':'review'},
    reviewDone: {'กลับการเช็คชื่อ':'attendance'},
    editStatus: {'บันทึกสถานะ':'reviewDone','ยกเลิก':'attendance'},
    schedule: {'แก้เฉพาะวัน':'override','เปลี่ยน / คืนค่า':'override'},
    override: {'บันทึกการเปลี่ยน':'schedule','งดสอนวันนี้':'schedule','ใช้ตามตารางเดิม':'schedule'},
    examForm: {'บันทึกคาบสอบ':'examConflict','ยกเลิก':'exams'},
    examConflict: {'ยืนยันแทนคาบเรียน':'exams','กลับไปแก้':'examForm'},
    rules: {'บันทึกเกณฑ์':'sessions'},
    leaveReview: {'อนุมัติ':'leaveReviewed','ไม่อนุมัติ':'leaveRejected'},
    leaveReviewed: {'กลับรายการคำขอลา':'leaveReview'},
    leaveRejected: {'กลับรายการคำขอลา':'leaveReview'},
    account: {'ออกจากระบบ':'webLogin'},
    resetFace: {'ยืนยันรีเซ็ตใบหน้า':'users','ยกเลิก':'users'},
    webEmpty: {'สร้างรายวิชา':'createCourse'},
    webError: {'ลองอีกครั้ง':'courses'},
    forbidden: {'กลับบัญชีของฉัน':'account'},
    videoEmpty: {'กลับกล้องทั้งหมด':'cameras'},
    lastAdmin: {'กลับรายชื่อผู้ใช้':'users'},
    mobileLogin: {'เข้าสู่ระบบด้วย Google':'consent'},
    consent: {'ยินยอม':'identity','ไม่ยินยอม':'declined'},
    declined: {'กลับไปอ่านอีกครั้ง':'consent','ออกจากระบบ':'mobileLogin'},
    identity: {'เลือกภาพบัตร':'cameraPermission','ออกจากระบบ':'mobileLogin'},
    cameraPermission: {'อนุญาตใช้กล้อง':'poseFront','ออกจากระบบ':'mobileLogin'},
    poseFront: {'เปลี่ยนภาพบัตร':'identity'},
    mobileHome: {'ยื่นคำขอลา':'leaveForm','บัญชีของฉัน':'mobileAccount','รายวิชาและตาราง':'planMobileCourses','ผู้ช่วยการเรียน':'planMobileChat','ยื่นเทียบโอน':'planMobileTransfer'},
    leaveForm: {'ส่งคำขอลา':'leaveSending','กลับ':'mobileHome'},
    leaveHistory: {'ยื่นคำขอลาอีกคาบ':'leaveForm','กลับหน้าหลัก':'mobileHome'},
    mobileAccount: {'กลับหน้าหลัก':'mobileHome','ออกจากระบบ':'mobileLogin'},
    cardError: {'เลือกภาพบัตรใหม่':'identity','ออกจากระบบ':'mobileLogin'},
    cameraDenied: {'ออกจากระบบ':'mobileLogin'},
    poseRetry: {'ลองอีกครั้ง':'poseLeft','เปลี่ยนภาพบัตร':'identity'},
    ocrFailed: {'ดูสถานะใบลา':'leaveHistory'},
    summaryError: {'ลองใหม่':'mobileHome','บัญชีของฉัน':'mobileAccount'},
    noCourses: {'บัญชีของฉัน':'mobileAccount'},
    noEligibleLeave: {'คำขอลาของฉัน':'leaveHistory','กลับหน้าหลัก':'mobileHome'},
    leaveValidation: {'เลือกภาพใหม่':'leaveForm'}
  };
  async function link(node, targetKey, trigger = {type:'ON_CLICK'}) {
    const destinationId = frameIds[targetKey];
    const dest = destinationId && await figma.getNodeByIdAsync(destinationId);
    if (!dest) {missing.push(targetKey);return;}
    let root=node;while(root.parent && root.parent.type!=='PAGE')root=root.parent;
    if(root===dest || root.parent!==dest.parent)return;
    await node.setReactionsAsync([{trigger,actions:[{type:'NODE',destinationId,navigation:'NAVIGATE',transition:null,resetScrollPosition:true}]}]);
    edges.push({source:node.id,target:destinationId,trigger:trigger.type});
  }
  for (const page of pages) {
    await figma.setCurrentPageAsync(page);
    for (const [key, labels] of Object.entries(routes)) {
      const frame = frameIds[key] && await figma.getNodeByIdAsync(frameIds[key]);
      if(!frame || frame.parent!==page)continue;
      for(const [label,target] of Object.entries(labels)){
        const nodes=frame.findAllWithCriteria({types:['INSTANCE']}).filter(n=>n.findAllWithCriteria({types:['TEXT']})[0]?.characters===label);
        if(!nodes.length)missing.push(key+': '+label);
        for(const n of nodes)await link(n,target);
      }
    }
    const planned={
      planCameras:{'ออกหรือหมุน token':'planTokenConfirm','ออก token':'planTokenConfirm','หมุน token':'planTokenConfirm'},
      planTokenConfirm:{'ยืนยันออก token':'planTokenResult','ยกเลิก':'planCameras'},planTokenResult:{'เสร็จสิ้น':'planCameras'},
      planCurricula:{'ตรวจไฟล์ก่อนนำเข้า':'planCSVPreview'},planCSVError:{'เลือกไฟล์ใหม่':'planCurricula'},planCSVPreview:{'ยืนยันนำเข้าทั้งชุด':'planCurricula','กลับไปเลือกไฟล์':'planCurricula'},
      planClassroom:{'เชื่อมบัญชี Google':'planClassroomSync'},planClassroomSync:{'ย้อนกลับ':'planClassroom'},
      planTransfers:{'ตรวจคำขอ':'planTransferReview','เปิดคำขอ':'planTransferReview','จัดการคู่เทียบ':'planTransferMapping'},planKnowledge:{'การนำเข้าเพื่อค้นคืน':'planRAG'},
      planStudyAssist:{'เชื่อม Classroom':'planClassroom'},planMobileCourses:{'รายละเอียดเข้าเรียน':'planMobileAttendance','ผู้ช่วยการเรียน':'planMobileChat','สรุปเข้าเรียน':'mobileHome'},
      planMobileAttendance:{'กลับรายวิชา':'planMobileCourses'},planMobileOCR:{'เลือกใช้ข้อความร่าง':'planMobileOCRConfirm','ใช้เหตุผลเดิม':'leaveForm'},
      planMobileOCRConfirm:{'ส่งคำขอลา':'leaveSending','กลับไปแก้':'planMobileOCR'},planMobileChat:{'เชื่อม Classroom':'planMobileClassroom','ตัวอย่างไม่มีแหล่งอ้างอิง':'planMobileChatNoEvidence'},
      planMobileChatNoEvidence:{'กลับการสนทนา':'planMobileChat'},planMobileClassroom:{'อนุญาตและเชื่อมต่อ':'planMobileAssignments','ไว้ภายหลัง':'planMobileChat'},
      planMobileAssignments:{'กลับผู้ช่วย':'planMobileChat'},planMobileTransfer:{'ส่งคำขอเทียบโอน':'planMobileTransferResult'},planMobileTransferResult:{'กลับคำขอ':'planMobileTransfer'},planMobileDoorway:{'กลับรายละเอียดเข้าเรียน':'planMobileAttendance'}
    };
    for(const [key,labels]of Object.entries(planned)){const frame=frameIds[key]&&await figma.getNodeByIdAsync(frameIds[key]);if(frame?.parent!==page)continue;for(const[label,target]of Object.entries(labels))for(const n of frame.findAllWithCriteria({types:['INSTANCE']}).filter(n=>n.findAllWithCriteria({types:['TEXT']})[0]?.characters===label))await link(n,target);}
    const adminRoutes={'รายวิชา':'planCourseAdmin','กล้อง':'planCameras','หลักสูตร':'planCurricula','ข้อมูลกลาง':'planReference','แหล่งความรู้':'planKnowledge','เทียบโอน':'planTransfers','Classroom':'planClassroom'};
    for(const nav of page.findAll(n=>n.type==='FRAME'&&n.name==='Navigation')){if(!nav.children.some(n=>n.type==='TEXT'&&n.characters==='พื้นที่ผู้ดูแลระบบ'))continue;for(const row of nav.children.filter(n=>n.type==='FRAME')){const label=row.findOne(n=>n.type==='TEXT')?.characters;if(adminRoutes[label])await link(row,adminRoutes[label]);}}
    for(const [key,next] of [['poseFront','poseLeft'],['poseLeft','poseRight'],['poseRight','poseUp'],['poseUp','poseDown'],['poseDown','mobileHome'],['leaveSending','leaveHistory']]){
      const frame=await figma.getNodeByIdAsync(frameIds[key]);if(frame?.parent!==page)continue;
      await link(frame,next,{type:'AFTER_TIMEOUT',timeout:2});
    }
    const starts=page.name==='02 · Teacher & admin'?[['Teacher · ตรวจเช็คชื่อ','webLogin'],['Admin · จัดการระบบ','admin'],['แผนงาน · Classroom','planClassroom'],['แผนงาน · เทียบโอน','planTransfers']]:page.name==='03 · Student & responsive'?[['Student · ลงทะเบียนและยื่นลา','mobileLogin'],['Student · สรุปเข้าเรียน','mobileHome'],['แผนงาน · OCR ร่าง','planMobileOCR'],['แผนงาน · ผู้ช่วย','planMobileChat']]:[];
    if(starts.length)page.flowStartingPoints=starts.map(([name,key])=>({name,nodeId:frameIds[key]}));
  }
  let total=0;
  for(const page of pages){await figma.setCurrentPageAsync(page);total+=page.findAll(n=>'reactions' in n && n.reactions.length>0).length;}
  return {updatedConnections:edges.length,totalConnectedNodes:total,flowStarts:8,missing,edges};
}
