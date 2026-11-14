"""把 .vue 的 <style> 块外置到同级 styles/ 目录，并改写为 src 引用。

用法：
    python Scripts/ExtractVueStyles.py frontend/src/app/LandingView.vue [...]

规则：
  - 每个 <style ...> 块生成一个 styles/<组件名>[.global].scss 文件；
  - 无 scoped 的块命名加 `.global` 后缀，保持其全局作用域语义；
  - 原块替换为 `<style [scoped] lang="scss" src="./styles/<name>.scss"></style>`；
  - 幂等：已是 src 引用的块跳过；
  - 依赖前提：样式块内不得出现相对路径 @use/@import（外置会改变解析基准）。
"""
import os
import re
import sys

STYLE_BLOCK = re.compile(r'<style([^>]*)>(.*?)</style>', re.S)


def extract(vue_path: str) -> int:
    with open(vue_path, encoding='utf-8') as fh:
        source = fh.read()

    if 'src="./styles/' in source:
        print('skip (already external): %s' % vue_path)
        return 0

    blocks = list(STYLE_BLOCK.finditer(source))
    if not blocks:
        print('skip (no style block): %s' % vue_path)
        return 0

    base_dir = os.path.dirname(vue_path)
    name = os.path.splitext(os.path.basename(vue_path))[0]
    styles_dir = os.path.join(base_dir, 'styles')
    os.makedirs(styles_dir, exist_ok=True)

    # 从后往前替换，避免偏移失效
    out = source
    scoped_index = 0
    for match in reversed(blocks):
        attrs = match.group(1) or ''
        body = match.group(2)
        if 'src=' in attrs:
            continue
        scoped = 'scoped' in attrs
        if scoped:
            scoped_index += 1
            suffix = '' if len([b for b in blocks if 'scoped' in (b.group(1) or '')]) == 1 else '.%d' % scoped_index
            file_name = '%s%s.scss' % (name, suffix)
            head = '<style scoped lang="scss" src="./styles/%s"></style>' % file_name
        else:
            file_name = '%s.global.scss' % name
            head = '<style lang="scss" src="./styles/%s"></style>' % file_name

        target = os.path.join(styles_dir, file_name)
        body_clean = body.strip('\n')
        with open(target, 'w', encoding='utf-8') as fh:
            fh.write(body_clean + '\n')

        out = out[: match.start()] + head + out[match.end():]
        print('  -> %s (%d lines)' % (target.replace(os.sep, '/'), body_clean.count('\n') + 1))

    with open(vue_path, 'w', encoding='utf-8') as fh:
        fh.write(out)
    print('done: %s' % vue_path)
    return 1


if __name__ == '__main__':
    total = 0
    for path in sys.argv[1:]:
        total += extract(path)
    print('externalized files: %d' % total)
