// ดึงข้อมูลทุกแหล่ง → FloodBundle แล้ว (ก) เขียนไฟล์ หรือ (ข) push เข้า Worker
//   node scripts/ingest.ts --out web/public/data            # สำหรับ dev: หน้าเว็บอ่านจาก /data/all.json
//   node scripts/ingest.ts --out web/public/data --snapshot # + อัปเดต shared/snapshots/all.json (fallback ฝังใน Worker)
//   WORKER_URL=https://xxx.workers.dev INGEST_TOKEN=... node scripts/ingest.ts --push
//   node scripts/ingest.ts --only traffy_flood,bma_flood_road
// ใช้ Node ≥ 22.18 (รัน .ts ตรงได้ ไม่ต้อง build)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestAll } from '../shared/adapters/index.ts';
import type { FloodBundle, SourceId } from '../shared/types.ts';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? '' : null;
};
const outDir = flag('--out');
const push = args.includes('--push');
const snapshot = args.includes('--snapshot');
const only = flag('--only')?.split(',').filter(Boolean) as SourceId[] | undefined;

// อ่าน .env ที่ root (ถ้ามี) — ตัวแปรที่ตั้งไว้ใน environment จริงมีสิทธิ์เหนือกว่า
try {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* ไม่มี .env */ }

const workerUrl = (process.env.WORKER_URL ?? '').replace(/\/$/, '');
const token = process.env.INGEST_TOKEN ?? '';
const keys = { gistda: process.env.GISTDA_API_KEY || undefined };

// ชุดก่อนหน้า: จาก Worker (ถ้า push) หรือไฟล์เดิม (ถ้า out) เพื่อคงข้อมูลแหล่งที่ล้มไว้
async function loadPrevious(): Promise<FloodBundle | null> {
  try {
    if (push && workerUrl) return (await (await fetch(`${workerUrl}/api/data/all.json`, { signal: AbortSignal.timeout(20_000) })).json()) as FloodBundle;
    if (outDir) return JSON.parse(readFileSync(join(ROOT, outDir, 'all.json'), 'utf8')) as FloodBundle;
  } catch { /* ไม่มีชุดก่อนหน้า */ }
  return null;
}

const previous = await loadPrevious();
const { bundle, ok, failed } = await ingestAll({ previous, only, keys, log: (m) => console.log(m) });
const json = JSON.stringify(bundle);
console.log(`bundle ${(json.length / 1024).toFixed(0)} KB, ok=${ok.length} failed=${failed.length}`);

if (outDir) {
  const dir = join(ROOT, outDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'all.json'), json);
  console.log(`wrote ${join(outDir, 'all.json')}`);
}
if (snapshot) {
  // snapshot ฝังใน Worker: ตัดฝนให้เหลือ ≥ 35 มม. และ Traffy 300 เรื่องล่าสุด ให้ไฟล์เล็ก
  const snap: FloodBundle = { ...bundle, sources: { ...bundle.sources } };
  for (const [id, c] of Object.entries(snap.sources)) {
    let features = c.features;
    if (id === 'thaiwater_rain') features = features.filter((f) => (f.properties.value ?? 0) >= 35);
    if (id === 'traffy_flood') features = features.slice(0, 300);
    snap.sources[id as SourceId] = { ...c, snapshot: true, stale: true, count: features.length, features };
  }
  const p = join(ROOT, 'shared/snapshots/all.json');
  writeFileSync(p, JSON.stringify(snap));
  console.log(`wrote shared/snapshots/all.json (${(JSON.stringify(snap).length / 1024).toFixed(0)} KB)`);
}
if (push) {
  if (!workerUrl || !token) throw new Error('--push needs WORKER_URL and INGEST_TOKEN');
  // ส่ง bundle เต็ม (merge ชุดเดิมจาก Worker มาแล้วใน ingestAll) แบบ x-ingest-mode: full — Worker เก็บ text ตรงๆ ไม่ต้อง parse
  // (cron ใน Worker เองโดนลิมิต CPU 10 ms ของ free plan ตอน parse JSON ของ สสน./Traffy)
  if (!ok.length) { console.error('nothing succeeded; not pushing'); process.exit(2); }
  const r = await fetch(`${workerUrl}/api/ingest`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-ingest-mode': 'full' },
    body: json,
    signal: AbortSignal.timeout(60_000),
  });
  console.log('push', r.status, await r.text());
  if (!r.ok) process.exit(1);
}
if (failed.length === (only ?? Object.keys(bundle.sources)).length) process.exit(2); // ล้มทุกแหล่ง
