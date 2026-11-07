async function applyReferenceDesign(pages) {
  const variables=await figma.variables.getLocalVariablesAsync();
  const V=Object.fromEntries(variables.map(v=>[v.name,v]));
  const collections=await figma.variables.getLocalVariableCollectionsAsync();
  const primitives=collections.find(c=>c.name==='CP · Primitives');
  const semantic=collections.find(c=>c.name==='CP · Semantic');
  const rgb=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
  const values={bg:'#F9FAFB',surface:'#FFFFFF',ink:'#171717',muted:'#66606E',action:'#6F11E3',selected:'#F2E7FE',warning:'#765000',warningBg:'#FFF3D5',danger:'#AE2929',dangerBg:'#FFF0EE',info:'#5B21B6',infoBg:'#F4EEFB'};
  const raw={bg:'paper',surface:'white',ink:'ink',muted:'muted',action:'teal',selected:'mint',warning:'amber',warningBg:'amberBg',danger:'red',dangerBg:'redBg',info:'blue',infoBg:'blueBg'};
  for(const [role,value]of Object.entries(values)){
    const primitive=V['palette/'+raw[role]],v=V['color/'+role];
    if(primitive&&v){primitive.setValueForMode(primitives.defaultModeId,rgb(value));v.setValueForMode(semantic.defaultModeId,figma.variables.createVariableAlias(primitive));}
  }
  const paint=role=>[figma.variables.setBoundVariableForPaint({type:'SOLID',color:rgb(values[role])},'color',V['color/'+role])];
  const before=[],counts={},mutated=new Set(),review=[];
  const status={Present:['selected','action'],Approved:['selected','action'],Live:['selected','action'],Late:['warningBg','warning'],Pending:['warningBg','warning'],Absent:['dangerBg','danger'],Rejected:['dangerBg','danger'],Leave:['infoBg','info'],Exam:['infoBg','info'],Unseen:['bg','muted'],Upcoming:['bg','muted'],Ended:['bg','muted']};
  for(const page of pages){
    await figma.setCurrentPageAsync(page);
    const candidates=page.findAllWithCriteria({types:['COMPONENT','INSTANCE']});
    const mains=await Promise.all(candidates.map(n=>n.type==='INSTANCE'?n.getMainComponentAsync():Promise.resolve(n)));
    const targets=candidates.map((n,i)=>({n,main:mains[i]})).filter(({main})=>['CP/Status','CP/Notice','CP/Evidence','CP/Field','CP/Tab','CP/Button'].includes(main?.parent?.name));
    const fonts=new Map();for(const {n}of targets)for(const t of n.findAllWithCriteria({types:['TEXT']}))for(const s of t.getStyledTextSegments(['fontName']))fonts.set(JSON.stringify(s.fontName),s.fontName);
    await Promise.all([...fonts.values()].map(f=>figma.loadFontAsync(f)));
    for(const {n,main}of targets){
      const family=main.parent.name;
      const variant=main.variantProperties||{};
      const key=variant.Status||variant.Tone||variant.State||main.name.split('=').pop();
      const isDisabled=variant.State==='Disabled'||/Disabled/.test(main.name);
      let pair;
      if(family==='CP/Status')pair=status[key]||['bg','ink'];
      if(family==='CP/Notice')pair={Success:['selected','action'],Warning:['warningBg','warning'],Error:['dangerBg','danger'],Info:['infoBg','info']}[key]||['surface','ink'];
      if(family==='CP/Evidence')pair=['bg','muted'];
      if(family==='CP/Button'){
        const type=variant.Type||main.name.match(/Type=([^,]+)/)?.[1]||'Secondary';
        pair=type==='Primary'?['action','surface']:type==='Danger'?['danger','surface']:['surface',type==='Tertiary'?'action':'ink'];
      }
      if(isDisabled)pair=['bg','muted'];
      if(!pair)continue;
      if(n.type==='COMPONENT')before.push({family,variant:main.name,fills:n.fills,text:n.findAllWithCriteria({types:['TEXT']}).map(t=>({text:t.characters,fills:t.fills}))});
      n.opacity=1;n.fills=paint(pair[0]);
      if(family==='CP/Button'&&pair[0]==='surface'){n.strokes=paint('muted');n.strokeWeight=1;}
      if(family==='CP/Evidence'||isDisabled){n.strokes=paint('muted');n.strokeWeight=1;}
      for(const t of n.findAllWithCriteria({types:['TEXT']})){t.opacity=1;t.fills=paint(pair[1]);mutated.add(t.id);}
      mutated.add(n.id);counts[family]=(counts[family]||0)+1;
    }
    if(page.name==='01 · System & product map'){
      for(const name of ['CP/Status','CP/Notice','CP/Evidence','CP/Field','CP/Button','CP/Tab','Component state review']){
        const n=page.children.find(n=>n.name===name);if(n)review.push({id:n.id,name:n.name});
      }
      figma.currentPage.selection=review.slice(0,3).map(r=>page.children.find(n=>n.id===r.id));
      figma.viewport.scrollAndZoomIntoView(figma.currentPage.selection);
    }
  }
  const lib=pages.find(p=>p.name==='01 · System & product map');await figma.setCurrentPageAsync(lib);
  const focus=lib.children.filter(n=>['CP/Button'].includes(n.name));
  figma.currentPage.selection=focus;figma.viewport.scrollAndZoomIntoView(focus);
  return {scope:'Component sources and their instances, including disabled states',counts,changedNodeCount:mutated.size,mutatedNodeIds:[...mutated],sourceSamples:before.map(x=>({family:x.family,variant:x.variant,previousSolidColors:x.fills.filter(p=>p.type==='SOLID').map(p=>p.color)})),screens:review};
}

(async()=>{
  try{
    const report=await applyReferenceDesign(figma.root.children.filter(p=>['01 · System & product map','02 · Teacher & admin','03 · Student & responsive'].includes(p.name)));
    console.log(JSON.stringify(report));
    figma.closePlugin('Component contrast repaired: '+report.changedNodeCount+' nodes');
  }catch(e){figma.closePlugin('Component repair failed: '+e.message);}
})();
