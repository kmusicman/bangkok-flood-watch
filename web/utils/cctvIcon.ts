// ไอคอนกล้องวงจรปิด (กล้องติดผนัง มีขายึดจากด้านบน ตัวกล้องเอียงลง เลนส์ด้านหน้า) ในป้ายวงกลม
// ใช้ทั้งบนแผนที่ (แปลงเป็นบิตแมปให้ MapLibre) และใน chip/legend (inline SVG) — ป้ายวงกลมทำให้ยังอ่านออกว่าเป็นกล้องแม้ตอนซูมออก
// และแยกจากหมุดน้ำท่วม (วงกลมทึบสีตามระดับ) ได้ชัดทั้งแผนที่สว่างและมืด
//   แบบ 'traffic' = กล้องจราจร กทม. (ตำแหน่งอย่างเดียว) — ป้ายขาว ตัวกล้องเทาเข้ม
//   แบบ 'flood'   = กล้องที่จุดวัดน้ำท่วม (มีภาพนิ่ง) — ป้ายสีแบรนด์ ตัวกล้องขาว ให้เด่นกว่าเพราะกดแล้วเห็นภาพ
export const CCTV_FILL = '#37474f'
export const CCTV_FLOOD_FILL = '#0b6fb8'

export type CctvKind = 'traffic' | 'flood'

export function cctvSvg(kind: CctvKind = 'traffic', size = 24): string {
  const bg = kind === 'flood' ? CCTV_FLOOD_FILL : '#fff'
  const fg = kind === 'flood' ? '#fff' : CCTV_FILL
  const ring = kind === 'flood' ? '#fff' : CCTV_FILL
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
  <circle cx="12" cy="12" r="11" fill="${bg}" stroke="${ring}" stroke-width="1.5"/>
  <g transform="rotate(-25 12 12)">
    <path d="M9 9V6.2H5" fill="none" stroke="${fg}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="5" y="9" width="11.5" height="6.5" rx="1.5" fill="${fg}"/>
    <path d="M16.5 10.2l3-1v6.3l-3-1z" fill="${fg}"/>
    <circle cx="8.5" cy="12.25" r="1.6" fill="${bg}"/>
  </g>
</svg>`
}

/** เดิมใช้ชื่อนี้ — คงไว้ให้โค้ดที่ import อยู่ */
export const CCTV_SVG = cctvSvg('traffic')

/** โหลด SVG เป็นรูปสำหรับ map.addImage (ขนาด 2 เท่าให้คมบนจอ retina) */
export function loadCctvImage(kind: CctvKind = 'traffic', size = 48): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(size, size)
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cctvSvg(kind, size))}`
  })
}
