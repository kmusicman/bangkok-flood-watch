<script setup lang="ts">
import { fmtInt, SOURCE_IDS, SOURCE_META, type FloodFeature, type SourceId } from '../utils/format'

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
const focus = ref<FloodFeature | null>(null)
const mapRef = ref<{ fitRegion: (r: 'bkk' | 'th') => void } | null>(null)

const layerCount = (id: SourceId) => bundle.value?.sources[id]?.count ?? 0
const abnormal = (id: SourceId) => bundle.value?.sources[id]?.features.filter((f) => f.properties.level !== 'normal').length ?? 0

useHead({ title: 'Bangkok Flood Watch — แผนที่น้ำท่วมตอนนี้' })
</script>

<template>
  <div class="home">
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
      <button class="chip" :disabled="loading" title="โหลดข้อมูลใหม่" @click="reload">↻</button>
    </div>

    <div class="grid">
      <ClientOnly>
        <FloodMap ref="mapRef" :bundle="bundle" :visible="visible" :focus="focus" :now="now" />
        <template #fallback>
          <div class="map-fallback card muted">กำลังโหลดแผนที่…</div>
        </template>
      </ClientOnly>

      <FloodList :bundle="bundle" :visible="visible" :now="now" @focus="focus = $event" />
    </div>
  </div>
</template>

<style scoped>
.home { display: grid; gap: 10px; }
.home > * { min-width: 0; } /* กันแถว chip ที่เลื่อนแนวนอนดันหน้าให้กว้างเกินจอ */
.layers { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
.layers::-webkit-scrollbar { display: none; }
.layers .chip { flex: none; }
.mark { width: 10px; height: 10px; border-radius: 50%; border: 2px solid; background: var(--watch); }
.mark-bma_flood_road { border-color: #fff; }
.mark-thaiwater_waterlevel { border-color: #0d47a1; }
.mark-thaiwater_rain { border-color: #4a148c; }
.mark-traffy_flood { border-color: #37474f; }
.mark-gistda_flood { border-color: #224ca9; background: rgba(34, 76, 169, 0.75); border-radius: 3px; }
.grid { display: grid; gap: 14px; }
.grid > * { min-width: 0; }
@media (min-width: 960px) {
  .grid { grid-template-columns: 3fr 2fr; align-items: start; }
  .grid > :first-child { position: sticky; top: 66px; }
}
.map-fallback { height: 58vh; min-height: 340px; display: grid; place-items: center; }
</style>
