<script setup>
import { RouterView } from 'vue-router'
import GlobalLoading from './components/GlobalLoading.vue'
</script>

<template>
  <RouterView />
  <GlobalLoading />
</template>

<style>
/* Global Styles */
html, body {
    margin: 0;
    padding: 0;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 14px;
    color: #333;
    background: #ffffff;
    height: 100%;
    width: 100%;
    overflow: hidden; /* Prevent scroll on body, let containers handle it */
}

#app {
    height: 100%;
    width: 100%;
}
</style>
