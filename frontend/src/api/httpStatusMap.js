/**
 * 统一 HTTP 状态码映射
 *
 * 提供：
 * 1. 标准 HTTP 状态码 → 中文描述（供前端排查 & 用户提示）
 * 2. 高德 API infocode → 中文描述
 * 3. 辅助判断函数（分类、是否可重试等）
 *
 * 用法：
 *   import { getHttpStatusMessage, getAmapErrorMessage } from '@/api/httpStatusMap'
 */

// ==================== HTTP 状态码映射 ====================

export const HTTP_STATUS_MAP = {
    // ---- 1xx 信息 ----
    100: '继续',
    101: '切换协议',
    102: '处理中',
    103: '早期提示',

    // ---- 2xx 成功 ----
    200: '请求成功',
    201: '已创建',
    202: '已接受',
    203: '非权威信息',
    204: '无内容',
    205: '重置内容',
    206: '部分内容',
    207: '多状态',
    208: '已报告',
    226: '已使用 IM',

    // ---- 3xx 重定向 ----
    300: '多种选择',
    301: '永久移动',
    302: '临时移动',
    303: '查看其他',
    304: '未修改',
    305: '使用代理',
    307: '临时重定向',
    308: '永久重定向',

    // ---- 4xx 客户端错误 ----
    400: '请求参数错误',
    401: '未授权，请重新登录',
    402: '需要付费',
    403: '访问被拒绝',
    404: '资源不存在',
    405: '请求方法不允许',
    406: '不可接受',
    407: '需要代理认证',
    408: '请求超时',
    409: '资源冲突',
    410: '资源已删除',
    411: '需要内容长度',
    412: '前置条件失败',
    413: '请求体过大',
    414: 'URI 过长',
    415: '不支持的媒体类型',
    416: '请求范围不满足',
    417: '期望失败',
    418: "我是茶壶",
    421: '错误的请求',
    422: '请求数据校验失败',
    423: '资源已锁定',
    424: '前置依赖失败',
    425: '过早请求',
    426: '需要升级协议',
    428: '需要前置条件',
    429: '请求过于频繁，请稍后重试',
    431: '请求头字段过大',
    451: '因法律原因不可用',

    // ---- 5xx 服务端错误 ----
    500: '服务器内部错误',
    501: '功能未实现',
    502: '网关错误',
    503: '服务暂不可用',
    504: '网关超时',
    505: 'HTTP 版本不支持',
    506: '变体协商',
    507: '存储空间不足',
    508: '检测到循环',
    510: '未扩展',
    511: '需要网络认证',
};

// ==================== 高德 API infocode 映射 ====================

export const AMAP_INFOCODE_MAP = {
    // ---- 成功 ----
    10000: '请求成功',

    // ---- 用户认证类 ----
    10001: 'API Key 不正确或已过期',
    10002: '服务未开通或已欠费',
    10003: '日调用量已超限',
    10004: '并发量超出限制',
    10005: 'IP 白名单限制',
    10006: 'API Key 被禁用',
    10007: '签名未通过验证',
    10008: 'API Key 类型与服务不匹配',
    10009: '请求协议必须为 HTTPS',
    10010: 'API Key 已过期',
    10011: 'API Key 与绑定域名不一致',
    10012: 'API Key 与绑定 IP 不一致',
    10013: 'API Key 与绑定包名不一致',
    10014: 'API Key 被管理员禁用',
    10015: '服务请求被拒绝',
    10016: 'API Key 权限不足',
    10017: 'API Key 未授权该接口',
    10018: 'API Key 未授权该服务',
    10019: 'API Key 超出使用限制',
    10020: 'API Key 不存在或已被删除',
    10021: 'API Key 类型不匹配',
    10022: '服务不可用',
    10026: 'API Key 已停用',
    10027: 'API Key 状态异常',
    10028: 'API Key 已被限制',
    10029: 'API Key 绑定信息不完整',
    10030: 'API Key 认证信息错误',
    10031: 'API Key 已失效',
    10032: 'API Key 绑定服务不匹配',
    10033: 'API Key 未通过安全验证',
    10034: 'API Key 已达到限制',
    10035: 'API Key 已被暂停',
    10036: 'API Key 授权范围受限',
    10037: 'API Key 已过有效期',
    10038: 'API Key 绑定平台不匹配',
    10039: 'API Key 权限配置错误',
    10040: 'API Key 已被撤销',
    10041: 'API Key 认证服务异常',
    10042: 'API Key 安全校验失败',
    10043: 'API Key 使用规则变更',
    10044: 'API Key 请求频率超限',

    // ---- 请求参数类 ----
    20000: '请求参数非法',
    20001: '缺少必填参数',
    20002: '参数值不合法',
    20003: '参数类型错误',
    20800: '查询区域过大',
    20801: '查询过于频繁',
    20802: '查询结果为空',
    20803: '查询超时',

    // ---- 服务端类 ----
    30000: '服务内部错误',
    30001: '服务维护中',
};

