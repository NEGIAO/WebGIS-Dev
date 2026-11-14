"""跨域依赖审计：统计 domains/{common,ol,cesium} 之间的越界 import。

规则来源 Docs/Refactor.md §3：
  ol -> common      允许
  cesium -> common  允许
  common -> ol      禁止
  common -> cesium  禁止
  ol -> cesium      禁止
  cesium -> ol      禁止
"""
import os
import re
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
PATTERN = re.compile(r"from\s+'([^']+)'")
KEYS = ['common->ol', 'common->cesium', 'cesium->ol', 'ol->cesium']

buckets = {k: [] for k in KEYS}

for root, _dirs, files in os.walk(SRC):
    for name in files:
        if not name.endswith(('.ts', '.js', '.vue')):
            continue
        path = os.path.join(root, name)
        norm = path.replace(os.sep, '/')
        domain = None
        if '/domains/common/' in norm:
            domain = 'common'
        elif '/domains/ol/' in norm:
            domain = 'ol'
        elif '/domains/cesium/' in norm:
            domain = 'cesium'
        if not domain:
            continue
        with open(path, encoding='utf-8', errors='ignore') as fh:
            text = fh.read()
        for match in PATTERN.finditer(text):
            spec = match.group(1)
            if spec.startswith('@ol/'):
                target = 'ol'
            elif spec.startswith('@cesium-domain/'):
                target = 'cesium'
            elif spec.startswith('@common/'):
                target = 'common'
            else:
                continue
            if target == domain:
                continue
            key = '%s->%s' % (domain, target)
            if key in buckets:
                buckets[key].append((norm, spec))

total = 0
for key in KEYS:
    items = buckets[key]
    print('%s: %d' % (key, len(items)))
    for path, spec in items:
        print('    %s -> %s' % (path, spec))
    total += len(items)
print('TOTAL: %d' % total)
