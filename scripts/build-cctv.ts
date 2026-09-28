// ดาวน์โหลดชุดข้อมูลเปิด "กล้อง CCTV จราจร กทม." (data.bangkok.go.th, CSV 238 กล้อง มีพิกัด) → web/data/cctv-bma.json
//   node scripts/build-cctv.ts            # รันเมื่อ กทม. อัปเดตชุดข้อมูล (ไม่บ่อย — ล่าสุด มิ.ย. 2567) แล้ว commit ไฟล์ผลลัพธ์
// ไฟล์ผลลัพธ์ฝังใน build ของหน้าเว็บเป็นเลเยอร์ static (ไม่ผ่าน Worker/KV) — เป็น "ตำแหน่งกล้อง + ลิงก์ออก" เท่านั้น
// ห้ามดึงภาพ/สตรีมจาก bmatraffic มาแสดง (เงื่อนไขการใช้งานของ กทม. — ดู CLAUDE.md ข้อ 3.2)
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANGKOK_DISTRICTS } from '../web/data/areas.ts';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const OUT = resolve(ROOT, 'web/data/cctv-bma.json');
const DATASET = 'https://data.bangkok.go.th/dataset/bma-cctv';
const CSV_URL = 'https://data.bangkok.go.th/dataset/9d4d773f-c626-4578-b42d-e1833c81b35d/resource/0d5af6a8-5747-4b16-913a-8e0455e37280/download/bma-cctv.csv';

// ชื่อเขตในไฟล์สะกดไม่สม่ำเสมอ (มี/ไม่มี "เขต", ช่องว่างท้าย, สะกดผิด) → ปรับให้ตรงกับ web/data/areas.ts
const FIX: Record<string, string> = { 'จตจักร': 'จตุจักร', 'สาธร': 'สาทร', 'ลาดกะบัง': 'ลาดกระบัง' };
const KNOWN = new Set(BANGKOK_DISTRICTS.map((d) => d.th));
function district(raw: string): string {
  let d = raw.trim().replace(/^เขต\s*/, '').trim();
  d = FIX[d] ?? d;
  if (!KNOWN.has(d)) console.warn(`unknown district: "${raw}" → "${d}"`);
  return d;
}

const res = await fetch(CSV_URL, { headers: { 'user-agent': 'BangkokFloodWatch/0.1 (+https://bangkokflood.com)' }, signal: AbortSignal.timeout(60_000) });
if (!res.ok) throw new Error(`download failed: ${res.status}`);
const text = (await res.text()).replace(/^﻿/, '');
const lines = text.split(/\r?\n/).filter((l) => l.trim());
const header = lines[0].split(',').map((h) => h.trim());
const col = (name: string) => { const i = header.indexOf(name); if (i < 0) throw new Error(`column ${name} missing: ${header}`); return i; };
const [iDistrict, iLocation, iCam, iLat, iLng] = ['District', 'location', 'ID Camera', 'lat', 'long'].map(col);

// กล้องหลายตัวบนเสาเดียวกัน (พิกัดเดียวกัน) → รวมเป็นหมุดเดียว นับจำนวนกล้อง
type Cam = { id: string; name: string; district: string; cameras: number; lng: number; lat: number };
const byPos = new Map<string, Cam>();
let rows = 0;
for (const line of lines.slice(1)) {
  const c = line.split(',');
  if (c.length !== header.length) { console.warn('skip malformed row:', line.slice(0, 60)); continue; }
  const lat = Number(c[iLat]);
  const lng = Number(c[iLng]);
  if (!(lat > 5 && lat < 21 && lng > 97 && lng < 106)) { console.warn('skip bad coords:', line.slice(0, 60)); continue; }
  rows++;
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cur = byPos.get(key);
  if (cur) { cur.cameras++; continue; }
  byPos.set(key, { id: c[iCam].trim(), name: c[iLocation].trim(), district: district(c[iDistrict]), cameras: 1, lng: +lng.toFixed(6), lat: +lat.toFixed(6) });
}

const features = [...byPos.values()].map((c) => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] },
  properties: { id: c.id, name: c.name, district: c.district, cameras: c.cameras },
}));
const out = {
  type: 'FeatureCollection',
  source: 'bma_cctv',
  source_name: 'จุดติดตั้งกล้อง CCTV จราจร กทม. (Open Data กทม.)',
  source_url: DATASET,
  fetched_at: new Date().toISOString(),
  count: features.length,
  cameras: rows,
  features,
};
writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote web/data/cctv-bma.json: ${features.length} pins from ${rows} cameras`);
