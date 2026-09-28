<script setup lang="ts">
// แดชบอร์ด: แถวเครื่องมือ (พื้นที่ · ค้นหา · จังหวัด/เขต · ชั้นข้อมูล) → แผนที่ซ้าย + แผงขวาแบบแท็บ (ภาพรวม / รายการ / ใกล้ฉัน)
// ใช้ทั้งหน้าแรกและหน้ารายเขต/จังหวัด — ถ้าส่ง province/district มา ตัวกรองเริ่มที่พื้นที่นั้นและแผนที่ซูมไปเมื่อข้อมูลมาถึง
import { fmtInt, LEVEL_LABEL, type FloodFeature, type Level, type SourceId } from '../utils/format'
import { useFloodItems } from '../composables/useFloodItems'

const props = defineProps<{ province?: string; district?: string }>()
const { bundle, error, loading, now, reload, start } = useFloodData()
onMounted(start)
const hasGistdaKey = !!useRuntimeConfig().public.gistdaKey

// ---- ชั้นข้อมูล ----
const visible = reactive<Record<SourceId, boolean>>({
  bma_flood_road: true, thaiwater_waterlevel: true, thaiwater_rain: true, traffy_flood: true, gistda_flood: hasGistdaKey,
})
const LAYER_ORDER: SourceId[] = ['traffy_flood', 'bma_flood_road', 'thaiwater_waterlevel', 'thaiwater_rain', 'gistda_flood']
const layerIds = computed(() => LAYER_ORDER.filter((id) => id !== 'gistda_flood' || hasGistdaKey))
const cctv = ref(true)
const layersOpen = ref(false)
const layersOn = computed(() => (cctv.value ? 1 : 0) + layerIds.value.filter((id) => visible[id]).length)

// ---- ตัวกรอง (แถวเครื่องมือ) ----
const filters = {
  province: ref(props.province ?? ''),
  district: ref(props.district ?? ''),
  q: ref(''),
  level: ref<Level | ''>(''),
}
watch(filters.province, () => { filters.district.value = '' })
const { active, filtered, counts, provinces, districts, hasFilter, clearFilters } = useFloodItems(bundle, visible, filters)
const top = computed(() => filtered.value.slice(0, 5))

// ---- แผนที่ ----
type Region = 'bkk' | 'th'
const region = ref<Region>('bkk')
const focus = ref<FloodFeature | null>(null)
const mapRef = ref<{ fitRegion: (r: Region) => void; fitTo: (b: [number, number, number, number]) => void; flyToUser: (c: [number, number]) => void } | null>(null)
const mapReady = ref(false)
function setRegion(r: Region) {
  region.value = r
  mapRef.value?.fitRegion(r)
}

// ---- แผงขวา ----
type Tab = 'overview' | 'list' | 'near'
const tab = ref<Tab>('overview')
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'ภาพรวม', icon: '▦' },
  { id: 'list', label: 'รายการ', icon: '☰' },
  { id: 'near', label: 'ใกล้ฉัน', icon: '◎' },
]
const nearRef = ref<{ locate: () => void } | null>(null)
function goNearby() {
  tab.value = 'near'
  nextTick(() => nearRef.value?.locate())
}
function onFocus(f: FloodFeature) {
  focus.value = f
}

// ซูมแผนที่ให้ครอบคลุมจุดในพื้นที่ (ครั้งเดียวเมื่อทั้งแผนที่และข้อมูลพร้อม)
let fitted = false
function tryFit() {
  if (fitted || !mapReady.value || !bundle.value || (!props.province && !props.district)) return
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const f of active.value) {
    const p = f.properties
    if (props.province && p.province !== props.province) continue
    if (props.district && p.district !== props.district) continue
    const [x, y] = f.geometry.coordinates
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  fitted = true
  if (Number.isFinite(minX)) mapRef.value?.fitTo([minX, minY, maxX, maxY])
}
watch(bundle, tryFit)
watch(mapReady, tryFit)
</script>

