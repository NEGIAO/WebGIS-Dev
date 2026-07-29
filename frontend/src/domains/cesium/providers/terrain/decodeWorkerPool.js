/**
 * decodeWorkerPool.js
 * 地形瓦片解码通用 Worker 池（ArcGIS LERC / 天地图 zlib 共用）
 *
 * 设计（与 V3.4.25 LercWorkerPool 同构，抽出为共享模块）：
 * - round-robin 派发，id 关联请求，双向 Transferable 零拷贝；
 * - Worker 创建失败或运行期 onerror：拒绝全部挂起请求并永久标记不可用，
 *   调用方回退各自的主线程解码路径（最坏情况等于旧行为）；
 * - 池随应用生命周期复用（调用方以模块级单例持有），地形反复切换不重复建 Worker。
 */

export class DecodeWorkerPool {
    /**
     * @param {() => Worker} workerFactory - 创建 Worker 的工厂（如 () => new Worker(new URL(...))）
     * @param {number} [size=2] - Worker 数量；解码为短任务，2 个足以吞下瓦片风暴
     * @param {string} [label='terrain-decode'] - 日志标识
     */
    constructor(workerFactory, size = 2, label = 'terrain-decode') {
        this._factory = workerFactory;
        this._size = Math.max(1, size | 0);
        this._label = label;
        /** @type {Worker[] | null} null = 永久失效，调用方回退主线程路径 */
        this._workers = [];
        this._pending = new Map();
        this._next = 0;
        this._id = 0;
    }

    /** Worker 是否可用（惰性创建） */
    available() {
        if (this._workers === null) return false;
        if (this._workers.length > 0) return true;
        try {
            for (let i = 0; i < this._size; i++) {
                const worker = this._factory();
                worker.onmessage = (e) => this._onMessage(e.data);
                worker.onerror = (e) => this._failAll(e?.message || e);
                this._workers.push(worker);
            }
            return true;
        } catch (err) {
            this._failAll(err);
            return false;
        }
    }

    /** Worker 失效：拒绝全部挂起请求，终止并永久标记不可用 */
    _failAll(reason) {
        console.warn(`[${this._label}] worker 失效，回退主线程解码：`, reason);
        const pending = Array.from(this._pending.values());
        this._pending.clear();
        for (const { reject } of pending) {
            reject(new Error(`${this._label} worker failed`));
        }
        this.destroy();
        this._workers = null;
    }

    _onMessage(data) {
        if (!data || !this._pending.has(data.id)) return;
        const { resolve, reject } = this._pending.get(data.id);
        this._pending.delete(data.id);
        if (data.ok) resolve(data);
        else reject(new Error(data.error || `${this._label} decode failed`));
    }

    /**
     * 提交一个解码任务。
     * @param {Record<string, unknown>} payload - 传给 worker 的数据（含 Transferable 字段）
     * @param {Transferable[]} [transfer] - 需要转移所有权的对象列表
     * @returns {Promise<Record<string, unknown>>} worker 返回的数据（ok=true 已剥离）
     */
    submit(payload, transfer = []) {
        return new Promise((resolve, reject) => {
            const id = ++this._id;
            this._pending.set(id, { resolve, reject });
            const worker = this._workers[this._next];
            this._next = (this._next + 1) % this._workers.length;
            worker.postMessage({ ...payload, id }, transfer);
        });
    }

    destroy() {
        if (Array.isArray(this._workers)) {
            for (const w of this._workers) {
                try { w.terminate(); } catch { /* ignore */ }
            }
        }
        if (this._workers !== null) this._workers = [];
        this._pending.clear();
    }
}
