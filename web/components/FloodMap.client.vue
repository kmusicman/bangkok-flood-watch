<script setup lang="ts">
// แผนที่ MapLibre GL + OpenFreeMap (ไม่ใช้ Google Maps) — client เท่านั้น (.client.vue)
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre v6 หา worker ด้วย new URL('./maplibre-gl-worker.mjs', import.meta.url) ซึ่ง Vite ไม่ bundle ให้ (ไฟล์หายตอน build)
// จึงให้ Vite bundle worker เองแล้วส่ง URL ให้ setWorkerUrl() — ต้องชี้ที่ไฟล์ของ maplibre ตรงๆ (entry จะไม่ถูก tree-shake)
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { GeoJSONSource, Map as MLMap, MapMouseEvent } from 'maplibre-gl'
import {
  fmtTime, fmtValue, LEVEL_COLOR, LEVEL_LABEL, relTime, SOURCE_IDS, SOURCE_META,
  type FloodBundle, type FloodFeature, type FloodProps, type SourceId,
} from '../utils/format'

// เลเยอร์ static: ตำแหน่งกล้อง CCTV จราจร กทม. (Open Data กทม. — สร้างด้วย scripts/build-cctv.ts) หมุด + ลิงก์ออกเท่านั้น ไม่ดึงภาพ
import cctvData from '../data/cctv-bma.json'

const props = defineProps<{
  bundle: FloodBundle | null
  visible: Record<SourceId, boolean>
  cctv: boolean
  focus: FloodFeature | null
  now: number
}>()
const emit = defineEmits<{ ready: [] }>()

const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty'
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark'
export type Region = 'bkk' | 'th'
const BOUNDS: Record<Region, [[number, number], [number, number]]> = {
  bkk: [[100.32, 13.49], [100.94, 13.96]],
  th: [[97.3, 5.6], [105.7, 20.5]],
}
// แหล่งที่เป็นจุด (GISTDA เป็นชั้น raster แยกต่างหาก)
const POINT_SOURCES = SOURCE_IDS.filter((id) => id !== 'gistda_flood')
// ขอบสีต่างกันเล็กน้อยต่อแหล่ง (สีหลัก = ระดับความรุนแรง)
const STROKE: Partial<Record<SourceId, string>> = {
  bma_flood_road: '#ffffff',
  thaiwater_waterlevel: '#0d47a1',
  thaiwater_rain: '#4a148c',
  traffy_flood: '#37474f',
}

// ---- GISTDA: tile PNG พื้นที่น้ำท่วมจากดาวเทียม (key จำกัด referrer, เรียกจากเบราว์เซอร์โดยตรง) ----
// endpoint ชื่อ "tms" แต่ใช้เลขแถวแบบ XYZ (ตรวจแล้ว 26 ก.ย. 2569) → ไม่ต้องตั้ง scheme: 'tms'
const GISTDA_BASE = 'https://api-gateway.gistda.or.th/api/2.0/resources/maps'
export type GistdaPeriod = '1day' | '3days' | '7days' | '30days' | 'freq'
const GISTDA_PERIODS: { id: GistdaPeriod; label: string; path: string }[] = [
  { id: '1day', label: '1 วัน', path: 'flood/1day' },
  { id: '3days', label: '3 วัน', path: 'flood/3days' },
  { id: '7days', label: '7 วัน', path: 'flood/7days' },
  { id: '30days', label: '30 วัน', path: 'flood/30days' },
  { id: 'freq', label: 'ท่วมซ้ำซาก', path: 'flood-freq' },
]
const GISTDA_LAYER = 'gistda-raster'
// id ห้ามลงท้าย -pt/-cluster (onClickPoint/syncGistdaLayer แยกเลเยอร์จุดน้ำท่วมด้วย suffix นั้น)
const CCTV_LAYER = 'cctv-cam'
const CCTV_LIVE_URL = 'https://cpudapp.bangkok.go.th/bmatraffic' // หน้าดูภาพสดของ กทม. (มีเงื่อนไขการใช้งาน จึงลิงก์ออกอย่างเดียว)
interface CctvProps { id: string; name: string; district: string; cameras: number }
const gistdaKey = String(useRuntimeConfig().public.gistdaKey ?? '')
const gistdaPeriod = ref<GistdaPeriod>('3days')
const gistdaOn = computed(() => !!gistdaKey && props.visible.gistda_flood)

