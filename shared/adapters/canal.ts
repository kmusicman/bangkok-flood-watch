// ระดับน้ำในคลอง กทม. (~200 จุดวัดของสำนักการระบายน้ำ) — ม.รทก. เทียบเกณฑ์เฝ้าระวัง/วิกฤตของแต่ละจุด
// ลำดับต้นทาง (แกะ 1 ต.ค. 2569):
//   (1) weather.bangkok.go.th/Klongmap/GetDataForUpdate — JSON ~2 MB ที่หน้า KlongMap ของ กทม. ใช้
//       waterStation[].water_station_info {water_id, water_code, water_name, latitude, longitude, warning, critical, left_bank, river_name, district_id}
//       waterStation[].water_level_last   {wl_in, site_timestamp "/Date(ms)/", max_in_day, max_in_yesterday}  (wl -99 = ไม่มีค่า)
//       โดเมนเดียวกับหน้าน้ำท่วมถนนที่บล็อก runner ของ GitHub เป็นช่วง ๆ
//   (2) API เปิดของ POPNIX Flood (flood.pop.in.th/api_overview.php) — ข้อมูลชุดเดียวกัน (water_id ตรงกัน 200/200)
//       ใช้ฟรีรวมเชิงพาณิชย์ เงื่อนไข: ให้เครดิต "ข้อมูล: สำนักการระบายน้ำ กรุงเทพมหานคร ผ่าน POPNIX Flood", ไม่เรียกถี่ (เรา 6 ครั้ง/ชม.)
// เขตของแต่ละจุดมาจาก shared/data/bma_canals.json (water_id → เขต, สร้างจาก district_id ของ KlongMap)
import type { FloodFeature, Level } from '../types.ts';
import { fetchOk, point, squash, validCoord } from '../util.ts';
import CANALS from '../data/bma_canals.json' with { type: 'json' };

export const KLONGMAP_URL = 'https://weather.bangkok.go.th/Klongmap/GetDataForUpdate';
export const POPNIX_OVERVIEW_URL = 'https://flood.pop.in.th/api_overview.php';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const MAX_AGE_MS = 6 * 3600_000;
const PAGE_URL = 'https://weather.bangkok.go.th/KlongMap';

const meta = (id: string | number) => (CANALS as Record<string, { code: string | null; district: string | null }>)[String(id)];

/** ≥ วิกฤต → critical, ≥ เฝ้าระวัง → warning, ห่างเกณฑ์เฝ้าระวังไม่ถึง 10 ซม. → watch */
export function canalLevel(wl: number, warn: number | null, crit: number | null): Level {
  if (crit != null && wl >= crit) return 'critical';
  if (warn != null && wl >= warn) return 'warning';
  if (warn != null && wl >= warn - 0.1) return 'watch';
  return 'normal';
}

const m2 = (n: number) => n.toFixed(2);

function feature(o: {
  id: string | number; name: string; river: string | null; lat: number; lng: number; wl: number; warn: number | null; crit: number | null;
  bank: number | null; maxDay: number | null; at: number; agency: string;
}): FloodFeature {
  const parts: string[] = [];
  if (o.river) parts.push(o.river);
  if (o.crit != null && o.wl >= o.crit) parts.push(`เกินเกณฑ์วิกฤต ${m2(o.wl - o.crit)} ม.`);
  else if (o.warn != null && o.wl >= o.warn) parts.push(`เกินเกณฑ์เฝ้าระวัง ${m2(o.wl - o.warn)} ม.`);
  else if (o.warn != null) parts.push(`ต่ำกว่าเกณฑ์เฝ้าระวัง ${m2(o.warn - o.wl)} ม.`);
  if (o.bank != null) parts.push(o.wl >= o.bank ? `ล้นตลิ่ง ${m2(o.wl - o.bank)} ม.` : `ต่ำกว่าตลิ่ง ${m2(o.bank - o.wl)} ม.`);
  const m = meta(o.id);
  return point(o.lng, o.lat, {
    source: 'bma_canal',
    id: String(o.id),
    name: squash(o.name),
    province: 'กรุงเทพมหานคร',
    province_code: '10',
    district: m?.district ?? null,
    value: Math.round(o.wl * 100) / 100,
    unit: 'ม.รทก.',
    level: canalLevel(o.wl, o.warn, o.crit),
    observed_at: new Date(o.at).toISOString(),
    detail: parts.join(' · ') || null,
    url: PAGE_URL,
    photo: null,
    agency: o.agency,
    max_today: o.maxDay,
  });
}

