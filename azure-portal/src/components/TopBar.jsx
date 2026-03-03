import React from 'react';
import { MenuOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import { Avatar, Badge } from 'antd';
import { currentUser } from '../data/mockData';
import './TopBar.css';

const TopBar = ({ onToggleSidebar }) => {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <MenuOutlined className="topbar-hamburger" onClick={onToggleSidebar} />
        <div className="topbar-logo">
          <span className="topbar-logo-icon">N</span>
          <span className="topbar-logo-text">Web Portal</span>
        </div>
        <div className="topbar-team">
          <TeamOutlined style={{ color: 'var(--primary-color)', marginRight: 6 }} />
          <span className="topbar-team-name">{currentUser.department}</span>
          <span className="topbar-team-badge">{currentUser.memberCount} 成員</span>
          <span className="topbar-team-badge">{currentUser.agentCount} 代理</span>
        </div>
      </div>
      <div className="topbar-right">
        <div className="topbar-user-info">
          <span className="topbar-user-name">{currentUser.name}</span>
          <span className="topbar-user-role">
            <Badge status="processing" color="var(--primary-color)" />
            {currentUser.role}
          </span>
        </div>
        <Avatar size={36} icon={<UserOutlined />} className="topbar-avatar" />
      </div>
    </div>
  );
};

export default TopBar;
