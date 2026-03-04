import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Button, Tag, Spin } from 'antd';
import {
  SoundOutlined,
  RobotOutlined,
  BookOutlined,
  FilePdfOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { announcementAPI, agentAPI, libraryAPI } from '../services/api';
import { adaptAnnouncements, adaptAgents, adaptLibraryDocs } from '../utils/adapters';
import { announcements as mockAnnouncements, agents as mockAgents, libraries as mockLibraries } from '../data/mockData';
import './Home.css';

const Home = () => {
  const navigate = useNavigate();
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);

  const [announcements, setAnnouncements] = useState([]);
  const [agents, setAgents] = useState([]);
  const [libraries, setLibraries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // 公告
      try {
        const res = await announcementAPI.list();
        setAnnouncements(adaptAnnouncements(res.data));
      } catch (err) {
        console.warn('公告 API 失敗，使用 mock 資料', err);
        setAnnouncements(mockAnnouncements);
      }

      // Agent
      try {
        const res = await agentAPI.list();
        setAgents(adaptAgents(res.data));
      } catch (err) {
        console.warn('Agent API 失敗，使用 mock 資料', err);
        setAgents(mockAgents);
      }

      // 圖書館
      try {
        const res = await libraryAPI.list();
        setLibraries(adaptLibraryDocs(res.data));
      } catch (err) {
        console.warn('圖書館 API 失敗，使用 mock 資料', err);
        setLibraries(mockLibraries);
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="home-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip="載入中..." />
      </div>
    );
  }

  return (
    <div className="home-page">
      {/* ===== 公告欄 ===== */}
      <div className="home-section announcement-section">
        <div className="section-header-row">
          <h2 className="section-title">
            <SoundOutlined style={{ marginRight: 8 }} />
            公告欄
            <span className="section-subtitle">(Lastest News)</span>
          </h2>
        </div>
        <div className="announcement-list">
          {announcements.filter((a) => a.isNew).map((item) => (
            <div
              key={item.id}
              className="announcement-item"
              onClick={() => setSelectedAnnouncement(item)}
            >
              <span className="announcement-dot">•</span>
              {item.isNew && <Tag color="red" className="announcement-new-tag">NEW</Tag>}
              <span className="announcement-date">{item.date}</span>
              <span className="announcement-subject">{item.subject}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ===== 公告彈出視窗 ===== */}
      <Modal
        title={selectedAnnouncement?.subject}
        open={!!selectedAnnouncement}
        onCancel={() => setSelectedAnnouncement(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedAnnouncement(null)}>
            關閉
          </Button>,
        ]}
        width={600}
      >
        {selectedAnnouncement && (
          <div className="announcement-modal-content">
            <p className="announcement-modal-text">
              {selectedAnnouncement.content}
            </p>
            {selectedAnnouncement.attachment && (
              <div className="announcement-modal-attachment">
                <div className="attachment-cover">
                  <FilePdfOutlined style={{ fontSize: 48, color: '#e74c3c' }} />
                  <p>{selectedAnnouncement.attachment.name}</p>
                </div>
                <Button
                  type="primary"
                  icon={<LinkOutlined />}
                  style={{ background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
                  onClick={() => window.open(selectedAnnouncement.attachment.pdfUrl, '_blank')}
                >
                  查看 PDF
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ===== Agent Store 預覽 ===== */}
      <div className="home-section agent-section">
        <h2 className="section-title">
          <RobotOutlined style={{ marginRight: 8 }} />
          Agent Store
        </h2>
        <div className="agent-preview-list">
          {agents.slice(0, 2).map((agent) => (
            <div key={agent.id} className="agent-preview-card">
              <div
                className="agent-preview-icon"
                style={{ background: agent.color + '20', color: agent.color }}
              >
                {agent.icon}
              </div>
              <div className="agent-preview-info">
                <div className="agent-preview-name">{agent.name}</div>
                <div className="agent-preview-meta">
                  <span className="agent-model">{agent.model}</span>
                  <Tag color="green" style={{ marginLeft: 8 }}>{agent.status}</Tag>
                </div>
              </div>
              <Button
                type="primary"
                size="small"
                style={{ background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
                onClick={() => navigate('/agent-store/chat')}
              >
                對話
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* ===== 線上圖書館預覽 ===== */}
      <div className="home-section library-section">
        <h2 className="section-title">
          <BookOutlined style={{ marginRight: 8 }} />
          線上圖書館
          <span className="section-subtitle">(Online Library)</span>
        </h2>
        <div className="library-preview-grid">
          {libraries[0]?.documents.slice(0, 3).map((doc) => (
            <div
              key={doc.id}
              className="library-preview-card"
              onClick={() => navigate('/library')}
            >
              <div className="library-preview-cover">
                <FilePdfOutlined style={{ fontSize: 36, color: '#bbb' }} />
                <span>檔案封面</span>
              </div>
              <div className="library-preview-name">檔名：{doc.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Home;
