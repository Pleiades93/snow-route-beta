import fs from 'node:fs';
const PACK = JSON.parse(fs.readFileSync('packs/vaughan.json', 'utf8'));
ok('segment count derives from the source pack', Object.keys(draft.roads).length === Object.keys(PACK.roads).length);
