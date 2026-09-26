<script setup lang="ts">
// bottom sheet สายด่วน — ทุกเบอร์เป็นปุ่ม tel: กดโทรได้ทันที
import { HOTLINES, SAFETY_NOTE } from '../utils/hotlines'

const open = defineModel<boolean>({ default: false })
const close = () => { open.value = false }
onMounted(() => {
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
  window.addEventListener('keydown', onKey)
  onUnmounted(() => window.removeEventListener('keydown', onKey))
})
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="backdrop" @click.self="close">
        <div class="sheet" role="dialog" aria-modal="true" aria-label="สายด่วน">
          <div class="handle" />
          <div class="head">
            <h2>สายด่วน</h2>
            <button class="btn" @click="close">ปิด</button>
          </div>
          <div class="lines">
            <div v-for="h in HOTLINES" :key="h.number" class="line">
              <a class="btn btn-block call" :class="h.urgent ? 'btn-danger' : 'btn-primary'" :href="`tel:${h.number}`">
                📞 โทร {{ h.number }}
              </a>
              <div class="info">
                <div class="name">{{ h.name }}</div>
                <div class="muted small">{{ h.note }}</div>
                <a v-if="h.line" class="small" :href="h.line.url" target="_blank" rel="noopener">LINE {{ h.line.id }} ↗</a>
              </div>
            </div>
          </div>
          <p class="banner banner-warn small">⚡ {{ SAFETY_NOTE }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 50; display: flex; align-items: flex-end; justify-content: center; }
.sheet {
  width: 100%; max-width: 560px; max-height: 88vh; overflow-y: auto; background: var(--bg); color: var(--text);
  border-radius: 18px 18px 0 0; padding: 8px 16px calc(16px + env(safe-area-inset-bottom)); box-shadow: var(--shadow);
}
.handle { width: 40px; height: 4px; border-radius: 2px; background: var(--border); margin: 4px auto 8px; }
.head { display: flex; align-items: center; justify-content: space-between; }
h2 { margin: 0; font-size: 20px; }
.lines { display: grid; gap: 10px; margin: 10px 0; }
.line { display: grid; grid-template-columns: 150px 1fr; gap: 10px; align-items: center; }
.call { font-size: 17px; }
.name { font-weight: 600; }
.sheet-enter-active, .sheet-leave-active { transition: opacity 0.2s; }
.sheet-enter-active .sheet, .sheet-leave-active .sheet { transition: transform 0.25s; }
.sheet-enter-from, .sheet-leave-to { opacity: 0; }
.sheet-enter-from .sheet, .sheet-leave-to .sheet { transform: translateY(40px); }
</style>
