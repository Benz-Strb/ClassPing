import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url));
const read=name=>readFileSync(join(dir,name),'utf8');
writeFileSync(join(dir,'code.js'),'figma.showUI('+JSON.stringify(read('ui.html'))+',{width:500,height:650});\n'+read('../figma-plugin/src/restyle.js')+'\n'+read('runner.js'));
