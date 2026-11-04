const STYLE_JOBS=[];figma.showUI("<!doctype html><meta charset=\"utf-8\">\n<style>body{font:14px system-ui;color:#123f35;padding:20px}button,select{font:inherit;padding:10px;margin:4px 0;width:100%;border:1px solid #cbd7d0;border-radius:8px;background:#fff;color:#123f35}button{background:#176b58;color:white}pre{white-space:pre-wrap;font:12px system-ui}h2{margin-top:0}</style>\n<h2>ClassPing UX</h2><p id=\"status\">Building editable screens…</p>\n<div id=\"tools\" hidden><select id=\"screens\"></select><button id=\"view\">Inspect selected screen</button><button id=\"export\">Export rendered QA ZIP</button></div><pre id=\"report\"></pre>\n<script>\nconst files=[];const enc=new TextEncoder();\nconst crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});\nfunction crc(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}\nfunction zip(entries){const chunks=[],central=[];let offset=0,size=0;for(const f of entries){const name=enc.encode(f.name),data=f.data;const c=crc(data);const header=new Uint8Array(30+name.length);const v=new DataView(header.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,c,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);header.set(name,30);chunks.push(header,data);const cd=new Uint8Array(46+name.length),d=new DataView(cd.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint32(16,c,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);cd.set(name,46);central.push(cd);offset+=header.length+data.length;size+=cd.length;}const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);return new Blob([...chunks,...central,end],{type:'application/zip'});}\nonmessage=e=>{const m=e.data.pluginMessage;if(!m)return;if(m.status)document.querySelector('#status').textContent=m.status;if(m.detail)document.querySelector('#report').textContent=m.detail;if(m.screens){document.querySelector('#tools').hidden=false;document.querySelector('#screens').innerHTML='';for(const s of m.screens){const o=document.createElement('option');o.value=s.id;o.textContent=s.name;document.querySelector('#screens').append(o);}}if(m.file)files.push({name:m.file.name,data:new Uint8Array(m.file.bytes)});if(m.done){files.push({name:'qa-report.json',data:enc.encode(m.detail)});const a=document.createElement('a');a.href=URL.createObjectURL(zip(files));a.download='classping-qa.zip';a.click();}};\ndocument.querySelector('#view').onclick=()=>parent.postMessage({pluginMessage:{type:'inspect',id:document.querySelector('#screens').value}},'*');\ndocument.querySelector('#export').onclick=()=>{files.length=0;parent.postMessage({pluginMessage:{type:'export'}},'*');};\n</script>\n",{width:480,height:600});
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

async function applyReferenceDesign(pages) {
  const vars=await figma.variables.getLocalVariablesAsync();
  const V=Object.fromEntries(vars.map(v=>[v.name,v]));
  const collections=await figma.variables.getLocalVariableCollectionsAsync();
  const primitives=collections.find(c=>c.name==='CP · Primitives');
  const semantic=collections.find(c=>c.name==='CP · Semantic');
  const rgb=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
  const palette={forest:'#000000',teal:'#000000',tealHover:'#262626',mint:'#DEDEDE',paper:'#EFEFEF',white:'#EFEFEF',ink:'#000000',muted:'#666666',line:'#A3A3A3',amber:'#765000',amberBg:'#FFF3D5',red:'#AE2929',redBg:'#FFF0EE',blue:'#40454E',blueBg:'#F2F3F5'};
  for(const [name,value]of Object.entries(palette))V['palette/'+name]?.setValueForMode(primitives.defaultModeId,rgb(value));
  V['color/rail'].setValueForMode(semantic.defaultModeId,figma.variables.createVariableAlias(V['palette/white']));
  V['color/onRail'].setValueForMode(semantic.defaultModeId,figma.variables.createVariableAlias(V['palette/ink']));
  for(const n of [2,4,8,12,16,24,32,48,64]){let v=V['space/'+n];if(!v){v=figma.variables.createVariable('space/'+n,primitives,'FLOAT');v.scopes=['GAP','WIDTH_HEIGHT'];v.setVariableCodeSyntax('WEB','var(--cp-space-'+n+')');V[v.name]=v;}v.setValueForMode(primitives.defaultModeId,n);}
  let radius=V['radius/8'];if(!radius){radius=figma.variables.createVariable('radius/8',primitives,'FLOAT');radius.scopes=['CORNER_RADIUS'];radius.setVariableCodeSyntax('WEB','var(--cp-radius-8)');V[radius.name]=radius;}radius.setValueForMode(primitives.defaultModeId,8);
  const paint=k=>[figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:1,g:1,b:1}},'color',V['color/'+k])];
  const fonts=await figma.listAvailableFontsAsync();
  const family='Kanit';
  for(const style of ['Regular','Medium','SemiBold','Bold'])if(!fonts.some(f=>f.fontName.family===family&&f.fontName.style===style))throw Error('Required font unavailable: '+family+' '+style);
  await Promise.all(['Regular','Medium','SemiBold','Bold'].map(style=>figma.loadFontAsync({family,style})));
  const styles=await figma.getLocalTextStylesAsync();
  for(const style of styles.filter(s=>s.name.startsWith('CP/'))){const weight=style.fontName.style.replace('Semi Bold','SemiBold');style.fontName={family,style:['Regular','Medium','SemiBold','Bold'].includes(weight)?weight:'Regular'};if(style.name==='CP/Body')style.lineHeight={unit:'PIXELS',value:24};}
  const lib=pages.find(p=>p.name==='01 · System & product map');await figma.setCurrentPageAsync(lib);
  const buttons=lib.children.find(n=>n.name==='CP/Button');
  const tertiary={};
  for(const state of ['Default','Hover','Focus','Disabled','Loading']){
    let c=buttons.children.find(c=>c.name==='Type=Tertiary, State='+state);
    if(!c){c=buttons.children.find(c=>c.name==='Type=Secondary, State='+state).clone();c.name='Type=Tertiary, State='+state;buttons.appendChild(c);c.x=24+['Default','Hover','Focus','Disabled','Loading'].indexOf(state)*208;c.y=360;}
    c.fills=paint(state==='Hover'?'infoBg':'surface');c.strokes=paint(state==='Focus'?'action':'border');for(const t of c.findAllWithCriteria({types:['TEXT']}))t.fills=paint('ink');tertiary[state]=c;
  }
  buttons.resize(Math.max(buttons.width,1080),Math.max(buttons.height,456));
  for(const c of buttons.children.filter(c=>c.name.startsWith('Type=Secondary,'))){c.fills=paint('ink');c.strokes=[];for(const t of c.findAllWithCriteria({types:['TEXT']}))t.fills=paint('onAction');}
  const replacements={
    'ClassPing · Campus wayfinding':'ClassPing · SLCM / Monochrome',
    'ClassPing · White / Ink / Green':'ClassPing · SLCM / Monochrome',
    'Typography / IBM Plex Sans Thai':'Typography / Kanit',
    'Typography / Noto Sans Thai':'Typography / Kanit',
    'Visual reference: DESIGN.md · white canvas, near-black ink, green #007D53, radius 13px, 6px rhythm. Thai text uses Noto Sans Thai. Amber/red apply only to factual statuses.':'Visual reference: DESIGN.md · SLCM monochrome · canvas #EFEFEF · ink #000000 · Kanit · radius 4/8px · spacing 2/4/8/12/16/24/32/48/64. Dark cards use light text for contrast; semantic warning/error colors describe factual states only.',
    'Campus wayfinding: forest rail / warm paper / mint selection / amber review. IBM Plex Sans Thai. 4px spacing scale, 48px targets, radius 12. สีสื่อความหมายพร้อมข้อความ. Light เป็นฐานสำหรับห้องเรียน; dark theme ยังไม่ใช่ผลส่งมอบที่ตรวจแล้ว.':'Visual reference: DESIGN.md · white canvas, near-black ink, green #007D53, radius 13px, 6px rhythm. Thai text uses Noto Sans Thai. Amber/red apply only to factual statuses.',
    'ข้อมูลตาม Course model · ไม่เพิ่มภาคเรียนหรือหน่วยกิตที่ระบบยังไม่มี':'ระบุข้อมูลเพื่อเริ่มจัดการรายวิชา',
    'ไม่มีปุ่มเช็คชื่อ · กล้องในห้องเรียนบันทึกให้':'กล้องในห้องเรียนบันทึกการเข้าเรียนให้',
    'ตัวเลขตัวอย่าง: 6 คน · 1 คาบ · ข้อมูลชุดเดียวกับหน้าเช็คชื่อ':'CS101 · สรุปตามตัวกรองที่เลือก · ข้อมูลสมมติ',
    'อัตราเข้าเรียน 66.7% · ค่าตัวอย่าง':'อัตราเข้าเรียน 80% · ค่าตัวอย่าง',
    '(มา 2 + สาย 1 + ลา 1) / 6 · รอตรวจ 1 และยังไม่บันทึก 1 ตามข้อมูลตัวอย่าง':'(มา 2 + สาย 1 + ลา 1) / 5 · รวมรอตรวจ แต่ไม่รวมยังไม่บันทึก',
    'ระบบยังไม่ยืนยันตัวบุคคล':'รอตรวจยืนยันตัวบุคคล'
  };
  const rhythm={2:2,4:4,6:4,8:8,12:12,16:16,18:16,20:24,24:24,32:32,36:32,40:32,48:48,64:64,72:64};
  let textCount=0,instances=0;
  const loadedFonts=new Set();
  for(const page of pages){
    figma.ui.postMessage({status:'Applying Kanit and layout: '+page.name});
    await figma.setCurrentPageAsync(page);
    for(const t of page.findAllWithCriteria({types:['TEXT']})){
      for(const segment of t.getStyledTextSegments(['fontName'])){const key=JSON.stringify(segment.fontName);if(!loadedFonts.has(key)){await figma.loadFontAsync(segment.fontName);loadedFonts.add(key);}}
      const old=t.fontName;const weight=typeof old==='object'?old.style.replace('Semi Bold','SemiBold'):'Regular';t.fontName={family,style:['Regular','Medium','SemiBold','Bold'].includes(weight)?weight:'Regular'};
      if(replacements[t.characters])t.characters=replacements[t.characters];
      if(t.fontSize===16)t.lineHeight={unit:'PIXELS',value:24};
      textCount++;
    }
    for(const n of page.findAll(n=>(n.type==='FRAME'||n.type==='COMPONENT')&&n.layoutMode!=='NONE')){
      for(const prop of ['paddingLeft','paddingRight','paddingTop','paddingBottom','itemSpacing']){const val=rhythm[n[prop]];if(val!==undefined){n[prop]=val;if(V['space/'+val])n.setBoundVariable(prop,V['space/'+val]);}}
      if(typeof n.cornerRadius==='number' && n.cornerRadius>=8 && n.cornerRadius<=16){n.cornerRadius=8;n.setBoundVariable('cornerRadius',radius);}
      if(n.name==='Navigation'){n.strokes=paint('border');n.strokeWeight=1;}
    }
    for(const n of page.findAllWithCriteria({types:['INSTANCE']})){
      const mc=await n.getMainComponentAsync();const type=mc?.parent?.name;const texts=n.findAllWithCriteria({types:['TEXT']});
      if(type==='CP/Button' && mc.name.startsWith('Type=Secondary,')){
        const label=texts[0]?.characters;const state=mc.name.split('State=')[1];
        if(label!=='ส่งออก CSV'){const w=n.width;const reactions=n.reactions;n.swapComponent(tertiary[state]||tertiary.Default);n.resize(w,48);const labelNode=n.findOne(x=>x.type==='TEXT');if(labelNode&&label)labelNode.characters=label;if(reactions.length)await n.setReactionsAsync(reactions);}
      }
      if(type==='CP/Field'||type==='CP/Notice'){
        for(const t of texts){t.textAutoResize='HEIGHT';t.layoutSizingHorizontal='FILL';}
        n.primaryAxisSizingMode='AUTO';
      }
      instances++;
    }
    for(const frame of page.children.filter(n=>n.type==='FRAME'&&/^[TAWPER S]\d/.test(n.name))){
      const nav=frame.children.find(n=>n.name==='Navigation');const main=frame.children.find(n=>n.name==='Workspace');
      if(nav){const active=/^A0[23]/.test(frame.name)?'ผู้ใช้':/^A04/.test(frame.name)?'ห้องเรียน':/^A/.test(frame.name)?'ภาพรวม':/^T1[89]/.test(frame.name)?'ตรวจใบลา':/^T2[012]/.test(frame.name)?'กล้อง':/^T23/.test(frame.name)?'บัญชี':'รายวิชา';
        const isAdmin=nav.children.some(n=>n.type==='TEXT'&&n.characters==='พื้นที่ผู้ดูแลระบบ');
        if(isAdmin){const template=nav.children.find(n=>n.type==='FRAME');for(const label of ['หลักสูตร','ข้อมูลกลาง','แหล่งความรู้','เทียบโอน','Classroom']){if(!nav.children.some(n=>n.type==='FRAME'&&n.findOne(t=>t.type==='TEXT'&&t.characters===label))){const row=template.clone();row.name='Navigation / '+label;row.findOne(n=>n.type==='TEXT').characters=label;nav.insertChild(nav.children.length-1,row);}}}
        nav.itemSpacing=8;nav.setBoundVariable('itemSpacing',V['space/8']);
        for(const row of nav.children.filter(n=>n.type==='FRAME')){const label=row.findOne(n=>n.type==='TEXT');row.fills=paint(label?.characters===active?'selected':'surface');if(label)label.fills=paint(label.characters===active?'action':'ink');row.cornerRadius=8;row.setBoundVariable('cornerRadius',radius);}
        for(const row of nav.children.filter(n=>n.type==='FRAME')){row.resize(184,44);row.counterAxisSizingMode='FIXED';row.counterAxisAlignItems='CENTER';row.paddingTop=8;row.paddingBottom=8;row.setBoundVariable('paddingTop',V['space/8']);row.setBoundVariable('paddingBottom',V['space/8']);}
      }
      if(main){const meta=main.children.find(n=>n.type==='FRAME'&&n.name==='Row');const crumb=meta?.children.find(n=>n.type==='TEXT');if(crumb){if(/^A/.test(frame.name))crumb.characters='ClassPing / ผู้ดูแลระบบ';else if(/^T0[12]/.test(frame.name))crumb.characters='ClassPing / รายวิชา';else if(/^T1[89]/.test(frame.name))crumb.characters='ClassPing / ตรวจคำขอลา';else if(/^T2[012]/.test(frame.name))crumb.characters='ClassPing / กล้อง';}
        const bottom=Math.max(...main.children.map(n=>n.y+n.height));frame.resize(1440,Math.max(960,Math.ceil((bottom+36)/24)*24));
        for(const row of main.findAll(n=>n.type==='FRAME'&&n.name==='Row'&&n.parent?.name==='Table')){const total=row.children.reduce((sum,c)=>sum+c.width,0);const available=row.width-row.paddingLeft-row.paddingRight;if(total>available){for(const cell of row.children){const width=cell.width*available/total;cell.resize(width,cell.height);if(cell.type==='TEXT')cell.textAutoResize='HEIGHT';}}}
      }
    }
    const login=page.children.find(n=>n.name==='W01 · เข้าสู่ระบบ');
    if(login){const nav=login.children.find(n=>n.name==='Navigation');if(nav)nav.visible=false;const main=login.children.find(n=>n.name==='Workspace');if(main){main.resize(1440,960);main.counterAxisAlignItems='CENTER';main.paddingTop=120;main.paddingLeft=96;main.paddingRight=96;const meta=main.children.find(n=>n.type==='FRAME'&&n.name==='Row');if(meta)meta.visible=false;for(const n of main.children.filter(n=>n.visible)){if(n.type==='TEXT'){n.resize(480,n.height);n.textAutoResize='HEIGHT';}else if(n.type==='FRAME'){n.resize(480,n.height);for(const t of n.children.filter(n=>n.type==='TEXT')){t.resize(432,t.height);t.textAutoResize='HEIGHT';}}}login.resize(1440,960);}}
  }
  const studentPage=pages.find(p=>p.name==='03 · Student & responsive');await figma.setCurrentPageAsync(studentPage);
  const home=studentPage.children.find(n=>n.name==='S11 · สรุปการเข้าเรียน');const content=home?.findOne(n=>n.type==='FRAME'&&n.name==='Scrollable content');
  if(content&&!content.children.some(n=>n.name==='Future destinations')){const area=figma.createFrame();area.name='Future destinations';area.layoutMode='VERTICAL';area.resize(342,100);area.primaryAxisSizingMode='AUTO';area.itemSpacing=12;area.fills=paint('surface');content.appendChild(area);for(const label of ['รายวิชาและตาราง','ผู้ช่วยการเรียน','ยื่นเทียบโอน']){const b=tertiary.Default.createInstance();area.appendChild(b);b.resize(342,48);b.findOne(n=>n.type==='TEXT').characters=label;}}
  const insideInstance=n=>{for(let p=n.parent;p;p=p.parent)if(p.type==='INSTANCE')return true;return false;};
  let darkCards=0;const contrastIssues=[];const screens=[];let connected=0;const missing=[];let starts=0;
  const resolvePaint=(p,node)=>{let id=p.boundVariables?.color?.id;if(!id)return p.color;const seen=new Set();while(id&&!seen.has(id)){seen.add(id);const v=Object.values(V).find(v=>v.id===id);if(!v)return p.color;const value=Object.values(v.valuesByMode)[0];if(value?.type==='VARIABLE_ALIAS')id=value.id;else return value;}return p.color;};
  const background=node=>{for(let n=node.parent;n&&n.type!=='DOCUMENT';n=n.parent){if(Array.isArray(n.fills)){const p=n.fills.find(p=>p.type==='SOLID'&&p.visible!==false&&p.opacity!==0);if(p)return resolvePaint(p,n);}}return rgb('#EFEFEF');};
  for(const page of pages){await figma.setCurrentPageAsync(page);starts+=(page.flowStartingPoints||[]).length;
    for(const n of page.findAllWithCriteria({types:['COMPONENT']})){
      if(n.parent?.name==='CP/Field'){n.cornerRadius=4;n.setBoundVariable('cornerRadius',V['radius/4']);n.strokes=paint(n.name==='State=Error'?'danger':'ink');}
      if(n.parent?.name==='CP/Button'){n.paddingLeft=24;n.paddingRight=24;n.setBoundVariable('paddingLeft',V['space/24']);n.setBoundVariable('paddingRight',V['space/24']);}
    }
    for(const frame of page.children.filter(n=>n.type==='FRAME'&&/^[TAWSERP]\d/.test(n.name))){
      screens.push({id:frame.id,name:frame.name});
      const main=frame.children.find(n=>n.name==='Workspace');
      if(main){for(const p of ['paddingLeft','paddingRight','paddingTop','paddingBottom']){main[p]=32;main.setBoundVariable(p,V['space/32']);}
        for(const panel of main.children.filter(n=>n.type==='FRAME'&&n.name!=='Table'&&n.name!=='Row'&&Array.isArray(n.strokes)&&(n.strokes.length||n.fills?.[0]?.boundVariables?.color?.id===V['color/ink'].id))){
          panel.fills=paint('ink');panel.strokes=[];darkCards++;
          for(const child of panel.findAll(n=>n.type==='FRAME'&&n.name!=='Table'&&!insideInstance(n))){if(child.name==='Row'||child.name.startsWith('Cell '))child.fills=paint('ink');}
        }
        const bottom=Math.max(...main.children.map(n=>n.y+n.height));if(frame.name!=='W01 · เข้าสู่ระบบ')frame.resize(1440,Math.max(960,Math.ceil((bottom+32)/24)*24));
      }
      for(const n of [frame,...frame.findAll(n=>'reactions' in n)]){if(n.reactions?.length)connected++;for(const r of n.reactions||[]){for(const a of r.actions||[]){if(a.destinationId&&!await figma.getNodeByIdAsync(a.destinationId))missing.push(a.destinationId);}}}
    }
    for(const button of page.findAllWithCriteria({types:['INSTANCE']})){
      const base=await button.getMainComponentAsync();const bg=background(button);
      if(base?.parent?.name==='CP/Button'&&base.name.startsWith('Type=Primary')&&bg&&bg.r<.08&&bg.g<.08&&bg.b<.08){button.fills=paint('surface');for(const text of button.findAllWithCriteria({types:['TEXT']}))text.fills=paint('ink');}
    }
    for(const t of page.findAllWithCriteria({types:['TEXT']})){
      const bg=background(t);if(bg&&bg.r<.08&&bg.g<.08&&bg.b<.08)t.fills=paint('onAction');
      if(t.characters.startsWith('Spacing 4 /'))t.characters='Spacing 2 / 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64';
      if(t.characters.startsWith('Web 1440 · Mobile 390'))t.characters='Web 1440 · Mobile 390 · targets 48 · body 16/24 · radius 4/8 · focus 2px';
    }
  }
  const luminance=c=>[c.r,c.g,c.b].map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  for(const page of pages){await figma.setCurrentPageAsync(page);for(const t of page.findAllWithCriteria({types:['TEXT']})){let visible=true;for(let p=t;p&&p.type!=='DOCUMENT';p=p.parent)if(p.visible===false||p.opacity<.5)visible=false;if(!visible)continue;const bg=background(t);const fill=Array.isArray(t.fills)&&t.fills.find(p=>p.type==='SOLID');if(!bg||!fill)continue;const fg=resolvePaint(fill,t);if(!fg)continue;const a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);if(ratio<(t.fontSize>=24?3:4.5)){t.fills=paint(luminance(bg)>.3?'ink':'onAction');contrastIssues.push({id:t.id,text:t.characters.slice(0,45),previousRatio:Math.round(ratio*100)/100,fixed:true});}}}
  return {reference:'/Users/a1/Film/project classping/DESIGN.md',contrastIssues,theme:'SLCM monochrome',family,textCount,instances,darkCards,variables:(await figma.variables.getLocalVariablesAsync()).length,screenCount:screens.length,screens,connectedPrototypeNodes:connected,flowStartingPoints:starts,missingPrototypeTargets:missing};
}

