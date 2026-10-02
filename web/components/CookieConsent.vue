<script setup lang="ts">
// แถบขอความยินยอมคุกกี้ (PDPA) — Google Analytics จะถูกโหลด "หลัง" ผู้ใช้กดยอมรับเท่านั้น
// Cloudflare Web Analytics ไม่ใช้คุกกี้ จึงไม่ต้องขอ
const props = defineProps<{ gaId: string }>()
const KEY = 'cookie-consent'
// เปิดแถบซ้ำได้จากลิงก์ "ตั้งค่าคุกกี้" ท้ายหน้า (SiteFooter) ผ่าน state ร่วม
const show = useState('cookie-consent-open', () => false)
const route = useRoute()

const read = () => { try { return localStorage.getItem(KEY) } catch { return null } }
const write = (v: string) => { try { localStorage.setItem(KEY, v) } catch { /* private mode */ } }

type Gtag = (...a: unknown[]) => void
const w = () => window as unknown as { dataLayer: unknown[]; gtag: Gtag }

function loadGa() {
  if (!props.gaId || document.getElementById('ga-script')) return
  w().dataLayer = w().dataLayer || []
  w().gtag = function () { w().dataLayer.push(arguments) }
  w().gtag('js', new Date())
  // ?ga_debug=1 → เห็น event ทันทีใน GA Admin → DebugView (ไว้ตรวจว่าข้อมูลเข้า)
  const debug = new URLSearchParams(location.search).has('ga_debug')
  w().gtag('config', props.gaId, { anonymize_ip: true, ...(debug ? { debug_mode: true } : {}) })
  const s = document.createElement('script')
  s.id = 'ga-script'
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(props.gaId)}`
  document.head.appendChild(s)
}

function accept() { write('granted'); show.value = false; loadGa() }
function decline() {
  write('denied'); show.value = false
  // ถ้าเคยยอมรับแล้วมาเปลี่ยนใจ: หยุดส่งข้อมูลทันที (ลบคุกกี้ _ga ของโดเมนนี้)
  if (document.getElementById('ga-script')) {
    w().gtag?.('config', props.gaId, { send_page_view: false })
    for (const c of document.cookie.split(';')) {
      const name = c.split('=')[0].trim()
      if (name.startsWith('_ga')) document.cookie = `${name}=; Max-Age=0; path=/; domain=.bangkokflood.com`
    }
  }
}

onMounted(() => {
  if (!props.gaId) return
  const c = read()
  if (c === 'granted') loadGa()
  else if (c !== 'denied') show.value = true
})

// Nuxt เปลี่ยนหน้าแบบ SPA (ไม่ reload) → ต้องส่ง page_view เองทุกครั้งที่ route เปลี่ยน
watch(() => route.fullPath, (path) => {
  if (document.getElementById('ga-script')) w().gtag?.('event', 'page_view', { page_path: path, page_location: location.href, page_title: document.title })
})
</script>

<template>
  <Transition name="consent">
    <div v-if="show" class="consent card" role="dialog" aria-live="polite" aria-label="การใช้คุกกี้">
      <p class="small">
        เว็บนี้ใช้คุกกี้ของ Google Analytics เพื่อนับจำนวนผู้เข้าชม และของ Google AdSense เพื่อเลือกโฆษณาที่ตรงความสนใจ (ไม่ยอมรับ = ยังเห็นโฆษณา 1 ช่องแต่ไม่ใช้ข้อมูลของคุณ) ไม่มีการเก็บชื่อหรือเบอร์โทร
        เปลี่ยนใจภายหลังได้ที่ลิงก์ "ตั้งค่าคุกกี้" ท้ายหน้า
      </p>
      <div class="actions">
        <button class="btn" @click="decline">ไม่ยอมรับ</button>
        <button class="btn btn-primary" @click="accept">ยอมรับ</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.consent {
  position: fixed; left: 12px; right: 12px; bottom: calc(76px + env(safe-area-inset-bottom)); z-index: 30;
  display: grid; gap: 10px; box-shadow: var(--shadow); max-width: 560px; margin: 0 auto;
}
.consent p { margin: 0; }
.actions { display: flex; gap: 8px; justify-content: flex-end; }
.consent-enter-active, .consent-leave-active { transition: opacity 0.2s, transform 0.2s; }
.consent-enter-from, .consent-leave-to { opacity: 0; transform: translateY(12px); }
</style>