const el = ref<HTMLDivElement>()
const region = ref<Region>('bkk')
let map: MLMap | undefined
let ml: typeof import('maplibre-gl') | undefined
let popup: import('maplibre-gl').Popup | undefined
let styleReady = false // true หลัง 'load' / 'style.load' ของสไตล์ปัจจุบัน
const dark = window.matchMedia('(prefers-color-scheme: dark)')

const toFC = (id: SourceId) => ({ type: 'FeatureCollection' as const, features: props.bundle?.sources[id]?.features ?? [] })

function syncGistdaLayer() {
  // ห้ามใช้ isStyleLoaded() ตรงนี้ — ตอน 'load' แหล่ง GeoJSON ที่เพิ่งเพิ่มยังโหลดอยู่ทำให้คืน false แล้วชั้นดาวเทียมไม่ถูกเพิ่มตอนเปิดหน้า
  if (!map || !styleReady) return
  if (map.getLayer(GISTDA_LAYER)) map.removeLayer(GISTDA_LAYER)
  if (map.getSource(GISTDA_LAYER)) map.removeSource(GISTDA_LAYER)
  if (!gistdaOn.value) return
  const p = GISTDA_PERIODS.find((x) => x.id === gistdaPeriod.value)!
  map.addSource(GISTDA_LAYER, {
    type: 'raster',
    tiles: [`${GISTDA_BASE}/${p.path}/tms/{z}/{x}/{y}?api_key=${encodeURIComponent(gistdaKey)}`],
    tileSize: 512,
    minzoom: 4,
    maxzoom: 15,
    attribution: '© GISTDA Disaster Platform',
  })
  // วางใต้เลเยอร์จุดทั้งหมด (รวมกล้อง CCTV)
  const firstPoint = map.getStyle().layers.find((l) => l.id === CCTV_LAYER || l.id.endsWith('-pt') || l.id.endsWith('-cluster'))?.id
  map.addLayer({ id: GISTDA_LAYER, type: 'raster', source: GISTDA_LAYER, paint: { 'raster-opacity': 0.75 } }, firstPoint)
}

