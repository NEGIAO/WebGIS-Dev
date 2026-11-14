# Vue 组件范式化模板

> 本文件是「视图 / 实例物理分离」范式的**可复制骨架**，供新建与重构时直接取用。
> 规则来源：[`dev-conventions.md`](dev-conventions.md)「分层边界」 · 分析依据：[`2026-11-13-vue-component-refactor-plan.md`](../TODO/2026-11-13-vue-component-refactor-plan.md)
> 适用门槛：有效逻辑行 > 150 的复杂组件。低于此门槛保持 `<script setup>`，不要为范式而范式。

---

## 一、`X.vue` —— 纯视图层

```vue
<!--
功能名称：<组件中文名>
日    期：YYYY/MM/DD
-->
<template>
	<div class="xxx-panel">
		<!-- 直接绑定 X.ts 中 Instance 的 public 字段与 getter -->
		<span>{{ displayName }}</span>
		<button type="button" @click="handleConfirm">确定</button>
	</div>
</template>

<script lang="ts" src="./XxxPanel.ts"></script>

<style scoped lang="scss">
.xxx-panel {
	/* 仅组件样式 */
}
</style>
```

**约束**

- 不写任何 `import`（类型、常量、子组件一律在 `.ts` 中 import）。
- 不写 `defineProps` / `defineEmits` / `defineExpose` —— 三者均由 `.ts` 的运行时声明与 `Instance` public 成员承担。
- 全局弹层（teleport 到 body 的 popper / dropdown）样式需另开一个**非 scoped** `<style>` 块，scoped 选择器够不到。

---

## 二、`X.ts` —— 实例层

```ts
/**
 * 功能名称：<组件中文名>
 * 日    期：YYYY/MM/DD
 */
import { computed, defineComponent, nextTick, onMounted, onUnmounted, ref, watch, type ExtractPropTypes, type PropType, type SetupContext } from 'vue';

// 一、Emits 类型（与运行时数组必须逐项一致，漏改不报错、只静默失效）
type EmitsType = ('change' | 'confirm')[];

// 二、Props 运行时声明（<script src> 下不能用 defineProps 宏）
const propDefine = {
	visible: { type: Boolean, default: false },
	items: { type: Array as PropType<{ id: string; label: string }[]>, default: () => [] },
};

export type XxxPanelProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口（只做桥接）
export default defineComponent({
	name: 'XxxPanel',
	emits: ['change', 'confirm'],
	props: propDefine,
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例：全部业务在此
export class Instance {
	/** 模板可直接消费的响应式字段（public） */
	public displayName = ref('');
	public loading = ref(false);

	/** props 经 getter 透出，模板可直接用同名变量 */
	get visible() {
		return this.props.visible;
	}
	get items() {
		return this.props.items;
	}

	/** 派生状态 */
	public isEmpty = computed(() => this.items.length === 0);

	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private props: XxxPanelProps,
		private ctx: SetupContext<EmitsType>
	) {
		this.init();
	}

	/** 生命周期集中注册于此 */
	private init() {
		onMounted(() => {
			this.displayName.value = '已挂载';
		});
		onUnmounted(() => this.cleanup());
	}

	//#region 事件处理

	/** 确认：通知父组件 */
	public handleConfirm = () => {
		this.ctx.emit('confirm');
	};

	//#endregion

	/** 资源清理：定时器 / 监听器 / 观察者 */
	private cleanup() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}
}
```

**硬性约定**

| 项 | 要求 | 原因 |
|---|---|---|
| 事件处理方法 | 一律用**箭头函数类字段** | 类方法丢失 `this`，传入模板即报错 |
| `props` / `ctx` | `private`，另用 `get` 暴露模板需要的项 | 不暴露内部引用，模板可读 |
| `emits` | 类型别名与运行时数组**两处同步** | 宏不可用，无单一来源 |
| 生命周期 | 全部写进 `private init()` | 避免散落在类体外 |
| 状态归属 | 业务数据进 Pinia，UI 局部态留 `Instance` | 防止「换个容器继续耦合」 |
| 复用逻辑 | 抽 `composables/useXxx.ts`，`Instance` 只调度 | 500–600 行软上限的主要达成手段 |
| 类型导入 | `import { type PropType }` 或 `import type` | `isolatedModules: true` |
| 图标 | `@lucide/vue`，禁 emoji、禁 Element Plus | Force_command §3 |

