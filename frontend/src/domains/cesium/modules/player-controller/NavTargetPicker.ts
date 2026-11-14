/* eslint-disable vue/no-reserved-component-names */
/**
 * NavTargetPicker.vue 实例逻辑（设置导航目标对话框）
 */
import { defineComponent } from 'vue';
import { FolderOpen, MapPin, Search } from '@lucide/vue';

export class Instance {
    public emit: any;

    constructor(emit: any) {
        this.emit = emit;
    }

    public handleOption = (type: string) => {
        this.emit('select', type);
        this.emit('close');
    };
}

export default defineComponent({
    name: 'NavTargetPicker',
    components: {
        FolderOpen,
        MapPin,
        Search,
    },
    props: {
        visible: {
            type: Boolean,
            default: false,
        },
    },
    emits: ['close', 'select'],
    setup(_props, { emit }) {
        return new Instance(emit);
    },
});