function addLayers() {
  if (!map) return
  const levelColor = ['match', ['get', 'level'], 'critical', LEVEL_COLOR.critical, 'warning', LEVEL_COLOR.warning, 'watch', LEVEL_COLOR.watch, LEVEL_COLOR.normal]
  const levelRank = ['match', ['get', 'level'], 'critical', 3, 'warning', 2, 'watch', 1, 0]
  // กล้อง CCTV: เพิ่มก่อนเลเยอร์น้ำท่วมเพื่อให้อยู่ใต้หมุดน้ำท่วมเสมอ (หมุดเทาเล็ก ไม่แย่งความสนใจ)
  if (!map.getSource(CCTV_LAYER)) map.addSource(CCTV_LAYER, { type: 'geojson', data: cctvData as GeoJSON.FeatureCollection })
  map.addLayer({
    id: CCTV_LAYER, type: 'circle', source: CCTV_LAYER,
    layout: { visibility: props.cctv ? 'visible' : 'none' },
    paint: {
      'circle-color': '#546e7a', 'circle-opacity': 0.9,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 12, 5, 15, 7] as never,
      'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff',
    },
  })
  map.on('click', CCTV_LAYER, (e: MapMouseEvent) => {
    // ถ้ามีหมุดน้ำท่วมซ้อนอยู่ ให้ onClickPoint จัดการแทน
    if (map!.queryRenderedFeatures(e.point).some((x) => x.layer.id.endsWith('-pt'))) return
    const f = map!.queryRenderedFeatures(e.point, { layers: [CCTV_LAYER] })[0]
    if (f) openCctvPopup((f.geometry as GeoJSON.Point).coordinates as [number, number], f.properties as unknown as CctvProps)
  })
  map.on('mouseenter', CCTV_LAYER, () => { map!.getCanvas().style.cursor = 'pointer' })
  map.on('mouseleave', CCTV_LAYER, () => { map!.getCanvas().style.cursor = '' })
  for (const id of POINT_SOURCES) {
    const cluster = id === 'traffy_flood' // เรื่องร้องเรียนมีหลายพันจุด → รวมกลุ่มตอนซูมออก
    if (!map.getSource(id)) {
      map.addSource(id, { type: 'geojson', data: toFC(id), cluster, clusterRadius: 44, clusterMaxZoom: 13 })
    }
    const vis = props.visible[id] ? 'visible' : 'none'
    if (cluster) {
      map.addLayer({
        id: `${id}-cluster`, type: 'circle', source: id, filter: ['has', 'point_count'],
        layout: { visibility: vis },
        paint: {
          'circle-color': LEVEL_COLOR.watch, 'circle-opacity': 0.85,
          'circle-radius': ['step', ['get', 'point_count'], 14, 20, 18, 100, 24],
          'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
        },
      })
      map.addLayer({
        id: `${id}-count`, type: 'symbol', source: id, filter: ['has', 'point_count'],
        layout: { visibility: vis, 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 12 },
        paint: { 'text-color': '#1a1a1a' },
      })
    }
    map.addLayer({
      id: `${id}-pt`, type: 'circle', source: id,
      ...(cluster ? { filter: ['!', ['has', 'point_count']] } : {}), // MapLibre ไม่รับ filter: undefined
      layout: { visibility: vis, 'circle-sort-key': levelRank as never },
      paint: {
        'circle-color': levelColor as never,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['match', ['get', 'level'], 'critical', 5, 'warning', 4.5, 'watch', 3.5, 2.5], 12, ['match', ['get', 'level'], 'critical', 10, 'warning', 8.5, 'watch', 7, 5]] as never,
        'circle-opacity': ['match', ['get', 'level'], 'normal', 0.6, 0.92] as never,
        'circle-stroke-width': 1.5, 'circle-stroke-color': STROKE[id] ?? '#fff',
      },
    })
    map.on('click', `${id}-pt`, onClickPoint)
    map.on('mouseenter', `${id}-pt`, () => { map!.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', `${id}-pt`, () => { map!.getCanvas().style.cursor = '' })
    if (cluster) {
      map.on('click', `${id}-cluster`, async (e: MapMouseEvent) => {
        const f = map!.queryRenderedFeatures(e.point, { layers: [`${id}-cluster`] })[0]
        if (!f) return
        const zoom = await (map!.getSource(id) as GeoJSONSource).getClusterExpansionZoom(f.properties!.cluster_id)
        map!.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom })
      })
    }
  }
  syncGistdaLayer()
}

function onClickPoint(e: MapMouseEvent) {
  const f = map?.queryRenderedFeatures(e.point).find((x) => x.layer.id.endsWith('-pt'))
  if (!f) return
  openPopup((f.geometry as GeoJSON.Point).coordinates as [number, number], f.properties as unknown as FloodProps)
}

