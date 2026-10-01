import type { FloodCollection, FloodFeature, Level, SourceId, SourceMeta } from './types.ts';

export const SOURCE_META: Record<SourceId, SourceMeta> = {
  thaiwater_waterlevel: {
    id: 'thaiwater_waterlevel',
    name: 'ระดับน้ำสถานีหลัก (คลังข้อมูลน้ำแห่งชาติ สสน.)',
    short: 'ระดับน้ำ',
    url: 'https://www.thaiwater.net/new4all',
    unit: 'ม.รทก.',
  },
  thaiwater_rain: {
    id: 'thaiwater_rain',
    name: 'ฝนสะสม 24 ชม. (คลังข้อมูลน้ำแห่งชาติ สสน.)',
    short: 'ฝน 24 ชม.',
    url: 'https://www.thaiwater.net/new4all',
    unit: 'มม.',
  },
  bma_flood_road: {
    id: 'bma_flood_road',
    name: 'เซนเซอร์น้ำท่วมถนน (สำนักการระบายน้ำ กทม.)',
    short: 'น้ำท่วมถนน กทม.',
    url: 'https://weather.bangkok.go.th/flood/',
    unit: 'ซม.',
  },
  bma_canal: {
    id: 'bma_canal',
    name: 'ระดับน้ำในคลอง กทม. (สำนักการระบายน้ำ กทม.)',
    short: 'คลอง กทม.',
    url: 'https://weather.bangkok.go.th/KlongMap',
    unit: 'ม.รทก.',
  },
  traffy_flood: {
    id: 'traffy_flood',
    name: 'เรื่องร้องเรียนน้ำท่วม (Traffy Fondue)',
    short: 'ร้องเรียน Traffy',
    url: 'https://share.traffy.in.th/teamchadchart',
    unit: null,
  },
  gistda_flood: {
    id: 'gistda_flood',
    name: 'พื้นที่น้ำท่วมจากดาวเทียม (GISTDA Disaster Platform)',
    short: 'ดาวเทียม GISTDA',
    url: 'https://disaster.gistda.or.th/flood',
    unit: 'เซลล์',
  },
};

export const SOURCE_IDS = Object.keys(SOURCE_META) as SourceId[];

export const LEVEL_ORDER: Record<Level, number> = { critical: 3, warning: 2, watch: 1, normal: 0 };

export const LEVEL_LABEL: Record<Level, string> = {
  critical: 'วิกฤต',
  warning: 'เตือนภัย',
  watch: 'เฝ้าระวัง',
  normal: 'ปกติ',
};

/** ข้อมูลเก่ากว่านี้ถือว่า "อาจไม่เป็นปัจจุบัน" (CLAUDE.md ข้อ 9.3) */
export const STALE_MS = 30 * 60 * 1000;

/** เวลาที่ไม่มี offset ถือเป็นเวลาไทย (+07:00); ที่มี Z/offset อยู่แล้วคงไว้ */
export function toIso(s: string): string {
  const t = s.trim().replace(' ', 'T');
  if (/Z$|[+-]\d\d:?\d\d$/.test(t)) return new Date(t).toISOString();
  // Traffy: "2026-09-26 07:33:36.854728+00"
  if (/[+-]\d\d$/.test(t)) return new Date(`${t}:00`).toISOString();
  const withSec = /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(t) ? `${t}:00` : t;
  return new Date(`${withSec}+07:00`).toISOString();
}

export const ms = (iso: string) => Date.parse(iso);

export function latestObserved(features: FloodFeature[]): string | null {
  let max = -Infinity;
  for (const f of features) {
    const t = ms(f.properties.observed_at);
    if (t > max) max = t;
  }
  return Number.isFinite(max) ? new Date(max).toISOString() : null;
}

export function makeCollection(
  id: SourceId,
  features: FloodFeature[],
  extra: Partial<Pick<FloodCollection, 'via' | 'stale' | 'snapshot' | 'error' | 'fetched_at'>> = {},
): FloodCollection {
  const meta = SOURCE_META[id];
  return {
    type: 'FeatureCollection',
    source: id,
    source_name: meta.name,
    source_url: meta.url,
    fetched_at: extra.fetched_at ?? new Date().toISOString(),
    observed_at: latestObserved(features),
    via: extra.via ?? null,
    stale: extra.stale ?? false,
    snapshot: extra.snapshot ?? false,
    error: extra.error ?? null,
    count: features.length,
    features,
  };
}

export function point(lng: number, lat: number, properties: FloodFeature['properties']): FloodFeature {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [round(lng), round(lat)] }, properties };
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

export const validCoord = (lng: unknown, lat: unknown): lng is number =>
  typeof lng === 'number' && typeof lat === 'number' && Number.isFinite(lng) && Number.isFinite(lat) &&
  lat > 4 && lat < 22 && lng > 96 && lng < 107; // ขอบเขตประเทศไทยแบบหยาบ

/** URL ที่จะไปอยู่ใน href — รับเฉพาะ https */
export const httpsOnly = (u: unknown): string | null => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);

export const squash = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** fetch พร้อม timeout — แหล่งหนึ่งล่มต้องไม่ทำให้รอบ ingest ทั้งรอบค้าง */
export async function fetchOk(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 20_000, ...rest } = init;
  const r = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r;
}

export const getJson = async <T = unknown>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> =>
  (await fetchOk(url, init)).json() as Promise<T>;
