<script setup lang="ts">
// รายการ "จุดที่น้ำท่วมตอนนี้" ใต้แผนที่ — เรียงตามความรุนแรง กรองตามจังหวัด/เขต/ค้นหา (อ่านง่ายกว่าแผนที่บนมือถือ)
import {
  fmtInt, fmtTime, fmtValue, LEVEL_LABEL, LEVEL_ORDER, relTime, SOURCE_IDS, SOURCE_META,
  type FloodBundle, type FloodFeature, type Level, type SourceId,
} from '../utils/format'

const props = defineProps<{
  bundle: FloodBundle | null
  visible: Record<SourceId, boolean>
  now: number
  /** ค่าเริ่มต้นของตัวกรอง (หน้ารายเขต/จังหวัด) — ผู้ใช้เปลี่ยนได้ */
  initialProvince?: string
  initialDistrict?: string
}>()
const emit = defineEmits<{ focus: [f: FloodFeature] }>()

const province = ref(props.initialProvince ?? '')
const district = ref(props.initialDistrict ?? '')
const q = ref('')
const limit = ref(40)
const PAGE = 40
// แหล่งที่เป็นเซนเซอร์/สถานีทางการมาก่อนเรื่องร้องเรียน เมื่อระดับเท่ากัน
const SOURCE_RANK: Record<SourceId, number> = { bma_flood_road: 3, thaiwater_waterlevel: 2, thaiwater_rain: 1, traffy_flood: 0 }

const active = computed<FloodFeature[]>(() => {
  if (!props.bundle) return []
  const out: FloodFeature[] = []
  for (const id of SOURCE_IDS) {
    if (!props.visible[id]) continue
    for (const f of props.bundle.sources[id]?.features ?? []) if (f.properties.level !== 'normal') out.push(f)
  }
  return out.sort((a, b) =>
    LEVEL_ORDER[b.properties.level] - LEVEL_ORDER[a.properties.level]
    || SOURCE_RANK[b.properties.source] - SOURCE_RANK[a.properties.source]
    || (b.properties.value ?? 0) - (a.properties.value ?? 0)
    || Date.parse(b.properties.observed_at) - Date.parse(a.properties.observed_at))
})

const provinces = computed(() => countBy(active.value, (f) => f.properties.province))
const districts = computed(() => countBy(active.value.filter((f) => !province.value || f.properties.province === province.value), (f) => f.properties.district))
watch(province, () => { district.value = ''; limit.value = PAGE })
watch([district, q], () => { limit.value = PAGE })

// ปุ่ม "ล้างตัวกรอง" — แสดงเมื่อมีตัวกรองใดๆ (รวมค่าเริ่มต้นจากหน้ารายเขต/จังหวัด) กดแล้วกลับเป็นทุกจังหวัด/ทุกเขต/ไม่ค้นหา
const hasFilter = computed(() => !!(province.value || district.value || q.value.trim()))
function clearFilters() {
  province.value = ''
  district.value = ''
  q.value = ''
  limit.value = PAGE
}

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return active.value.filter((f) => {
    const p = f.properties
    if (province.value && p.province !== province.value) return false
    if (district.value && p.district !== district.value) return false
    if (needle && !`${p.name} ${p.district ?? ''} ${p.province ?? ''} ${p.detail ?? ''}`.toLowerCase().includes(needle)) return false
    return true
  })
})
const shown = computed(() => filtered.value.slice(0, limit.value))
const counts = computed(() => {
  const c: Record<Level, number> = { critical: 0, warning: 0, watch: 0, normal: 0 }
  for (const f of filtered.value) c[f.properties.level]++
  return c
})

function countBy(list: FloodFeature[], key: (f: FloodFeature) => string | null) {
  const m = new Map<string, number>()
  for (const f of list) {
    const k = key(f)
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m].sort((a, b) => b[1] - a[1])
}
</script>