/** สร้าง popup ด้วย DOM (ไม่ใช้ innerHTML กับข้อความจากแหล่งภายนอก); anchor 'bottom' = บังคับให้ popup อยู่เหนือหมุด */
function openPopup(lngLat: [number, number], p: FloodProps, anchor?: 'bottom') {
  if (!map || !ml) return
  const box = document.createElement('div')
  const add = (tag: string, text: string, cls?: string) => {
    const n = document.createElement(tag)
    n.textContent = text
    if (cls) n.className = cls
    box.appendChild(n)
    return n
  }
  // รูปไว้บนสุด — ถ้าอยู่ท้ายจะตกไปใต้ขอบ popup ที่จำกัดความสูง ผู้ใช้ไม่เห็นว่ามีรูป
  // รูป Traffy เป็นไฟล์เต็ม (หลายร้อย KB–MB) บนมือถือใช้เวลาโหลด → แสดง "กำลังโหลดรูป…" และถ้าโหลดไม่ได้ให้ลิงก์เปิดรูปแทน
  if (p.photo && /^https:\/\//.test(p.photo)) {
    const wrap = document.createElement('a')
    wrap.className = 'popup-photo-wrap'
    wrap.href = p.photo
    wrap.target = '_blank'
    wrap.rel = 'noopener'
    const status = document.createElement('span')
    status.className = 'popup-photo-status'
    status.textContent = 'กำลังโหลดรูป…'
    const img = document.createElement('img')
    img.className = 'popup-photo'
    img.alt = 'รูปจากผู้แจ้ง'
    img.decoding = 'async'
    img.referrerPolicy = 'no-referrer'
    img.onload = () => { status.remove() }
    img.onerror = () => { img.remove(); status.textContent = 'โหลดรูปไม่สำเร็จ — แตะเพื่อเปิดรูปต้นฉบับ ↗' }
    img.src = p.photo
    wrap.append(img, status)
    box.appendChild(wrap)
  }
  add('div', p.name, 'popup-title')
  const lv = add('div', `● ${LEVEL_LABEL[p.level]}`)
  lv.style.color = LEVEL_COLOR[p.level]
  lv.style.fontWeight = '700'
  const v = fmtValue(p)
  if (v) add('div', v, 'popup-value')
  if (p.detail) add('div', p.detail, 'popup-detail')
  add('div', [p.district, p.province].filter(Boolean).join(' · '), 'muted small')
  add('div', `${SOURCE_META[p.source]?.short ?? p.source}${p.agency ? ` · ${p.agency}` : ''}`, 'muted small')
  add('div', `อัปเดต ${fmtTime(p.observed_at, props.now)} (${relTime(p.observed_at, props.now)})`, 'muted small')
  if (p.url && /^https:\/\//.test(p.url)) {
    const a = document.createElement('a')
    a.href = p.url
    a.target = '_blank'
    a.rel = 'noopener'
    a.textContent = 'ดูที่แหล่งข้อมูล ↗'
    a.className = 'small'
    box.appendChild(a)
  }
  popup?.remove()
  popup = new ml.Popup({ maxWidth: '300px', ...(anchor ? { anchor } : {}) }).setLngLat(lngLat).setDOMContent(box).addTo(map)
  requestAnimationFrame(ensurePopupVisible)
}

/** popup กล้อง CCTV: ชื่อจุด + จำนวนกล้อง + ปุ่มไปดูภาพสดที่เว็บ กทม. (ไม่ฝังภาพ) */
function openCctvPopup(lngLat: [number, number], p: CctvProps) {
  if (!map || !ml) return
  const box = document.createElement('div')
  const add = (tag: string, text: string, cls?: string) => {
    const n = document.createElement(tag)
    n.textContent = text
    if (cls) n.className = cls
    box.appendChild(n)
    return n
  }
  add('div', `📷 ${p.name}`, 'popup-title')
  add('div', `กล้อง CCTV จราจร กทม.${p.cameras > 1 ? ` · ${p.cameras} ตัว` : ''}`, 'popup-value')
  add('div', `เขต${p.district} · รหัส ${p.id}`, 'muted small')
  add('div', 'ตำแหน่งจาก Open Data กทม. — เป็นกล้องจราจร ไม่ใช่เซนเซอร์วัดน้ำท่วม', 'muted small')
  const a = document.createElement('a')
  a.href = CCTV_LIVE_URL
  a.target = '_blank'
  a.rel = 'noopener'
  a.textContent = 'ดูภาพสดที่ CCTV กทม. ↗'
  a.className = 'small'
  box.appendChild(a)
  popup?.remove()
  popup = new ml.Popup({ maxWidth: '300px' }).setLngLat(lngLat).setDOMContent(box).addTo(map)
  requestAnimationFrame(ensurePopupVisible)
}

