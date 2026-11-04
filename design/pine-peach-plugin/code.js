
async function theme(){
const page=await figma.getNodeByIdAsync('0:1');await figma.setCurrentPageAsync(page);
const fonts=new Map();for(const n of page.findAllWithCriteria({types:['TEXT']}))for(const s of n.getStyledTextSegments(['fontName']))fonts.set(JSON.stringify(s.fontName),s.fontName);await Promise.all([...fonts.values()].map(f=>figma.loadFontAsync(f)));
const vars=await figma.variables.getLocalVariablesAsync();const map=new Map(vars.map(v=>[v.name,v]));
const cols=await figma.variables.getLocalVariableCollectionsAsync();const semantic=cols.find(c=>c.name==='CP · Semantic');
const rgb=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
const updated=[],added=[];const scopes=['FRAME_FILL','SHAPE_FILL','TEXT_FILL','STROKE_COLOR'];
const palette={forest:'#285C4D',teal:'#285C4D',tealHover:'#214C40',mint:'#E8F0EA',paper:'#F6F7F3',white:'#FFFFFF',ink:'#202923',muted:'#617068',line:'#D9E1D8',amber:'#7A5300',amberBg:'#FFF3D6',red:'#B33D38',redBg:'#FCEDEB',blue:'#365F80',blueBg:'#EAF2F9',slate:'#46544B'};
for(const [name,hex] of Object.entries(palette)){const v=map.get('palette/'+name);for(const mode of Object.keys(v.valuesByMode))v.setValueForMode(mode,{...rgb(hex),a:1});v.scopes=scopes;updated.push(v.id);}
for(const [name,hex] of Object.entries({'color/accent':'#F3CDB5','color/onAccent':'#62412F','color/success':'#216344','color/successBg':'#E7F4EB','color/controlBorder':'#839187','color/soft':'#EEF2EB','color/disabled':'#E5E9E2','color/late':'#8A460B','color/lateBg':'#FFF0E2'})){let v=map.get(name);if(!v){v=figma.variables.createVariable(name,semantic,'COLOR');map.set(name,v);added.push(v.id);}v.scopes=scopes;v.setValueForMode(semantic.modes[0].modeId,{...rgb(hex),a:1});}
for(const [name,target] of [['color/rail','palette/white'],['color/onRail','palette/ink']]){const v=map.get(name);v.setValueForMode(semantic.modes[0].modeId,figma.variables.createVariableAlias(map.get(target)));updated.push(v.id);}
const touched=new Set();function paint(n,prop,key){n[prop]=[figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',map.get(key))];touched.add(n.id);}
function radius(n,val){const v=map.get('radius/'+val);for(const k of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'])n.setBoundVariable(k,v);touched.add(n.id);}
function texts(n,key){for(const t of n.findAllWithCriteria({types:['TEXT']}))paint(t,'fills',key);}
const sets=page.findAllWithCriteria({types:['COMPONENT_SET']});
for(const set of sets)for(const c of set.children){if(c.type!=='COMPONENT')continue;
 if(set.name==='CP/Button'){const secondary=c.name.includes('Secondary'),tertiary=c.name.includes('Tertiary'),danger=c.name.includes('Danger'),disabled=c.name.includes('Disabled'),hover=c.name.includes('Hover');paint(c,'fills',disabled?'color/disabled':danger?'color/danger':secondary?'color/selected':tertiary?'color/surface':hover?'color/actionHover':'color/action');texts(c,disabled?'color/muted':secondary||tertiary?'color/action':'color/onAction');radius(c,12);if(c.strokes.length)paint(c,'strokes',c.name.includes('Focus')?'color/action':'color/border');}
 else if(set.name==='CP/Status'){const s=c.name.split('=')[1];let fg='color/muted',bg='color/soft';if(['Present','Approved','Live'].includes(s)){fg='color/success';bg='color/successBg';}if(s==='Late'){fg='color/late';bg='color/lateBg';}if(['Absent','Rejected'].includes(s)){fg='color/danger';bg='color/dangerBg';}if(s==='Pending'){fg='color/warning';bg='color/warningBg';}if(['Leave','Upcoming','Exam'].includes(s)){fg='color/info';bg='color/infoBg';}paint(c,'fills',bg);texts(c,fg);radius(c,8);}
 else if(set.name==='CP/Field'){paint(c,'fills',c.name.includes('Disabled')?'color/disabled':'color/surface');paint(c,'strokes',c.name.includes('Error')?'color/danger':c.name.includes('Focus')?'color/action':'color/controlBorder');texts(c,'color/ink');radius(c,12);}
 else if(set.name==='CP/Tab'){paint(c,'fills',c.name.includes('Active')?'color/selected':'color/surface');texts(c,c.name.includes('Active')?'color/action':'color/muted');radius(c,12);}
 else if(set.name==='CP/Notice'){const tone=c.name.split('=')[1];const key={Warning:['warning','warningBg'],Error:['danger','dangerBg'],Success:['success','successBg'],Info:['info','infoBg']}[tone];paint(c,'fills','color/'+key[1]);texts(c,'color/'+key[0]);radius(c,12);}
 else if(set.name==='CP/Evidence'){paint(c,'fills','color/soft');texts(c,'color/ink');radius(c,12);}
}
const button=await figma.getNodeByIdAsync('3:387');
for(const c of button.children){if(c.type!=='COMPONENT'||!c.name.includes('State=Default'))continue;const type=c.name.split(',')[0];const hover=button.children.find(n=>n.name===type+', State=Hover');if(hover){await c.setReactionsAsync([{trigger:{type:'ON_HOVER'},actions:[{type:'NODE',destinationId:hover.id,navigation:'CHANGE_TO',transition:{type:'SMART_ANIMATE',easing:{type:'EASE_OUT'},duration:0.1}}]}]);touched.add(c.id);}}
return {mutatedNodeIds:[...touched],updatedVariableIds:updated,createdVariableIds:added,componentSets:sets.length,fonts:[...fonts.values()]};}
async function repair(pageId){
const page=await figma.getNodeByIdAsync(pageId);await figma.setCurrentPageAsync(page);
const nodes=page.findAll(()=>true);const fonts=new Map();for(const n of nodes)if(n.type==='TEXT')for(const s of n.getStyledTextSegments(['fontName']))fonts.set(JSON.stringify(s.fontName),s.fontName);await Promise.all([...fonts.values()].map(f=>figma.loadFontAsync(f)));
const vm=new Map((await figma.variables.getLocalVariablesAsync()).map(v=>[v.name,v]));const ids=new Set(),mainCache=new Map();
function paint(n,prop,key){n[prop]=[figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',vm.get(key))];ids.add(n.id);}
const roles={Present:['success','successBg'],Approved:['success','successBg'],Live:['success','successBg'],Late:['late','lateBg'],Absent:['danger','dangerBg'],Rejected:['danger','dangerBg'],Leave:['info','infoBg'],Upcoming:['info','infoBg'],Exam:['info','infoBg'],Pending:['warning','warningBg']};
for(const n of nodes){if(n.type==='FRAME'){if(n.parent===page)paint(n,'fills','color/bg');else if(n.name==='Navigation')paint(n,'fills','color/surface');else if(['Workspace','Scroll area','Scrollable content','App bar'].includes(n.name))paint(n,'fills','color/bg');else if(n.name==='Bottom actions')paint(n,'fills','color/surface');else if(n.cornerRadius>0&&n.width>300&&n.height>100){for(const k of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'])n.setBoundVariable(k,vm.get('radius/16'));ids.add(n.id);}}
if(n.type!=='TEXT')continue;
let key=typeof n.fontSize==='number'&&n.fontSize<=12?'color/muted':'color/ink';let parent=n.parent,inst=null;
while(parent&&parent!==page){if(parent.type==='INSTANCE'){inst=parent;break;}parent=parent.parent;}
if(inst){let m=mainCache.get(inst.id);if(!m){const main=await inst.getMainComponentAsync();m=main?.name||'';mainCache.set(inst.id,m);}
 if(inst.name==='CP/Button'){key=m.includes('Disabled')?'color/muted':m.includes('Secondary')||m.includes('Tertiary')?'color/action':'color/onAction';}
 else if(inst.name==='CP/Status'){key='color/'+(roles[m.split('=')[1]]?.[0]||'muted');}
 else if(inst.name==='CP/Notice'){key='color/'+({Warning:'warning',Error:'danger',Success:'success',Info:'info'}[m.split('=')[1]]||'ink');}
 else if(inst.name==='CP/Tab'){key=m.includes('Active')?'color/action':'color/muted';}
 else key='color/ink';
}
paint(n,'fills',key);
}
let reactions=0;const destinations=new Map();for(const n of nodes){if(!('reactions'in n)||!n.reactions?.length)continue;const next=[];for(const r of n.reactions){const actions=[];for(const a of (r.actions||[r.action]).filter(Boolean)){if(a.type==='NODE'&&a.navigation==='NAVIGATE'){let p=n,self=false;while(p&&p!==page){if(p.id===a.destinationId)self=true;p=p.parent;}if(self)continue;let dest=destinations.get(a.destinationId);if(dest===undefined){dest=await figma.getNodeByIdAsync(a.destinationId);destinations.set(a.destinationId,dest);}if(!dest||dest.parent!==page)continue;actions.push({...a,transition:{type:'DISSOLVE',easing:{type:'EASE_OUT'},duration:0.16}});}else actions.push(a);}if(actions.length)next.push({trigger:r.trigger,actions});}await n.setReactionsAsync(next);ids.add(n.id);reactions++;}
return {mutatedNodeIds:[...ids],pageId:page.id,screenCount:page.children.filter(n=>n.type==='FRAME').length,reactionsUpdated:reactions,fontFamilies:[...new Set([...fonts.values()].map(f=>f.family))]};
}
async function buildMobile(){
const page=await figma.getNodeByIdAsync('3:529');await figma.setCurrentPageAsync(page);
if(page.children.some(n=>n.name==='2026 · Pine & Peach · Student'))throw new Error('Student redesign already exists; inspect before retry');

const created=[],mutated=[],pendingLinks=[];const add=n=>(created.push(n.id),n);
const vm=new Map((await figma.variables.getLocalVariablesAsync()).map(v=>[v.name,v]));
const styles=new Map((await figma.getLocalTextStylesAsync()).map(s=>[s.name,s.id]));
await Promise.all(['Regular','Medium','SemiBold'].map(style=>figma.loadFontAsync({family:'Kanit',style})));
function paint(n,key,prop='fills'){n[prop]=[figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',vm.get(key))];}
function rounding(n,r){const v=vm.get('radius/'+r);for(const k of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'])n.setBoundVariable(k,v);}
function f(name,w,dir='VERTICAL',bg=null,pad=0,gap=12){const n=add(figma.createFrame());n.name=name;n.layoutMode=dir;n.resize(w,1);n.primaryAxisSizingMode=dir==='HORIZONTAL'?'FIXED':'AUTO';n.counterAxisSizingMode=dir==='HORIZONTAL'?'AUTO':'FIXED';n.itemSpacing=gap;n.paddingLeft=n.paddingRight=n.paddingTop=n.paddingBottom=pad;n.fills=[];n.clipsContent=false;if(bg)paint(n,'color/'+bg);return n;}
function put(p,n,fill=false){p.appendChild(n);if(fill)n.layoutSizingHorizontal='FILL';return n;}
async function t(p,s,style='Body',color='ink',w){const n=add(figma.createText());n.name=s.slice(0,70);n.fontName={family:'Kanit',style:style==='Label'?'Medium':['Heading','Title','Metric','Display'].includes(style)?'SemiBold':'Regular'};n.characters=s;await n.setTextStyleIdAsync(styles.get('CP/'+style));if(w){n.textAutoResize='HEIGHT';n.resize(w,Math.max(n.height,20));}else n.textAutoResize='WIDTH_AND_HEIGHT';paint(n,'color/'+color);p.appendChild(n);return n;}
const paths={home:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',courses:'M4 4h6v16H4z M14 4h6v16h-6z',leave:'M7 3v4m10-4v4M4 5h16v16H4zM8 12h8m-8 4h5',chat:'M3 4h18v13H9l-6 4zM7 9h10M7 13h6',user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',clock:'M12 8v5l3 2M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0',arrow:'M5 12h14m-5-5 5 5-5 5',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',check:'m5 12 4 4L19 6',close:'m6 6 12 12M18 6 6 18',attach:'m8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9',calendar:'M7 3v4m10-4v4M3 6h18v15H3zM3 10h18',chevron:'m9 5 7 7-7 7'};
function icon(p,name,color='ink',size=22){const n=add(figma.createNodeFromSvg('<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="'+paths[name]+'" stroke="#202923" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'));n.name='icon/'+name;n.resize(size,size);for(const x of n.findAll(()=>true)){created.push(x.id);if('strokes'in x&&x.strokes.length)paint(x,'color/'+color,'strokes');}p.appendChild(n);return n;}
const buttonMasters={Primary:await figma.getNodeByIdAsync('3:357'),Secondary:await figma.getNodeByIdAsync('3:367'),Tertiary:await figma.getNodeByIdAsync('2009:1504'),Danger:await figma.getNodeByIdAsync('3:377')};
function instance(p,master){const n=add(master.createInstance());for(const c of n.findAll(()=>true))created.push(c.id);p.appendChild(n);return n;}
function button(p,label,type='Primary',width=180){const n=instance(p,buttonMasters[type]);n.setProperties({'Label#3:48':label});n.resize(width,48);return n;}
const statusMasters={Pending:await figma.getNodeByIdAsync('3:396'),Approved:await figma.getNodeByIdAsync('3:400'),Rejected:await figma.getNodeByIdAsync('3:402'),Present:await figma.getNodeByIdAsync('3:388'),Exam:await figma.getNodeByIdAsync('3:410')};
function badge(p,status){return instance(p,statusMasters[status]);}
async function field(p,label,value,w){const n=instance(p,await figma.getNodeByIdAsync('3:426'));n.setProperties({'Label#3:59':label,'Value#3:60':value});n.resize(w,78);return n;}
async function line(p,w){const n=f('Divider',w,'HORIZONTAL','border',0,0);n.resize(w,1);n.primaryAxisSizingMode='FIXED';return put(p,n);}
async function title(p,name,subtitle,w){await t(p,name,'Title','ink',w);if(subtitle)await t(p,subtitle,'Body','muted',w);}
async function link(n,dest,duration=.22){pendingLinks.push({n,destId:dest.id,duration});}
function evidence(n){const nodes=n.findAll(()=>true),counts={};for(const x of nodes)counts[x.type]=(counts[x.type]||0)+1;return {id:n.id,name:n.name,width:n.width,height:n.height,descendantCount:nodes.length,nodeTypes:counts,imageNodes:nodes.filter(x=>'fills'in x&&Array.isArray(x.fills)&&x.fills.some(p=>p.type==='IMAGE')).map(x=>({id:x.id,name:x.name,type:x.type,width:x.width,height:x.height})),fonts:[...new Set(nodes.filter(x=>x.type==='TEXT').flatMap(x=>x.getStyledTextSegments(['fontName']).map(s=>s.fontName.family)))]};}

const start=Math.max(...page.children.map(n=>n.x+n.width))+200;
const board=add(figma.createSection());board.name='2026 · Pine & Peach · Student';board.x=start;board.y=0;board.resizeWithoutConstraints(2206,1040);paint(board,'color/bg');
const header=f('Student introduction',2142,'VERTICAL',null,0,8);put(board,header);header.x=32;header.y=24;await t(header,'ClassPing · Student experience','Title','ink');await t(header,'ข้อมูลตัวอย่างสมมติ · Kanit เดิม · แตะเมนูและปุ่มเพื่อทดลอง flow','Body','muted');
const row=board;let phoneIndex=0;
async function phone(name,heading,active){
 const screen=f(name,390,'VERTICAL','bg',0,0);put(row,screen);screen.x=32+(phoneIndex++)*438;screen.y=150;screen.resize(390,844);screen.primaryAxisSizingMode='FIXED';screen.clipsContent=true;
 const status=f('Status bar',390,'HORIZONTAL',null,24,0);status.paddingTop=12;status.paddingBottom=8;await t(status,'9:41','Label');const spacer=f('Spacer',200,'HORIZONTAL');put(status,spacer);spacer.layoutSizingHorizontal='FILL';await t(status,'ClassPing','Caption','muted');put(screen,status);
 const header=f('App header',390,'VERTICAL',null,24,4);header.paddingTop=12;header.paddingBottom=16;await t(header,heading,'Heading','ink',342);await t(header,'ข้อมูลตัวอย่างสมมติ','Caption','muted',342);put(screen,header);
 const body=f('Content',390,'VERTICAL',null,24,16);body.paddingTop=8;body.paddingBottom=16;put(screen,body);body.layoutSizingVertical='FILL';body.clipsContent=true;body.overflowDirection='VERTICAL';
 const nav=f('Bottom navigation',390,'HORIZONTAL','surface',16,0);nav.paddingTop=12;nav.paddingBottom=20;const navs=[];
 for(const [label,key]of [['หน้าหลัก','home'],['รายวิชา','courses'],['การลา','leave'],['ผู้ช่วย','chat'],['บัญชี','user']]){
 const item=f('Nav · '+label,71.6,'VERTICAL',label===active?'selected':null,6,4);rounding(item,12);item.counterAxisAlignItems='CENTER';icon(item,key,label===active?'action':'muted',20);await t(item,label,'Caption',label===active?'action':'muted');put(nav,item);navs.push(item);
 }put(screen,nav);return {screen,body,navs};
}
async function lesson(parent,time,code,name,meta,selected=false){
 const r=f('Lesson · '+code,342,'HORIZONTAL',selected?'surface':null,selected?16:0,16);if(selected)rounding(r,16);const inner=selected?310:342;const times=f('Time',66,'VERTICAL',null,0,0);await t(times,time.split('–')[0],'Label','ink',66);await t(times,time.split('–')[1],'Caption','muted',66);put(r,times);
 const info=f('Course details',inner-82,'VERTICAL',null,0,4);await t(info,code,'Heading','ink',inner-82);await t(info,name,'Body','ink',inner-82);await t(info,meta,'Caption','muted',inner-82);put(r,info);put(parent,r);return r;
}
const home=await phone('S26 · หน้าหลัก','หน้าหลัก','หน้าหลัก');
await t(home.body,'นักศึกษาตัวอย่าง ก','Title','ink',342);
const date=f('Today',342,'HORIZONTAL',null,0,12);const dp=f('Date chip',160,'HORIZONTAL','accent',12,4);dp.paddingTop=dp.paddingBottom=6;rounding(dp,8);icon(dp,'calendar','onAccent',18);await t(dp,'จันทร์ 9 พ.ย.','Label','onAccent');put(date,dp);put(home.body,date);
await t(home.body,'รายวิชา','Heading');
const hlesson=await lesson(home.body,'09:00–12:00','CS101 · กลุ่ม 01','การเขียนโปรแกรมเบื้องต้น','ห้อง 301 · คาบเรียน',true);
const summary=f('สรุปของฉัน',342,'VERTICAL','selected',20,6);rounding(summary,16);await t(summary,'สรุปของฉัน','Label','action');const sr=f('Summary row',302,'HORIZONTAL',null,0,20);await t(sr,'100%','Metric','action');const meta=f('Counts',180,'VERTICAL',null,0,2);await t(meta,'มา 1 · สาย 0 · ขาด 0','Caption','action',180);await t(meta,'ลา 0 · รอตรวจ 0','Caption','action',180);put(sr,meta);put(summary,sr);put(home.body,summary);await t(home.body,'กล้องในห้องเรียนบันทึกการเข้าเรียนให้','Caption','muted',342);
const timetable=await phone('S27 · รายวิชาและตารางเรียน','รายวิชา','รายวิชา');
const segment=f('Study tabs',342,'HORIZONTAL','soft',4,8);rounding(segment,12);const tab1=instance(segment,await figma.getNodeByIdAsync('3:430'));tab1.resize(163,44);const tab2=instance(segment,await figma.getNodeByIdAsync('3:432'));tab2.resize(163,44);for(const [n,label]of [[tab1,'รายวิชา'],[tab2,'ตารางเรียน']]){for(const tx of n.findAllWithCriteria({types:['TEXT']}))tx.characters=label;}put(timetable.body,segment);
const days=f('Week selector',342,'HORIZONTAL',null,0,6);const dayNodes=[];
for(const [label,number,sel]of [['พฤ','5',false],['ศ','6',false],['ส','7',false],['อา','8',false],['จ','9',true],['อ','10',false]]){
 const d=f('Day · '+number,52,'VERTICAL',sel?'action':'surface',8,2);d.counterAxisAlignItems='CENTER';rounding(d,12);await t(d,label,'Caption',sel?'onAction':'muted');await t(d,number,'Heading',sel?'onAction':'ink');put(days,d);dayNodes.push(d);
}put(timetable.body,days);await t(timetable.body,'วันจันทร์ที่ 9 พ.ย.','Heading');
const tl1=await lesson(timetable.body,'09:00–12:00','CS101 · กลุ่ม 01','การเขียนโปรแกรมเบื้องต้น','สอบ · ห้อง 301');await line(timetable.body,342);const tl2=await lesson(timetable.body,'12:50–15:00','CS101 · กลุ่ม 01','การเขียนโปรแกรมเบื้องต้น','เรียน · ห้อง 301');const detail=button(timetable.body,'ดูผลเข้าเรียน','Secondary',342);
const leave=await phone('S28 · ยื่นคำขอลา','การลา','การลา');
await t(leave.body,'ยื่นคำขอลา','Title','ink',342);await field(leave.body,'คาบที่ต้องการลา','CS101 · 9 พ.ย. · 09:00–12:00',342);
await field(leave.body,'เหตุผลการลา','มีนัดพบแพทย์ตามใบนัด',342);
const upload=f('Attachment',342,'HORIZONTAL','surface',16,12);rounding(upload,12);icon(upload,'attach','action',22);const uf=f('File information',240,'VERTICAL',null,0,2);await t(uf,'ใบนัดตัวอย่าง.jpg','Label','ink',240);await t(uf,'รองรับ JPG/PNG ขนาดไม่เกิน 25 MB','Caption','muted',240);put(upload,uf);put(leave.body,upload);
const ocr=button(leave.body,'อ่านหลักฐานช่วยกรอกเหตุผล','Secondary',342);await t(leave.body,'OCR เป็นข้อมูลร่าง ไม่รับรองความแท้ของหลักฐาน','Caption','muted',342);const send=button(leave.body,'ส่งคำขอลา','Primary',342);
const result=await phone('S29 · สถานะคำขอลา','การลา','การลา');
const statusCard=f('Request status',342,'VERTICAL','surface',24,16);rounding(statusCard,16);const ok=f('Submission acknowledgement',294,'HORIZONTAL','selected',12,12);rounding(ok,12);icon(ok,'check','action',22);await t(ok,'ส่งคำขอลาแล้ว','Heading','action',236);put(statusCard,ok);await t(statusCard,'คำขอลาของฉัน','Heading','ink',294);badge(statusCard,'Pending');await t(statusCard,'CS101 · 9 พ.ย. 2569','Body','ink',294);await t(statusCard,'มีนัดพบแพทย์ตามใบนัด','Body','ink',294);await t(statusCard,'ส่งเมื่อ 4 พ.ย. 2569 09:00','Caption','muted',294);put(result.body,statusCard);const back=button(result.body,'รายวิชาและตาราง','Secondary',342);
const chat=await phone('S30 · DPU Chat','ผู้ช่วย','ผู้ช่วย');
await t(chat.body,'DPU Chat','Title','ink',342);await t(chat.body,'ถามข้อมูลมหาวิทยาลัย','Body','muted',342);
const q=f('Question',306,'VERTICAL','selected',16,0);rounding(q,16);await t(q,'ทุนประกายหมึกปิดรับวันไหน','Body','action',274);put(chat.body,q);q.layoutAlign='MAX';
const a=f('Answer',342,'VERTICAL','surface',20,10);rounding(a,16);await t(a,'ไม่พบข้อมูลที่รองรับคำถามนี้ในแหล่งข้อมูลที่คุณมีสิทธิ์เข้าถึง','Body','ink',302);put(chat.body,a);
const flex=f('Chat space',342);put(chat.body,flex);flex.layoutSizingVertical='FILL';await field(chat.body,'คำถาม','ถามเกี่ยวกับ DPU…',342);const ask=button(chat.body,'ส่งคำถาม','Primary',342);await t(chat.body,'รุ่นทดสอบ · ตอบจากข้อมูลที่มีในระบบ','Caption','muted',342);
const screens=[home,timetable,leave,chat];for(const ph of [home,timetable,leave,result,chat])for(let i=0;i<5;i++){const dest=i===4?await figma.getNodeByIdAsync('2001:1829'):screens[i].screen;await link(ph.navs[i],dest);}
await link(hlesson,timetable.screen);await link(tl1,leave.screen);await link(tl2,leave.screen);await link(detail,await figma.getNodeByIdAsync('2009:1251'));await link(send,result.screen,.32);await link(back,timetable.screen);await link(ocr,await figma.getNodeByIdAsync('2009:1303'));


async function finalizeScreens(board,specs){
 const targets=[];for(const [fresh,id,name]of specs){const old=id?await figma.getNodeByIdAsync(id):null;if(id&&(!old||old.type!=='FRAME'))throw new Error('Missing original screen: '+id);targets.push({fresh,old,name});}
 const redirect=new Map(targets.filter(x=>x.old).map(x=>[x.fresh.id,x.old.id]));
 const finals=[];
 for(const {fresh,old,name}of targets){
  if(!old){const xy={x:fresh.absoluteBoundingBox.x,y:fresh.absoluteBoundingBox.y};page.appendChild(fresh);fresh.x=xy.x;fresh.y=xy.y;fresh.name=name;finals.push(fresh);continue;}
  const x=old.x,y=old.y;for(const child of [...old.children])child.remove();
  old.layoutMode=fresh.layoutMode;old.itemSpacing=fresh.itemSpacing;old.paddingTop=fresh.paddingTop;old.paddingBottom=fresh.paddingBottom;old.paddingLeft=fresh.paddingLeft;old.paddingRight=fresh.paddingRight;old.primaryAxisAlignItems=fresh.primaryAxisAlignItems;old.counterAxisAlignItems=fresh.counterAxisAlignItems;old.fills=fresh.fills;old.strokes=fresh.strokes;old.clipsContent=true;old.resize(fresh.width,fresh.height);old.primaryAxisSizingMode='FIXED';old.counterAxisSizingMode='FIXED';
  for(const child of [...fresh.children])old.appendChild(child);old.x=x;old.y=y;old.name=name;mutated.push(old.id);finals.push(old);
 }
 for(const frame of finals)for(const node of [frame,...frame.findAll(()=>true)]){
  if(node===frame){await node.setReactionsAsync([]);continue;}
  if(!('reactions'in node)||!node.reactions.length)continue;const next=node.reactions.map(r=>({trigger:r.trigger,actions:(r.actions||[r.action]).filter(Boolean).map(a=>a.type==='NODE'&&redirect.has(a.destinationId)?{...a,destinationId:redirect.get(a.destinationId)}:a)}));
  await node.setReactionsAsync(next);
 }
 for(const {n,destId,duration}of pendingLinks){const target=redirect.get(destId)||destId;let p=n,self=false;while(p){if(p.id===target)self=true;p=p.parent;}if(!self)await n.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:target,navigation:'NAVIGATE',transition:{type:'DISSOLVE',easing:{type:'EASE_OUT'},duration},resetScrollPosition:true}]}]);}
 board.remove();return finals;
}

const finalScreens=await finalizeScreens(board,[[home.screen,'2001:1726','S11 · สรุปการเข้าเรียน'],[timetable.screen,'2009:1229','S16 · รายวิชาและตารางเรียน'],[leave.screen,'2001:1756','S12 · ยื่นลา'],[result.screen,'2001:1801','S14 · สถานะใบลา'],[chat.screen,'2009:1350','S17 · DPU Chat']]);

return {createdNodeIds:created,mutatedNodeIds:mutated,screens:finalScreens.map(evidence),prototypeLinks:29};
}
async function buildWeb(){
const page=await figma.getNodeByIdAsync('3:528');await figma.setCurrentPageAsync(page);
if(page.children.some(n=>n.name==='2026 · Pine & Peach · Teacher and admin'))throw new Error('Teacher redesign already exists');

const created=[],mutated=[],pendingLinks=[];const add=n=>(created.push(n.id),n);
const vm=new Map((await figma.variables.getLocalVariablesAsync()).map(v=>[v.name,v]));
const styles=new Map((await figma.getLocalTextStylesAsync()).map(s=>[s.name,s.id]));
await Promise.all(['Regular','Medium','SemiBold'].map(style=>figma.loadFontAsync({family:'Kanit',style})));
function paint(n,key,prop='fills'){n[prop]=[figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',vm.get(key))];}
function rounding(n,r){const v=vm.get('radius/'+r);for(const k of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'])n.setBoundVariable(k,v);}
function f(name,w,dir='VERTICAL',bg=null,pad=0,gap=12){const n=add(figma.createFrame());n.name=name;n.layoutMode=dir;n.resize(w,1);n.primaryAxisSizingMode=dir==='HORIZONTAL'?'FIXED':'AUTO';n.counterAxisSizingMode=dir==='HORIZONTAL'?'AUTO':'FIXED';n.itemSpacing=gap;n.paddingLeft=n.paddingRight=n.paddingTop=n.paddingBottom=pad;n.fills=[];n.clipsContent=false;if(bg)paint(n,'color/'+bg);return n;}
function put(p,n,fill=false){p.appendChild(n);if(fill)n.layoutSizingHorizontal='FILL';return n;}
async function t(p,s,style='Body',color='ink',w){const n=add(figma.createText());n.name=s.slice(0,70);n.fontName={family:'Kanit',style:style==='Label'?'Medium':['Heading','Title','Metric','Display'].includes(style)?'SemiBold':'Regular'};n.characters=s;await n.setTextStyleIdAsync(styles.get('CP/'+style));if(w){n.textAutoResize='HEIGHT';n.resize(w,Math.max(n.height,20));}else n.textAutoResize='WIDTH_AND_HEIGHT';paint(n,'color/'+color);p.appendChild(n);return n;}
const paths={home:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',courses:'M4 4h6v16H4z M14 4h6v16h-6z',leave:'M7 3v4m10-4v4M4 5h16v16H4zM8 12h8m-8 4h5',chat:'M3 4h18v13H9l-6 4zM7 9h10M7 13h6',user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',clock:'M12 8v5l3 2M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0',arrow:'M5 12h14m-5-5 5 5-5 5',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',check:'m5 12 4 4L19 6',close:'m6 6 12 12M18 6 6 18',attach:'m8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9',calendar:'M7 3v4m10-4v4M3 6h18v15H3zM3 10h18',chevron:'m9 5 7 7-7 7'};
function icon(p,name,color='ink',size=22){const n=add(figma.createNodeFromSvg('<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="'+paths[name]+'" stroke="#202923" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'));n.name='icon/'+name;n.resize(size,size);for(const x of n.findAll(()=>true)){created.push(x.id);if('strokes'in x&&x.strokes.length)paint(x,'color/'+color,'strokes');}p.appendChild(n);return n;}
const buttonMasters={Primary:await figma.getNodeByIdAsync('3:357'),Secondary:await figma.getNodeByIdAsync('3:367'),Tertiary:await figma.getNodeByIdAsync('2009:1504'),Danger:await figma.getNodeByIdAsync('3:377')};
function instance(p,master){const n=add(master.createInstance());for(const c of n.findAll(()=>true))created.push(c.id);p.appendChild(n);return n;}
function button(p,label,type='Primary',width=180){const n=instance(p,buttonMasters[type]);n.setProperties({'Label#3:48':label});n.resize(width,48);return n;}
const statusMasters={Pending:await figma.getNodeByIdAsync('3:396'),Approved:await figma.getNodeByIdAsync('3:400'),Rejected:await figma.getNodeByIdAsync('3:402'),Present:await figma.getNodeByIdAsync('3:388'),Exam:await figma.getNodeByIdAsync('3:410')};
function badge(p,status){return instance(p,statusMasters[status]);}
async function field(p,label,value,w){const n=instance(p,await figma.getNodeByIdAsync('3:426'));n.setProperties({'Label#3:59':label,'Value#3:60':value});n.resize(w,78);return n;}
async function line(p,w){const n=f('Divider',w,'HORIZONTAL','border',0,0);n.resize(w,1);n.primaryAxisSizingMode='FIXED';return put(p,n);}
async function title(p,name,subtitle,w){await t(p,name,'Title','ink',w);if(subtitle)await t(p,subtitle,'Body','muted',w);}
async function link(n,dest,duration=.22){pendingLinks.push({n,destId:dest.id,duration});}
function evidence(n){const nodes=n.findAll(()=>true),counts={};for(const x of nodes)counts[x.type]=(counts[x.type]||0)+1;return {id:n.id,name:n.name,width:n.width,height:n.height,descendantCount:nodes.length,nodeTypes:counts,imageNodes:nodes.filter(x=>'fills'in x&&Array.isArray(x.fills)&&x.fills.some(p=>p.type==='IMAGE')).map(x=>({id:x.id,name:x.name,type:x.type,width:x.width,height:x.height})),fonts:[...new Set(nodes.filter(x=>x.type==='TEXT').flatMap(x=>x.getStyledTextSegments(['fontName']).map(s=>s.fontName.family)))]};}

const start=Math.max(...page.children.map(n=>n.x+n.width))+200;
const board=add(figma.createSection());board.name='2026 · Pine & Peach · Teacher and admin';board.x=start;board.y=0;board.resizeWithoutConstraints(2992,3230);paint(board,'color/bg');
const heading=f('Introduction',2880,'VERTICAL',null,0,8);put(board,heading);heading.x=32;heading.y=24;await t(heading,'ClassPing · Teacher & admin experience','Title');await t(heading,'ข้อมูลตัวอย่างสมมติ · อาจารย์พิจารณาคำขอ แอดมินติดตามเฉพาะสถานะ','Body','muted');
let index=0;
async function desktop(name,titleText,role='teacher',active='รายวิชา'){
 const screen=f(name,1440,'HORIZONTAL','bg',0,0);screen.resize(1440,960);screen.primaryAxisSizingMode='FIXED';screen.counterAxisSizingMode='FIXED';put(board,screen);const pos=index++;screen.x=32+(pos%2)*1488;screen.y=150+Math.floor(pos/2)*1008;screen.clipsContent=true;
 const nav=f('Navigation',232,'VERTICAL','surface',24,12);nav.resize(232,960);nav.primaryAxisSizingMode='FIXED';await t(nav,'ClassPing','Heading','action',184);await t(nav,role==='teacher'?'พื้นที่อาจารย์':'ระบบผู้ดูแล','Caption','muted',184);
 const labels=role==='teacher'?['รายวิชา','กล้อง','ตรวจใบลา','บัญชี']:['ภาพรวม','ผู้ใช้','ห้องเรียน','กล้องประจำห้อง','รายวิชาและตารางเรียน','หลักสูตร','เทียบโอน','ข้อมูลกลาง','แหล่งความรู้','สถานะการลา'];
 const navItems={};for(const label of labels){const item=f('Nav · '+label,184,'HORIZONTAL',label===active?'selected':null,12,10);rounding(item,12);item.paddingTop=item.paddingBottom=10;const key=label==='รายวิชา'?'courses':label==='ตรวจใบลา'||label==='สถานะการลา'?'leave':label==='บัญชี'||label==='ผู้ใช้'?'user':'home';icon(item,key,label===active?'action':'muted',20);await t(item,label,'Label',label===active?'action':'ink',130);put(nav,item);navItems[label]=item;}
 const space=f('Space',184);put(nav,space);space.layoutSizingVertical='FILL';await line(nav,184);await t(nav,'DPU · @dpu.ac.th','Caption','muted',184);put(screen,nav);
 const workspace=f('Workspace',1208,'VERTICAL',null,40,24);put(screen,workspace);workspace.layoutSizingVertical='FILL';
 const h=f('Page heading',1128,'HORIZONTAL',null,0,16);const ht=f('Title group',870,'VERTICAL',null,0,6);await t(ht,titleText,'Title','ink',870);await t(ht,'ข้อมูลตัวอย่างสมมติ','Caption','muted',870);put(h,ht);put(workspace,h);
 return {screen,workspace,navItems,heading:h};
}
const courses=await desktop('T26 · รายวิชา','วิชาของฉัน');
const courseList=f('Course list',1128,'VERTICAL','surface',28,20);rounding(courseList,16);
const courseRow=f('Course overview',1072,'HORIZONTAL',null,0,24);const titleGroup=f('Course identity',640,'VERTICAL',null,0,8);await t(titleGroup,'CS101 · กลุ่ม 01','Heading','ink',640);await t(titleGroup,'การเขียนโปรแกรมเบื้องต้น','Body','muted',640);put(courseRow,titleGroup);const open=button(courseRow,'ดูรายละเอียด','Secondary',180);put(courseList,courseRow);await line(courseList,1072);
const ctools=f('Teaching actions',1072,'HORIZONTAL',null,0,12);const roster=button(ctools,'นักศึกษา','Tertiary',180),schedule=button(ctools,'ตารางเรียน','Tertiary',180),report=button(ctools,'รายงาน','Tertiary',180);put(courseList,ctools);put(courses.workspace,courseList);
const under=f('Teaching overview',1128,'HORIZONTAL',null,0,24);const day=f('Class sessions',552,'VERTICAL','surface',24,16);rounding(day,16);await t(day,'คาบเรียน','Heading');await t(day,'วันจันทร์ที่ 9 พ.ย.','Body','muted');const today=f('Date detail',504,'HORIZONTAL','accent',16,16);rounding(today,12);icon(today,'clock','onAccent');const times=f('Session information',420,'VERTICAL',null,0,4);await t(times,'09:00–12:00','Heading','onAccent',420);await t(times,'CS101 · ห้อง 301','Body','onAccent',420);put(today,times);put(day,today);put(under,day);
const queue=f('Leave overview',552,'VERTICAL','surface',24,16);rounding(queue,16);await t(queue,'ตรวจคำขอลา','Heading');const qr=f('Pending request',504,'HORIZONTAL',null,0,16);const qtxt=f('Student',330,'VERTICAL',null,0,4);await t(qtxt,'66110003 · นักศึกษาตัวอย่าง ค','Body','ink',330);await t(qtxt,'CS101 · กลุ่ม 01','Caption','muted',330);put(qr,qtxt);badge(qr,'Pending');put(queue,qr);const reviewLink=button(queue,'ตรวจใบลา','Primary',200);put(under,queue);put(courses.workspace,under);
const review=await desktop('T27 · ตรวจคำขอลา','ตรวจคำขอลา','teacher','ตรวจใบลา');
const columns=f('Queue and review',1128,'HORIZONTAL',null,0,24);put(review.workspace,columns);columns.layoutSizingVertical='FILL';
const inbox=f('Request queue',300,'VERTICAL',null,0,12);await t(inbox,'คำขอลา','Heading','ink',300);
const selected=f('Selected request',300,'VERTICAL','selected',20,10);rounding(selected,16);await t(selected,'66110003','Heading','action',260);await t(selected,'นักศึกษาตัวอย่าง ค','Body','action',260);await t(selected,'CS101 · 2 พ.ย. 2569','Caption','action',260);badge(selected,'Pending');put(inbox,selected);
const other=f('Other request',300,'VERTICAL','surface',20,8);rounding(other,16);await t(other,'66110001','Heading','ink',260);await t(other,'นักศึกษาตัวอย่าง ก','Body','muted',260);badge(other,'Approved');put(inbox,other);put(columns,inbox);
const detail=f('Request detail',804,'VERTICAL','surface',28,16);rounding(detail,16);put(columns,detail);
const identity=f('Request identity',748,'HORIZONTAL',null,0,16);const identityText=f('Identity',600,'VERTICAL',null,0,4);await t(identityText,'66110003 · นักศึกษาตัวอย่าง ค','Heading','ink',600);await t(identityText,'CS101 · 2 พ.ย. 2569 · 09:00–12:00 · ห้อง 301','Caption','muted',600);put(identity,identityText);const status=badge(identity,'Pending');put(detail,identity);await line(detail,748);
await t(detail,'เหตุผลการลา','Label');await t(detail,'มีนัดพบแพทย์ตามใบนัด','Body','ink',748);
const evidenceRow=f('Evidence attachment',748,'HORIZONTAL','soft',16,16);rounding(evidenceRow,12);icon(evidenceRow,'attach','action',22);await t(evidenceRow,'ใบนัดตัวอย่าง.jpg','Body','ink',450);const evidenceButton=button(evidenceRow,'เปิดหลักฐาน','Tertiary',170);put(detail,evidenceRow);
const notice=instance(detail,await figma.getNodeByIdAsync('3:446'));notice.resize(748,84);const noticeText=notice.findAllWithCriteria({types:['TEXT']});noticeText[0].characters='OCR อ่านข้อความแล้ว';noticeText[1].characters='ข้อความตัวอย่าง: ใบนัด · OCR ไม่ยืนยันว่าเอกสารแท้';
await field(detail,'หมายเหตุถึงนักศึกษา (ไม่บังคับ)','ตรวจเอกสารประกอบแล้ว',748);
const actions=f('Review actions',748,'HORIZONTAL',null,0,12);const approve=button(actions,'อนุมัติ','Primary',180),reject=button(actions,'ไม่อนุมัติ','Danger',180);put(detail,actions);await t(detail,'ข้อมูลตัวอย่างสมมติ','Caption','muted',748);
async function outcome(name,variant,label){
 const clone=review.screen.clone();created.push(clone.id,...clone.findAll(()=>true).map(n=>n.id));clone.name=name;put(board,clone);const pos=index++;clone.x=32+(pos%2)*1488;clone.y=150+Math.floor(pos/2)*1008;
 const newDetail=clone.findOne(n=>n.name==='Request detail');const badgeInstance=newDetail.findAllWithCriteria({types:['INSTANCE']}).find(n=>n.name==='CP/Status');badgeInstance.swapComponent(statusMasters[variant]);
 const oldActions=newDetail.findOne(n=>n.name==='Review actions');oldActions.visible=false;
 const confirmation=f('Decision confirmation',748,'HORIZONTAL',variant==='Approved'?'successBg':'dangerBg',16,12);rounding(confirmation,12);icon(confirmation,variant==='Approved'?'check':'close',variant==='Approved'?'success':'danger',22);await t(confirmation,label,'Heading',variant==='Approved'?'success':'danger',650);put(newDetail,confirmation);return clone;
}
const approved=await outcome('T28 · อนุมัติคำขอลา','Approved','อนุมัติ');
const rejected=await outcome('T29 · ไม่อนุมัติคำขอลา','Rejected','ไม่อนุมัติ');
const admin=await desktop('A26 · สถานะการลา','สถานะการลา','admin','สถานะการลา');
const description=f('Status overview',1128,'HORIZONTAL','selected',20,12);rounding(description,12);icon(description,'leave','action');await t(description,'สถานะคำขอล่าสุดไม่เกิน 100 รายการ','Body','action',1040);put(admin.workspace,description);
const table=f('Leave statuses only',1128,'VERTICAL','surface',24,0);rounding(table,16);const headerRow=f('Table header',1080,'HORIZONTAL','soft',16,16);rounding(headerRow,8);await t(headerRow,'รหัสคำขอ','Label','muted',400);await t(headerRow,'สถานะ','Label','muted',180);await t(headerRow,'ส่งเมื่อ','Label','muted',210);await t(headerRow,'พิจารณาเมื่อ','Label','muted',210);put(table,headerRow);
for(const [id,sent,decision,state]of [['TEST-REQUEST-001','4 พ.ย. 2569 09:00','—','Pending'],['TEST-REQUEST-002','3 พ.ย. 2569 14:00','4 พ.ย. 2569 09:10','Approved'],['TEST-REQUEST-003','3 พ.ย. 2569 10:00','4 พ.ย. 2569 09:15','Rejected']]){
 const tr=f('Status row · '+id,1080,'HORIZONTAL',null,16,16);await t(tr,id,'Body','ink',400);const st=f('Status cell',180);badge(st,state);put(tr,st);await t(tr,sent,'Body','muted',210);await t(tr,decision,'Body','muted',210);put(table,tr);await line(table,1080);
}put(admin.workspace,table);await t(admin.workspace,'ข้อมูลตัวอย่างสมมติ','Caption','muted',1128);
await link(reviewLink,review.screen);await link(open,review.screen);await link(approve,approved,.32);await link(reject,rejected,.32);await link(selected,review.screen);await link(evidenceButton,await figma.getNodeByIdAsync('2001:756'));await link(roster,await figma.getNodeByIdAsync('2001:137'));await link(schedule,await figma.getNodeByIdAsync('2001:225'));await link(report,await figma.getNodeByIdAsync('2001:590'));
for(const [label,n]of Object.entries(courses.navItems))await link(n,label==='ตรวจใบลา'?review.screen:label==='บัญชี'?await figma.getNodeByIdAsync('2001:973'):label==='กล้อง'?await figma.getNodeByIdAsync('2001:825'):courses.screen);
for(const [label,n]of Object.entries(review.navItems))await link(n,label==='ตรวจใบลา'?review.screen:label==='บัญชี'?await figma.getNodeByIdAsync('2001:973'):label==='กล้อง'?await figma.getNodeByIdAsync('2001:825'):courses.screen);


async function finalizeScreens(board,specs){
 const targets=[];for(const [fresh,id,name]of specs){const old=id?await figma.getNodeByIdAsync(id):null;if(id&&(!old||old.type!=='FRAME'))throw new Error('Missing original screen: '+id);targets.push({fresh,old,name});}
 const redirect=new Map(targets.filter(x=>x.old).map(x=>[x.fresh.id,x.old.id]));
 const finals=[];
 for(const {fresh,old,name}of targets){
  if(!old){const xy={x:fresh.absoluteBoundingBox.x,y:fresh.absoluteBoundingBox.y};page.appendChild(fresh);fresh.x=xy.x;fresh.y=xy.y;fresh.name=name;finals.push(fresh);continue;}
  const x=old.x,y=old.y;for(const child of [...old.children])child.remove();
  old.layoutMode=fresh.layoutMode;old.itemSpacing=fresh.itemSpacing;old.paddingTop=fresh.paddingTop;old.paddingBottom=fresh.paddingBottom;old.paddingLeft=fresh.paddingLeft;old.paddingRight=fresh.paddingRight;old.primaryAxisAlignItems=fresh.primaryAxisAlignItems;old.counterAxisAlignItems=fresh.counterAxisAlignItems;old.fills=fresh.fills;old.strokes=fresh.strokes;old.clipsContent=true;old.resize(fresh.width,fresh.height);old.primaryAxisSizingMode='FIXED';old.counterAxisSizingMode='FIXED';
  for(const child of [...fresh.children])old.appendChild(child);old.x=x;old.y=y;old.name=name;mutated.push(old.id);finals.push(old);
 }
 for(const frame of finals)for(const node of [frame,...frame.findAll(()=>true)]){
  if(node===frame){await node.setReactionsAsync([]);continue;}
  if(!('reactions'in node)||!node.reactions.length)continue;const next=node.reactions.map(r=>({trigger:r.trigger,actions:(r.actions||[r.action]).filter(Boolean).map(a=>a.type==='NODE'&&redirect.has(a.destinationId)?{...a,destinationId:redirect.get(a.destinationId)}:a)}));
  await node.setReactionsAsync(next);
 }
 for(const {n,destId,duration}of pendingLinks){const target=redirect.get(destId)||destId;let p=n,self=false;while(p){if(p.id===target)self=true;p=p.parent;}if(!self)await n.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:target,navigation:'NAVIGATE',transition:{type:'DISSOLVE',easing:{type:'EASE_OUT'},duration},resetScrollPosition:true}]}]);}
 board.remove();return finals;
}

const finalScreens=await finalizeScreens(board,[[courses.screen,'4:171','T01 · รายวิชา'],[review.screen,'2001:756','T18 · ตรวจใบลา'],[approved,'2001:795','T19 · ผลตรวจใบลา'],[rejected,'2001:4756','T19b · ไม่อนุมัติใบลา'],[admin.screen,null,'A05 · สถานะการลา']]);
return {createdNodeIds:created,mutatedNodeIds:mutated,screens:finalScreens.map(evidence),prototypeLinks:17};

}
function screenInfo(node){const all=node.findAll(()=>true),types={};for(const n of all)types[n.type]=(types[n.type]||0)+1;return {id:node.id,name:node.name,width:node.width,height:node.height,descendantCount:all.length,nodeTypes:types,imageNodes:all.filter(n=>'fills'in n&&Array.isArray(n.fills)&&n.fills.some(p=>p.type==='IMAGE')).map(n=>({id:n.id,name:n.name})),fonts:[...new Set(all.filter(n=>n.type==='TEXT').flatMap(n=>n.getStyledTextSegments(['fontName']).map(s=>s.fontName.family)))]};}
async function existingScreens(pageId,ids){const p=await figma.getNodeByIdAsync(pageId);await figma.setCurrentPageAsync(p);const roots=await Promise.all(ids.map(id=>figma.getNodeByIdAsync(id)));return roots.every(n=>n&&n.type==='FRAME')?roots:null;}
async function wireOriginalScreens(frames){const p=frames[0].parent;await figma.setCurrentPageAsync(p);const byName=new Map(frames.map(f=>[f.name,f]));let count=0;const warnings=[];
 for(const frame of frames){await frame.setReactionsAsync([]);const nodes=frame.findAll(()=>true);for(const n of nodes){if(!('setReactionsAsync'in n))continue;let dest=null;let duration=.22;const content=n.type==='INSTANCE'?n.findAllWithCriteria({types:['TEXT']}).map(t=>t.characters).join(' '):'';
 if(n.name==='Nav · หน้าหลัก')dest=frames.find(f=>f.id==='2001:1726');
 if(n.name==='Nav · รายวิชา')dest=frames.find(f=>f.id==='2009:1229'||f.id==='4:171');
 if(n.name==='Nav · การลา')dest=frames.find(f=>f.id==='2001:1756');
 if(n.name==='Nav · ผู้ช่วย')dest=frames.find(f=>f.id==='2009:1350');
 if(n.name==='Nav · ตรวจใบลา'||content==='ตรวจใบลา')dest=frames.find(f=>f.id==='2001:756');
 if(content==='ส่งคำขอลา'){dest=frames.find(f=>f.id==='2001:1801');duration=.32;}
 if(content==='อนุมัติ'){dest=frames.find(f=>f.id==='2001:795');duration=.32;}
 if(content==='ไม่อนุมัติ'){dest=frames.find(f=>f.id==='2001:4756');duration=.32;}
 if(content==='รายวิชาและตาราง')dest=frames.find(f=>f.id==='2009:1229');
 if(dest&&dest!==frame){try{await n.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:dest.id,navigation:'NAVIGATE',transition:{type:'DISSOLVE',easing:{type:'EASE_OUT'},duration},resetScrollPosition:true}]}]);count++;}catch(e){warnings.push({source:n.id,target:dest.id,error:String(e)});}}
 }}return {count,warnings};}
async function refineScreens(frames){
 await Promise.all(['Regular','Medium','SemiBold'].map(style=>figma.loadFontAsync({family:'Kanit',style})));
 const vars=await figma.variables.getLocalVariablesAsync();const byName=new Map(vars.map(v=>[v.name,v]));const colors={'bg':'#F6F7F3','surface':'#FFFFFF','ink':'#202923','muted':'#617068','border':'#D9E1D8','brand':'#285C4D','action':'#285C4D','actionHover':'#214C40','onAction':'#FFFFFF','selected':'#E8F0EA','warning':'#7A5300','warningBg':'#FFF3D6','danger':'#B33D38','dangerBg':'#FCEDEB','info':'#365F80','infoBg':'#EAF2F9','rail':'#FFFFFF','onRail':'#202923','success':'#216344','successBg':'#E7F4EB','accent':'#F3CDB5','onAccent':'#62412F','controlBorder':'#839187','soft':'#EEF2EB','disabled':'#E5E9E2','late':'#8A460B','lateBg':'#FFF0E2'};
 const rgb=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
 for(const [name,hex]of Object.entries(colors)){const v=byName.get('color/'+name);if(v)for(const mode of Object.keys(v.valuesByMode))v.setValueForMode(mode,{...rgb(hex),a:1});}
 const byId=new Map(vars.map(v=>[v.id,v]));
 for(const frame of frames){for(const n of [frame,...frame.findAll(()=>true)]){
  if(n.type==='FRAME'&&n!==frame&&n.layoutMode==='HORIZONTAL'&&n.name!=='Divider'){n.primaryAxisSizingMode='FIXED';n.counterAxisSizingMode='AUTO';n.clipsContent=false;}
  for(const property of ['fills','strokes']){if(!(property in n)||!Array.isArray(n[property]))continue;const paints=n[property].map(p=>{const v=byId.get(p.boundVariables?.color?.id);const hex=v&&colors[v.name.replace('color/','')];return hex?{...p,color:rgb(hex)}:p;});n[property]=paints;}
 }}
}
async function main(){
 figma.showUI(__html__,{width:1120,height:820,title:'ClassPing · Design update'});
 figma.ui.postMessage({type:'progress',message:'กำลังปรับหน้าจอเดิมและคงฟอนต์ Kanit…'});
 const m=await existingScreens('3:529',['2001:1726','2009:1229','2001:1756','2001:1801','2009:1350']);const mobileReady=m&&m[0].findOne(n=>n.name==='Bottom navigation');let mobile;if(mobileReady){mobile={screens:m.map(screenInfo)};}else{await theme();await repair('3:528');await repair('3:529');mobile=await buildMobile();}
 const w=await existingScreens('3:528',['4:171','2001:756','2001:795','2001:4756']);let admin=figma.currentPage.children.find(n=>n.name==='A05 · สถานะการลา');let web;if(w&&w[1].findOne(n=>n.name==='Request detail')&&admin){web={screens:[...w,admin].map(screenInfo)};}else{web=await buildWeb();admin=await figma.getNodeByIdAsync(web.screens[4].id);}
 for(const pageId of ['3:529','3:528']){const p=await figma.getNodeByIdAsync(pageId);await figma.setCurrentPageAsync(p);for(const n of [...p.children])if(n.name==='2026 · Pine & Peach · Student'||n.name==='2026 · Pine & Peach · Teacher and admin')n.remove();}
 const mobileRoots=await existingScreens('3:529',mobile.screens.map(n=>n.id));const mobileLinks=await wireOriginalScreens(mobileRoots);const webRoots=await existingScreens('3:528',web.screens.map(n=>n.id));const webLinks=await wireOriginalScreens(webRoots);
 await refineScreens([...mobileRoots,...webRoots]);mobile.screens=mobileRoots.map(screenInfo);web.screens=webRoots.map(screenInfo);
 const result={updatedAt:'2026-11-04',mode:'in-place',mobile,web,themedScreens:93,prototypeLinks:mobileLinks.count+webLinks.count,prototypeWarnings:[...mobileLinks.warnings,...webLinks.warnings]};
 const previews=[];for(const info of [...mobile.screens,...web.screens]){const node=await figma.getNodeByIdAsync(info.id);const bytes=await node.exportAsync({format:'PNG',constraint:{type:'SCALE',value:info.width>500?0.8:1.5}});previews.push({id:node.id,name:node.name,image:'data:image/png;base64,'+figma.base64Encode(bytes)});}
 const first=await figma.getNodeByIdAsync(web.screens[1].id);await figma.setCurrentPageAsync(first.parent);figma.currentPage.selection=[first];figma.viewport.scrollAndZoomIntoView([first]);
 figma.ui.postMessage({type:'done',result,previews});
}
figma.ui.onmessage=async msg=>{if(msg.type==='focus'){const node=await figma.getNodeByIdAsync(msg.id);let p=node;while(p&&p.type!=='PAGE')p=p.parent;if(p){await figma.setCurrentPageAsync(p);figma.currentPage.selection=[node];figma.viewport.scrollAndZoomIntoView([node]);}}
 if(msg.type==='close')figma.closePlugin();};
main().catch(error=>{figma.ui.postMessage({type:'error',message:String(error.stack||error)});figma.notify('ClassPing: '+error.message,{error:true,timeout:10000});});

