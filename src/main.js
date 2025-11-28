import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import 'ol/ol.css' // Import OpenLayers CSS

const app = createApp(App)

app.use(router)
app.mount('#app')