/** ถ้า popup ล้นขอบแผนที่ (จอเตี้ย/รูปสูง) ให้เลื่อนแผนที่ตามจนเห็นครบ — ขอบบนสำคัญสุดเพราะรูปอยู่บนสุด */
function ensurePopupVisible() {
  const el = popup?.getElement()
  if (!map || !el) return
  const pr = el.getBoundingClientRect()
  const mr = map.getContainer().getBoundingClientRect()
  const pad = 8
  let dx = 0
  let dy = 0
  if (pr.top < mr.top + pad) dy = pr.top - (mr.top + pad) // ล้นบน → เลื่อนเนื้อหาลง
  else if (pr.bottom > mr.bottom - pad) dy = pr.bottom - (mr.bottom - pad)
  if (pr.left < mr.left + pad) dx = pr.left - (mr.left + pad)
  else if (pr.right > mr.right - pad) dx = pr.right - (mr.right - pad)
  if (dx || dy) map.panBy([dx, dy], { duration: 250 })
}

function fitRegion(r: Region) {
  region.value = r
  map?.fitBounds(BOUNDS[r], { padding: 20, duration: 600 })
}

/** ซูมให้ครอบคลุม bbox [minLng, minLat, maxLng, maxLat] (หน้ารายเขต/จังหวัด) */
function fitTo(b: [number, number, number, number]) {
  if (!map) return
  const pad = 0.01 // จุดเดียว/พื้นที่เล็กมาก → ขยายกรอบเล็กน้อยให้ไม่ซูมจนเกินไป
  map.fitBounds([[b[0] - pad, b[1] - pad], [b[2] + pad, b[3] + pad]], { padding: 40, maxZoom: 14, duration: 600 })
}

onMounted(async () => {
  ml = await import('maplibre-gl')
  ml.setWorkerUrl(maplibreWorkerUrl)
  map = new ml.Map({
    container: el.value!,
    style: dark.matches ? STYLE_DARK : STYLE_LIGHT,
    bounds: BOUNDS.bkk,
    fitBoundsOptions: { padding: 10 },
    maxZoom: 18,
    attributionControl: { compact: true },
  })
  map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right')
  map.addControl(new ml.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'top-right')
  map.on('load', () => { styleReady = true; addLayers(); emit('ready') })
  // สลับสไตล์ตามธีมเครื่อง แล้วใส่เลเยอร์กลับ (setStyle ล้างเลเยอร์ทั้งหมด)
  dark.addEventListener('change', (e) => {
    styleReady = false
    map?.setStyle(e.matches ? STYLE_DARK : STYLE_LIGHT)
    map?.once('style.load', () => { styleReady = true; addLayers() })
  })
})
onUnmounted(() => { popup?.remove(); map?.remove() })

