/**
 * 罗盘区域分析会话标志（一次性）
 *
 * Agent 调用 enable_compass 时武装；用户点击卦象后由宫位面板消费一次。
 * 带过期时间，避免用户很久之后随意点卦象被误判为本次任务的回答。
 */

/** 武装后有效时长：5 分钟 */
const ANALYSIS_ARM_TTL_MS = 5 * 60 * 1000;

let armedAt = 0;

/** 武装一次「等待卦象选择」会话 */
export function armCompassAnalysis(): void {
    armedAt = Date.now();
}

/** 查询当前是否处于等待状态（不消费） */
export function isCompassAnalysisArmed(): boolean {
    return armedAt > 0 && Date.now() - armedAt <= ANALYSIS_ARM_TTL_MS;
}

/**
 * 消费一次武装状态。
 * 无论是否过期都会清除标志，保证「一次性」语义；过期返回 false。
 */
export function consumeCompassAnalysis(): boolean {
    const startedAt = armedAt;
    if (!startedAt) return false;
    armedAt = 0;
    return Date.now() - startedAt <= ANALYSIS_ARM_TTL_MS;
}
