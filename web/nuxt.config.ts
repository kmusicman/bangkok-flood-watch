// Nuxt 3 static site (`nuxt generate`) → Cloudflare Pages
export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: false },
  ssr: true,
  css: ['~/assets/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'th' },
      title: 'Bangkok Flood Watch — แผนที่น้ำท่วม',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'แผนที่น้ำท่วมถนนและระดับน้ำ รวบรวมจากข้อมูลทางการ (สสน., สำนักการระบายน้ำ กทม., Traffy Fondue) อัปเดตทุก 10 นาที' },
        { name: 'color-scheme', content: 'light dark' },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#0b6fb8' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#0f1319' },
      ],
      link: [{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    },
  },
  runtimeConfig: {
    public: {
      // ตั้ง NUXT_PUBLIC_DATA_BASE=https://flood-watch-api.<account>.workers.dev/api/data ตอน build บน Pages
      // ค่าเริ่มต้น /data = ไฟล์ใน public/data ที่ได้จาก `npm run ingest:local`
      dataBase: '/data',
      refreshMs: 120_000,
      // key GISTDA แบบจำกัด HTTP referrer (ไม่ใช่ key ของ Worker) — NUXT_PUBLIC_GISTDA_KEY ใน web/.env; ว่าง = ไม่แสดงชั้นดาวเทียม
      gistdaKey: '',
    },
  },
  vite: {
    server: { fs: { allow: ['..'] } }, // ให้ import จาก ../shared ได้ตอน dev
    optimizeDeps: { exclude: ['maplibre-gl'] }, // ไม่งั้น Vite dev หา maplibre-gl-worker.mjs ไม่เจอ (แผนที่ว่างเปล่า)
    worker: { format: 'es' }, // worker ของ MapLibre เป็น ES module (ดู utils/maplibre-worker.ts)
  },
  nitro: { prerender: { routes: ['/', '/links'] } },
})
