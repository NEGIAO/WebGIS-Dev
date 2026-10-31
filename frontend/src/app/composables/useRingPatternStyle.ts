/**
 * 轨道环纹样注入（文档级 <style>）
 *
 * 用途：给 Landing 首屏 / 认证页的同心环挂上「旋转纹样 PNG」底图。
 *
 * 为什么必须注入文档级样式、不能写在 SFC 的 scoped CSS 里：
 *   1. 相对 url() 的解析基准是「写下它的那份样式表」，不是组件本身。打包后
 *      scoped 样式落在 /assets/index-*.css，'./images/...' 会被拼成
 *      /assets/images/... 直接 404（V3.6.20 线上实测）。
 *   2. 经 CSS 自定义属性传 URL（v-bind 注入）同样不行：var() 用在打包产物里
 *      解析基准依旧错，且裸路径不带 url() 时整条声明非法被丢弃。
 *   3. 行内 style 与文档内嵌 <style> 里的相对 url() 按文档 base 解析，与
 *      <img src> 行为一致，根域名 / GitHub Pages 子路径部署都正确。
 *   伪元素挂不了行内样式，故走本模块的运行时注入。
 *
 * 为什么纹样用 background-image 而不是 mask-image：
 *   iOS Safari 合成缺陷 —— 被遮罩的图层若处于持续 transform 旋转的父元素内，
 *   遮罩层会整块栅格化成黑色，旋转环在 iOS 上呈现为黑环（线上实测）。
 *   改 background-image 后绕开 mask 合成路径，各平台渲染一致；PNG 取不到时
 *   该层什么都不画，不存在「掉回整块纯色圆面」的兜底。
 *
 * 选择器优先级：环类名重复两次抬到 (0,3,1)，稳压 SFC scoped 规则的 (0,2,1)，
 * 保证注入的 background-image 不被页面级样式覆盖。
 */

import { onBeforeUnmount, onMounted } from 'vue';
import { ASSET_BASE_URL } from '../../config/publicRuntime';

/** 纹样图源（public/images/njnu-media/）：桌面版 + 移动端 alpha 加强版 */
const RING_PATTERN_FILE = 'images/njnu-media/d-bg2_1.webp';
const RING_PATTERN_MOBILE_FILE = 'images/njnu-media/d-bg2_1-mobile.webp';

/** 注入参数 */
export interface RingPatternStyleOptions {
    /** 文档级 style 元素 id：幂等注入与卸载清理的句柄，同页唯一 */
    styleId: string;
    /** 环容器选择器，如 '.hero-bg__rings' */
    scope: string;
    /** 单个环的类名（不含点），如 'hero-bg__ring' */
    ringClass: string;
    /** 移动端断点像素值，默认 768（与各页 SFC 的降级断点保持一致） */
    breakpoint?: number;
}

/**
 * 拼资源绝对（相对部署基址）URL。
 * @param file 相对 public/ 的文件路径
 * @returns 带尾斜杠基址拼出的路径，兼容 './' 与 '/WebGIS/' 两种 base
 */
function assetUrl(file: string): string {
    const base = ASSET_BASE_URL.endsWith('/') ? ASSET_BASE_URL : `${ASSET_BASE_URL}/`;
    return `${base}${file}`;
}

/**
 * 生成注入用的 CSS 文本。
 * @param options 注入参数
 * @returns 桌面 + 移动端两档 background-image 规则
 */
function buildStyleText({ scope, ringClass, breakpoint = 768 }: RingPatternStyleOptions): string {
    const selector = `${scope} .${ringClass}.${ringClass}::before`;
    return `${selector} {
    background-image: url('${assetUrl(RING_PATTERN_FILE)}');
    background-repeat: no-repeat;
    background-position: center;
}
@media (max-width: ${breakpoint}px) {
    ${selector} {
        background-image: url('${assetUrl(RING_PATTERN_MOBILE_FILE)}');
    }
}`;
}

/**
 * 注入纹样样式，幂等：同 id 已存在则直接返回（多页面共用不会重复插入）。
 * @param options 注入参数
 */
export function injectRingPatternStyle(options: RingPatternStyleOptions): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById(options.styleId)) return;
    const el = document.createElement('style');
    el.id = options.styleId;
    el.textContent = buildStyleText(options);
    document.head.appendChild(el);
}

/**
 * 移除纹样样式，页面卸载时调用，避免遗留全局规则。
 * @param styleId 注入时使用的 style 元素 id
 */
export function removeRingPatternStyle(styleId: string): void {
    if (typeof document === 'undefined') return;
    document.getElementById(styleId)?.remove();
}

/**
 * 组合式封装：挂载时注入、卸载时移除，调用方只需在 setup 顶层写一行。
 * @param options 注入参数
 */
export function useRingPatternStyle(options: RingPatternStyleOptions): void {
    onMounted(() => injectRingPatternStyle(options));
    onBeforeUnmount(() => removeRingPatternStyle(options.styleId));
}
