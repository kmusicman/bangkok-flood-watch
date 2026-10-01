// "ย่านของฉัน" — จำหน้ารายเขต/จังหวัดที่ผู้ใช้บันทึกไว้ในเบราว์เซอร์นี้ (localStorage เท่านั้น ไม่ส่งไปไหน)
// อ่าน/เขียนครอบ try/catch เพราะ private mode หรือบล็อก storage จะโยน error — ไม่มีก็แค่ไม่มีทางลัด
const KEY = 'bfw-my-area'

export interface MyArea { path: string; label: string }

export function useMyArea() {
  const saved = useState<MyArea | null>('my-area', () => null)
  const loaded = useState<boolean>('my-area-loaded', () => false)

  if (import.meta.client && !loaded.value) {
    loaded.value = true
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
      if (v && typeof v.path === 'string' && v.path.startsWith('/') && typeof v.label === 'string') saved.value = { path: v.path, label: v.label }
    } catch { /* ไม่มี storage */ }
  }

  function save(path: string, label: string) {
    saved.value = { path, label }
    try { localStorage.setItem(KEY, JSON.stringify(saved.value)) } catch { /* ignore */ }
  }
  function clear() {
    saved.value = null
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  }
  return { saved, save, clear }
}
