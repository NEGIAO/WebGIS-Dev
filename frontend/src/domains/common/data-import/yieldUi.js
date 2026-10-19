/**
 * yieldUi.js
 * 数据导入的 UI 让步与遮罩握手工具
 *
 * 背景：导入管线里仍有不少必须留在主线程的大任务（DOMParser 解析、
 * OL Format.readFeatures、Cesium KmlDataSource.load 等）。两类小工具：
 * 1. nextPaint()      —— 两个 rAF：让 showLoading 的遮罩真正完成一次合成，
 *                        避免重活开始时遮罩还没绘制出来（旧版本"卡死时
 *                        从来没见过遮罩"的根因之一）。
 * 2. withImportMask() —— 统一的导入遮罩包装：showLoading(timeoutMs=0) →
 *                        遮罩上屏 → 执行任务 → hideLoading。
 *                        GlobalLoading 遮罩 pointer-events:none 允许点击
 *                        穿透，仅作友好提示不锁交互。
 */

import { showLoading, hideLoading } from '@common/ui/loading.js';

/**
 * 让浏览器完成一次绘制（遮罩/进度提示可见）后返回
 * @returns {Promise<void>}
 */
export function nextPaint() {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                if (typeof requestAnimationFrame === 'function') {
                    requestAnimationFrame(() => resolve());
                } else {
                    setTimeout(resolve, 16);
                }
            });
        } else {
            setTimeout(resolve, 16);
        }
    });
}

/**
 * 在协作式耗时循环中让出主线程一个时间片，让 UI 有机会响应
 * 典型用法：每处理 N 个节点后 await yieldSlice()
 * @returns {Promise<void>}
 */
export function yieldSlice() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 导入遮罩包装
 *
 * @param {string} text - 遮罩文案（如"正在解析 KMZ…"）
 * @param {() => Promise<T>} run - 实际导入任务
 * @returns {Promise<T>} run 的返回值
 * @template T
 */
export async function withImportMask(text, run) {
    showLoading(text, { timeoutMs: 0 });
    try {
        // 双 rAF 等待遮罩上屏再进入重活，避免"任务开跑时遮罩还没绘制"
        await nextPaint();
        await nextPaint();
        return await run();
    } finally {
        hideLoading();
    }
}
