// กล้องที่จุดวัดน้ำท่วมถนน กทม. — รายการ static จาก scripts/build-cctv-dds.ts
// ภาพนิ่ง: เบราว์เซอร์ขอจาก proxy ของ กทม. เอง **เฉพาะเมื่อผู้ใช้แตะปุ่ม** (ไม่โหลดอัตโนมัติ ไม่รีเฟรชซ้ำ)
//   ผ่าน Worker ไม่ได้ — floodbangkok.bangkok.go.th ตอบ 403 ให้คำขอจาก Cloudflare Worker (ตรวจ 30 ก.ย. 2569)
//   proxy ใช้ ffmpeg ตัดเฟรมต่อคำขอ (5–10 วิ) และล่มเมื่อโดนยิงพร้อมกันเยอะ → ต้องแตะก่อนเสมอ ห้ามทำ preload/auto-refresh
import ddsData from '../data/cctv-dds.json'

export interface DdsSensor { sensor: string; name: string; district: string | null; lat: number; lng: number; cams: number[] }

export const DDS = ddsData as { checked_at: string; cameras: number; count: number; sensors: DdsSensor[]; streams: Record<string, string> }
export const DDS_BY_SENSOR = new Map(DDS.sensors.map((s) => [s.sensor, s]))

/** GeoJSON สำหรับเลเยอร์บนแผนที่ */
export const DDS_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: DDS.sensors.map((s) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    properties: { sensor: s.sensor },
  })),
}

const PROXY = 'https://floodbangkok.bangkok.go.th/api/proxy?rtcUrl='
/** URL ภาพนิ่งของกล้อง (null = ไม่มีในรายการ) */
export const ddsImageUrl = (id: number) => (DDS.streams[id] ? PROXY + encodeURIComponent(DDS.streams[id]) : null)
export const ddsDeviceUrl = (sensor: string) => `https://floodbangkok.bangkok.go.th/device-info?sensor_profile_id=${encodeURIComponent(sensor)}`

/**
 * กล่องภาพกล้องใน popup (สร้างด้วย DOM ไม่ใช้ innerHTML) — ยังไม่โหลดภาพจนกว่าผู้ใช้แตะ
 * ปุ่ม "กล้อง 1..n" สลับกล้องที่จุดเดียวกัน (แต่ละครั้ง = ขอภาพ 1 ครั้ง)
 */
export function ddsCameraBlock(s: DdsSensor, onResize?: () => void): HTMLElement {
  const box = document.createElement('div')
  box.className = 'cam-block'
  const wrap = document.createElement('div')
  wrap.className = 'popup-photo-wrap cam-idle'
  box.appendChild(wrap)
  const tabs = document.createElement('div')
  tabs.className = 'cam-tabs'
  let loading = false

  const show = (id: number) => {
    const url = ddsImageUrl(id)
    if (!url || loading) return
    loading = true
    wrap.classList.remove('cam-idle')
    wrap.replaceChildren()
    const status = document.createElement('span')
    status.className = 'popup-photo-status'
    status.textContent = 'กำลังขอภาพจากกล้องของ กทม.… (ราว 5–10 วินาที)'
    const img = document.createElement('img')
    img.className = 'popup-photo'
    img.alt = `ภาพจากกล้องที่ ${s.name}`
    img.decoding = 'async'
    img.onload = () => { loading = false; status.remove(); onResize?.() }
    img.onerror = () => { loading = false; img.remove(); status.textContent = 'กล้องนี้ไม่ส่งภาพตอนนี้ — ลองกล้องอื่น หรือดูที่เว็บ กทม.' }
    img.src = url
    wrap.append(img, status)
    for (const b of tabs.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.id === String(id)))
  }

  // สถานะเริ่มต้น: ปุ่มใหญ่ "ดูภาพจากกล้อง" (ไม่ยิง กทม. จนกว่าจะแตะ)
  const start = document.createElement('button')
  start.type = 'button'
  start.className = 'cam-start'
  start.textContent = `📹 แตะเพื่อดูภาพจากกล้องที่จุดนี้${s.cams.length > 1 ? ` (${s.cams.length} ตัว)` : ''}`
  start.onclick = (e) => { e.stopPropagation(); show(s.cams[0]) }
  wrap.appendChild(start)

  if (s.cams.length > 1) {
    s.cams.forEach((id, i) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'chip chip-xs'
      b.dataset.id = String(id)
      b.textContent = `กล้อง ${i + 1}`
      b.onclick = (e) => { e.stopPropagation(); show(id) }
      tabs.appendChild(b)
    })
    box.appendChild(tabs)
  }
  const cap = document.createElement('div')
  cap.className = 'muted small'
  cap.textContent = 'ภาพนิ่ง ณ ตอนที่แตะ · ภาพ: สำนักการระบายน้ำ กทม.'
  box.appendChild(cap)
  return box
}
