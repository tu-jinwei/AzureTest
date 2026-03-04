import React, { useState, useEffect } from 'react';
import {
  Button,
  Table,
  Modal,
  Form,
  Input,
  Upload,
  Select,
  Tag,
  Popconfirm,
  message,
  Space,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  NotificationOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { announcementAPI } from '../../services/api';
import { adaptAnnouncements, toAnnouncementCreate, toAnnouncementUpdate } from '../../utils/adapters';
import { announcements as mockAnnouncements } from '../../data/mockData';
import '../Settings.css';

const { TextArea } = Input;

const AnnouncementSettings = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await announcementAPI.listAll();
      setData(adaptAnnouncements(res.data));
    } catch (err) {
      console.warn('公告 API 失敗，使用 mock 資料', err);
      setData(mockAnnouncements);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ publish_status: 'published' });
    setModalOpen(true);
  };

  const handleEdit = (record) => {
    setEditingItem(record);
    form.setFieldsValue({
      subject: record.subject,
      content: record.content,
      publish_status: record.publish_status || 'draft',
    });
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await announcementAPI.delete(id);
      message.success('公告已刪除');
      fetchAnnouncements();
    } catch (err) {
      console.error('刪除公告失敗', err);
      message.error('刪除失敗：' + (err.response?.data?.detail || err.message));
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      // 將表單值轉換為 adapter 所需的格式
      const adapterData = {
        subject: values.subject,
        content: values.content,
        publishStatus: values.publish_status,
      };

      if (editingItem) {
        await announcementAPI.update(editingItem.id, toAnnouncementUpdate(adapterData));
        message.success('公告已更新');
      } else {
        await announcementAPI.create(toAnnouncementCreate(adapterData));
        message.success('公告已新增');
      }
      setModalOpen(false);
      form.resetFields();
      fetchAnnouncements();
    } catch (err) {
      if (err.errorFields) return; // form validation error
      console.error('儲存公告失敗', err);
      message.error('儲存失敗：' + (err.response?.data?.detail || err.message));
    }
  };

  const filteredData = data.filter(
    (item) =>
      !searchText ||
      item.subject.includes(searchText) ||
      item.content.includes(searchText)
  );

  const columns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 120,
    },
    {
      title: '主旨',
      dataIndex: 'subject',
      key: 'subject',
    },
    {
      title: '狀態',
      dataIndex: 'publish_status',
      key: 'publish_status',
      width: 100,
      render: (status) =>
        status === 'published' ? (
          <Tag color="green">已發布</Tag>
        ) : (
          <Tag>草稿</Tag>
        ),
    },
    {
      title: '附件',
      dataIndex: 'attachment',
      key: 'attachment',
      width: 100,
      render: (att) => (att ? <Tag color="blue">有附件</Tag> : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
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
            title="確定要刪除此公告嗎？"
            onConfirm={() => handleDelete(record.id)}
            okText="確定"
            cancelText="取消"
          >
            <Button type="text" danger icon={<DeleteOutlined />}>
              刪除
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
          <NotificationOutlined style={{ marginRight: 8 }} />
          公告欄設定
        </h2>
        <div className="settings-actions">
          <Input
            placeholder="搜尋公告..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            style={{ background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
          >
            新增公告
          </Button>
        </div>
      </div>

      <div className="settings-content">
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: '尚無公告' }}
        />
      </div>

      <Modal
        title={editingItem ? '編輯公告' : '新增公告'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText="儲存"
        cancelText="取消"
        okButtonProps={{ style: { background: 'var(--primary-color)', borderColor: 'var(--primary-color)' } }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="subject"
            label="主旨"
            rules={[{ required: true, message: '請輸入公告主旨' }]}
          >
            <Input placeholder="請輸入公告主旨" />
          </Form.Item>
          <Form.Item
            name="content"
            label="內容（以英文為主，約 150 字元）"
            rules={[{ required: true, message: '請輸入公告內容' }]}
          >
            <TextArea rows={4} placeholder="Enter announcement content..." maxLength={300} showCount />
          </Form.Item>
          <Form.Item name="publish_status" label="發布狀態" initialValue="published">
            <Select>
              <Select.Option value="published">已發布</Select.Option>
              <Select.Option value="draft">草稿</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="附件檔案（PDF）">
            <Upload maxCount={1} accept=".pdf" beforeUpload={() => false}>
              <Button icon={<UploadOutlined />}>選擇檔案</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AnnouncementSettings;
