// สำนักการระบายน้ำ กทม. — ไม่มี API ทางการ หน้า weather.bangkok.go.th/flood/ ฝัง `const floodData = [...]` ไว้ใน HTML
// ตรวจ 26 ก.ย. 2569: เว็บตอบ 403 ให้ทุก client ที่ UA ไม่ใช่เบราว์เซอร์ และมักตอบเฉพาะ IP ในไทย
// ลำดับ fallback: (0) API ของระบบ floodbangkok.bangkok.go.th (1 ต.ค. 2569) → (0b) API เปิดของ POPNIX Flood → (1) หน้า กทม. โดยตรง (ทุก 30 นาที) → (2) relay ของ สสน. (flood_road) ถ้าไม่เก่ากว่า 3 ชม. → (3) ข้อมูลชุดเดิม
// Phase 2: ขอ feed ทางการจาก กทม. (CLAUDE.md ข้อ 9)

import type { FloodFeature, Level } from '../types.ts';
import { fetchOk, point, squash, toIso, validCoord, httpsOnly } from '../util.ts';
import { fetchFloodRoadRelay, type TwFloodRoadRaw } from './thaiwater.ts';
import BMA_DISTRICTS from '../data/bma_districts.json' with { type: 'json' };

export const BMA_FLOOD_PAGE = 'https://weather.bangkok.go.th/flood/';
// เว็บ กทม. ปฏิเสธ UA ที่ระบุตัวเป็นบอต — ใช้ UA เบราว์เซอร์ทั่วไป อ่านหน้าสาธารณะ 1 ครั้ง/รอบ (ทุก 10 นาที)
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const RELAY_MAX_AGE_MS = 3 * 3600 * 1000;
const SENSOR_MAX_AGE_MS = 6 * 3600 * 1000;

export interface BmaRaw {
  flood_code: string;
  flood_name: string;
  flood_name_en?: string | null;
  road_name?: string | null;
  flood: number | null; // ซม.
  flood_start: string | null;
  flood_max: number | null;
  latitude: number;
  longitude: number;
  site_timestamp: string; // "2026-09-26T14:30:00" เวลาไทย
  web_url?: string | null;
}

/** เกณฑ์ระดับน้ำบนผิวจราจร: <10 ซม. รถเล็กผ่านได้, 10–20 เริ่มมีผลต่อการจราจร, ≥20 ท่วมหนัก */
export const roadLevel = (cm: number): Level => (cm <= 0 ? 'normal' : cm < 10 ? 'watch' : cm < 20 ? 'warning' : 'critical');

const districtOf = (code: string): string | null => (BMA_DISTRICTS as Record<string, string | null>)[code] ?? null;

/** ดึง array/object literal ที่อยู่หลัง marker ออกจาก HTML (รองรับ ] } และ " ภายใน string) */
export function extractJsonAfter(src: string, marker: string): unknown {
  const at = src.indexOf(marker);
  const start = at < 0 ? -1 : src.indexOf('[', at + marker.length);
  if (start < 0) throw new Error(`marker not found: ${marker}`);
  let depth = 0;
  let inStr = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if ((c === ']' || c === '}') && --depth === 0) return JSON.parse(src.slice(start, i + 1));
  }
  throw new Error('unterminated JSON literal');
}

export function parseBmaPage(html: string, now = Date.now()): FloodFeature[] {
  return parseBma(extractJsonAfter(html, 'const floodData =') as BmaRaw[], now);
}

export function parseBma(rows: BmaRaw[], now = Date.now()): FloodFeature[] {
  const out: FloodFeature[] = [];
  for (const r of rows) {
    if (!r.flood_code || !validCoord(r.longitude, r.latitude) || !r.site_timestamp) continue;
    const observed_at = toIso(r.site_timestamp);
    if (now - Date.parse(observed_at) > SENSOR_MAX_AGE_MS) continue;
    const cm = Number(r.flood) || 0;
    const max = r.flood_max != null ? Number(r.flood_max) : null;
    const parts: string[] = [];
    if (r.flood_start) parts.push(`เริ่มท่วม ${squash(r.flood_start).slice(11, 16) || squash(r.flood_start)}`);
    if (max != null && max > cm) parts.push(`สูงสุด ${max} ซม.`);
    out.push(point(r.longitude, r.latitude, {
      source: 'bma_flood_road',
      id: r.flood_code,
      name: squash(r.flood_name),
      province: 'กรุงเทพมหานคร',
      province_code: '10',
      district: districtOf(r.flood_code),
      value: cm,
      unit: 'ซม.',
      level: roadLevel(cm),
      observed_at,
      detail: parts.length ? parts.join(' · ') : null,
      url: httpsOnly(r.web_url) ?? `https://floodbangkok.bangkok.go.th/device-info?sensor_profile_id=${encodeURIComponent(r.flood_code)}`,
      photo: null,
      agency: 'สนน. กทม.',
    }));
  }
  return out;
}