async function phase0(){
const page=figma.root.children.find(p=>p.name==='01 · System & product map') || (figma.root.children.length===1 && !figma.root.children[0].children.length ? figma.root.children[0] : figma.createPage()); await figma.setCurrentPageAsync(page); page.name='01 · System & product map';
if(page.children.length) return {existing:page.children.map(n=>({id:n.id,name:n.name}))};
await Promise.all(['Regular','Medium','SemiBold','Bold'].map(style=>figma.loadFontAsync({family:'IBM Plex Sans Thai',style})));
async function createVariableCollection(name,modeNames){const collection=(await figma.variables.getLocalVariableCollectionsAsync()).find(c=>c.name===name)||figma.variables.createVariableCollection(name);const modeIds={};collection.renameMode(collection.modes[0].modeId,modeNames[0]);modeIds[modeNames[0]]=collection.modes[0].modeId;for(let i=1;i<modeNames.length;i++)modeIds[modeNames[i]]=collection.addMode(modeNames[i]);return {collection,modeIds};}
const hex=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
const primitives=await createVariableCollection('CP · Primitives',['Value']);
const semantic=await createVariableCollection('CP · Semantic',['Light']);
const colors={forest:'#123F35',teal:'#176B58',tealHover:'#105443',mint:'#E4F1E9',paper:'#F5F5EF',white:'#FFFFFF',ink:'#1C302A',muted:'#53675F',line:'#CBD7D0',amber:'#825400',amberBg:'#FFF0CB',red:'#AC312A',redBg:'#FCE9E5',blue:'#285A88',blueBg:'#E9F0FA',slate:'#223C34',night:'#10251E',lightText:'#EDF5EE',darkMuted:'#B4CABD',darkLine:'#486154'};
const raw={};const v={};for(const [name,value]of Object.entries(colors)){let x=figma.variables.createVariable('palette/'+name,primitives.collection,'COLOR');x.scopes=[];x.setValueForMode(primitives.collection.defaultModeId,hex(value));x.setVariableCodeSyntax('WEB','var(--cp-palette-'+name+')');raw[name]=x;}
const roles={bg:['paper','night'],surface:['white','slate'],ink:['ink','lightText'],muted:['muted','darkMuted'],border:['line','darkLine'],brand:['forest','mint'],action:['teal','mint'],actionHover:['tealHover','white'],onAction:['white','forest'],selected:['mint','forest'],warning:['amber','amberBg'],warningBg:['amberBg','amber'],danger:['red','redBg'],dangerBg:['redBg','red'],info:['blue','blueBg'],infoBg:['blueBg','blue'],rail:['forest','night'],onRail:['white','lightText']};
for(const[name,values]of Object.entries(roles)){let x=figma.variables.createVariable('color/'+name,semantic.collection,'COLOR');x.scopes=name==='border'?['STROKE_COLOR']:['FRAME_FILL','SHAPE_FILL','TEXT_FILL'];values.slice(0,1).forEach((p,i)=>x.setValueForMode(semantic.modeIds[i?'Dark':'Light'],figma.variables.createVariableAlias(raw[p])));x.setVariableCodeSyntax('WEB','var(--cp-color-'+name+')');x.setVariableCodeSyntax('ANDROID','ClassPingTheme.colors.'+name);x.setVariableCodeSyntax('iOS','ClassPingColors.'+name);v[name]=x;}
for(const n of [0,4,8,12,16,20,24,32,40,48,64]){let x=figma.variables.createVariable('space/'+n,primitives.collection,'FLOAT');x.scopes=['GAP','WIDTH_HEIGHT'];x.setValueForMode(primitives.collection.defaultModeId,n);x.setVariableCodeSyntax('WEB','var(--cp-space-'+n+')');v['s'+n]=x;}
for(const n of [4,8,12,16,999]){let x=figma.variables.createVariable('radius/'+n,primitives.collection,'FLOAT');x.scopes=['CORNER_RADIUS'];x.setValueForMode(primitives.collection.defaultModeId,n);x.setVariableCodeSyntax('WEB','var(--cp-radius-'+n+')');v['r'+n]=x;}
const paint=k=>[figma.variables.setBoundVariableForPaint({type:'SOLID',color:hex(colors.white)},'color',v[k])];
const styles={};for(const[name,size,style,line]of [['Display',40,'SemiBold',56],['Title',28,'SemiBold',40],['Heading',20,'SemiBold',32],['Body',16,'Regular',26],['Label',14,'Medium',24],['Caption',12,'Regular',20],['Metric',32,'SemiBold',44]]){let s=figma.createTextStyle();s.name='CP/'+name;s.fontName={family:'IBM Plex Sans Thai',style};s.fontSize=size;s.lineHeight={unit:'PIXELS',value:line};styles[name]=s;}
function text(p,str,role='Body',color='ink',w){let n=figma.createText();n.name=str.slice(0,60);n.fontName={family:'IBM Plex Sans Thai',style:'Regular'};n.characters=str;n.fontName=styles[role].fontName;n.fontSize=styles[role].fontSize;n.lineHeight=styles[role].lineHeight;STYLE_JOBS.push(n.setTextStyleIdAsync(styles[role].id));n.fills=paint(color);p.appendChild(n);if(w){n.resize(w,30);n.textAutoResize='HEIGHT';}return n;}
function box(name,w,layout='VERTICAL',color='surface',pad=16,gap=12,parent=page,component=false){let n=component?figma.createComponent():figma.createFrame();n.name=name;n.layoutMode=layout;n.resize(w,60);n.primaryAxisSizingMode=layout==='HORIZONTAL'?'FIXED':'AUTO';n.counterAxisSizingMode=layout==='HORIZONTAL'?'AUTO':'FIXED';n.fills=paint(color);for(const p of ['paddingTop','paddingBottom','paddingLeft','paddingRight']){n[p]=pad;n.setBoundVariable(p,v['s'+pad]);}n.itemSpacing=gap;n.setBoundVariable('itemSpacing',v['s'+gap]);n.cornerRadius=12;n.setBoundVariable('cornerRadius',v.r12);parent.appendChild(n);return n;}
const guide=box('Foundations · Read me',1240,'VERTICAL','bg',40,24);guide.x=0;guide.y=0;
text(guide,'ClassPing · Campus wayfinding','Display');text(guide,'ระบบเช็คชื่อที่ให้คนตรวจสอบและตัดสินใจได้อย่างชัดเจน','Heading');text(guide,'PROPOSED DESIGN · ข้อมูลตัวอย่างสมมติ · ไม่ใช่หน้าจอ production','Label','muted');
text(guide,'Color roles / สีมีหน้าที่','Heading');const swatches=box('Semantic palette',1152,'HORIZONTAL','bg',0,16,guide);for(const k of ['brand','action','selected','warningBg','dangerBg','infoBg']){let c=box(k,176,'VERTICAL',k,16,8,swatches);text(c,k,'Label',['brand','action'].includes(k)?'onAction':'ink');}
text(guide,'Typography / IBM Plex Sans Thai','Heading');for(const role of ['Display','Title','Heading','Body','Label','Caption'])text(guide,role+' · ตรวจสอบการเข้าเรียน อาจารย์และนักศึกษา',role,'ink',1140);
text(guide,'Spacing 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64','Label','muted');text(guide,'Web 1440 · Mobile 390 · targets 48 · body 16/26 · radius 12 · focus 2px','Label','muted');
const main={};let cy=guide.height+100;
function set(name,variants,description,cols=4){let s=figma.combineAsVariants(variants,page);s.name=name;s.description=description;s.x=0;s.y=cy;let maxW=Math.max(...variants.map(n=>n.width)),maxH=Math.max(...variants.map(n=>n.height));variants.forEach((n,i)=>{n.x=24+(i%cols)*(maxW+24);n.y=56+Math.floor(i/cols)*(maxH+24);});s.resize(cols*(maxW+24)+24,Math.ceil(variants.length/cols)*(maxH+24)+56);cy+=s.height+64;main[name]=s;return s;}
let variants=[];for(const type of ['Primary','Secondary','Danger'])for(const state of ['Default','Hover','Focus','Disabled','Loading']){let color=type==='Primary'?(state==='Hover'?'actionHover':'action'):type==='Danger'?'danger':'surface';let b=box('Type='+type+', State='+state,184,'HORIZONTAL',color,12,8,page,true);b.primaryAxisAlignItems='CENTER';b.counterAxisAlignItems='CENTER';b.resize(184,48);b.primaryAxisSizingMode='FIXED';b.cornerRadius=8;b.setBoundVariable('cornerRadius',v.r8);let label=text(b,state==='Loading'?'กำลังบันทึก…':'บันทึก', 'Label',type==='Secondary'?'ink':'onAction');let prop=b.addComponentProperty('Label','TEXT',label.characters);label.componentPropertyReferences={characters:prop};if(type==='Secondary'||state==='Focus'){b.strokes=paint(state==='Focus'?'action':'border');b.strokeWeight=state==='Focus'?2:1;}if(state==='Disabled')b.opacity=.4;variants.push(b);}set('CP/Button',variants,'Primary for the next task. Secondary for alternatives; Danger only for destructive actions. 48px target. Label text property.');
variants=[];for(const[state,label,color,bg]of [['Present','มาเรียน','action','selected'],['Late','มาสาย','warning','warningBg'],['Absent','ขาดเรียน','danger','dangerBg'],['Leave','ลา','info','infoBg'],['Pending','รอตรวจ','warning','warningBg'],['Unseen','ยังไม่เห็น','muted','bg'],['Approved','อนุมัติแล้ว','action','selected'],['Rejected','ไม่อนุมัติ','danger','dangerBg'],['Upcoming','ยังไม่เริ่ม','muted','bg'],['Live','กำลังเรียน','action','selected'],['Ended','จบแล้ว','muted','bg'],['Exam','คาบสอบ','info','infoBg']]){let b=box('Status='+state,120,'HORIZONTAL',bg,4,4,page,true);b.primaryAxisAlignItems='CENTER';b.counterAxisAlignItems='CENTER';b.cornerRadius=4;b.setBoundVariable('cornerRadius',v.r4);text(b,label,'Caption',color);variants.push(b);}set('CP/Status',variants,'Attendance null is Unseen, never Absent. Pending requires human review. Color always paired with words.',6);
variants=[];for(const state of ['Default','Focus','Error','Disabled','Filled']){let f=box('State='+state,280,'VERTICAL','surface',12,4,page,true);let l=text(f,'ชื่อช่องข้อมูล','Label');let value=text(f,state==='Filled'?'CS101':'กรอกข้อมูล','Body',state==='Filled'?'ink':'muted');const lp=f.addComponentProperty('Label','TEXT',l.characters);l.componentPropertyReferences={characters:lp};const vp=f.addComponentProperty('Value','TEXT',value.characters);value.componentPropertyReferences={characters:vp};f.strokes=paint(state==='Error'?'danger':state==='Focus'?'action':'border');f.strokeWeight=state==='Focus'?2:1;if(state==='Error')text(f,'ตรวจสอบข้อมูลแล้วลองใหม่','Caption','danger');if(state==='Disabled')f.opacity=.4;variants.push(f);}set('CP/Field',variants,'Persistent visible labels. Error text next to input; do not rely on placeholder. Use native pickers for dates, times and selects.',3);
variants=[];for(const state of ['Default','Active','Disabled']){let n=box('State='+state,160,'HORIZONTAL',state==='Active'?'selected':'surface',12,8,page,true);n.resize(160,48);n.primaryAxisSizingMode='FIXED';text(n,'เช็คชื่อ','Label',state==='Active'?'action':'muted');if(state==='Disabled')n.opacity=.4;variants.push(n);}set('CP/Tab',variants,'Course-level navigation. Active has a filled surface and weight, not color alone.',3);
variants=[];for(const[tone,title,body]of [['Warning','รออาจารย์ตรวจ','ระบบยังไม่ยืนยันตัวบุคคล'],['Error','โหลดข้อมูลไม่สำเร็จ','ตรวจการเชื่อมต่อแล้วลองใหม่'],['Success','บันทึกแล้ว','แสดงผลหลัง API ตอบสำเร็จ'],['Info','ข้อมูลตัวอย่างสมมติ','ไม่ใช่ข้อมูลผู้ใช้หรือผลการใช้งานจริง']]){let b=box('Tone='+tone,480,'VERTICAL',tone==='Error'?'dangerBg':tone==='Warning'?'warningBg':tone==='Success'?'selected':'infoBg',16,4,page,true);let l=text(b,title,'Label',tone==='Error'?'danger':tone==='Warning'?'warning':tone==='Success'?'action':'info');text(b,body,'Body','ink',448);l.componentPropertyReferences={characters:b.addComponentProperty('Title','TEXT',title)};variants.push(b);}set('CP/Notice',variants,'Persistent feedback. Retry belongs with failed content. OCR failed is warning, not rejected leave.',2);
variants=[];for(const state of ['Available','Missing','Expired']){let n=box('State='+state,104,'VERTICAL','bg',12,8,page,true);n.resize(104,104);n.primaryAxisSizingMode='FIXED';n.primaryAxisAlignItems='CENTER';n.counterAxisAlignItems='CENTER';text(n,state==='Available'?'ภาพตัวอย่าง':state==='Expired'?'รูปหมดอายุ':'ไม่มีรูป','Caption','muted');variants.push(n);}set('CP/Evidence',variants,'Design uses labeled image placeholders intentionally: no real biometric data supplied. Production must display actual signed image URL and recover on expiration.',3);
const row=box('CP/Table row',1040,'HORIZONTAL','surface',16,24,page,true);row.x=0;row.y=cy;row.counterAxisAlignItems='CENTER';for(const [str,w]of [['66110001',160],['นักศึกษาตัวอย่าง ก',260],['09:04',120],['มาเรียน',120],['แก้สถานะ',160]])text(row,str,'Body','ink',w);row.description='Responsive data row; preserve evidence, student code, first seen, status, updater and allowed action.';main['CP/Table row']=row;
const specimen=box('Component state review',1240,'VERTICAL','bg',40,24,page);specimen.x=1500;specimen.y=0;text(specimen,'Component states','Title');for(const name of Object.keys(main)){text(specimen,name,'Heading');let r=box(name+' specimens',1152,'HORIZONTAL','bg',0,12,specimen);let node=main[name];let list=node.type==='COMPONENT_SET'?node.children.slice(0,name==='CP/Notice'?2:3):[node];for(const c of list)r.appendChild(c.createInstance());}
const pages={foundation:page.id};for(const name of ['02 · Teacher & admin','03 · Student & responsive']){let p=figma.root.children.find(p=>p.name===name)||figma.createPage();p.name=name;pages[name]=p.id;}
return {pages,collections:[primitives.collection.id,semantic.collection.id],variables:(await figma.variables.getLocalVariablesAsync()).map(n=>({id:n.id,name:n.name})),styles:Object.fromEntries(Object.entries(styles).map(([k,s])=>[k,s.id])),components:Object.fromEntries(Object.entries(main).map(([k,n])=>[k,{id:n.id,children:n.type==='COMPONENT_SET'?n.children.map(c=>({id:c.id,name:c.name})):[]} ])),reviewFrame:specimen.id,foundationFrame:guide.id,totalNodes:page.findAll().length};

}
async function phase1(){
const page=figma.root.children.find(p=>p.name==='02 · Teacher & admin');await figma.setCurrentPageAsync(page);
if(page.children.length)return {existing:page.children.map(n=>({id:n.id,name:n.name}))};
await Promise.all(['Regular','Medium','SemiBold','Bold'].map(style=>figma.loadFontAsync({family:'IBM Plex Sans Thai',style})));
const vars=await figma.variables.getLocalVariablesAsync();const V=Object.fromEntries(vars.map(v=>[v.name,v]));const ST=Object.fromEntries((await figma.getLocalTextStylesAsync()).map(s=>[s.name.replace('CP/',''),s]));
for(const [name,size,style,line]of [['Display',40,'SemiBold',56],['Title',28,'SemiBold',40],['Heading',20,'SemiBold',32],['Body',16,'Regular',26],['Label',14,'Medium',24],['Caption',12,'Regular',20],['Metric',32,'SemiBold',44]]){if(!ST[name]){let t=figma.createTextStyle();t.name='CP/'+name;t.fontName={family:'IBM Plex Sans Thai',style};t.fontSize=size;t.lineHeight={unit:'PIXELS',value:line};ST[name]=t;}}
const LIB=figma.root.children.find(p=>p.name==='01 · System & product map');const C=Object.fromEntries(LIB.children.filter(n=>n.type==='COMPONENT'||n.type==='COMPONENT_SET').map(n=>[n.name,n]));
const P=k=>[figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:1,g:1,b:1}},'color',V['color/'+k])];
function fill(n,k){n.fills=P(k);}
function bind(n,prop,value,type='space'){n[prop]=value;const v=V[type+'/'+value];if(v)n.setBoundVariable(prop,v);}
function B(parent,name,w,dir='VERTICAL',bg='surface',pad=0,gap=16){const n=figma.createFrame();n.name=name;n.layoutMode=dir;n.resize(w,20);n.primaryAxisSizingMode=dir==='HORIZONTAL'?'FIXED':'AUTO';n.counterAxisSizingMode=dir==='HORIZONTAL'?'AUTO':'FIXED';fill(n,bg);for(const p of ['paddingTop','paddingRight','paddingBottom','paddingLeft'])bind(n,p,pad);bind(n,'itemSpacing',gap);parent.appendChild(n);return n;}
function T(parent,str,role='Body',color='ink',w){let n=figma.createText();n.name=str.slice(0,60);n.fontName={family:'IBM Plex Sans Thai',style:'Regular'};n.characters=str;n.fontName=ST[role].fontName;n.fontSize=ST[role].fontSize;n.lineHeight=ST[role].lineHeight;STYLE_JOBS.push(n.setTextStyleIdAsync(ST[role].id));n.fills=P(color);parent.appendChild(n);if(w){n.resize(w,26);n.textAutoResize='HEIGHT';}return n;}
function H(p,title,sub,w){T(p,title,'Title','ink',w);if(sub)T(p,sub,'Body','muted',w);}
function R(p,w,g=12,bg='surface',pad=0){return B(p,'Row',w,'HORIZONTAL',bg,pad,g);}
function comp(parent,name,variant){let set=C[name];let base=set.type==='COMPONENT'?set:set.children.find(n=>n.name===variant);if(!base)throw Error('Missing '+name+' '+variant);let i=base.createInstance();parent.appendChild(i);return i;}
function change(i,key,value){let k=Object.keys(i.componentProperties).find(k=>k.startsWith(key+'#'));if(k)i.setProperties({[k]:value});}
function btn(p,label,type='Primary',state='Default',w=184){let i=comp(p,'CP/Button','Type='+type+', State='+state);change(i,'Label',label);i.resize(w,48);return i;}
function badge(p,status){return comp(p,'CP/Status','Status='+status);}
function field(p,label,value,w=320,state='Filled'){let i=comp(p,'CP/Field','State='+state);change(i,'Label',label);change(i,'Value',value);i.resize(w,i.height);for(const t of i.findAllWithCriteria({types:['TEXT']})){t.resize(w-24,t.height);t.textAutoResize='HEIGHT';t.layoutSizingHorizontal='FILL';}i.primaryAxisSizingMode='AUTO';return i;}
function evidence(p,state='Available',w=104){let i=comp(p,'CP/Evidence','State='+state);i.resize(w,w);return i;}
function notice(p,title,body,tone='Info',w=1128){let i=comp(p,'CP/Notice','Tone='+tone);change(i,'Title',title);i.resize(w,i.height);let texts=i.findAllWithCriteria({types:['TEXT']});if(texts[1]){texts[1].characters=body;texts[1].resize(w-32,26);texts[1].textAutoResize='HEIGHT';texts[1].layoutSizingHorizontal='FILL';}if(texts[0]){texts[0].resize(w-32,texts[0].height);texts[0].textAutoResize='HEIGHT';texts[0].layoutSizingHorizontal='FILL';}i.primaryAxisSizingMode='AUTO';return i;}
function panel(p,title,w=1128){let n=B(p,title,w,'VERTICAL','surface',24,16);bind(n,'cornerRadius',12,'radius');n.strokes=P('border');T(n,title,'Heading');return n;}
function table(p,headers,rows,widths,w=1128){let f=B(p,'Table',w,'VERTICAL','surface',0,0);f.strokes=P('border');bind(f,'cornerRadius',12,'radius');let head=R(f,w,0,'bg',16);headers.forEach((v,i)=>T(head,v,'Label','muted',widths[i]));for(const row of rows){let r=R(f,w,0,'surface',16);r.counterAxisAlignItems='CENTER';for(let i=0;i<row.length;i++){let cell=B(r,'Cell '+headers[i],widths[i],'VERTICAL','surface',0,4);let val=row[i];if(typeof val==='object'){if(val.badge)badge(cell,val.badge);if(val.text)T(cell,val.text,'Caption','muted',widths[i]-8);if(val.button)btn(cell,val.button,'Secondary','Default',Math.min(widths[i]-8,160));if(val.photo)evidence(cell,'Available',48);}else T(cell,val,'Body','ink',widths[i]-8);}let line=figma.createRectangle();line.name='Divider';line.resize(w,1);fill(line,'bg');f.appendChild(line);}return f;}
function shell(name,index,title,sub,{tab=null,admin=false,height=1000}={}){const f=B(page,name,1440,'HORIZONTAL','bg',0,0);f.primaryAxisSizingMode='FIXED';f.resize(1440,height);f.x=(index%3)*1520;f.y=Math.floor(index/3)*1600;f.clipsContent=true;const nav=B(f,'Navigation',232,'VERTICAL','rail',24,24);nav.layoutSizingVertical='FILL';T(nav,'ClassPing','Heading','onRail');T(nav,admin?'พื้นที่ผู้ดูแลระบบ':'พื้นที่อาจารย์','Label','onRail');for(const label of admin?['ภาพรวม','ผู้ใช้','ห้องเรียน','รายวิชา','กล้อง','บัญชี']:['รายวิชา','กล้อง','ตรวจใบลา','บัญชี']){let r=R(nav,184,0,label===(admin?'ภาพรวม':'รายวิชา')?'action':'rail',12);T(r,label,'Label','onRail');}T(nav,'DPU · @dpu.ac.th','Caption','onRail',180);const main=B(f,'Workspace',1208,'VERTICAL','bg',40,24);main.layoutSizingVertical='FILL';const meta=R(main,1128,16,'bg');T(meta,admin?'ระบบผู้ดูแล':'รายวิชา / CS101 · กลุ่ม 01','Caption','muted',850);T(meta,'ตัวอย่างสมมติ','Caption','muted');H(main,title,sub,1128);if(tab){let tabs=R(main,1128,8,'bg');for(const label of ['เช็คชื่อ','นักศึกษา','ตารางเรียน','สอบ','เกณฑ์','รายงาน']){let i=comp(tabs,'CP/Tab','State='+(label===tab?'Active':'Default'));i.resize(160,48);i.findOne(n=>n.type==='TEXT').characters=label;}}return {f,main};}
const screens={};const actions=[];
function save(key,s){screens[key]=s.f.id;return s;}

