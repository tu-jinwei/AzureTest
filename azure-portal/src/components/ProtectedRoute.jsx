import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = () => {
  const { isAuthenticated, loading } = useAuth();

  // 載入中，顯示全頁 Spin
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          background: '#f5f5f5',
        }}
      >
        <Spin size="large" tip="載入中..." />
      </div>
    );
  }

  // 未登入，跳轉到 /login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // 已登入，渲染子路由
  return <Outlet />;
};

export default ProtectedRoute;
