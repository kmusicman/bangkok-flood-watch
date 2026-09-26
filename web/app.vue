<script setup lang="ts">
const hotlineOpen = useState('hotline-open', () => false)
</script>

<template>
  <div class="app">
    <header class="top">
      <div class="container bar">
        <NuxtLink to="/" class="brand">
          <img src="/favicon.svg" alt="" width="28" height="28">
          <span>
            <b>Bangkok Flood Watch</b>
            <small class="muted">แผนที่น้ำท่วม รวมข้อมูลทางการ</small>
          </span>
        </NuxtLink>
        <nav>
          <NuxtLink to="/" class="chip">แผนที่</NuxtLink>
          <NuxtLink to="/links" class="chip">ลิงก์</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="container">
      <NuxtPage />
    </main>

    <SiteFooter />

    <!-- ปุ่มลอย "สายด่วน" ทุกหน้า -->
    <button class="btn btn-danger fab" aria-label="เปิดรายการสายด่วน" @click="hotlineOpen = true">📞 สายด่วน</button>
    <HotlineSheet v-model="hotlineOpen" />
  </div>
</template>

<style scoped>
.top { position: sticky; top: 0; z-index: 10; background: var(--card); border-bottom: 1px solid var(--border); }
.bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 56px; }
.brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text); line-height: 1.15; }
.brand small { display: block; font-size: 12px; }
nav { display: flex; gap: 6px; }
nav a { text-decoration: none; }
nav a.router-link-active { background: var(--brand); color: #fff; border-color: transparent; }
main { padding-top: 10px; }
.fab {
  position: fixed; right: 14px; bottom: calc(14px + env(safe-area-inset-bottom)); z-index: 20;
  border-radius: 999px; padding: 12px 18px; font-size: 17px; box-shadow: var(--shadow);
}
</style>