let s=save('courses',shell('T01 · รายวิชา',0,'รายวิชาของฉัน','เลือกวิชาเพื่อจัดการการเข้าเรียนและคาบสอน'));
actions.push({id:btn(s.main,'สร้างรายวิชา').id,to:'createCourse'});
for(const [code,name,section]of [['CS101','การเขียนโปรแกรมเบื้องต้น','01'],['CS202','โครงสร้างข้อมูล','02']]){let r=R(s.main,1128,24,'surface',24);let c=B(r,code,820,'VERTICAL','surface',0,4);T(c,code+' · '+name,'Heading');T(c,'กลุ่มเรียน '+section,'Body','muted');actions.push({id:btn(r,'เปิดรายวิชา','Secondary').id,to:'sessions'});}
notice(s.main,'ข้อมูลในต้นแบบ','รายวิชา รหัส ชื่อ และตัวเลขทั้งหมดใน Figma เป็นข้อมูลตัวอย่างสมมติ');
s=save('createCourse',shell('T02 · สร้างรายวิชา',1,'สร้างรายวิชา','ระบุข้อมูลเพื่อเริ่มจัดการรายวิชา'));
let p=panel(s.main,'ข้อมูลรายวิชา');let r=R(p,1080,24);field(r,'รหัสวิชา','CS101',240);field(r,'ชื่อวิชา','การเขียนโปรแกรมเบื้องต้น',520);field(p,'กลุ่มเรียน (ไม่บังคับ)','01',240);actions.push({id:btn(p,'สร้างรายวิชา').id,to:'students'});btn(p,'ยกเลิก','Secondary');
s=save('sessions',shell('T03 · คาบเรียน',2,'CS101 · การเขียนโปรแกรมเบื้องต้น','กลุ่ม 01',{tab:'เช็คชื่อ'}));
r=R(s.main,1128,16,'bg');btn(r,'วันก่อน','Secondary', 'Default',144);T(r,'วันนี้ · 2 พ.ย. 2569','Heading','ink',750);
table(s.main,['เวลา','ห้อง','ประเภท / สถานะ',''],[['09:00–12:00','ห้อง 301',{badge:'Live',text:'คาบเรียน'},{button:'ดูการเช็คชื่อ'}],['13:00–15:00','ห้อง 402',{badge:'Upcoming',text:'สอบกลางภาค'},{button:'ดูการเช็คชื่อ'}]],[220,200,420,256]);let sessButtons=s.main.findAll(n=>n.type==='INSTANCE'&&n.findOne(t=>t.type==='TEXT'&&t.characters==='ดูการเช็คชื่อ'));actions.push({id:sessButtons[sessButtons.length-1].id,to:'attendance'});
notice(s.main,'เช็คชื่อผ่านกล้องประจำห้อง','กล้องทำงานตามคาบ นักศึกษาไม่ต้องกดเช็คชื่อจากมือถือ');
s=save('attendance',shell('T04 · เช็คชื่อระหว่างคาบ',3,'การเข้าเรียน · ห้อง 301','2 พ.ย. 2569 · 09:00–12:00 · CS101 กลุ่ม 01',{tab:'เช็คชื่อ',height:1440}));
r=R(s.main,1128,16,'bg');badge(r,'Live');T(r,'อัปเดตทุก 5 วินาทีขณะเปิดหน้านี้','Caption','muted',650);actions.push({id:btn(r,'ดูกล้อง','Secondary').id,to:'live'});
r=R(s.main,1128,24,'surface',16);for(const[label,num]of [['มาเรียน','2'],['มาสาย','1'],['ขาด','0'],['ลา','1'],['รอตรวจ','1'],['ยังไม่เห็น','1']]){let c=B(r,label,158,'VERTICAL','surface',0,0);T(c,num,'Metric');T(c,label,'Label','muted');}
p=panel(s.main,'มี 1 รายการที่ต้องตรวจสอบ');notice(p,'ระบบยังไม่ยืนยันตัวบุคคล','ตรวจภาพก่อนยืนยัน เปลี่ยนคน หรือปฏิเสธ','Warning',1080);actions.push({id:btn(p,'ตรวจภาพนักศึกษา').id,to:'review'});
table(s.main,['ภาพ','นักศึกษา','เห็นครั้งแรก','สถานะ','การแก้ไข'],[[{photo:true},'66110001\nนักศึกษาตัวอย่าง ก','09:04',{badge:'Present'},{button:'แก้สถานะ'}],[{photo:true},'66110002\nนักศึกษาตัวอย่าง ข','09:18',{badge:'Late',text:'แก้โดย อาจารย์ตัวอย่าง'},{button:'แก้สถานะ'}],['—','66110003\nนักศึกษาตัวอย่าง ค','—',{badge:'Leave'},{button:'แก้สถานะ'}],['—','66110004\nยังไม่ลงทะเบียนใบหน้า','—',{badge:'Unseen'},{button:'แก้สถานะ'}]],[104,336,176,240,240]);
T(s.main,'อีก 1 มาเรียน และ 1 รอตรวจ · ตารางแสดงตัวอย่างบางส่วนของข้อมูล 6 คน','Caption','muted');
s=save('review',shell('T05 · ตรวจผลใบหน้า',4,'ตรวจสอบผลที่ระบบไม่แน่ใจ','2 พ.ย. 2569 · ห้อง 301 · CS101',{tab:'เช็คชื่อ'}));
p=panel(s.main,'ระบบคาดว่าเป็นนักศึกษาคนนี้');r=R(p,1080,32);evidence(r,'Available',176);let info=B(r,'Candidate identity',840,'VERTICAL','surface',0,12);T(info,'66110005 · นักศึกษาตัวอย่าง จ','Heading');T(info,'พบเมื่อ 09:12 · ความเหมือน 72% (ค่าตัวอย่าง)','Body','muted');T(info,'ความเหมือนเป็นค่าจากโมเดล ไม่ใช่การยืนยันตัวตน','Body','muted');r=R(p,1080,16);actions.push({id:btn(r,'ยืนยันว่าใช่').id,to:'reviewDone'});actions.push({id:btn(r,'เปลี่ยนเป็นคนอื่น','Secondary').id,to:'reassign'});actions.push({id:btn(r,'ไม่ใช่นักศึกษาวิชานี้','Danger','Default',240).id,to:'rejectFace'});
T(s.main,'รายการไม่ตรงกับใครในวิชา','Heading');r=R(s.main,1128,16,'bg');evidence(r);T(r,'09:16 · เก็บ 7 วันแล้วลบอัตโนมัติ','Body','muted');
s=save('reassign',shell('T06 · เปลี่ยนคน',5,'ระบุนักศึกษาที่ถูกต้อง','เลือกได้เฉพาะนักศึกษาที่ยังไม่ถูกบันทึกในคาบนี้',{tab:'เช็คชื่อ'}));p=panel(s.main,'เปลี่ยนผลการระบุบุคคล');r=R(p,1080,32);evidence(r,'Available',176);let col=B(r,'Reassign',840);field(col,'นักศึกษาที่ยังไม่เห็น','66110006 · นักศึกษาตัวอย่าง ฉ',640);T(col,'ไม่มีรายชื่อให้เลือก → ปิดปุ่มเปลี่ยนคน','Caption','muted');actions.push({id:btn(col,'บันทึกคนที่ถูกต้อง').id,to:'reviewDone'});btn(col,'ยกเลิก','Secondary');
s=save('reviewDone',shell('T07 · ตรวจสำเร็จ',6,'บันทึกผลตรวจแล้ว','กลับไปตรวจรายการถัดไปหรือดูรายชื่อทั้งหมด',{tab:'เช็คชื่อ'}));notice(s.main,'ยืนยันสำเร็จ','สถานะคำนวณจากเวลาที่กล้องเห็นและเกณฑ์ของคาบ หลัง API ตอบสำเร็จ','Success');table(s.main,['นักศึกษา','เวลา','สถานะ','ที่มา'],[['66110005 · นักศึกษาตัวอย่าง จ','09:12',{badge:'Present'},'แก้โดย อาจารย์ตัวอย่าง']],[480,160,160,296]);actions.push({id:btn(s.main,'กลับการเช็คชื่อ').id,to:'attendance'});
s=save('rejectFace',shell('T08 · ปฏิเสธผลใบหน้า',7,'ยืนยันการปฏิเสธผลระบุบุคคล','รูปนี้จะไม่ถูกนับเป็นของ 66110005',{tab:'เช็คชื่อ'}));p=panel(s.main,'ไม่ใช่นักศึกษาวิชานี้ใช่ไหม');evidence(p);T(p,'การปฏิเสธรูปไม่ใช่การสั่งให้นักศึกษาขาดเรียน','Body');actions.push({id:btn(p,'ยืนยันไม่ใช่','Danger').id,to:'attendance'});btn(p,'กลับไปตรวจ','Secondary');
s=save('editStatus',shell('T09 · แก้สถานะ',8,'แก้ไขสถานะการเข้าเรียน','66110002 · นักศึกษาตัวอย่าง ข',{tab:'เช็คชื่อ'}));p=panel(s.main,'สถานะที่อาจารย์แก้ได้');field(p,'สถานะ','มาเรียน / มาสาย / ขาดเรียน',600);T(p,'สถานะลาเกิดจากการอนุมัติใบลา · รอตรวจใช้ flow ตรวจภาพ','Body','muted');actions.push({id:btn(p,'บันทึกสถานะ').id,to:'reviewDone'});btn(p,'ยกเลิก','Secondary');
return {screens,actions,frames:page.children.filter(n=>n.type==='FRAME').map(n=>({id:n.id,name:n.name,width:n.width,height:n.height})),instances:page.findAllWithCriteria({types:['INSTANCE']}).length,textNodes:page.findAllWithCriteria({types:['TEXT']}).length};

}
async function phase2(){
const page=figma.root.children.find(p=>p.name==='02 · Teacher & admin');await figma.setCurrentPageAsync(page);
const partial=page.children.find(n=>n.name==='T10 · นักศึกษา');if(partial&&!partial.findOne(n=>n.type==='FRAME'&&n.name==='Workspace')){partial.remove();for(const n of page.children.filter(n=>n.name==='Navigation'||(n.type==='TEXT'&&n.characters==='ClassPing')))n.remove();}else if(partial)return {existing:true};
await Promise.all(['Regular','Medium','SemiBold','Bold'].map(style=>figma.loadFontAsync({family:'IBM Plex Sans Thai',style})));
const vars=await figma.variables.getLocalVariablesAsync();const V=Object.fromEntries(vars.map(v=>[v.name,v]));const ST=Object.fromEntries((await figma.getLocalTextStylesAsync()).map(s=>[s.name.replace('CP/',''),s]));
for(const [name,size,style,line]of [['Display',40,'SemiBold',56],['Title',28,'SemiBold',40],['Heading',20,'SemiBold',32],['Body',16,'Regular',26],['Label',14,'Medium',24],['Caption',12,'Regular',20],['Metric',32,'SemiBold',44]]){if(!ST[name]){let t=figma.createTextStyle();t.name='CP/'+name;t.fontName={family:'IBM Plex Sans Thai',style};t.fontSize=size;t.lineHeight={unit:'PIXELS',value:line};ST[name]=t;}}
const LIB=figma.root.children.find(p=>p.name==='01 · System & product map');const C=Object.fromEntries(LIB.children.filter(n=>n.type==='COMPONENT'||n.type==='COMPONENT_SET').map(n=>[n.name,n]));
const P=k=>[figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:1,g:1,b:1}},'color',V['color/'+k])];
function fill(n,k){n.fills=P(k);}
function bind(n,prop,value,type='space'){n[prop]=value;const v=V[type+'/'+value];if(v)n.setBoundVariable(prop,v);}
function B(parent,name,w,dir='VERTICAL',bg='surface',pad=0,gap=16){const n=figma.createFrame();n.name=name;n.layoutMode=dir;n.resize(w,20);n.primaryAxisSizingMode=dir==='HORIZONTAL'?'FIXED':'AUTO';n.counterAxisSizingMode=dir==='HORIZONTAL'?'AUTO':'FIXED';fill(n,bg);for(const p of ['paddingTop','paddingRight','paddingBottom','paddingLeft'])bind(n,p,pad);bind(n,'itemSpacing',gap);parent.appendChild(n);return n;}
function T(parent,str,role='Body',color='ink',w){let n=figma.createText();n.name=str.slice(0,60);n.fontName={family:'IBM Plex Sans Thai',style:'Regular'};n.characters=str;n.fontName=ST[role].fontName;n.fontSize=ST[role].fontSize;n.lineHeight=ST[role].lineHeight;STYLE_JOBS.push(n.setTextStyleIdAsync(ST[role].id));n.fills=P(color);parent.appendChild(n);if(w){n.resize(w,26);n.textAutoResize='HEIGHT';}return n;}
function H(p,title,sub,w){T(p,title,'Title','ink',w);if(sub)T(p,sub,'Body','muted',w);}
function R(p,w,g=12,bg='surface',pad=0){return B(p,'Row',w,'HORIZONTAL',bg,pad,g);}
function comp(parent,name,variant){let set=C[name];let base=set.type==='COMPONENT'?set:set.children.find(n=>n.name===variant);if(!base)throw Error('Missing '+name+' '+variant);let i=base.createInstance();parent.appendChild(i);return i;}
function change(i,key,value){let k=Object.keys(i.componentProperties).find(k=>k.startsWith(key+'#'));if(k)i.setProperties({[k]:value});}
function btn(p,label,type='Primary',state='Default',w=184){let i=comp(p,'CP/Button','Type='+type+', State='+state);change(i,'Label',label);i.resize(w,48);return i;}
function badge(p,status){return comp(p,'CP/Status','Status='+status);}
function field(p,label,value,w=320,state='Filled'){let i=comp(p,'CP/Field','State='+state);change(i,'Label',label);change(i,'Value',value);i.resize(w,i.height);for(const t of i.findAllWithCriteria({types:['TEXT']})){t.resize(w-24,t.height);t.textAutoResize='HEIGHT';t.layoutSizingHorizontal='FILL';}i.primaryAxisSizingMode='AUTO';return i;}
function evidence(p,state='Available',w=104){let i=comp(p,'CP/Evidence','State='+state);i.resize(w,w);return i;}
function notice(p,title,body,tone='Info',w=1128){let i=comp(p,'CP/Notice','Tone='+tone);change(i,'Title',title);i.resize(w,i.height);let texts=i.findAllWithCriteria({types:['TEXT']});if(texts[1]){texts[1].characters=body;texts[1].resize(w-32,26);texts[1].textAutoResize='HEIGHT';texts[1].layoutSizingHorizontal='FILL';}if(texts[0]){texts[0].resize(w-32,texts[0].height);texts[0].textAutoResize='HEIGHT';texts[0].layoutSizingHorizontal='FILL';}i.primaryAxisSizingMode='AUTO';return i;}
function panel(p,title,w=1128){let n=B(p,title,w,'VERTICAL','surface',24,16);bind(n,'cornerRadius',12,'radius');n.strokes=P('border');T(n,title,'Heading');return n;}
function table(p,headers,rows,widths,w=1128){let f=B(p,'Table',w,'VERTICAL','surface',0,0);f.strokes=P('border');bind(f,'cornerRadius',12,'radius');let head=R(f,w,0,'bg',16);headers.forEach((v,i)=>T(head,v,'Label','muted',widths[i]));for(const row of rows){let r=R(f,w,0,'surface',16);r.counterAxisAlignItems='CENTER';for(let i=0;i<row.length;i++){let cell=B(r,'Cell '+headers[i],widths[i],'VERTICAL','surface',0,4);let val=row[i];if(typeof val==='object'){if(val.badge)badge(cell,val.badge);if(val.text)T(cell,val.text,'Caption','muted',widths[i]-8);if(val.button)btn(cell,val.button,'Secondary','Default',Math.min(widths[i]-8,160));if(val.photo)evidence(cell,'Available',48);}else T(cell,val,'Body','ink',widths[i]-8);}let line=figma.createRectangle();line.name='Divider';line.resize(w,1);fill(line,'bg');f.appendChild(line);}return f;}
function shell(name,index,title,sub,{tab=null,admin=false,height=1000}={}){const f=B(page,name,1440,'HORIZONTAL','bg',0,0);f.primaryAxisSizingMode='FIXED';f.resize(1440,height);f.x=(index%3)*1520;f.y=Math.floor(index/3)*1600;f.clipsContent=true;const nav=B(f,'Navigation',232,'VERTICAL','rail',24,24);nav.layoutSizingVertical='FILL';T(nav,'ClassPing','Heading','onRail');T(nav,admin?'พื้นที่ผู้ดูแลระบบ':'พื้นที่อาจารย์','Label','onRail');for(const label of admin?['ภาพรวม','ผู้ใช้','ห้องเรียน','รายวิชา','กล้อง','บัญชี']:['รายวิชา','กล้อง','ตรวจใบลา','บัญชี']){let r=R(nav,184,0,label===(admin?'ภาพรวม':'รายวิชา')?'action':'rail',12);T(r,label,'Label','onRail');}T(nav,'DPU · @dpu.ac.th','Caption','onRail',180);const main=B(f,'Workspace',1208,'VERTICAL','bg',40,24);main.layoutSizingVertical='FILL';const meta=R(main,1128,16,'bg');T(meta,admin?'ระบบผู้ดูแล':'รายวิชา / CS101 · กลุ่ม 01','Caption','muted',850);T(meta,'ตัวอย่างสมมติ','Caption','muted');H(main,title,sub,1128);if(tab){let tabs=R(main,1128,8,'bg');for(const label of ['เช็คชื่อ','นักศึกษา','ตารางเรียน','สอบ','เกณฑ์','รายงาน']){let i=comp(tabs,'CP/Tab','State='+(label===tab?'Active':'Default'));i.resize(160,48);i.findOne(n=>n.type==='TEXT').characters=label;}}return {f,main};}
const screens={};const actions=[];
function save(key,s){screens[key]=s.f.id;return s;}