export function parseRelay(raw: TwFloodRoadRaw, now = Date.now()): FloodFeature[] {
  const out: FloodFeature[] = [];
  for (const r of raw.data ?? []) {
    const st = r.station;
    if (!st || r.floodroad_value == null || !validCoord(st.floodroad_long, st.floodroad_lat)) continue;
    const observed_at = toIso(r.floodroad_datetime);
    if (now - Date.parse(observed_at) > RELAY_MAX_AGE_MS) continue;
    const cm = Number(r.floodroad_value) || 0;
    out.push(point(st.floodroad_long, st.floodroad_lat, {
      source: 'bma_flood_road',
      id: st.floodroad_oldcode,
      name: squash(st.floodroad_name?.th),
      province: 'กรุงเทพมหานคร',
      province_code: '10',
      district: r.geocode?.amphoe_name?.th ?? districtOf(st.floodroad_oldcode),
      value: cm,
      unit: 'ซม.',
      level: roadLevel(cm),
      observed_at,
      detail: null,
      url: `https://floodbangkok.bangkok.go.th/device-info?sensor_profile_id=${encodeURIComponent(st.floodroad_oldcode)}`,
      photo: null,
      agency: 'สนน. กทม. (ผ่าน สสน.)',
    }));
  }
  return out;
}

// ---- (0) API ของระบบตรวจวัดน้ำท่วมถนน (floodbangkok.bangkok.go.th) — แกะจากหน้า device-info 1 ต.ค. 2569 ----
//   sensor_profile?limit=-1 → รายชื่อจุดวัด {code, name, district, lat, long, device_status}
//   sensor_flood?filter[date_created][_gte]=… → ค่าที่ส่งเข้ามาทุก ~5 นาที {sensor_name, value (ซม., string), timestamp (ms), start_flood "HH:MM", heighest_value}
//   รวมจุดในอุโมงค์ทางลอด (TN.*) ด้วย; device_status 'malfunction' = เซนเซอร์เสีย → ไม่แสดงค่า
export const BMA_API = 'https://floodbangkok.bangkok.go.th/bkk/dds/services/api/floods/v1/items';
const API_WINDOW_MS = 30 * 60_000;

interface ApiProfile { code: string; name: string | null; road: string | null; district: string | null; lat: number | null; long: number | null; device_status: string | null }
interface ApiReading { sensor_name: string; value: string | number | null; timestamp: string | number | null; date_created: string; start_flood: string | null; heighest_value: string | number | null; timestamp_start_flood?: string | number | null }

const readingTime = (r: ApiReading) => Number(r.timestamp) || Date.parse(r.date_created);

