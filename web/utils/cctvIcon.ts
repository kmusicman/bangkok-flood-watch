// ไอคอนกล้องวงจรปิด (กล้องติดผนัง มีขายึดจากด้านบน ตัวกล้องเอียงลง เลนส์ด้านหน้า) ในป้ายวงกลมขาว
// ใช้ทั้งบนแผนที่ (แปลงเป็นบิตแมปให้ MapLibre) และใน chip/legend (inline SVG) — ป้ายวงกลมทำให้ยังอ่านออกว่าเป็นกล้องแม้ตอนซูมออก
// และแยกจากหมุดน้ำท่วม (วงกลมทึบสีตามระดับ) ได้ชัดทั้งแผนที่สว่างและมืด
export const CCTV_FILL = '#37474f'

export const CCTV_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <circle cx="12" cy="12" r="11" fill="#fff" stroke="${CCTV_FILL}" stroke-width="1.5"/>
  <g transform="rotate(-25 12 12)">
    <path d="M9 9V6.2H5" fill="none" stroke="${CCTV_FILL}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="5" y="9" width="11.5" height="6.5" rx="1.5" fill="${CCTV_FILL}"/>
    <path d="M16.5 10.2l3-1v6.3l-3-1z" fill="${CCTV_FILL}"/>
    <circle cx="8.5" cy="12.25" r="1.6" fill="#fff"/>
  </g>
</svg>`

/** โหลด SVG เป็นรูปสำหรับ map.addImage (ขนาด 2 เท่าให้คมบนจอ retina) */
export function loadCctvImage(size = 48): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(size, size)
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(CCTV_SVG.replace('width="24" height="24"', `width="${size}" height="${size}"`))}`
  })
}
