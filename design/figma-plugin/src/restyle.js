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
