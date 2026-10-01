<script setup lang="ts">
// ประโยคสรุปของพื้นที่ (หน้ารายเขต/จังหวัด) + ปุ่ม "บันทึกย่านนี้"
// อ่านง่ายกว่าตัวเลขบนแผนที่: บอกสถานะถนน/สถานีวัด/เรื่องร้องเรียน/ฝน ของพื้นที่นี้ในประโยคเดียว
import { fmtInt, fmtValue, type FloodBundle, type FloodFeature } from '../utils/format'
import { BANGKOK_TH } from '../data/areas'

const props = defineProps<{ bundle: FloodBundle | null; province?: string; district?: string }>()
const route = useRoute()
const { saved, save, clear } = useMyArea()

const isBkkDistrict = computed(() => !!props.district && props.province === BANGKOK_TH)
const label = computed(() => (isBkkDistrict.value ? `เขต${props.district}` : props.district ? `อ.${props.district} จ.${props.province}` : `จังหวัด${props.province}`))
const isSaved = computed(() => saved.value?.path === route.path)

const inArea = (f: FloodFeature) =>
  (!props.province || f.properties.province === props.province) && (!props.district || f.properties.district === props.district)
const pick = (id: keyof FloodBundle['sources']) => (props.bundle?.sources[id]?.features ?? []).filter(inArea)

const parts = computed(() => {
  if (!props.bundle) return null
  const out: { text: string; tone: 'bad' | 'warn' | 'ok' | 'info' }[] = []
  const deepest = (list: FloodFeature[]) => list.reduce<FloodFeature | null>((a, b) => ((b.properties.value ?? -1) > (a?.properties.value ?? -1) ? b : a), null)

  // ถนน (เซนเซอร์ กทม.) — เฉพาะ กทม.
  if (props.province === BANGKOK_TH) {
    const roads = pick('bma_flood_road')
    const wet = roads.filter((f) => f.properties.level !== 'normal')
    if (!roads.length) out.push({ text: 'ไม่มีจุดวัดน้ำบนถนนในพื้นที่นี้ (ไม่ได้แปลว่าไม่มีน้ำ)', tone: 'info' })
    else if (!wet.length) out.push({ text: `ถนนไม่มีน้ำเกินเกณฑ์ทุกจุดวัด (${fmtInt(roads.length)} จุด)`, tone: 'ok' })
    else {
      const d = deepest(wet)!
      out.push({ text: `ถนนน้ำท่วม ${fmtInt(wet.length)} จาก ${fmtInt(roads.length)} จุดวัด · ลึกสุด ${fmtValue(d.properties)} ที่${d.properties.name}`, tone: 'bad' })
    }
  }
  // สถานีวัดระดับน้ำ (สสน.)
  const st = pick('thaiwater_waterlevel')
  if (st.length) {
    const bad = st.filter((f) => f.properties.level === 'critical' || f.properties.level === 'warning')
    const watch = st.filter((f) => f.properties.level === 'watch')
    if (bad.length) out.push({ text: `สถานีวัดระดับน้ำเกินเกณฑ์ ${fmtInt(bad.length)} จาก ${fmtInt(st.length)} แห่ง${watch.length ? ` เฝ้าระวังอีก ${fmtInt(watch.length)}` : ''}`, tone: 'bad' })
    else if (watch.length) out.push({ text: `สถานีวัดระดับน้ำเฝ้าระวัง ${fmtInt(watch.length)} จาก ${fmtInt(st.length)} แห่ง`, tone: 'warn' })
    else out.push({ text: `สถานีวัดระดับน้ำปกติทั้ง ${fmtInt(st.length)} แห่ง`, tone: 'ok' })
  }
  // เรื่องร้องเรียน (Traffy)
  const tr = pick('traffy_flood')
  if (tr.length) out.push({ text: `ร้องเรียนน้ำท่วม 24 ชม. ${fmtInt(tr.length)} เรื่อง`, tone: tr.length >= 10 ? 'warn' : 'info' })
  // ฝน
  const rain = deepest(pick('thaiwater_rain'))
  if (rain && (rain.properties.value ?? 0) > 0) out.push({ text: `ฝนสูงสุด 24 ชม. ${fmtValue(rain.properties)}`, tone: (rain.properties.value ?? 0) >= 60 ? 'warn' : 'info' })
  if (!out.length) out.push({ text: 'ยังไม่มีข้อมูลจากจุดวัดในพื้นที่นี้', tone: 'info' })
  return out
})
const headTone = computed(() => (parts.value?.some((p) => p.tone === 'bad') ? 'bad' : parts.value?.some((p) => p.tone === 'warn') ? 'warn' : 'ok'))
</script>

<template>
  <section class="card summary" :class="`tone-${headTone}`" aria-live="polite">
    <div class="head">
      <h2>{{ label }} ตอนนี้</h2>
      <ClientOnly>
        <button v-if="!isSaved" type="button" class="chip" title="เปิดเว็บครั้งต่อไปจะมีทางลัดมาที่พื้นที่นี้ (เก็บในเครื่องนี้เท่านั้น)" @click="save(route.path, label)">☆ บันทึกย่านนี้</button>
        <button v-else type="button" class="chip" aria-pressed="true" title="กดเพื่อเลิกบันทึก" @click="clear()">★ ย่านของฉัน</button>
      </ClientOnly>
    </div>
    <p v-if="!parts" class="muted small">กำลังโหลดข้อมูล…</p>
    <ul v-else>
      <li v-for="(p, i) in parts" :key="i" :class="`t-${p.tone}`">{{ p.text }}</li>
    </ul>
  </section>
</template>

<style scoped>
.summary { display: grid; gap: 6px; border-left-width: 5px; }
.tone-bad { border-left-color: var(--critical); }
.tone-warn { border-left-color: var(--watch); }
.tone-ok { border-left-color: var(--normal); }
.head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
h2 { margin: 0; font-size: 18px; }
ul { margin: 0; padding-left: 18px; display: grid; gap: 2px; }
li { font-size: 15px; }
.t-bad { color: var(--critical); font-weight: 600; }
.t-warn { color: #9a6a00; }
.t-ok { color: var(--normal); }
@media (prefers-color-scheme: dark) { .t-warn { color: var(--watch); } }
</style>
