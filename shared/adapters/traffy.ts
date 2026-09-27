// Traffy Fondue (NECTEC × กทม.) — public share API ของ "ทีมชัชชาติ" เรียงใหม่→เก่า
// ตรวจ 26 ก.ย. 2569: limit สูงสุดที่ใช้จริง 1000/หน้า, offset ใช้ได้, keyword/type ไม่กรองให้ → กรองเองด้วยคำว่า "ท่วม"
// ตอนฝนหนักมีเรื่องน้ำท่วม > 800 เรื่อง/10 ชม. จึงต้องดึงหลายหน้าจนครบหน้าต่าง 24 ชม. (จำกัด maxPages)

import type { FloodFeature, Level } from '../types.ts';
import { getJson, httpsOnly, point, squash, toIso, validCoord } from '../util.ts';

export const TRAFFY_API = 'https://publicapi.traffy.in.th/share/teamchadchart/search';
export const TRAFFY_WINDOW_MS = 24 * 3600 * 1000;

export interface TraffyRaw {
  ticket_id: string;
  description: string | null;
  coords: [string, string]; // [lng, lat] เป็น string
  photo_url: string | null;
  address: string | null;
  timestamp: string; // "2026-09-26 07:33:36.854728+00" (UTC)
  state: string | null;
  problem_type_abdul: string[] | null;
  org?: string | null;
}
export interface TraffyPage { total?: number; results: TraffyRaw[] }

const isFlood = (t: TraffyRaw) => (t.description ?? '').includes('ท่วม') || (t.problem_type_abdul ?? []).includes('น้ำท่วม');
const isClosed = (state: string | null) => state === 'เสร็จสิ้น';
// ข้อความที่บ่งว่ารุนแรง (รถผ่านไม่ได้ / น้ำเข้าบ้าน) — heuristic จากรายงานประชาชน ยังไม่ผ่านการ verify
const SEVERE = /ผ่านไม่ได้|เข้าบ้าน|ถึงเข่า|ครึ่งล้อ|รถดับ|ดับ(กลาง|ใน)/;

export function traffyLevel(t: TraffyRaw): Level {
  if (isClosed(t.state)) return 'normal';
  return SEVERE.test(t.description ?? '') ? 'warning' : 'watch';
}

export function parseTraffy(pages: TraffyPage[], now = Date.now()): FloodFeature[] {
  const since = now - TRAFFY_WINDOW_MS;
  const seen = new Set<string>();
  const out: FloodFeature[] = [];
  for (const page of pages) {
    for (const t of page.results ?? []) {
      if (!t.ticket_id || seen.has(t.ticket_id) || !isFlood(t)) continue;
      const lng = Number(t.coords?.[0]);
      const lat = Number(t.coords?.[1]);
      if (!validCoord(lng, lat)) continue;
      const observed_at = toIso(t.timestamp);
      if (Date.parse(observed_at) < since) continue;
      seen.add(t.ticket_id);
      const address = squash(t.address);
      const district = address.match(/เขต(\S+)/)?.[1] ?? null;
      const desc = squash(t.description);
      out.push(point(lng, lat, {
        source: 'traffy_flood',
        id: t.ticket_id,
        name: district ? `เขต${district}` : address || 'ไม่ระบุที่อยู่',
        province: 'กรุงเทพมหานคร',
        province_code: '10',
        district,
        value: null,
        unit: null,
        level: traffyLevel(t),
        observed_at,
        // ตัดข้อความให้สั้น — Traffy วันฝนหนักมี > 2,500 เรื่อง/24 ชม. ขนาดไฟล์สำคัญกับมือถือ
        detail: (desc.length > 100 ? `${desc.slice(0, 100)}…` : desc) + (t.state ? ` (${t.state})` : ''),
        url: `https://share.traffy.in.th/teamchadchart?ticket_id=${encodeURIComponent(t.ticket_id)}`,
        photo: httpsOnly(t.photo_url),
        agency: 'Traffy Fondue',
      }));
    }
  }
  return out;
}

/** ดึง 1 หน้า; ถ้าล้ม (502/timeout ตอน API โหลดหนัก) ลองซ้ำอีกครั้งหลัง 5 วิ ด้วยหน้าเล็กลง */
async function fetchPage(offset: number, limit: number): Promise<TraffyPage> {
  try {
    // จาก Cloudflare edge หน้าละ 1000 ใช้เวลา > 30 วิ ได้ (26 ก.ย. 2569 timeout) → ให้เวลา 75 วิ/หน้า
    return await getJson<TraffyPage>(`${TRAFFY_API}?limit=${limit}&offset=${offset}`, { timeoutMs: 75_000 });
  } catch (e) {
    await new Promise((r) => setTimeout(r, 5_000));
    const small = Math.max(100, Math.floor(limit / 4));
    try {
      return await getJson<TraffyPage>(`${TRAFFY_API}?limit=${small}&offset=${offset}`, { timeoutMs: 45_000 });
    } catch {
      throw e; // รายงาน error แรก (ชัดกว่า) — 26 ก.ย. 2569 ค่ำ API ตอบ 502/ค้างทุกขนาดหน้า
    }
  }
}

/** ดึงหน้าละ 1000 จนกว่าเรื่องที่เก่าสุดในหน้าจะพ้นหน้าต่าง 24 ชม. หรือครบ maxPages; ถ้าได้บางหน้าแล้วหน้าถัดไปล้ม ใช้เท่าที่ได้ */
export async function fetchTraffy(opts: { maxPages?: number; limit?: number } = {}): Promise<FloodFeature[]> {
  const { maxPages = 3, limit = 1000 } = opts;
  const now = Date.now();
  const pages: TraffyPage[] = [];
  for (let i = 0; i < maxPages; i++) {
    let page: TraffyPage;
    try {
      page = await fetchPage(i * limit, limit);
    } catch (e) {
      if (pages.length) break; // หน้าแรกได้แล้ว (เรื่องใหม่สุด) — พอใช้ได้
      throw e;
    }
    pages.push(page);
    const got = page.results?.length ?? 0;
    const oldest = page.results?.at(-1)?.timestamp;
    if (!oldest || got < limit || Date.parse(toIso(oldest)) < now - TRAFFY_WINDOW_MS) break;
  }
  return parseTraffy(pages, now);
}
