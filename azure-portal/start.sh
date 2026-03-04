#!/bin/bash
# Azure Portal 前端建置腳本
# 用途：build 前端靜態檔案到後端 static/ 目錄
# FastAPI 會負責 serve 靜態檔案 + API

set -e

PROJECT_DIR="/home/ubuntu/wei/Azure/azure-portal"

cd "$PROJECT_DIR"

echo "[$(date)] 開始建置 Azure Portal 前端..."
/usr/bin/npx vite build 2>&1
echo "[$(date)] 建置完成！靜態檔案已輸出到 ../backend/static/"
echo "[$(date)] FastAPI (port 8079) 會自動 serve 前端靜態檔案"