let s=save('students',shell('T10 · นักศึกษา',9,'นักศึกษาในรายวิชา','CS101 · กลุ่ม 01',{tab:'นักศึกษา',height:1120}));
let p=panel(s.main,'เพิ่มนักศึกษาด้วยรหัส');field(p,'รหัสนักศึกษา · เว้นวรรคหรือขึ้นบรรทัดใหม่','66110001  66110002  66110003',1040);btn(p,'เพิ่มนักศึกษา');notice(p,'ผลการเพิ่มรายชื่อ','เพิ่มแล้ว 2 คน · มีอยู่แล้ว 1 คน · ไม่ถูกต้อง: abc','Success',1080);
table(s.main,['ภาพ','รหัส / ชื่อ','ความพร้อม',''],[[{photo:true},'66110001 · นักศึกษาตัวอย่าง ก',{badge:'Present',text:'พร้อมเช็คชื่อ'},{button:'เอาออก'}],['—','66110004 · —',{badge:'Pending',text:'ยังไม่ลงทะเบียนใบหน้า'},{button:'เอาออก'}],['—','66110006 · —',{badge:'Unseen',text:'ยังไม่เคยเข้าสู่ระบบ'},{button:'เอาออก'}]],[104,480,272,240]);
s=save('schedule',shell('T11 · ตารางเรียน',10,'ตารางเรียน','ตารางประจำและข้อยกเว้นรายวัน',{tab:'ตารางเรียน',height:1120}));p=panel(s.main,'ตารางประจำ');let r=R(p,1080,16);field(r,'วัน','จันทร์',240);field(r,'เวลาเริ่ม / จบ','09:00 / 12:00',360);field(r,'ห้อง','301',240);btn(p,'บันทึกตาราง');btn(p,'ลบตารางประจำ','Danger');
table(s.main,['วันที่ / เวลา','ห้อง','สถานะ','การจัดการ'],[['2 พ.ย. · 09:00–12:00','301',{badge:'Live'},{text:'เริ่มแล้ว · แก้ไม่ได้'}],['4 พ.ย. · 09:00–12:00','402',{text:'เปลี่ยนเฉพาะวันนี้'},{button:'เปลี่ยน / คืนค่า'}],['6 พ.ย. · 09:00–12:00','301',{text:'งดสอน'},{button:'ยกเลิกงด'}]],[360,160,280,296]);actions.push({id:btn(s.main,'แก้เฉพาะวัน','Secondary').id,to:'override'});
s=save('override',shell('T12 · เปลี่ยนคาบรายวัน',11,'เปลี่ยนเฉพาะวันที่ 4 พฤศจิกายน','ปรับเวลาและห้องสำหรับคาบนี้',{tab:'ตารางเรียน'}));p=panel(s.main,'เวลาและห้องของวันนั้น');r=R(p,1080,24);field(r,'เริ่ม','10:00',240);field(r,'จบ','12:00',240);field(r,'ห้องเรียน','402',320);actions.push({id:btn(p,'บันทึกการเปลี่ยน').id,to:'schedule'});btn(p,'งดสอนวันนี้','Danger');btn(p,'ใช้ตามตารางเดิม','Secondary');notice(s.main,'คาบที่เริ่มแล้วแก้ไม่ได้','คาบสอบแก้ที่แท็บสอบ ระบบตรวจเวลาทับซ้อนก่อนบันทึก');
s=save('exams',shell('T13 · คาบสอบ',12,'คาบสอบ','ตั้งค่าเวลา ห้อง เกณฑ์ และอาจารย์คุมสอบ',{tab:'สอบ'}));actions.push({id:btn(s.main,'เพิ่มคาบสอบ').id,to:'examForm'});table(s.main,['ชื่อการสอบ','วัน / เวลา','ห้อง','สถานะ',''],[['สอบกลางภาค','9 พ.ย. · 09:00–12:00','301',{badge:'Upcoming'},{button:'แก้คาบสอบ'}],['สอบปฏิบัติ','2 พ.ย. · 13:00–15:00','402',{badge:'Live'},{button:'เปลี่ยนผู้คุม'}]],[240,300,128,180,248]);notice(s.main,'เมื่อกล้องเริ่มเช็คชื่อ','แก้ได้เฉพาะรายชื่ออาจารย์คุมสอบ ไม่สามารถแก้เวลา ห้อง หรือเกณฑ์ได้');
s=save('examForm',shell('T14 · แบบฟอร์มสอบ',13,'เพิ่มคาบสอบ','ค่าเริ่มต้นของเกณฑ์อ้างอิงจากรายวิชา',{tab:'สอบ',height:1120}));p=panel(s.main,'ข้อมูลการสอบ');field(p,'ชื่อการสอบ','สอบกลางภาค',1040);r=R(p,1080,24);field(r,'วันที่','9 พ.ย. 2569',320);field(r,'เริ่ม / จบ','09:00 / 12:00',320);field(r,'ห้อง','301',320);r=R(p,1080,24);field(r,'สายหลัง (นาที)','15',320);field(r,'ตัดขาด','นับขาดเมื่อหมดคาบ',480);field(p,'อาจารย์คุมสอบ · เลือกได้หลายคน','อาจารย์ตัวอย่าง ก / อาจารย์ตัวอย่าง ข',1040);actions.push({id:btn(p,'บันทึกคาบสอบ').id,to:'examConflict'});btn(p,'ยกเลิก','Secondary');
s=save('examConflict',shell('T15 · สอบทับคาบเรียน',14,'คาบสอบทับคาบเรียนของวิชานี้','ระบบต้องได้รับการยืนยันก่อนแทนที่คาบเรียน',{tab:'สอบ'}));notice(s.main,'ยืนยันให้คาบสอบแทนคาบเรียนหรือไม่','9 พ.ย. 09:00–12:00 · ห้อง 301 · CS101','Warning');actions.push({id:btn(s.main,'ยืนยันแทนคาบเรียน','Primary','Default',240).id,to:'exams'});btn(s.main,'กลับไปแก้','Secondary');
s=save('rules',shell('T16 · เกณฑ์',15,'เกณฑ์การเช็คชื่อ','นับจากเวลาเริ่มคาบ · CS101',{tab:'เกณฑ์',height:1120}));p=panel(s.main,'สายและขาด');field(p,'สายหลัง (นาที) · 0–240','15',400);field(p,'ตัดขาด','นับขาดตอนหมดคาบ / ระบุนาที',640);T(p,'ตัวอย่างคาบ 09:00: ก่อนครบ 16 นาที = มาเรียน, ตั้งแต่ 09:16 = สาย','Body','muted',1040);p=panel(s.main,'เกณฑ์เวลานอกห้อง');field(p,'ออกนอกห้องรวมเกิน (นาที) · 1–240','15',640);notice(p,'ขอบเขต implementation','ตั้งค่าเกณฑ์ได้ แต่ยังไม่พบข้อมูลเวลาเข้าออกในหน้าผลเช็คชื่อ จึงไม่แสดงสถิตินี้','Info',1080);btn(s.main,'บันทึกเกณฑ์');
s=save('reports',shell('T17 · รายงาน',16,'รายงานการเข้าเรียน','ตัวเลขตัวอย่าง: 6 คน · 1 คาบ · ข้อมูลชุดเดียวกับหน้าเช็คชื่อ',{tab:'รายงาน',height:1280}));r=R(s.main,1128,16,'bg');btn(r,'ส่งออก CSV','Secondary');btn(r,'ส่งออก PDF');
p=panel(s.main,'เงื่อนไขรายงาน');r=R(p,1080,16);field(r,'ประเภทคาบ','ทั้งหมด',240);field(r,'คาบ','2 พ.ย. 09:00',280);field(r,'ตั้งแต่ / ถึง','2 พ.ย. / 2 พ.ย.',320);r=R(p,1080,16);field(r,'รหัสนักศึกษา','ทั้งหมด',320);btn(r,'ใช้ตัวกรอง');btn(r,'ล้างตัวกรอง','Secondary');
notice(s.main,'อัตราเข้าเรียน 80% · ค่าตัวอย่าง','(มา 2 + สาย 1 + ลา 1) / 5 · รอตรวจ 1 รวมในตัวหาร; ยังไม่บันทึก 1 ไม่รวม ตามข้อมูลตัวอย่าง');
table(s.main,['นักศึกษา','มา','สาย','ขาด','ลา','รอตรวจ','อัตรา'],[['66110001 · ตัวอย่าง ก','1','0','0','0','0','100%'],['66110002 · ตัวอย่าง ข','0','1','0','0','0','100%'],['66110003 · ตัวอย่าง ค','0','0','0','1','0','100%'],['66110004 · ตัวอย่าง ง','0','0','0','0','0','0%'],['66110005 · ตัวอย่าง จ','0','0','0','0','1','0%'],['66110006 · ตัวอย่าง ฉ','1','0','0','0','0','100%']],[376,112,112,112,112,128,144]);T(s.main,'สรุปรายคาบ: 2 พ.ย. · คาบเรียน · ห้อง 301 · มา 2 สาย 1 ขาด 0 ลา 1 รอตรวจ 1','Label','muted');
s=save('leaveReview',shell('T18 · ตรวจใบลา',17,'ตรวจคำขอลา','พิจารณาข้อมูลคาบ เหตุผล ข้อความ OCR และหลักฐาน',{height:1120}));p=panel(s.main,'66110003 · นักศึกษาตัวอย่าง ค');badge(p,'Pending');T(p,'CS101 · 2 พ.ย. 2569 · 09:00–12:00 · ห้อง 301','Heading');T(p,'เหตุผล: มีนัดพบแพทย์ตามใบนัด','Body');field(p,'หลักฐานแนบ','ใบนัดตัวอย่าง.jpg · เปิดหลักฐาน',1040);notice(p,'OCR อ่านข้อความแล้ว','ข้อความตัวอย่าง: ใบนัด · วันที่ 2 พฤศจิกายน 2569 · OCR ไม่ยืนยันว่าเอกสารแท้','Info',1080);field(p,'หมายเหตุถึงนักศึกษา (ไม่บังคับ) · ไม่เกิน 1000 ตัวอักษร','ตรวจเอกสารประกอบแล้ว',1040);r=R(p,1080,16);actions.push({id:btn(r,'อนุมัติ').id,to:'leaveReviewed'});actions.push({id:btn(r,'ไม่อนุมัติ','Danger').id,to:'leaveReviewed'});
s=save('leaveReviewed',shell('T19 · ผลตรวจใบลา',18,'บันทึกผลพิจารณาแล้ว','CS101 · 2 พ.ย. 2569'));notice(s.main,'อนุมัติคำขอลาแล้ว','แสดงเมื่อ API บันทึกสำเร็จเท่านั้น ไม่ถือว่า OCR เป็นผลอนุมัติ','Success');p=panel(s.main,'รายละเอียดผล');badge(p,'Approved');T(p,'66110003 · นักศึกษาตัวอย่าง ค','Heading');T(p,'หมายเหตุ: ตรวจเอกสารประกอบแล้ว','Body');actions.push({id:btn(p,'กลับรายการคำขอลา','Secondary').id,to:'leaveReview'});
s=save('cameras',shell('T20 · กล้องตามคาบ',19,'กล้องหน้าห้อง','เลือกวันที่เพื่อดูคาบที่มีสิทธิ์รับชม'));field(s.main,'วันที่','2 พ.ย. 2569',400);table(s.main,['คาบ / ห้อง','เวลา','กล้อง',''],[['CS101 · ห้อง 301','09:00–12:00',{badge:'Live',text:'กำลังเปิดกล้อง'},{button:'ดูสด'}],['CS202 · ห้อง 402','08:00–09:00',{badge:'Ended'},{button:'ดูบันทึก'}],['คาบสอบ · ห้อง 501','13:00–15:00',{text:'ห้องนี้ยังไม่มีกล้อง'},'—']],[400,240,240,216]);
s=save('live',shell('T21 · กล้องสด',20,'กล้องสด · CS101 · ห้อง 301','2 พ.ย. 2569 · 09:00–12:00 · ไม่มีเสียง',{height:1120}));r=R(s.main,1128,24,'bg');p=B(r,'Live video · unavailable state',780,'VERTICAL','rail',32,24);p.resize(780,438);p.primaryAxisSizingMode='FIXED';p.primaryAxisAlignItems='CENTER';T(p,'ภาพหลุด กำลังต่อใหม่…','Heading','onRail',700);T(p,'แสดงสถานะจากการเชื่อมต่อจริง ไม่แทนด้วยภาพกล้องปลอม','Body','onRail',700);let side=B(r,'People in frame',324,'VERTICAL','surface',16,16);T(side,'คนในภาพ','Heading');field(side,'แสดงกรอบ','เปิด',280);T(side,'ยังไม่เห็นใครในภาพ','Body','muted',280);T(s.main,'ดูสดได้เฉพาะผู้สอน ผู้คุมสอบที่ได้รับมอบหมาย และแอดมิน','Body','muted');actions.push({id:btn(s.main,'ดูบันทึก','Secondary').id,to:'recording'});
s=save('recording',shell('T22 · บันทึกย้อนหลัง',21,'บันทึกย้อนหลัง · ห้อง 301','ไฟล์แบ่งตามช่วงที่กล้องเชื่อมต่อ · ไม่มีเสียง'));table(s.main,['ช่วงเวลา','ความยาว','การรับชม','ดาวน์โหลด'],[['09:00–09:45','45 นาที',{button:'เล่นช่วงนี้'},{button:'ดาวน์โหลด'}],['09:48–12:00','132 นาที',{button:'เล่นช่วงนี้'},{button:'ดาวน์โหลด'}]],[320,200,280,296]);notice(s.main,'สิทธิ์ดาวน์โหลด','แสดงเฉพาะอาจารย์เจ้าของวิชาและแอดมิน ผู้คุมสอบที่ไม่ใช่เจ้าของวิชาดูได้อย่างเดียว');T(s.main,'บันทึกทุกครั้งที่เปิดดูหรือดาวน์โหลด · วันที่ลบแสดงจาก expiresOn ของ API','Body','muted',1128);
s=save('account',shell('T23 · บัญชี',22,'บัญชีของฉัน','ข้อมูลจาก /me'));p=panel(s.main,'อาจารย์ตัวอย่าง');T(p,'teacher.example@dpu.ac.th','Body');T(p,'บทบาท: อาจารย์','Body');btn(p,'ออกจากระบบ','Secondary');
s=save('admin',shell('A01 · ภาพรวม',23,'ภาพรวมระบบ','จำนวนจากรายการผู้ใช้ วิชา และห้องเรียนที่ระบบมี',{admin:true}));r=R(s.main,1128,24,'surface',24);for(const[label,value]of [['ผู้ใช้','8'],['รายวิชา','2'],['ห้องเรียน','3']]){let c=B(r,label,330);T(c,value,'Metric');T(c,label,'Body','muted');}actions.push({id:btn(s.main,'จัดการผู้ใช้').id,to:'users'});actions.push({id:btn(s.main,'จัดการห้องเรียน','Secondary').id,to:'rooms'});notice(s.main,'ตัวเลขสมมติสำหรับออกแบบ','ไม่ใช่จำนวนผู้ใช้จริงและไม่อ้างการเติบโตของระบบ');
s=save('users',shell('A02 · ผู้ใช้',24,'ผู้ใช้และสิทธิ์','เปลี่ยนบทบาทและรีเซ็ตใบหน้ารายบัญชี',{admin:true}));table(s.main,['ผู้ใช้','อีเมล','บทบาท','ใบหน้า'],[['นักศึกษาตัวอย่าง ก','66110001@dpu.ac.th',{button:'นักศึกษา'},{button:'รีเซ็ตใบหน้า'}],['อาจารย์ตัวอย่าง','teacher.example@dpu.ac.th',{button:'อาจารย์'},'ไม่มีข้อมูลใบหน้า'],['ผู้ดูแลตัวอย่าง','admin.example@dpu.ac.th',{button:'ผู้ดูแลระบบ'},'ไม่มีข้อมูลใบหน้า']],[280,360,240,216]);notice(s.main,'รักษาผู้ดูแลระบบอย่างน้อยหนึ่งคน','หากเปลี่ยนผู้ดูแลคนสุดท้าย API จะปฏิเสธ ต้องแสดง error และคืนค่าบทบาทเดิม','Warning');actions.push({id:btn(s.main,'ตัวอย่างยืนยันรีเซ็ต','Secondary','Default',240).id,to:'resetFace'});
s=save('resetFace',shell('A03 · รีเซ็ตใบหน้า',25,'รีเซ็ตใบหน้าของนักศึกษาตัวอย่าง ก','ต้องยืนยันก่อนลบข้อมูลใบหน้าของ 66110001',{admin:true}));notice(s.main,'นักศึกษาต้องลงทะเบียนใหม่','บันทึกผลหลัง API ตอบสำเร็จ หากล้มเหลวเก็บสถานะเดิม','Warning');actions.push({id:btn(s.main,'ยืนยันรีเซ็ตใบหน้า','Danger','Default',240).id,to:'users'});btn(s.main,'ยกเลิก','Secondary');
s=save('rooms',shell('A04 · ห้องเรียน',26,'ห้องเรียน','ขอบเขตเว็บปัจจุบัน: แสดงรายชื่อและเพิ่มห้อง',{admin:true}));table(s.main,['ชื่อห้อง'],[['ห้อง 301'],['ห้อง 402'],['ห้อง 501']],[1096]);p=panel(s.main,'เพิ่มห้องเรียน');field(p,'ชื่อห้อง · ไม่เกิน 100 ตัวอักษร','ห้อง 601',640);btn(p,'เพิ่มห้อง');notice(s.main,'กล้องประจำห้อง','API มี list camera และออก token แต่เว็บยังไม่มีฟอร์มนี้ จัดเป็นข้อเสนอเพิ่มเติม ไม่แสดงว่าเสร็จแล้ว');
return {screens,actions,frames:page.children.filter(n=>n.type==='FRAME').map(n=>({id:n.id,name:n.name,width:n.width,height:n.height})),instances:page.findAllWithCriteria({types:['INSTANCE']}).length};

}
async function phase3(){
const page=figma.root.children.find(p=>p.name==='03 · Student & responsive');await figma.setCurrentPageAsync(page);
if(page.children.some(n=>n.name==='E08 · หลักฐานไม่ถูกต้อง'))return {existing:true};if(page.children.length){for(const n of [...page.children]){if(/^[SER]\d+ · /.test(n.name)||['Row','App bar','Scroll area'].includes(n.name)||(n.type==='TEXT'&&['9:41','ClassPing','ข้อมูลตัวอย่างสมมติ'].includes(n.characters)))n.remove();}}
await Promise.all(['Regular','Medium','SemiBold','Bold'].map(style=>figma.loadFontAsync({family:'IBM Plex Sans Thai',style})));
const vars=await figma.variables.getLocalVariablesAsync();const V=Object.fromEntries(vars.map(v=>[v.name,v]));const ST=Object.fromEntries((await figma.getLocalTextStylesAsync()).map(s=>[s.name.replace('CP/',''),s]));
for(const [name,size,style,line]of [['Display',40,'SemiBold',56],['Title',28,'SemiBold',40],['Heading',20,'SemiBold',32],['Body',16,'Regular',26],['Label',14,'Medium',24],['Caption',12,'Regular',20],['Metric',32,'SemiBold',44]]){if(!ST[name]){let t=figma.createTextStyle();t.name='CP/'+name;t.fontName={family:'IBM Plex Sans Thai',style};t.fontSize=size;t.lineHeight={unit:'PIXELS',value:line};ST[name]=t;}}
const LIB=figma.root.children.find(p=>p.name==='01 · System & product map');const C=Object.fromEntries(LIB.children.filter(n=>n.type==='COMPONENT'||n.type==='COMPONENT_SET').map(n=>[n.name,n]));
const P=k=>[figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:1,g:1,b:1}},'color',V['color/'+k])];
function fill(n,k){n.fills=P(k);}
function bind(n,prop,value,type='space'){n[prop]=value;const v=V[type+'/'+value];if(v)n.setBoundVariable(prop,v);}
function B(parent,name,w,dir='VERTICAL',bg='surface',pad=0,gap=16){const n=figma.createFrame();n.name=name;n.layoutMode=dir;n.resize(w,20);n.primaryAxisSizingMode=dir==='HORIZONTAL'?'FIXED':'AUTO';n.counterAxisSizingMode=dir==='HORIZONTAL'?'AUTO':'FIXED';fill(n,bg);for(const p of ['paddingTop','paddingRight','paddingBottom','paddingLeft'])bind(n,p,pad);bind(n,'itemSpacing',gap);parent.appendChild(n);return n;}
function T(parent,str,role='Body',color='ink',w){let n=figma.createText();n.name=str.slice(0,60);n.fontName={family:'IBM Plex Sans Thai',style:'Regular'};n.characters=str;n.fontName=ST[role].fontName;n.fontSize=ST[role].fontSize;n.lineHeight=ST[role].lineHeight;STYLE_JOBS.push(n.setTextStyleIdAsync(ST[role].id));n.fills=P(color);parent.appendChild(n);if(w){n.resize(w,26);n.textAutoResize='HEIGHT';}return n;}
function H(p,title,sub,w){T(p,title,'Title','ink',w);if(sub)T(p,sub,'Body','muted',w);}
function R(p,w,g=12,bg='surface',pad=0){return B(p,'Row',w,'HORIZONTAL',bg,pad,g);}
function comp(parent,name,variant){let set=C[name];let base=set.type==='COMPONENT'?set:set.children.find(n=>n.name===variant);if(!base)throw Error('Missing '+name+' '+variant);let i=base.createInstance();parent.appendChild(i);return i;}
function change(i,key,value){let k=Object.keys(i.componentProperties).find(k=>k.startsWith(key+'#'));if(k)i.setProperties({[k]:value});}
function btn(p,label,type='Primary',state='Default',w=184){let i=comp(p,'CP/Button','Type='+type+', State='+state);change(i,'Label',label);i.resize(w,48);return i;}
function badge(p,status){return comp(p,'CP/Status','Status='+status);}
function field(p,label,value,w=320,state='Filled'){let i=comp(p,'CP/Field','State='+state);change(i,'Label',label);change(i,'Value',value);i.resize(w,i.height);for(const t of i.findAllWithCriteria({types:['TEXT']})){t.resize(w-24,t.height);t.textAutoResize='HEIGHT';t.layoutSizingHorizontal='FILL';}i.primaryAxisSizingMode='AUTO';return i;}
function evidence(p,state='Available',w=104){let i=comp(p,'CP/Evidence','State='+state);i.resize(w,w);return i;}
function notice(p,title,body,tone='Info',w=1128){let i=comp(p,'CP/Notice','Tone='+tone);change(i,'Title',title);i.resize(w,i.height);let texts=i.findAllWithCriteria({types:['TEXT']});if(texts[1]){texts[1].characters=body;texts[1].resize(w-32,26);texts[1].textAutoResize='HEIGHT';texts[1].layoutSizingHorizontal='FILL';}if(texts[0]){texts[0].resize(w-32,texts[0].height);texts[0].textAutoResize='HEIGHT';texts[0].layoutSizingHorizontal='FILL';}i.primaryAxisSizingMode='AUTO';return i;}
function panel(p,title,w=1128){let n=B(p,title,w,'VERTICAL','surface',24,16);bind(n,'cornerRadius',12,'radius');n.strokes=P('border');T(n,title,'Heading');return n;}
function table(p,headers,rows,widths,w=1128){let f=B(p,'Table',w,'VERTICAL','surface',0,0);f.strokes=P('border');bind(f,'cornerRadius',12,'radius');let head=R(f,w,0,'bg',16);headers.forEach((v,i)=>T(head,v,'Label','muted',widths[i]));for(const row of rows){let r=R(f,w,0,'surface',16);r.counterAxisAlignItems='CENTER';for(let i=0;i<row.length;i++){let cell=B(r,'Cell '+headers[i],widths[i],'VERTICAL','surface',0,4);let val=row[i];if(typeof val==='object'){if(val.badge)badge(cell,val.badge);if(val.text)T(cell,val.text,'Caption','muted',widths[i]-8);if(val.button)btn(cell,val.button,'Secondary','Default',Math.min(widths[i]-8,160));if(val.photo)evidence(cell,'Available',48);}else T(cell,val,'Body','ink',widths[i]-8);}let line=figma.createRectangle();line.name='Divider';line.resize(w,1);fill(line,'bg');f.appendChild(line);}return f;}
function shell(name,index,title,sub,{tab=null,admin=false,height=1000}={}){const f=B(page,name,1440,'HORIZONTAL','bg',0,0);f.primaryAxisSizingMode='FIXED';f.resize(1440,height);f.x=(index%3)*1520;f.y=Math.floor(index/3)*1600;f.clipsContent=true;const nav=B(f,'Navigation',232,'VERTICAL','rail',24,24);nav.layoutSizingVertical='FILL';T(nav,'ClassPing','Heading','onRail');T(nav,admin?'พื้นที่ผู้ดูแลระบบ':'พื้นที่อาจารย์','Label','onRail');for(const label of admin?['ภาพรวม','ผู้ใช้','ห้องเรียน','รายวิชา','กล้อง','บัญชี']:['รายวิชา','กล้อง','ตรวจใบลา','บัญชี']){let r=R(nav,184,0,label===(admin?'ภาพรวม':'รายวิชา')?'action':'rail',12);T(r,label,'Label','onRail');}T(nav,'DPU · @dpu.ac.th','Caption','onRail',180);const main=B(f,'Workspace',1208,'VERTICAL','bg',40,24);main.layoutSizingVertical='FILL';const meta=R(main,1128,16,'bg');T(meta,admin?'ระบบผู้ดูแล':'รายวิชา / CS101 · กลุ่ม 01','Caption','muted',850);T(meta,'ตัวอย่างสมมติ','Caption','muted');H(main,title,sub,1128);if(tab){let tabs=R(main,1128,8,'bg');for(const label of ['เช็คชื่อ','นักศึกษา','ตารางเรียน','สอบ','เกณฑ์','รายงาน']){let i=comp(tabs,'CP/Tab','State='+(label===tab?'Active':'Default'));i.resize(160,48);i.findOne(n=>n.type==='TEXT').characters=label;}}return {f,main};}
const screens={};const actions=[];
function save(key,s){screens[key]=s.f.id;return s;}

