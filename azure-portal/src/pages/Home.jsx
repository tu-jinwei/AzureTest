import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Button, Tag, Spin, message, Select } from 'antd';
import {
  SoundOutlined,
  RobotOutlined,
  BookOutlined,
  FilePdfOutlined,
  LinkOutlined,
  DownloadOutlined,
  PaperClipOutlined,
  EyeOutlined,
  LoadingOutlined,
  FileOutlined,
} from '@ant-design/icons';
import { announcementAPI, agentAPI, libraryAPI } from '../services/api';
import { adaptAnnouncements, adaptAgents, adaptLibraryDocs } from '../utils/adapters';
import { announcements as mockAnnouncements, agents as mockAgents, libraries as mockLibraries } from '../data/mockData';
import { useCountry } from '../contexts/CountryContext';
import './Home.css';

const Home = () => {
  const navigate = useNavigate();
  const { effectiveCountry } = useCountry();

  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [agents, setAgents] = useState([]);
  const [libraries, setLibraries] = useState([]);
  const [loading, setLoading] = useState(true);

  // PDF 預覽狀態
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFilename, setPreviewFilename] = useState(null);

  const fetchData = async (country) => {
    setLoading(true);

    // 公告
    try {
      const res = await announcementAPI.list(country);
      setAnnouncements(adaptAnnouncements(res.data));
    } catch (err) {
      console.warn('公告 API 失敗，使用 mock 資料', err);
      setAnnouncements(mockAnnouncements);
    }

    // Agent（全球共用，不受國家影響）
    try {
      const res = await agentAPI.list();
      setAgents(adaptAgents(res.data));
    } catch (err) {
      console.warn('Agent API 失敗，使用 mock 資料', err);
      setAgents(mockAgents);
    }

    // 圖書館
    try {
      const res = await libraryAPI.list(country);
      setLibraries(adaptLibraryDocs(res.data));
    } catch (err) {
      console.warn('圖書館 API 失敗，使用 mock 資料', err);
      setLibraries(mockLibraries);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData(effectiveCountry);
  }, [effectiveCountry]);

  // 載入公告附件 PDF 預覽
  const loadAnnouncementPreview = useCallback(async (announcement, filename) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (!announcement?.attachments?.length) return;

    setPreviewLoading(true);
    setPreviewFilename(filename || null);
    try {
      const res = await announcementAPI.preview(announcement.id, effectiveCountry, filename);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err) {
      console.error('PDF 預覽載入失敗:', err);
      setPreviewUrl(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [previewUrl, effectiveCountry]);

  // 選擇公告時自動載入預覽
  useEffect(() => {
    if (selectedAnnouncement?.attachments?.length > 0) {
      loadAnnouncementPreview(selectedAnnouncement);
    }
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAnnouncement?.id]);

  // 關閉公告 Modal
  const handleCloseAnnouncement = () => {
    setSelectedAnnouncement(null);
    setPreviewFilename(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  // 下載公告附件
  const handleDownloadAttachment = async (announcement, filename) => {
    try {
      const res = await announcementAPI.download(announcement.id, effectiveCountry, filename);
      let downloadName = filename || announcement.attachment?.name || 'attachment';
      const disposition = res.headers['content-disposition'];
      if (disposition) {
        const utf8Match = disposition.match(/filename\*=utf-8''(.+)/i);
        const plainMatch = disposition.match(/filename="?([^";\n]+)"?/i);
        if (utf8Match) downloadName = decodeURIComponent(utf8Match[1]);
        else if (plainMatch) downloadName = plainMatch[1];
      }
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      message.error('下載失敗：' + (err.response?.data?.detail || err.message));
    }
  };

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
              {item.attachments?.length > 0 && (
                <PaperClipOutlined style={{ color: '#999', marginLeft: 4 }} />
              )}
            </div>
          ))}
          {announcements.filter((a) => a.isNew).length === 0 && (
            <div style={{ color: '#999', padding: '12px 0' }}>目前沒有新公告</div>
          )}
        </div>
      </div>

      {/* ===== 公告彈出視窗 ===== */}
      <Modal
        title={selectedAnnouncement?.subject}
        open={!!selectedAnnouncement}
        onCancel={handleCloseAnnouncement}
        footer={[
          // 多附件下載
          selectedAnnouncement?.attachments?.length > 1 ? (
            <Select
              key="file-download"
              placeholder="選擇要下載的附件"
              style={{ width: 220, marginRight: 8, textAlign: 'left' }}
              onSelect={(filename) => handleDownloadAttachment(selectedAnnouncement, filename)}
              options={selectedAnnouncement.attachments.map((a) => ({
                value: a.name,
                label: (
                  <span>
                    <FilePdfOutlined style={{ marginRight: 4, color: '#e74c3c' }} />
                    {a.name} {a.fileSize ? `(${(a.fileSize / 1024 / 1024).toFixed(1)} MB)` : ''}
                  </span>
                ),
              }))}
            />
          ) : selectedAnnouncement?.attachments?.length === 1 ? (
            <Button
              key="download"
              type="primary"
              icon={<DownloadOutlined />}
              style={{ background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
              onClick={() => handleDownloadAttachment(selectedAnnouncement)}
            >
              下載附件
            </Button>
          ) : null,
          <Button key="close" onClick={handleCloseAnnouncement}>
            關閉
          </Button>,
        ]}
        width={800}
        styles={{ body: { maxHeight: '75vh', overflow: 'auto' } }}
      >
        {selectedAnnouncement && (
          <div className="announcement-modal-content">
            <p className="announcement-modal-text">
              {selectedAnnouncement.content}
            </p>

            {/* PDF 預覽區域 */}
            {selectedAnnouncement.attachments?.length > 0 ? (
              <div className="announcement-modal-attachment-area">
                {previewLoading ? (
                  <div className="announcement-preview-placeholder">
                    <Spin indicator={<LoadingOutlined style={{ fontSize: 36 }} spin />} />
                    <p>載入 PDF 預覽中...</p>
                  </div>
                ) : previewUrl ? (
                  <iframe
                    src={previewUrl}
                    className="announcement-preview-iframe"
                    title="PDF Preview"
                  />
                ) : (
                  <div className="announcement-preview-placeholder">
                    <FilePdfOutlined style={{ fontSize: 48, color: '#e74c3c' }} />
                    <p>無法載入預覽</p>
                  </div>
                )}

                {/* 多附件切換列表 */}
                {selectedAnnouncement.attachments.length > 1 && (
                  <div className="announcement-file-list">
                    <strong style={{ marginBottom: 8, display: 'block' }}>
                      <FileOutlined style={{ marginRight: 4 }} />
                      附件列表（{selectedAnnouncement.attachments.length} 個檔案）
                    </strong>
                    <div className="announcement-file-tags">
                      {selectedAnnouncement.attachments.map((a, i) => (
                        <Tag
                          key={i}
                          color={previewFilename === a.name || (!previewFilename && i === 0) ? 'blue' : 'default'}
                          className="announcement-file-tag"
                          onClick={() => loadAnnouncementPreview(selectedAnnouncement, a.name)}
                        >
                          <FilePdfOutlined style={{ marginRight: 4 }} />
                          {a.name}
                          {a.fileSize ? (
                            <span className="announcement-file-size">
                              ({(a.fileSize / 1024 / 1024).toFixed(1)} MB)
                            </span>
                          ) : null}
                        </Tag>
                      ))}
                    </div>
                  </div>
                )}

                {/* 單附件顯示檔名 */}
                {selectedAnnouncement.attachments.length === 1 && (
                  <div className="announcement-single-file">
                    <PaperClipOutlined style={{ marginRight: 4 }} />
                    {selectedAnnouncement.attachments[0].name}
                  </div>
                )}
              </div>
            ) : (
              <div className="announcement-modal-attachment">
                <div style={{ color: '#999', padding: '12px 0' }}>
                  <PaperClipOutlined style={{ marginRight: 4 }} />
                  此公告沒有附件
                </div>
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
          {(!libraries[0] || libraries[0].documents.length === 0) && (
            <div style={{ color: '#999', padding: '12px 0' }}>目前沒有圖書館文件</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;
