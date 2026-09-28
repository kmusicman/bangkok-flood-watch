import { LEVEL_ORDER, SOURCE_IDS, type FloodBundle, type FloodFeature, type Level, type SourceId } from '../utils/format'

/** ตัวกรองรายการ — แชร์ระหว่างแถวเครื่องมือ, แผงภาพรวม (การ์ดนับสถานะ/ต้องเฝ้าระวัง) และรายการเต็ม */
export interface FloodFilters {
  province: Ref<string>
  district: Ref<string>
  q: Ref<string>
  level: Ref<Level | ''>
}

// แหล่งที่เป็นเซนเซอร์/สถานีทางการมาก่อนเรื่องร้องเรียน เมื่อระดับเท่ากัน
const SOURCE_RANK: Record<SourceId, number> = { bma_flood_road: 3, thaiwater_waterlevel: 2, thaiwater_rain: 1, traffy_flood: 0, gistda_flood: 0 }

export function sortBySeverity(list: FloodFeature[]): FloodFeature[] {
  return list.sort((a, b) =>
    LEVEL_ORDER[b.properties.level] - LEVEL_ORDER[a.properties.level]
    || SOURCE_RANK[b.properties.source] - SOURCE_RANK[a.properties.source]
    || (b.properties.value ?? 0) - (a.properties.value ?? 0)
    || Date.parse(b.properties.observed_at) - Date.parse(a.properties.observed_at))
}

/** ระยะทาง (กม.) ระหว่างพิกัด [lng, lat] สองจุด — haversine */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLng = ((b[0] - a[0]) * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function useFloodItems(bundle: Ref<FloodBundle | null>, visible: Record<SourceId, boolean>, f: FloodFilters) {
  /** ทุกจุดของแหล่งที่เปิดอยู่ (รวมระดับปกติ) */
  const all = computed<FloodFeature[]>(() => {
    if (!bundle.value) return []
    const out: FloodFeature[] = []
    for (const id of SOURCE_IDS) {
      if (!visible[id]) continue
      for (const x of bundle.value.sources[id]?.features ?? []) out.push(x)
    }
    return out
  })
  /** เฉพาะจุดผิดปกติ เรียงตามความรุนแรง */
  const active = computed(() => sortBySeverity(all.value.filter((x) => x.properties.level !== 'normal')))

  const matchArea = (x: FloodFeature) => {
    const p = x.properties
    if (f.province.value && p.province !== f.province.value) return false
    if (f.district.value && p.district !== f.district.value) return false
    const needle = f.q.value.trim().toLowerCase()
    if (needle && !`${p.name} ${p.district ?? ''} ${p.province ?? ''} ${p.detail ?? ''}`.toLowerCase().includes(needle)) return false
    return true
  }

  /** จุดผิดปกติที่ผ่านตัวกรองพื้นที่/คำค้น (ยังไม่กรองระดับ) */
  const areaActive = computed(() => active.value.filter(matchArea))
  /** + กรองระดับ (การ์ดนับสถานะ) */
  const filtered = computed(() => (f.level.value ? areaActive.value.filter((x) => x.properties.level === f.level.value) : areaActive.value))

  /** จำนวนต่อระดับในพื้นที่ที่เลือก — "ปกติ" นับจากทุกจุดที่เปิดอยู่ */
  const counts = computed(() => {
    const c: Record<Level, number> = { critical: 0, warning: 0, watch: 0, normal: 0 }
    for (const x of all.value) if (matchArea(x)) c[x.properties.level]++
    return c
  })

  const provinces = computed(() => countBy(active.value, (x) => x.properties.province))
  const districts = computed(() => countBy(active.value.filter((x) => !f.province.value || x.properties.province === f.province.value), (x) => x.properties.district))

  const hasFilter = computed(() => !!(f.province.value || f.district.value || f.q.value.trim() || f.level.value))
  function clearFilters() {
    f.province.value = ''
    f.district.value = ''
    f.q.value = ''
    f.level.value = ''
  }

  return { all, active, areaActive, filtered, counts, provinces, districts, hasFilter, clearFilters }
}

function countBy(list: FloodFeature[], key: (x: FloodFeature) => string | null) {
  const m = new Map<string, number>()
  for (const x of list) {
    const k = key(x)
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m].sort((a, b) => b[1] - a[1])
}
