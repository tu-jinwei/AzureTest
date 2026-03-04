import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  HomeOutlined,
  RobotOutlined,
  BookOutlined,
  SettingOutlined,
  MessageOutlined,
  HistoryOutlined,
  NotificationOutlined,
  SafetyOutlined,
  DatabaseOutlined,
  TeamOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import './Sidebar.css';

const Sidebar = ({ collapsed }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasPermission } = useAuth();
  const [expandedMenus, setExpandedMenus] = useState({});

  const toggleMenu = (key) => {
    setExpandedMenus((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isActive = (path) => location.pathname === path;
  const isParentActive = (paths) => paths.some((p) => location.pathname.startsWith(p));

  // 根據使用者權限動態產生設定子選單
  const settingsChildren = [];
  if (hasPermission('manage_announcements')) {
    settingsChildren.push({ key: 'announcement-settings', icon: <NotificationOutlined />, label: '公告欄設定', path: '/settings/announcements' });
  }
  if (hasPermission('manage_agent_permissions')) {
    settingsChildren.push({ key: 'agent-permissions', icon: <SafetyOutlined />, label: 'Agent 權限設定', path: '/settings/agent-permissions' });
  }
  if (hasPermission('manage_library')) {
    settingsChildren.push({ key: 'library-settings', icon: <DatabaseOutlined />, label: '圖書館設定', path: '/settings/library' });
  }
  if (hasPermission('manage_users')) {
    settingsChildren.push({ key: 'user-management', icon: <TeamOutlined />, label: '使用者管理', path: '/settings/users' });
  }

  const menuItems = [
    {
      key: 'home',
      icon: <HomeOutlined />,
      label: 'Home',
      path: '/',
    },
    {
      key: 'agent-store',
      icon: <RobotOutlined />,
      label: 'Agent Store',
      children: [
        { key: 'chat', icon: <MessageOutlined />, label: '對話', path: '/agent-store/chat' },
        { key: 'history', icon: <HistoryOutlined />, label: '對話歷史', path: '/agent-store/history' },
      ],
    },
    {
      key: 'library',
      icon: <BookOutlined />,
      label: '線上圖書館',
      path: '/library',
    },
    // 只有在有任何設定權限時才顯示設定選單
    ...(settingsChildren.length > 0
      ? [
          {
            key: 'settings',
            icon: <SettingOutlined />,
            label: '設定',
            children: settingsChildren,
          },
        ]
      : []),
  ];

  return (
    <div className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <nav className="sidebar-nav">
        {menuItems.map((item) => {
          if (item.children) {
            const isExpanded = expandedMenus[item.key] || isParentActive(item.children.map((c) => c.path));
            return (
              <div key={item.key} className="sidebar-menu-group">
                <div
                  className={`sidebar-item sidebar-parent ${isParentActive(item.children.map((c) => c.path)) ? 'active-parent' : ''}`}
                  onClick={() => toggleMenu(item.key)}
                >
                  <span className="sidebar-item-icon">{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span className="sidebar-item-label">{item.label}</span>
                      <span className="sidebar-expand-icon">
                        {isExpanded ? <DownOutlined /> : <RightOutlined />}
                      </span>
                    </>
                  )}
                </div>
                {isExpanded && !collapsed && (
                  <div className="sidebar-children">
                    {item.children.map((child) => (
                      <div
                        key={child.key}
                        className={`sidebar-item sidebar-child ${isActive(child.path) ? 'active' : ''}`}
                        onClick={() => navigate(child.path)}
                      >
                        <span className="sidebar-item-icon">{child.icon}</span>
                        <span className="sidebar-item-label">{child.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div
              key={item.key}
              className={`sidebar-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              {!collapsed && <span className="sidebar-item-label">{item.label}</span>}
            </div>
          );
        })}
      </nav>
    </div>
  );
};

export default Sidebar;
