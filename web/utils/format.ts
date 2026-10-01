import type { FloodProps, Level } from '../../shared/types.ts';
export { LEVEL_LABEL, LEVEL_ORDER, SOURCE_IDS, SOURCE_META, STALE_MS } from '../../shared/util.ts';
export type { FloodBundle, FloodCollection, FloodFeature, FloodProps, Level, SourceId } from '../../shared/types.ts';

export const LEVEL_COLOR: Record<Level, string> = {
  normal: '#2e7d32',
  watch: '#e6a100',
  warning: '#ef6c00',
  critical: '#c62828',
};

const TZ = 'Asia/Bangkok';
const timeFmt = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dateFmt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ });

/** "14:30" ถ้าเป็นวันนี้ ไม่งั้น "25 ก.ย. 20:10" */
export function fmtTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return now - t < 20 * 3600 * 1000 ? timeFmt.format(t) : dateFmt.format(t);
}

/** "3 นาทีที่แล้ว" / "2 ชม. ที่แล้ว" / "2 วันที่แล้ว" */
export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const diff = Math.max(0, now - Date.parse(iso));
  const m = Math.round(diff / 60000);
  if (m < 1) return 'เมื่อสักครู่';
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ชม. ที่แล้ว`;
  return `${Math.round(h / 24)} วันที่แล้ว`;
}

export const isStale = (iso: string | null | undefined, now = Date.now(), maxMs = 30 * 60 * 1000) =>
  !iso || now - Date.parse(iso) > maxMs;

export function fmtValue(p: FloodProps): string {
  if (p.value == null) return '';
  const v = Number.isInteger(p.value) ? String(p.value) : p.value.toFixed(2).replace(/\.?0+$/, '');
  return p.unit ? `${v} ${p.unit}` : v;
}

export const fmtInt = (n: number) => n.toLocaleString('th-TH');

// ---- แนวโน้ม / ระยะเวลาที่ผิดปกติ (ค่ามาจาก shared/trends.ts ตอน ingest) ----
const TREND_MAX_MIN = 180 // เทียบกับค่าที่เก่ากว่า 3 ชม. ไม่นับเป็นแนวโน้ม

const num = (n: number, unit: string | null) => {
  const dp = unit === 'ม.รทก.' || unit === 'ม.' ? 2 : Number.isInteger(n) ? 0 : 1
  return n.toFixed(dp)
}

/** "▲ +3 ซม. ใน 10 นาที" — คืน null ถ้าไม่มีข้อมูลหรือเก่าเกิน */
export function fmtTrend(p: FloodProps): { text: string; dir: 'up' | 'down' | 'flat' } | null {
  if (p.delta == null || p.delta_min == null || p.delta_min > TREND_MAX_MIN) return null
  const flat = Math.abs(p.delta) < (p.unit === 'ซม.' ? 1 : p.unit === 'มม.' ? 0.5 : 0.01)
  if (flat) return { text: `ทรงตัว (${p.delta_min} นาที)`, dir: 'flat' }
  const up = p.delta > 0
  return { text: `${up ? '▲ +' : '▼ '}${num(p.delta, p.unit)}${p.unit ? ` ${p.unit}` : ''} ใน ${p.delta_min} นาที`, dir: up ? 'up' : 'down' }
}

/** "ตั้งแต่ 25 ก.ย. 16:50 (5 วัน 1 ชม.)" */
export function fmtSince(p: FloodProps, now = Date.now()): string {
  if (!p.since) return ''
  const mins = Math.max(0, Math.round((now - Date.parse(p.since)) / 60_000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  const dur = d ? `${d} วัน${h ? ` ${h} ชม.` : ''}` : h ? `${h} ชม.${m ? ` ${m} นาที` : ''}` : `${m} นาที`
  return `ตั้งแต่ ${fmtTime(p.since, now)} (${dur})`
}

export function fmtMaxToday(p: FloodProps): string {
  if (p.max_today == null || p.value == null || p.max_today <= p.value) return ''
  return `สูงสุดวันนี้ ${num(p.max_today, p.unit)}${p.unit ? ` ${p.unit}` : ''}`
}
