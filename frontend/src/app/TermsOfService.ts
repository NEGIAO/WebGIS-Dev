/**
 * TermsOfService.vue 实例逻辑（服务条款页面）
 */
import { defineComponent, onMounted } from 'vue';
import { useRouter } from 'vue-router';

export class Instance {
    constructor() {
        useRouter();

        onMounted(() => {
            document.title = "服务条款 - NEGIAO's WebGIS";
        });
    }
}

export default defineComponent({
    name: 'TermsOfService',
    setup() {
        return new Instance();
    },
});
