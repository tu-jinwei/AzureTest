import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhTW from 'antd/locale/zh_TW';
import Layout from './components/Layout';
import Home from './pages/Home';
import AgentChat from './pages/AgentChat';
import ChatHistory from './pages/ChatHistory';
import Library from './pages/Library';
import AnnouncementSettings from './pages/settings/AnnouncementSettings';
import AgentPermissions from './pages/settings/AgentPermissions';
import LibrarySettings from './pages/settings/LibrarySettings';

const App = () => {
  return (
    <ConfigProvider
      locale={zhTW}
      theme={{
        token: {
          colorPrimary: '#2aabb3',
          borderRadius: 6,
        },
      }}
    >
      <BrowserRouter basename="/AzureTest">
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="agent-store/chat" element={<AgentChat />} />
            <Route path="agent-store/history" element={<ChatHistory />} />
            <Route path="library" element={<Library />} />
            <Route path="settings/announcements" element={<AnnouncementSettings />} />
            <Route path="settings/agent-permissions" element={<AgentPermissions />} />
            <Route path="settings/library" element={<LibrarySettings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
};

export default App;
