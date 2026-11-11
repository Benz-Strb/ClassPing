async function syncAcademicRhythm() {
  const pages=figma.root.children.filter(p=>['01 · System & product map','02 · Teacher & admin','03 · Student & responsive'].includes(p.name));
  if(pages.length!==3)throw Error('Open the existing ClassPing product file.');
  const vars=await figma.variables.getLocalVariablesAsync(), V=new Map(vars.map(v=>[v.name,v]));
  const rgb=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
  const changed=new Set(), variableIds=[], screenRows=[];
  const values={forest:'#4D3282',teal:'#7652C5',tealHover:'#5D3C9E',mint:'#EEE8F7',paper:'#FAF8F4',white:'#FFFFFF',ink:'#282330',muted:'#6D6477',line:'#E6DFEB',amber:'#765000',amberBg:'#FFF3D5',red:'#AE2929',redBg:'#FFF0EE',blue:'#5B21B6',blueBg:'#F1ECF8',slate:'#282330'};
  for(const [k,h]of Object.entries(values)){const v=V.get('palette/'+k);if(v){for(const mode of Object.keys(v.valuesByMode))v.setValueForMode(mode,rgb(h));variableIds.push(v.id);}}
  const direct={accent:'#EEE8F7',onAccent:'#5D3C9E',success:'#7652C5',successBg:'#EEE8F7',controlBorder:'#6D6477',soft:'#FAF8F4',disabled:'#FAF8F4',late:'#765000',lateBg:'#FFF3D5'};
  for(const [k,h]of Object.entries(direct)){const v=V.get('color/'+k);if(v){for(const mode of Object.keys(v.valuesByMode))v.setValueForMode(mode,rgb(h));variableIds.push(v.id);}}
  const aliases={bg:'paper',surface:'white',ink:'ink',muted:'muted',border:'line',brand:'forest',action:'teal',actionHover:'tealHover',onAction:'white',selected:'mint',warning:'amber',warningBg:'amberBg',danger:'red',dangerBg:'redBg',info:'blue',infoBg:'blueBg',rail:'white',onRail:'ink'};
  for(const [role,target]of Object.entries(aliases)){const v=V.get('color/'+role),to=V.get('palette/'+target);if(v&&to){for(const mode of Object.keys(v.valuesByMode))v.setValueForMode(mode,figma.variables.createVariableAlias(to));variableIds.push(v.id);}}
  function paint(n,role,prop='fills'){const v=V.get('color/'+role);if(!v)throw Error('Missing token '+role);const resolved=v.resolveForConsumer(n).value;const color={r:resolved.r,g:resolved.g,b:resolved.b};n[prop]=[figma.variables.setBoundVariableForPaint({type:'SOLID',color},'color',v)];changed.add(n.id);}
  function textColor(n,role){for(const t of n.findAllWithCriteria({types:['TEXT']})){paint(t,role);t.opacity=1;}}
  function corners(n,r){for(const k of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius']){if(k in n){n.setBoundVariable(k,null);n[k]=r;}}changed.add(n.id);}
  const states={Present:['selected','action'],Approved:['selected','action'],Live:['selected','action'],Late:['warningBg','warning'],Absent:['dangerBg','danger'],Rejected:['dangerBg','danger'],Leave:['bg','ink'],Pending:['bg','muted'],Unseen:['bg','muted'],Upcoming:['bg','muted'],Ended:['bg','muted'],Exam:['infoBg','info']};
  let controls=0,layoutFixes=0;
  for(const page of [...pages].sort((a,b)=>(a.id==='0:1'?-1:b.id==='0:1'?1:0))){
    await figma.setCurrentPageAsync(page);
    const fonts=new Map();for(const t of page.findAllWithCriteria({types:['TEXT']}))for(const s of t.getStyledTextSegments(['fontName']))fonts.set(JSON.stringify(s.fontName),s.fontName);
    figma.ui.postMessage({status:'Loading fonts · '+page.name});
    await Promise.all([...fonts.values()].map(f=>Promise.race([figma.loadFontAsync(f),new Promise((_,reject)=>setTimeout(()=>reject(Error('Font timed out: '+f.family+' '+f.style)),20000))])));
    figma.ui.postMessage({status:'Updating layers · '+page.name});
    const nodes=page.findAll(()=>true);
    for(const n of nodes){
      if(n.type!=='COMPONENT'&&n.type!=='INSTANCE')continue;
      const main=n.type==='COMPONENT'?n:await n.getMainComponentAsync(),family=main?.parent?.name;
      const v=main?.variantProperties||{};
      if(family==='CP/Button'){
        const disabled=v.State==='Disabled',primary=v.Type==='Primary',danger=v.Type==='Danger',secondary=v.Type==='Secondary';
        paint(n,disabled?'bg':danger?'danger':primary?(v.State==='Hover'?'actionHover':'action'):secondary?'selected':'surface');
        textColor(n,disabled?'muted':primary||danger?'onAction':'action');n.opacity=1;
        paint(n,v.State==='Focus'?'action':disabled||!primary&&!danger?'muted':danger?'danger':'action','strokes');n.strokeWeight=v.State==='Focus'?2:1;corners(n,10);n.minHeight=48;controls++;
      }else if(family==='CP/Status'){
        const pair=states[v.Status]||['bg','muted'];paint(n,pair[0]);textColor(n,pair[1]);corners(n,6);
      }else if(family==='CP/Notice'){
        const pair={Success:['selected','action'],Warning:['warningBg','warning'],Error:['dangerBg','danger'],Info:['infoBg','info']}[v.Tone]||['bg','ink'];paint(n,pair[0]);textColor(n,pair[1]);corners(n,12);
      }else if(family==='CP/Field'){
        paint(n,v.State==='Disabled'?'bg':'surface');paint(n,v.State==='Error'?'danger':v.State==='Focus'?'action':'muted','strokes');corners(n,12);n.opacity=1;
      }
    }
    for(const screen of page.children.filter(n=>n.type==='FRAME')){
      screen.opacity=1;changed.add(screen.id);
      screenRows.push({id:screen.id,name:screen.name,page:page.id});
      const mobile=screen.width<600;
      for(const n of screen.findAll(()=>true)){
        if(n.type==='FRAME'&&['Status bar','Attachment','Page heading','Workspace'].includes(n.name)&&n.parent?.type==='FRAME'&&n.parent.layoutMode!=='NONE'&&n.layoutPositioning!=='ABSOLUTE'){
          n.layoutSizingHorizontal='FILL';changed.add(n.id);layoutFixes++;
        }
        if(n.type==='FRAME'&&n.name==='Navigation'){
          paint(n,'surface');
          if(screen.name.startsWith('W01')){n.visible=false;changed.add(n.id);}
          for(const nav of n.children.filter(c=>c.type==='FRAME'&&(/^(Nav ·|Row$)/.test(c.name)))){
            nav.minHeight=48;changed.add(nav.id);controls++;
            const fill=nav.fills?.[0];const bound=fill?.boundVariables?.color?.id;
            const active=bound&&['color/selected','color/action'].some(k=>V.get(k)?.id===bound);
            if(active){paint(nav,'action');textColor(nav,'onAction');for(const icon of nav.findAll(n=>n.type==='VECTOR')){if(icon.strokes.length)paint(icon,'onAction','strokes');}}
          }
        }
        if(n.type==='TEXT'&&n.parent?.name==='App header'&&n.fontSize>=20){n.fontSize=27;n.lineHeight={unit:'PIXELS',value:38};changed.add(n.id);}
        if(n.type==='TEXT'&&n.fontSize===30){n.fontSize=mobile?27:32;n.lineHeight={unit:'PIXELS',value:mobile?38:46};changed.add(n.id);}
      }
      const content=screen.children.find(n=>n.name==='Content');
      if(content&&content.type==='FRAME'&&mobile){content.clipsContent=true;content.overflowDirection='VERTICAL';changed.add(content.id);}
    }
    if(page.id==='3:528')for(const [id,label]of [['2035:1877','นักศึกษา'],['2035:1879','ตารางเรียน'],['2035:1881','รายงาน']]){
      const button=await figma.getNodeByIdAsync(id);if(button&&button.type==='INSTANCE')for(const t of button.findAllWithCriteria({types:['TEXT']})){t.characters=label;changed.add(t.id);}
    }
  }
  const teacher=await figma.getNodeByIdAsync('3:528');await figma.setCurrentPageAsync(teacher);
  const home=await figma.getNodeByIdAsync('4:171');figma.currentPage.selection=[home];figma.viewport.scrollAndZoomIntoView([home]);
  return {updatedVariables:variableIds.length,updatedNodes:changed.size,controls,layoutFixes,screens:screenRows,mutatedNodeIds:[...changed],variableIds};
}
const ui=`<html><body style="font:14px system-ui;padding:18px;color:#282330;background:#FAF8F4"><h2>ClassPing · Academic Rhythm</h2><p id="status">Updating editable layers…</p><pre id="report" style="white-space:pre-wrap"></pre><select id="screens" style="width:100%;padding:10px"></select><button id="view" style="padding:12px;margin-top:10px">Inspect screen</button><script>onmessage=e=>{const m=e.data.pluginMessage;document.getElementById('status').textContent=m.status;if(m.report){const r=m.report;document.getElementById('report').textContent=r.updatedVariables+' variables · '+r.updatedNodes+' layers\\n'+r.controls+' controls · '+r.layoutFixes+' layout fixes\\n'+r.screens.length+' screens';for(const s of r.screens){const o=document.createElement('option');o.value=s.id;o.textContent=s.name;document.getElementById('screens').append(o);}}};document.getElementById('view').onclick=()=>parent.postMessage({pluginMessage:{id:document.getElementById('screens').value}},'*');</script></body></html>`;
figma.showUI(ui,{width:420,height:310});
syncAcademicRhythm().then(report=>{figma.ui.postMessage({status:'Updated · inspect the screens below',report});figma.ui.onmessage=async m=>{const n=await figma.getNodeByIdAsync(m.id);if(n){await figma.setCurrentPageAsync(n.parent);figma.currentPage.selection=[n];figma.viewport.scrollAndZoomIntoView([n]);}};}).catch(e=>figma.ui.postMessage({status:'Error: '+e.message}));
