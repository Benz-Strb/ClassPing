import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = name => readFileSync(join(dir, 'src', `${name}.js`), 'utf8');
const common = read('common');
const names = ['foundations', 'teacher', 'secondary', 'student', 'desktop-states', 'map', 'planned-web', 'planned-mobile'];
const registry = {};
const prototypeSource=read('prototype');
const restyleSource=read('restyle');
const mobileCommon=read('student').slice(read('student').indexOf('function mobile('),read('student').indexOf("let s=save('mobileLogin'"));
const functions = names.map((name, index) => {
  const source = read(name);
  for (const match of source.matchAll(/save\('([^']+)',(?:shell|mobile)\('([^']+)'/g)) registry[match[1]] = match[2];
  for(const match of source.matchAll(/plan\('([^']+)','([^']+)'/g))registry[match[1]]=match[2];
  return `async function phase${index}(){\n${source.replace('// COMMON', common).replace('// MOBILE_COMMON',mobileCommon)}\n}`;
});
Object.assign(registry, { poseFront: 'S06 · หน้าตรง', poseLeft: 'S07 · หันซ้าย', poseRight: 'S08 · หันขวา', poseUp: 'S09 · เงยหน้า', poseDown: 'S10 · ก้มหน้า' });
const prelude = 'const STYLE_JOBS=[];figma.showUI(' + JSON.stringify(readFileSync(join(dir, 'ui.html'), 'utf8')) + ',{width:480,height:600});\n';
const footer = `
async function main(){
  const results=[];
  for(let i=0;i<phases.length;i++){
    figma.ui.postMessage({status:'Building phase '+(i+1)+' / '+phases.length});
    results.push(await phases[i]());await Promise.all(STYLE_JOBS.splice(0));
  }
  const registry=${JSON.stringify(registry)};
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
    const roots=page.children.filter(n=>n.type==='FRAME'&&(/^[TASWERP]\\d/.test(n.name)));
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
main().catch(e=>{figma.ui.postMessage({status:'Build stopped',detail:String(e)+'\\n'+String(e.stack||'')});console.error(e);});
`;
writeFileSync(join(dir, 'code.js'), prelude + prototypeSource + '\n' + restyleSource + '\n' + functions.join('\n') + `\nconst phases=[${names.map((_, i) => `phase${i}`).join(',')}];\n` + footer);
console.log(`Built code.js · ${Object.keys(registry).length} screen destinations`);
