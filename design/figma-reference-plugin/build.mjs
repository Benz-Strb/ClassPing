import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url));
const read=name=>readFileSync(join(dir,name),'utf8');
writeFileSync(join(dir,'code.js'),process.argv.includes('--export')?read('export-design.js'):read('component-contrast.js')+'\n'+read('headless-runner.js'));
