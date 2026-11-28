/** 统一底图目录公共入口。 */

// V3.7.16：显式触发图层定义登记，避免调用方只 import 本 barrel 时 registry
// 尚未收到 definitions（原依赖 OL 侧间接 import，加载顺序变化时元数据会静默退化）。
import '../definitions';

export * from './types';
export * from './taxonomy';
export * from './layers';
export * from './registry';