---

## 三、模板可见性清单（迁移必查，`tsc` 查不到）

`<script setup>` 会把**所有顶层绑定**自动暴露给模板；改成 `defineComponent` + `Instance` 后，模板只能访问**实例的 public 成员**。以下三类最容易漏，且 `tsc` 完全不报错，只在浏览器控制台炸：

| # | 漏项 | 症状 | 修法 |
|---|---|---|---|
| 1 | 模板直接调用 `emit('xxx')` | 点击无反应，控制台 `emit is not a function` | 实例上补 `public emit!: (event: string, ...args: any[]) => void;`，构造函数内 `this.emit = this.ctx.emit;` |
| 2 | 模板调用迁移到纯函数模块的工具（如 `getRowKey(row)`） | `xxx is not a function`，列表 key 全为 undefined | 从工具模块 import 后挂为 public 字段：`public getRowKey = getRowKey;` |
| 3 | 模板消费的能力层返回值（`Object.assign(this, composable)` 注入） | 某块区域空白或值为 undefined | 确认 composable 返回对象的键名与模板变量名**逐字一致**；改名必须同步模板 |
| 4 | **模板直接调用的方法写成原型方法（`public foo() {}`）且内部用 `.value`** | 运行时 `Cannot read properties of undefined (reading 'value')` | 必须写成**箭头函数类字段** `public foo = () => {}`，见下方说明 |

> 模板里写 `$emit('close')` 的**不受影响**——`$emit` 来自组件实例，天然可用。只有裸 `emit(` 才需要显式暴露。

### 为什么方法必须用箭头函数类字段

`setup()` 返回的对象会经 `proxyRefs` 包一层 Proxy，其 `get` 会对 ref 做 `unref`。这带来一个非直觉的后果：

```ts
// 原型方法：从模板调用时 this === render proxy
public getX() {
	return this.centerPoint.value.x;   // ✗ this.centerPoint 已被 unref → 是普通对象
	                                     //   再取 .value 得到 undefined，抛 TypeError
}

// 箭头函数类字段：构造时绑定原始实例
public getX = () => {
	return this.centerPoint.value.x;   // ✓ this 是原始 Instance，.value 正常
};
```

**判定规则**：只要方法**会从模板被调用**，且方法体内出现 `.value`，就必须是箭头字段。
仅被其他类方法调用（`this.init()` 链）的原型方法不受影响，因为那时 `this` 是原始实例。

> 这条同样适用于 `Object.assign(this, composable)` 注入的函数——它们是普通函数、不依赖 `this`，因此安全。

**迁移后自检命令**（在 `frontend/src` 下执行，无输出即通过）：

```bash
python - <<'PY'
import re, os
for b in ['<改成你的组件路径，不含扩展名>']:
    v = open(b + '.vue', encoding='utf-8').read()
    t = open(b + '.ts', encoding='utf-8').read()
    tpl = v[:v.find('<script lang="ts" src=')]
    bare = re.findall(r'(?<!\$)\bemit\(', tpl)
    if bare and 'public emit!' not in t:
        print(f'✗ {os.path.basename(b)}: 模板裸 emit {len(bare)} 次但实例未暴露')
    for fn in set(re.findall(r'(?<![\w.$])([A-Za-z_$][\w$]*)\s*\(', tpl)):
        if fn in {'Math','JSON','Number','String','Boolean','Array','Object','Date'} or fn.startswith('$'):
            continue
        if not re.search(r'(?<![\w$])' + re.escape(fn) + r'(?![\w$])', t):
            print(f'? {os.path.basename(b)}: 模板调用 {fn}() 在 .ts 中未见（可能是 composable 注入或纯文本标签，需人工确认）')
PY
```

