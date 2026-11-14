/**
 * PlayerGuidePanel.vue 实例逻辑（角色控制键位提示面板）
 */
import { defineComponent } from 'vue';
import { Mouse, Plane, X } from '@lucide/vue';

export class Instance {
    constructor() {}
}

export default defineComponent({
    name: 'PlayerGuidePanel',
    components: {
        Plane,
        Mouse,
        X,
    },
    props: {
        visible: { type: Boolean, default: false },
        isFirstPerson: { type: Boolean, default: false },
        isFlying: { type: Boolean, default: false },
    },
    emits: ['close'],
    setup() {
        return new Instance();
    },
});
