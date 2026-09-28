<script setup lang="ts">
import { relTime } from './utils/format'
import { headingFor } from './utils/headings'

const hotlineOpen = useState('hotline-open', () => false)
const { bundle, loadedAt, now, error } = useFloodData() // อ่าน state อย่างเดียว — แดชบอร์ดเป็นคนเรียก start()
const route = useRoute()
const heading = computed(() => headingFor(route.path, route.params as Record<string, string>).heading)
const overline = computed(() => headingFor(route.path, route.params as Record<string, string>).overline)

const dt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
const tm = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
const dataAt = computed(() => (bundle.value ? dt.format(Date.parse(bundle.value.generated_at)) : ''))
const pulledAt = computed(() => (loadedAt.value ? tm.format(loadedAt.value) : ''))
const dataStale = computed(() => !!bundle.value && now.value - Date.parse(bundle.value.generated_at) > 30 * 60_000)

const NAV = [
  { to: '/', label: 'แผนที่', icon: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z' },
  { to: '/bangkok/', label: 'รายเขต กทม.', icon: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z' },
  { to: '/province/', label: 'รายจังหวัด', icon: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z' },
  { to: '/links', label: 'ลิงก์ · สายด่วน', icon: 'M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.6 3.6a1 1 0 0 1-.25 1z' },
]
const isActive = (to: string) => (to === '/' ? route.path === '/' || route.path === '/en/' || route.path === '/en' : route.path.startsWith(to))

// สถิติผู้เข้าชม — ติดเฉพาะเมื่อตั้งค่าไว้ (ดู nuxt.config.ts runtimeConfig.public)
const { cfBeacon, gaId } = useRuntimeConfig().public
const scripts: Record<string, unknown>[] = []
if (cfBeacon) {
  // Cloudflare Web Analytics: ไม่ใช้คุกกี้ ไม่ระบุตัวบุคคล → ไม่ต้องมี cookie banner
  scripts.push({ src: 'https://static.cloudflareinsights.com/beacon.min.js', defer: true, 'data-cf-beacon': JSON.stringify({ token: cfBeacon }) })
}
// Google Analytics โหลดผ่าน <CookieConsent> หลังผู้ใช้กดยอมรับเท่านั้น (PDPA)
useHead({ script: scripts })
</script>

<template>
  <div class="app">
    <header class="top">
      <div class="container bar">
        <NuxtLink to="/" class="brand" aria-label="หน้าแรก">
          <img src="/favicon.svg" alt="" width="40" height="40">
        </NuxtLink>
        <div class="titles">
          <div class="overline">{{ overline }}</div>
          <h1>{{ heading }}</h1>
        </div>
        <div class="right">
          <ClientOnly>
            <div v-if="bundle" class="datapill" :class="{ stale: dataStale }" :title="error ? `รีเฟรชล่าสุดไม่สำเร็จ: ${error}` : 'เวลาของชุดข้อมูลล่าสุดจากแหล่งทางการ'">
              <span class="ind" aria-hidden="true" />
              <span>
                <span class="l1">ข้อมูล ณ <b>{{ dataAt }} น.</b></span>
                <span class="l2 muted">ดึงเมื่อ {{ pulledAt }} น. ({{ relTime(bundle.generated_at, now) }})</span>
              </span>
            </div>
            <ShareButton />
          </ClientOnly>
        </div>
      </div>
    </header>

    <main class="container">
      <NuxtPage />
    </main>

    <SiteFooter />

    <!-- แถบเมนูล่าง (ทุกขนาดจอ) -->
    <nav class="bottom" aria-label="เมนูหลัก">
      <div class="container bottom-in">
        <NuxtLink v-for="n in NAV" :key="n.to" :to="n.to" class="bn" :class="{ on: isActive(n.to) }">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path :d="n.icon" fill="currentColor" /></svg>
          <span>{{ n.label }}</span>
        </NuxtLink>
      </div>
    </nav>

    <!-- ปุ่มลอย "สายด่วน" ทุกหน้า -->
    <button class="btn btn-danger fab" aria-label="เปิดรายการสายด่วน" @click="hotlineOpen = true">📞 สายด่วน</button>
    <HotlineSheet v-model="hotlineOpen" />
    <ClientOnly><CookieConsent :ga-id="String(gaId ?? '')" /></ClientOnly>
  </div>
</template>

<style scoped>
.top { position: sticky; top: 0; z-index: 10; background: var(--card); border-bottom: 1px solid var(--border); }
.bar { display: flex; align-items: center; gap: 12px; min-height: 64px; padding-top: 6px; padding-bottom: 6px; }
.brand { display: flex; flex: none; }
.titles { flex: 1; min-width: 0; line-height: 1.2; }
.overline { color: var(--brand); font-size: 12px; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
h1 { margin: 0; font-size: 20px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (min-width: 720px) { h1 { font-size: 24px; } }
.right { display: flex; align-items: center; gap: 8px; flex: none; }
.datapill {
  display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: var(--chip); border: 1px solid var(--border);
  font-size: 13px; line-height: 1.2;
}
.datapill > span { display: grid; }
.ind { width: 9px; height: 9px; border-radius: 50%; background: var(--normal); flex: none; box-shadow: 0 0 0 3px rgba(46, 125, 50, 0.18); }
.datapill.stale .ind { background: var(--watch); box-shadow: 0 0 0 3px rgba(230, 161, 0, 0.2); }
.l2 { font-size: 12px; }
@media (max-width: 640px) {
  .datapill { display: none; } .brand img { width: 32px; height: 32px; } .overline { font-size: 11px; }
  h1 { font-size: 16px; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
}
main { padding-top: 10px; }

.bottom {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 15; background: var(--card); border-top: 1px solid var(--border);
  padding-bottom: env(safe-area-inset-bottom);
}
.bottom-in { display: grid; grid-template-columns: repeat(4, 1fr); }
.bn {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 58px;
  color: var(--muted); text-decoration: none; font-size: 12px; font-weight: 600;
}
.bn.on { color: var(--brand); }
@media (min-width: 720px) { .bn { flex-direction: row; gap: 8px; font-size: 14px; } }

.fab {
  position: fixed; right: 14px; bottom: calc(72px + env(safe-area-inset-bottom)); z-index: 20;
  border-radius: 999px; padding: 12px 18px; font-size: 17px; box-shadow: var(--shadow);
}
</style>
