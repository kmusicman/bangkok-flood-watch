import type { FloodBundle } from '../utils/format'

/**
 * โหลด all.json จาก Worker (หรือ /data ตอน dev) และรีเฟรชเป็นระยะ — ฝั่ง client เท่านั้น
 * state เป็น useState กลาง (header/แดชบอร์ดอ่านชุดเดียวกัน); ตัวจับเวลาเริ่มครั้งเดียวต่อหน้าเว็บด้วย start()
 * (หน้าที่ไม่มีแดชบอร์ด เช่น /links ไม่เรียก start → ไม่โหลด 3 MB โดยไม่จำเป็น)
 */
export function useFloodData() {
  const config = useRuntimeConfig()
  const url = `${config.public.dataBase}/all.json`

  const bundle = useState<FloodBundle | null>('flood-bundle', () => null)
  const error = useState<string | null>('flood-error', () => null)
  const loading = useState<boolean>('flood-loading', () => true)
  const loadedAt = useState<number | null>('flood-loaded-at', () => null)
  const now = useState<number>('flood-now', () => Date.now())
  const started = useState<boolean>('flood-started', () => false)

  async function load() {
    loading.value = bundle.value === null
    try {
      const r = await fetch(url, { cache: 'no-cache' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      bundle.value = (await r.json()) as FloodBundle
      error.value = null
      loadedAt.value = Date.now()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
      now.value = Date.now()
    }
  }

  /** เริ่มโหลด + รีเฟรชอัตโนมัติ (เรียกซ้ำได้ ทำงานครั้งเดียว) */
  function start() {
    if (import.meta.server || started.value) return
    started.value = true
    load()
    setInterval(load, config.public.refreshMs)
    setInterval(() => { now.value = Date.now() }, 30_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && (!loadedAt.value || Date.now() - loadedAt.value > 60_000)) load()
    })
  }

  return { bundle, error, loading, loadedAt, now, reload: load, start }
}
