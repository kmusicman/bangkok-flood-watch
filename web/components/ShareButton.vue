<script setup lang="ts">
// ปุ่มแชร์หน้าปัจจุบัน: มือถือใช้ Web Share API (แชร์เข้า LINE/Facebook/Messenger ได้ในแตะเดียว)
// เดสก์ท็อป/เบราว์เซอร์ที่ไม่มี → เมนู LINE / Facebook / X / คัดลอกลิงก์
const route = useRoute()
const open = ref(false)
const copied = ref(false)

const url = computed(() => `https://bangkokflood.com${route.path.endsWith('/') ? route.path : `${route.path}/`}`)
const pageTitle = () => (typeof document !== 'undefined' && document.title) || 'Bangkok Flood Watch — แผนที่น้ำท่วม'
const enc = encodeURIComponent
const links = computed(() => [
  { name: 'LINE', href: `https://social-plugins.line.me/lineit/share?url=${enc(url.value)}` },
  { name: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url.value)}` },
  { name: 'X', href: `https://twitter.com/intent/tweet?url=${enc(url.value)}&text=${enc(pageTitle())}` },
])

const track = (method: string) => (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.('event', 'share', { method, content_type: 'page', item_id: route.path })

async function share() {
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    track('native')
    try { await navigator.share({ title: pageTitle(), text: pageTitle(), url: url.value }) } catch { /* ผู้ใช้ยกเลิก */ }
    return
  }
  open.value = !open.value
}
async function copy() {
  track('copy')
  try {
    await navigator.clipboard.writeText(url.value)
    copied.value = true
    setTimeout(() => { copied.value = false; open.value = false }, 1500)
  } catch { /* clipboard ถูกบล็อก — ผู้ใช้คัดลอกจาก address bar ได้ */ }
}
</script>

<template>
  <div class="share">
    <button class="chip" type="button" :aria-expanded="open" aria-label="แชร์หน้านี้" title="แชร์หน้านี้" @click="share">⤴<span class="label"> แชร์</span></button>
    <!-- backdrop อยู่ใน stacking context เดียวกับเมนู (header เป็น sticky z-index 10) — ถ้า teleport ไป body จะทับเมนู -->
    <div v-if="open" class="share-backdrop" @click="open = false" />
    <div v-if="open" class="menu card" role="menu">
      <a v-for="l in links" :key="l.name" class="btn" :href="l.href" target="_blank" rel="noopener" role="menuitem" @click="track(l.name.toLowerCase())">{{ l.name }}</a>
      <button class="btn btn-primary" type="button" role="menuitem" @click="copy">{{ copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์' }}</button>
      <div class="muted small url">{{ url }}</div>
    </div>
  </div>
</template>

<style scoped>
.share { position: relative; }
@media (max-width: 480px) { .label { display: none; } } /* จอแคบ: เหลือแค่ไอคอน ไม่ให้ชื่อเว็บใน header ขึ้นบรรทัดใหม่ */
.share-backdrop { position: fixed; inset: 0; z-index: 40; }
.menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 41; display: grid; gap: 6px; min-width: 220px; box-shadow: var(--shadow); }
.menu .btn { justify-content: flex-start; min-height: 40px; }
.url { word-break: break-all; }
</style>