const msOf = (d: string | null | undefined) => {
  const m = /\/Date\((\d+)\)\//.exec(d ?? '');
  return m ? Number(m[1]) : NaN;
};

interface KlongStation {
  station_name?: string | null;
  water_station_info?: { water_id: number; water_name: string | null; water_shortname?: string | null; latitude: number | null; longitude: number | null; warning: number | null; critical: number | null; left_bank: number | null; river_name: string | null } | null;
  water_level_last?: { wl_in: number | null; site_timestamp: string | null; max_in_day: number | null } | null;
}

export function parseKlongMap(data: { waterStation?: KlongStation[] }, now = Date.now()): FloodFeature[] {
  const out: FloodFeature[] = [];
  for (const s of data.waterStation ?? []) {
    const i = s.water_station_info;
    const l = s.water_level_last;
    if (!i || !l || l.wl_in == null || l.wl_in <= -90 || !validCoord(i.longitude, i.latitude)) continue;
    const at = msOf(l.site_timestamp);
    if (!Number.isFinite(at) || now - at > MAX_AGE_MS) continue;
    out.push(feature({
      id: i.water_id, name: s.station_name || i.water_shortname || i.water_name || String(i.water_id), river: i.river_name,
      lat: i.latitude!, lng: i.longitude!, wl: l.wl_in, warn: i.warning, crit: i.critical, bank: i.left_bank,
      maxDay: l.max_in_day ?? null, at, agency: 'สนน. กทม.',
    }));
  }
  return out;
}

interface PopnixStation { id: number; name: string; river: string | null; lat: number; lng: number; warn: number | null; crit: number | null; bank: number | null; wl: number | null; max_day: number | null; measured_at: string | null; online?: boolean }

export function parsePopnix(data: { stations?: PopnixStation[] }, now = Date.now()): FloodFeature[] {
  const out: FloodFeature[] = [];
  for (const s of data.stations ?? []) {
    if (s.wl == null || !s.measured_at || !validCoord(s.lng, s.lat)) continue;
    const at = Date.parse(s.measured_at.replace(' ', 'T') + '+07:00'); // เวลาไทยไม่มี offset
    if (!Number.isFinite(at) || now - at > MAX_AGE_MS) continue;
    out.push(feature({
      id: s.id, name: s.name, river: s.river, lat: s.lat, lng: s.lng, wl: s.wl, warn: s.warn, crit: s.crit, bank: s.bank,
      maxDay: s.max_day ?? null, at, agency: 'สนน. กทม. (ผ่าน POPNIX Flood)',
    }));
  }
  return out;
}

export async function fetchCanals(): Promise<{ features: FloodFeature[]; via: string | null }> {
  let first: unknown;
  try {
    const r = await fetchOk(KLONGMAP_URL, {
      headers: { 'user-agent': BROWSER_UA, accept: 'application/json', 'x-requested-with': 'XMLHttpRequest', referer: PAGE_URL },
      timeoutMs: 45_000,
    });
    const features = parseKlongMap(await r.json() as { waterStation?: KlongStation[] });
    if (!features.length) throw new Error('KlongMap: no fresh stations');
    return { features, via: null };
  } catch (e) {
    first = e;
  }
  const r = await fetchOk(POPNIX_OVERVIEW_URL, {
    headers: { 'user-agent': 'BangkokFloodWatch/0.1 (+https://bangkokflood.com)', accept: 'application/json' },
    timeoutMs: 30_000,
  });
  const features = parsePopnix(await r.json() as { stations?: PopnixStation[] });
  if (!features.length) throw new Error(`KlongMap failed (${String(first)}) and POPNIX has no fresh stations`);
  return { features, via: 'popnix' };
}
