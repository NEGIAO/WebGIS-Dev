/**
 * SectionTitle.vue 实例逻辑（通用节标题三件套组件）
 */
import { defineComponent } from 'vue';

export class Instance {
    constructor() {}
}

export default defineComponent({
    name: 'SectionTitle',
    props: {
        eyebrow: { type: String, default: '' },
        title: { type: String, required: true },
        desc: { type: String, default: '' },
        align: { type: String, default: 'center' },
        compact: { type: Boolean, default: false },
        watermark: { type: Boolean, default: true },
    },
    setup() {
        return new Instance();
    },
});