function mobile(name,index,title,sub='',height=844){let f=B(page,name,390,'VERTICAL','bg',0,0);f.primaryAxisSizingMode='FIXED';f.resize(390,height);f.x=(index%5)*470;f.y=Math.floor(index/5)*1060;f.clipsContent=true;let status=R(f,390,0,'surface',16);T(status,'9:41','Label','ink',250);T(status,'ClassPing','Caption','muted');let header=B(f,'App bar',390,'VERTICAL','surface',24,4);T(header,title,'Heading','ink',342);if(sub)T(header,sub,'Caption','muted',342);let scroll=B(f,'Scroll area',390,'VERTICAL','bg',0,0);scroll.primaryAxisSizingMode='FIXED';scroll.layoutSizingVertical='FILL';scroll.clipsContent=true;scroll.overflowDirection='VERTICAL';let content=B(scroll,'Scrollable content',390,'VERTICAL','bg',24,20);let footer=B(f,'Bottom actions',390,'VERTICAL','surface',24,8);let line=figma.createRectangle();line.name='System gesture indicator';line.resize(120,4);fill(line,'muted');let base=R(f,390,0,'surface',12);base.primaryAxisAlignItems='CENTER';base.appendChild(line);return {f,main:content,footer,scroll};}
function mb(s,label,to,type='Primary',state='Default'){const b=btn(s.footer,label,type,state,342);if(to)actions.push({id:b.id,to});return b;}
function mnotice(p,title,body,tone='Info'){return notice(p,title,body,tone,342);}
function mpanel(p,title){return panel(p,title,342);}
let s=save('mobileLogin',mobile('S01 · เข้าสู่ระบบ',0,'ClassPing','ข้อมูลตัวอย่างสมมติ'));
T(s.main,'เช็คชื่อจากห้องเรียน\nดูข้อมูลได้จากมือถือ','Title','ink',342);T(s.main,'ลงทะเบียนใบหน้า ดูสรุปการเข้าเรียน และยื่นคำขอลา','Body','muted',342);T(s.main,'เข้าสู่ระบบด้วยอีเมลมหาวิทยาลัย @dpu.ac.th','Body','ink',342);mb(s,'เข้าสู่ระบบด้วย Google','consent');
s=save('consent',mobile('S02 · ความยินยอม',1,'ยินยอมใช้ข้อมูลใบหน้า','ขั้นตอน 1 จาก 3 · อ่านก่อนตัดสินใจ'));
for(const [title,body]of [['ใช้เพื่ออะไร','ClassPing เก็บรูปหน้าและข้อมูลที่คำนวณจากรูป เพื่อเช็คชื่อผ่านกล้องในห้องเรียนและห้องสอบ และแสดงชื่อบนภาพกล้อง เฉพาะวิชาที่ลงทะเบียน'],['ยืนยันเจ้าของบัญชี','ใช้ภาพบัตรนักศึกษาออนไลน์ อ่านรหัสและเทียบหน้าในบัตรกับคุณ แล้วลบภาพบัตร ไม่เก็บไว้'],['ใครเห็นข้อมูล','คุณ อาจารย์ผู้สอน อาจารย์คุมสอบเฉพาะคาบที่คุม และผู้ดูแลระบบ ข้อมูลใบหน้าเก็บจนจบการศึกษาหรือขอให้ลบ'],['ถอนความยินยอม','แจ้งผู้ดูแลระบบได้ทุกเมื่อ หากไม่ยินยอม อาจารย์เช็คชื่อให้แทน'],['แจ้งเรื่องกล้องวงจรปิด','อัดเฉพาะภาพ ไม่มีเสียง เฉพาะช่วงที่มีคาบ ทุกครั้งที่เปิดดูถูกบันทึก เก็บ 30 วันแล้วลบ ยกเว้นคลิปที่ดาวน์โหลดเป็นหลักฐาน ส่วนนี้เป็นการแจ้ง ไม่ขึ้นกับความยินยอมใบหน้า ขอสำเนาภาพได้ที่ผู้ดูแลระบบ']]){T(s.main,title,'Label','ink',342);T(s.main,body,'Body','muted',342);}mb(s,'ยินยอม','identity');mb(s,'ไม่ยินยอม','declined','Secondary');
s=save('declined',mobile('S03 · ไม่ยินยอม',2,'ยังไม่ลงทะเบียนใบหน้า'));
T(s.main,'กล้องจะยังเช็คชื่อให้คุณไม่ได้','Title','ink',342);T(s.main,'ให้อาจารย์เช็คชื่อแทน หากเปลี่ยนใจ คุณกลับมาให้ความยินยอมได้','Body','muted',342);mb(s,'กลับไปอ่านอีกครั้ง','consent');mb(s,'ออกจากระบบ','mobileLogin','Secondary');
s=save('identity',mobile('S04 · บัตรนักศึกษา',3,'ยืนยันตัวตน','ขั้นตอน 2 จาก 3'));
T(s.main,'ใช้ภาพบัตรนักศึกษาของวันนี้','Title','ink',342);T(s.main,'1. เปิดบัตรออนไลน์ในแอปมหาวิทยาลัย\n2. จับภาพทั้งใบ ให้เห็นรหัส รูป และวันที่\n3. เลือกภาพ แล้วสแกนใบหน้าต่อ','Body','muted',342);let e=evidence(s.main,'Missing',240);T(s.main,'ภาพบัตรใช้ยืนยันครั้งนี้แล้วลบ ไม่เก็บไว้','Caption','muted',342);mb(s,'เลือกภาพบัตร','cameraPermission');mb(s,'ออกจากระบบ','mobileLogin','Secondary');
s=save('cameraPermission',mobile('S05 · ขอใช้กล้อง',4,'อนุญาตใช้กล้อง','ขั้นตอน 3 จาก 3 · ลงทะเบียนใบหน้า'));
T(s.main,'ใช้กล้องหน้าเพื่อลงทะเบียนใบหน้า','Title','ink',342);T(s.main,'ระบบจะตรวจภาพทีละมุมอัตโนมัติ ให้ใบหน้าอยู่ในบริเวณที่กำหนด','Body','muted',342);mb(s,'อนุญาตใช้กล้อง','poseFront');mb(s,'ออกจากระบบ','mobileLogin','Secondary');
for(const [key,title,instruction,step,next]of [['poseFront','หน้าตรง','มองตรงไปที่กล้อง',1,'poseLeft'],['poseLeft','หันซ้าย','หันหน้าไปทางซ้ายเล็กน้อย',2,'poseRight'],['poseRight','หันขวา','หันหน้าไปทางขวาเล็กน้อย',3,'poseUp'],['poseUp','เงยหน้า','เงยหน้าขึ้นเล็กน้อย',4,'poseDown'],['poseDown','ก้มหน้า','ก้มหน้าลงเล็กน้อย',5,'mobileHome']]){let i=5+step-1;s=save(key,mobile('S'+String(6+step-1).padStart(2,'0')+' · '+title,i,'ลงทะเบียนใบหน้า','มุมที่ '+step+' จาก 5'));let r=R(s.main,342,8,'bg');for(let j=1;j<=5;j++){let a=B(r,'Pose '+j,62,'VERTICAL',j<step?'selected':j===step?'action':'surface',4,0);T(a,j<step?'เสร็จ':String(j),'Label',j===step?'onAction':'ink');}let camera=B(s.main,'Camera preview · no biometric photo supplied',342,'VERTICAL','rail',24,12);camera.primaryAxisSizingMode='FIXED';camera.resize(342,280);camera.primaryAxisAlignItems='CENTER';T(camera,'ภาพกล้องหน้า','Heading','onRail',294);T(camera,'ภาพจำลองตำแหน่ง ไม่ใช่ภาพบุคคล','Caption','onRail',294);T(s.main,instruction,'Heading','ink',342);T(s.main,'กำลังสแกนอัตโนมัติ…','Body','muted',342);if(step===1)mb(s,'เปลี่ยนภาพบัตร','identity','Secondary');T(s.footer,'เมื่อระบบตรวจผ่าน จะไปมุมถัดไปอัตโนมัติ','Caption','muted',342);actions.push({id:camera.id,to:next,prototypeOnly:true});}
s=save('mobileHome',mobile('S11 · สรุปการเข้าเรียน',10,'การเข้าเรียน','ข้อมูลตัวอย่างสมมติ'));
T(s.main,'นักศึกษาตัวอย่าง ก','Heading','ink',342);T(s.main,'66110001 · 66110001@dpu.ac.th','Caption','muted',342);mnotice(s.main,'ลงทะเบียนใบหน้าแล้ว','พร้อมใช้เช็คชื่อผ่านกล้องประจำห้อง','Success');let p=mpanel(s.main,'สรุปของฉัน');T(p,'100%','Metric');T(p,'มา 1 · สาย 0 · ขาด 0\nลา 0 · รอตรวจ 0','Body','ink',294);p=mpanel(s.main,'CS101 · กลุ่ม 01');T(p,'การเขียนโปรแกรมเบื้องต้น','Body','ink',294);T(p,'อัตราเข้าเรียน 100% · มา 1 คาบ','Body','muted',294);T(s.main,'ไม่มีปุ่มเช็คชื่อ · กล้องในห้องเรียนบันทึกให้','Caption','muted',342);mb(s,'ยื่นคำขอลา','leaveForm');mb(s,'บัญชีของฉัน','mobileAccount','Secondary');
s=save('leaveForm',mobile('S12 · ยื่นลา',11,'ยื่นคำขอลา','เลือกคาบ ระบุเหตุผล และแนบหลักฐาน'));
field(s.main,'คาบที่ต้องการลา','CS101 · 9 พ.ย. 09:00',342);field(s.main,'เหตุผล · ไม่เกิน 1000 ตัวอักษร','มีนัดพบแพทย์ตามใบนัด',342);field(s.main,'ภาพหลักฐาน · JPG/PNG ≤10 MB','ใบนัดตัวอย่าง.jpg',342);btn(s.main,'เปลี่ยนภาพหลักฐาน','Secondary','Default',342);T(s.main,'ข้อความจาก OCR เป็นข้อมูลช่วยให้อาจารย์ตรวจ ไม่อนุมัติใบลาอัตโนมัติ','Body','muted',342);mb(s,'ส่งคำขอลา','leaveSending');mb(s,'กลับ','mobileHome','Secondary');
s=save('leaveSending',mobile('S13 · กำลังส่งใบลา',12,'กำลังส่งคำขอลา'));
mnotice(s.main,'กำลังส่งหลักฐาน','รอผลจากระบบ ข้อความจะยืนยันเมื่อบันทึกสำเร็จ');mb(s,'กำลังส่ง…',null,'Primary','Loading');T(s.main,'อย่าส่งซ้ำระหว่างกำลังบันทึก','Body','muted',342);actions.push({id:s.main.id,to:'leaveHistory',prototypeOnly:true});
s=save('leaveHistory',mobile('S14 · สถานะใบลา',13,'คำขอลาของฉัน','ข้อมูลตัวอย่างสมมติ'));
p=mpanel(s.main,'CS101 · 9 พ.ย. 09:00');badge(p,'Pending');T(p,'มีนัดพบแพทย์ตามใบนัด','Body','ink',294);T(p,'OCR: อ่านข้อความแล้ว','Caption','muted',294);T(p,'รออาจารย์พิจารณาหลักฐาน','Body','muted',294);p=mpanel(s.main,'CS202 · 28 ต.ค. 09:00');badge(p,'Rejected');T(p,'หมายเหตุ: หลักฐานไม่ตรงกับวันที่ลา','Body','ink',294);mb(s,'ยื่นคำขอลาอีกคาบ','leaveForm');mb(s,'กลับหน้าหลัก','mobileHome','Secondary');
s=save('mobileAccount',mobile('S15 · บัญชี',14,'บัญชีของฉัน'));
T(s.main,'นักศึกษาตัวอย่าง ก','Title','ink',342);T(s.main,'66110001@dpu.ac.th\nรหัสนักศึกษา: 66110001\nบทบาท: นักศึกษา','Body','muted',342);mnotice(s.main,'ลงทะเบียนใบหน้าแล้ว','หากต้องการถอนความยินยอม ให้ติดต่อผู้ดูแลระบบ');mb(s,'กลับหน้าหลัก','mobileHome','Secondary');mb(s,'ออกจากระบบ','mobileLogin','Secondary');
s=save('cardError',mobile('E01 · บัตรไม่ผ่าน',15,'เลือกภาพบัตรใหม่'));
mnotice(s.main,'วันที่ในบัตรไม่ตรงกับวันนี้','เปิดบัตรออนไลน์วันนี้และเลือกภาพใหม่ที่เห็นรหัส รูป และวันที่ชัดเจน','Error');mb(s,'เลือกภาพบัตรใหม่','identity');mb(s,'ออกจากระบบ','mobileLogin','Secondary');
s=save('cameraDenied',mobile('E02 · กล้องถูกปฏิเสธ',16,'เปิดสิทธิ์กล้อง'));
mnotice(s.main,'ยังไม่ได้รับอนุญาตใช้กล้อง','เปิดการตั้งค่าและอนุญาตกล้อง เพื่อกลับมาลงทะเบียนใบหน้าต่อ','Warning');mb(s,'เปิดการตั้งค่า',null);mb(s,'ออกจากระบบ','mobileLogin','Secondary');
s=save('poseRetry',mobile('E03 · สแกนไม่ผ่าน',17,'ลองสแกนใบหน้าอีกครั้ง','เก็บมุมที่ผ่านแล้วไว้'));
mnotice(s.main,'ใบหน้าไม่ชัดเจน','อยู่ในที่มีแสงเพียงพอและหันหน้าตามคำแนะนำ แล้วลองใหม่','Warning');mb(s,'ลองอีกครั้ง','poseLeft');mb(s,'เปลี่ยนภาพบัตร','identity','Secondary');
s=save('ocrFailed',mobile('E04 · OCR ไม่สำเร็จ',18,'ส่งคำขอลาแล้ว'));
mnotice(s.main,'ส่งคำขอสำเร็จ แต่อ่านข้อความไม่ได้','หลักฐานยังถูกส่งให้อาจารย์ตรวจ ไม่ต้องส่งคำขอซ้ำ','Warning');badge(s.main,'Pending');mb(s,'ดูสถานะใบลา','leaveHistory');
s=save('summaryError',mobile('E05 · โหลดสรุปไม่ได้',19,'การเข้าเรียน'));
mnotice(s.main,'โหลดสรุปไม่สำเร็จ','ตรวจการเชื่อมต่อแล้วลองใหม่','Error');mb(s,'ลองใหม่','mobileHome');mb(s,'บัญชีของฉัน','mobileAccount','Secondary');
s=save('mobileWebAttendance',mobile('R01 · เว็บเช็คชื่อบนมือถือ',20,'เช็คชื่อ · CS101','2 พ.ย. 09:00–12:00 · ห้อง 301'));
mnotice(s.main,'รอตรวจ 1 คน','เปิดภาพเพื่อยืนยันผลที่ระบบไม่แน่ใจ','Warning');p=mpanel(s.main,'66110005 · ตัวอย่าง จ');evidence(p);badge(p,'Pending');T(p,'พบเมื่อ 09:12 · ความเหมือน 72%','Body','muted',294);btn(p,'ตรวจภาพ','Primary','Default',294);p=mpanel(s.main,'66110001 · ตัวอย่าง ก');badge(p,'Present');T(p,'พบเมื่อ 09:04','Body','muted',294);btn(p,'แก้สถานะ','Secondary','Default',294);mb(s,'กลับคาบทั้งหมด',null,'Secondary');
s=save('noCourses',mobile('E06 · ไม่มีรายวิชา',21,'การเข้าเรียน'));
T(s.main,'ยังไม่มีรายวิชาที่ลงทะเบียน','Title','ink',342);T(s.main,'เมื่ออาจารย์เพิ่มรหัสนักศึกษาในรายวิชา สรุปจะปรากฏที่นี่','Body','muted',342);mb(s,'บัญชีของฉัน','mobileAccount','Secondary');
s=save('noEligibleLeave',mobile('E07 · ไม่มีคาบยื่นลา',22,'ยื่นคำขอลา'));
T(s.main,'ไม่มีคาบที่ยื่นลาได้','Title','ink',342);T(s.main,'ดูคำขอที่ส่งไปแล้ว หรือกลับหน้าหลัก','Body','muted',342);mb(s,'คำขอลาของฉัน','leaveHistory','Secondary');mb(s,'กลับหน้าหลัก','mobileHome','Secondary');
s=save('leaveValidation',mobile('E08 · หลักฐานไม่ถูกต้อง',23,'ยื่นคำขอลา'));
field(s.main,'คาบที่ลา','CS101 · 9 พ.ย. 09:00',342);field(s.main,'เหตุผล','กรุณาระบุเหตุผล',342,'Error');mnotice(s.main,'ไฟล์หลักฐานใหญ่เกิน 10 MB','เลือกภาพ JPG หรือ PNG ที่มีขนาดเล็กลง','Error');mb(s,'เลือกภาพใหม่','leaveForm','Secondary');mb(s,'ส่งคำขอลา',null,'Primary','Disabled');
return {screens,actions,frames:page.children.filter(n=>n.type==='FRAME').map(n=>({id:n.id,name:n.name,width:n.width,height:n.height})),instances:page.findAllWithCriteria({types:['INSTANCE']}).length};

}
async function phase4(){
const page=figma.root.children.find(p=>p.name==='02 · Teacher & admin');await figma.setCurrentPageAsync(page);
if(page.children.some(n=>n.name==='W01 · เข้าสู่ระบบ'))return {existing:true};
await Promise.all(['Regular','Medium','SemiBold','Bold'].map(style=>figma.loadFontAsync({family:'IBM Plex Sans Thai',style})));
const vars=await figma.variables.getLocalVariablesAsync();const V=Object.fromEntries(vars.map(v=>[v.name,v]));const ST=Object.fromEntries((await figma.getLocalTextStylesAsync()).map(s=>[s.name.replace('CP/',''),s]));
for(const [name,size,style,line]of [['Display',40,'SemiBold',56],['Title',28,'SemiBold',40],['Heading',20,'SemiBold',32],['Body',16,'Regular',26],['Label',14,'Medium',24],['Caption',12,'Regular',20],['Metric',32,'SemiBold',44]]){if(!ST[name]){let t=figma.createTextStyle();t.name='CP/'+name;t.fontName={family:'IBM Plex Sans Thai',style};t.fontSize=size;t.lineHeight={unit:'PIXELS',value:line};ST[name]=t;}}
const LIB=figma.root.children.find(p=>p.name==='01 · System & product map');const C=Object.fromEntries(LIB.children.filter(n=>n.type==='COMPONENT'||n.type==='COMPONENT_SET').map(n=>[n.name,n]));
const P=k=>[figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:1,g:1,b:1}},'color',V['color/'+k])];
function fill(n,k){n.fills=P(k);}
function bind(n,prop,value,type='space'){n[prop]=value;const v=V[type+'/'+value];if(v)n.setBoundVariable(prop,v);}
function B(parent,name,w,dir='VERTICAL',bg='surface',pad=0,gap=16){const n=figma.createFrame();n.name=name;n.layoutMode=dir;n.resize(w,20);n.primaryAxisSizingMode=dir==='HORIZONTAL'?'FIXED':'AUTO';n.counterAxisSizingMode=dir==='HORIZONTAL'?'AUTO':'FIXED';fill(n,bg);for(const p of ['paddingTop','paddingRight','paddingBottom','paddingLeft'])bind(n,p,pad);bind(n,'itemSpacing',gap);parent.appendChild(n);return n;}
function T(parent,str,role='Body',color='ink',w){let n=figma.createText();n.name=str.slice(0,60);n.fontName={family:'IBM Plex Sans Thai',style:'Regular'};n.characters=str;n.fontName=ST[role].fontName;n.fontSize=ST[role].fontSize;n.lineHeight=ST[role].lineHeight;STYLE_JOBS.push(n.setTextStyleIdAsync(ST[role].id));n.fills=P(color);parent.appendChild(n);if(w){n.resize(w,26);n.textAutoResize='HEIGHT';}return n;}
function H(p,title,sub,w){T(p,title,'Title','ink',w);if(sub)T(p,sub,'Body','muted',w);}
function R(p,w,g=12,bg='surface',pad=0){return B(p,'Row',w,'HORIZONTAL',bg,pad,g);}
function comp(parent,name,variant){let set=C[name];let base=set.type==='COMPONENT'?set:set.children.find(n=>n.name===variant);if(!base)throw Error('Missing '+name+' '+variant);let i=base.createInstance();parent.appendChild(i);return i;}
function change(i,key,value){let k=Object.keys(i.componentProperties).find(k=>k.startsWith(key+'#'));if(k)i.setProperties({[k]:value});}
function btn(p,label,type='Primary',state='Default',w=184){let i=comp(p,'CP/Button','Type='+type+', State='+state);change(i,'Label',label);i.resize(w,48);return i;}
function badge(p,status){return comp(p,'CP/Status','Status='+status);}
function field(p,label,value,w=320,state='Filled'){let i=comp(p,'CP/Field','State='+state);change(i,'Label',label);change(i,'Value',value);i.resize(w,i.height);for(const t of i.findAllWithCriteria({types:['TEXT']})){t.resize(w-24,t.height);t.textAutoResize='HEIGHT';t.layoutSizingHorizontal='FILL';}i.primaryAxisSizingMode='AUTO';return i;}
function evidence(p,state='Available',w=104){let i=comp(p,'CP/Evidence','State='+state);i.resize(w,w);return i;}
function notice(p,title,body,tone='Info',w=1128){let i=comp(p,'CP/Notice','Tone='+tone);change(i,'Title',title);i.resize(w,i.height);let texts=i.findAllWithCriteria({types:['TEXT']});if(texts[1]){texts[1].characters=body;texts[1].resize(w-32,26);texts[1].textAutoResize='HEIGHT';texts[1].layoutSizingHorizontal='FILL';}if(texts[0]){texts[0].resize(w-32,texts[0].height);texts[0].textAutoResize='HEIGHT';texts[0].layoutSizingHorizontal='FILL';}i.primaryAxisSizingMode='AUTO';return i;}
function panel(p,title,w=1128){let n=B(p,title,w,'VERTICAL','surface',24,16);bind(n,'cornerRadius',12,'radius');n.strokes=P('border');T(n,title,'Heading');return n;}
function table(p,headers,rows,widths,w=1128){let f=B(p,'Table',w,'VERTICAL','surface',0,0);f.strokes=P('border');bind(f,'cornerRadius',12,'radius');let head=R(f,w,0,'bg',16);headers.forEach((v,i)=>T(head,v,'Label','muted',widths[i]));for(const row of rows){let r=R(f,w,0,'surface',16);r.counterAxisAlignItems='CENTER';for(let i=0;i<row.length;i++){let cell=B(r,'Cell '+headers[i],widths[i],'VERTICAL','surface',0,4);let val=row[i];if(typeof val==='object'){if(val.badge)badge(cell,val.badge);if(val.text)T(cell,val.text,'Caption','muted',widths[i]-8);if(val.button)btn(cell,val.button,'Secondary','Default',Math.min(widths[i]-8,160));if(val.photo)evidence(cell,'Available',48);}else T(cell,val,'Body','ink',widths[i]-8);}let line=figma.createRectangle();line.name='Divider';line.resize(w,1);fill(line,'bg');f.appendChild(line);}return f;}
function shell(name,index,title,sub,{tab=null,admin=false,height=1000}={}){const f=B(page,name,1440,'HORIZONTAL','bg',0,0);f.primaryAxisSizingMode='FIXED';f.resize(1440,height);f.x=(index%3)*1520;f.y=Math.floor(index/3)*1600;f.clipsContent=true;const nav=B(f,'Navigation',232,'VERTICAL','rail',24,24);nav.layoutSizingVertical='FILL';T(nav,'ClassPing','Heading','onRail');T(nav,admin?'พื้นที่ผู้ดูแลระบบ':'พื้นที่อาจารย์','Label','onRail');for(const label of admin?['ภาพรวม','ผู้ใช้','ห้องเรียน','รายวิชา','กล้อง','บัญชี']:['รายวิชา','กล้อง','ตรวจใบลา','บัญชี']){let r=R(nav,184,0,label===(admin?'ภาพรวม':'รายวิชา')?'action':'rail',12);T(r,label,'Label','onRail');}T(nav,'DPU · @dpu.ac.th','Caption','onRail',180);const main=B(f,'Workspace',1208,'VERTICAL','bg',40,24);main.layoutSizingVertical='FILL';const meta=R(main,1128,16,'bg');T(meta,admin?'ระบบผู้ดูแล':'รายวิชา / CS101 · กลุ่ม 01','Caption','muted',850);T(meta,'ตัวอย่างสมมติ','Caption','muted');H(main,title,sub,1128);if(tab){let tabs=R(main,1128,8,'bg');for(const label of ['เช็คชื่อ','นักศึกษา','ตารางเรียน','สอบ','เกณฑ์','รายงาน']){let i=comp(tabs,'CP/Tab','State='+(label===tab?'Active':'Default'));i.resize(160,48);i.findOne(n=>n.type==='TEXT').characters=label;}}return {f,main};}
const screens={};const actions=[];
function save(key,s){screens[key]=s.f.id;return s;}

