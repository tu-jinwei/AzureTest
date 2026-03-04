import React, { useState, useEffect } from 'react';
import {
  Table,
  Tag,
  Switch,
  Button,
  Modal,
  Transfer,
  message,
  Space,
  Badge,
  Spin,
} from 'antd';
import {
  SafetyOutlined,
  UserAddOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { agentAPI } from '../../services/api';
import { adaptAgents } from '../../utils/adapters';
import { agents as mockAgents, userList } from '../../data/mockData';
import '../Settings.css';

const AgentPermissions = () => {
  const [agentData, setAgentData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [transferModal, setTransferModal] = useState(null);
  const [targetKeys, setTargetKeys] = useState([]);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await agentAPI.listAll();
      const adapted = adaptAgents(res.data).map((a) => ({
        ...a,
        published: a.status === '可用',
        assignedUsers: a.assignedUsers || [1, 2], // 預設指派給前兩位使用者
      }));
      setAgentData(adapted);
    } catch (err) {
      console.warn('Agent API 失敗，使用 mock 資料', err);
      setAgentData(
        mockAgents.map((a) => ({
          ...a,
          published: true,
          assignedUsers: [1, 2],
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handlePublishToggle = async (agentId, checked) => {
    try {
      await agentAPI.updatePublish(agentId, checked);
      message.success(checked ? 'Agent 已上架' : 'Agent 已下架');
      fetchAgents();
    } catch (err) {
      message.error('操作失敗：' + (err.response?.data?.detail || err.message));
    }
  };

  const handleACLUpdate = async (agentId, aclData) => {
    try {
      await agentAPI.updateACL(agentId, aclData);
      message.success('Agent 授權規則已更新');
      fetchAgents();
    } catch (err) {
      message.error('更新失敗：' + (err.response?.data?.detail || err.message));
    }
  };

  const openAssignModal = (agent) => {
    setTargetKeys(agent.assignedUsers.map(String));
    setTransferModal(agent);
  };

  const handleAssignSave = () => {
    setAgentData((prev) =>
      prev.map((a) =>
        a.id === transferModal.id
          ? { ...a, assignedUsers: targetKeys.map(Number) }
          : a
      )
    );
    message.success('使用者權限已更新');
    setTransferModal(null);
  };

  const columns = [
    {
      title: 'Agent',
      key: 'agent',
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: record.color + '20',
              color: record.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
            }}
          >
            {record.icon}
          </div>
          <div>
            <div style={{ fontWeight: 500 }}>{record.name}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{record.model}</div>
          </div>
        </div>
      ),
    },
    {
      title: '上架狀態',
      key: 'published',
      width: 120,
      render: (_, record) => (
        <Switch
          checked={record.published}
          onChange={(checked) => handlePublishToggle(record.id, checked)}
          checkedChildren="上架"
          unCheckedChildren="下架"
        />
      ),
    },
    {
      title: '已授權使用者',
      key: 'users',
      width: 160,
      render: (_, record) => (
        <Badge count={record.assignedUsers.length} style={{ backgroundColor: 'var(--primary-color)' }}>
          <Tag>{record.assignedUsers.length} / 50 人</Tag>
        </Badge>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<UserAddOutlined />}
          onClick={() => openAssignModal(record)}
          style={{ background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
        >
          指派使用者
        </Button>
      ),
    },
  ];

  const transferData = userList.map((u) => ({
    key: String(u.id),
    title: `${u.name} (${u.department})`,
    description: u.email,
  }));

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2 className="page-title">
          <SafetyOutlined style={{ marginRight: 8 }} />
          Agent 權限設定
        </h2>
      </div>

      <div className="settings-content">
        <Table
          columns={columns}
          dataSource={agentData}
          rowKey="id"
          pagination={false}
          loading={loading}
          locale={{ emptyText: '尚無 Agent' }}
        />
      </div>

      <Modal
        title={
          <span>
            <UserAddOutlined style={{ marginRight: 8 }} />
            指派使用者 - {transferModal?.name}
          </span>
        }
        open={!!transferModal}
        onCancel={() => setTransferModal(null)}
        onOk={handleAssignSave}
        okText="儲存"
        cancelText="取消"
        width={650}
        okButtonProps={{ style: { background: 'var(--primary-color)', borderColor: 'var(--primary-color)' } }}
      >
        <p style={{ marginBottom: 16, color: '#666' }}>
          最多可指派 50 位使用者。目前已選擇 {targetKeys.length} 位。
        </p>
        <Transfer
          dataSource={transferData}
          targetKeys={targetKeys}
          onChange={setTargetKeys}
          render={(item) => item.title}
          titles={['未授權', '已授權']}
          listStyle={{ width: 260, height: 300 }}
          showSearch
          searchPlaceholder="搜尋使用者..."
        />
      </Modal>
    </div>
  );
};

export default AgentPermissions;
