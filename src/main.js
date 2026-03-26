import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useMessage } from './composables/useMessage'
import 'ol/ol.css' // Import OpenLayers CSS

const app = createApp(App)
const pinia = createPinia()
const message = useMessage()

message.ensureMessageHost('top-right')

app.use(pinia)
app.use(router)
app.mount('#app')