// ==================== 辅助函数 ====================

/**
 * 根据 HTTP 状态码获取中文描述
 * 优先使用自定义映射，未知码返回通用描述
 *
 * @param {number} statusCode - HTTP 状态码
 * @returns {string} 中文描述
 */
export function getHttpStatusMessage(statusCode) {
    const code = Number(statusCode);
    if (HTTP_STATUS_MAP[code]) {
        return HTTP_STATUS_MAP[code];
    }
    if (code >= 100 && code < 200) return '信息响应';
    if (code >= 200 && code < 300) return '成功';
    if (code >= 300 && code < 400) return '重定向';
    if (code >= 400 && code < 500) return '客户端错误';
    if (code >= 500 && code < 600) return '服务器错误';
    return `未知状态码 (${code})`;
}

/**
 * 根据高德 infocode 获取中文描述
 *
 * @param {string|number} infocode - 高德 API infocode
 * @returns {string} 中文描述
 */
export function getAmapErrorMessage(infocode) {
    const code = String(infocode).trim();
    return AMAP_INFOCODE_MAP[code] || `未知高德错误码 (${code})`;
}

/**
 * 错误分类
 *
 * @param {number} statusCode - HTTP 状态码
 * @returns {'info'|'success'|'redirect'|'client_error'|'server_error'|'unknown'}
 */
export function classifyHttpStatus(statusCode) {
    const code = Number(statusCode);
    if (code >= 100 && code < 200) return 'info';
    if (code >= 200 && code < 300) return 'success';
    if (code >= 300 && code < 400) return 'redirect';
    if (code >= 400 && code < 500) return 'client_error';
    if (code >= 500 && code < 600) return 'server_error';
    return 'unknown';
}

/**
 * 判断是否为客户端错误（4xx）
 */
export function isClientError(statusCode) {
    return Number(statusCode) >= 400 && Number(statusCode) < 500;
}

/**
 * 判断是否为服务端错误（5xx）
 */
export function isServerError(statusCode) {
    return Number(statusCode) >= 500 && Number(statusCode) < 600;
}

/**
 * 判断该错误是否值得重试（超时、限流、服务端临时故障）
 *
 * @param {number} statusCode - HTTP 状态码
 * @returns {boolean}
 */
export function isRetryable(statusCode) {
    const code = Number(statusCode);
    return [408, 429, 500, 502, 503, 504].includes(code);
}

/**
 * 根据 HTTP 状态码生成面向用户的完整错误提示
 * 适用于拦截器和 API 模块统一调用
 *
 * @param {number}   statusCode     - HTTP 状态码
 * @param {string}   [detail]       - 后端返回的原始 detail/message
 * @param {object}   [options]      - 可选项
 * @param {string}   [options.endpoint] - 请求路径（附加到提示中便于排查）
 * @returns {string} 用户可读的错误消息
 */
export function buildHttpErrorMessage(statusCode, detail, options = {}) {
    const baseMessage = getHttpStatusMessage(statusCode);

    // 优先使用后端返回的 detail，它通常更具体
    let msg = (typeof detail === 'string' && detail.trim()) ? detail.trim() : baseMessage;

    // 附加端点信息便于前端定位
    if (options.endpoint) {
        msg += ` [${options.endpoint}]`;
    }

    return msg;
}
