<script setup lang="ts">
// รายการจุดน้ำท่วม (ใช้ในแท็บ "รายการ", "ใกล้ฉัน" และ 5 อันดับในภาพรวม) — ตัวกรองอยู่ที่แถวเครื่องมือ (FloodDashboard)
import { fmtInt, fmtTime, fmtValue, LEVEL_LABEL, relTime, SOURCE_META, type FloodFeature } from '../utils/format'

const props = withDefaults(defineProps<{
  items: FloodFeature[]
  now: number
  loaded: boolean
  /** จำนวนต่อหน้า (0 = แสดงทั้งหมด) */
  page?: number
  /** ระยะทางจากผู้ใช้ (กม.) ต่อรายการ — แท็บใกล้ฉัน */
  distances?: Map<FloodFeature, number>
  emptyText?: string
}>(), { page: 40, emptyText: 'ไม่พบจุดน้ำท่วมตามเงื่อนไขที่เลือก' })
const emit = defineEmits<{ focus: [f: FloodFeature] }>()

const limit = ref(props.page || Infinity)
watch(() => props.items, () => { limit.value = props.page || Infinity })
const shown = computed(() => props.items.slice(0, limit.value))
const km = (f: FloodFeature) => {
  const d = props.distances?.get(f)
  if (d === undefined) return ''
  return d < 1 ? `${Math.round(d * 1000)} ม.` : `${d.toFixed(1)} กม.`
}
</script>

<template>
  <div class="list">
    <p v-if="!loaded" class="muted">กำลังโหลดข้อมูล…</p>
    <p v-else-if="!items.length" class="muted empty"><slot name="empty">{{ emptyText }}</slot></p>
    <ul v-else class="items">
      <li v-for="f in shown" :key="f.properties.source + f.properties.id">
        <button class="item" @click="emit('focus', f)">
          <span class="dot" :class="`dot-${f.properties.level}`" :title="LEVEL_LABEL[f.properties.level]" />
          <span class="body">
            <span class="title">{{ f.properties.name }} <span v-if="f.properties.photo" class="cam" title="มีรูปจากผู้แจ้ง">📷</span></span>
            <span v-if="f.properties.detail" class="detail muted small">{{ f.properties.detail }}</span>
            <span class="meta muted small">
              <b v-if="distances" class="km">{{ km(f) }}</b>
              {{ [f.properties.district, f.properties.province].filter(Boolean).join(' · ') }}
              · {{ SOURCE_META[f.properties.source].short }} · {{ fmtTime(f.properties.observed_at, now) }} ({{ relTime(f.properties.observed_at, now) }})
            </span>
          </span>
          <span class="value" :class="`lv-${f.properties.level}`">{{ fmtValue(f.properties) || LEVEL_LABEL[f.properties.level] }}</span>
        </button>
      </li>
    </ul>
    <button v-if="shown.length < items.length" class="btn btn-block" @click="limit += page">
      แสดงเพิ่ม ({{ fmtInt(items.length - shown.length) }} จุดที่เหลือ)
    </button>
  </div>
</template>

<style scoped>
.list { display: grid; gap: 8px; }
.items { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.item {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 10px 12px;
  background: var(--card); border: 1px solid var(--border); border-radius: 12px; color: var(--text); cursor: pointer;
}
.item:active { background: var(--chip); }
.body { display: grid; gap: 2px; min-width: 0; flex: 1; }
.title { font-weight: 600; }
.cam { font-size: 13px; font-weight: 400; } /* บอกว่ารายการนี้มีรูป (เฉพาะเรื่องร้องเรียน Traffy) */
.detail { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.km { color: var(--brand); margin-right: 4px; }
.value { font-weight: 700; white-space: nowrap; }
.lv-critical { color: var(--critical); }
.lv-warning { color: var(--warning); }
.lv-watch { color: var(--watch); }
.empty { margin: 0; }
</style>
