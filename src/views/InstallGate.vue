<script setup>
import Icon from '../components/Icon.vue';
import { pwa, promptInstall } from '../services/pwa.js';

defineProps({ allowBrowser: Boolean });
defineEmits(['continue']);
</script>

<template>
  <div class="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
    <div class="gate-inner">
      <div class="gate-head">
        <span class="gate-icon"><Icon name="install" :size="34" /></span>
        <h1 id="gate-title">Install the app to start selling</h1>
        <p>The POS only runs as an installed app, so all your sales and stock stay in one place on this device.</p>
      </div>

      <template v-if="pwa.platform === 'ios'">
        <ol class="steps">
          <li><span class="n">1</span><span>Tap <strong>Share</strong> in Safari’s toolbar</span><Icon name="share" :size="22" /></li>
          <li><span class="n">2</span><span>Choose <strong>Add to Home Screen</strong></span><Icon name="plus" :size="22" /></li>
          <li><span class="n">3</span><span>Open the app from your <strong>home screen</strong></span></li>
        </ol>
        <div class="notice warn">
          <Icon name="info" />
          <span>On iPad the home-screen app keeps its own storage. Sales entered in this Safari tab would not show up in the installed app.</span>
        </div>
      </template>

      <template v-else>
        <div class="install-box">
          <p v-if="pwa.installed" class="hint" style="font-size: 14px">
            Installed. Open <strong>POS</strong> from your home screen or Start menu to continue.
          </p>
          <template v-else>
            <button type="button" class="btn btn-primary btn-lg btn-block" :disabled="!pwa.installPrompt" @click="promptInstall">
              <Icon name="download" :size="22" />
              Install app
            </button>
            <p v-if="!pwa.installPrompt" class="hint">
              The install button appears once the browser allows it. If it stays greyed out, open this page in Chrome on Android, or Chrome or Edge on Windows, or use the browser menu’s “Install app”.
            </p>
            <p v-else class="hint">Works in Chrome on Android and Chrome or Edge on Windows. After installing, open it from your home screen or Start menu.</p>
          </template>
        </div>
      </template>

      <div class="gate-foot">
        <span>Works offline</span><span aria-hidden="true">·</span><span>No account needed</span><span aria-hidden="true">·</span><span>Cash only</span>
      </div>
      <button v-if="allowBrowser" type="button" class="btn btn-text" @click="$emit('continue')">Continue in this browser (development build only)</button>
    </div>
  </div>
</template>

<style scoped>
.gate { position: fixed; inset: 0; z-index: 100; overflow-y: auto; background: var(--bg); display: flex; }
.gate-inner { margin: auto; width: 100%; max-width: 460px; display: flex; flex-direction: column; gap: 20px; padding: 32px 20px; }
.gate-head { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
.gate-head h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; }
.gate-head p { margin: 0; font-size: 15px; line-height: 1.5; color: var(--muted); }
.gate-icon { display: flex; align-items: center; justify-content: center; width: 72px; height: 72px; border-radius: 20px; background: var(--accent); color: var(--on-accent); }
.steps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
.steps li { display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 0 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); font-size: 15px; }
.steps li > span:nth-child(2) { flex: 1; }
.steps .n { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; flex: none; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); font-weight: 800; }
.install-box { display: flex; flex-direction: column; gap: 10px; }
.gate-foot { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; font-size: 13px; font-weight: 600; color: var(--muted); }
</style>
