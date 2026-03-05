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
import { useLanguage } from '../../contexts/LanguageContext';
import '../Settings.css';

const AgentPermissions = () => {
  const { t } = useLanguage();
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
      message.success(checked ? t('agentPermissions.agentOnline') : t('agentPermissions.agentOffline'));
      fetchAgents();
    } catch (err) {
      message.error(t('agentPermissions.operationFailed') + '：' + (err.response?.data?.detail || err.message));
    }
  };

  const handleACLUpdate = async (agentId, aclData) => {
    try {
      await agentAPI.updateACL(agentId, aclData);
      message.success(t('agentPermissions.aclUpdated'));
      fetchAgents();
    } catch (err) {
      message.error(t('agentPermissions.updateFailed') + '：' + (err.response?.data?.detail || err.message));
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
    message.success(t('agentPermissions.permissionUpdated'));
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
      title: t('agentPermissions.publishStatus'),
      key: 'published',
      width: 120,
      render: (_, record) => (
        <Switch
          checked={record.published}
          onChange={(checked) => handlePublishToggle(record.id, checked)}
          checkedChildren={t('agentPermissions.online')}
          unCheckedChildren={t('agentPermissions.offline')}
        />
      ),
    },
    {
      title: t('agentPermissions.authorizedUsers'),
      key: 'users',
      width: 160,
      render: (_, record) => (
        <Badge count={record.assignedUsers.length} style={{ backgroundColor: 'var(--primary-color)' }}>
          <Tag>{record.assignedUsers.length} / 50 {t('common.person')}</Tag>
        </Badge>
      ),
    },
    {
      title: t('common.actions'),
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
          {t('agentPermissions.assignUsers')}
        </Button>
      ),
    },
  ];

  const transferData = userList.map((u) => ({
    key: String(u.id),
    title: `${u.name} (${t(`departments.${u.department}`) || u.department})`,
    description: u.email,
  }));

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2 className="page-title">
          <SafetyOutlined style={{ marginRight: 8 }} />
          {t('agentPermissions.title')}
        </h2>
      </div>

      <div className="settings-content">
        <Table
          columns={columns}
          dataSource={agentData}
          rowKey="id"
          pagination={false}
          loading={loading}
          locale={{ emptyText: t('agentPermissions.noAgents') }}
        />
      </div>

      <Modal
        title={
          <span>
            <UserAddOutlined style={{ marginRight: 8 }} />
            {t('agentPermissions.assignUsersTitle', { name: transferModal?.name })}
          </span>
        }
        open={!!transferModal}
        onCancel={() => setTransferModal(null)}
        onOk={handleAssignSave}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={650}
        okButtonProps={{ style: { background: 'var(--primary-color)', borderColor: 'var(--primary-color)' } }}
      >
        <p style={{ marginBottom: 16, color: '#666' }}>
          {t('agentPermissions.maxUsers', { count: targetKeys.length })}
        </p>
        <Transfer
          dataSource={transferData}
          targetKeys={targetKeys}
          onChange={setTargetKeys}
          render={(item) => item.title}
          titles={[t('agentPermissions.unauthorized'), t('agentPermissions.authorized')]}
          listStyle={{ width: 260, height: 300 }}
          showSearch
          searchPlaceholder={t('agentPermissions.searchUsers')}
        />
      </Modal>
    </div>
  );
};

export default AgentPermissions;
