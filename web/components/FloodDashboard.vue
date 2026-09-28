<script setup lang="ts">
// แดชบอร์ด (สถานะแหล่ง + chip เลเยอร์ + แผนที่ + รายการ) ใช้ทั้งหน้าแรกและหน้ารายเขต/จังหวัด
// ถ้าส่ง province/district มา รายการจะกรองให้และแผนที่ซูมไปพื้นที่นั้นเมื่อข้อมูลมาถึง
import { fmtInt, SOURCE_IDS, SOURCE_META, type FloodFeature, type SourceId } from '../utils/format'
import cctvData from '../data/cctv-bma.json'

const props = defineProps<{ province?: string; district?: string }>()
const { bundle, error, loading, now, reload } = useFloodData()
const hasGistdaKey = !!useRuntimeConfig().public.gistdaKey

// เลเยอร์เปิด/ปิดได้ — เรื่องร้องเรียนเปิดไว้แต่รวมกลุ่มบนแผนที่ (ดู FloodMap); ดาวเทียมต้องมี key ฝั่งเว็บ
const visible = reactive<Record<SourceId, boolean>>({
  bma_flood_road: true,
  thaiwater_waterlevel: true,
  thaiwater_rain: true,
  traffy_flood: true,
  gistda_flood: hasGistdaKey,
})
const layerIds = computed(() => SOURCE_IDS.filter((id) => id !== 'gistda_flood' || hasGistdaKey))
// กล้อง CCTV จราจร กทม. (เลเยอร์ static จาก Open Data — ปิดไว้เป็นค่าเริ่มต้น ไม่ให้รกแผนที่น้ำท่วม)
const cctv = ref(false)
const CCTV_PINS = cctvData.count
const focus = ref<FloodFeature | null>(null)
const mapRef = ref<{ fitRegion: (r: 'bkk' | 'th') => void; fitTo: (b: [number, number, number, number]) => void } | null>(null)
const mapReady = ref(false)

const layerCount = (id: SourceId) => bundle.value?.sources[id]?.count ?? 0
const abnormal = (id: SourceId) => bundle.value?.sources[id]?.features.filter((f) => f.properties.level !== 'normal').length ?? 0

// ซูมแผนที่ให้ครอบคลุมจุดในพื้นที่ (ครั้งเดียวเมื่อทั้งแผนที่และข้อมูลพร้อม)
let fitted = false
function tryFit() {
  if (fitted || !mapReady.value || !bundle.value || (!props.province && !props.district)) return
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const id of SOURCE_IDS) {
    for (const f of bundle.value.sources[id]?.features ?? []) {
      const p = f.properties
      if (props.province && p.province !== props.province) continue
      if (props.district && p.district !== props.district) continue
      const [x, y] = f.geometry.coordinates
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  fitted = true
  if (Number.isFinite(minX)) mapRef.value?.fitTo([minX, minY, maxX, maxY])
}
watch(bundle, tryFit)
watch(mapReady, tryFit)
</script>

<template>
  <div class="dash">
    <SourceStatus :bundle="bundle" :now="now" :error="error" :loading="loading" />

    <div class="layers">
      <button
        v-for="id in layerIds" :key="id" class="chip" :aria-pressed="visible[id]"
        :title="SOURCE_META[id].name" @click="visible[id] = !visible[id]"
      >
        <span class="mark" :class="`mark-${id}`" />
        {{ SOURCE_META[id].short }}
        <span v-if="bundle && id === 'gistda_flood'" class="small">{{ fmtInt(layerCount(id)) }} เซลล์</span>
        <span v-else-if="bundle" class="small">{{ fmtInt(abnormal(id)) }}/{{ fmtInt(layerCount(id)) }}</span>
      </button>
      <button
        class="chip" :aria-pressed="cctv" title="ตำแหน่งกล้อง CCTV จราจรของ กทม. — แตะหมุดเพื่อไปดูภาพสดที่เว็บ กทม."
        @click="cctv = !cctv"
      >
        <CctvIcon />
        กล้อง CCTV
        <span class="small">{{ fmtInt(CCTV_PINS) }} จุด</span>
      </button>
      <button class="chip" :disabled="loading" title="โหลดข้อมูลใหม่" @click="reload">↻</button>
    </div>

    <div class="grid">
      <ClientOnly>
        <FloodMap ref="mapRef" :bundle="bundle" :visible="visible" :cctv="cctv" :focus="focus" :now="now" @ready="mapReady = true" />
        <template #fallback>
          <div class="map-fallback card muted">กำลังโหลดแผนที่…</div>
        </template>
      </ClientOnly>

      <FloodList :bundle="bundle" :visible="visible" :now="now" :initial-province="province" :initial-district="district" @focus="focus = $event" />
    </div>
  </div>
</template>

<style scoped>
.dash { display: grid; gap: 10px; }
.dash > * { min-width: 0; } /* กันแถว chip ที่เลื่อนแนวนอนดันหน้าให้กว้างเกินจอ */
.layers { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
.layers::-webkit-scrollbar { display: none; }
.layers .chip { flex: none; }
.mark { width: 10px; height: 10px; border-radius: 50%; border: 2px solid; background: var(--watch); }
.mark-bma_flood_road { border-color: #fff; }
.mark-thaiwater_waterlevel { border-color: #0d47a1; }
.mark-thaiwater_rain { border-color: #4a148c; }
.mark-traffy_flood { border-color: #37474f; }
.mark-gistda_flood { border-color: #224ca9; background: rgba(34, 76, 169, 0.75); border-radius: 3px; }.grid { display: grid; gap: 14px; }
.grid > * { min-width: 0; }
@media (min-width: 960px) {
  .grid { grid-template-columns: 3fr 2fr; align-items: start; }
  .grid > :first-child { position: sticky; top: 66px; }
}
.map-fallback { height: 58vh; min-height: 340px; display: grid; place-items: center; }
</style>