export function parseBmaApi(profiles: ApiProfile[], readings: ApiReading[], now = Date.now()): FloodFeature[] {
  const latest = new Map<string, ApiReading>();
  for (const r of readings) {
    const cur = latest.get(r.sensor_name);
    if (!cur || readingTime(r) > readingTime(cur)) latest.set(r.sensor_name, r);
  }
  const out: FloodFeature[] = [];
  for (const p of profiles) {
    const r = latest.get(p.code);
    if (!r || !validCoord(p.long, p.lat)) continue;
    if (p.device_status === 'malfunction' || p.device_status === 'temporary_malfunction') continue;
    const t = readingTime(r);
    if (!Number.isFinite(t) || now - t > SENSOR_MAX_AGE_MS) continue;
    const cm = Math.max(0, Number(r.value) || 0);
    const max = r.heighest_value != null && r.heighest_value !== '' ? Number(r.heighest_value) : null;
    const parts: string[] = [];
    // เวลาเริ่มท่วมแบบเต็ม (ms) — start_flood เป็นแค่ HH:MM ไม่มีวันที่ ท่วมข้ามวันแล้วอ่านผิด
    const startMs = Number(r.timestamp_start_flood)
    const since = cm > 0 && Number.isFinite(startMs) && startMs > 0 && startMs <= t ? new Date(startMs).toISOString() : null
    if (max != null && Number.isFinite(max) && max > cm) parts.push(`สูงสุด ${max} ซม.`);
    if (p.code.startsWith('TN.')) parts.push('อุโมงค์ทางลอด');
    out.push(point(p.long!, p.lat!, {
      source: 'bma_flood_road',
      id: p.code,
      name: squash(p.name ?? p.code).replace(/\s*\*$/, ''),
      province: 'กรุงเทพมหานคร',
      province_code: '10',
      district: squash(p.district ?? '') || districtOf(p.code),
      value: cm,
      unit: 'ซม.',
      level: roadLevel(cm),
      observed_at: new Date(t).toISOString(),
      detail: parts.length ? parts.join(' · ') : null,
      url: `https://floodbangkok.bangkok.go.th/device-info?sensor_profile_id=${encodeURIComponent(p.code)}`,
      photo: null,
      agency: 'สนน. กทม.',
      since,
    }));
  }
  return out;
}

async function fetchBmaApi(now = Date.now()): Promise<FloodFeature[]> {
  const opts = { headers: { 'user-agent': BROWSER_UA, accept: 'application/json' }, timeoutMs: 40_000 };
  const since = new Date(now - API_WINDOW_MS).toISOString();
  const [profiles, readings] = await Promise.all([
    fetchOk(`${BMA_API}/sensor_profile?limit=-1&fields=code,name,road,district,lat,long,device_status`, opts).then((r) => r.json() as Promise<{ data: ApiProfile[] }>),
    fetchOk(`${BMA_API}/sensor_flood?limit=-1&sort=-date_created&fields=sensor_name,value,timestamp,date_created,start_flood,heighest_value,timestamp_start_flood&filter[date_created][_gte]=${encodeURIComponent(since)}`, opts).then((r) => r.json() as Promise<{ data: ApiReading[] }>),
  ]);
  if (!Array.isArray(profiles?.data) || !Array.isArray(readings?.data)) throw new Error('floodbangkok API: unexpected response shape');
  const features = parseBmaApi(profiles.data, readings.data, now);
  if (!features.length) throw new Error(`floodbangkok API: no fresh readings (${readings.data.length} rows)`);
  return features;
}

// ---- (0b) API เปิดของ POPNIX Flood (flood.pop.in.th/api_roads.php) — ข้อมูลชุดเดียวกัน (รหัส FL.xxx ตรงกัน) ----
//   ใช้เมื่อ API ของ กทม. ปฏิเสธ (1 ต.ค. 2569: floodbangkok ตอบ 403 ให้ runner ของ GitHub เหมือน weather.bangkok.go.th)
//   เงื่อนไขของ POPNIX: ใช้ฟรีรวมเชิงพาณิชย์, ให้เครดิต (อยู่ท้ายหน้าเว็บ + agency ในแต่ละจุด), ไม่เรียกถี่ (เรา 6 ครั้ง/ชม.)
//   level 'off' = เซนเซอร์ไม่ส่งค่า/ขัดข้อง → ไม่แสดงค่า; kind 2 = อุโมงค์ทางลอด
export const POPNIX_ROADS_URL = 'https://flood.pop.in.th/api_roads.php';

interface PopnixRoad { code: string; kind: number; name: string; district: string | null; lat: number; lng: number; depth: number | null; measured_at: string | null; flood_max: number | null; level: string; since: string | null }

const bkkIso = (s: string) => new Date(Date.parse(s.replace(' ', 'T') + '+07:00')).toISOString();

