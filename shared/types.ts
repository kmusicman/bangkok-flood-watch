// รูปแบบข้อมูลกลางของทุกแหล่ง: GeoJSON FeatureCollection + metadata ต่อแหล่ง
// (ดู CLAUDE.md ข้อ 4.1) — ทั้ง Worker, สคริปต์ ingest และหน้าเว็บใช้ไฟล์นี้ร่วมกัน

export type Level = 'normal' | 'watch' | 'warning' | 'critical';

export type SourceId = 'thaiwater_waterlevel' | 'thaiwater_rain' | 'bma_flood_road' | 'traffy_flood' | 'gistda_flood';

export interface FloodProps {
  source: SourceId;
  id: string;
  name: string;
  province: string | null;
  province_code: string | null; // รหัสจังหวัด 2 หลัก (กทม. = '10')
  district: string | null; // เขต/อำเภอ
  value: number | null;
  unit: string | null;
  level: Level;
  observed_at: string; // ISO 8601 พร้อม offset
  detail: string | null; // ข้อความสั้นอธิบายเพิ่ม เช่น "ล้นตลิ่ง 1.70 ม."
  url: string | null; // ลิงก์ไปหน้าต้นทาง
  photo: string | null;
  agency: string | null;
}

export interface FloodFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] }; // [lng, lat]
  properties: FloodProps;
}

export interface FloodCollection {
  type: 'FeatureCollection';
  source: SourceId;
  source_name: string;
  source_url: string;
  fetched_at: string; // เวลาที่ดึงสำเร็จครั้งล่าสุด
  observed_at: string | null; // เวลาสังเกตล่าสุดในชุดข้อมูล
  via: string | null; // เส้นทางที่ได้ข้อมูลมา เช่น 'thaiwater_relay' เมื่อใช้ fallback
  stale: boolean; // true = ดึงรอบล่าสุดไม่สำเร็จ ใช้ข้อมูลชุดเดิม
  snapshot: boolean; // true = ข้อมูลตัวอย่างที่ฝังมากับโค้ด ไม่ใช่ข้อมูลสด
  error: string | null;
  count: number;
  features: FloodFeature[];
  /** ข้อมูลสรุปสำหรับแหล่งที่ไม่ใช่จุด (เช่น GISTDA: จำนวนเซลล์/รอบภาพต่อช่วงเวลา) */
  summary?: Record<string, unknown>;
}

/** ไฟล์เดียวที่หน้าเว็บโหลด: ทุกแหล่งรวมกัน (KV key เดียว → อ่าน 1 ครั้งต่อการเปิดหน้า) */
export interface FloodBundle {
  generated_at: string;
  sources: Partial<Record<SourceId, FloodCollection>>;
}

export interface SourceMeta {
  id: SourceId;
  name: string; // ชื่อแสดงผล (ไทย)
  short: string; // ชื่อสั้นสำหรับ chip
  url: string; // หน้าเว็บต้นทางสำหรับผู้ใช้
  unit: string | null;
}
