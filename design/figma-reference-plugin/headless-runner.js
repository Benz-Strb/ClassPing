(async()=>{
  try{
    const report=await applyReferenceDesign(figma.root.children.filter(p=>['01 · System & product map','02 · Teacher & admin','03 · Student & responsive'].includes(p.name)));
    console.log(JSON.stringify(report));
    figma.closePlugin('Component contrast repaired: '+report.changedNodeCount+' nodes');
  }catch(e){figma.closePlugin('Component repair failed: '+e.message);}
})();
