"""
Global DB Models（台灣 PostgreSQL）
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from core.database import GlobalBase


class UserRouteMap(GlobalBase):
    """使用者路由映射表"""
    __tablename__ = "user_route_map"

    email = Column(String(255), primary_key=True)
    name = Column(String(100), nullable=False)
    department = Column(String(100))
    country_code = Column(String(5), nullable=False)
    role = Column(String(20), nullable=False, default="user")
    status = Column(String(20), nullable=False, default="active")  # active / inactive / locked
    last_login_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class AgentMaster(GlobalBase):
    """Agent 主表"""
    __tablename__ = "agent_master"

    agent_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    agent_config_json = Column("model_config", JSONB, nullable=False, default={})
    icon = Column(String(10))
    color = Column(String(10))
    description = Column(Text)
    quota = Column(Integer, default=0)
    is_published = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class AgentACL(GlobalBase):
    """Agent 存取控制表"""
    __tablename__ = "agent_acl"

    agent_id = Column(UUID(as_uuid=True), primary_key=True)
    allowed_users = Column(JSONB, nullable=False, default={
        "authorized_roles": [],
        "authorized_users": [],
        "exception_list": [],
    })


class GlobalLibrary(GlobalBase):
    """全域圖書館"""
    __tablename__ = "global_library"

    doc_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    library_name = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    metadata_json = Column("metadata", JSONB, nullable=False, default={})
    auth_rules = Column(JSONB, nullable=False, default={
        "authorized_roles": [],
        "authorized_users": [],
        "exception_list": [],
    })
    file_url = Column(Text)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class GlobalAuditLog(GlobalBase):
    """脫敏稽核日誌（從各國同步）"""
    __tablename__ = "global_audit_log"

    log_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255))
    action = Column(String(100), nullable=False)
    target = Column(String(255))
    country_code = Column(String(5))
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
