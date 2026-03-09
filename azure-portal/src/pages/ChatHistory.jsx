import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Tag, Input, Select, Empty, Spin, Pagination, Popconfirm, Button, message as antdMessage } from 'antd';
import {
  HistoryOutlined,
  SearchOutlined,
  MessageOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { chatAPI, agentAPI } from '../services/api';
import { adaptSessionList, adaptSessionDetail, adaptAgents } from '../utils/adapters';
import { chatHistory as mockChatHistory, agents as mockAgents } from '../data/mockData';
import { useLanguage } from '../contexts/LanguageContext';
import './ChatHistory.css';

const ChatHistory = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterAgent, setFilterAgent] = useState(null);
  const [agents, setAgents] = useState([]);

  // 載入 Agent 列表（用於篩選下拉）
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await agentAPI.list();
        setAgents(adaptAgents(res.data));
      } catch {
        setAgents(mockAgents);
      }
    };
    fetchAgents();
  }, []);

  // 載入對話歷史
  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      if (filterAgent) params.agent_id = filterAgent;

      const res = await chatAPI.sessions(params);
      const adapted = adaptSessionList(res.data);
      setSessions(adapted.sessions);
      setTotal(adapted.total);
    } catch (err) {
      console.warn('對話歷史 API 失敗，使用 mock 資料', err);
      // Fallback to mock data
      setSessions(
        mockChatHistory.map((c) => ({
          sessionId: String(c.id),
          agentId: String(c.agentId),
          agentName: c.agentName,
          title: c.lastMessage,
          lastMessagePreview: c.lastMessage,
          messageCount: c.messages?.length || 0,
          formattedTime: c.timestamp,
        }))
      );
      setTotal(mockChatHistory.length);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterAgent]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // 前端搜尋過濾（在已載入的資料中搜尋）
  const filteredSessions = sessions.filter((s) => {
    if (!searchText) return true;
    const text = searchText.toLowerCase();
    return (
      (s.agentName || '').toLowerCase().includes(text) ||
      (s.title || '').toLowerCase().includes(text) ||
      (s.lastMessagePreview || '').toLowerCase().includes(text)
    );
  });

  // 點擊查看詳情
  const handleViewDetail = async (session) => {
    setDetailLoading(true);
    setSelectedSession({ ...session, messages: [] });
    try {
      const res = await chatAPI.sessionDetail(session.sessionId);
      const detail = adaptSessionDetail(res.data);
      setSelectedSession(detail);
    } catch {
      // 如果 API 失敗，顯示基本資訊
      setSelectedSession(session);
    } finally {
      setDetailLoading(false);
    }
  };

  // 繼續對話
  const handleContinueChat = (session) => {
    navigate(`/agent-store/chat?session=${session.sessionId}&agent=${session.agentId}`);
  };

  // 刪除對話
  const handleDelete = async (sessionId, e) => {
    e?.stopPropagation();
    try {
      await chatAPI.deleteSession(sessionId);
      antdMessage.success(t('chatHistoryPage.deleteSuccess') || '對話已刪除');
      fetchSessions(); // 重新載入
      if (selectedSession?.sessionId === sessionId) {
        setSelectedSession(null);
      }
    } catch {
      antdMessage.error(t('chatHistoryPage.deleteFailed') || '刪除失敗');
    }
  };

  // 分頁切換
  const handlePageChange = (newPage) => {
    setPage(newPage);
  };

  // Agent 篩選切換時重置頁碼
  const handleAgentFilter = (value) => {
    setFilterAgent(value || null);  // 空字串或 undefined（allowClear）都視為「全部」
    setPage(1);
  };

  if (loading) {
    return (
      <div className="chat-history-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <Spin size="large" tip={t('chatHistoryPage.loadingHistory')} />
      </div>
    );
  }

  return (
    <div className="chat-history-page">
      <div className="history-header">
        <h2 className="page-title">
          <HistoryOutlined style={{ marginRight: 8 }} />
          {t('chatHistoryPage.title')}
        </h2>
        <div className="history-filters">
          <Input
            placeholder={t('chatHistoryPage.searchPlaceholder')}
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Select
            placeholder={t('chatHistoryPage.filterAgent')}
            style={{ width: 200 }}
            value={filterAgent}
            onChange={handleAgentFilter}
            options={[
              { value: '', label: t('chatHistoryPage.allAgents') || '全部 Agent' },
              ...agents.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </div>
      </div>

      <div className="history-list">
        {filteredSessions.length === 0 ? (
          <Empty description={t('chatHistoryPage.noRecords')} style={{ marginTop: 60 }} />
        ) : (
          filteredSessions.map((session) => (
            <div
              key={session.sessionId}
              className="history-item"
              onClick={() => handleViewDetail(session)}
            >
              <div className="history-item-icon" style={{ background: '#2aabb320', color: '#2aabb3' }}>
                🤖
              </div>
              <div className="history-item-info">
                <div className="history-item-name">{session.agentName || session.title}</div>
                <div className="history-item-preview">
                  {session.lastMessagePreview || session.title}
                </div>
              </div>
              <div className="history-item-meta">
                <div className="history-item-time">
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  {session.formattedTime}
                </div>
                {session.messageCount > 0 && (
                  <Tag color="blue" style={{ fontSize: 11 }}>
                    {session.messageCount} {t('chatHistoryPage.messages') || '條'}
                  </Tag>
                )}
              </div>
              <div className="history-item-actions" onClick={(e) => e.stopPropagation()}>
                <PlayCircleOutlined
                  className="history-action-btn continue"
                  title={t('chatHistoryPage.continueChat') || '繼續對話'}
                  onClick={() => handleContinueChat(session)}
                />
                <Popconfirm
                  title={t('chatHistoryPage.confirmDelete') || '確定要刪除這個對話嗎？'}
                  onConfirm={(e) => handleDelete(session.sessionId, e)}
                  okText={t('common.confirm') || '確定'}
                  cancelText={t('common.cancel') || '取消'}
                >
                  <DeleteOutlined className="history-action-btn delete" />
                </Popconfirm>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 分頁 */}
      {total > pageSize && (
        <div className="history-pagination">
          <Pagination
            current={page}
            total={total}
            pageSize={pageSize}
            onChange={handlePageChange}
            showTotal={(t) => `共 ${t} 筆`}
            showSizeChanger={false}
          />
        </div>
      )}

      {/* 對話詳情 Modal */}
      <Modal
        title={
          <span>
            <MessageOutlined style={{ marginRight: 8 }} />
            {selectedSession?.agentName || selectedSession?.title}
          </span>
        }
        open={!!selectedSession}
        onCancel={() => setSelectedSession(null)}
        footer={
          selectedSession
            ? [
                <Button
                  key="continue"
                  type="primary"
                  size="large"
                  block
                  className="history-modal-continue-btn"
                  icon={<PlayCircleOutlined />}
                  onClick={() => {
                    setSelectedSession(null);
                    handleContinueChat(selectedSession);
                  }}
                >
                  {t('chatHistoryPage.continueChat') || '繼續對話'}
                </Button>,
              ]
            : null
        }
        width={600}
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : selectedSession?.messages?.length > 0 ? (
          <div className="history-modal-messages">
            <div className="history-modal-time-label">
              <Tag>{selectedSession.formattedTime || ''}</Tag>
            </div>
            {selectedSession.messages.map((msg, idx) => (
              <div key={idx} className={`history-modal-msg ${msg.role}`}>
                <div className="history-modal-bubble">
                  <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
                  {msg.time && <span className="history-modal-msg-time">{msg.time}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty description={t('chatHistoryPage.noMessages') || '沒有訊息'} />
        )}
      </Modal>
    </div>
  );
};

export default ChatHistory;
