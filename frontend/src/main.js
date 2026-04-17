import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useMessage } from './composables/useMessage'

// Import OL CSS first (before any OL module imports to ensure proper style loading)
import 'ol/ol.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Mount after initial route is ready; run extra UI host initialization after mount.
router.isReady().finally(() => {
	app.mount('#app')

	queueMicrotask(() => {
		const message = useMessage()
		message.ensureMessageHost('top-center')
	})
})
