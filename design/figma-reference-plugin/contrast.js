async function applyReferenceDesign(pages) {
  const variables=await figma.variables.getLocalVariablesAsync();
  const V=Object.fromEntries(variables.map(v=>[v.name,v]));
  const hex=h=>({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
  const over=(fg,bg,a=1)=>({r:fg.r*a+bg.r*(1-a),g:fg.g*a+bg.g*(1-a),b:fg.b*a+bg.b*(1-a)});
  const lum=c=>[c.r,c.g,c.b].map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const color=(p,n)=>{
    const id=p.boundVariables?.color?.id;
    if(id){const v=variables.find(v=>v.id===id);if(v){const result=v.resolveForConsumer(n).value;if(result&&typeof result.r==='number')return result;}}
    return p.color;
  };
  const alpha=n=>{let a=1;for(let p=n;p&&p.type!=='DOCUMENT';p=p.parent){if('opacity'in p)a*=p.opacity;if('visible'in p&&!p.visible)return 0;}return a;};
  const disabled=n=>{for(let p=n;p&&p.type!=='DOCUMENT';p=p.parent)if(/(?:State[=, ]*Disabled|^Disabled$)/i.test(p.name)||(['INSTANCE','COMPONENT'].includes(p.type)&&p.variantProperties?.State==='Disabled'))return true;return false;};
  const backgrounds=n=>{
    const chain=[];for(let p=n;p&&p.type!=='DOCUMENT';p=p.parent)chain.unshift(p);
    let colors=[hex('#F5F5F5')],uncertain=false;
    for(const p of chain){if(!('fills'in p)||!Array.isArray(p.fills))continue;
      for(const fill of [...p.fills].reverse()){
        if(fill.visible===false||fill.opacity===0)continue;
        const opacity=(fill.opacity??1)*alpha(p);
        if(fill.type==='SOLID'){const c=color(fill,p);if(c)colors=colors.map(bg=>over(c,bg,opacity*(c.a??1)));}
        else if(fill.type.startsWith('GRADIENT')){const stops=fill.gradientStops.map(s=>s.color);colors=colors.flatMap(bg=>stops.map(c=>over(c,bg,opacity*c.a))).slice(0,30);}
        else uncertain=true;
      }
    }
    return {colors,uncertain};
  };
  const paint=(k,n)=>{const v=V['color/'+k];return figma.variables.setBoundVariableForPaint({type:'SOLID',color:hex(k==='onAction'?'#FFFFFF':'#171717')},'color',v);};
  const top=n=>{let p=n;while(p.parent&&p.parent.type!=='PAGE')p=p.parent;return p;};
  const issues=[],borderIssues=[],manual=[],excluded=[],mutated=new Set(),screens=new Map();
  let checkedTextRuns=0,checkedButtons=0,minAfter=Infinity;
  for(const page of pages){
    await figma.setCurrentPageAsync(page);
    figma.ui.postMessage({status:'Checking text and buttons: '+page.name});
    const texts=page.findAllWithCriteria({types:['TEXT']});
    const fonts=new Map();for(const t of texts)for(const s of t.getStyledTextSegments(['fontName']))fonts.set(JSON.stringify(s.fontName),s.fontName);
    await Promise.all([...fonts.values()].map(f=>figma.loadFontAsync(f)));
    for(const t of texts){
      if(!t.characters.trim()||alpha(t)===0)continue;
      if(disabled(t)){excluded.push(t.id);continue;}
      const bg=backgrounds(t.parent);
      if(bg.uncertain){manual.push({id:t.id,screen:top(t).name,text:t.characters.slice(0,35),reason:'Image/pattern behind text'});continue;}
      const segments=t.getStyledTextSegments(['fills','fontSize','fontName']);
      for(const s of segments){
        if(!s.characters.trim())continue;
        const fills=s.fills.filter(p=>p.visible!==false);
        if(!fills.length)continue;
        if(fills.some(p=>p.type!=='SOLID')){manual.push({id:t.id,screen:top(t).name,text:s.characters.slice(0,35),reason:'Non-solid text fill'});continue;}
        const fg=back=>{let result=back;for(const p of [...fills].reverse()){const c=color(p,t);result=over(c,result,(p.opacity??1)*alpha(t)*(c.a??1));}return result;};
        const before=Math.min(...bg.colors.map(back=>ratio(fg(back),back)));
        const bold=/bold|semibold|semi bold/i.test(s.fontName.style);
        const threshold=s.fontSize>=24||s.fontSize>=18.667&&bold?3:4.5;
        checkedTextRuns++;
        if(before+1e-6>=threshold){minAfter=Math.min(minAfter,before);continue;}
        const candidates=['ink','onAction','action','muted'].map(k=>{const p=paint(k,t),c=color(p,t);return {k,p,r:Math.min(...bg.colors.map(back=>ratio(over(c,back,alpha(t)),back)))};}).sort((a,b)=>b.r-a.r);
        const best=candidates[0];
        if(best.r+1e-6<threshold){manual.push({id:t.id,screen:top(t).name,text:s.characters.slice(0,35),reason:'Opacity or varying background prevents contrast',ratio:before});continue;}
        t.setRangeFills(s.start,s.end,[best.p]);mutated.add(t.id);
        const root=top(t);screens.set(root.id,{id:root.id,name:root.name});
        issues.push({id:t.id,screen:root.name,text:s.characters.slice(0,45),before:+before.toFixed(2),after:+best.r.toFixed(2),required:threshold});
        minAfter=Math.min(minAfter,best.r);
      }
    }
    const components=page.findAllWithCriteria({types:['COMPONENT','INSTANCE']});
    const mains=await Promise.all(components.map(n=>n.type==='INSTANCE'?n.getMainComponentAsync():Promise.resolve(n)));
    for(let i=0;i<components.length;i++){
      const n=components[i],main=mains[i];
      if(main?.parent?.name!=='CP/Button'||alpha(n)===0||disabled(n))continue;
      checkedButtons++;
      const outside=backgrounds(n.parent),inside=backgrounds(n);
      if(outside.uncertain||inside.uncertain)continue;
      const separation=Math.min(...outside.colors.flatMap(a=>inside.colors.map(b=>ratio(a,b))));
      const strokes=Array.isArray(n.strokes)?n.strokes.filter(p=>p.type==='SOLID'&&p.visible!==false):[];
      const outline=strokes.length?Math.min(...outside.colors.map(bg=>ratio(over(color(strokes[0],n),bg,(strokes[0].opacity??1)*alpha(n)),bg))):1;
      if(separation>=3||outline>=3)continue;
      const options=['muted','action','ink','onAction'].map(k=>{const p=paint(k,n);return {p,r:Math.min(...outside.colors.map(bg=>ratio(over(color(p,n),bg,alpha(n)),bg)))};}).filter(x=>x.r>=3);
      if(!options.length){manual.push({id:n.id,screen:top(n).name,reason:'Button outline opacity'});continue;}
      n.strokes=[options[0].p];n.strokeWeight=Math.max(1,typeof n.strokeWeight==='number'?n.strokeWeight:1);mutated.add(n.id);
      const root=top(n);screens.set(root.id,{id:root.id,name:root.name});
      borderIssues.push({id:n.id,screen:root.name,before:+Math.max(separation,outline).toFixed(2),after:+options[0].r.toFixed(2)});
    }
  }
  return {scope:'Visible text and CP/Button contrast across 3 pages',checkedTextRuns,checkedButtons,fixedTextRuns:issues.length,fixedButtonOutlines:borderIssues.length,disabledTextExcluded:excluded.length,manualReviewCount:manual.length,manualReview:manual,minimumCheckedTextRatio:Number.isFinite(minAfter)?+minAfter.toFixed(2):null,textFixes:issues,borderFixes:borderIssues,mutatedNodeIds:[...mutated],screens:[...screens.values()]};
}
