<script setup lang="ts">
// ช่องโฆษณา AdSense ช่องเดียวของเว็บ — วางใต้แดชบอร์ดเท่านั้น (ไม่อยู่บนแผนที่/ป๊อปอัป/รายการ/หน้าสายด่วน)
//   - แสดงเมื่อตั้งทั้ง NUXT_PUBLIC_ADSENSE_CLIENT และ NUXT_PUBLIC_ADSENSE_SLOT
//   - โหลดสคริปต์ AdSense เมื่อเลื่อนใกล้ถึงช่องเท่านั้น → ไม่ทำให้แผนที่/ข้อมูลโหลดช้า
//   - ผู้ใช้ไม่ยอมรับคุกกี้ (หรือยังไม่ตอบ) → โฆษณาแบบไม่ใช้ข้อมูลส่วนบุคคล (requestNonPersonalizedAds)
//   - ปิด Auto ads ในบัญชี AdSense ไว้ (ห้าม vignette/anchor บังแผนที่และปุ่มสายด่วน)
const { adsenseClient, adsenseSlot } = useRuntimeConfig().public
const enabled = !!(adsenseClient && adsenseSlot)
const box = ref<HTMLElement>()

type AdsWindow = Window & { adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number } }

function load() {
  const w = window as AdsWindow
  let consent: string | null = null
  try { consent = localStorage.getItem('cookie-consent') } catch { /* private mode */ }
  w.adsbygoogle = w.adsbygoogle || []
  w.adsbygoogle.requestNonPersonalizedAds = consent === 'granted' ? 0 : 1
  if (!document.getElementById('adsense-script')) {
    const s = document.createElement('script')
    s.id = 'adsense-script'
    s.async = true
    s.crossOrigin = 'anonymous'
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(String(adsenseClient))}`
    document.head.appendChild(s)
  }
  try { w.adsbygoogle.push({}) } catch { /* ad blocker */ }
}

onMounted(() => {
  if (!enabled || !box.value) return
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); load() }
  }, { rootMargin: '200px' })
  io.observe(box.value)
  onUnmounted(() => io.disconnect())
})
</script>

<template>
  <!-- ไม่ครอบ ClientOnly: ต้องมี element ตอน onMounted เพื่อผูก IntersectionObserver (ClientOnly สร้างลูกทีหลัง) -->
  <aside v-if="enabled" ref="box" class="ad" aria-label="โฆษณา">
      <span class="ad-label small muted">โฆษณา · ช่วยค่าใช้จ่ายเว็บ</span>
      <ins
        class="adsbygoogle"
        style="display:block"
        :data-ad-client="adsenseClient"
        :data-ad-slot="adsenseSlot"
        data-ad-format="horizontal"
        data-full-width-responsive="true"
      />
  </aside>
</template>

<style scoped>
/* สูงคงที่กันหน้าเว็บกระโดดตอนโฆษณาโหลด และไม่ให้สูงเกินจนดันเนื้อหา */
.ad { display: grid; gap: 4px; min-height: 120px; max-height: 300px; overflow: hidden; padding: 8px; border: 1px dashed var(--border); border-radius: 12px; }
.ad-label { text-align: center; }
/* ยังไม่ได้รับอนุมัติ / ไม่มีโฆษณาให้แสดง → ซ่อนทั้งกรอบ ไม่ให้เห็นกล่องว่าง (Google อนุญาตให้ซ่อนช่องที่ unfilled) */
.ad:has(ins[data-ad-status='unfilled']) { display: none; }
</style>
