import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Tag, Input, Select, Empty, Spin, message as antdMessage } from 'antd';
import {
  SendOutlined,
  RobotOutlined,
  StopOutlined,
  LoadingOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { agentAPI, chatAPI } from '../services/api';
import { adaptAgents, adaptSessionDetail } from '../utils/adapters';
import { agents as mockAgents } from '../data/mockData';
import { useLanguage } from '../contexts/LanguageContext';
import './AgentChat.css';

const { TextArea } = Input;

const AgentChat = () => {
  const { t, language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();

  // Agent 列表
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState(null);

  // 對話狀態
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  // Refs
  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);

  // 時間格式 locale
  const timeLocale =
    language === 'ja'
      ? 'ja-JP'
      : language === 'th'
        ? 'th-TH'
        : language === 'vi'
          ? 'vi-VN'
          : language === 'en'
            ? 'en-US'
            : 'zh-TW';

  // 載入 Agent 列表
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

  // 從 URL 參數載入歷史對話（從 ChatHistory 跳轉過來）
  useEffect(() => {
    if (loading || agents.length === 0) return;

    const urlSession = searchParams.get('session');
    const urlAgent = searchParams.get('agent');

    if (urlSession && urlAgent) {
      // 選擇 Agent
      const agent = agents.find((a) => a.id === urlAgent);
      if (agent) {
        setSelectedAgent(agent);
        setSessionId(urlSession);

        // 載入歷史訊息
        const loadHistory = async () => {
          try {
            const res = await chatAPI.sessionDetail(urlSession);
            const detail = adaptSessionDetail(res.data);
            if (detail?.messages?.length > 0) {
              setMessages(
                detail.messages.map((msg) => ({
                  role: msg.role,
                  content: msg.content,
                  time: msg.time || '',
                  isStreaming: false,
                }))
              );
            }
          } catch (err) {
            console.warn('載入歷史訊息失敗', err);
          }
        };
        loadHistory();
      }

      // 清除 URL 參數（避免重新整理時重複載入）
      setSearchParams({}, { replace: true });
    }
  }, [loading, agents, searchParams, setSearchParams]);

  // 自動捲動到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 元件卸載時中斷串流
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current();
        abortRef.current = null;
      }
    };
  }, []);

  // 選擇 Agent
  const handleSelectAgent = useCallback(
    (agentId) => {
      // 如果正在串流，先中斷
      if (abortRef.current) {
        abortRef.current();
        abortRef.current = null;
      }

      const agent = agents.find((a) => a.id === agentId);
      setSelectedAgent(agent);
      setMessages([]);
      setSessionId(null);
      setIsStreaming(false);
      setInputValue('');
    },
    [agents],
  );

  // 新對話
  const handleNewChat = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    setMessages([]);
    setSessionId(null);
    setIsStreaming(false);
  }, []);

  // 中斷串流
  const handleStopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  // 發送訊息（Streaming）
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || !selectedAgent || isStreaming) return;

    const userContent = inputValue.trim();
    const now = new Date().toLocaleTimeString(timeLocale, {
      hour: '2-digit',
      minute: '2-digit',
    });

    // 加入使用者訊息
    const userMsg = { role: 'user', content: userContent, time: now };

    // 加入空的 assistant 訊息（等待串流填充）
    const assistantMsg = {
      role: 'assistant',
      content: '',
      time: '',
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInputValue('');
    setIsStreaming(true);

    // 呼叫 streaming API
    const abort = chatAPI.stream(
      {
        agent_id: selectedAgent.id,
        message: userContent,
        session_id: sessionId,
      },
      // onMessage
      (eventData) => {
        if (eventData.type === 'content') {
          // 更新最後一條 assistant 訊息的 accumulated 內容
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: eventData.accumulated || updated[lastIdx].content + (eventData.data || ''),
              };
            }
            return updated;
          });
        } else if (eventData.type === 'complete') {
          // 對話完成：更新 session_id 和 thread_id
          const newSessionId = eventData.session_id;
          const newThreadId = eventData.thread_id;

          if (newSessionId) {
            setSessionId(newSessionId);
          } else if (newThreadId) {
            // 向後相容：舊版只回傳 thread_id
            setSessionId(newThreadId);
          }

          const completeTime = new Date().toLocaleTimeString(timeLocale, {
            hour: '2-digit',
            minute: '2-digit',
          });
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: eventData.content || updated[lastIdx].content,
                time: completeTime,
                isStreaming: false,
              };
            }
            return updated;
          });
          setIsStreaming(false);
          abortRef.current = null;
        }
      },
      // onComplete
      () => {
        setIsStreaming(false);
        abortRef.current = null;
        // 確保最後一條訊息標記為非串流
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'assistant' && updated[lastIdx].isStreaming) {
            const completeTime = new Date().toLocaleTimeString(timeLocale, {
              hour: '2-digit',
              minute: '2-digit',
            });
            updated[lastIdx] = {
              ...updated[lastIdx],
              time: completeTime,
              isStreaming: false,
            };
          }
          return updated;
        });
      },
      // onError
      (error) => {
        console.error('❌ Chat stream error:', error);
        setIsStreaming(false);
        abortRef.current = null;

        // 移除空的 assistant 訊息，顯示錯誤
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: t('agentChat.errorReply'),
              time: new Date().toLocaleTimeString(timeLocale, {
                hour: '2-digit',
                minute: '2-digit',
              }),
              isStreaming: false,
              isError: true,
            };
          }
          return updated;
        });

        antdMessage.error(error.message || t('agentChat.errorReply'));
      },
    );

    abortRef.current = abort;
  }, [inputValue, selectedAgent, isStreaming, sessionId, timeLocale, t]);

  // Loading 狀態
  if (loading) {
    return (
      <div
        className="agent-chat-page"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 300,
        }}
      >
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
          {selectedAgent && (
            <Button
              icon={<PlusOutlined />}
              onClick={handleNewChat}
              disabled={isStreaming}
              size="small"
            >
              {t('agentChat.newChat')}
            </Button>
          )}
          {sessionId && (
            <Tag color="blue" style={{ marginLeft: 'auto', fontSize: 11 }}>
              {t('agentChat.multiTurn')}
            </Tag>
          )}
        </div>

        <div className="chat-messages">
          {!selectedAgent ? (
            <Empty
              description={t('agentChat.selectAgentFirst')}
              style={{ marginTop: 100 }}
            />
          ) : messages.length === 0 ? (
            <Empty
              description={t('agentChat.selectedAgent', {
                name: selectedAgent.name,
              })}
              style={{ marginTop: 100 }}
            />
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role}`}>
                <div
                  className={`chat-message-bubble ${msg.isError ? 'error' : ''}`}
                >
                  {msg.role === 'assistant' && msg.isStreaming && !msg.content ? (
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  ) : (
                    <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                      {msg.content}
                      {msg.isStreaming && <span className="streaming-cursor">▊</span>}
                    </p>
                  )}
                  {msg.time && (
                    <span className="chat-message-time">{msg.time}</span>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <TextArea
            placeholder={
              selectedAgent
                ? isStreaming
                  ? t('agentChat.waitingReply')
                  : t('agentChat.sendMessage', { name: selectedAgent.name })
                : t('agentChat.selectAgentPlaceholder')
            }
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={!selectedAgent || isStreaming}
          />
          {isStreaming ? (
            <Button
              type="primary"
              danger
              icon={<StopOutlined />}
              onClick={handleStopStreaming}
              style={{ minWidth: 80 }}
            >
              {t('agentChat.stop')}
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              disabled={!selectedAgent || !inputValue.trim()}
              style={{
                background: 'var(--primary-color)',
                borderColor: 'var(--primary-color)',
              }}
            >
              {t('common.send')}
            </Button>
          )}
        </div>
      </div>

      {/* 右側 Agent 列表 */}
      <div className="chat-agent-panel">
        <div className="agent-panel-header">
          <span className="agent-panel-title">
            {t('agentChat.availableAgents')}
          </span>
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
                style={{
                  background: agent.color + '20',
                  color: agent.color,
                }}
              >
                {agent.icon}
              </div>
              <div className="agent-panel-info">
                <div className="agent-panel-name">{agent.name}</div>
                <div className="agent-panel-meta">
                  <span>{agent.model}</span>
                  <Tag
                    color="green"
                    style={{ marginLeft: 6, fontSize: 11 }}
                  >
                    {agent.status}
                  </Tag>
                </div>
              </div>
              <Button
                type="primary"
                size="small"
                style={{
                  background: 'var(--primary-color)',
                  borderColor: 'var(--primary-color)',
                  fontSize: 12,
                }}
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
