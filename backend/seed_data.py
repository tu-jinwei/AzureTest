#!/usr/bin/env python3
"""
CTBC AI Portal - DB Seed Script
初始化 Global DB schema 並插入測試資料

使用方式：
  cd Azure/backend && python seed_data.py          # 建立表 + 插入資料
  cd Azure/backend && python seed_data.py --drop    # 先 DROP 所有表再重建
"""
import argparse
import sys
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from config import settings


def get_engine():
    """建立同步 SQLAlchemy engine"""
    url = settings.GLOBAL_DB_URL_SYNC
    print(f"📡 連線到 Global DB: {settings.GLOBAL_DB_HOST}:{settings.GLOBAL_DB_PORT}/{settings.GLOBAL_DB_NAME}")
    return create_engine(url, echo=False)


def drop_tables(engine):
    """DROP 所有 Global DB 表"""
    print("\n🗑️  正在 DROP 所有表...")
    table_names = [
        "global_audit_log",
        "global_library",
        "agent_acl",
        "agent_master",
        "user_route_map",
    ]
    with engine.begin() as conn:
        for table in table_names:
            conn.execute(text(f'DROP TABLE IF EXISTS "{table}" CASCADE'))
            print(f"   ✅ DROP TABLE {table}")
    print("🗑️  所有表已刪除")


def create_tables(engine):
    """建立所有 Global DB 表"""
    print("\n📦 正在建立 Global DB 表...")

    # 匯入 models 以註冊到 GlobalBase.metadata
    from core.database import GlobalBase
    import models.global_models  # noqa: F401 - 確保 models 被載入

    GlobalBase.metadata.create_all(bind=engine)
    print("   ✅ user_route_map")
    print("   ✅ agent_master")
    print("   ✅ agent_acl")
    print("   ✅ global_library")
    print("   ✅ global_audit_log")
    print("📦 所有表已建立")


def seed_users(session: Session):
    """插入使用者 seed 資料"""
    print("\n👥 正在插入使用者資料...")
    from models.global_models import UserRouteMap

    users = [
        {"email": "tina@ctbc.com", "name": "Tina", "department": "規劃部", "country_code": "TW", "role": "platform_admin", "status": "active"},
        {"email": "john@ctbc.com", "name": "John", "department": "研發部", "country_code": "TW", "role": "user_manager", "status": "active"},
        {"email": "alice@ctbc.com", "name": "Alice", "department": "行銷部", "country_code": "TW", "role": "library_manager", "status": "active"},
        {"email": "bob@ctbc.com.sg", "name": "Bob", "department": "財務部", "country_code": "SG", "role": "user", "status": "active"},
        {"email": "carol@ctbc.com", "name": "Carol", "department": "人資部", "country_code": "TW", "role": "user", "status": "active"},
        {"email": "david@ctbc.co.jp", "name": "David", "department": "研發部", "country_code": "JP", "role": "user", "status": "active"},
        {"email": "eva@ctbc.com", "name": "Eva", "department": "規劃部", "country_code": "TW", "role": "user", "status": "inactive"},
        {"email": "frank@ctbc.co.th", "name": "Frank", "department": "行銷部", "country_code": "TH", "role": "user", "status": "active"},
    ]

    now = datetime.now(timezone.utc)
    for u in users:
        user = UserRouteMap(
            email=u["email"],
            name=u["name"],
            department=u["department"],
            country_code=u["country_code"],
            role=u["role"],
            status=u["status"],
            created_at=now,
            updated_at=now,
        )
        session.merge(user)  # merge 避免重複插入時報錯
        print(f"   ✅ {u['email']} ({u['name']}, {u['role']})")

    session.commit()
    print(f"👥 已插入 {len(users)} 筆使用者資料")


def seed_agents(session: Session) -> list:
    """插入 Agent seed 資料，回傳 agent_id 列表"""
    print("\n🤖 正在插入 Agent 資料...")
    from models.global_models import AgentMaster

    agents = [
        {
            "name": "【EPMO】VMO Satellite",
            "icon": "🛰️",
            "color": "#4FC3F7",
            "description": "VMO 衛星監控代理，協助追蹤專案進度與風險。",
            "is_published": True,
            "agent_config_json": {"model": "gpt-4o"},
        },
        {
            "name": "【EPMO】Talent Agent",
            "icon": "👤",
            "color": "#81C784",
            "description": "人才管理代理，協助人力資源配置與評估。",
            "is_published": True,
            "agent_config_json": {"model": "gpt-4o"},
        },
        {
            "name": "【EPMO】RISKO.beta(影印問題版)",
            "icon": "🔥",
            "color": "#FF8A65",
            "description": "風險評估代理，識別並分析專案潛在風險。",
            "is_published": True,
            "agent_config_json": {"model": "gpt-4o"},
        },
        {
            "name": "【EPMO】Coordinator Agent (Dr. PJ Jr.)",
            "icon": "🤖",
            "color": "#9575CD",
            "description": "專案協調代理，協助跨部門溝通與任務分配。",
            "is_published": True,
            "agent_config_json": {"model": "gpt-4.1"},
        },
        {
            "name": "【EPMO】project 專案顧問",
            "icon": "📋",
            "color": "#4DB6AC",
            "description": "專案顧問代理，提供專案管理建議與最佳實踐。",
            "is_published": True,
            "agent_config_json": {"model": "gpt-4.1"},
        },
    ]

    agent_ids = []
    now = datetime.now(timezone.utc)
    for a in agents:
        agent_id = uuid.uuid4()
        agent = AgentMaster(
            agent_id=agent_id,
            name=a["name"],
            icon=a["icon"],
            color=a["color"],
            description=a["description"],
            is_published=a["is_published"],
            agent_config_json=a["agent_config_json"],
            created_at=now,
            updated_at=now,
        )
        session.add(agent)
        agent_ids.append(agent_id)
        print(f"   ✅ {a['icon']} {a['name']}")

    session.commit()
    print(f"🤖 已插入 {len(agents)} 筆 Agent 資料")
    return agent_ids


