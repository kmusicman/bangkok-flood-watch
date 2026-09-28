<script setup lang="ts">
// "ชั้นข้อมูล" — เลือกแหล่งข้อมูลที่แสดง (chip) + ล้าง/เลือกทั้งหมด + โหลดใหม่ ใช้ในเมนูแบบเปิด-ปิดจากแถวเครื่องมือ
import { fmtInt, SOURCE_META, type FloodBundle, type SourceId } from '../utils/format'
import cctvData from '../data/cctv-bma.json'

const props = defineProps<{ bundle: FloodBundle | null; layerIds: SourceId[]; loading: boolean }>()
const visible = defineModel<Record<SourceId, boolean>>('visible', { required: true })
const cctv = defineModel<boolean>('cctv', { required: true })
const emit = defineEmits<{ reload: [] }>()

const CCTV_PINS = cctvData.count
const layerCount = (id: SourceId) => props.bundle?.sources[id]?.count ?? 0
const abnormal = (id: SourceId) => props.bundle?.sources[id]?.features.filter((f) => f.properties.level !== 'normal').length ?? 0
const anyOn = computed(() => cctv.value || props.layerIds.some((id) => visible.value[id]))
function setAll(on: boolean) {
  cctv.value = on
  for (const id of props.layerIds) visible.value[id] = on
}
</script>

<template>
  <div class="picker" role="group" aria-label="เลือกแหล่งข้อมูลที่แสดง">
    <button class="chip" :aria-pressed="cctv" title="ตำแหน่งกล้อง CCTV จราจรของ กทม. — แตะหมุดเพื่อไปดูภาพสดที่เว็บ กทม." @click="cctv = !cctv">
      <CctvIcon /> กล้อง CCTV <span class="small">{{ fmtInt(CCTV_PINS) }} จุด</span>
    </button>
    <button
      v-for="id in layerIds" :key="id" class="chip" :aria-pressed="visible[id]"
      :title="SOURCE_META[id].name" @click="visible[id] = !visible[id]"
    >
      <span class="mark" :class="`mark-${id}`" />
      {{ SOURCE_META[id].short }}
      <span v-if="bundle && id === 'gistda_flood'" class="small">{{ fmtInt(layerCount(id)) }} เซลล์</span>
      <span v-else-if="bundle" class="small">{{ fmtInt(abnormal(id)) }}/{{ fmtInt(layerCount(id)) }}</span>
    </button>
    <span class="sep" />
    <button v-if="anyOn" class="chip chip-clear" title="ปิดทุกแหล่งข้อมูล (ซ่อนหมุดทั้งหมด)" @click="setAll(false)">✕ ล้าง</button>
    <button v-else class="chip" title="เปิดทุกแหล่งข้อมูล" @click="setAll(true)">เลือกทั้งหมด</button>
    <button class="chip" :disabled="loading" title="โหลดข้อมูลใหม่" @click="emit('reload')">↻ โหลดใหม่</button>
  </div>
</template>

<style scoped>
.picker { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.sep { flex-basis: 100%; height: 0; }
.mark { width: 10px; height: 10px; border-radius: 50%; border: 2px solid; background: var(--watch); }
.mark-bma_flood_road { border-color: #fff; }
.mark-thaiwater_waterlevel { border-color: #0d47a1; }
.mark-thaiwater_rain { border-color: #4a148c; }
.mark-traffy_flood { border-color: #37474f; }
.mark-gistda_flood { border-color: #224ca9; background: rgba(34, 76, 169, 0.75); border-radius: 3px; }
.chip-clear { color: var(--muted); }
</style>
