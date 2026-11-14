/**
 * useRequestToken —— 请求竞态令牌
 * 功能：为同一数据源的连续异步请求生成递增序号；响应返回时比对序号，
 *      过期响应（翻页 / 搜索 / 切换筛选导致的竞态）静默丢弃，避免旧数据覆盖新数据。
 * 参数：无
 * 返回：{ next, isCurrent } —— next 取得本次请求令牌，isCurrent 判定令牌是否仍为最新
 * 核心逻辑：闭包持有单递增计数器，不依赖任何响应式系统，可在任意上下文调用。
 */
export function useRequestToken() {
	let seq = 0;

	/** 取得一个新的请求令牌（单调递增） */
	function next() {
		return ++seq;
	}

	/** 判定令牌是否仍为最新；false 表示该响应已过期 */
	function isCurrent(token: number) {
		return token === seq;
	}

	return { next, isCurrent };
}