> 输出 `?` 的多为 `Object.assign` 注入的 composable 成员（正常）或模板文案里的括号（如 `Model (主模型)`，误报）。**只处理 `✗`**。

---

## 四、`defineExpose` 迁移对照

旧写法（`<script setup>`）：

```ts
defineExpose({ scrollToBottom, resetForm });
```

新写法：把 `scrollToBottom` / `resetForm` 声明为 `Instance` 的 **public** 成员即可，父组件 `ref.value.scrollToBottom()` 行为不变。**不需要**任何显式 expose —— `setup` 返回的实例经 `proxyRefs` 后全部 public 成员均可访问。

> 迁移时必须逐一核对父组件的 `ref.value.xxx` 调用点，方法名保持原样，不得重命名。

---

## 五、物理切分操作规范（`.vue` 改造时）

改造 `.vue` 时唯一的高危动作是「按行号切片」——切错会把模板拦腰截断，且**构建报错的位置往往指向别处**。

### 必须遵守

1. **结束位置取「`<script` 之前最后一个 `</template>`」，不是第一个。**
   模板里常见嵌套的 `<template v-if>` / `<template #slot>`，第一个 `</template>` 是内层块的闭合。用 `[0]` 会截断。
2. **样式取「第一个 `<style` 到文件末尾」**（可能有多段 `<style>`，一并保留）。
3. **改完立刻构建**。`Element is missing end tag` / `Invalid end tag` 是截断的唯一信号，且不会在 `tsc` 里暴露。
4. **改完比对模板行数**：与版本库原文对照，差值应恒为 1（脚本标签前那一行空行）。差值异常即已截断。

### 推荐做法

```python
import subprocess
p = 'frontend/src/domains/.../X.vue'
orig = subprocess.run(['git', 'show', 'HEAD:' + p], capture_output=True, text=True, encoding='utf-8').stdout
L = orig.split('
')
si = next(i for i, l in enumerate(L) if l.startswith('<script'))          # 原 script 行
end = max(i for i, l in enumerate(L[:si]) if l.strip() == '</template>')  # 根闭合标签
sty = next(i for i, l in enumerate(L) if l.startswith('<style'))
out = '
'.join(L[0:end + 1]) + '\n\n<script lang="ts" src="./X.ts"></script>\n\n' + '\n'.join(L[sty:])
```

> 直接基于 `git show` 的原文重建，而不是在已改过的文件上二次切片——这样即使中途切错也能一次复原。

### 已发生的事故

`MapControlsBar.vue` 用 `[0]` 定位，命中嵌套 `<template v-if>` 的闭合，模板从第 69 行被截断、丢失 78 行；构建报 `Element is missing end tag`。已从版本库取回重建，并回溯核查其余同方法切分的 3 个文件均完整。

---

## 六、迁移检查清单（每个组件逐项确认）

- [ ] `props` 名称 / 类型 / 默认值与原实现逐项一致
- [ ] `emits` 事件名与参数个数一致，类型别名与运行时数组同步
- [ ] 模板中引用的每个变量，在 `Instance` 中都有同名 public 成员或 getter
- [ ] 原 `defineExpose` 的成员已改为 public，父组件调用点已验证
- [ ] 模板裸 `emit(` 已暴露（`public emit!` + 构造函数赋值）
- [ ] 模板调用的纯函数（如 `getRowKey`）已挂为 public 字段
- [ ] 模板调用的方法均为箭头函数类字段（原型方法 + `.value` 会在运行时崩）
- [ ] 原顶层 `watch` / `onMounted` / `onUnmounted` 已移入 `init()`
- [ ] 定时器 / 事件监听 / ResizeObserver 在 `cleanup()` 中释放
- [ ] 未新增 `any`（存量 `any` 可保留，不扩大）
- [ ] `npx tsc --noEmit` 无新增错误
- [ ] `npm run build` 通过
