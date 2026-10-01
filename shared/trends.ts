// แนวโน้ม + ระยะเวลาที่ผิดปกติ + ค่าสูงสุดของวัน — คำนวณตอน ingest จากชุดก่อนหน้า (ไม่ต้องมีฐานข้อมูล)
// GitHub Actions โหลด bundle เดิมจาก Worker อยู่แล้วทุกรอบ → เทียบรายจุดด้วย id แล้วส่งค่าต่อไปเรื่อย ๆ
//   delta / delta_min : ค่าที่เปลี่ยนจากค่าวัดครั้งก่อนของจุดเดียวกัน (คนละเวลาวัด) และช่วงห่างเป็นนาที
//   since             : เวลาที่ระบบเห็นจุดนี้เริ่มผิดปกติ (level ≠ normal) ต่อเนื่องมา — กลับเป็นปกติแล้วล้าง
//   max_today         : ค่าสูงสุดของวันนี้ (ตามเวลาไทย) — ข้ามวันแล้วเริ่มใหม่
import type { FloodCollection, FloodFeature, SourceId } from './types.ts';

/** แหล่งที่ค่ามีความหมายเชิงตัวเลขต่อเนื่อง (Traffy เป็นเรื่องร้องเรียน ไม่มีค่า) */
export const TREND_SOURCES: SourceId[] = ['bma_flood_road', 'thaiwater_waterlevel', 'thaiwater_rain'];

const bkkDay = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);

export function withTrends(cur: FloodCollection, prev: FloodCollection | undefined): FloodCollection {
  if (!TREND_SOURCES.includes(cur.source)) return cur;
  const before = new Map<string, FloodFeature['properties']>();
  for (const f of prev?.features ?? []) before.set(f.properties.id, f.properties);

  const features = cur.features.map((f) => {
    const p = f.properties;
    const q = before.get(p.id);
    let delta: number | null = null;
    let delta_min: number | null = null;
    if (q && p.value != null && q.value != null) {
      if (q.observed_at !== p.observed_at) {
        // ค่าวัดใหม่ → เทียบกับค่าวัดครั้งก่อน
        delta = round(p.value - q.value);
        delta_min = Math.max(1, Math.round((Date.parse(p.observed_at) - Date.parse(q.observed_at)) / 60_000));
      } else {
        // ต้นทางยังไม่มีค่าใหม่ → คงแนวโน้มเดิมไว้
        delta = q.delta ?? null;
        delta_min = q.delta_min ?? null;
      }
    }
    const abnormal = p.level !== 'normal';
    // ต้นทางบอกเวลาเริ่มท่วมเองได้ (API ของ กทม.) → ใช้ค่านั้นก่อน; ไม่งั้นนับจากที่ระบบเห็น
    const since = abnormal
      ? (p.since ?? (q && q.level !== 'normal' ? (q.since ?? q.observed_at) : p.observed_at))
      : null;
    const sameDay = q && q.max_today != null && bkkDay(q.observed_at) === bkkDay(p.observed_at);
    const max_today = p.value == null ? (sameDay ? q!.max_today! : null) : sameDay ? Math.max(q!.max_today!, p.value) : p.value;
    return { ...f, properties: { ...p, delta, delta_min, since, max_today } };
  });
  return { ...cur, features };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
