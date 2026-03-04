import React from 'react';
import { MenuOutlined, UserOutlined, TeamOutlined, LogoutOutlined } from '@ant-design/icons';
import { Avatar, Tag, Button, Tooltip } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_LABELS, ROLE_COLORS } from '../data/mockData';
import './TopBar.css';

const TopBar = ({ onToggleSidebar }) => {
  const { user, logout } = useAuth();

  const roleLabel = user ? (ROLE_LABELS[user.role] || user.role) : '';
  const roleColor = user ? (ROLE_COLORS[user.role] || '#999') : '#999';

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="topbar">
      <div className="topbar-left">
        <MenuOutlined className="topbar-hamburger" onClick={onToggleSidebar} />
        <div className="topbar-logo">
          <span className="topbar-logo-icon">N</span>
          <span className="topbar-logo-text">Web Portal</span>
        </div>
        {user && (
          <div className="topbar-team">
            <TeamOutlined style={{ color: 'var(--primary-color)', marginRight: 6 }} />
            <span className="topbar-team-name">{user.department || ''}</span>
          </div>
        )}
      </div>
      <div className="topbar-right">
        {user && (
          <>
            <div className="topbar-user-info">
              <span className="topbar-user-name">{user.name || user.email}</span>
              <Tag
                color={roleColor}
                style={{ marginLeft: 4, fontSize: 11, lineHeight: '18px' }}
              >
                {roleLabel}
              </Tag>
            </div>
            <Avatar size={36} icon={<UserOutlined />} className="topbar-avatar" />
            <Tooltip title="登出">
              <Button
                type="text"
                icon={<LogoutOutlined />}
                onClick={handleLogout}
                className="topbar-logout-btn"
                style={{ marginLeft: 8, color: '#666' }}
              />
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
};

export default TopBar;
