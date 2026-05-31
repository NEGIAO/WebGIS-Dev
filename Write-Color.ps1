# Write-Color.ps1 - Color output helper for LocalDev.bat
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File Write-Color.ps1 <ID> [extra]
# All Chinese messages are defined here, keeping the .bat file pure ASCII.

param(
    [Parameter(Mandatory=$true, Position=0)]
    [int]$Id,

    [Parameter(Position=1)]
    [string]$Extra = ""
)

$messages = @{
    # Title / banners
    100  = @{ C = "Magenta";   T = "====================================================================" }
    101  = @{ C = "Magenta";   T = "  WebGIS 本地开发一键启动脚本 v3.0" }
    102  = @{ C = "Green";     T = "====================================================================" }

    # Step headers
    200  = @{ C = "Magenta";   T = "[第一步] 检查环境依赖..." }
    201  = @{ C = "Magenta";   T = "[第二步] 配置前端环境变量..." }
    202  = @{ C = "Magenta";   T = "[第三步] 启动后端服务 (Docker Compose)..." }
    203  = @{ C = "Magenta";   T = "[第四步] 配置前端项目..." }
    204  = @{ C = "Magenta";   T = "[第五步] 启动前端开发服务 (Vite)..." }
    205  = @{ C = "Magenta";   T = "[第六步] 打开浏览器..." }

    # Success messages
    300  = @{ C = "Green";     T = "  [OK] Node.js $Extra 已安装" }
    301  = @{ C = "Green";     T = "  [OK] npm $Extra 已安装" }
    302  = @{ C = "Green";     T = "  [OK] Docker 已安装" }
    303  = @{ C = "Green";     T = "  [OK] Docker 运行正常" }
    304  = @{ C = "Green";     T = "  [OK] docker compose 可用" }
    305  = @{ C = "Green";     T = "[OK] 环境检查完成" }
    306  = @{ C = "Green";     T = "  [OK] 配置文件已创建: $Extra" }
    307  = @{ C = "Green";     T = "  [OK] 配置文件已存在，跳过创建。" }
    308  = @{ C = "Green";     T = "  [OK] 镜像与 Dockerfile 同步，无需重新构建" }
    309  = @{ C = "Green";     T = "  [OK] 后端容器运行中" }
    310  = @{ C = "Green";     T = "  [OK] 后端服务端口已就绪" }
    311  = @{ C = "Green";     T = "  [OK] 前端依赖已安装" }
    312  = @{ C = "Green";     T = "  [OK] 前端依赖已存在" }
    313  = @{ C = "Green";     T = "  启动完成！" }

    # Error messages
    400  = @{ C = "Red";       T = "[错误] Node.js 未安装！" }
    401  = @{ C = "Red";       T = "[错误] npm 未安装！" }
    402  = @{ C = "Red";       T = "[错误] 未检测到 Docker！" }
    403  = @{ C = "Red";       T = "[错误] Docker 启动失败，请手动启动！" }
    404  = @{ C = "Red";       T = "[错误] docker compose 不可用！" }
    405  = @{ C = "Red";       T = "[错误] 未找到 docker-compose.yml！" }
    406  = @{ C = "Red";       T = "[错误] 后端启动失败！（docker compose up --build 执行失败）" }
    407  = @{ C = "Red";       T = "[错误] 后端启动失败！（docker compose up 执行失败）" }
    408  = @{ C = "Red";       T = "[错误] npm install 失败！" }
    409  = @{ C = "Red";       T = "  [错误] 无法创建配置文件，请检查磁盘权限！" }

    # Warning messages
    500  = @{ C = "Yellow";    T = "[警告] Docker 未启动，尝试自动启动..." }
    501  = @{ C = "Yellow";    T = "  [警告] 未找到前端目录，正在尝试创建..." }
    502  = @{ C = "Yellow";    T = "  [!] 检测到 Dockerfile 已修改（可能有新的环境依赖）" }
    503  = @{ C = "Yellow";    T = "[警告] 容器未完全启动，请检查日志: docker compose logs" }
    504  = @{ C = "Yellow";    T = "[警告] 7860 端口尚未监听（可能仍在启动中）" }
    505  = @{ C = "Yellow";    T = "[重要] 未找到 node_modules，正在安装依赖项..." }

    # Info messages
    600  = @{ C = "Cyan";      T = "  [信息] 未找到本地镜像，将首次构建..." }
    601  = @{ C = "Cyan";      T = "  [信息] 跳过构建，使用现有镜像" }
    602  = @{ C = "Cyan";      T = "  局域网地址: $Extra (用于手机调试)" }
    603  = @{ C = "Cyan";      T = "  是否重新构建镜像? (输入 Y 重新构建 / 其他任意键跳过)" }
    604  = @{ C = "Cyan";      T = "  $Extra" }

    # Dim / detail messages
    700  = @{ C = "DarkGray";  T = "  地址: http://localhost:7860" }
    701  = @{ C = "DarkGray";  T = "  正在等待 Docker 启动（约 15 秒）..." }
    702  = @{ C = "DarkGray";  T = "  正在创建前端环境配置文件..." }
    703  = @{ C = "DarkGray";  T = "  正在检测镜像状态..." }
    704  = @{ C = "DarkGray";  T = "  镜像创建时间: $Extra" }
    705  = @{ C = "DarkGray";  T = "      Dockerfile 修改时间更新，建议重新构建以匹配新环境" }
    706  = @{ C = "DarkGray";  T = "  正在启动后端容器..." }
    707  = @{ C = "DarkGray";  T = "  等待服务初始化..." }
    708  = @{ C = "DarkGray";  T = "  前端地址: http://localhost:5173" }
    709  = @{ C = "DarkGray";  T = "  提示: 按 Ctrl+C 可在前端窗口中停止前端服务" }
    710  = @{ C = "DarkGray";  T = "  提示: 按 Ctrl+C 可停止所有服务" }
    711  = @{ C = "DarkGray";  T = "  功能: Vite 热重载启用（代码改动浏览器自动刷新）" }
    712  = @{ C = "DarkGray";  T = "  功能: 自动重启启用（代码改动自动重启）" }
    713  = @{ C = "DarkGray";  T = "       |" }
    714  = @{ C = "DarkGray";  T = "  后端调用第三方服务 (AMap, TianDiTu 等)" }
    715  = @{ C = "DarkGray";  T = "  返回统一 JSON 数据" }
    716  = @{ C = "DarkGray";  T = "  1. 已打开所有窗口，关闭任意窗口可停止该服务" }
    717  = @{ C = "DarkGray";  T = "  2. 修改前端代码可自动热重载（浏览器自动刷新）" }
    718  = @{ C = "DarkGray";  T = "  3. 修改后端代码可自动重启" }
    719  = @{ C = "DarkGray";  T = "  4. 测试 API: 打开 http://localhost:7860/docs" }
    720  = @{ C = "DarkGray";  T = "  5. 前端调用后端 API 地址: http://localhost:7860" }
    721  = @{ C = "DarkGray";  T = "  - 关闭后端窗口停止后端服务" }
    722  = @{ C = "DarkGray";  T = "  - 关闭前端窗口停止前端服务" }
    723  = @{ C = "DarkGray";  T = "  - 或在任意窗口按 Ctrl+C 并输入 Y 确认" }
    728  = @{ C = "DarkGray";  T = "提示: 按 Ctrl+C 可随时停止脚本 (输入 Y 确认)" }
    729  = @{ C = "DarkGray";  T = "按任意键退出此脚本（不会停止已启动的前端/后端服务）..." }
    730  = @{ C = "DarkGray";  T = "  这可能需要 1-5 分钟，请耐心等待..." }
    731  = @{ C = "DarkGray";  T = "  请检查网络连接或手动运行: cd frontend && npm install" }
    732  = @{ C = "DarkGray";  T = "       下载地址: https://nodejs.org/" }
    733  = @{ C = "DarkGray";  T = "       请安装 Docker Desktop: https://www.docker.com/products/docker-desktop/" }
    734  = @{ C = "DarkGray";  T = "       请确认后端目录结构是否正确" }

    # White section headers
    800  = @{ C = "White";     T = "前端 (Frontend):" }
    801  = @{ C = "White";     T = "后端 (Backend):" }
    802  = @{ C = "White";     T = "数据流:" }
    803  = @{ C = "White";     T = "快速参考:" }
    804  = @{ C = "White";     T = "停止服务:" }

    # Info (cyan) for addresses
    900  = @{ C = "Cyan";      T = "  地址: http://localhost:5173" }
    901  = @{ C = "Cyan";      T = "  API:  http://localhost:7860" }
    902  = @{ C = "Cyan";      T = "  API参考文档: http://localhost:7860/docs (Swagger UI)" }
    903  = @{ C = "Cyan";      T = "  前端 (http://localhost:5173)" }
    904  = @{ C = "Cyan";      T = "  调用后端 API (http://localhost:7860)" }
}

if ($messages.ContainsKey($Id)) {
    $msg = $messages[$Id]
    Write-Host $msg.T -ForegroundColor $msg.C
} else {
    Write-Host "[Unknown message ID: $Id]" -ForegroundColor Red
}
