// ไอคอนกล้อง CCTV (bullet camera บนขาตั้ง) — ใช้ทั้งบนแผนที่ (แปลงเป็นบิตแมปให้ MapLibre) และใน chip/legend (inline SVG)
// สีตัวกล้องเทาน้ำเงิน + เส้นขอบขาว เพื่อให้เห็นชัดทั้งแผนที่สว่างและมืด แต่ไม่แย่งความสนใจจากหมุดน้ำท่วม
export const CCTV_FILL = '#546e7a'

export const CCTV_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path d="M15 9.2l6.2-2.4v10.4L15 14.8z" fill="${CCTV_FILL}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>
  <rect x="1.8" y="7" width="13.4" height="8" rx="2.2" fill="${CCTV_FILL}" stroke="#fff" stroke-width="1.6"/>
  <circle cx="6.6" cy="11" r="2" fill="#fff"/>
  <path d="M6 15v4.2M3 19.2h6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
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
