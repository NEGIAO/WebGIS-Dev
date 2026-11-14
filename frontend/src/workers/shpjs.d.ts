/**
 * shpjs 第三方模块类型垫片
 *
 * shpjs@6.2.0 未随包提供 .d.ts，仓库也未安装 @types/shpjs。
 * 此处只声明 `workers/shpWorker.ts` 实际使用的调用形态，避免 IDE 侧出现
 * TS7016（noImplicitAny 开启时）或把解析结果退化成裸 any。
 */

declare module 'shpjs' {
  /** GeoJSON 对象；本 Worker 只读取 type / features，其余字段按不透明数据透传 */
  export type ShpGeoJsonObject = {
    type?: string;
    features?: unknown[];
    [key: string]: unknown;
  };

  /** zip 内含多个 shapefile 时返回对象数组，单个 shapefile 返回单个对象 */
  export type ShpParseResult = ShpGeoJsonObject | ShpGeoJsonObject[];

  const shp: (input: ArrayBuffer | string) => Promise<ShpParseResult>;
  export default shp;
}
