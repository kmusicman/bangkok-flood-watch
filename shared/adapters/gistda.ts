// GISTDA Disaster Platform — พื้นที่น้ำท่วมจากดาวเทียม ทั้งประเทศ (ต้องมี API key ฟรีจาก api-gateway.gistda.or.th)
// ตรวจ 26 ก.ย. 2569:
//   - features/flood/{1day|3days|7days|30days} = GeoJSON กริด H3 หลายหมื่นเซลล์ แบ่งหน้า limit ≤ 1000 (~2 MB/หน้า)
//     → ไม่ดึงทั้งหมดใน cron; ดึง limit=1 เพื่อเอา numberMatched (จำนวนเซลล์) + file_name (รอบภาพล่าสุด) เท่านั้น
//   - bbox / skipGeometry / properties ใช้ไม่ได้ (คืน 0)
//   - ชั้นแผนที่ใช้ tile PNG โดยตรงจากเบราว์เซอร์ด้วย key ที่จำกัด referrer (ดู web/components/FloodMap.client.vue)

import type { FloodCollection } from '../types.ts';
import { getJson, makeCollection } from '../util.ts';

export const GISTDA_BASE = 'https://api-gateway.gistda.or.th/api/2.0/resources';
export const GISTDA_PERIODS = ['1day', '3days', '7days', '30days'] as const;
export type GistdaPeriod = (typeof GISTDA_PERIODS)[number];

export interface GistdaPeriodSummary {
  cells: number; // จำนวนเซลล์ H3 (ระดับ 9 ≈ 0.1 ตร.กม./เซลล์)
  files: string[]; // รหัสภาพดาวเทียม เช่น rd2_20260926_0613, S1C_20260921_0558
  latest_image: string | null; // ISO จากรหัสภาพล่าสุด (เวลาในชื่อไฟล์ — ถือเป็น UTC)
  created_at: string | null; // เวลาที่ GISTDA ประมวลผลชุดนี้
}
export type GistdaSummary = Partial<Record<GistdaPeriod, GistdaPeriodSummary>>;

interface GistdaPage {
  numberMatched?: number;
  features?: { properties?: { file_name?: string; _createdAt?: string } }[];
}

/** "rd2_20260926_0613" → "2026-09-26T06:13:00.000Z" */
export function imageTime(file: string): string | null {
  const m = file.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00.000Z` : null;
}

export function parseSummary(page: GistdaPage): GistdaPeriodSummary {
  const p = page.features?.[0]?.properties ?? {};
  const files = String(p.file_name ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const times = files.map(imageTime).filter((t): t is string => !!t).sort();
  return { cells: Number(page.numberMatched) || 0, files, latest_image: times.at(-1) ?? null, created_at: p._createdAt ?? null };
}

export async function fetchGistdaSummary(apiKey: string): Promise<GistdaSummary> {
  const out: GistdaSummary = {};
  await Promise.all(GISTDA_PERIODS.map(async (period) => {
    // ห้ามใส่ key ลง log/error: ตัด query ออกจากข้อความ error
    try {
      out[period] = parseSummary(await getJson<GistdaPage>(`${GISTDA_BASE}/features/flood/${period}?api_key=${encodeURIComponent(apiKey)}&limit=1`, { timeoutMs: 30_000 }));
    } catch (e) {
      throw new Error(`GISTDA ${period}: ${String((e as Error).message).replace(/api_key=[^&\s]+/g, 'api_key=***')}`);
    }
  }));
  return out;
}

/** collection ไม่มี point features — ใช้ summary + observed_at สำหรับแถบสถานะ; ชั้นแผนที่มาจาก tile โดยตรง */
export function gistdaCollection(summary: GistdaSummary): FloodCollection {
  const c = makeCollection('gistda_flood', []);
  const s1 = summary['1day'];
  return { ...c, count: s1?.cells ?? 0, observed_at: s1?.latest_image ?? s1?.created_at ?? null, summary };
}
