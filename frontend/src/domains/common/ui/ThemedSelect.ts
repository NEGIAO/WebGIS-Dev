/**
 * 系统主题下拉控件：替代浏览器原生 <select>。
 * 选项由调用方提供，不读取 DOM / 不使用浏览器默认列表弹层。
 *
 * 可访问性（V3.7.12）：触发按钮为 combobox（aria-haspopup / aria-expanded /
 * aria-controls / aria-activedescendant），菜单 role="listbox"，选项 role="option"；
 * 支持 ↑/↓/Home/End 移动、Enter/Space 选中、Esc 关闭。
 */
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue';
import { ChevronDown } from '@lucide/vue';

export interface ThemedSelectOption {
    value: string | number;
    label: string;
}

let _selectSeq = 0;

export default defineComponent({
    name: 'ThemedSelect',
    components: { ChevronDown },
    props: {
        modelValue: { type: [String, Number] as PropType<string | number>, default: '' },
        options: { type: Array as PropType<ThemedSelectOption[]>, default: () => [] },
        placeholder: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        compact: { type: Boolean, default: false },
        ariaLabel: { type: String, default: '' },
    },
    emits: ['update:modelValue', 'change'],
    setup(props, { emit }) {
        const open = ref(false);
        const root = ref<HTMLElement | null>(null);
        const activeIndex = ref(-1);
        _selectSeq += 1;
        const menuId = `themed-select-menu-${_selectSeq}`;
        const optionId = (index: number) => `${menuId}-option-${index}`;

        const selectedIndex = computed(() =>
            props.options.findIndex((option) => option.value === props.modelValue)
        );
        const selectedLabel = computed(() => {
            const matched = props.options[selectedIndex.value];
            return matched ? matched.label : (props.placeholder || '');
        });
        const activeOptionId = computed(() =>
            open.value && activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined
        );

        function choose(option: ThemedSelectOption) {
            if (props.disabled) return;
            open.value = false;
            activeIndex.value = -1;
            if (option.value === props.modelValue) return;
            emit('update:modelValue', option.value);
            emit('change', option.value);
        }

        function chooseActive() {
            const option = props.options[activeIndex.value];
            if (option) choose(option);
        }

        function openMenu() {
            if (props.disabled || !props.options.length) return;
            open.value = true;
            activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : 0;
        }

        function closeMenu() {
            open.value = false;
            activeIndex.value = -1;
        }

        function toggleMenu() {
            if (open.value) closeMenu();
            else openMenu();
        }

        /** 按步长移动高亮项（首尾循环）；未打开时先展开再定位。 */
        function moveActive(step: number) {
            if (!open.value) {
                openMenu();
                return;
            }
            const total = props.options.length;
            if (!total) return;
            const current = activeIndex.value;
            const next = current < 0 ? (step > 0 ? 0 : total - 1) : (current + step + total) % total;
            activeIndex.value = next;
        }

        function onTriggerKeydown(event: KeyboardEvent) {
            if (props.disabled) return;
            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault();
                    moveActive(1);
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    moveActive(-1);
                    break;
                case 'Home':
                    if (!open.value) return;
                    event.preventDefault();
                    activeIndex.value = 0;
                    break;
                case 'End':
                    if (!open.value) return;
                    event.preventDefault();
                    activeIndex.value = props.options.length - 1;
                    break;
                case 'Enter':
                case ' ':
                    event.preventDefault();
                    if (open.value) chooseActive();
                    else openMenu();
                    break;
                case 'Escape':
                    if (!open.value) return;
                    event.preventDefault();
                    closeMenu();
                    break;
                case 'Tab':
                    closeMenu();
                    break;
                default:
                    break;
            }
        }

        /** 打开时把高亮项滚进可视区，长列表键盘导航才不会看不到当前项。 */
        watch(activeIndex, async (index) => {
            if (index < 0) return;
            await nextTick();
            const node = root.value?.querySelector<HTMLElement>(`#${optionId(index)}`);
            node?.scrollIntoView({ block: 'nearest' });
        });

        watch(
            () => props.disabled,
            (disabled) => {
                if (disabled) closeMenu();
            }
        );

        function onDocumentPointerDown(event: PointerEvent) {
            if (!open.value) return;
            if (root.value && event.target instanceof Node && root.value.contains(event.target)) return;
            closeMenu();
        }

        onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown, true));
        onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown, true));

        return {
            open,
            root,
            activeIndex,
            activeOptionId,
            menuId,
            optionId,
            selectedLabel,
            choose,
            toggleMenu,
            onTriggerKeydown,
        };
    },
});
