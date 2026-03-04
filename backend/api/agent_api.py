"""
Agent API：列表/上架/下架/ACL 管理
"""
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update

from core.database import GlobalSessionLocal
from core.permissions import has_permission, require_permission
from core.security import get_current_user_payload
from models.global_models import AgentACL, AgentMaster
from models.schemas import AgentACLUpdate, AgentPublishUpdate, AgentResponse, MessageResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=List[AgentResponse])
async def list_agents(payload: dict = Depends(get_current_user_payload)):
    """
    取得可用 Agent 列表（依授權過濾）
    - platform_admin / super_admin: 看到所有已上架 Agent
    - 其他角色: 依 Agent_ACL 過濾
    """
    email = payload["sub"]
    role = payload.get("role", "user")

    async with GlobalSessionLocal() as session:
        # 取得所有已上架 Agent
        result = await session.execute(
            select(AgentMaster).where(AgentMaster.is_published == True)
        )
        all_agents = result.scalars().all()

        # platform_admin / super_admin 看到全部
        if has_permission(role, "access_all_agents"):
            return [_agent_to_response(a) for a in all_agents]

        # 其他角色需要檢查 ACL
        authorized_agents = []
        for agent in all_agents:
            acl_result = await session.execute(
                select(AgentACL).where(AgentACL.agent_id == agent.agent_id)
            )
            acl = acl_result.scalar_one_or_none()

            if acl and _check_acl(acl.allowed_users, email, role):
                authorized_agents.append(agent)

        return [_agent_to_response(a) for a in authorized_agents]


@router.get("/all", response_model=List[AgentResponse])
async def list_all_agents(
    payload: dict = Depends(require_permission("manage_agent_permissions")),
):
    """取得所有 Agent（管理用，含未上架）"""
    async with GlobalSessionLocal() as session:
        result = await session.execute(
            select(AgentMaster).order_by(AgentMaster.created_at.desc())
        )
        agents = result.scalars().all()

    return [_agent_to_response(a) for a in agents]


@router.put("/{agent_id}/publish", response_model=MessageResponse)
async def update_publish_status(
    agent_id: str,
    body: AgentPublishUpdate,
    payload: dict = Depends(require_permission("manage_agent_permissions")),
):
    """上架/下架 Agent"""
    async with GlobalSessionLocal() as session:
        result = await session.execute(
            update(AgentMaster)
            .where(AgentMaster.agent_id == agent_id)
            .values(is_published=body.is_published)
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Agent 不存在")
        await session.commit()

    action = "上架" if body.is_published else "下架"
    return MessageResponse(message=f"Agent 已{action}")


@router.put("/{agent_id}/acl", response_model=MessageResponse)
async def update_agent_acl(
    agent_id: str,
    body: AgentACLUpdate,
    payload: dict = Depends(require_permission("manage_agent_permissions")),
):
    """更新 Agent 授權規則"""
    # 驗證 authorized_users 不超過 50
    if len(body.authorized_users) > 50:
        raise HTTPException(status_code=400, detail="授權使用者不可超過 50 人")

    acl_data = {
        "authorized_roles": body.authorized_roles,
        "authorized_users": body.authorized_users,
        "exception_list": body.exception_list,
    }

    async with GlobalSessionLocal() as session:
        # 檢查 Agent 是否存在
        agent_result = await session.execute(
            select(AgentMaster).where(AgentMaster.agent_id == agent_id)
        )
        if not agent_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Agent 不存在")

        # 更新或建立 ACL
        acl_result = await session.execute(
            select(AgentACL).where(AgentACL.agent_id == agent_id)
        )
        existing_acl = acl_result.scalar_one_or_none()

        if existing_acl:
            await session.execute(
                update(AgentACL)
                .where(AgentACL.agent_id == agent_id)
                .values(allowed_users=acl_data)
            )
        else:
            new_acl = AgentACL(agent_id=agent_id, allowed_users=acl_data)
            session.add(new_acl)

        await session.commit()

    return MessageResponse(message="Agent 授權規則已更新")


# === 內部工具函式 ===

def _agent_to_response(agent: AgentMaster) -> AgentResponse:
    return AgentResponse(
        agent_id=str(agent.agent_id),
        name=agent.name,
        agent_config_json=agent.agent_config_json or {},
        icon=agent.icon,
        color=agent.color,
        description=agent.description,
        is_published=agent.is_published,
    )


def _check_acl(acl_data: dict, email: str, role: str) -> bool:
    """
    檢查使用者是否通過 ACL 授權
    1. exception_list 排除
    2. authorized_users 包含
    3. authorized_roles 包含
    """
    if not acl_data:
        return False

    exception_list = acl_data.get("exception_list", [])
    if email in exception_list:
        return False

    authorized_users = acl_data.get("authorized_users", [])
    if email in authorized_users:
        return True

    authorized_roles = acl_data.get("authorized_roles", [])
    if role in authorized_roles:
        return True

    return False
