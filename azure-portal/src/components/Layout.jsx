import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import './Layout.css';

const Layout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="layout">
      <TopBar onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="layout-body">
        <Sidebar collapsed={sidebarCollapsed} />
        <main
          className="layout-content"
          style={{
            marginLeft: sidebarCollapsed ? 60 : 'var(--sidebar-width)',
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
