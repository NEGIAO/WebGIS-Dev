/**
 * 天气图表的 ECharts 运行时与实例生命周期
 *
 * 从 useWeatherCharts 拆出：懒加载运行时、初始化实例、loading 遮罩、resize 调度与观察者、销毁。
 * 这里是唯一持有可变状态（运行时模块 / 图表实例 / 定时器）的地方；重绘内容由入口通过 renderAll 注入，
 * 避免 runtime 反向依赖两张图的规格。
 */

import { nextTick } from 'vue';
import { translate as t } from '@common/app/useLocale';

export interface WeatherChartsRuntimeDeps {
    trendChartRef: { value: any };
    windChartRef: { value: any };
    /** Toast 实例（ECharts 加载失败时提示） */
    /** 视口宽度 ref（窗口 resize 时同步） */
    viewportWidth: { value: number } | null;
    /** 尺寸变化后的重绘回调（由入口装配两张图的渲染） */
    renderAll: () => void;
    message: any;
}

/**
 * 创建运行时与生命周期管理
 * @param deps 依赖注入（见 WeatherChartsRuntimeDeps）
 */
export function createWeatherChartsRuntime({
    trendChartRef,
    windChartRef,
    message,
    viewportWidth,
    renderAll,
}: WeatherChartsRuntimeDeps) {
    /** ECharts 模块引用 */
    let echartsModule: any = null;
    /** ECharts 运行时加载 Promise（防重复加载） */
    let echartsRuntimePromise: any = null;
    /** 气温趋势图实例 */
    let trendChart: any = null;
    /** 风力图表实例 */
    let windChart: any = null;
    /** resize 防抖定时器 */
    let resizeDebounceTimer: any = null;
    /** resize 动画帧 id */
    let resizeFrameId: any = null;
    /** ResizeObserver 实例（监听容器大小变化） */
    let resizeObserver: any = null;

    /**
     * 加载 ECharts 运行时模块（懒加载，仅首次调用时实际加载）
     * @returns {Promise<Object>} ECharts 运行时模块
     */
    function loadEchartsRuntime() {
        if (echartsRuntimePromise) return echartsRuntimePromise;

        echartsRuntimePromise = import('@common/weather/utils/weatherRuntime')
            .then((runtimeModule) => {
                const runtime = runtimeModule?.getWeatherEchartsRuntime?.();
                if (!runtime) {
                    throw new Error(t('weather.chartRuntimeFailed'));
                }

                echartsModule = runtime;
                return runtime;
            })
            .catch((error) => {
                echartsRuntimePromise = null;
                throw error;
            });

        return echartsRuntimePromise;
    }

    /**
     * 确保 ECharts 运行时已就绪
     * @returns {Promise<Object>} ECharts 模块
     */
    async function ensureEchartsReady() {
        if (echartsModule) return echartsModule;

        try {
            return await loadEchartsRuntime();
        } catch (error) {
            message.error(t('weather.echartsLoadFailed'), error);
            throw error instanceof Error ? error : new Error(t('weather.echartsLoadFailed'));
        }
    }

    /**
     * 确保图表 DOM 容器已初始化为 ECharts 实例
     */
    async function ensureChartInstances() {
        await ensureEchartsReady();
        await nextTick();

        if (!trendChart && trendChartRef.value) {
            trendChart = echartsModule.init(trendChartRef.value);
        }

        if (!windChart && windChartRef.value) {
            windChart = echartsModule.init(windChartRef.value);
        }

        // 初始化 ResizeObserver 监听容器大小变化
        setupResizeObserver();
    }

    /* ------------------------------------------------------------ */
    /*  图表 Loading 状态                                              */
    /* ------------------------------------------------------------ */

    /** 显示图表 loading 遮罩 */
    function showChartsLoading() {
        const loadingText = t('weather.chartsLoading');
        trendChart?.showLoading?.('default', { text: loadingText });
        windChart?.showLoading?.('default', { text: loadingText });
    }

    /** 隐藏图表 loading 遮罩 */
    function hideChartsLoading() {
        trendChart?.hideLoading?.();
        windChart?.hideLoading?.();
    }

    /** 触发图表实例 resize */
    function resizeCharts() {
        trendChart?.resize?.();
        windChart?.resize?.();
    }

    /**
     * 延迟到布局稳定后再 resize + render，适配侧栏拖拽、折叠动画和容器查询换行。
     * @param {Object} options 调度选项
     * @param {number} options.delay 防抖延迟
     * @param {boolean} options.updateViewport 是否同步视口宽度
     */
    function scheduleChartsResizeAndRender(
        options: { delay?: number; updateViewport?: boolean } = {},
    ) {
        if (typeof window === 'undefined') return;

        const delay = Number.isFinite(options.delay) ? options.delay : 90;

        if (resizeDebounceTimer !== null) {
            window.clearTimeout(resizeDebounceTimer);
            resizeDebounceTimer = null;
        }

        if (resizeFrameId !== null) {
            window.cancelAnimationFrame(resizeFrameId);
            resizeFrameId = null;
        }

        resizeDebounceTimer = window.setTimeout(() => {
            resizeDebounceTimer = null;

            if (options.updateViewport && viewportWidth) {
                viewportWidth.value = window.innerWidth;
            }

            resizeFrameId = window.requestAnimationFrame(() => {
                resizeFrameId = null;
                resizeCharts();
                renderAll();
            });
        }, delay);
    }

    /**
     * 设置 ResizeObserver 监听图表容器大小变化
     * 当父组件尺寸改变时（如侧边栏折叠、面板展开），自动触发图表 resize
     */
    function setupResizeObserver() {
        // 如果已经设置过，先断开
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }

        // 浏览器不支持 ResizeObserver 时降级到窗口监听
        if (typeof ResizeObserver === 'undefined') {
            return;
        }

        resizeObserver = new ResizeObserver(() => {
            scheduleChartsResizeAndRender({ delay: 90 });
        });

        const observedElements = new Set(
            [
                trendChartRef.value,
                windChartRef.value,
                trendChartRef.value?.parentElement,
                windChartRef.value?.parentElement,
                trendChartRef.value?.parentElement?.parentElement,
                trendChartRef.value?.parentElement?.parentElement?.parentElement,
            ].filter(Boolean),
        );

        for (const element of observedElements) {
            resizeObserver.observe(element);
        }
    }

    /** 防抖窗口 resize 处理（同时更新视口宽度并重绘图表） */
    function handleWindowResize() {
        if (typeof window === 'undefined') return;

        scheduleChartsResizeAndRender({ delay: 120, updateViewport: true });
    }
    /** 当前已加载的 ECharts 运行时（未加载时为 null） */
    function getEchartsModule() {
        return echartsModule;
    }

    /** 当前趋势图实例（未初始化时为 null） */
    function getTrendChart() {
        return trendChart;
    }

    /** 当前风图实例（未初始化时为 null） */
    function getWindChart() {
        return windChart;
    }

    /** 释放图表实例与所有监听（组件卸载时调用） */
    function dispose() {
        // 清理 ResizeObserver
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }

        if (typeof window !== 'undefined') {
            window.removeEventListener('resize', handleWindowResize);
            if (resizeDebounceTimer !== null) {
                window.clearTimeout(resizeDebounceTimer);
                resizeDebounceTimer = null;
            }
            if (resizeFrameId !== null) {
                window.cancelAnimationFrame(resizeFrameId);
                resizeFrameId = null;
            }
        }

        trendChart?.dispose?.();
        windChart?.dispose?.();
        trendChart = null;
        windChart = null;
    }

    return {
        getEchartsModule,
        getTrendChart,
        getWindChart,
        loadEchartsRuntime,
        ensureEchartsReady,
        ensureChartInstances,
        showChartsLoading,
        hideChartsLoading,
        resizeCharts,
        scheduleChartsResizeAndRender,
        setupResizeObserver,
        handleWindowResize,
        dispose,
    };
}
