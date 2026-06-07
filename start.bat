@echo off
chcp 65001 >nul
title 2026世界杯 AI预言家对决

echo.
echo ╔══════════════════════════════════════════════════╗
echo ║     🏆 2026世界杯 AI预言家对决                    ║
echo ║     Claude vs GPT vs Gemini vs DeepSeek vs 豆包   ║
echo ╚══════════════════════════════════════════════════╝
echo.

:: 检查 Node.js 是否安装
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [❌] 未检测到 Node.js，请先安装！
    echo.
    echo 下载地址: https://nodejs.org
    echo 选择左边的 LTS 版本，安装后重新运行此脚本
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0"

:: 安装依赖
echo [1/3] 检查依赖...
if not exist "node_modules" (
    echo       首次运行，正在安装依赖（约30秒）...
    call npm install
    if %errorlevel% neq 0 (
        echo [❌] 依赖安装失败，请检查网络连接
        pause
        exit /b 1
    )
    echo       ✅ 依赖安装完成
) else (
    echo       ✅ 依赖已就绪
)
echo.

:: 检查 .env 配置
echo [2/3] 检查 API 配置...
if not exist ".env" (
    echo       ⚠️  未找到 .env 文件，正在创建...
    copy .env.example .env >nul
    echo       ✅ 已创建 .env 文件，用记事本编辑填入 API Key
)
echo       ✅ 配置就绪
echo.

:: 启动服务器
echo [3/3] 启动服务器...
echo.
echo ┌──────────────────────────────────────────────────┐
echo │  浏览器打开 → http://localhost:3000               │
echo │  按 Ctrl+C 停止服务器                              │
echo │  使用说明 → 打开"使用说明.txt"                     │
echo └──────────────────────────────────────────────────┘
echo.

:: 自动打开浏览器
start "" http://localhost:3000

node server.js

:: 如果服务器意外退出
echo.
echo 服务器已停止。按任意键关闭窗口...
pause >nul