let s=save('webLogin',shell('W01 · เข้าสู่ระบบ',27,'เข้าสู่ระบบ ClassPing','สำหรับอาจารย์และผู้ดูแลระบบ'));
let p=panel(s.main,'ใช้อีเมลมหาวิทยาลัย');T(p,'เข้าสู่ระบบด้วยบัญชี @dpu.ac.th','Body');actions.push({id:btn(p,'เข้าสู่ระบบด้วย Google','Primary','Default',280).id,to:'courses'});T(p,'นักศึกษาใช้งานผ่านแอปมือถือ','Body','muted');
s=save('webEmpty',shell('W02 · ไม่มีรายวิชา',28,'รายวิชาของฉัน','ยังไม่มีรายวิชา'));T(s.main,'สร้างรายวิชาแรกเพื่อเริ่มเพิ่มนักศึกษาและตารางสอน','Heading','ink',1128);actions.push({id:btn(s.main,'สร้างรายวิชา').id,to:'createCourse'});
s=save('webLoading',shell('W03 · กำลังโหลด',29,'รายวิชาของฉัน','กำลังโหลดข้อมูล…'));for(let i=0;i<3;i++){let n=B(s.main,'Loading row',1128,'VERTICAL','selected',24,0);n.resize(1128,64);n.primaryAxisSizingMode='FIXED';T(n,'กำลังโหลด…','Body','muted');}
s=save('webError',shell('W04 · Error & retry',30,'รายวิชาของฉัน','โหลดข้อมูลไม่สำเร็จ'));notice(s.main,'เชื่อมต่อระบบไม่ได้','ตรวจการเชื่อมต่อและลองอีกครั้ง ข้อมูลเดิมจะยังอยู่','Error');actions.push({id:btn(s.main,'ลองอีกครั้ง').id,to:'courses'});
s=save('forbidden',shell('W05 · ไม่มีสิทธิ์',31,'ไม่มีสิทธิ์เข้าถึงหน้านี้','สิทธิ์การเข้าถึงตรวจที่ API'));notice(s.main,'เปิดข้อมูลนี้ไม่ได้','กลับไปยังหน้าที่บัญชีของคุณมีสิทธิ์ใช้งาน','Error');actions.push({id:btn(s.main,'กลับบัญชีของฉัน','Secondary').id,to:'account'});
s=save('videoEmpty',shell('W06 · ไม่มีบันทึก',32,'บันทึกย้อนหลัง','CS101 · 2 พ.ย. 09:00–12:00 · ห้อง 301'));T(s.main,'ไม่มีไฟล์อัดของคาบนี้','Title');T(s.main,'ไฟล์อาจไม่ถูกสร้างหรือถึงวันที่ระบบลบแล้ว','Body','muted');actions.push({id:btn(s.main,'กลับกล้องทั้งหมด','Secondary').id,to:'cameras'});
s=save('leaveWeb',shell('W07 · ยื่นลาผ่านเว็บ',33,'ยื่นคำขอลา','บัญชีนักศึกษา · ทางเลือกที่ implementation เว็บรองรับ',{height:1120}));p=panel(s.main,'คำขอลาใหม่');field(p,'คาบ','CS101 · 9 พ.ย. 09:00–12:00',1040);field(p,'เหตุผล · ไม่เกิน 1000 ตัวอักษร','มีนัดพบแพทย์ตามใบนัด',1040);field(p,'หลักฐาน · PDF/JPG/PNG ไม่เกิน 10 MB','ใบนัดตัวอย่าง.pdf',1040);btn(p,'ส่งคำขอลา');T(s.main,'คำขอลาของฉัน','Heading');table(s.main,['คาบ','เหตุผล','สถานะ','OCR'],[['CS101 · 9 พ.ย.','มีนัดพบแพทย์',{badge:'Pending'},'อ่านข้อความแล้ว']],[360,320,200,216]);
s=save('examLocked',shell('W08 · สอบเริ่มแล้ว',34,'เปลี่ยนอาจารย์คุมสอบ','กล้องเริ่มเช็คชื่อแล้ว แก้ได้เฉพาะผู้คุมสอบ',{tab:'สอบ'}));p=panel(s.main,'ข้อมูลการสอบ');field(p,'วัน เวลา ห้อง และเกณฑ์','สอบกลางภาค · 2 พ.ย. 13:00–15:00 · 402',1040,'Disabled');field(p,'อาจารย์คุมสอบ','อาจารย์ตัวอย่าง ก / อาจารย์ตัวอย่าง ข',1040);actions.push({id:btn(p,'บันทึกผู้คุมสอบ').id,to:'exams'});
s=save('lastAdmin',shell('W09 · ผู้ดูแลคนสุดท้าย',35,'เปลี่ยนบทบาทไม่สำเร็จ','ระบบคงบทบาทเดิมไว้',{admin:true}));notice(s.main,'ต้องมีผู้ดูแลระบบอย่างน้อยหนึ่งคน','เพิ่มผู้ดูแลคนอื่นก่อนเปลี่ยนบทบาทบัญชีนี้','Error');actions.push({id:btn(s.main,'กลับรายชื่อผู้ใช้','Secondary').id,to:'users'});
return {screens,actions};

}
async function phase5(){
const page=figma.root.children.find(p=>p.name==='01 · System & product map');await figma.setCurrentPageAsync(page);
if(page.children.some(n=>n.name==='Product map & evidence'))return {existing:true};
await Promise.all(['Regular','Medium','SemiBold','Bold'].map(style=>figma.loadFontAsync({family:'IBM Plex Sans Thai',style})));
const vars=await figma.variables.getLocalVariablesAsync();const V=Object.fromEntries(vars.map(v=>[v.name,v]));const ST=Object.fromEntries((await figma.getLocalTextStylesAsync()).map(s=>[s.name.replace('CP/',''),s]));
for(const [name,size,style,line]of [['Display',40,'SemiBold',56],['Title',28,'SemiBold',40],['Heading',20,'SemiBold',32],['Body',16,'Regular',26],['Label',14,'Medium',24],['Caption',12,'Regular',20],['Metric',32,'SemiBold',44]]){if(!ST[name]){let t=figma.createTextStyle();t.name='CP/'+name;t.fontName={family:'IBM Plex Sans Thai',style};t.fontSize=size;t.lineHeight={unit:'PIXELS',value:line};ST[name]=t;}}
const LIB=figma.root.children.find(p=>p.name==='01 · System & product map');const C=Object.fromEntries(LIB.children.filter(n=>n.type==='COMPONENT'||n.type==='COMPONENT_SET').map(n=>[n.name,n]));
const P=k=>[figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:1,g:1,b:1}},'color',V['color/'+k])];
function fill(n,k){n.fills=P(k);}
function bind(n,prop,value,type='space'){n[prop]=value;const v=V[type+'/'+value];if(v)n.setBoundVariable(prop,v);}
function B(parent,name,w,dir='VERTICAL',bg='surface',pad=0,gap=16){const n=figma.createFrame();n.name=name;n.layoutMode=dir;n.resize(w,20);n.primaryAxisSizingMode=dir==='HORIZONTAL'?'FIXED':'AUTO';n.counterAxisSizingMode=dir==='HORIZONTAL'?'AUTO':'FIXED';fill(n,bg);for(const p of ['paddingTop','paddingRight','paddingBottom','paddingLeft'])bind(n,p,pad);bind(n,'itemSpacing',gap);parent.appendChild(n);return n;}
function T(parent,str,role='Body',color='ink',w){let n=figma.createText();n.name=str.slice(0,60);n.fontName={family:'IBM Plex Sans Thai',style:'Regular'};n.characters=str;n.fontName=ST[role].fontName;n.fontSize=ST[role].fontSize;n.lineHeight=ST[role].lineHeight;STYLE_JOBS.push(n.setTextStyleIdAsync(ST[role].id));n.fills=P(color);parent.appendChild(n);if(w){n.resize(w,26);n.textAutoResize='HEIGHT';}return n;}
function H(p,title,sub,w){T(p,title,'Title','ink',w);if(sub)T(p,sub,'Body','muted',w);}
function R(p,w,g=12,bg='surface',pad=0){return B(p,'Row',w,'HORIZONTAL',bg,pad,g);}
function comp(parent,name,variant){let set=C[name];let base=set.type==='COMPONENT'?set:set.children.find(n=>n.name===variant);if(!base)throw Error('Missing '+name+' '+variant);let i=base.createInstance();parent.appendChild(i);return i;}
function change(i,key,value){let k=Object.keys(i.componentProperties).find(k=>k.startsWith(key+'#'));if(k)i.setProperties({[k]:value});}
function btn(p,label,type='Primary',state='Default',w=184){let i=comp(p,'CP/Button','Type='+type+', State='+state);change(i,'Label',label);i.resize(w,48);return i;}
function badge(p,status){return comp(p,'CP/Status','Status='+status);}
function field(p,label,value,w=320,state='Filled'){let i=comp(p,'CP/Field','State='+state);change(i,'Label',label);change(i,'Value',value);i.resize(w,i.height);for(const t of i.findAllWithCriteria({types:['TEXT']})){t.resize(w-24,t.height);t.textAutoResize='HEIGHT';t.layoutSizingHorizontal='FILL';}i.primaryAxisSizingMode='AUTO';return i;}
function evidence(p,state='Available',w=104){let i=comp(p,'CP/Evidence','State='+state);i.resize(w,w);return i;}
function notice(p,title,body,tone='Info',w=1128){let i=comp(p,'CP/Notice','Tone='+tone);change(i,'Title',title);i.resize(w,i.height);let texts=i.findAllWithCriteria({types:['TEXT']});if(texts[1]){texts[1].characters=body;texts[1].resize(w-32,26);texts[1].textAutoResize='HEIGHT';texts[1].layoutSizingHorizontal='FILL';}if(texts[0]){texts[0].resize(w-32,texts[0].height);texts[0].textAutoResize='HEIGHT';texts[0].layoutSizingHorizontal='FILL';}i.primaryAxisSizingMode='AUTO';return i;}
function panel(p,title,w=1128){let n=B(p,title,w,'VERTICAL','surface',24,16);bind(n,'cornerRadius',12,'radius');n.strokes=P('border');T(n,title,'Heading');return n;}
function table(p,headers,rows,widths,w=1128){let f=B(p,'Table',w,'VERTICAL','surface',0,0);f.strokes=P('border');bind(f,'cornerRadius',12,'radius');let head=R(f,w,0,'bg',16);headers.forEach((v,i)=>T(head,v,'Label','muted',widths[i]));for(const row of rows){let r=R(f,w,0,'surface',16);r.counterAxisAlignItems='CENTER';for(let i=0;i<row.length;i++){let cell=B(r,'Cell '+headers[i],widths[i],'VERTICAL','surface',0,4);let val=row[i];if(typeof val==='object'){if(val.badge)badge(cell,val.badge);if(val.text)T(cell,val.text,'Caption','muted',widths[i]-8);if(val.button)btn(cell,val.button,'Secondary','Default',Math.min(widths[i]-8,160));if(val.photo)evidence(cell,'Available',48);}else T(cell,val,'Body','ink',widths[i]-8);}let line=figma.createRectangle();line.name='Divider';line.resize(w,1);fill(line,'bg');f.appendChild(line);}return f;}
function shell(name,index,title,sub,{tab=null,admin=false,height=1000}={}){const f=B(page,name,1440,'HORIZONTAL','bg',0,0);f.primaryAxisSizingMode='FIXED';f.resize(1440,height);f.x=(index%3)*1520;f.y=Math.floor(index/3)*1600;f.clipsContent=true;const nav=B(f,'Navigation',232,'VERTICAL','rail',24,24);nav.layoutSizingVertical='FILL';T(nav,'ClassPing','Heading','onRail');T(nav,admin?'พื้นที่ผู้ดูแลระบบ':'พื้นที่อาจารย์','Label','onRail');for(const label of admin?['ภาพรวม','ผู้ใช้','ห้องเรียน','รายวิชา','กล้อง','บัญชี']:['รายวิชา','กล้อง','ตรวจใบลา','บัญชี']){let r=R(nav,184,0,label===(admin?'ภาพรวม':'รายวิชา')?'action':'rail',12);T(r,label,'Label','onRail');}T(nav,'DPU · @dpu.ac.th','Caption','onRail',180);const main=B(f,'Workspace',1208,'VERTICAL','bg',40,24);main.layoutSizingVertical='FILL';const meta=R(main,1128,16,'bg');T(meta,admin?'ระบบผู้ดูแล':'รายวิชา / CS101 · กลุ่ม 01','Caption','muted',850);T(meta,'ตัวอย่างสมมติ','Caption','muted');H(main,title,sub,1128);if(tab){let tabs=R(main,1128,8,'bg');for(const label of ['เช็คชื่อ','นักศึกษา','ตารางเรียน','สอบ','เกณฑ์','รายงาน']){let i=comp(tabs,'CP/Tab','State='+(label===tab?'Active':'Default'));i.resize(160,48);i.findOne(n=>n.type==='TEXT').characters=label;}}return {f,main};}
const screens={};const actions=[];
function save(key,s){screens[key]=s.f.id;return s;}

const f=B(page,'Product map & evidence',1440,'VERTICAL','bg',40,24);f.x=-1600;f.y=0;
T(f,'ClassPing','Display');T(f,'Product map & UX decisions','Title');T(f,'สำรวจ implementation ณ 2 พฤศจิกายน 2569 · ข้อมูลหน้าจอเป็นตัวอย่างสมมติทั้งหมด','Body','muted',1360);
T(f,'ข้อเท็จจริงจากโค้ด','Heading');
for(const text of ['นักศึกษา: Google OAuth → ยินยอม → ภาพบัตรของวันนี้ → หน้า 5 มุม → สรุปเข้าเรียน / ยื่นลา / บัญชี','อาจารย์: รายวิชา → นักศึกษา / ตาราง / คาบสอบ / เกณฑ์ → คาบเรียน → ผลเช็คชื่อ → ตรวจภาพหรือแก้สถานะ → รายงาน CSV/PDF','การลา: นักศึกษาเลือกคาบ + เหตุผล + หลักฐาน → ส่ง → OCR ประกอบการตรวจ → อาจารย์อนุมัติ/ปฏิเสธ → นักศึกษาดูผล','กล้อง: วันที่ → คาบที่มีสิทธิ์ → สด / บันทึกแยกช่วง → ดาวน์โหลดเฉพาะเจ้าของวิชาหรือแอดมิน','แอดมิน: ภาพรวมผู้ใช้/วิชา/ห้อง → เปลี่ยนบทบาท / รีเซ็ตใบหน้า / เพิ่มห้อง; backend มี camera token แต่เว็บยังไม่มีหน้าจัดการ'])T(f,text,'Body','ink',1360);
T(f,'ข้อเสนอของดีไซน์','Heading');for(const text of ['ใช้ navigation ตามบทบาท และเริ่มรายวิชาที่เช็คชื่อ แทนการเข้ารายชื่อทุกครั้ง','ใช้รายงานสถานะพร้อมคำอธิบาย แยกยังไม่เห็น / รอตรวจ / ขาด; ให้หลักฐานกับการตัดสินใจอยู่ด้วยกัน','แยกหน้าแบบฟอร์มจากหน้ารายการ และแทน browser confirm ด้วย dialog ที่บอกผลกระทบชัดเจน','ใช้ mobile app bar + native pickers + scroll area + bottom actions; คง consent gate และสแกนอัตโนมัติ','หน้า responsive สำหรับอาจารย์เปลี่ยนตารางเป็นแถวข้อมูลแนวตั้ง; ไม่เพิ่มความสามารถใหม่'])T(f,text,'Body','ink',1360);
T(f,'สิ่งที่ไม่แสดงเป็นฟีเจอร์พร้อมใช้','Heading');T(f,'Classroom sync · chatbot · การเทียบโอน · สถิติเข้าออกประตู · OCR เป็นฟอร์มร่างก่อนส่ง · แก้/ลบห้อง · ระบบแจ้งเตือน · user growth / accuracy claims','Body','muted',1360);
T(f,'หลักฐานและขอบเขตการตรวจ','Heading');T(f,'อ่าน routes, components, mobile screens, API services, guards และ migrations. เว็บ /login ตอบ HTTP 200; ไม่ได้ทดสอบ flow หลัง OAuth. เครื่องมือ browser ไม่พร้อม, API :3001 ไม่เปิด. ตรวจรูปแบบด้วย Figma render และ native desktop เท่าที่เข้าถึงได้.','Body','muted',1360);
T(f,'Design system','Heading');T(f,'Campus wayfinding: forest rail / warm paper / mint selection / amber review. IBM Plex Sans Thai. 4px spacing scale, 48px targets, radius 12. สีสื่อความหมายพร้อมข้อความ. Light เป็นฐานสำหรับห้องเรียน; dark theme ยังไม่ใช่ผลส่งมอบที่ตรวจแล้ว.','Body','ink',1360);
T(f,'ไฟล์และการตรวจความครบถ้วน','Heading');T(f,'ดู DESIGN.md, design/UX-AUDIT.md และ design/SCREEN-COVERAGE.md ใน repository. ไม่แก้ business logic ในรอบนี้. หน้าจอและระบบใหม่ทั้งหมดเป็นข้อเสนอสำหรับ implementation.','Body','muted',1360);
return {frame:f.id,height:f.height};

}
async function phase6(){
const page=figma.root.children.find(p=>p.name==='02 · Teacher & admin');await figma.setCurrentPageAsync(page);
if(page.children.some(n=>n.name==='P20 · OCR ล้มเหลว · แผนงาน'))return {existing:true};
await Promise.all(['Regular','Medium','SemiBold','Bold'].map(style=>figma.loadFontAsync({family:'IBM Plex Sans Thai',style})));
const vars=await figma.variables.getLocalVariablesAsync();const V=Object.fromEntries(vars.map(v=>[v.name,v]));const ST=Object.fromEntries((await figma.getLocalTextStylesAsync()).map(s=>[s.name.replace('CP/',''),s]));
for(const [name,size,style,line]of [['Display',40,'SemiBold',56],['Title',28,'SemiBold',40],['Heading',20,'SemiBold',32],['Body',16,'Regular',26],['Label',14,'Medium',24],['Caption',12,'Regular',20],['Metric',32,'SemiBold',44]]){if(!ST[name]){let t=figma.createTextStyle();t.name='CP/'+name;t.fontName={family:'IBM Plex Sans Thai',style};t.fontSize=size;t.lineHeight={unit:'PIXELS',value:line};ST[name]=t;}}
const LIB=figma.root.children.find(p=>p.name==='01 · System & product map');const C=Object.fromEntries(LIB.children.filter(n=>n.type==='COMPONENT'||n.type==='COMPONENT_SET').map(n=>[n.name,n]));
const P=k=>[figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:1,g:1,b:1}},'color',V['color/'+k])];
function fill(n,k){n.fills=P(k);}
function bind(n,prop,value,type='space'){n[prop]=value;const v=V[type+'/'+value];if(v)n.setBoundVariable(prop,v);}
function B(parent,name,w,dir='VERTICAL',bg='surface',pad=0,gap=16){const n=figma.createFrame();n.name=name;n.layoutMode=dir;n.resize(w,20);n.primaryAxisSizingMode=dir==='HORIZONTAL'?'FIXED':'AUTO';n.counterAxisSizingMode=dir==='HORIZONTAL'?'AUTO':'FIXED';fill(n,bg);for(const p of ['paddingTop','paddingRight','paddingBottom','paddingLeft'])bind(n,p,pad);bind(n,'itemSpacing',gap);parent.appendChild(n);return n;}
function T(parent,str,role='Body',color='ink',w){let n=figma.createText();n.name=str.slice(0,60);n.fontName={family:'IBM Plex Sans Thai',style:'Regular'};n.characters=str;n.fontName=ST[role].fontName;n.fontSize=ST[role].fontSize;n.lineHeight=ST[role].lineHeight;STYLE_JOBS.push(n.setTextStyleIdAsync(ST[role].id));n.fills=P(color);parent.appendChild(n);if(w){n.resize(w,26);n.textAutoResize='HEIGHT';}return n;}
function H(p,title,sub,w){T(p,title,'Title','ink',w);if(sub)T(p,sub,'Body','muted',w);}
function R(p,w,g=12,bg='surface',pad=0){return B(p,'Row',w,'HORIZONTAL',bg,pad,g);}
function comp(parent,name,variant){let set=C[name];let base=set.type==='COMPONENT'?set:set.children.find(n=>n.name===variant);if(!base)throw Error('Missing '+name+' '+variant);let i=base.createInstance();parent.appendChild(i);return i;}
function change(i,key,value){let k=Object.keys(i.componentProperties).find(k=>k.startsWith(key+'#'));if(k)i.setProperties({[k]:value});}
function btn(p,label,type='Primary',state='Default',w=184){let i=comp(p,'CP/Button','Type='+type+', State='+state);change(i,'Label',label);i.resize(w,48);return i;}
function badge(p,status){return comp(p,'CP/Status','Status='+status);}
function field(p,label,value,w=320,state='Filled'){let i=comp(p,'CP/Field','State='+state);change(i,'Label',label);change(i,'Value',value);i.resize(w,i.height);for(const t of i.findAllWithCriteria({types:['TEXT']})){t.resize(w-24,t.height);t.textAutoResize='HEIGHT';t.layoutSizingHorizontal='FILL';}i.primaryAxisSizingMode='AUTO';return i;}
function evidence(p,state='Available',w=104){let i=comp(p,'CP/Evidence','State='+state);i.resize(w,w);return i;}
function notice(p,title,body,tone='Info',w=1128){let i=comp(p,'CP/Notice','Tone='+tone);change(i,'Title',title);i.resize(w,i.height);let texts=i.findAllWithCriteria({types:['TEXT']});if(texts[1]){texts[1].characters=body;texts[1].resize(w-32,26);texts[1].textAutoResize='HEIGHT';texts[1].layoutSizingHorizontal='FILL';}if(texts[0]){texts[0].resize(w-32,texts[0].height);texts[0].textAutoResize='HEIGHT';texts[0].layoutSizingHorizontal='FILL';}i.primaryAxisSizingMode='AUTO';return i;}
function panel(p,title,w=1128){let n=B(p,title,w,'VERTICAL','surface',24,16);bind(n,'cornerRadius',12,'radius');n.strokes=P('border');T(n,title,'Heading');return n;}
function table(p,headers,rows,widths,w=1128){let f=B(p,'Table',w,'VERTICAL','surface',0,0);f.strokes=P('border');bind(f,'cornerRadius',12,'radius');let head=R(f,w,0,'bg',16);headers.forEach((v,i)=>T(head,v,'Label','muted',widths[i]));for(const row of rows){let r=R(f,w,0,'surface',16);r.counterAxisAlignItems='CENTER';for(let i=0;i<row.length;i++){let cell=B(r,'Cell '+headers[i],widths[i],'VERTICAL','surface',0,4);let val=row[i];if(typeof val==='object'){if(val.badge)badge(cell,val.badge);if(val.text)T(cell,val.text,'Caption','muted',widths[i]-8);if(val.button)btn(cell,val.button,'Secondary','Default',Math.min(widths[i]-8,160));if(val.photo)evidence(cell,'Available',48);}else T(cell,val,'Body','ink',widths[i]-8);}let line=figma.createRectangle();line.name='Divider';line.resize(w,1);fill(line,'bg');f.appendChild(line);}return f;}
function shell(name,index,title,sub,{tab=null,admin=false,height=1000}={}){const f=B(page,name,1440,'HORIZONTAL','bg',0,0);f.primaryAxisSizingMode='FIXED';f.resize(1440,height);f.x=(index%3)*1520;f.y=Math.floor(index/3)*1600;f.clipsContent=true;const nav=B(f,'Navigation',232,'VERTICAL','rail',24,24);nav.layoutSizingVertical='FILL';T(nav,'ClassPing','Heading','onRail');T(nav,admin?'พื้นที่ผู้ดูแลระบบ':'พื้นที่อาจารย์','Label','onRail');for(const label of admin?['ภาพรวม','ผู้ใช้','ห้องเรียน','รายวิชา','กล้อง','บัญชี']:['รายวิชา','กล้อง','ตรวจใบลา','บัญชี']){let r=R(nav,184,0,label===(admin?'ภาพรวม':'รายวิชา')?'action':'rail',12);T(r,label,'Label','onRail');}T(nav,'DPU · @dpu.ac.th','Caption','onRail',180);const main=B(f,'Workspace',1208,'VERTICAL','bg',40,24);main.layoutSizingVertical='FILL';const meta=R(main,1128,16,'bg');T(meta,admin?'ระบบผู้ดูแล':'รายวิชา / CS101 · กลุ่ม 01','Caption','muted',850);T(meta,'ตัวอย่างสมมติ','Caption','muted');H(main,title,sub,1128);if(tab){let tabs=R(main,1128,8,'bg');for(const label of ['เช็คชื่อ','นักศึกษา','ตารางเรียน','สอบ','เกณฑ์','รายงาน']){let i=comp(tabs,'CP/Tab','State='+(label===tab?'Active':'Default'));i.resize(160,48);i.findOne(n=>n.type==='TEXT').characters=label;}}return {f,main};}
const screens={};const actions=[];
function save(key,s){screens[key]=s.f.id;return s;}

