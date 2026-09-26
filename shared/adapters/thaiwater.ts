// คลังข้อมูลน้ำแห่งชาติ (สสน.) — public API ไม่ต้องใช้ key, ครอบคลุมทั้งประเทศ
// endpoint ตรวจแล้ว 26 ก.ย. 2569: waterlevel_load (805 สถานี), rain_24h (4,285 สถานี), flood_road (relay เซนเซอร์ กทม.)

import type { FloodFeature, Level } from '../types.ts';
import { getJson, latestObserved, point, squash, toIso, validCoord } from '../util.ts';

export const TW_BASE = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public';

const DAY_MS = 24 * 3600 * 1000;

interface TwGeocode {
  province_code?: string;
  province_name?: { th?: string };
  amphoe_name?: { th?: string };
}
interface TwAgency { agency_shortname?: { th?: string } }

export interface TwWaterlevelRow {
  id: number;
  waterlevel_datetime: string; // "2026-09-26 06:40" เวลาไทย
  waterlevel_msl: string | null;
  storage_percent: string | null;
  situation_level?: number; // 1 น้ำน้อยวิกฤต … 5 ล้นตลิ่ง
  diff_wl_bank?: string | null;
  diff_wl_bank_text?: string | null;
  agency?: TwAgency;
  geocode?: TwGeocode;
  station: {
    id: number;
    tele_station_name: { th?: string; en?: string };
    tele_station_lat: number;
    tele_station_long: number;
    tele_station_oldcode?: string;
    min_bank?: number | null;
  };
}
export interface TwWaterlevelRaw { waterlevel_data: { data: TwWaterlevelRow[] } }

export interface TwRainRow {
  id: number;
  rain_24h: number | null;
  rainfall_datetime: string;
  agency?: TwAgency;
  geocode?: TwGeocode;
  station: { id: number; tele_station_name: { th?: string; en?: string }; tele_station_lat: number; tele_station_long: number };
}
export interface TwRainRaw { data: TwRainRow[] }

export interface TwFloodRoadRow {
  floodroad_datetime: string;
  floodroad_value: number | null;
  geocode?: TwGeocode;
  station: { id: number; floodroad_name: { th?: string }; floodroad_lat: number; floodroad_long: number; floodroad_oldcode: string };
}
export interface TwFloodRoadRaw { data: TwFloodRoadRow[] }

/** situation_level ของ สสน.: 4 = น้ำมาก (70–100% ตลิ่ง), 5 = ล้นตลิ่ง */
export function waterlevelLevel(r: TwWaterlevelRow): Level {
  const s = Number(r.situation_level);
  if (s === 5 || (r.diff_wl_bank_text ?? '').includes('ล้น')) return 'critical';
  if (s === 4) return Number(r.storage_percent) >= 90 ? 'warning' : 'watch';
  return 'normal';
}

/** เกณฑ์กรมอุตุฯ: ฝนหนัก 35.1–90 มม., หนักมาก > 90 มม.; > 150 มม. ถือว่าวิกฤต */
export const rainLevel = (mm: number): Level => (mm > 150 ? 'critical' : mm > 90 ? 'warning' : mm > 35 ? 'watch' : 'normal');

export function parseWaterlevel(raw: TwWaterlevelRaw, now = Date.now()): FloodFeature[] {
  const out: FloodFeature[] = [];
  for (const r of raw.waterlevel_data?.data ?? []) {
    const st = r.station;
    if (!st || r.waterlevel_msl == null || !validCoord(st.tele_station_long, st.tele_station_lat)) continue;
    const observed_at = toIso(r.waterlevel_datetime);
    if (now - Date.parse(observed_at) > DAY_MS) continue; // สถานีที่ไม่ส่งข้อมูลมานานตัดทิ้ง
    const diff = r.diff_wl_bank != null ? Number(r.diff_wl_bank) : null;
    const bankText = r.diff_wl_bank_text?.includes('ล้น') ? 'ล้นตลิ่ง' : 'ต่ำกว่าตลิ่ง';
    out.push(point(st.tele_station_long, st.tele_station_lat, {
      source: 'thaiwater_waterlevel',
      id: String(st.id),
      name: squash(st.tele_station_name?.th || st.tele_station_name?.en || st.tele_station_oldcode),
      province: r.geocode?.province_name?.th ?? null,
      province_code: r.geocode?.province_code ?? null,
      district: r.geocode?.amphoe_name?.th ?? null,
      value: Number(r.waterlevel_msl),
      unit: 'ม.รทก.',
      level: waterlevelLevel(r),
      observed_at,
      detail: diff != null && Number.isFinite(diff) ? `${bankText} ${Math.abs(diff).toFixed(2)} ม.` : null,
      url: 'https://www.thaiwater.net/new4all',
      photo: null,
      agency: r.agency?.agency_shortname?.th ?? null,
    }));
  }
  return out;
}

/** เก็บเฉพาะสถานีที่มีฝน ≥ minMm (ค่าเริ่มต้น 10 มม. = ฝนปานกลางขึ้นไป) เพื่อให้ไฟล์เล็กพอสำหรับมือถือ */
export function parseRain(raw: TwRainRaw, opts: { minMm?: number; now?: number } = {}): FloodFeature[] {
  const { minMm = 10, now = Date.now() } = opts;
  const out: FloodFeature[] = [];
  for (const r of raw.data ?? []) {
    const st = r.station;
    if (!st || r.rain_24h == null || !validCoord(st.tele_station_long, st.tele_station_lat)) continue;
    const mm = Number(r.rain_24h);
    if (!Number.isFinite(mm) || mm < minMm) continue;
    const observed_at = toIso(r.rainfall_datetime);
    if (now - Date.parse(observed_at) > DAY_MS) continue;
    out.push(point(st.tele_station_long, st.tele_station_lat, {
      source: 'thaiwater_rain',
      id: String(st.id),
      name: squash(st.tele_station_name?.th || st.tele_station_name?.en),
      province: r.geocode?.province_name?.th ?? null,
      province_code: r.geocode?.province_code ?? null,
      district: r.geocode?.amphoe_name?.th ?? null,
      value: mm,
      unit: 'มม.',
      level: rainLevel(mm),
      observed_at,
      detail: null,
      url: 'https://www.thaiwater.net/new4all',
      photo: null,
      agency: r.agency?.agency_shortname?.th ?? null,
    }));
  }
  return out;
}

export const fetchWaterlevel = async () => parseWaterlevel(await getJson<TwWaterlevelRaw>(`${TW_BASE}/waterlevel_load`, { timeoutMs: 30_000 }));
export const fetchRain = async () => parseRain(await getJson<TwRainRaw>(`${TW_BASE}/rain_24h`, { timeoutMs: 30_000 }));

/** relay ของเซนเซอร์ถนน กทม. บน สสน. — ใช้เป็น fallback เมื่อดึงจาก กทม. ตรงไม่ได้ (บางครั้งค้างหลายชั่วโมง) */
export const fetchFloodRoadRelay = async () => getJson<TwFloodRoadRaw>(`${TW_BASE}/flood_road`, { timeoutMs: 20_000 });

export { latestObserved };
