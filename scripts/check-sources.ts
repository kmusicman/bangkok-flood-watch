// ทดสอบ parser ของทุก adapter กับตัวอย่าง raw ใน shared/snapshots/raw (ไม่ต้องต่อเน็ต)
//   node scripts/check-sources.ts           # parser tests
//   node scripts/check-sources.ts --live    # + ลองยิง endpoint จริงทุกแหล่ง แล้วรายงานสถานะ
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractJsonAfter, parseBma, parseRelay, roadLevel } from '../shared/adapters/bma.ts';
import { gistdaCollection, imageTime, parseSummary } from '../shared/adapters/gistda.ts';
import { FETCHERS } from '../shared/adapters/index.ts';
import { parseRain, parseWaterlevel, rainLevel } from '../shared/adapters/thaiwater.ts';
import { parseTraffy } from '../shared/adapters/traffy.ts';
import { SOURCE_IDS, toIso } from '../shared/util.ts';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const raw = (name: string) => JSON.parse(readFileSync(resolve(ROOT, 'shared/snapshots/raw', `${name}.json`), 'utf8'));
// ตัวอย่างเก็บเมื่อ 26 ก.ย. 2569 — ตรึง "now" ไว้ใกล้เวลานั้นเพื่อไม่ให้ตัวกรองอายุข้อมูลตัดทิ้งหมด
const NOW = Date.parse('2026-09-26T08:00:00Z');

// เวลา
assert.equal(toIso('2026-09-26 06:10'), '2026-09-25T23:10:00.000Z');
assert.equal(toIso('2026-09-26T14:30:00.09'), '2026-09-26T07:30:00.090Z');
assert.equal(toIso('2026-09-26 07:33:36.854728+00'), '2026-09-26T07:33:36.854Z');
assert.equal(toIso('2026-09-25T23:10:00Z'), '2026-09-25T23:10:00.000Z');

// เกณฑ์ระดับ
assert.deepEqual([0, 5, 10, 19.9, 20, 57].map(roadLevel), ['normal', 'watch', 'warning', 'warning', 'critical', 'critical']);
assert.deepEqual([0, 35, 36, 90, 91, 151].map(rainLevel), ['normal', 'normal', 'watch', 'watch', 'warning', 'critical']);

// thaiwater
const wl = parseWaterlevel(raw('thaiwater_waterlevel'), NOW);
assert.ok(wl.length > 20, `waterlevel parsed ${wl.length}`);
assert.ok(wl.every((f) => f.properties.source === 'thaiwater_waterlevel' && f.properties.unit === 'ม.รทก.' && f.properties.province));
assert.ok(wl.some((f) => f.properties.level === 'critical'), 'ล้นตลิ่ง → critical');
const rain = parseRain(raw('thaiwater_rain'), { now: NOW });
assert.ok(rain.length > 20 && rain.every((f) => (f.properties.value ?? 0) >= 10), 'rain ≥ 10 mm');
assert.ok(rain.some((f) => f.properties.level === 'critical'), 'ฝน > 150 มม. → critical');

// BMA: ตัวแยก JSON จาก HTML + parser
const tricky = 'x const floodData = [{"a":"has ] and } and \\" inside","b":[1,{"c":2}]}];\nconst other = [9];';
assert.deepEqual(extractJsonAfter(tricky, 'const floodData ='), [{ a: 'has ] and } and " inside', b: [1, { c: 2 }] }]);
assert.throws(() => extractJsonAfter('nothing here', 'const floodData ='));
const bma = parseBma(raw('bma_flood'), NOW);
assert.ok(bma.length >= 30, `bma parsed ${bma.length}`);
assert.ok(bma.every((f) => f.properties.district && f.properties.province_code === '10'), 'ทุกเซนเซอร์มีเขต (จาก bma_districts.json)');
assert.ok(bma.filter((f) => (f.properties.value ?? 0) > 0).length >= 30);
const relay = parseRelay(raw('thaiwater_flood_road'), Date.parse('2026-09-25T13:30:00Z'));
assert.ok(relay.length > 0 && relay.every((f) => f.properties.source === 'bma_flood_road'));
assert.equal(parseRelay(raw('thaiwater_flood_road'), NOW).length, 0, 'relay เก่ากว่า 3 ชม. ถูกตัดทิ้ง');

// Traffy
const tr = parseTraffy([raw('traffy')], NOW);
assert.ok(tr.length > 10, `traffy flood tickets ${tr.length}`);
assert.ok(tr.every((f) => f.properties.district && f.properties.observed_at.endsWith('Z')));
assert.ok(tr.every((f) => !f.properties.photo || f.properties.photo.startsWith('https://')));
assert.equal(parseTraffy([raw('traffy'), raw('traffy')], NOW).length, tr.length, 'ไม่ซ้ำ ticket ข้ามหน้า');
// GISTDA: สรุปจากหน้าแรก (limit=1) — จำนวนเซลล์ + เวลาภาพจากชื่อไฟล์
const gs = parseSummary(raw('gistda_flood_1day'));
assert.ok(gs.cells > 1000 && gs.files.length >= 1 && gs.latest_image?.endsWith('Z'), `gistda summary ${JSON.stringify(gs)}`);
assert.equal(imageTime('rd2_20260926_0613'), '2026-09-26T06:13:00.000Z');
assert.equal(imageTime('junk'), null);
assert.equal(gistdaCollection({ '1day': gs }).count, gs.cells);
console.log(`parsers ok — waterlevel ${wl.length}, rain ${rain.length}, bma ${bma.length}, traffy ${tr.length}, gistda ${gs.cells} cells`);

if (process.argv.includes('--live')) {
  const keys = { gistda: process.env.GISTDA_API_KEY || undefined };
  for (const id of SOURCE_IDS) {
    const t0 = Date.now();
    try {
      const r = await FETCHERS[id](keys);
      console.log(`LIVE ✓ ${id}: ${r.features.length} features${r.via ? ` via ${r.via}` : ''} (${Date.now() - t0} ms)`);
    } catch (e) {
      console.log(`LIVE ✗ ${id}: ${(e as Error).message} (${Date.now() - t0} ms)`);
    }
  }
}