function plan(key,name,index,title,sub,admin=true){const s=save(key,shell(name,index,title,sub,{admin,height:1200}));const a=figma.createText();a.fontName={family:'IBM Plex Sans Thai',style:'Medium'};a.fontSize=16;a.characters='แผนงานจาก .md · ยังไม่พบ implementation ครบใน checkout นี้';a.fills=P('muted');page.appendChild(a);a.x=s.f.x;a.y=s.f.y-36;return s;}
let s=plan('planCameras','P01 · จัดการกล้อง · แผนงาน',36,'กล้องประจำห้อง','รายการกล้องและการติดต่อครั้งล่าสุด');
table(s.main,['ห้อง / ตำแหน่ง','ติดต่อครั้งล่าสุด','ข้อมูลรับรอง',''],[['ห้องตัวอย่าง 301 · หน้าห้อง','ยังไม่มีข้อมูล','ยังไม่ออก token',{button:'ออก token'}],['ห้องตัวอย่าง 402 · หน้าห้อง','ยังไม่มีข้อมูล','มี token แล้ว',{button:'หมุน token'}]],[420,240,220,216]);actions.push({id:btn(s.main,'ออกหรือหมุน token').id,to:'planTokenConfirm'});
s=plan('planTokenConfirm','P02 · ยืนยัน token · แผนงาน',37,'ออก token ใหม่ให้ห้องตัวอย่าง 301','token เดิมจะใช้เชื่อมต่อกล้องไม่ได้');notice(s.main,'ตรวจสอบห้องก่อนยืนยัน','เปลี่ยนข้อมูลรับรองเฉพาะอุปกรณ์ที่ได้รับอนุญาต','Warning');actions.push({id:btn(s.main,'ยืนยันออก token','Danger','Default',240).id,to:'planTokenResult'});actions.push({id:btn(s.main,'ยกเลิก','Secondary').id,to:'planCameras'});
s=plan('planTokenResult','P03 · token ครั้งเดียว · แผนงาน',38,'ตั้งค่ากล้องประจำห้อง','ห้องตัวอย่าง 301');field(s.main,'token สำหรับอุปกรณ์','ตัวอย่างปิดบัง · ไม่ใช่ข้อมูลรับรองจริง',760);btn(s.main,'คัดลอก token','Secondary');btn(s.main,'ซ่อน token','Secondary');T(s.main,'เก็บ token ให้ปลอดภัย หน้านี้แสดงค่าเมื่อออกใหม่เท่านั้น','Body','muted',1128);actions.push({id:btn(s.main,'เสร็จสิ้น').id,to:'planCameras'});
s=plan('planCourseAdmin','P04 · จัดการวิชา · แผนงาน',39,'รายวิชาและผู้สอน','เพิ่มหรือแก้ข้อมูลและมอบหมายอาจารย์');let p=panel(s.main,'ข้อมูลรายวิชา');let r=R(p,1080,24);field(r,'รหัสวิชา','CS101',240);field(r,'ชื่อวิชา','การเขียนโปรแกรมเบื้องต้น',520);r=R(p,1080,24);field(r,'กลุ่มเรียน','01',240);field(r,'ผู้สอน · เฉพาะบทบาทอาจารย์','อาจารย์ตัวอย่าง ก',520);btn(p,'บันทึกรายวิชา');actions.push({id:btn(s.main,'รายชื่อนักศึกษา','Secondary').id,to:'students'});actions.push({id:btn(s.main,'ตารางเรียน','Secondary').id,to:'schedule'});
s=plan('planCurricula','P05 · หลักสูตร · แผนงาน',40,'หลักสูตร','เพิ่ม แก้ไข และนำเข้า CSV UTF-8');table(s.main,['รหัส','ชื่อหลักสูตร','สถานะ'],[['CURR-EXAMPLE','หลักสูตรตัวอย่างสำหรับออกแบบ','ใช้งาน']],[260,616,220]);p=panel(s.main,'นำเข้าข้อมูล');field(p,'ไฟล์ CSV UTF-8 · ≤200 KB / ≤500 แถว','curricula-example.csv',1040);actions.push({id:btn(p,'ตรวจไฟล์ก่อนนำเข้า','Primary','Default',240).id,to:'planCSVPreview'});btn(p,'ดาวน์โหลดไฟล์ตัวอย่าง','Secondary','Default',240);
s=plan('planCSVError','P06 · CSV ไม่ผ่าน · แผนงาน',41,'ตรวจไฟล์ไม่ผ่าน','ยังไม่มีข้อมูลใดถูกนำเข้า');notice(s.main,'รหัสซ้ำในไฟล์','แถวที่ 3: CURR-EXAMPLE ซ้ำกับแถวที่ 2 แก้ทั้งไฟล์แล้วตรวจใหม่','Error');table(s.main,['แถว','ช่องข้อมูล','ปัญหา'],[['3','code','รหัสซ้ำ'],['5','name','ยังไม่ได้ระบุชื่อ']],[120,280,696]);actions.push({id:btn(s.main,'เลือกไฟล์ใหม่','Secondary').id,to:'planCurricula'});
s=plan('planCSVPreview','P07 · ยืนยันนำเข้า · แผนงาน',42,'ตรวจข้อมูลก่อนนำเข้า','แสดงตัวอย่างจากไฟล์สมมติ · บันทึกทั้งชุดครั้งเดียว');table(s.main,['รหัส','ชื่อ'],[['CURR-EXAMPLE','หลักสูตรตัวอย่าง'],['CURR-DEMO','หลักสูตรสาธิต']],[320,776]);actions.push({id:btn(s.main,'ยืนยันนำเข้าทั้งชุด','Primary','Default',240).id,to:'planCurricula'});actions.push({id:btn(s.main,'กลับไปเลือกไฟล์','Secondary','Default',240).id,to:'planCurricula'});
s=plan('planReference','P08 · ข้อมูลกลาง · แผนงาน',43,'ข้อมูลกลางมหาวิทยาลัย','เพิ่มหรือแก้ข้อมูลอ้างอิง');p=panel(s.main,'รายการข้อมูล');field(p,'รหัสข้อมูล','REF-EXAMPLE',480);field(p,'ชื่อข้อมูล','ข้อมูลตัวอย่าง',1040);field(p,'รายละเอียด','ข้อความที่ผู้ดูแลตรวจสอบก่อนเผยแพร่',1040);btn(p,'บันทึกข้อมูล');actions.push({id:btn(s.main,'นำเข้า CSV','Secondary').id,to:'planCSVPreview'});
s=plan('planKnowledge','P09 · แหล่งความรู้ · แผนงาน',44,'แหล่งความรู้มหาวิทยาลัย','จัดการเนื้อหาและแหล่งอ้างอิง');p=panel(s.main,'ข้อมูลแหล่งความรู้');field(p,'ชื่อเรื่อง','เอกสารอ้างอิงตัวอย่าง',1040);field(p,'URL อ้างอิง','https://example.org/reference',1040);field(p,'เนื้อหา / อ่านไฟล์ข้อความ UTF-8','ข้อความที่ตรวจสอบกับต้นฉบับแล้ว',1040);field(p,'สถานะ','ใช้งาน / ไม่ใช้งาน',480);btn(p,'บันทึกแหล่งความรู้');actions.push({id:btn(s.main,'การนำเข้าเพื่อค้นคืน','Secondary','Default',260).id,to:'planRAG'});
s=plan('planRAG','P10 · จัดการ RAG · แผนงาน',45,'ข้อมูลสำหรับผู้ช่วยตอบคำถาม','กำหนดสิทธิ์และตรวจข้อมูลก่อนนำเข้า');field(s.main,'การมองเห็น','สาธารณะ / ผู้เข้าสู่ระบบ / เฉพาะรายวิชา',880);field(s.main,'รายวิชาเมื่อจำกัดสิทธิ์','CS101 · กลุ่ม 01',880);notice(s.main,'ยังไม่พร้อมนำไปตอบคำถาม','ต้องตั้งค่าผู้ให้บริการและนำเข้าข้อมูลตามโมเดลที่เลือกก่อนใช้งาน');btn(s.main,'นำเข้า / แทนที่ข้อมูล');btn(s.main,'ลบแหล่งข้อมูล','Danger');
s=plan('planClassroom','P11 · เชื่อม Classroom · แผนงาน',46,'เชื่อม Google Classroom','อ่านรายวิชา รายชื่อ งานและกำหนดส่งตามสิทธิ์');notice(s.main,'ยังไม่ได้เชื่อมต่อ','ต้องได้รับอนุญาตจากบัญชีมหาวิทยาลัยและนโยบายของผู้ดูแล');actions.push({id:btn(s.main,'เชื่อมบัญชี Google','Primary','Default',260).id,to:'planClassroomSync'});T(s.main,'ตารางเรียนยังจัดการใน ClassPing เพราะ Classroom ไม่มีข้อมูลวันและเวลาเรียน','Body','muted',1128);
s=plan('planClassroomSync','P12 · ซิงก์รายวิชา · แผนงาน',47,'ตรวจรายการก่อนซิงก์','ตรวจการจับคู่กับรายวิชาและรหัสนักศึกษาเดิม');table(s.main,['ข้อมูลจาก Classroom','ข้อมูลใน ClassPing','การจัดการ'],[['CS101 · รายวิชาตัวอย่าง','CS101 · กลุ่ม 01','จับคู่กับรายการเดิม'],['66110001 · นักศึกษาตัวอย่าง','มีรหัสอยู่แล้ว','ไม่เพิ่มซ้ำ']],[440,400,256]);btn(s.main,'ยืนยันการซิงก์');actions.push({id:btn(s.main,'ย้อนกลับ','Secondary').id,to:'planClassroom'});
s=plan('planDoorway','P13 · เวลาเข้าออก · แผนงาน',48,'เวลาออกและกลับเข้าห้อง','CS101 · ห้อง 301 · 2 พ.ย. 2569 · ข้อมูลสมมติ',false);table(s.main,['นักศึกษา','ออก / กลับ','นอกห้องรวม','การตรวจสอบ'],[['66110001 · ตัวอย่าง ก','10:10 / 10:16','6 นาที','อยู่ภายในเกณฑ์ตัวอย่าง'],['66110002 · ตัวอย่าง ข','10:20 / ยังไม่พบการกลับ','ยังสรุปไม่ได้','ตรวจเหตุการณ์ก่อนสรุป']],[360,280,160,296]);T(s.main,'คิดเวลานอกห้องรวมทั้งคาบตามเกณฑ์ ไม่สรุปว่าโดดเมื่อข้อมูลเหตุการณ์ยังไม่ครบ','Body','muted',1128);
s=plan('planTransfers','P14 · คิวเทียบโอน · แผนงาน',49,'คำขอเทียบโอน','ตรวจเอกสารและพิจารณารายวิชา');table(s.main,['ผู้ยื่น','สถาบันเดิม','สถานะ',''],[['66110001 · ตัวอย่าง ก','สถาบันตัวอย่าง',{badge:'Pending'},{button:'เปิดคำขอ'}]],[400,280,200,216]);actions.push({id:btn(s.main,'ตรวจคำขอ').id,to:'planTransferReview'});actions.push({id:btn(s.main,'จัดการคู่เทียบ','Secondary').id,to:'planTransferMapping'});
s=plan('planTransferReview','P15 · พิจารณาเทียบโอน · แผนงาน',50,'เทียบรายวิชาตามหลักฐาน','ผู้ดูแลเป็นผู้ตัดสิน ไม่อนุมัติด้วย OCR หรือ AI');field(s.main,'เอกสารผลการเรียน / หลักสูตร','transcript-example.pdf · เปิดหลักฐาน',1040);table(s.main,['วิชาเดิม / หน่วยกิต','ผลจับคู่','คำตัดสิน'],[['OLD101 · 3 หน่วยกิต','CS101 · 3 หน่วยกิต','รอพิจารณา'],['OLD202 · 2 หน่วยกิต','ยังไม่พบคู่เทียบ','รอพิจารณา']],[400,400,296]);field(s.main,'เหตุผลประกอบแต่ละวิชา','ระบุผลตรวจเอกสาร',1040);btn(s.main,'บันทึกผลพิจารณา');T(s.main,'ผลเทียบโอนเก็บแยก ไม่เพิ่ม enrollment หรือแก้ทะเบียนอัตโนมัติ','Body','muted',1128);
s=plan('planTransferMapping','P16 · คู่เทียบวิชา · แผนงาน',51,'คู่เทียบและเอกสารหลักสูตร','กำหนดข้อมูลอ้างอิงก่อนพิจารณาคำขอ');p=panel(s.main,'เงื่อนไขจับคู่');field(p,'สถาบันเดิม','สถาบันตัวอย่าง',1040);r=R(p,1080,24);field(r,'รหัสวิชาเดิม','OLD101',320);field(r,'หน่วยกิตขั้นต่ำ','3',320);field(r,'วิชาเป้าหมาย','CS101',320);field(p,'เอกสารหลักสูตร · PDF/JPG/PNG ≤10 MB','curriculum-example.pdf',1040);btn(p,'บันทึกคู่เทียบ');
s=plan('planStudyAssist','P17 · ผู้ช่วยการเรียน · แผนงาน',52,'ผู้ช่วยการเรียน','อ่านข้อมูลจากรายวิชาที่บัญชีนี้เข้าถึงได้',false);field(s.main,'คำถาม','มีงานอะไรที่ใกล้กำหนดส่งใน CS101',1040);notice(s.main,'ยังไม่มีข้อมูลจาก Classroom','เชื่อมบัญชีและตรวจสิทธิ์ก่อนค้นงานหรือกำหนดส่ง ไม่เดาวันส่งงาน');actions.push({id:btn(s.main,'เชื่อม Classroom').id,to:'planClassroom'});
s=plan('planPublicChat','P18 · Open House · แผนงาน',53,'ถามข้อมูลมหาวิทยาลัย','บุคคลทั่วไป · ใช้เฉพาะแหล่งข้อมูลสาธารณะ',false);field(s.main,'คำถามของคุณ','สอบถามข้อมูลหลักสูตร',1040);notice(s.main,'ยังไม่มีข้อมูลอ้างอิงรองรับ','ลองระบุชื่อหลักสูตรหรือหัวข้อให้ชัดขึ้น');btn(s.main,'ส่งคำถาม');T(s.main,'ห้ามนำข้อมูลเฉพาะนักศึกษา เอกสารลา หรือข้อมูลในรายวิชามาตอบในโหมดสาธารณะ','Body','muted',1128);
s=plan('planOCRWeb','P19 · อ่านร่างใบลา · แผนงาน',54,'ตรวจและแก้เหตุผลจากหลักฐาน','การอ่านร่างยังไม่ส่งคำขอลา',false);field(s.main,'หลักฐาน · PDF/JPG/PNG ≤10 MB','appointment-example.pdf',1040);btn(s.main,'อ่านข้อความเป็นร่าง','Secondary','Default',260);field(s.main,'เหตุผลที่คุณตรวจแก้ก่อนส่ง','มีนัดพบแพทย์ตามเอกสารที่แนบ',1040);T(s.main,'หากมีเหตุผลเดิมอยู่แล้ว ให้เลือกใช้ร่างเอง ไม่เขียนทับอัตโนมัติ','Body','muted',1128);btn(s.main,'ส่งคำขอลา');
s=plan('planOCRWebFailed','P20 · OCR ล้มเหลว · แผนงาน',55,'กรอกเหตุผลต่อได้','หลักฐานยังใช้ประกอบการยื่นลาได้',false);notice(s.main,'อ่านร่างไม่สำเร็จ','กรอกเหตุผลด้วยตนเองแล้วส่งพร้อมหลักฐาน ไม่จำเป็นต้องอ่าน OCR ให้สำเร็จก่อน','Warning');field(s.main,'เหตุผล','มีนัดพบแพทย์ตามใบนัด',1040);btn(s.main,'ส่งคำขอลาพร้อมหลักฐาน','Primary','Default',280);
return {screens,actions,planned:true};

}
async function phase7(){
const page=figma.root.children.find(p=>p.name==='03 · Student & responsive');await figma.setCurrentPageAsync(page);
if(page.children.some(n=>n.name==='P32 · เวลานอกห้อง · แผนงาน'))return {existing:true};
await Promise.all(['Regular','Medium','SemiBold','Bold'].map(style=>figma.loadFontAsync({family:'IBM Plex Sans Thai',style})));
const vars=await figma.variables.getLocalVariablesAsync();const V=Object.fromEntries(vars.map(v=>[v.name,v]));const ST=Object.fromEntries((await figma.getLocalTextStylesAsync()).map(s=>[s.name.replace('CP/',''),s]));
for(const [name,size,style,line]of [['Display',40,'SemiBold',56],['Title',28,'SemiBold',40],['Heading',20,'SemiBold',32],['Body',16,'Regular',26],['Label',14,'Medium',24],['Caption',12,'Regular',20],['Metric',32,'SemiBold',44]]){if(!ST[name]){let t=figma.createTextStyle();t.name='CP/'+name;t.fontName={family:'IBM Plex Sans Thai',style};t.fontSize=size;t.lineHeight={unit:'PIXELS',value:line};ST[name]=t;}}
const LIB=figma.root.children.find(p=>p.name==='01 · System & product map');const C=Object.fromEntries(LIB.children.filter(n=>n.type==='COMPONENT'||n.type==='COMPONENT_SET').map(n=>[n.name,n]));
const P=k=>[figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:1,g:1,b:1}},'color',V['color/'+k])];
function fill(n,k){n.fills=P(k);}
function bind(n,prop,value,type='space'){n[prop]=value;const v=V[type+'/'+value];if(v)n.setBoundVariable(prop,v);}
function B(parent,name,w,dir='VERTICAL',bg='surface',pad=0,gap=16){const n=figma.createFrame();n.name=name;n.layoutMode=dir;n.resize(w,20);n.primaryAxisSizingMode=dir==='HORIZONTAL'?'FIXED':'AUTO';n.counterAxisSizingMode=dir==='HORIZONTAL'?'AUTO':'FIXED';fill(n,bg);for(const p of ['paddingTop','paddingRight','paddingBottom','paddingLeft'])bind(n,p,pad);bind(n,'itemSpacing',gap);parent.appendChild(n);return n;}
function T(parent,str,role='Body',color='ink',w){let n=figma.createText();n.name=str.slice(0,60);n.fontName={family:'IBM Plex Sans Thai',style:'Regular'};n.characters=str;n.fontName=ST[role].fontName;n.fontSize=ST[role].fontSize;n.lineHeight=ST[role].lineHeight;STYLE_JOBS.push(n.setTextStyleIdAsync(ST[role].id));n.fills=P(color);parent.appendChild(n);if(w){n.resize(w,26);n.textAutoResize='HEIGHT';}return n;}
function H(p,title,sub,w){T(p,title,'Title','ink',w);if(sub)T(p,sub,'Body','muted',w);}
function R(p,w,g=12,bg='surface',pad=0){return B(p,'Row',w,'HORIZONTAL',bg,pad,g);}
function comp(parent,name,variant){let set=C[name];let base=set.type==='COMPONENT'?set:set.children.find(n=>n.name===variant);if(!base)throw Error('Missing '+name+' '+variant);let i=base.createInstance();parent.appendChild(i);return i;}
function change(i,key,value){let k=Object.keys(i.componentProperties).find(k=>k.startsWith(key+'#'));if(k)i.setProperties({[k]:value});}
function btn(p,label,type='Primary',state='Default',w=184){let i=comp(p,'CP/Button','Type='+type+', State='+state);change(i,'Label',label);i.resize(w,48);return i;}
function badge(p,status){return comp(p,'CP/Status','Status='+status);}
function field(p,label,value,w=320,state='Filled'){let i=comp(p,'CP/Field','State='+state);change(i,'Label',label);change(i,'Value',value);i.resize(w,i.height);for(const t of i.findAllWithCriteria({types:['TEXT']})){t.resize(w-24,t.height);t.textAutoResize='HEIGHT';t.layoutSizingHorizontal='FILL';}i.primaryAxisSizingMode='AUTO';return i;}
function evidence(p,state='Available',w=104){let i=comp(p,'CP/Evidence','State='+state);i.resize(w,w);return i;}
function notice(p,title,body,tone='Info',w=1128){let i=comp(p,'CP/Notice','Tone='+tone);change(i,'Title',title);i.resize(w,i.height);let texts=i.findAllWithCriteria({types:['TEXT']});if(texts[1]){texts[1].characters=body;texts[1].resize(w-32,26);texts[1].textAutoResize='HEIGHT';texts[1].layoutSizingHorizontal='FILL';}if(texts[0]){texts[0].resize(w-32,texts[0].height);texts[0].textAutoResize='HEIGHT';texts[0].layoutSizingHorizontal='FILL';}i.primaryAxisSizingMode='AUTO';return i;}
function panel(p,title,w=1128){let n=B(p,title,w,'VERTICAL','surface',24,16);bind(n,'cornerRadius',12,'radius');n.strokes=P('border');T(n,title,'Heading');return n;}
function table(p,headers,rows,widths,w=1128){let f=B(p,'Table',w,'VERTICAL','surface',0,0);f.strokes=P('border');bind(f,'cornerRadius',12,'radius');let head=R(f,w,0,'bg',16);headers.forEach((v,i)=>T(head,v,'Label','muted',widths[i]));for(const row of rows){let r=R(f,w,0,'surface',16);r.counterAxisAlignItems='CENTER';for(let i=0;i<row.length;i++){let cell=B(r,'Cell '+headers[i],widths[i],'VERTICAL','surface',0,4);let val=row[i];if(typeof val==='object'){if(val.badge)badge(cell,val.badge);if(val.text)T(cell,val.text,'Caption','muted',widths[i]-8);if(val.button)btn(cell,val.button,'Secondary','Default',Math.min(widths[i]-8,160));if(val.photo)evidence(cell,'Available',48);}else T(cell,val,'Body','ink',widths[i]-8);}let line=figma.createRectangle();line.name='Divider';line.resize(w,1);fill(line,'bg');f.appendChild(line);}return f;}
function shell(name,index,title,sub,{tab=null,admin=false,height=1000}={}){const f=B(page,name,1440,'HORIZONTAL','bg',0,0);f.primaryAxisSizingMode='FIXED';f.resize(1440,height);f.x=(index%3)*1520;f.y=Math.floor(index/3)*1600;f.clipsContent=true;const nav=B(f,'Navigation',232,'VERTICAL','rail',24,24);nav.layoutSizingVertical='FILL';T(nav,'ClassPing','Heading','onRail');T(nav,admin?'พื้นที่ผู้ดูแลระบบ':'พื้นที่อาจารย์','Label','onRail');for(const label of admin?['ภาพรวม','ผู้ใช้','ห้องเรียน','รายวิชา','กล้อง','บัญชี']:['รายวิชา','กล้อง','ตรวจใบลา','บัญชี']){let r=R(nav,184,0,label===(admin?'ภาพรวม':'รายวิชา')?'action':'rail',12);T(r,label,'Label','onRail');}T(nav,'DPU · @dpu.ac.th','Caption','onRail',180);const main=B(f,'Workspace',1208,'VERTICAL','bg',40,24);main.layoutSizingVertical='FILL';const meta=R(main,1128,16,'bg');T(meta,admin?'ระบบผู้ดูแล':'รายวิชา / CS101 · กลุ่ม 01','Caption','muted',850);T(meta,'ตัวอย่างสมมติ','Caption','muted');H(main,title,sub,1128);if(tab){let tabs=R(main,1128,8,'bg');for(const label of ['เช็คชื่อ','นักศึกษา','ตารางเรียน','สอบ','เกณฑ์','รายงาน']){let i=comp(tabs,'CP/Tab','State='+(label===tab?'Active':'Default'));i.resize(160,48);i.findOne(n=>n.type==='TEXT').characters=label;}}return {f,main};}
const screens={};const actions=[];
function save(key,s){screens[key]=s.f.id;return s;}

