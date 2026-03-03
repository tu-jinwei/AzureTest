import React, { useState } from 'react';
import {
  Button,
  Table,
  Modal,
  Form,
  Input,
  Upload,
  Switch,
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
import { announcements as initialAnnouncements } from '../../data/mockData';
import '../Settings.css';

const { TextArea } = Input;

const AnnouncementSettings = () => {
  const [data, setData] = useState(initialAnnouncements);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();

  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (record) => {
    setEditingItem(record);
    form.setFieldsValue({
      subject: record.subject,
      content: record.content,
      isNew: record.isNew,
    });
    setModalOpen(true);
  };

  const handleDelete = (id) => {
    setData((prev) => prev.filter((item) => item.id !== id));
    message.success('公告已刪除');
  };

  const handleSave = () => {
    form.validateFields().then((values) => {
      if (editingItem) {
        setData((prev) =>
          prev.map((item) =>
            item.id === editingItem.id
              ? { ...item, ...values, date: item.date }
              : item
          )
        );
        message.success('公告已更新');
      } else {
        const newItem = {
          id: Date.now(),
          ...values,
          date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
          attachment: null,
        };
        setData((prev) => [newItem, ...prev]);
        message.success('公告已新增');
      }
      setModalOpen(false);
      form.resetFields();
    });
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
      dataIndex: 'isNew',
      key: 'isNew',
      width: 100,
      render: (isNew) =>
        isNew ? <Tag color="green">已發布</Tag> : <Tag>未發布</Tag>,
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
          <Form.Item name="isNew" label="發布狀態" valuePropName="checked">
            <Switch checkedChildren="已發布" unCheckedChildren="未發布" />
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
