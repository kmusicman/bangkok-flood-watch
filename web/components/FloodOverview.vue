<script setup lang="ts">
// แท็บ "ภาพรวม" ของแผงขวา: การ์ดใกล้ฉัน → การ์ดนับสถานะ 2×2 (แตะเพื่อกรองระดับ) → ต้องเฝ้าระวัง 5 อันดับ → ตัวเลขสรุป → สถานะแหล่งข้อมูล
import { fmtInt, LEVEL_LABEL, type FloodBundle, type FloodFeature, type Level } from '../utils/format'

const props = defineProps<{
  bundle: FloodBundle | null
  counts: Record<Level, number>
  top: FloodFeature[]
  total: number
  now: number
  loaded: boolean
  error: string | null
  loading: boolean
}>()
const level = defineModel<Level | ''>('level', { required: true })
const emit = defineEmits<{ focus: [f: FloodFeature]; nearby: []; all: [] }>()

const LEVELS: Level[] = ['critical', 'warning', 'watch', 'normal']
function toggleLevel(lv: Level) {
  level.value = level.value === lv ? '' : lv
}

// ตัวเลขสรุปจากทุกแหล่ง (ไม่ขึ้นกับตัวกรอง) — ฝนสูงสุด 24 ชม. และเรื่องร้องเรียนน้ำท่วม 24 ชม.
const maxRain = computed(() => {
  let best: FloodFeature | null = null
  for (const f of props.bundle?.sources.thaiwater_rain?.features ?? []) if ((f.properties.value ?? 0) > (best?.properties.value ?? -1)) best = f
  return best
})
const traffyCount = computed(() => props.bundle?.sources.traffy_flood?.count ?? 0)
const bmaFlooded = computed(() => props.bundle?.sources.bma_flood_road?.features.filter((f) => f.properties.level !== 'normal').length ?? 0)
</script>

<template>
  <div class="ov">
    <button class="cta" type="button" @click="emit('nearby')">
      <span class="cta-icon">📍</span>
      <span class="cta-text">
        <b>ดูจุดน้ำท่วมใกล้ฉัน</b>
        <span class="small">จุดที่น้ำท่วม/เฝ้าระวังล่าสุด เรียงจากตำแหน่งของคุณ</span>
      </span>
      <span class="cta-arrow">›</span>
    </button>

    <div class="sec-head">
      <h3>สถานะจุดวัด</h3>
      <span class="small muted">{{ loaded ? `${fmtInt(total)} จุดผิดปกติ` : 'กำลังโหลด…' }}</span>
    </div>
    <div class="stats">
      <button v-for="lv in LEVELS" :key="lv" type="button" class="stat" :class="[`stat-${lv}`, { on: level === lv }]" :aria-pressed="level === lv" @click="toggleLevel(lv)">
        <b>{{ loaded ? fmtInt(counts[lv]) : '–' }}</b>
        <span>{{ LEVEL_LABEL[lv] }}</span>
      </button>
    </div>
    <p class="hint small muted">แตะสถานะเพื่อกรองรายการและหมุดเฉพาะกลุ่มนั้น{{ level ? ' · กำลังกรอง: ' + LEVEL_LABEL[level] : '' }}</p>

    <div class="sec-head">
      <h3>ต้องเฝ้าระวัง</h3>
      <span class="small muted">รุนแรงที่สุด 5 อันดับ</span>
    </div>
    <FloodList :items="top" :now="now" :loaded="loaded" :page="0" empty-text="ไม่มีจุดผิดปกติตามเงื่อนไขที่เลือก" @focus="emit('focus', $event)" />
    <button v-if="total > top.length" class="btn btn-block" type="button" @click="emit('all')">ดูทั้งหมด ({{ fmtInt(total) }} จุด) →</button>

    <div class="mini">
      <div class="card m">
        <span class="small muted">ฝนสูงสุด 24 ชม.</span>
        <b>{{ maxRain ? fmtInt(Math.round(maxRain.properties.value ?? 0)) : '–' }} <small>มม.</small></b>
        <span class="small muted ell">{{ maxRain ? [maxRain.properties.name, maxRain.properties.province].filter(Boolean).join(' · ') : '' }}</span>
      </div>
      <div class="card m">
        <span class="small muted">ร้องเรียนน้ำท่วม 24 ชม.</span>
        <b>{{ loaded ? fmtInt(traffyCount) : '–' }} <small>เรื่อง</small></b>
        <span class="small muted ell">Traffy Fondue · เซนเซอร์ กทม. ท่วม {{ fmtInt(bmaFlooded) }} จุด</span>
      </div>
    </div>

    <div class="sec-head">
      <h3>แหล่งข้อมูล</h3>
      <span class="small muted">เวลาอัปเดตล่าสุด</span>
    </div>
    <SourceStatus :bundle="bundle" :now="now" :error="error" :loading="loading" vertical />
  </div>
</template>

<style scoped>
.ov { display: grid; gap: 10px; }
.cta {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 14px 16px; border: 0; border-radius: 14px;
  background: linear-gradient(135deg, var(--brand), #094f86); color: #fff; cursor: pointer; box-shadow: var(--shadow);
}
.cta-icon { font-size: 22px; width: 44px; height: 44px; display: grid; place-items: center; background: rgba(255, 255, 255, 0.18); border-radius: 12px; flex: none; }
.cta-text { display: grid; gap: 2px; flex: 1; min-width: 0; }
.cta-text b { font-size: 17px; }
.cta-text .small { opacity: 0.9; }
.cta-arrow { font-size: 26px; line-height: 1; opacity: 0.9; }
.sec-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: 4px; }
.sec-head h3 { margin: 0; font-size: 16px; }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.stat {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px; border-radius: 12px;
  border: 1px solid var(--border); border-left-width: 5px; background: var(--card); color: var(--text); cursor: pointer; text-align: left;
}
.stat b { font-size: 26px; line-height: 1; }
.stat span { font-size: 14px; }
.stat-critical { border-left-color: var(--critical); } .stat-critical b { color: var(--critical); }
.stat-warning { border-left-color: var(--warning); } .stat-warning b { color: var(--warning); }
.stat-watch { border-left-color: var(--watch); } .stat-watch b { color: #b57d00; }
.stat-normal { border-left-color: var(--normal); } .stat-normal b { color: var(--normal); }
.stat.on { outline: 2px solid var(--brand); background: var(--chip); }
.hint { margin: -4px 0 0; }
.mini { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.m { display: grid; gap: 2px; padding: 10px 12px; }
.m b { font-size: 22px; line-height: 1.1; }
.m small { font-size: 13px; font-weight: 500; color: var(--muted); }
.ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (prefers-color-scheme: dark) { .stat-watch b { color: var(--watch); } }
</style>
