import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { extractTimetable } from '../src/timetables/timetable-draft.ts';

const [input, output] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node --experimental-strip-types apps/api/scripts/read-timetable.mjs <PDF-or-image> [output.json]');
  process.exit(1);
}
const root = fileURLToPath(new URL('../../../', import.meta.url));
const localPython = resolve(root, 'services/face/.venv/bin/python');
const result = spawnSync(process.env.TIMETABLE_PYTHON ?? (existsSync(localPython) ? localPython : 'python3'),
  [resolve(root, 'services/ocr/read_timetable.py'), resolve(input)], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
if (result.status !== 0) {
  console.error(result.error?.message ?? result.stderr);
  process.exit(1);
}
const draft = extractTimetable(JSON.parse(result.stdout));
const json = JSON.stringify(draft, null, 2);
if (output) writeFileSync(output, json + '\n');
else console.log(json);
