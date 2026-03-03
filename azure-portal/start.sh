#!/bin/bash
# Azure Portal 靜態伺服器啟動腳本
# 用途：build + serve，供 systemd service 使用

set -e

PROJECT_DIR="/home/ubuntu/wei/Azure/azure-portal"
PORT=8079

cd "$PROJECT_DIR"

echo "[$(date)] 開始建置 Azure Portal..."
/usr/bin/npx vite build 2>&1
echo "[$(date)] 建置完成，啟動靜態伺服器 (port $PORT)..."

# 使用 exec 替換 shell 程序，讓 systemd 能正確管理 node 程序
exec /usr/bin/npx serve dist -l "$PORT" --single 2>&1
