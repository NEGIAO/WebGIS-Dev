import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useMessage } from './composables/useMessage'

// Import OL CSS first (before any OL module imports to ensure proper style loading)
import 'ol/ol.css'

const app = createApp(App)
const pinia = createPinia()

// Defer message system initialization to ensure all modules are loaded
app.use(pinia)
app.use(router)

// Initialize message system after app setup to avoid initialization timing issues
const message = useMessage()
message.ensureMessageHost('top-center')

app.mount('#app')
