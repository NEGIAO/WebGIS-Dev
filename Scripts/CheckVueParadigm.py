"""视图层范式完整性校验（X.vue / X.ts 分离）。

校验对象：含单行 `<script lang="ts" src="./X.ts">` 的组件（即「已范式化」组件）。

三项检查：
  1. `.vue` 内不得出现第二段 `<script>`、不得出现 `defineProps/defineEmits/defineExpose` 宏；
  2. `.vue` 内不得出现任何 `import`（类型 / 常量 / 子组件一律在 `.ts` 中 import）；
  3. 模板中被调用的函数名，必须在 `X.ts` 中存在同名标识符
     （`<script setup>` 的自动暴露在范式下不再存在，遗漏只在浏览器运行时炸）。

用法：
    python Scripts/CheckVueParadigm.py frontend/src
退出码：0 全部通过；1 存在违规。
"""
import os
import re
import sys

SCRIPT_SRC = re.compile(r'<script[^>]*src="\./([^"]+)"[^>]*>\s*</script>')
TEMPLATE_END = re.compile(r'</template>')
BARE_EMIT = re.compile(r'(?<!\$)\bemit\(')
CALL = re.compile(r'(?<![\w.$])([A-Za-z_$][\w$]*)\s*\(')

# 模板里出现但不需要在 .ts 中定义的调用（语言内建 / 宏 / 渲染辅助）
BUILTIN = {
    'Math', 'JSON', 'Number', 'String', 'Boolean', 'Array', 'Object', 'Date', 'Set', 'Map',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'decodeURI', 'decodeURIComponent',
    'encodeURI', 'encodeURIComponent', 'Intl', 'Promise', 'RegExp', 'Error',
}


def iter_paradigm_components(root):
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            if not name.endswith('.vue'):
                continue
            path = os.path.join(dirpath, name)
            with open(path, encoding='utf-8', errors='ignore') as fh:
                text = fh.read()
            match = SCRIPT_SRC.search(text)
            if not match:
                continue
            yield path, text, match


def check(root):
    problems = []
    count = 0
    for vue_path, text, match in iter_paradigm_components(root):
        count += 1
        rel = vue_path.replace(os.sep, '/')
        ts_path = os.path.join(os.path.dirname(vue_path), match.group(1))
        if not os.path.exists(ts_path):
            problems.append('%s: 引用的实例层不存在 %s' % (rel, match.group(1)))
            continue
        with open(ts_path, encoding='utf-8') as fh:
            ts_text = fh.read()

        # 1. 不得有第二段 <script>，不得有编译宏
        script_tags = len(re.findall(r'<script', text))
        if script_tags != 1:
            problems.append('%s: 存在 %d 段 <script>，范式下只允许 1 段 src 引用' % (rel, script_tags))
        for macro in ('defineProps', 'defineEmits', 'defineExpose', 'defineModel', 'defineSlots'):
            if re.search(r'\b%s\b' % macro, text):
                problems.append('%s: 视图层出现编译宏 %s（应移入 .ts 的运行时声明）' % (rel, macro))

        # 2. 视图层不得 import，且 <style> 必须内联在 .vue 内（禁止外置 <style src="...">）
        if re.search(r'^\s*import\s', text, re.M):
            problems.append('%s: 视图层出现 import（应全部移入 .ts）' % rel)
        if re.search(r'<style[^>]*\bsrc\s*=', text):
            problems.append('%s: 视图层禁止使用 <style src="..."> 外置样式（.vue 承担 DOM 组织与样式内聚，仅剥离 <script> 到 .ts）' % rel)

        # 2.5 实例层不得暴露 _ / $ 前缀的公有属性（Vue 3 保留前缀），且公有方法须为箭头属性而非原型方法
        cls_m = re.search(r'export\s+class\s+Instance\b(.*)$', ts_text, re.S)
        if cls_m:
            cls_body = cls_m.group(1)
            for res_m in re.finditer(r'^\s*public\s+(?:readonly\s+)?([_$][A-Za-z0-9_$]*)', cls_body, re.M):
                problems.append('%s: 实例层暴露了 Vue 保留前缀属性 %s' % (rel, res_m.group(1)))
            for proto_m in re.finditer(r'^\s*public\s+(?:async\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^=]*?\)\s*(?::\s*[^{=]+)?\{', cls_body, re.M):
                problems.append('%s: 实例层公有方法 %s() 定义在原型上（Vue setupState 仅识别自有属性，请改为箭头函数属性）' % (rel, proto_m.group(1)))

        # 3. 模板调用的函数必须在 .ts 中存在
        template = text[: text.find('<script')] if '<script' in text else text
        # 去掉 HTML 注释、属性值（CSS / 文案里也有括号）、纯文本节点，只留标签与插值表达式
        template = re.sub(r'<!--.*?-->', ' ', template, flags=re.S)
        template = re.sub(r'=\s*"[^"]*"', '="" ', template)
        template = re.sub(r"=\s*'[^']*'", "='' ", template)
        template = re.sub(r'>[^<>{}]+<', '><', template)
        bare_emit = BARE_EMIT.findall(template)
        if bare_emit and 'public emit!' not in ts_text:
            problems.append('%s: 模板裸 emit %d 次但实例未暴露 public emit!' % (rel, len(bare_emit)))
        # 能力层经 Object.assign 注入的成员在 .ts 中不出现，需一并扫描其本地 import
        corpus = ts_text
        for spec in re.findall(r"from\s+'(\.[^']+)'", ts_text):
            candidate = os.path.normpath(os.path.join(os.path.dirname(ts_path), spec))
            for ext in ('.ts', '.js', ''):
                if os.path.isfile(candidate + ext):
                    with open(candidate + ext, encoding='utf-8') as fh:
                        corpus += '\n' + fh.read()
                    break

        missing = set()
        for name in set(CALL.findall(template)):
            if name in BUILTIN or name.startswith('$'):
                continue
            if not re.search(r'(?<![\w$])%s(?![\w$])' % re.escape(name), corpus):
                missing.add(name)
        if missing:
            problems.append('%s: 模板调用但 .ts 中未见：%s' % (rel, ', '.join(sorted(missing))))

    print('范式化组件：%d 个' % count)
    if problems:
        print('发现问题 %d 项：' % len(problems))
        for item in problems:
            print('  ✗ %s' % item)
        return 1
    print('全部通过')
    return 0


if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else 'frontend/src'
    sys.exit(check(target))
