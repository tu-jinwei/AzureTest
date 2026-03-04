"""
安全模組：JWT 產生/驗證、OTP 產生/驗證
"""
import hashlib
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from config import settings

# === 密碼 Hash ===
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# === JWT ===
ALGORITHM = "HS256"
security_scheme = HTTPBearer()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """產生 JWT Access Token"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, settings.APP_SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """解碼 JWT Access Token"""
    try:
        payload = jwt.decode(token, settings.APP_SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="無效的認證 Token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user_payload(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
) -> dict:
    """FastAPI Dependency: 從 JWT 取得當前使用者資訊"""
    payload = decode_access_token(credentials.credentials)
    email = payload.get("sub")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 中缺少使用者資訊",
        )
    return payload


# === OTP ===
def generate_otp(length: int = 6) -> str:
    """產生隨機 OTP 碼（純數字）"""
    return "".join([str(secrets.randbelow(10)) for _ in range(length)])


def hash_otp(otp_code: str) -> str:
    """Hash OTP 碼（使用 bcrypt）"""
    return pwd_context.hash(otp_code)


def verify_otp(plain_otp: str, hashed_otp: str) -> bool:
    """驗證 OTP 碼"""
    return pwd_context.verify(plain_otp, hashed_otp)
