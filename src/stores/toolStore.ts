import { ref } from 'vue';
import { defineStore } from 'pinia';

export type MapTool = 'none' | 'measure-length' | 'measure-area' | 'draw-polygon' | 'pick-point';
export type PickTarget = 'start' | 'end';

let pickResolver: ((point: { lng: number; lat: number } | null) => void) | null = null;

export const useToolStore = defineStore('toolStore', () => {
    const currentTool = ref<MapTool>('none');
    const activePickTarget = ref<PickTarget | ''>('');
    const lastMeasure = ref('');

    function setTool(tool: MapTool): void {
        currentTool.value = tool;
        if (tool !== 'pick-point') {
            activePickTarget.value = '';
        }
    }

    function setLastMeasure(text: string): void {
        lastMeasure.value = String(text || '').trim();
    }

    async function requestPickPoint(target: PickTarget): Promise<{ lng: number; lat: number } | null> {
        if (pickResolver) {
            pickResolver(null);
            pickResolver = null;
        }

        activePickTarget.value = target;
        currentTool.value = 'pick-point';

        return new Promise((resolve) => {
            pickResolver = resolve;
        });
    }

    function resolvePickPoint(point: { lng: number; lat: number } | null): void {
        if (pickResolver) {
            pickResolver(point);
            pickResolver = null;
        }
        activePickTarget.value = '';
        currentTool.value = 'none';
    }

    function cancelPickPoint(): void {
        resolvePickPoint(null);
    }

    return {
        currentTool,
        activePickTarget,
        lastMeasure,
        setTool,
        setLastMeasure,
        requestPickPoint,
        resolvePickPoint,
        cancelPickPoint
    };
});