function mobile(name,index,title,sub='',height=844){let f=B(page,name,390,'VERTICAL','bg',0,0);f.primaryAxisSizingMode='FIXED';f.resize(390,height);f.x=(index%5)*470;f.y=Math.floor(index/5)*1060;f.clipsContent=true;let status=R(f,390,0,'surface',16);T(status,'9:41','Label','ink',250);T(status,'ClassPing','Caption','muted');let header=B(f,'App bar',390,'VERTICAL','surface',24,4);T(header,title,'Heading','ink',342);if(sub)T(header,sub,'Caption','muted',342);let scroll=B(f,'Scroll area',390,'VERTICAL','bg',0,0);scroll.primaryAxisSizingMode='FIXED';scroll.layoutSizingVertical='FILL';scroll.clipsContent=true;scroll.overflowDirection='VERTICAL';let content=B(scroll,'Scrollable content',390,'VERTICAL','bg',24,20);let footer=B(f,'Bottom actions',390,'VERTICAL','surface',24,8);let line=figma.createRectangle();line.name='System gesture indicator';line.resize(120,4);fill(line,'muted');let base=R(f,390,0,'surface',12);base.primaryAxisAlignItems='CENTER';base.appendChild(line);return {f,main:content,footer,scroll};}
function mb(s,label,to,type='Primary',state='Default'){const b=btn(s.footer,label,type,state,342);if(to)actions.push({id:b.id,to});return b;}
function mnotice(p,title,body,tone='Info'){return notice(p,title,body,tone,342);}
function mpanel(p,title){return panel(p,title,342);}

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

}
const phases=[phase0,phase1,phase2,phase3,phase4,phase5,phase6,phase7];

async function main(){
  const results=[];
  for(let i=0;i<phases.length;i++){
    figma.ui.postMessage({status:'Building phase '+(i+1)+' / '+phases.length});
    results.push(await phases[i]());await Promise.all(STYLE_JOBS.splice(0));
  }
  const registry={"courses":"T01 · รายวิชา","createCourse":"T02 · สร้างรายวิชา","sessions":"T03 · คาบเรียน","attendance":"T04 · เช็คชื่อระหว่างคาบ","review":"T05 · ตรวจผลใบหน้า","reassign":"T06 · เปลี่ยนคน","reviewDone":"T07 · ตรวจสำเร็จ","rejectFace":"T08 · ปฏิเสธผลใบหน้า","editStatus":"T09 · แก้สถานะ","students":"T10 · นักศึกษา","schedule":"T11 · ตารางเรียน","override":"T12 · เปลี่ยนคาบรายวัน","exams":"T13 · คาบสอบ","examForm":"T14 · แบบฟอร์มสอบ","examConflict":"T15 · สอบทับคาบเรียน","rules":"T16 · เกณฑ์","reports":"T17 · รายงาน","leaveReview":"T18 · ตรวจใบลา","leaveReviewed":"T19 · ผลตรวจใบลา","cameras":"T20 · กล้องตามคาบ","live":"T21 · กล้องสด","recording":"T22 · บันทึกย้อนหลัง","account":"T23 · บัญชี","admin":"A01 · ภาพรวม","users":"A02 · ผู้ใช้","resetFace":"A03 · รีเซ็ตใบหน้า","rooms":"A04 · ห้องเรียน","mobileLogin":"S01 · เข้าสู่ระบบ","consent":"S02 · ความยินยอม","declined":"S03 · ไม่ยินยอม","identity":"S04 · บัตรนักศึกษา","cameraPermission":"S05 · ขอใช้กล้อง","mobileHome":"S11 · สรุปการเข้าเรียน","leaveForm":"S12 · ยื่นลา","leaveSending":"S13 · กำลังส่งใบลา","leaveHistory":"S14 · สถานะใบลา","mobileAccount":"S15 · บัญชี","cardError":"E01 · บัตรไม่ผ่าน","cameraDenied":"E02 · กล้องถูกปฏิเสธ","poseRetry":"E03 · สแกนไม่ผ่าน","ocrFailed":"E04 · OCR ไม่สำเร็จ","summaryError":"E05 · โหลดสรุปไม่ได้","mobileWebAttendance":"R01 · เว็บเช็คชื่อบนมือถือ","noCourses":"E06 · ไม่มีรายวิชา","noEligibleLeave":"E07 · ไม่มีคาบยื่นลา","leaveValidation":"E08 · หลักฐานไม่ถูกต้อง","webLogin":"W01 · เข้าสู่ระบบ","webEmpty":"W02 · ไม่มีรายวิชา","webLoading":"W03 · กำลังโหลด","webError":"W04 · Error & retry","forbidden":"W05 · ไม่มีสิทธิ์","videoEmpty":"W06 · ไม่มีบันทึก","leaveWeb":"W07 · ยื่นลาผ่านเว็บ","examLocked":"W08 · สอบเริ่มแล้ว","lastAdmin":"W09 · ผู้ดูแลคนสุดท้าย","planCameras":"P01 · จัดการกล้อง · แผนงาน","planTokenConfirm":"P02 · ยืนยัน token · แผนงาน","planTokenResult":"P03 · token ครั้งเดียว · แผนงาน","planCourseAdmin":"P04 · จัดการวิชา · แผนงาน","planCurricula":"P05 · หลักสูตร · แผนงาน","planCSVError":"P06 · CSV ไม่ผ่าน · แผนงาน","planCSVPreview":"P07 · ยืนยันนำเข้า · แผนงาน","planReference":"P08 · ข้อมูลกลาง · แผนงาน","planKnowledge":"P09 · แหล่งความรู้ · แผนงาน","planRAG":"P10 · จัดการ RAG · แผนงาน","planClassroom":"P11 · เชื่อม Classroom · แผนงาน","planClassroomSync":"P12 · ซิงก์รายวิชา · แผนงาน","planDoorway":"P13 · เวลาเข้าออก · แผนงาน","planTransfers":"P14 · คิวเทียบโอน · แผนงาน","planTransferReview":"P15 · พิจารณาเทียบโอน · แผนงาน","planTransferMapping":"P16 · คู่เทียบวิชา · แผนงาน","planStudyAssist":"P17 · ผู้ช่วยการเรียน · แผนงาน","planPublicChat":"P18 · Open House · แผนงาน","planOCRWeb":"P19 · อ่านร่างใบลา · แผนงาน","planOCRWebFailed":"P20 · OCR ล้มเหลว · แผนงาน","planMobileCourses":"P21 · รายวิชาและตาราง · แผนงาน","planMobileAttendance":"P22 · รายละเอียดเข้าเรียน · แผนงาน","planMobileEvidence":"P23 · ภาพหมดอายุ · แผนงาน","planMobileOCR":"P24 · อ่านร่างเหตุผล · แผนงาน","planMobileOCRConfirm":"P25 · ตรวจร่างก่อนส่ง · แผนงาน","planMobileChat":"P26 · แชทนักศึกษา · แผนงาน","planMobileChatNoEvidence":"P27 · แชทไม่มีหลักฐาน · แผนงาน","planMobileClassroom":"P28 · สิทธิ์ Classroom · แผนงาน","planMobileAssignments":"P29 · งานและกำหนดส่ง · แผนงาน","planMobileTransfer":"P30 · ยื่นเทียบโอน · แผนงาน","planMobileTransferResult":"P31 · ผลเทียบโอน · แผนงาน","planMobileDoorway":"P32 · เวลานอกห้อง · แผนงาน","poseFront":"S06 · หน้าตรง","poseLeft":"S07 · หันซ้าย","poseRight":"S08 · หันขวา","poseUp":"S09 · เงยหน้า","poseDown":"S10 · ก้มหน้า"};
  const frameIds={};const actions=results.flatMap(r=>r.actions||[]);
  const report={pages:[],screens:0,components:0,instances:0,variables:0,textStyles:0,links:0,overflow:[],missingTargets:[]};
  const pages=figma.root.children.filter(p=>['01 · System & product map','02 · Teacher & admin','03 · Student & responsive'].includes(p.name));
  await Promise.all(['Regular','Medium','SemiBold','Bold'].map(style=>figma.loadFontAsync({family:'IBM Plex Sans Thai',style})));
  for(const page of pages){
    await figma.setCurrentPageAsync(page);
    for(const n of page.findAll(n=>(n.type==='FRAME'||n.type==='COMPONENT')&&n.layoutMode==='HORIZONTAL'&&n.primaryAxisSizingMode==='AUTO')){
      n.primaryAxisSizingMode='FIXED';n.counterAxisSizingMode='AUTO';
    }
    for(const [key,name]of Object.entries(registry)){
      const f=page.children.find(n=>n.type==='FRAME'&&n.name===name);if(f)frameIds[key]=f.id;
    }
    for(const n of page.findAllWithCriteria({types:['INSTANCE']})){
      const mc=await n.getMainComponentAsync();const family=mc?.parent?.name;
      if(family==='CP/Notice'||family==='CP/Field'){
        const inset=family==='CP/Notice'?32:24;
        for(const t of n.findAllWithCriteria({types:['TEXT']})){t.resize(n.width-inset,t.height);t.textAutoResize='HEIGHT';t.layoutSizingHorizontal='FILL';}
        n.primaryAxisSizingMode='AUTO';
      }
    }
    const roots=page.children.filter(n=>n.type==='FRAME'&&(/^[TASWERP]\d/.test(n.name)));
    if(page.name==='02 · Teacher & admin'){
      roots.forEach((f,i)=>{f.x=(i%3)*1520;f.y=Math.floor(i/3)*1600;const m=f.children.find(n=>n.name==='Workspace');if(m){const bottom=Math.max(...m.children.map(n=>n.y+n.height));f.resize(1440,Math.max(f.height,bottom+40));}});
    }
    report.screens+=roots.length;
    report.components+=page.findAllWithCriteria({types:['COMPONENT']}).length;
    report.instances+=page.findAllWithCriteria({types:['INSTANCE']}).length;
    for(const f of roots){const main=f.children.find(n=>n.name==='Workspace');if(main)for(const n of main.children){if(n.x+n.width>main.width+1)report.overflow.push(f.name+' / '+n.name);}}
    report.pages.push({id:page.id,name:page.name,screens:roots.length});
  }
  report.visual=await applyReferenceDesign(pages);
  const byLabel={'สร้างรายวิชา':'createCourse','เปิดรายวิชา':'sessions','ดูการเช็คชื่อ':'attendance','ตรวจภาพนักศึกษา':'review','ตรวจภาพ':'review','ยืนยันว่าใช่':'reviewDone','เปลี่ยนเป็นคนอื่น':'reassign','ไม่ใช่นักศึกษาวิชานี้':'rejectFace','แก้สถานะ':'editStatus','ดูกล้อง':'live','ดูสด':'live','ดูบันทึก':'recording','เพิ่มคาบสอบ':'examForm','แก้คาบสอบ':'examForm','เปลี่ยนผู้คุม':'examLocked','บันทึกผู้คุมสอบ':'exams','ตัวอย่างยืนยันรีเซ็ต':'resetFace','จัดการผู้ใช้':'users','จัดการห้องเรียน':'rooms'};
  const topNav={'รายวิชา':'courses','กล้อง':'cameras','ตรวจใบลา':'leaveReview','บัญชี':'account','ภาพรวม':'admin','ผู้ใช้':'users','ห้องเรียน':'rooms'};
  const tabs={'เช็คชื่อ':'sessions','นักศึกษา':'students','ตารางเรียน':'schedule','สอบ':'exams','เกณฑ์':'rules','รายงาน':'reports'};
  for(const page of pages){
    await figma.setCurrentPageAsync(page);
    for(const n of page.findAllWithCriteria({types:['INSTANCE']})){
      const label=n.findAllWithCriteria({types:['TEXT']})[0]?.characters;
      const mc=await n.getMainComponentAsync();const isTab=mc?.parent?.name==='CP/Tab';
      const target=isTab?tabs[label]:byLabel[label];if(target)actions.push({id:n.id,to:target});
    }
    for(const nav of page.findAll(n=>n.type==='FRAME'&&n.name==='Navigation')){
      for(const r of nav.children.filter(n=>n.type==='FRAME')){const label=r.findOne(n=>n.type==='TEXT')?.characters;if(topNav[label])actions.push({id:r.id,to:topNav[label]});}
    }
  }
  const unique=new Map(actions.map(a=>[a.id,a]));
  for(const action of unique.values()){
    const target=frameIds[action.to];if(!target){report.missingTargets.push(action.to);continue;}
    const node=await figma.getNodeByIdAsync(action.id);const dest=await figma.getNodeByIdAsync(target);let owner=node;while(owner&&owner.parent&&owner.parent.type!=='PAGE')owner=owner.parent;if(!owner||owner===dest||owner.parent!==dest.parent)continue;if(node){await node.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:target,navigation:'NAVIGATE',transition:null,resetScrollPosition:true}]}]);report.links++;}
  }
  report.prototype=await wirePrototype(frameIds,pages);
  report.variables=(await figma.variables.getLocalVariablesAsync()).length;
  report.textStyles=(await figma.getLocalTextStylesAsync()).length;
  const exportFrames=[];
  for(const p of pages){await figma.setCurrentPageAsync(p);for(const n of p.children.filter(n=>n.type==='FRAME'))exportFrames.push({id:n.id,name:n.name,pageId:p.id});}
  const handleUI=async m=>{if(m.type==='inspect'){const n=await figma.getNodeByIdAsync(m.id);await figma.setCurrentPageAsync(n.parent);figma.currentPage.selection=[n];figma.viewport.scrollAndZoomIntoView([n]);figma.ui.hide();}if(m.type==='export'){for(let i=0;i<exportFrames.length;i++){const item=exportFrames[i];await figma.setCurrentPageAsync(await figma.getNodeByIdAsync(item.pageId));const n=await figma.getNodeByIdAsync(item.id);const bytes=await n.exportAsync({format:'PNG',constraint:{type:'SCALE',value:1}});figma.ui.postMessage({status:'Rendering '+(i+1)+' / '+exportFrames.length,file:{name:item.name+'.png',bytes}});}figma.ui.postMessage({status:'QA render complete',done:true,detail:JSON.stringify(report,null,2)});}};
  figma.ui.onmessage=handleUI;
  const start=await figma.getNodeByIdAsync(frameIds.courses);if(start){await figma.setCurrentPageAsync(start.parent);figma.viewport.scrollAndZoomIntoView([start]);}
  figma.ui.postMessage({status:'Complete · '+report.screens+' editable screens',detail:JSON.stringify(report,null,2),screens:exportFrames});
  console.log('CLASSPING_REPORT',JSON.stringify(report));
  await figma.setCurrentPageAsync((await figma.getNodeByIdAsync(frameIds.webLogin)).parent);figma.currentPage.selection=[await figma.getNodeByIdAsync(frameIds.webLogin)];figma.viewport.scrollAndZoomIntoView(figma.currentPage.selection);
  figma.ui.postMessage({status:'Updated original · '+report.screens+' screens · Thai / white / green',detail:JSON.stringify({visual:report.visual,prototype:{updated:report.prototype.updatedConnections,connected:report.prototype.totalConnectedNodes,starts:report.prototype.flowStarts,missing:report.prototype.missing},screenCount:report.screens,pages:report.pages},null,2),screens:exportFrames});
}
main().catch(e=>{figma.ui.postMessage({status:'Build stopped',detail:String(e)+'\n'+String(e.stack||'')});console.error(e);});
