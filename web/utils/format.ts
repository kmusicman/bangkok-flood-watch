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
