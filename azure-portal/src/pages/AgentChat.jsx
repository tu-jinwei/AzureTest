import React, { useState, useEffect } from 'react';
import { Button, Tag, Input, Select, Empty, Spin } from 'antd';
import { SendOutlined, RobotOutlined } from '@ant-design/icons';
import { agentAPI } from '../services/api';
import { adaptAgents } from '../utils/adapters';
import { agents as mockAgents } from '../data/mockData';
import { useLanguage } from '../contexts/LanguageContext';
import './AgentChat.css';

const { TextArea } = Input;

const AgentChat = () => {
  const { t, language } = useLanguage();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');

  // 根據語言決定時間格式的 locale
  const timeLocale = language === 'ja' ? 'ja-JP' : language === 'th' ? 'th-TH' : language === 'vi' ? 'vi-VN' : language === 'en' ? 'en-US' : 'zh-TW';

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await agentAPI.list();
        setAgents(adaptAgents(res.data));
      } catch (err) {
        console.warn('Agent API 失敗，使用 mock 資料', err);
        setAgents(mockAgents);
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
  }, []);

  const handleSelectAgent = (agentId) => {
    const agent = agents.find((a) => a.id === agentId);
    setSelectedAgent(agent);
    setMessages([]);
  };

  const handleSend = () => {
    if (!inputValue.trim() || !selectedAgent) return;
    const userMsg = { role: 'user', content: inputValue, time: new Date().toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' }) };
    const botMsg = {
      role: 'assistant',
      content: t('agentChat.mockReply', { name: selectedAgent.name, message: inputValue }),
      time: new Date().toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInputValue('');
  };

  if (loading) {
    return (
      <div className="agent-chat-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <Spin size="large" tip={t('agentChat.loadingAgents')} />
      </div>
    );
  }

  return (
    <div className="agent-chat-page">
      {/* 主聊天區 */}
      <div className="chat-main">
        <div className="chat-header">
          <RobotOutlined style={{ fontSize: 20 }} />
          <Select
            placeholder={t('agentChat.selectAgent')}
            style={{ width: 300 }}
            value={selectedAgent?.id}
            onChange={handleSelectAgent}
            options={agents.map((a) => ({ value: a.id, label: a.name }))}
          />
        </div>

        <div className="chat-messages">
          {!selectedAgent ? (
            <Empty description={t('agentChat.selectAgentFirst')} style={{ marginTop: 100 }} />
          ) : messages.length === 0 ? (
            <Empty description={t('agentChat.selectedAgent', { name: selectedAgent.name })} style={{ marginTop: 100 }} />
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role}`}>
                <div className="chat-message-bubble">
                  <p>{msg.content}</p>
                  <span className="chat-message-time">{msg.time}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="chat-input-area">
          <TextArea
            placeholder={selectedAgent ? t('agentChat.sendMessage', { name: selectedAgent.name }) : t('agentChat.selectAgentPlaceholder')}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={!selectedAgent}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            disabled={!selectedAgent || !inputValue.trim()}
            style={{ background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
          >
            {t('common.send')}
          </Button>
        </div>
      </div>

      {/* 右側 Agent 列表 */}
      <div className="chat-agent-panel">
        <div className="agent-panel-header">
          <span className="agent-panel-title">{t('agentChat.availableAgents')}</span>
          <span className="agent-panel-view-all">{t('common.viewAll')}</span>
        </div>
        <div className="agent-panel-list">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`agent-panel-item ${selectedAgent?.id === agent.id ? 'selected' : ''}`}
              onClick={() => handleSelectAgent(agent.id)}
            >
              <div
                className="agent-panel-icon"
                style={{ background: agent.color + '20', color: agent.color }}
              >
                {agent.icon}
              </div>
              <div className="agent-panel-info">
                <div className="agent-panel-name">{agent.name}</div>
                <div className="agent-panel-meta">
                  <span>{agent.model}</span>
                  <Tag color="green" style={{ marginLeft: 6, fontSize: 11 }}>{agent.status}</Tag>
                </div>
              </div>
              <Button
                type="primary"
                size="small"
                style={{ background: 'var(--primary-color)', borderColor: 'var(--primary-color)', fontSize: 12 }}
              >
                {t('common.chat')}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AgentChat;
