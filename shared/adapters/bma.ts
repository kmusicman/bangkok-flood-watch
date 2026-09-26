// สำนักการระบายน้ำ กทม. — ไม่มี API ทางการ หน้า weather.bangkok.go.th/flood/ ฝัง `const floodData = [...]` ไว้ใน HTML
// ตรวจ 26 ก.ย. 2569: เว็บตอบ 403 ให้ทุก client ที่ UA ไม่ใช่เบราว์เซอร์ และมักตอบเฉพาะ IP ในไทย
// ลำดับ fallback: (1) หน้า กทม. โดยตรง → (2) relay ของ สสน. (flood_road) ถ้าไม่เก่ากว่า 3 ชม. → (3) ข้อมูลชุดเดิมใน KV (Worker จัดการ)
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

/** คืนค่า features + เส้นทางที่ได้มา; โยน error ถ้าทั้งสองทางล้มเหลว */
export async function fetchBma(): Promise<{ features: FloodFeature[]; via: string | null }> {
  let directError: unknown;
  try {
    const html = await (await fetchOk(BMA_FLOOD_PAGE, { headers: { 'user-agent': BROWSER_UA, accept: 'text/html' }, timeoutMs: 25_000 })).text();
    const features = parseBmaPage(html);
    if (!features.length) throw new Error('BMA page parsed but no fresh sensors');
    return { features, via: null };
  } catch (e) {
    directError = e;
  }
  const relay = parseRelay(await fetchFloodRoadRelay());
  if (!relay.length) throw new Error(`BMA direct failed (${String(directError)}) and thaiwater relay is stale`);
  return { features: relay, via: 'thaiwater_relay' };
}
