<script setup>
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView />
</template>

<style>
:root {
  --gis-primary-green: #166534;
  --gis-primary-green-strong: #14532d;
  --gis-primary-green-soft: #22c55e;
  --gis-text-dark: #133222;

  --glass-bg: rgba(255, 255, 255, 0.72);
  --glass-bg-strong: rgba(255, 255, 255, 0.88);
  --glass-border: rgba(210, 250, 226, 0.3);
  --glass-blur: 10px;
  --glass-blur-strong: 12px;

  --z-map: 1;
  --z-floating-ui: 1000;
  --z-topbar: 3000;
  --z-topbar-menu: 3000;
}

html, body {
    margin: 0;
    padding: 0;
  font-family: 'Segoe UI', 'Microsoft YaHei', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 14px;
    color: #333;
  background: #ffffff;
    height: 100%;
    width: 100%;
  overflow: hidden;
}

#app {
    height: 100%;
    width: 100%;
}
</style>