watch(() => props.bundle, () => {
  if (!map || !styleReady) return
  for (const id of POINT_SOURCES) (map.getSource(id) as GeoJSONSource | undefined)?.setData(toFC(id))
})
watch(() => ({ ...props.visible }), (vis) => {
  if (!map) return
  for (const id of POINT_SOURCES) {
    for (const suffix of ['-pt', '-cluster', '-count']) {
      if (map.getLayer(`${id}${suffix}`)) map.setLayoutProperty(`${id}${suffix}`, 'visibility', vis[id] ? 'visible' : 'none')
    }
  }
  syncGistdaLayer()
})
watch(gistdaPeriod, syncGistdaLayer)
watch(() => props.cctv, (on) => {
  if (map?.getLayer(CCTV_LAYER)) map.setLayoutProperty(CCTV_LAYER, 'visibility', on ? 'visible' : 'none')
  if (!on) popup?.remove()
})
watch(() => props.focus, (f) => {
  if (!f || !map) return
  const c = f.geometry.coordinates
  // เลื่อนให้หมุดอยู่ต่ำกว่ากึ่งกลางแผนที่ ~1/4 ของความสูง เพื่อให้ popup (ที่เปิดเหนือหมุด) มีที่พอ ไม่ล้นขอบ
  const offsetY = Math.round(map.getContainer().clientHeight * 0.25)
  map.flyTo({ center: c, zoom: Math.max(map.getZoom(), 14), duration: 700, offset: [0, offsetY] })
  map.once('moveend', () => openPopup(c, f.properties, 'bottom'))
  el.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
})

defineExpose({ fitRegion, fitTo })
</script>

<template>
  <div class="map-wrap">
    <div ref="el" class="map" />
    <div class="map-top">
      <div class="map-region">
        <button class="chip" :aria-pressed="region === 'bkk'" @click="fitRegion('bkk')">กทม.</button>
        <button class="chip" :aria-pressed="region === 'th'" @click="fitRegion('th')">ทั้งประเทศ</button>
      </div>
      <div v-if="gistdaOn" class="map-period" role="group" aria-label="ช่วงเวลาภาพดาวเทียม">
        <span class="small period-label">🛰️ ดาวเทียม</span>
        <button v-for="p in GISTDA_PERIODS" :key="p.id" class="chip chip-sm" :aria-pressed="gistdaPeriod === p.id" @click="gistdaPeriod = p.id">{{ p.label }}</button>
      </div>
    </div>
    <div class="legend card small">
      <div v-for="lv in (['critical', 'warning', 'watch', 'normal'] as const)" :key="lv" class="legend-row">
        <span class="dot" :class="`dot-${lv}`" /> {{ LEVEL_LABEL[lv] }}
      </div>
      <div v-if="gistdaOn" class="legend-row"><span class="swatch" /> พื้นที่น้ำท่วม (ดาวเทียม)</div>
      <div v-if="cctv" class="legend-row"><span class="dot dot-cctv" /> กล้อง CCTV จราจร</div>
    </div>
  </div>
</template>

<style scoped>
.map-wrap { position: relative; width: 100%; max-width: 100%; height: 58vh; min-height: 340px; border-radius: 14px; overflow: hidden; border: 1px solid var(--border); scroll-margin-top: 66px; /* scrollIntoView ตอนแตะรายการ ต้องไม่ให้ header ที่ sticky ทับขอบบนของแผนที่/popup */ }
@media (min-width: 960px) { .map-wrap { height: calc(100vh - 220px); min-height: 480px; } }
.map { position: absolute; inset: 0; scroll-margin-top: 80px; } /* scrollIntoView เรียกบน .map (ref el) — เผื่อ header sticky 56px + ขอบ */
.map-top { position: absolute; top: 10px; left: 10px; right: 56px; display: grid; gap: 6px; z-index: 1; pointer-events: none; }
.map-top > * { pointer-events: auto; }
.map-region { display: flex; gap: 6px; }
.map-region .chip { box-shadow: var(--shadow); }
.map-period { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.period-label { background: var(--card); padding: 4px 8px; border-radius: 999px; box-shadow: var(--shadow); }
.chip-sm { min-height: 30px; padding: 4px 10px; font-size: 13px; box-shadow: var(--shadow); }
.legend { position: absolute; left: 10px; bottom: 28px; padding: 8px 10px; z-index: 1; display: grid; gap: 4px; box-shadow: var(--shadow); }
.legend-row { display: flex; align-items: center; gap: 6px; }
.dot-cctv { background: #546e7a; border: 1.5px solid #fff; }
.swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; background: rgba(34, 76, 169, 0.75); border: 1px solid #224ca9; flex: none; }
</style>
