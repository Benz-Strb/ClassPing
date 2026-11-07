async function applyReferenceDesign(pages) {
  const rgb = h => ({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
  const vars = await figma.variables.getLocalVariablesAsync();
  const V = Object.fromEntries(vars.map(v=>[v.name,v]));
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const primitives = collections.find(c=>c.name==='CP · Primitives');
  const semantic = collections.find(c=>c.name==='CP · Semantic');
  if(!primitives||!semantic)throw Error('Existing CP token collections are required.');
  const fonts = (await figma.listAvailableFontsAsync()).map(f=>f.fontName);
  const geist = fonts.filter(f=>f.family==='Geist');
  if(!geist.length)throw Error('Geist is unavailable. Install Geist before applying the guidelines.');
  const font = (weight,thai=false) => {
    const family=thai?'Kanit':'Geist';
    const normalized=String(weight).replace(/\s/g,'').toLowerCase();
    return fonts.find(f=>f.family===family&&f.style.replace(/\s/g,'').toLowerCase()===normalized)||fonts.find(f=>f.family===family&&f.style==='Regular');
  };
  if(!font('Regular',true))throw Error('Kanit Thai fallback is unavailable.');
  await Promise.all(fonts.filter(f=>['Geist','Kanit'].includes(f.family)).map(f=>figma.loadFontAsync(f)));
  const palette={forest:'#330869',teal:'#6F11E3',tealHover:'#5B0DBB',mint:'#F2E7FE',paper:'#F9FAFB',white:'#FFFFFF',ink:'#171717',muted:'#66606E',line:'#E5E7EB',blue:'#5B21B6',blueBg:'#F4EEFB'};
  const changedVariables=[];
  for(const [name,value]of Object.entries(palette)){
    const v=V['palette/'+name];if(v){v.setValueForMode(primitives.defaultModeId,rgb(value));changedVariables.push(v.id);}
  }
  for(const [name,target]of Object.entries({bg:'paper',surface:'white',ink:'ink',muted:'muted',border:'line',rail:'white',onRail:'ink',onAction:'white',selected:'mint',brand:'forest',action:'teal',actionHover:'tealHover',info:'blue',infoBg:'blueBg'})){
    const v=V['color/'+name];if(v){v.setValueForMode(semantic.defaultModeId,figma.variables.createVariableAlias(V['palette/'+target]));changedVariables.push(v.id);}
  }
  const paint=k=>[figma.variables.setBoundVariableForPaint({type:'SOLID',color:rgb('#FFFFFF')},'color',V['color/'+k])];
  const sizes={Display:[36,40],Title:[30,36],Heading:[20,28],Body:[16,24],Label:[14,20],Caption:[12,16],Metric:[36,40]};
  const styles=await figma.getLocalTextStylesAsync();
  for(const s of styles.filter(s=>s.name.startsWith('CP/'))){
    const f=font(s.fontName.style,true);s.fontName=f;
    const scale=sizes[s.name.slice(3)];if(scale){s.fontSize=scale[0];s.lineHeight={unit:'PIXELS',value:scale[1]};}
  }
  const mutatedNodeIds=[],screens=[],overflow=[];
  let textCount=0,latinRuns=0,starts=0,connections=0;
  const missing=[];
  for(const page of pages){
    await figma.setCurrentPageAsync(page);
    figma.ui.postMessage({status:'Applying Dokturek: '+page.name});
    const texts=page.findAllWithCriteria({types:['TEXT']});
    const oldFonts=new Map();
    for(const t of texts)for(const s of t.getStyledTextSegments(['fontName']))oldFonts.set(JSON.stringify(s.fontName),s.fontName);
    await Promise.all([...oldFonts.values()].map(f=>figma.loadFontAsync(f)));
    for(const t of texts){
      const weight=t.fontName===figma.mixed?'Regular':t.fontName.style;
      const thai=/[\u0E00-\u0E7F]/.test(t.characters);
      t.fontName=font(weight,thai);
      if(thai)for(const match of t.characters.matchAll(/[A-Za-z][A-Za-z0-9 /·.,:%+—–()-]*/g)){t.setRangeFontName(match.index,match.index+match[0].length,font(weight));latinRuns++;}
      const scale=sizes[(styles.find(s=>s.id===t.textStyleId)?.name||'').slice(3)];
      if(scale){t.fontSize=scale[0];t.lineHeight={unit:'PIXELS',value:thai?Math.max(scale[1],scale[0]*1.5):scale[1]};}
      if(t.characters==='Typography / Kanit')t.characters='Typography / Geist + Kanit (Thai)';
      if(t.characters==='ClassPing · SLCM / Monochrome')t.characters='ClassPing · Dokturek';
      if(t.characters.startsWith('Visual reference: DESIGN.md'))t.characters='Dokturek guidelines · Geist + Kanit for Thai · violet #6F11E3 · white surfaces · Tailwind spacing · semantic attendance colors';
      mutatedNodeIds.push(t.id);textCount++;
    }
    for(const n of page.findAllWithCriteria({types:['FRAME','COMPONENT','INSTANCE']})){
      if(n.type!=='INSTANCE'&&n.layoutMode!=='NONE'){for(const prop of ['paddingLeft','paddingRight','paddingTop','paddingBottom','itemSpacing']){const value=n[prop];if(V['space/'+value])n.setBoundVariable(prop,V['space/'+value]);}if(typeof n.cornerRadius==='number'&&V['radius/'+n.cornerRadius])n.setBoundVariable('cornerRadius',V['radius/'+n.cornerRadius]);}
      if(n.name==='Navigation'){n.fills=paint('surface');n.strokes=paint('border');mutatedNodeIds.push(n.id);}
      if(n.type==='COMPONENT'&&n.parent.name==='CP/Button'){
        const primary=n.name.startsWith('Type=Primary');
        const secondary=n.name.startsWith('Type=Secondary');
        const danger=n.name.startsWith('Type=Danger');
        n.fills=paint(primary?(n.name.includes('Hover')?'actionHover':'action'):danger?'danger':'surface');
        n.strokes=primary||danger?[]:paint('border');
        for(const t of n.findAllWithCriteria({types:['TEXT']}))t.fills=paint(primary||danger?'onAction':'ink');
        mutatedNodeIds.push(n.id);
      }
      if(n.type==='FRAME'&&n.parent.name==='Workspace'&&n.name!=='Table'&&n.name!=='Row'&&n.fills.some(p=>p.type==='SOLID'&&p.boundVariables?.color?.id===V['color/ink'].id)){
        n.fills=paint('surface');n.strokes=paint('border');
        for(const child of n.findAllWithCriteria({types:['FRAME']}))if(child.name==='Row'||child.name.startsWith('Cell ')){child.fills=paint('surface');mutatedNodeIds.push(child.id);}
        mutatedNodeIds.push(n.id);
      }
    }
    const resolve=p=>{let value=p.color,id=p.boundVariables?.color?.id;const seen=new Set();while(id&&!seen.has(id)){seen.add(id);const v=vars.find(v=>v.id===id);if(!v)break;value=v.valuesByMode[Object.keys(v.valuesByMode)[0]];id=value?.type==='VARIABLE_ALIAS'?value.id:null;}return value;};
    for(const t of texts){
      let bg=rgb('#FFFFFF');
      for(let n=t.parent;n&&n.type!=='DOCUMENT';n=n.parent){if('fills'in n&&Array.isArray(n.fills)){const p=n.fills.find(p=>p.type==='SOLID'&&p.visible!==false&&p.opacity!==0);if(p){bg=resolve(p);break;}}}
      if(bg&&typeof bg.r==='number'){
        const l=(bg.r+bg.g+bg.b)/3;
        const current=t.fills[0];
        if(current?.boundVariables?.color?.id===V['color/onAction'].id&&l>.8)t.fills=paint('ink');
        if(l<.3)t.fills=paint('onAction');
      }
    }
    starts+=(page.flowStartingPoints||[]).length;
    for(const f of page.children.filter(n=>n.type==='FRAME'&&/^[TAWSERP]\d/.test(n.name))){
      screens.push({id:f.id,name:f.name});
      for(const n of [f,...f.findAll(n=>'reactions'in n)])for(const r of n.reactions||[])for(const a of r.actions||[]){if(a.destinationId){connections++;if(!await figma.getNodeByIdAsync(a.destinationId))missing.push(a.destinationId);}}
      const main=f.children.find(n=>n.name==='Workspace');
      if(main&&f.name!=='W01 · เข้าสู่ระบบ'){const bottom=Math.max(...main.children.map(n=>n.y+n.height));if(bottom+32>f.height){f.resize(f.width,bottom+32);mutatedNodeIds.push(f.id);}}
      for(const n of f.children)if(n.visible&&n.x+n.width>f.width+1)overflow.push({frame:f.name,node:n.name});
    }
  }
  return {theme:'Dokturek',reference:'dokturek-ui-kit-copy-design-guidelines-DESIGN.md',fonts:'Geist / Kanit Thai fallback',changedVariables,mutatedNodeIds,textCount,latinRuns,screenCount:screens.length,flowStartingPoints:starts,prototypeConnections:connections,missingPrototypeTargets:missing,topLevelOverflow:overflow,screens};
}