<template>
  <section class="list">
    <h2>จุดที่น้ำท่วม / เฝ้าระวังตอนนี้ <span class="muted small">({{ fmtInt(filtered.length) }} จุด)</span></h2>
    <div class="filters">
      <select v-model="province" aria-label="เลือกจังหวัด">
        <option value="">ทุกจังหวัด</option>
        <option v-for="[p, n] in provinces" :key="p" :value="p">{{ p }} ({{ fmtInt(n) }})</option>
      </select>
      <select v-model="district" aria-label="เลือกเขต/อำเภอ">
        <option value="">ทุกเขต/อำเภอ</option>
        <option v-for="[d, n] in districts" :key="d" :value="d">{{ d }} ({{ fmtInt(n) }})</option>
      </select>
      <div class="search">
        <input v-model="q" type="search" placeholder="ค้นหาชื่อถนน / สถานี / เขต" aria-label="ค้นหา">
        <button v-if="hasFilter" type="button" class="btn btn-clear" title="แสดงทุกจังหวัด ทุกเขต และล้างคำค้นหา" @click="clearFilters">✕ ล้างตัวกรอง</button>
      </div>
    </div>
    <div class="summary small">
      <span v-for="lv in (['critical', 'warning', 'watch'] as const)" :key="lv"><span class="dot" :class="`dot-${lv}`" /> {{ LEVEL_LABEL[lv] }} {{ fmtInt(counts[lv]) }}</span>
    </div>

    <p v-if="!bundle" class="muted">กำลังโหลดข้อมูล…</p>
    <p v-else-if="!filtered.length" class="muted">
      ไม่พบจุดน้ำท่วมตามเงื่อนไขที่เลือก
      <button v-if="hasFilter" type="button" class="link" @click="clearFilters">ล้างตัวกรอง</button>
    </p>
    <ul v-else class="items">
      <li v-for="f in shown" :key="f.properties.source + f.properties.id">
        <button class="item" @click="emit('focus', f)">
          <span class="dot" :class="`dot-${f.properties.level}`" :title="LEVEL_LABEL[f.properties.level]" />
          <span class="body">
            <span class="title">{{ f.properties.name }} <span v-if="f.properties.photo" class="cam" title="มีรูปจากผู้แจ้ง">📷</span></span>
            <span v-if="f.properties.detail" class="detail muted small">{{ f.properties.detail }}</span>
            <span class="meta muted small">
              {{ [f.properties.district, f.properties.province].filter(Boolean).join(' · ') }}
              · {{ SOURCE_META[f.properties.source].short }} · {{ fmtTime(f.properties.observed_at, now) }} ({{ relTime(f.properties.observed_at, now) }})
            </span>
          </span>
          <span class="value" :class="`lv-${f.properties.level}`">{{ fmtValue(f.properties) || LEVEL_LABEL[f.properties.level] }}</span>
        </button>
      </li>
    </ul>
    <button v-if="shown.length < filtered.length" class="btn btn-block" @click="limit += PAGE">
      แสดงเพิ่ม ({{ fmtInt(filtered.length - shown.length) }} จุดที่เหลือ)
    </button>
  </section>
</template>

<style scoped>
.list { display: grid; gap: 10px; }
h2 { font-size: 18px; margin: 4px 0 0; }
.filters { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
.filters select, .filters input { min-width: 0; width: 100%; } /* option ยาวๆ ต้องไม่ดันหน้าให้กว้างเกินจอ */
.search { grid-column: 1 / -1; display: flex; gap: 8px; min-width: 0; }
.search input { flex: 1; }
.btn-clear { flex: none; white-space: nowrap; }
.link { background: none; border: 0; padding: 0; color: var(--brand); text-decoration: underline; cursor: pointer; font: inherit; }
.summary { display: flex; gap: 14px; flex-wrap: wrap; }
.summary .dot { width: 10px; height: 10px; vertical-align: middle; }
.items { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.item {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 10px 12px;
  background: var(--card); border: 1px solid var(--border); border-radius: 12px; color: var(--text); cursor: pointer;
}
.item:active { background: var(--chip); }
.body { display: grid; gap: 2px; min-width: 0; flex: 1; }
.title { font-weight: 600; }
.cam { font-size: 13px; font-weight: 400; } /* บอกว่ารายการนี้มีรูป (เฉพาะเรื่องร้องเรียน Traffy) — เซนเซอร์/สถานีวัดไม่มีรูป */
.detail { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.value { font-weight: 700; white-space: nowrap; }
.lv-critical { color: var(--critical); }
.lv-warning { color: var(--warning); }
.lv-watch { color: var(--watch); }
</style>
