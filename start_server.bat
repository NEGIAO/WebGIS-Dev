@echo off
chcp 65001 >nul
title WebGIS Vue3 开发服务器

:: 切换到项目目录
D:
cd /d D:\Dev\GitHub\WebGIS_henu_trials_5_28_vue3

echo ========================================
echo     WebGIS Vue3 本地开发服务器
echo ========================================
echo 当前目录: %cd%
echo.

:: 检查 node_modules 是否存在
if not exist "node_modules" (
    echo [提示] 未检测到 node_modules，正在安装依赖...
    echo.
    call npm install
    echo.
)

echo [启动] 正在启动开发服务器...
echo [提示] 服务器启动后，按 Ctrl+C 可停止服务器
echo.

:: 启动 Vite 开发服务器
call npm run dev

pause
