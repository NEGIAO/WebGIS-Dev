# 2026-08-28 修复大气高度渐隐前提依赖缺失

**日期和时间**：2026-08-28  
**修改内容**：修复地面大气高度渐隐控件在地面大气关闭时仍可操作的 Bug  
**修改原因**：`groundAtmosphereAutoFade`（大气高度渐隐）功能依赖于 `showGroundAtmosphere`（地面大气开关）处于开启状态，但 UI 控件未设置此依赖关系，导致用户在关闭地面大气后仍可以操作高度渐隐开关和高度参数滑杆，产生逻辑矛盾。  
**影响范围**：大气模块 UI 控件（atmosphereModule.js）  
**优化解决方案**：

### 问题分析

依赖链：
```
showGroundAtmosphere (父级：地面大气开关)
  └── groundAtmosphereAutoFade (子级：大气高度渐隐开关)
        └── groundAtmosphereFadeLowHeight (孙级：渐隐下限高度)
        └── groundAtmosphereFadeHighHeight (孙级：渐隐上限高度)
```

**Bug 表现：**
1. `groundAtmosphereAutoFade` toggle 没有 `disabled` 属性 → 地面大气关闭时仍可切换
2. `groundAtmosphereFadeLowHeight` / `groundAtmosphereFadeHighHeight` 仅检查 `groundAtmosphereAutoFade` → 未检查父级 `showGroundAtmosphere`

### 修复内容

1. `groundAtmosphereAutoFade` 开关：添加 `disabled: params.showGroundAtmosphere === false`
2. `groundAtmosphereFadeLowHeight`：`disabled` 改为 `params.showGroundAtmosphere === false || params.groundAtmosphereAutoFade === false`
3. `groundAtmosphereFadeHighHeight`：`disabled` 改为 `params.showGroundAtmosphere === false || params.groundAtmosphereAutoFade === false`

**性能指标**：无（UI 逻辑修正，不影响渲染性能）  
**测试方案**：
1. 打开工具面板 → 大气模块
2. 关闭「地面大气」开关 → 验证「大气高度渐隐」开关变为禁用状态（灰色不可点击）
3. 验证「渐隐下限高度」和「渐隐上限高度」滑杆也变为禁用状态
4. 重新开启「地面大气」→ 所有子控件恢复可用

**修改的文件路径**：
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\cesium\composables\toolModules\atmosphereModule.js`
