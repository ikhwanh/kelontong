<script setup>
import { ref, computed } from 'vue';
import Icon from '../components/Icon.vue';
import { pwa, promptInstall, allowBrowser, continueInBrowser } from '../services/pwa.js';

const showManual = ref(false);
const isDevServer = import.meta.env.DEV;
const secure = window.isSecureContext;

// When the browser hasn't offered its install prompt, the button explains how to
// install from the browser's own menu instead of doing nothing.
const manualSteps = computed(() => {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) {
    return pwa.platform === 'android'
      ? ['Tap the <strong>⋮</strong> menu', 'Choose <strong>Install</strong>', 'Open POS from your home screen']
      : ['Firefox on a computer can’t install apps', 'Open this page in <strong>Chrome</strong> or <strong>Edge</strong>'];
  }
  if (/SamsungBrowser\//.test(ua)) return ['Tap the <strong>☰</strong> menu', 'Choose <strong>Add page to → Home screen</strong>', 'Open POS from your home screen'];
  if (pwa.platform === 'android') return ['Tap the <strong>⋮</strong> menu in Chrome', 'Choose <strong>Install app</strong> (or <strong>Add to Home screen</strong>)', 'Open POS from your home screen'];
  if (/Edg\//.test(ua)) return ['Click the <strong>…</strong> menu in Edge', 'Choose <strong>Apps → Install this site as an app</strong>', 'Open POS from the Start menu or desktop'];
  return ['Click the install icon at the right end of the address bar, or the <strong>⋮</strong> menu', 'Choose <strong>Cast, save and share → Install page as app</strong>', 'Open POS from the Start menu or desktop'];
});

async function onInstall() {
  if (pwa.installPrompt) {
    showManual.value = false;
    await promptInstall();
  } else {
    showManual.value = true;
  }
}
</script>

<template>
  <main class="gate" aria-labelledby="gate-title">
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
            <button type="button" class="btn btn-primary btn-lg btn-block" @click="onInstall">
              <Icon name="download" :size="22" />
              Install app
            </button>
            <template v-if="showManual">
              <div v-if="isDevServer" class="notice warn" role="status">
                <Icon name="info" />
                <span>The dev server (<code>npm run dev</code>) can’t be installed: the app manifest is only added to production builds. Run <code>npm run build</code> then <code>npm run preview</code> and open that address to install. For development, use “Continue in this browser” below.</span>
              </div>
              <div v-else-if="!secure" class="notice warn" role="status">
                <Icon name="info" />
                <span>Installing needs a secure address: <strong>https://</strong>, or <strong>localhost</strong> on this computer. Open the app from one of those.</span>
              </div>
              <template v-else>
                <p class="hint" style="font-size: 14px">This browser didn’t offer to install automatically. Install it from the browser menu instead:</p>
                <ol class="steps">
                  <li v-for="(step, i) in manualSteps" :key="i"><span class="n">{{ i + 1 }}</span><span v-html="step"></span></li>
                </ol>
              </template>
            </template>
            <p v-else class="hint">Works in Chrome on Android and Chrome or Edge on Windows. After installing, open it from your home screen or Start menu.</p>
          </template>
        </div>
      </template>

      <div class="gate-foot">
        <span>Works offline</span><span aria-hidden="true">·</span><span>No account needed</span><span aria-hidden="true">·</span><span>Cash only</span>
      </div>
      <button v-if="allowBrowser" type="button" class="btn btn-text" @click="continueInBrowser">Continue in this browser (development build only)</button>
    </div>
  </main>
</template>

<style scoped>
.gate { min-height: 100%; display: flex; background: var(--bg); }
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
code { font-family: var(--mono); font-size: 12px; }
.gate-foot { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; font-size: 13px; font-weight: 600; color: var(--muted); }
</style>
