(async()=>{
 const variables=await figma.variables.getLocalVariablesAsync();
 const bundle={file:figma.root.name,exportedAt:new Date().toISOString(),variables:variables.map(v=>({name:v.name,type:v.resolvedType,values:v.valuesByMode})),pages:[]};
 function serialize(n){
  const out={id:n.id,name:n.name,type:n.type};
  for(const k of ['width','height','layoutMode','paddingLeft','paddingRight','paddingTop','paddingBottom','itemSpacing','cornerRadius','opacity','characters','fontName','fontSize','lineHeight','fills','strokes'])if(k in n&&typeof n[k]!=='symbol')out[k]=n[k];
  if('children'in n)out.children=n.children.map(serialize);
  return out;
 }
 for(const page of figma.root.children){await figma.setCurrentPageAsync(page);bundle.pages.push({name:page.name,frames:page.children.map(n=>({id:n.id,name:n.name,width:n.width,height:n.height})),designs:page.children.filter(n=>/^(T01|T02|T04|S01|S11|S12|S17|W01|CP\/|Component state review)/.test(n.name)).map(serialize)});}
 const payload=JSON.stringify(bundle);
 figma.showUI('<html><body style="font:14px system-ui;padding:20px"><h2>ClassPing design export</h2><p id="status">Preparing export…</p><button id="download">Download design JSON</button><script>let data;onmessage=e=>{data=e.data.pluginMessage;document.getElementById("status").textContent=data.summary};document.getElementById("download").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data.json],{type:"application/json"}));a.download="classping-figma-design.json";a.click()};</script></body></html>',{width:400,height:200});
 figma.ui.postMessage({json:payload,summary:bundle.pages.length+' pages exported · '+payload.length+' bytes'});
})().catch(e=>figma.closePlugin(e.message));
