// scripts/ensure-dev-port.mjs
// `npm run dev` 的前置自检（package.json -> predev 自动触发）。
//
// 背景：Windows 下关掉 git bash 窗口 often 并不会杀掉 node 子进程，
// 上次的 Vite 会以僵尸形态继续占着 5173；新起的实例会被挤到 5174+，
// 而手机书签/局域网调试都写死 5173，于是出现“重启一次就连不上”。
//
// 本脚本保证每次 dev 都落在 5173：
//  1. 5173 被本机 node 进程占用 -> 视为没退干净的僵尸 dev server，kill 后再起；
//  2. 5173 被非 node 进程占用 -> 不敢乱动，直接报错退出（strictPort 也会 fail-fast）；
//  3. 本机没有 192.168.137.x 网卡 -> 电脑热点没开，只警告不阻断（本机 localhost 调试不受影响）。
// Docker 容器内运行时跳过第 3 步（容器网卡本来就没有热点 IP）。
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

const PORT = 5173;
const HOTSPOT_PREFIX = '192.168.137.';

// ---- 找出正在 LISTEN 该端口的 PID（排除自己） ----
function findListenerPids(port) {
    const pids = new Set();
    try {
        if (process.platform === 'win32') {
            const out = execSync('netstat -ano -p TCP', { encoding: 'utf8', windowsHide: true });
            const re = new RegExp(
                `^\\s*TCP\\s+\\S+:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`,
                'gim',
            );
            for (const m of out.matchAll(re)) {
                const pid = Number(m[1]);
                if (pid > 0 && pid !== process.pid) pids.add(pid);
            }
        } else {
            const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { encoding: 'utf8' });
            for (const line of out.split('\n')) {
                const pid = Number(line.trim());
                if (pid > 0 && pid !== process.pid) pids.add(pid);
            }
        }
    } catch {
        // 查不到 = 没占用（lsof 无结果时 exit 1，正好落到这里）
    }
    return [...pids];
}

function processImage(pid) {
    try {
        if (process.platform === 'win32') {
            const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
                encoding: 'utf8',
                windowsHide: true,
            });
            const m = out.match(/^"([^"]+)"/m);
            return m ? m[1] : '';
        }
        return execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' }).trim();
    } catch {
        return '';
    }
}

function killTree(pid) {
    if (process.platform === 'win32') {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', windowsHide: true });
    } else {
        process.kill(pid, 'SIGKILL');
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasHotspotIp() {
    for (const addrs of Object.values(os.networkInterfaces())) {
        for (const a of addrs || []) {
            if (a.family === 'IPv4' && !a.internal && a.address.startsWith(HOTSPOT_PREFIX)) {
                return true;
            }
        }
    }
    return false;
}

const inDocker = fs.existsSync('/.dockerenv');

// ---- 1/2. 端口占用处理 ----
const occupants = findListenerPids(PORT);
for (const pid of occupants) {
    const image = processImage(pid).toLowerCase();
    if (image.includes('node')) {
        console.log(`[predev] 发现僵尸 dev server (PID=${pid}, ${image}) 占用 ${PORT}，正在清理…`);
        try {
            killTree(pid);
        } catch (err) {
            console.error(`[predev] 无法结束 PID=${pid}：${err.message}`);
            console.error(`[predev] 请手动结束该进程后重试（任务管理器 / taskkill /F /PID ${pid}）`);
            process.exit(1);
        }
    } else if (image) {
        console.error(`[predev] 端口 ${PORT} 被非 node 进程占用（PID=${pid}, ${image}），不敢自动结束。`);
        console.error('[predev] 请手动释放该端口后重试，Vite 已设 strictPort，不会自动换端口。');
        process.exit(1);
    } else {
        console.error(`[predev] 端口 ${PORT} 被未知进程（PID=${pid}）占用且无法识别，请手动处理后重试。`);
        process.exit(1);
    }
}

// 等端口真正释放（kill 是异步的），最多等约 6 秒
let stillBusy = occupants.length > 0;
for (let i = 0; i < 12 && stillBusy; i++) {
    await sleep(500);
    stillBusy = findListenerPids(PORT).length > 0;
}
if (stillBusy) {
    console.error(`[predev] 端口 ${PORT} 仍被占用，放弃启动。请手动释放后重试。`);
    process.exit(1);
}
console.log(`[predev] 端口 ${PORT} 就绪（手机/平板请用热点 IP :${PORT} 访问）`);

// ---- 3. 热点提示（只警告，不阻断） ----
if (!inDocker && !hasHotspotIp()) {
    console.warn(
        `[predev] [WARN] 未检测到电脑热点网段（${HOTSPOT_PREFIX}x）：手机将连不上 :${PORT}。`,
    );
    console.warn('[predev] [WARN] 请到 Windows 设置里打开“移动热点”，并让手机连上该热点。');
}
