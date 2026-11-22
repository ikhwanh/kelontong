<script setup>
import Icon from '../components/Icon.vue';
import { version } from '../../package.json';

const author = {
  name: 'ikhwanh',
  email: 'ikhwanh.dev@gmail.com',
  github: 'https://github.com/ikhwanh',
  source: 'https://github.com/ikhwanh/kelontong',
};
</script>

<template>
  <div class="screen">
    <header class="subbar">
      <RouterLink to="/sync" class="icon-btn" aria-label="Back to settings"><Icon name="back" :size="24" /></RouterLink>
      <h1 class="spacer">About</h1>
    </header>

    <main class="scroll">
      <div class="page">
        <div class="card" style="display: flex; flex-direction: column; gap: 6px">
          <h2 style="margin: 0; font-size: 18px; font-weight: 800">POS</h2>
          <p class="hint" style="font-size: 14px">An offline cash register for small shops. Made by {{ author.name }}.</p>
          <p class="muted num" style="margin: 0; font-size: 12px">Version {{ version }}</p>
        </div>

        <section class="section" aria-labelledby="author-h">
          <h2 id="author-h" class="section-h">Author</h2>
          <div class="list">
            <a class="list-row" :href="`mailto:${author.email}`">
              <div class="main">
                <div class="t">Email</div>
                <div class="s">{{ author.email }}</div>
              </div>
              <Icon name="chevron" />
            </a>
            <a class="list-row" :href="author.github" target="_blank" rel="noopener">
              <div class="main">
                <div class="t">GitHub</div>
                <div class="s">{{ author.github.replace('https://', '') }}</div>
              </div>
              <Icon name="chevron" />
            </a>
            <a class="list-row" :href="author.source" target="_blank" rel="noopener">
              <div class="main">
                <div class="t">Source code</div>
                <div class="s">{{ author.source.replace('https://', '') }}</div>
              </div>
              <Icon name="chevron" />
            </a>
          </div>
          <p class="hint">Questions, bug reports and ideas are welcome by email.</p>
        </section>
      </div>
    </main>
  </div>
</template>
