// หัวเรื่อง (h1) และบรรทัดเล็กเหนือหัวเรื่องในแถบบน — คำนวณจาก route ใน app.vue โดยตรง
// (ไม่ให้หน้าตั้งค่าผ่าน state เพราะแถบบน render ก่อนหน้า → SSR กับ client ไม่ตรงกัน = hydration mismatch)
import { districtBySlug, provinceBySlug } from '../data/areas'

export interface Heading { heading: string; overline: string }

const HOME: Heading = { heading: 'น้ำท่วมวันนี้ — แผนที่น้ำท่วมกรุงเทพฯ และทั่วประเทศ', overline: 'กรุงเทพฯ และทั่วประเทศ · Bangkok Flood Watch' }

export function headingFor(path: string, params: Record<string, string | string[]>): Heading {
  const p = path.replace(/\/+$/, '') || '/'
  if (p === '/') return HOME
  if (p === '/en') return { heading: 'Bangkok Flood Map — live flooded roads, water levels and satellite flood extent', overline: 'Bangkok & Thailand · Bangkok Flood Watch' }
  if (p === '/links') return { heading: 'สายด่วนและลิงก์เช็กน้ำท่วม', overline: 'ลิงก์ · สายด่วน · Bangkok Flood Watch' }
  if (p === '/bangkok') return { heading: 'น้ำท่วมกรุงเทพฯ วันนี้ — เลือกดูรายเขต', overline: 'กรุงเทพมหานคร · 50 เขต' }
  if (p === '/province') return { heading: 'น้ำท่วมวันนี้ — เลือกดูรายจังหวัด', overline: 'ทั่วประเทศ · 77 จังหวัด' }
  if (p.startsWith('/bangkok/')) {
    const a = districtBySlug(String(params.district ?? ''))
    if (a) return { heading: `น้ำท่วมเขต${a.th} วันนี้`, overline: `กรุงเทพมหานคร · ${a.en}` }
  }
  if (p.startsWith('/province/')) {
    const a = provinceBySlug(String(params.province ?? ''))
    if (a) return { heading: `น้ำท่วม${a.th} วันนี้`, overline: `จังหวัด${a.th} · ${a.en}` }
  }
  return HOME
}