export function parsePopnixRoads(data: { roads?: PopnixRoad[] }, now = Date.now()): FloodFeature[] {
  const out: FloodFeature[] = [];
  for (const r of data.roads ?? []) {
    if (!r.code || r.level === 'off' || r.depth == null || !r.measured_at || !validCoord(r.lng, r.lat)) continue;
    const observed_at = bkkIso(r.measured_at);
    if (now - Date.parse(observed_at) > SENSOR_MAX_AGE_MS) continue;
    const cm = Math.max(0, Number(r.depth) || 0);
    const parts: string[] = [];
    if (r.flood_max != null && r.flood_max > cm) parts.push(`สูงสุด ${r.flood_max} ซม.`);
    if (r.kind === 2 || r.code.startsWith('TN.')) parts.push('อุโมงค์ทางลอด');
    out.push(point(r.lng, r.lat, {
      source: 'bma_flood_road',
      id: r.code,
      name: squash(r.name),
      province: 'กรุงเทพมหานคร',
      province_code: '10',
      district: r.district ? squash(r.district) : districtOf(r.code),
      value: cm,
      unit: 'ซม.',
      level: roadLevel(cm),
      observed_at,
      detail: parts.length ? parts.join(' · ') : null,
      url: `https://floodbangkok.bangkok.go.th/device-info?sensor_profile_id=${encodeURIComponent(r.code)}`,
      photo: null,
      agency: 'สนน. กทม. (ผ่าน POPNIX Flood)',
      since: cm > 0 && r.since ? bkkIso(r.since) : null,
    }));
  }
  return out;
}

async function fetchPopnixRoads(): Promise<FloodFeature[]> {
  const r = await fetchOk(POPNIX_ROADS_URL, { headers: { 'user-agent': 'BangkokFloodWatch/0.1 (+https://bangkokflood.com)', accept: 'application/json' }, timeoutMs: 30_000 });
  const features = parsePopnixRoads(await r.json() as { roads?: PopnixRoad[] });
  if (!features.length) throw new Error('POPNIX roads: no fresh sensors');
  return features;
}

/**
 * รอบนี้ไม่ได้ลองหน้า กทม. (เว้นระยะกันโดนบล็อก) และ relay ก็เก่า → ไม่ใช่ความล้มเหลวใหม่
 * ingestAll จะคงชุดเดิมไว้ทั้งก้อน (รวม error จริงของรอบที่ลองล่าสุด) แทนที่จะเขียน error ทับ
 */
export class SkipRound extends Error {
  readonly skip = true;
}

/**
 * คืนค่า features + เส้นทางที่ได้มา; โยน error ถ้าทั้งสองทางล้มเหลว
 * direct=false → ข้ามหน้า กทม. ใช้ relay ของ สสน. อย่างเดียว
 * (ไฟร์วอลล์ของ weather.bangkok.go.th จำกัดครั้งต่อ IP: 28 ก.ย. 2569 IP ไทยได้ 200 ครั้งแรกแล้ว 403 ติดกัน, runner ของ GitHub โดน 403 ตั้งแต่ 16:22 น.)
 */
export async function fetchBma(direct = true): Promise<{ features: FloodFeature[]; via: string | null }> {
  let apiError: unknown;
  try {
    return { features: await fetchBmaApi(), via: 'floodbangkok_api' };
  } catch (e) {
    apiError = e;
  }
  try {
    return { features: await fetchPopnixRoads(), via: 'popnix' };
  } catch (e) {
    apiError = `${String(apiError)}; POPNIX: ${String(e)}`;
  }
  let directError: unknown = 'not tried this round';
  if (direct) {
    try {
      const html = await (await fetchOk(BMA_FLOOD_PAGE, { headers: { 'user-agent': BROWSER_UA, accept: 'text/html' }, timeoutMs: 25_000 })).text();
      const features = parseBmaPage(html);
      if (!features.length) throw new Error('BMA page parsed but no fresh sensors');
      return { features, via: null };
    } catch (e) {
      directError = e;
    }
  }
  const relay = parseRelay(await fetchFloodRoadRelay());
  if (!relay.length) {
    if (!direct) throw new SkipRound(`BMA API failed (${String(apiError)}); direct page not due this round; thaiwater relay is stale`);
    throw new Error(`BMA API failed (${String(apiError)}); direct page failed (${String(directError)}); thaiwater relay is stale`);
  }
  return { features: relay, via: 'thaiwater_relay' };
}
