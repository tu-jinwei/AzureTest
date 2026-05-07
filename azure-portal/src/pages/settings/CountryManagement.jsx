import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Popconfirm,
  message,
  Space,
  Tag,
  Alert,
  Select,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { countryAPI } from '../../services/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCountry } from '../../contexts/CountryContext';
import '../Settings.css';

const CountryManagement = () => {
  const { t } = useLanguage();
  const { refreshCountries } = useCountry();
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCountry, setEditingCountry] = useState(null);
  const [form] = Form.useForm();

  // ===== 載入國家列表 =====
  const fetchCountries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await countryAPI.listAll();
      setCountries(res.data || []);
    } catch (err) {
      message.error('載入國家列表失敗：' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCountries();
  }, [fetchCountries]);

  // ===== 新增 =====
  const handleAdd = () => {
    setEditingCountry(null);
    form.resetFields();
    form.setFieldsValue({ is_active: true, sort_order: 0 });
    setModalOpen(true);
  };

  // ===== 編輯 =====
  const handleEdit = (record) => {
    setEditingCountry(record);
    form.setFieldsValue({
      name_zh: record.name_zh,
      name_en: record.name_en,
      is_active: record.is_active,
      sort_order: record.sort_order,
    });
    setModalOpen(true);
  };

  // ===== 儲存 =====
  const handleSave = () => {
    form.validateFields().then(async (values) => {
      try {
        if (editingCountry) {
          await countryAPI.update(editingCountry.code, {
            name_zh: values.name_zh,
            name_en: values.name_en,
            is_active: values.is_active,
            sort_order: values.sort_order,
          });
          message.success(t('countryManagement.updateSuccess'));
        } else {
          await countryAPI.create({
            code: values.code.toUpperCase(),
            name_zh: values.name_zh,
            name_en: values.name_en,
            is_active: values.is_active,
            sort_order: values.sort_order,
          });
          message.success(t('countryManagement.createSuccess'));
        }
        setModalOpen(false);
        form.resetFields();
        fetchCountries();
      } catch (err) {
        if (err.response?.status === 409) {
          message.error(`國家代碼 ${values.code} 已存在`);
        } else {
          const key = editingCountry ? 'countryManagement.updateFailed' : 'countryManagement.createFailed';
          message.error(t(key) + '：' + (err.response?.data?.detail || err.message));
        }
      }
    });
  };

  // ===== 切換啟用狀態 =====
  const handleToggleActive = async (code, newActive) => {
    try {
      await countryAPI.update(code, { is_active: newActive });
      message.success(newActive ? t('countryManagement.active') + '成功' : t('countryManagement.inactive') + '成功');
      fetchCountries();
      refreshCountries(); // 同步更新 CountryContext，讓 TopBar / 其他頁面即時反映
    } catch (err) {
      message.error('更新失敗：' + (err.response?.data?.detail || err.message));
    }
  };

  // ===== 刪除 =====
  const handleDelete = async (code) => {
    try {
      await countryAPI.delete(code);
      message.success(t('countryManagement.deleteSuccess'));
      fetchCountries();
    } catch (err) {
      message.error(t('countryManagement.deleteFailed') + '：' + (err.response?.data?.detail || err.message));
    }
  };

  const columns = [
    {
      title: t('countryManagement.codeLabel'),
      dataIndex: 'code',
      key: 'code',
      width: 100,
      render: (code) => <Tag color="blue">{code}</Tag>,
    },
    {
      title: t('countryManagement.nameZhLabel'),
      dataIndex: 'name_zh',
      key: 'name_zh',
      width: 120,
    },
    {
      title: t('countryManagement.nameEnLabel'),
      dataIndex: 'name_en',
      key: 'name_en',
      width: 150,
    },
    {
      title: t('countryManagement.sortOrderLabel'),
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 80,
      align: 'center',
    },
    {
      title: t('countryManagement.isActiveLabel'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 120,
      render: (active, record) => (
        <Select
          value={active}
          size="small"
          style={{ width: 100 }}
          onChange={(val) => handleToggleActive(record.code, val)}
          options={[
            { value: true,  label: <span style={{ color: '#52c41a' }}>● {t('countryManagement.active')}</span> },
            { value: false, label: <span style={{ color: '#999' }}>● {t('countryManagement.inactive')}</span> },
          ]}
          popupMatchSelectWidth={false}
        />
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            style={{ color: 'var(--primary-color)' }}
            onClick={() => handleEdit(record)}
          >
            {t('common.edit')}
          </Button>
          <Popconfirm
            title={t('countryManagement.confirmDelete')}
            onConfirm={() => handleDelete(record.code)}
            okText={t('countryManagement.confirmDeleteBtn')}
            cancelText={t('common.cancel')}
            okButtonProps={{ danger: true }}
          >
            <Button type="text" danger icon={<DeleteOutlined />}>
              {t('common.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2 className="page-title">
          <GlobalOutlined style={{ marginRight: 8 }} />
          {t('countryManagement.title')}
        </h2>
        <div className="settings-actions">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            style={{ background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
          >
            {t('countryManagement.addCountry')}
          </Button>
        </div>
      </div>

      <div className="settings-content">
        <Alert
          type="warning"
          showIcon
          message={t('countryManagement.dbHint')}
          style={{ marginBottom: 16 }}
        />
        <Table
          columns={columns}
          dataSource={countries}
          rowKey="code"
          loading={loading}
          pagination={false}
          locale={{ emptyText: t('countryManagement.noCountries') }}
        />
      </div>

      {/* 新增/編輯 Modal */}
      <Modal
        title={
          <span>
            <GlobalOutlined style={{ marginRight: 8 }} />
            {editingCountry ? t('countryManagement.editCountry') : t('countryManagement.addCountry')}
          </span>
        }
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={handleSave}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        okButtonProps={{ style: { background: 'var(--primary-color)', borderColor: 'var(--primary-color)' } }}
      >
        <Form form={form} layout="vertical">
          {/* 國家代碼：新增時可輸入，編輯時唯讀 */}
          <Form.Item
            name="code"
            label={t('countryManagement.codeLabel')}
            rules={[
              { required: !editingCountry, message: t('countryManagement.codeRequired') },
              { pattern: /^[A-Za-z]{2,5}$/, message: '請輸入 2~5 個英文字母' },
            ]}
            extra={!editingCountry ? t('countryManagement.codeHint') : ''}
          >
            <Input
              placeholder={t('countryManagement.codePlaceholder')}
              disabled={!!editingCountry}
              style={{ textTransform: 'uppercase' }}
              maxLength={5}
            />
          </Form.Item>

          <Form.Item
            name="name_zh"
            label={t('countryManagement.nameZhLabel')}
            rules={[{ required: true, message: t('countryManagement.nameZhRequired') }]}
          >
            <Input placeholder={t('countryManagement.nameZhPlaceholder')} />
          </Form.Item>

          <Form.Item
            name="name_en"
            label={t('countryManagement.nameEnLabel')}
            rules={[{ required: true, message: t('countryManagement.nameEnRequired') }]}
          >
            <Input placeholder={t('countryManagement.nameEnPlaceholder')} />
          </Form.Item>

          <Form.Item name="sort_order" label={t('countryManagement.sortOrderLabel')}>
            <InputNumber min={0} style={{ width: 120 }} />
          </Form.Item>

          <Form.Item name="is_active" label={t('countryManagement.isActiveLabel')} valuePropName="checked">
            <Switch
              checkedChildren={t('countryManagement.active')}
              unCheckedChildren={t('countryManagement.inactive')}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CountryManagement;
