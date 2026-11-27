/**
 * 跨平台 Vite 构建：在 Node 进程内设置 VITE_BASE_URL，避免 Windows cmd
 * 不支持 `VITE_BASE_URL=... vite build` 内联环境变量语法。
 */
import { spawnSync } from 'node:child_process';

const [base = '/WebGIS-Dev/', outDir = 'dist-webgis-dev'] = process.argv.slice(2);
process.env.VITE_BASE_URL = base;

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['vite', 'build', '--outDir', outDir], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
