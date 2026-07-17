"""
Global DB Models（台灣 PostgreSQL）
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from core.database import GlobalBase


class Country(GlobalBase):
    """國家管理表"""
    __tablename__ = "countries"

    code       = Column(String(5),  primary_key=True)          # 國家代碼，如 TW
    name_zh    = Column(String(50), nullable=False)            # 中文名稱
    name_en    = Column(String(50), nullable=False)            # 英文名稱
    is_active  = Column(Boolean,    nullable=False, default=True)
    sort_order = Column(Integer,    nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class UserRouteMap(GlobalBase):
    """使用者路由映射表"""
    __tablename__ = "user_route_map"

    email = Column(String(255), primary_key=True)
    name = Column(String(100), nullable=False)
    department = Column(String(100))
    country_code = Column(String(5), nullable=False)
    role = Column(String(20), nullable=False, default="user")
    status = Column(String(20), nullable=False, default="active")  # active / inactive / locked
    avatar_url = Column(Text, nullable=True)  # 使用者頭貼路徑
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


class GlobalDocument(GlobalBase):
    """全域文件主表（重構自 GlobalLibrary，支援跨國分發）"""
    __tablename__ = "global_document"

    doc_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    metadata_json = Column("metadata", JSONB, nullable=False, default={})
    # auth_rules 欄位：v3 migration 建立時包含此欄位（NOT NULL），保留以相容 DB schema
    # 實際存取規則已移至 global_document_distribution.auth_rules
    auth_rules = Column(JSONB, nullable=False, default={
        "authorized_roles": [],
        "authorized_users": [],
        "exception_list": [],
    })
    file_url = Column(Text)  # 向後相容：第一個檔案路徑
    files_json = Column("files", JSONB, nullable=False, default=[])  # 多檔案清單
    uploaded_by = Column(String(255))  # 上傳者 email
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class GlobalDocumentDistribution(GlobalBase):
    """文件分發規則表：記錄每份文件分發到哪些國家的哪個館，以及各國存取規則"""
    __tablename__ = "global_document_distribution"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_id = Column(UUID(as_uuid=True), nullable=False)  # FK to global_document.doc_id
    country_code = Column(String(5), nullable=False)      # TW / HK / SG / US
    catalog_name = Column(String(255), nullable=False)    # 在該國放入的館名
    auth_rules = Column(JSONB, nullable=False, default={
        "authorized_roles": [],
        "authorized_users": [],
        "exception_list": [],
    })
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class GlobalCatalog(GlobalBase):
    """全域館目錄：各國各自管理自己的館名清單"""
    __tablename__ = "global_catalog"

    catalog_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    catalog_name = Column(String(255), nullable=False)
    country_code = Column(String(5), nullable=False, default='')  # 所屬國家代碼，空字串表示舊資料
    description = Column(Text)
    image_url = Column(Text)  # 館封面圖片路徑（uploads/global/catalog/{catalog_id}/cover.{ext}）
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class GlobalAuditLog(GlobalBase):
    """稽核日誌（記錄所有重要操作）"""
    __tablename__ = "global_audit_log"

    log_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255))
    action = Column(String(100), nullable=False)
    target = Column(String(255))
    country_code = Column(String(5))
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    # 擴充欄位（Phase 7 新增）
    ip_address = Column(String(45))           # 操作者 IP 位址
    result = Column(String(20), default="success")  # success / failure
    error_message = Column(Text)              # 失敗原因
    details = Column(JSONB)                   # 補充資訊（操作前後的值等）
    user_agent = Column(Text)                 # 瀏覽器 User-Agent
    response_time_ms = Column(Integer)        # 操作耗時（毫秒）