def seed_agent_acl(session: Session, agent_ids: list):
    """為每個 Agent 建立 ACL"""
    print("\n🔐 正在插入 Agent ACL 資料...")
    from models.global_models import AgentACL

    all_roles = ["user", "user_manager", "library_manager", "platform_admin", "super_admin"]

    for agent_id in agent_ids:
        acl = AgentACL(
            agent_id=agent_id,
            allowed_users={
                "authorized_roles": all_roles,
                "authorized_users": [],
                "exception_list": [],
            },
        )
        session.merge(acl)
        print(f"   ✅ ACL for agent {agent_id}")

    session.commit()
    print(f"🔐 已插入 {len(agent_ids)} 筆 Agent ACL 資料")


def seed_library(session: Session):
    """插入圖書館 seed 資料"""
    print("\n📚 正在插入圖書館資料...")
    from models.global_models import GlobalLibrary

    libraries = [
        {
            "library_name": "Cloud Architecture",
            "documents": [
                {"name": "AWS Best Practices Guide", "description": "Comprehensive guide for AWS cloud architecture design patterns and best practices."},
                {"name": "Azure Fundamentals", "description": "Introduction to Microsoft Azure services and cloud computing concepts."},
                {"name": "GCP Infrastructure Design", "description": "Google Cloud Platform infrastructure design and deployment strategies."},
                {"name": "Multi-Cloud Strategy", "description": "Strategies for implementing and managing multi-cloud environments."},
                {"name": "Cloud Security Framework", "description": "Security frameworks and compliance standards for cloud deployments."},
            ],
        },
        {
            "library_name": "Project Management",
            "documents": [
                {"name": "Agile Methodology Handbook", "description": "Complete handbook for agile project management methodologies."},
                {"name": "Risk Assessment Templates", "description": "Templates and guidelines for project risk assessment and mitigation."},
                {"name": "Stakeholder Communication Plan", "description": "Best practices for stakeholder communication and engagement."},
            ],
        },
        {
            "library_name": "Compliance & Regulations",
            "documents": [
                {"name": "GDPR Compliance Guide", "description": "Guidelines for ensuring GDPR compliance in data processing activities."},
                {"name": "ISO 27001 Standards", "description": "Information security management system standards and implementation."},
            ],
        },
    ]

    now = datetime.now(timezone.utc)
    total = 0
    all_roles = ["user", "user_manager", "library_manager", "platform_admin", "super_admin"]

    for lib in libraries:
        for doc in lib["documents"]:
            entry = GlobalLibrary(
                doc_id=uuid.uuid4(),
                library_name=lib["library_name"],
                name=doc["name"],
                description=doc["description"],
                metadata_json={},
                auth_rules={
                    "authorized_roles": all_roles,
                    "authorized_users": [],
                    "exception_list": [],
                },
                created_at=now,
                updated_at=now,
            )
            session.add(entry)
            total += 1
            print(f"   ✅ [{lib['library_name']}] {doc['name']}")

    session.commit()
    print(f"📚 已插入 {total} 筆圖書館文件資料")


def main():
    parser = argparse.ArgumentParser(description="CTBC AI Portal - DB Seed Script")
    parser.add_argument("--drop", action="store_true", help="先 DROP 所有表再重建")
    args = parser.parse_args()

    print("=" * 60)
    print("  CTBC AI Portal - DB Seed Script")
    print("=" * 60)

    try:
        engine = get_engine()

        # 測試連線
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("✅ 資料庫連線成功")

    except Exception as e:
        print(f"\n❌ 資料庫連線失敗: {e}")
        print("\n💡 請確認 .env 中的 PostgreSQL 連線設定是否正確：")
        print(f"   GLOBAL_DB_HOST={settings.GLOBAL_DB_HOST}")
        print(f"   GLOBAL_DB_PORT={settings.GLOBAL_DB_PORT}")
        print(f"   GLOBAL_DB_NAME={settings.GLOBAL_DB_NAME}")
        print(f"   GLOBAL_DB_USER={settings.GLOBAL_DB_USER}")
        sys.exit(1)

    try:
        # Step 1: DROP（如果有 --drop 參數）
        if args.drop:
            drop_tables(engine)

        # Step 2: 建立表
        create_tables(engine)

        # Step 3: 插入 Seed 資料
        with Session(engine) as session:
            seed_users(session)
            agent_ids = seed_agents(session)
            seed_agent_acl(session, agent_ids)
            seed_library(session)

        print("\n" + "=" * 60)
        print("  ✅ Seed 完成！所有資料已成功插入。")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ Seed 失敗: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
