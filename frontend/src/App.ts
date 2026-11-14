/**
 * App.vue 实例逻辑（应用根组件）
 */
import { defineComponent } from 'vue';
import { RouterView } from 'vue-router';
import GlobalLoading from '@common/shell/GlobalLoading.vue';
import { useThemeStore } from '@common/app/stores/useThemeStore';

export class Instance {
    public themeStore: any;

    constructor() {
        this.themeStore = useThemeStore();
        this.themeStore.init();
    }
}

export default defineComponent({
    name: 'App',
    components: {
        RouterView,
        GlobalLoading,
    },
    setup() {
        return new Instance();
    },
});
