import React, { useState, useEffect } from 'react';
import { Modal, Tag, Input, Select, Empty, Spin } from 'antd';
import {
  HistoryOutlined,
  SearchOutlined,
  MessageOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { chatAPI } from '../services/api';
import { adaptChatHistory } from '../utils/adapters';
import { chatHistory as mockChatHistory, agents } from '../data/mockData';
import './ChatHistory.css';

const ChatHistory = () => {
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [filterAgent, setFilterAgent] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await chatAPI.history();
        setChatHistory(adaptChatHistory(res.data));
      } catch (err) {
        console.warn('聊天歷史 API 失敗（MongoDB 可能未連線），使用 mock 資料', err);
        setChatHistory(mockChatHistory);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  const filteredHistory = chatHistory.filter((chat) => {
    const matchSearch = !searchText || chat.agentName.includes(searchText) || chat.lastMessage.includes(searchText);
    const matchAgent = !filterAgent || chat.agentId === filterAgent;
    return matchSearch && matchAgent;
  });

  if (loading) {
    return (
      <div className="chat-history-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <Spin size="large" tip="載入對話歷史中..." />
      </div>
    );
  }

  return (
    <div className="chat-history-page">
      <div className="history-header">
        <h2 className="page-title">
          <HistoryOutlined style={{ marginRight: 8 }} />
          對話歷史
        </h2>
        <div className="history-filters">
          <Input
            placeholder="搜尋對話..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Select
            placeholder="篩選 Agent"
            style={{ width: 200 }}
            value={filterAgent}
            onChange={setFilterAgent}
            allowClear
            options={agents.map((a) => ({ value: a.id, label: a.name }))}
          />
        </div>
      </div>

      <div className="history-list">
        {filteredHistory.length === 0 ? (
          <Empty description="沒有找到對話記錄" style={{ marginTop: 60 }} />
        ) : (
          filteredHistory.map((chat) => {
            const agent = agents.find((a) => a.id === chat.agentId);
            return (
              <div
                key={chat.id}
                className="history-item"
                onClick={() => setSelectedChat(chat)}
              >
                <div
                  className="history-item-icon"
                  style={{ background: (agent?.color || '#999') + '20', color: agent?.color || '#999' }}
                >
                  {agent?.icon || '🤖'}
                </div>
                <div className="history-item-info">
                  <div className="history-item-name">{chat.agentName}</div>
                  <div className="history-item-preview">{chat.lastMessage}</div>
                </div>
                <div className="history-item-time">
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  {chat.timestamp}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 對話詳情 Modal */}
      <Modal
        title={
          <span>
            <MessageOutlined style={{ marginRight: 8 }} />
            {selectedChat?.agentName}
          </span>
        }
        open={!!selectedChat}
        onCancel={() => setSelectedChat(null)}
        footer={null}
        width={600}
      >
        {selectedChat && (
          <div className="history-modal-messages">
            <div className="history-modal-time-label">
              <Tag>{selectedChat.timestamp}</Tag>
            </div>
            {selectedChat.messages.map((msg, idx) => (
              <div key={idx} className={`history-modal-msg ${msg.role}`}>
                <div className="history-modal-bubble">
                  <p>{msg.content}</p>
                  <span className="history-modal-msg-time">{msg.time}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ChatHistory;
