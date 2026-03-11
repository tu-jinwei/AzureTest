"""
PII Detection & Redaction API — 獨立掃描/脫敏端點（測試與管理用）
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.security import get_current_user_payload
from services.pii_service import get_pii_service

logger = logging.getLogger(__name__)
router = APIRouter()


# ===== Request / Response Schemas =====


class PIIScanRequest(BaseModel):
    text: str = Field(..., description="要掃描的文字", max_length=50000)


class PIIEntityResponse(BaseModel):
    entity_type: str
    text: str
    start: int
    end: int
    score: float


class PIIScanResponse(BaseModel):
    has_pii: bool
    entity_count: int
    entities: list[PIIEntityResponse]
    entity_types: list[str]
    redacted_text: Optional[str] = None
    scanned_at: str
    text_length: int
    confidence_threshold: float


class PIIRedactRequest(BaseModel):
    text: str = Field(..., description="要脫敏的文字", max_length=50000)


class PIIRedactResponse(BaseModel):
    original_length: int
    redacted_text: str
    entities_found: int
    entity_types: list[str]


class PIIStatusResponse(BaseModel):
    enabled: bool
    engine: str
    languages: list[str]
    confidence_threshold: float
    redact_mode: str


# ===== API Endpoints =====


@router.get("/status", response_model=PIIStatusResponse)
async def get_pii_status(
    payload: dict = Depends(get_current_user_payload),
):
    """取得 PII 服務狀態"""
    service = get_pii_service()
    return PIIStatusResponse(**service.get_status())


@router.post("/scan", response_model=PIIScanResponse)
async def scan_text(
    body: PIIScanRequest,
    payload: dict = Depends(get_current_user_payload),
):
    """
    掃描文字中的 PII

    回傳偵測到的 PII 實體列表，以及脫敏後的文字預覽。
    """
    service = get_pii_service()

    if not service.enabled:
        raise HTTPException(status_code=503, detail="PII 服務未啟用（PII_ENABLED=false）")

    result = service.scan_text(body.text)
    redacted = service.anonymize_text(body.text) if result.has_pii else body.text

    return PIIScanResponse(
        has_pii=result.has_pii,
        entity_count=result.entity_count,
        entities=[
            PIIEntityResponse(
                entity_type=e.entity_type,
                text=e.text,
                start=e.start,
                end=e.end,
                score=e.score,
            )
            for e in result.entities
        ],
        entity_types=result.entity_types,
        redacted_text=redacted,
        scanned_at=result.scanned_at,
        text_length=result.text_length,
        confidence_threshold=result.confidence_threshold,
    )


@router.post("/redact", response_model=PIIRedactResponse)
async def redact_text(
    body: PIIRedactRequest,
    payload: dict = Depends(get_current_user_payload),
):
    """
    脫敏文字中的 PII

    回傳遮蔽後的文字。
    """
    service = get_pii_service()

    if not service.enabled:
        raise HTTPException(status_code=503, detail="PII 服務未啟用（PII_ENABLED=false）")

    result = service.scan_text(body.text)
    redacted = service.anonymize_text(body.text)

    return PIIRedactResponse(
        original_length=len(body.text),
        redacted_text=redacted,
        entities_found=result.entity_count,
        entity_types=result.entity_types,
    )
