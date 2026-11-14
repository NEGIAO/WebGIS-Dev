/**
 * PrivacyPolicy.vue 实例逻辑（隐私政策页面）
 */
import { defineComponent, onMounted } from 'vue';

export class Instance {
    constructor() {
        onMounted(() => {
            document.title = "隐私政策 - NEGIAO's WebGIS";
        });
    }
}

export default defineComponent({
    name: 'PrivacyPolicy',
    setup() {
        return new Instance();
    },
});
