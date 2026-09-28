<script setup lang="ts">
// แท็บ "ใกล้ฉัน": ขอตำแหน่งจากเบราว์เซอร์ (ไม่ส่งไปไหน) แล้วเรียงจุดผิดปกติตามระยะทาง
import type { FloodFeature } from '../utils/format'
import { distanceKm } from '../composables/useFloodItems'

const props = defineProps<{ active: FloodFeature[]; now: number; loaded: boolean }>()
const emit = defineEmits<{ focus: [f: FloodFeature]; located: [c: [number, number]] }>()

const pos = useState<[number, number] | null>('user-pos', () => null)
const status = ref<'idle' | 'asking' | 'ok' | 'denied' | 'unsupported'>(pos.value ? 'ok' : 'idle')
const LIMIT = 30

function locate() {
  if (!navigator.geolocation) { status.value = 'unsupported'; return }
  status.value = 'asking'
  navigator.geolocation.getCurrentPosition(
    (p) => {
      pos.value = [p.coords.longitude, p.coords.latitude]
      status.value = 'ok'
      emit('located', pos.value)
    },
    () => { status.value = 'denied' },
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
  )
}
defineExpose({ locate })

const nearest = computed(() => {
  if (!pos.value) return { items: [] as FloodFeature[], distances: new Map<FloodFeature, number>() }
  const distances = new Map<FloodFeature, number>()
  for (const f of props.active) distances.set(f, distanceKm(pos.value, f.geometry.coordinates))
  const items = [...props.active].sort((a, b) => distances.get(a)! - distances.get(b)!).slice(0, LIMIT)
  return { items, distances }
})
</script>

<template>
  <div class="near">
    <div v-if="status !== 'ok'" class="card ask">
      <p><b>จุดน้ำท่วม / เฝ้าระวังที่ใกล้คุณที่สุด</b></p>
      <p class="muted small">ใช้ตำแหน่งจากเครื่องของคุณเพื่อเรียงระยะทาง — ตำแหน่งอยู่ในเครื่องเท่านั้น ไม่ถูกส่งหรือบันทึก</p>
      <button class="btn btn-primary btn-block" :disabled="status === 'asking'" @click="locate">
        {{ status === 'asking' ? 'กำลังหาตำแหน่ง…' : '📍 ใช้ตำแหน่งของฉัน' }}
      </button>
      <p v-if="status === 'denied'" class="small warn">ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่งให้เบราว์เซอร์แล้วลองใหม่ หรือค้นหาชื่อเขตในช่องค้นหาแทน</p>
      <p v-else-if="status === 'unsupported'" class="small warn">เบราว์เซอร์นี้ไม่รองรับการหาตำแหน่ง</p>
    </div>
    <template v-else>
      <div class="head small muted">
        <span>{{ nearest.items.length }} จุดที่ใกล้ที่สุด (จากแหล่งที่เปิดอยู่)</span>
        <button class="link" type="button" @click="locate">อัปเดตตำแหน่ง</button>
      </div>
      <FloodList :items="nearest.items" :distances="nearest.distances" :now="now" :loaded="loaded" :page="0" empty-text="ไม่มีจุดผิดปกติในแหล่งที่เปิดอยู่" @focus="emit('focus', $event)" />
    </template>
  </div>
</template>

<style scoped>
.near { display: grid; gap: 10px; }
.ask { display: grid; gap: 8px; }
.ask p { margin: 0; }
.warn { color: var(--warning); margin: 0; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.link { background: none; border: 0; padding: 0; color: var(--brand); text-decoration: underline; cursor: pointer; font: inherit; }
</style>
