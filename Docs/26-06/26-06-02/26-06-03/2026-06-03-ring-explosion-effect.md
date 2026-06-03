# 2026-06-03 圆环闭合粒子爆炸特效

## 日期和时间
2026-06-03 15:30

## 修改内容
新增 Apple Watch 风格圆环闭合粒子爆炸特效（`ring-explosion`），集成到 MagicCursor 特效系统中。

## 修改原因
用户需要在数据加载完成或目标达成时提供视觉庆祝反馈。现有特效系统（流体、引力、波浪等）都是持续性效果，缺少事件触发型特效。参考 Apple Watch 运动目标达成时的圆环闭合粒子爆炸效果，实现类似的惊艳视觉反馈。

## 影响范围
- `composables/Magic/` - 新增特效逻辑模块
- `MagicCursor.vue` - 特效容器组件，新增 ring-explosion 支持和 defineExpose
- `HomeView.vue` - 主视图，新增 template ref 和控制函数
- `TopBar.vue` - 特效菜单，新增圆环爆破选项

## 优化解决方案

### 问题分析
1. 缺少事件驱动的粒子爆炸特效
2. 现有特效系统仅支持持续性效果
3. 需要与进度/完成状态联动的特效机制

### 解决方案
新增 `useRingExplosion` composable，实现两阶段粒子爆炸效果：

#### 技术实现

**1. 数据驱动粒子池**
- 使用 Float32Array 存储 256 个粒子的数据（位置、速度、生命、大小、色相）
- Uint8Array 存储活跃状态，优化内存访问
- 零 GC 压力，纯数据操作

**2. 两阶段动画**
- **蓄力阶段（95%-99%）**：在圆环终点持续喷射 3 个/帧的微弱火花
- **爆发阶段（100%）**：瞬间爆发出 150-200 个密集粒子

**3. 物理模拟**
- 放射状角度随机分布
- 初始速度：200-600 px/s
- 摩擦力：0.98/帧
- 重力：200 px/s²
- 生命衰减：0.6-1.4 秒

**4. 视觉效果**
- **拉伸线条**：根据速度方向使用 `lineTo` 绘制拉长线条，形成"火星溅射"动感
- **发光叠加**：`globalCompositeOperation = 'lighter'` 实现粒子重叠处强发光
- **光晕效果**：每个粒子底层绘制透明光晕圆
- **颜色系统**：HSL 热粉色→红橙色系（hue 330-360/0-30）

**5. 圆环终点坐标计算**
```javascript
endAngle = -Math.PI / 2 + (2 * Math.PI * progress)
endX = cx + radius * Math.cos(endAngle)
endY = cy + radius * Math.sin(endAngle)
```

**6. 性能优化**
- `requestAnimationFrame` 驱动动画循环
- 粒子全部消失后自动停止 RAF，避免内存泄漏
- 残影衰减率 0.2，平衡视觉效果和性能
- 单帧最大时间步长 50ms，防止跳帧

### API 设计

**composable 返回接口：**
```javascript
{
    init,          // 标准特效接口
    destroy,       // 标准特效接口
    step,          // 标准特效接口
    startCharge,   // 开始蓄力阶段
    triggerBurst,  // 触发爆发
    stop,          // 停止所有效果
    updateRing,    // 更新圆环参数
}
```

**父组件调用方式：**
```javascript
// 开始蓄力
magicCursorRef.value.updateRing({ cx, cy, radius, progress: 0.96 });
magicCursorRef.value.startCharge();

// 触发爆发
magicCursorRef.value.triggerBurst();
```

## 性能指标
- **内存占用**：7 个 Float32Array × 256 元素 = ~7KB
- **每帧绘制调用**：200 粒子 × 2（光晕 + 线条）= 400 次
- **自动停止**：粒子消失后停止 RAF，避免内存泄漏
- **对象池复用**：无 GC 压力，数据驱动设计

## 测试方案
1. **功能测试**：点击"圆环爆破"菜单项，验证蓄力火花和爆发粒子效果
2. **性能测试**：监控 FPS，确保 200 粒子下保持 60fps
3. **边界测试**：快速重复触发、窗口 resize、特效切换
4. **集成测试**：验证与其他特效（流体、引力等）的切换正常

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\Magic\useRingExplosion.js`（新建）
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Shell\MagicCursor.vue`（修改）
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\HomeView.vue`（修改）
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Shell\TopBar.vue`（修改）

---

## 使用示例

### 1. 通过菜单触发（已集成）
点击顶栏"屏幕特效" → "圆环爆破"即可激活。

### 2. 通过代码控制（供其他组件调用）
```javascript
// 在 HomeView 或其他组件中
const magicCursorRef = ref(null);

// 开始蓄力（进度 95%-99% 时调用）
function onProgressUpdate(progress) {
    if (progress >= 0.95 && progress < 1.0) {
        magicCursorRef.value?.updateRing({
            cx: window.innerWidth / 2,
            cy: window.innerHeight / 2,
            radius: 100,
            progress: progress
        });
        magicCursorRef.value?.startCharge();
    }
}

// 触发爆发（进度 100% 时调用）
function onComplete() {
    magicCursorRef.value?.triggerBurst();
}
```

### 3. 在 Template 中使用
```vue
<MagicCursor
    ref="magicCursorRef"
    :active="isMagicMode"
    :effect-name="'ring-explosion'"
/>
```
