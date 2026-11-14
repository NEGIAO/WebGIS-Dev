/**
 * NavGuideHUD.vue 实例逻辑（导航引导 HUD）
 */
import { computed, defineComponent, type ComputedRef } from 'vue';
import { formatDistanceMeasure } from '@common/map-view/units';

const ARRIVED_THRESHOLD = 10;

export class Instance {
    public isArrived: ComputedRef<boolean>;
    public arrowAngle: ComputedRef<number>;

    constructor(props: any) {
        this.isArrived = computed(() => {
            return props.navTarget?.distance != null && props.navTarget.distance < ARRIVED_THRESHOLD;
        });

        this.arrowAngle = computed(() => {
            return props.navTarget?.bearing ?? 0;
        });
    }

    public formatDistance = (dist: number | null | undefined) => {
        return formatDistanceMeasure(dist == null ? 0 : dist);
    };
}

export default defineComponent({
    name: 'NavGuideHUD',
    props: {
        navTarget: {
            type: Object,
            default: null,
        },
    },
    setup(props) {
        return new Instance(props);
    },
});
