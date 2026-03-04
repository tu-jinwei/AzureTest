import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Popconfirm,
  message,
  Space,
  Badge,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  UserSwitchOutlined,
  StopOutlined,
  CheckCircleOutlined,
  TeamOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { userAPI } from '../../services/api';
import { adaptUsers, toUserCreate } from '../../utils/adapters';
import {
  userList as mockUserList,
  ROLES,
  ROLE_LABELS,
  ROLE_COLORS,
  countries,
} from '../../data/mockData';
import '../Settings.css';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [filterRole, setFilterRole] = useState(null);
  const [filterCountry, setFilterCountry] = useState(null);
  const [form] = Form.useForm();

  // ===== 資料載入 =====
  const fetchUsers = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      const res = await userAPI.list(filters);
      setUsers(adaptUsers(res.data));
    } catch (err) {
      console.warn('使用者 API 失敗，使用 mock 資料', err);
      setUsers(mockUserList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ===== 搜尋/篩選 =====
  const handleSearch = (value) => {
    setSearchText(value);
    fetchUsers({
      search: value || undefined,
      role: filterRole || undefined,
      country: filterCountry || undefined,
    });
  };

  const handleFilterRole = (role) => {
    setFilterRole(role);
    fetchUsers({
      search: searchText || undefined,
      role: role || undefined,
      country: filterCountry || undefined,
    });
  };

  const handleFilterCountry = (country) => {
    setFilterCountry(country);
    fetchUsers({
      search: searchText || undefined,
      role: filterRole || undefined,
      country: country || undefined,
    });
  };

  // ===== 新增使用者 =====
  const handleAdd = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ role: ROLES.USER, status: 'active' });
    setModalOpen(true);
  };

  // ===== 編輯使用者 =====
  const handleEdit = (record) => {
    setEditingUser(record);
    form.setFieldsValue({
      name: record.name,
      email: record.email,
      department: record.department,
      role: record.role,
      country: record.country,
    });
    setModalOpen(true);
  };

  // ===== 儲存（新增 / 更新）=====
  const handleSave = () => {
    form.validateFields().then(async (values) => {
      if (editingUser) {
        // 編輯模式 → 呼叫 update API
        try {
          await userAPI.update(editingUser.email, {
            name: values.name,
            department: values.department,
            role: values.role,
          });
          message.success('使用者資料已更新');
          fetchUsers({
            search: searchText || undefined,
            role: filterRole || undefined,
            country: filterCountry || undefined,
          });
        } catch (err) {
          message.error('更新失敗：' + (err.response?.data?.detail || err.message));
        }
      } else {
        // 新增模式 → 呼叫 create API
        try {
          await userAPI.create(toUserCreate(values));
          message.success('使用者已建立');
          fetchUsers({
            search: searchText || undefined,
            role: filterRole || undefined,
            country: filterCountry || undefined,
          });
        } catch (err) {
          if (err.response?.status === 409) {
            message.error('此 Email 已存在');
          } else {
            message.error('建立失敗：' + (err.response?.data?.detail || err.message));
          }
        }
      }
      setModalOpen(false);
      form.resetFields();
    });
  };

  // ===== 停用/啟用 =====
  const handleToggleStatus = async (email, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await userAPI.updateStatus(email, newStatus);
      message.success(newStatus === 'active' ? '帳號已啟用' : '帳號已停用');
      fetchUsers({
        search: searchText || undefined,
        role: filterRole || undefined,
        country: filterCountry || undefined,
      });
    } catch (err) {
      message.error('操作失敗：' + (err.response?.data?.detail || err.message));
    }
  };

  // ===== 角色變更 =====
  const handleRoleChange = async (email, newRole) => {
    try {
      await userAPI.updateRole(email, newRole);
      message.success('角色已更新');
      fetchUsers({
        search: searchText || undefined,
        role: filterRole || undefined,
        country: filterCountry || undefined,
      });
    } catch (err) {
      message.error('角色更新失敗：' + (err.response?.data?.detail || err.message));
    }
  };

  // ===== 前端篩選（作為 API 篩選的補充）=====
  const filteredUsers = users.filter((u) => {
    const matchSearch =
      !searchText ||
      u.name.toLowerCase().includes(searchText.toLowerCase()) ||
      u.email.toLowerCase().includes(searchText.toLowerCase()) ||
      u.department.includes(searchText);
    const matchRole = !filterRole || u.role === filterRole;
    const matchCountry = !filterCountry || u.country === filterCountry;
    return matchSearch && matchRole && matchCountry;
  });

  const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const countryOptions = countries.map((c) => ({
    value: c.code,
    label: c.name,
  }));

  const columns = [
    {
      title: '使用者',
      key: 'user',
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: ROLE_COLORS[record.role] + '30',
              color: ROLE_COLORS[record.role],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {record.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 500 }}>{record.name}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{record.email}</div>
          </div>
        </div>
      ),
    },
    {
      title: '部門',
      dataIndex: 'department',
      key: 'department',
      width: 120,
    },
    {
      title: '國家',
      dataIndex: 'country',
      key: 'country',
      width: 100,
      render: (code) => {
        const country = countries.find((c) => c.code === code);
        return country ? country.name : code;
      },
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 160,
      render: (role, record) => (
        <Select
          value={role}
          size="small"
          style={{ width: 140 }}
          onChange={(val) => handleRoleChange(record.email, val)}
          options={roleOptions}
          popupMatchSelectWidth={false}
        />
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) =>
        status === 'active' ? (
          <Badge status="success" text={<Tag color="green">啟用</Tag>} />
        ) : (
          <Badge status="error" text={<Tag color="red">停用</Tag>} />
        ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            style={{ color: 'var(--primary-color)' }}
          >
            編輯
          </Button>
          <Popconfirm
            title={
              record.status === 'active'
                ? '確定要停用此帳號嗎？'
                : '確定要啟用此帳號嗎？'
            }
            onConfirm={() => handleToggleStatus(record.email, record.status)}
            okText="確定"
            cancelText="取消"
          >
            {record.status === 'active' ? (
              <Button type="text" danger icon={<StopOutlined />}>
                停用
              </Button>
            ) : (
              <Button
                type="text"
                icon={<CheckCircleOutlined />}
                style={{ color: 'var(--primary-color)' }}
              >
                啟用
              </Button>
            )}
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2 className="page-title">
          <TeamOutlined style={{ marginRight: 8 }} />
          使用者管理
        </h2>
        <div className="settings-actions">
          <Input
            placeholder="搜尋使用者..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            style={{ width: 180 }}
            allowClear
          />
          <Select
            placeholder="篩選角色"
            style={{ width: 150 }}
            value={filterRole}
            onChange={handleFilterRole}
            allowClear
            options={roleOptions}
          />
          <Select
            placeholder="篩選國家"
            style={{ width: 120 }}
            value={filterCountry}
            onChange={handleFilterCountry}
            allowClear
            options={countryOptions}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            style={{
              background: 'var(--primary-color)',
              borderColor: 'var(--primary-color)',
            }}
          >
            新增使用者
          </Button>
        </div>
      </div>

      <div className="settings-content">
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(ROLE_LABELS).map(([role, label]) => {
            const count = users.filter((u) => u.role === role).length;
            return (
              <Tag
                key={role}
                color={ROLE_COLORS[role]}
                style={{ cursor: 'pointer', fontSize: 12 }}
                onClick={() => handleFilterRole(filterRole === role ? null : role)}
              >
                {label}: {count} 人
              </Tag>
            );
          })}
          <Tag style={{ fontSize: 12 }}>
            總計: {users.length} 人 | 啟用: {users.filter((u) => u.status === 'active').length} 人
          </Tag>
        </div>

        <Table
          columns={columns}
          dataSource={filteredUsers}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: '尚無使用者' }}
          loading={loading}
        />
      </div>

      {/* 新增/編輯使用者 Modal */}
      <Modal
        title={
          <span>
            <UserSwitchOutlined style={{ marginRight: 8 }} />
            {editingUser ? '編輯使用者' : '新增使用者'}
          </span>
        }
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={handleSave}
        okText="儲存"
        cancelText="取消"
        okButtonProps={{
          style: {
            background: 'var(--primary-color)',
            borderColor: 'var(--primary-color)',
          },
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '請輸入姓名' }]}
          >
            <Input placeholder="請輸入姓名" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: '請輸入 Email' },
              { type: 'email', message: '請輸入有效的 Email' },
            ]}
          >
            <Input placeholder="請輸入 Email" disabled={!!editingUser} />
          </Form.Item>
          <Form.Item
            name="department"
            label="部門"
            rules={[{ required: true, message: '請輸入部門' }]}
          >
            <Input placeholder="請輸入部門" />
          </Form.Item>
          <Form.Item
            name="country"
            label="所屬國家"
            rules={[{ required: true, message: '請選擇所屬國家' }]}
          >
            <Select
              placeholder="請選擇所屬國家"
              options={countryOptions}
            />
          </Form.Item>
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '請選擇角色' }]}
          >
            <Select placeholder="請選擇角色" options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserManagement;
