// Nuxt 3 static site (`nuxt generate`) → Cloudflare Workers static assets
import { AREA_ROUTES } from './data/areas'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: false },
  ssr: true,
  css: ['~/assets/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'th' },
      title: 'น้ำท่วมวันนี้ กรุงเทพฯ และทั่วประเทศ — แผนที่น้ำท่วมเรียลไทม์ | Bangkok Flood Watch',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'เช็กน้ำท่วมวันนี้แบบเรียลไทม์: ถนนที่น้ำท่วมใน กทม. จากเซนเซอร์สำนักการระบายน้ำ, ระดับน้ำ-ฝนทั่วประเทศจาก สสน., เรื่องร้องเรียน Traffy Fondue และพื้นที่น้ำท่วมจากดาวเทียม GISTDA อัปเดตทุก 10 นาที พร้อมสายด่วน 1784 1669 1555' },
        { name: 'color-scheme', content: 'light dark' },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#0b6fb8' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#0f1319' },
        { name: 'robots', content: 'index, follow, max-image-preview:large' },
        // แชร์ใน LINE / Facebook / X
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Bangkok Flood Watch' },
        { property: 'og:locale', content: 'th_TH' },
        { property: 'og:title', content: 'น้ำท่วมวันนี้ กรุงเทพฯ และทั่วประเทศ — แผนที่น้ำท่วมเรียลไทม์ | Bangkok Flood Watch' },
        { property: 'og:description', content: 'ถนนที่น้ำท่วม ระดับน้ำ ฝน และพื้นที่ท่วมจากดาวเทียม รวมจากแหล่งทางการ อัปเดตทุก 10 นาที' },
        { property: 'og:url', content: 'https://bangkokflood.com/' },
        { property: 'og:image', content: 'https://bangkokflood.com/og.png?v=2' }, // เปลี่ยน v= ทุกครั้งที่แก้รูป (edge/LINE/Facebook cache รูปเดิม)
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'แผนที่น้ำท่วมวันนี้ กรุงเทพฯ และทั่วประเทศ' },
        { name: 'twitter:description', content: 'รวมข้อมูลทางการ อัปเดตทุก 10 นาที — Bangkok Flood Watch' },
        { name: 'twitter:image', content: 'https://bangkokflood.com/og.png?v=2' },
      ],
      link: [
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'canonical', href: 'https://bangkokflood.com/' },
      ],
      script: [
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Bangkok Flood Watch',
            alternateName: 'แผนที่น้ำท่วม bangkokflood.com',
            url: 'https://bangkokflood.com/',
            inLanguage: 'th',
            description: 'แผนที่น้ำท่วมวันนี้ กรุงเทพฯ และทั่วประเทศ รวมจากข้อมูลทางการ อัปเดตทุก 10 นาที',
          }),
        },
      ],
    },
  },
  runtimeConfig: {
    public: {
      // ตั้ง NUXT_PUBLIC_DATA_BASE=https://flood-watch-api.<account>.workers.dev/api/data ตอน build บน Pages
      // ค่าเริ่มต้น /data = ไฟล์ใน public/data ที่ได้จาก `npm run ingest:local`
      dataBase: '/data',
      refreshMs: 300_000, // ข้อมูลต้นทางเปลี่ยนทุก 10 นาที — รีเฟรชทุก 5 นาทีพอ (ประหยัดโควตา Worker 2.5 เท่าเทียบกับ 2 นาที)
      // key GISTDA แบบจำกัด HTTP referrer (ไม่ใช่ key ของ Worker) — NUXT_PUBLIC_GISTDA_KEY ใน web/.env; ว่าง = ไม่แสดงชั้นดาวเทียม
      gistdaKey: '',
      // สถิติผู้เข้าชม — ว่าง = ไม่ติด (ดู app.vue)
      cfBeacon: '', // Cloudflare Web Analytics token (NUXT_PUBLIC_CF_BEACON) — ไม่ใช้คุกกี้
      gaId: '', // Google Analytics 4 Measurement ID เช่น G-XXXXXXXXXX (NUXT_PUBLIC_GA_ID)
      adsenseClient: '', // AdSense publisher เช่น ca-pub-… (NUXT_PUBLIC_ADSENSE_CLIENT) — ใส่แล้วมี meta ยืนยันเว็บ
      adsenseSlot: '', // id ของหน่วยโฆษณาแบบแสดงผล (NUXT_PUBLIC_ADSENSE_SLOT) — ว่าง = ไม่แสดงช่องโฆษณา
    },
  },
  vite: {
    server: { fs: { allow: ['..'] } }, // ให้ import จาก ../shared ได้ตอน dev
    optimizeDeps: { exclude: ['maplibre-gl'] }, // ไม่งั้น Vite dev หา maplibre-gl-worker.mjs ไม่เจอ (แผนที่ว่างเปล่า)
    worker: { format: 'es' }, // worker ของ MapLibre เป็น ES module (ดู utils/maplibre-worker.ts)
  },
  // ทุกหน้า prerender เป็น static HTML (หน้ารายเขต/จังหวัดจาก data/areas.ts)
  nitro: { prerender: { routes: ['/', '/links', '/en', ...AREA_ROUTES], crawlLinks: true } },
})
