import type { FloodBundle } from '../utils/format'

/** โหลด all.json จาก Worker (หรือ /data ตอน dev) และรีเฟรชเป็นระยะ — ฝั่ง client เท่านั้น */
export function useFloodData() {
  const config = useRuntimeConfig()
  const url = `${config.public.dataBase}/all.json`

  const bundle = useState<FloodBundle | null>('flood-bundle', () => null)
  const error = useState<string | null>('flood-error', () => null)
  const loading = useState<boolean>('flood-loading', () => true)
  const loadedAt = useState<number | null>('flood-loaded-at', () => null)
  const now = useState<number>('flood-now', () => Date.now())

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

  let timer: ReturnType<typeof setInterval> | undefined
  let tick: ReturnType<typeof setInterval> | undefined
  const onVisible = () => {
    if (document.visibilityState === 'visible' && (!loadedAt.value || Date.now() - loadedAt.value > 60_000)) load()
  }

  onMounted(() => {
    load()
    timer = setInterval(load, config.public.refreshMs)
    tick = setInterval(() => { now.value = Date.now() }, 30_000)
    document.addEventListener('visibilitychange', onVisible)
  })
  onUnmounted(() => {
    clearInterval(timer)
    clearInterval(tick)
    document.removeEventListener('visibilitychange', onVisible)
  })

  return { bundle, error, loading, loadedAt, now, reload: load }
}
