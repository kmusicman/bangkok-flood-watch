// กล้องที่จุดวัดน้ำท่วมถนนของสำนักการระบายน้ำ กทม. (ระบบ floodbangkok.bangkok.go.th)
//   node scripts/build-cctv-dds.ts            # ดึงรายการกล้อง + เช็คว่ากล้องไหนส่งภาพได้ → เขียน 2 ไฟล์ แล้ว commit
//   node scripts/build-cctv-dds.ts --no-probe # ไม่เช็คภาพ (ใช้ทุกกล้องในรายการ)
//
// ที่มา (แกะจากหน้า device-info ของ กทม. 30 ก.ย. 2569):
//   รายการกล้อง  GET /bkk/dds/services/api/floods/v1/items/camera_profile?limit=-1   → {id, CameraName, SensorName, Lat, Long, LiveStream}
//   ชื่อจุดวัด    GET /bkk/dds/services/api/floods/v1/items/sensor_profile?limit=-1   → {code, name, district, lat, long}
//   ภาพนิ่ง      GET /api/proxy?rtcUrl=<LiveStream>  → image/jpeg (proxy ของ กทม. แปลงสตรีม go2rtc เป็นภาพนิ่ง; โฮสต์สตรีมเองไม่มีใน DNS สาธารณะ)
//   SensorName ตรงกับ id ของหมุด "น้ำท่วมถนน กทม." ของเรา (FL.xxx.nn) → popup เซนเซอร์แสดงภาพจากจุดนั้นได้
//
// ผลลัพธ์:
//   web/data/cctv-dds.json        จุดวัดที่มีกล้องส่งภาพได้ (หน้าเว็บใช้วาดหมุด/popup)
//   (รวม LiveStream ของแต่ละกล้องไว้ในไฟล์เดียวกัน — เบราว์เซอร์ขอภาพจาก proxy ของ กทม. เองเมื่อผู้ใช้แตะปุ่ม)
//
// ทำไมไม่ผ่าน Worker: 30 ก.ย. 2569 floodbangkok.bangkok.go.th ตอบ 403 ทุกคำขอจาก Cloudflare Worker (แม้ header แบบเบราว์เซอร์)
// แต่ตอบ 200 ให้ IP ในไทย รวมถึงคำขอที่มี Referer: bangkokflood.com
//
// ภาระต่อ กทม.: --probe ยิงกล้องละ 1 ครั้ง (ราว 900 ครั้ง, ทีละ 3 + พัก 1 วิ ≈ 45–60 นาที) — รันด้วยมือเป็นครั้งคราว ไม่ใช่ทุกรอบ ingest
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const BASE = 'https://floodbangkok.bangkok.go.th';
const API = `${BASE}/bkk/dds/services/api/floods/v1/items`;
const UA = 'Mozilla/5.0 (compatible; BangkokFloodWatch/0.1; +https://bangkokflood.com)';
const probe = !process.argv.includes('--no-probe');
// proxy ของ กทม. ใช้ ffmpeg ตัดเฟรมต่อคำขอ — 30 ก.ย. 2569 ยิงพร้อมกัน 12 แล้ว proxy เริ่มตอบ 500 "ffmpeg capture failed" → ทีละ 3 + พัก 1 วินาที
const CONCURRENCY = Number(process.env.CCTV_PROBE_CONCURRENCY ?? 3);
const PAUSE_MS = 1_000;

interface CamRaw { id: number; CameraName: string | null; SensorName: string | null; Lat: number | null; Long: number | null; LiveStream: string | null; camera_description: string | null }
interface SensorRaw { code: string; name: string | null; district: string | null; lat: number | null; long: number | null }

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return ((await r.json()) as { data: T }).data;
}

export const proxyUrl = (live: string) => `${BASE}/api/proxy?rtcUrl=${encodeURIComponent(live)}`;

async function isLive(live: string): Promise<boolean> {
  try {
    const r = await fetch(proxyUrl(live), { headers: { 'user-agent': UA, referer: `${BASE}/device-info` }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) return false;
    return (await r.arrayBuffer()).byteLength > 5_000; // ภาพจริง ~100–200 KB; ภาพว่าง/ข้อความ error เล็กมาก
  } catch {
    return false;
  }
}

const [cams, sensors] = await Promise.all([
  getJson<CamRaw[]>(`${API}/camera_profile?limit=-1&offset=0`),
  getJson<SensorRaw[]>(`${API}/sensor_profile?limit=-1&page=0`),
]);
const sensorBy = new Map(sensors.map((s) => [s.code, s]));
const usable = cams.filter((c) => c.SensorName && c.LiveStream?.startsWith('https://') && c.Lat && c.Long);
console.log(`cameras: ${cams.length} total, ${usable.length} with sensor + stream + coords`);

const live = new Set<number>();
if (probe) {
  let done = 0;
  const queue = [...usable];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      if (await isLive(c.LiveStream!)) live.add(c.id);
      await new Promise((r) => setTimeout(r, PAUSE_MS))
      if (++done % 50 === 0) console.log(`  probed ${done}/${usable.length} — live ${live.size}`);
    }
  }));
} else {
  for (const c of usable) live.add(c.id);
}
console.log(`live cameras: ${live.size}`);

// จัดกลุ่มตามจุดวัด (1 จุดมีกล้อง 1–7 ตัว) — ใช้ชื่อ/พิกัดจาก sensor_profile ถ้ามี
const groups = new Map<string, { sensor: string; name: string; district: string | null; lat: number; lng: number; cams: number[] }>();
for (const c of usable) {
  if (!live.has(c.id)) continue;
  const s = sensorBy.get(c.SensorName!);
  const g = groups.get(c.SensorName!) ?? {
    sensor: c.SensorName!,
    name: s?.name?.trim() || c.SensorName!,
    district: s?.district?.trim() || null,
    lat: +(s?.lat ?? c.Lat!).toFixed(6),
    lng: +(s?.long ?? c.Long!).toFixed(6),
    cams: [],
  };
  g.cams.push(c.id);
  groups.set(c.SensorName!, g);
}
const list = [...groups.values()].map((g) => ({ ...g, cams: g.cams.sort((a, b) => a - b) })).sort((a, b) => a.sensor.localeCompare(b.sensor));

writeFileSync(resolve(ROOT, 'web/data/cctv-dds.json'), JSON.stringify({
  source: 'bma_dds_cctv',
  source_name: 'กล้องที่จุดวัดน้ำท่วมถนน สำนักการระบายน้ำ กทม.',
  source_url: `${BASE}/`,
  checked_at: new Date().toISOString(),
  probed: probe,
  cameras: live.size,
  count: list.length,
  sensors: list,
  streams: Object.fromEntries(usable.filter((c) => live.has(c.id)).map((c) => [c.id, c.LiveStream!])),
}));
console.log(`wrote web/data/cctv-dds.json (${list.length} sensor points, ${live.size} cameras)`);
