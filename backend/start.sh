#!/bin/bash
set -e

BACKEND_DIR="/home/ubuntu/wei/Azure/backend"
cd "$BACKEND_DIR"

# 建立虛擬環境（如果不存在）
if [ ! -d "venv" ]; then
    echo "[$(date)] 建立 Python 虛擬環境..."
    python3 -m venv venv
fi

# 啟動虛擬環境
. venv/bin/activate

# 安裝依賴
echo "[$(date)] 安裝 Python 依賴..."
pip install -r requirements.txt --quiet

# 複製 .env（如果不存在）
if [ ! -f ".env" ]; then
    echo "[$(date)] 建立 .env 檔案..."
    cp .env.example .env
fi

# 建置前端（如果前端原始碼存在）
FRONTEND_DIR="/home/ubuntu/wei/Azure/azure-portal"
if [ -d "$FRONTEND_DIR" ] && [ -f "$FRONTEND_DIR/package.json" ]; then
    echo "[$(date)] 建置前端靜態檔案..."
    cd "$FRONTEND_DIR"
    /usr/bin/npx vite build 2>&1
    cd "$BACKEND_DIR"
    echo "[$(date)] 前端建置完成"
fi

# 啟動 FastAPI（同時 serve 前端靜態檔 + API）
echo "[$(date)] 啟動 CTBC AI Portal (port 8079)..."
exec python -m uvicorn main:app --host 0.0.0.0 --port 8079 --reload
