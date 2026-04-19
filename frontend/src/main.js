import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useMessage } from './composables/useMessage'
import { useUserPreferencesStore } from './stores'

// Import OL CSS first (before any OL module imports to ensure proper style loading)
import 'ol/ol.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

const userPreferencesStore = useUserPreferencesStore(pinia)
void userPreferencesStore.bootstrap()

// Mount immediately so RouterView and GlobalLoading can render during async guards.
app.mount('#app')

// Keep message host initialization after router ready.
router.isReady().finally(() => {
	queueMicrotask(() => {
		const message = useMessage()
		message.ensureMessageHost('top-center')
	})
})