<template>
  <div class="dash">
    <div class="toolbar">
      <div class="seg" role="group" aria-label="พื้นที่แผนที่">
        <button type="button" :aria-pressed="region === 'bkk'" @click="setRegion('bkk')">กทม.</button>
        <button type="button" :aria-pressed="region === 'th'" @click="setRegion('th')">ทั้งประเทศ</button>
      </div>
      <label class="search">
        <span class="ico" aria-hidden="true">🔍</span>
        <input v-model="filters.q.value" type="search" placeholder="ค้นหาถนน / สถานี / เขต เช่น ลาดพร้าว" aria-label="ค้นหา">
      </label>
      <select v-model="filters.province.value" aria-label="เลือกจังหวัด">
        <option value="">ทุกจังหวัด</option>
        <option v-for="[p, n] in provinces" :key="p" :value="p">{{ p }} ({{ fmtInt(n) }})</option>
      </select>
      <select v-model="filters.district.value" aria-label="เลือกเขต/อำเภอ">
        <option value="">ทุกเขต/อำเภอ</option>
        <option v-for="[d, n] in districts" :key="d" :value="d">{{ d }} ({{ fmtInt(n) }})</option>
      </select>
      <button type="button" class="btn layers-btn" :aria-expanded="layersOpen" @click="layersOpen = !layersOpen">
        <span aria-hidden="true">◧</span> ชั้นข้อมูล <span class="small muted">{{ layersOn }}</span>
      </button>
      <button v-if="hasFilter" type="button" class="btn clear-btn" title="แสดงทุกจังหวัด ทุกเขต ทุกระดับ และล้างคำค้นหา" @click="clearFilters">✕ ล้างตัวกรอง</button>
    </div>
    <div v-if="layersOpen" class="card layers-panel">
      <LayerPicker v-model:visible="visible" v-model:cctv="cctv" :bundle="bundle" :layer-ids="layerIds" :loading="loading" @reload="reload" />
    </div>
    <div v-if="filters.level.value" class="lvchip small">
      กรองเฉพาะ <b>{{ LEVEL_LABEL[filters.level.value] }}</b>
      <button type="button" class="link" @click="filters.level.value = ''">ยกเลิก</button>
    </div>

    <div class="work">
      <ClientOnly>
        <FloodMap ref="mapRef" :bundle="bundle" :visible="visible" :cctv="cctv" :level="filters.level.value" :focus="focus" :now="now" @ready="mapReady = true" />
        <template #fallback>
          <div class="map-fallback card muted">กำลังโหลดแผนที่…</div>
        </template>
      </ClientOnly>

      <aside class="panel card">
        <div class="tabs" role="tablist">
          <button v-for="t in TABS" :key="t.id" type="button" role="tab" :aria-selected="tab === t.id" :class="{ on: tab === t.id }" @click="tab = t.id">
            <span aria-hidden="true">{{ t.icon }}</span> {{ t.label }}
          </button>
        </div>
        <div class="panel-body">
          <FloodOverview
            v-if="tab === 'overview'" v-model:level="filters.level.value"
            :bundle="bundle" :counts="counts" :top="top" :total="filtered.length" :now="now" :loaded="!!bundle" :error="error" :loading="loading"
            @focus="onFocus" @nearby="goNearby" @all="tab = 'list'"
          />
          <template v-else-if="tab === 'list'">
            <div class="list-head">
              <h3>จุดที่น้ำท่วม / เฝ้าระวังตอนนี้ <span class="muted small">({{ fmtInt(filtered.length) }} จุด)</span></h3>
              <div class="summary small">
                <span v-for="lv in (['critical', 'warning', 'watch'] as const)" :key="lv"><span class="dot" :class="`dot-${lv}`" /> {{ LEVEL_LABEL[lv] }} {{ fmtInt(counts[lv]) }}</span>
              </div>
            </div>
            <FloodList :items="filtered" :now="now" :loaded="!!bundle" @focus="onFocus">
              <template #empty>
                ไม่พบจุดน้ำท่วมตามเงื่อนไขที่เลือก
                <button v-if="hasFilter" type="button" class="link" @click="clearFilters">ล้างตัวกรอง</button>
              </template>
            </FloodList>
          </template>
          <FloodNearby v-else ref="nearRef" :active="active" :now="now" :loaded="!!bundle" @focus="onFocus" @located="mapRef?.flyToUser($event)" />
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.dash { display: grid; gap: 10px; }
.dash > * { min-width: 0; }

.toolbar { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; align-items: center; }
.toolbar > * { min-width: 0; }
.search { position: relative; display: block; }
.search .ico { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 14px; opacity: 0.6; }
.search input { width: 100%; padding-left: 36px; }
.toolbar select { width: 100%; }
.layers-btn, .clear-btn { white-space: nowrap; }
.layers-btn[aria-expanded='true'] { background: var(--brand); color: #fff; border-color: transparent; }
.layers-btn[aria-expanded='true'] .muted { color: rgba(255, 255, 255, 0.85); }
.clear-btn { color: var(--muted); }
/* มือถือ: แถว 1 พื้นที่ + ชั้นข้อมูล, แถว 2 ค้นหา, แถว 3 จังหวัด/เขต */
.toolbar .seg { grid-row: 1; grid-column: 1; justify-self: start; }
.toolbar .layers-btn { grid-row: 1; grid-column: 2; justify-self: end; }
.toolbar .search { grid-row: 2; grid-column: 1 / -1; }
.toolbar .clear-btn { grid-column: 1 / -1; }
@media (min-width: 960px) {
  .toolbar { grid-template-columns: auto minmax(200px, 1.4fr) minmax(140px, 1fr) minmax(140px, 1fr) auto auto; }
  .toolbar .seg, .toolbar .search, .toolbar .layers-btn, .toolbar .clear-btn { grid-row: auto; grid-column: auto; justify-self: stretch; }
}
.layers-panel { padding: 10px 12px; }
.lvchip { display: flex; gap: 8px; align-items: center; }
.link { background: none; border: 0; padding: 0; color: var(--brand); text-decoration: underline; cursor: pointer; font: inherit; }

.work { display: grid; gap: 12px; }
.work > * { min-width: 0; }
@media (min-width: 960px) {
  .work { grid-template-columns: minmax(0, 3fr) minmax(340px, 2fr); align-items: start; }
  .work > :first-child { position: sticky; top: 74px; }
}
.map-fallback { height: 56vh; min-height: 340px; display: grid; place-items: center; }

.panel { padding: 0; overflow: hidden; }
.tabs { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid var(--border); background: var(--chip); }
.tabs button {
  min-height: 46px; border: 0; background: none; color: var(--muted); font-weight: 600; cursor: pointer; border-bottom: 3px solid transparent;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
.tabs button.on { color: var(--brand); border-bottom-color: var(--brand); background: var(--card); }
.panel-body { padding: 12px; display: grid; gap: 10px; }
@media (min-width: 960px) { .panel-body { max-height: calc(100vh - 220px); overflow-y: auto; } }
.list-head { display: grid; gap: 6px; }
.list-head h3 { margin: 0; font-size: 16px; }
.summary { display: flex; gap: 14px; flex-wrap: wrap; }
.summary .dot { width: 10px; height: 10px; vertical-align: middle; }
</style>
