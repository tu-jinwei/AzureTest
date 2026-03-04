"""
對話 API：建立/取得/歷史
對話存在 Local MongoDB（各國）
"""
import logging
from datetime import datetime, timezone
from typing import List

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from core.data_router import data_router
from core.security import get_current_user_payload
from models.schemas import ChatCreate, ChatHistoryItem, ChatResponse, MessageResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("", response_model=ChatResponse)
async def create_or_continue_chat(
    body: ChatCreate,
    payload: dict = Depends(get_current_user_payload),
):
    """
    發送訊息（存入 Local MongoDB）
    如果沒有現有對話，建立新的；否則追加訊息
    """
    email = payload["sub"]
    country = payload.get("country", "TW")
    now = datetime.now(timezone.utc)

    mongo_db = await data_router.get_local_mongo(country)
    chat_collection = mongo_db["chat_store"]

    # 建立使用者訊息
    user_message = {
        "role": "user",
        "content": body.message,
        "timestamp": now.isoformat(),
    }

    # 模擬 AI 回覆（實際需串接 Agent 服務）
    assistant_message = {
        "role": "assistant",
        "content": f"已收到您的訊息：「{body.message}」。這是模擬回覆，實際功能需連接 Agent 服務。",
        "timestamp": now.isoformat(),
    }

    # 建立新對話
    chat_doc = {
        "user_email": email,
        "agent_id": body.agent_id,
        "messages": [user_message, assistant_message],
        "created_at": now,
        "updated_at": now,
    }

    result = await chat_collection.insert_one(chat_doc)
    chat_id = str(result.inserted_id)

    return ChatResponse(
        chat_id=chat_id,
        agent_id=body.agent_id,
        messages=[user_message, assistant_message],
        created_at=now,
        updated_at=now,
    )


@router.get("/history", response_model=List[ChatHistoryItem])
async def get_chat_history(
    payload: dict = Depends(get_current_user_payload),
):
    """取得對話歷史列表"""
    email = payload["sub"]
    country = payload.get("country", "TW")

    mongo_db = await data_router.get_local_mongo(country)
    chat_collection = mongo_db["chat_store"]

    cursor = chat_collection.find(
        {"user_email": email}
    ).sort("updated_at", -1).limit(50)

    history = []
    async for doc in cursor:
        messages = doc.get("messages", [])
        last_msg = messages[-1]["content"] if messages else ""
        # 截斷最後訊息
        if len(last_msg) > 50:
            last_msg = last_msg[:50] + "..."

        history.append(ChatHistoryItem(
            chat_id=str(doc["_id"]),
            agent_id=doc.get("agent_id", ""),
            last_message=last_msg,
            timestamp=doc.get("updated_at"),
        ))

    return history


@router.get("/{chat_id}", response_model=ChatResponse)
async def get_chat_detail(
    chat_id: str,
    payload: dict = Depends(get_current_user_payload),
):
    """取得單一對話詳情"""
    email = payload["sub"]
    country = payload.get("country", "TW")

    mongo_db = await data_router.get_local_mongo(country)
    chat_collection = mongo_db["chat_store"]

    try:
        doc = await chat_collection.find_one({
            "_id": ObjectId(chat_id),
            "user_email": email,  # 確保只能看自己的對話
        })
    except Exception:
        raise HTTPException(status_code=400, detail="無效的對話 ID")

    if not doc:
        raise HTTPException(status_code=404, detail="對話不存在")

    return ChatResponse(
        chat_id=str(doc["_id"]),
        agent_id=doc.get("agent_id", ""),
        messages=doc.get("messages", []),
        created_at=doc.get("created_at"),
        updated_at=doc.get("updated_at"),
    )
