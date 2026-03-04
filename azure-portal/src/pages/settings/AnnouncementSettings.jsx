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
  GlobalOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import { announcementAPI } from '../../services/api';
import { adaptAnnouncements, toAnnouncementCreate, toAnnouncementUpdate } from '../../utils/adapters';
import { announcements as mockAnnouncements } from '../../data/mockData';
import { useAuth } from '../../contexts/AuthContext';
import { useCountry } from '../../contexts/CountryContext';
import '../Settings.css';

const { TextArea } = Input;

const AnnouncementSettings = () => {
  const { user } = useAuth();
  const { effectiveCountry, countries, isSuperAdmin, displayCountry } = useCountry();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [fileList, setFileList] = useState([]);
  const [form] = Form.useForm();

  const fetchAnnouncements = async (country) => {
    setLoading(true);
    try {
      const res = await announcementAPI.listAll(country);
      setData(adaptAnnouncements(res.data));
    } catch (err) {
      console.warn('公告 API 失敗，使用 mock 資料', err);
      setData(mockAnnouncements);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements(effectiveCountry);
  }, [effectiveCountry]);

  const handleAdd = () => {
    setEditingItem(null);
    setFileList([]);
    form.resetFields();
    form.setFieldsValue({
      publish_status: 'published',
      // super_admin 預設選中當前顯示的國家
      ...(isSuperAdmin ? { target_country: displayCountry } : {}),
    });
    setModalOpen(true);
  };

  const handleEdit = (record) => {
    setEditingItem(record);
    setFileList([]);
    form.setFieldsValue({
      subject: record.subject,
      content: record.content,
      publish_status: record.publish_status || 'draft',
      // 編輯時使用當前顯示的國家
      ...(isSuperAdmin ? { target_country: displayCountry } : {}),
    });
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await announcementAPI.delete(id, effectiveCountry);
      message.success('公告已刪除');
      fetchAnnouncements(effectiveCountry);
    } catch (err) {
      console.error('刪除公告失敗', err);
      message.error('刪除失敗：' + (err.response?.data?.detail || err.message));
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const adapterData = {
        subject: values.subject,
        content: values.content,
        publishStatus: values.publish_status,
      };

      // super_admin 使用表單中選擇的目標國家
      const countryParam = isSuperAdmin ? values.target_country : undefined;

      let noticeId;
      if (editingItem) {
        await announcementAPI.update(editingItem.id, toAnnouncementUpdate(adapterData), countryParam);
        noticeId = editingItem.id;
        message.success('公告已更新');
      } else {
        const res = await announcementAPI.create(toAnnouncementCreate(adapterData), countryParam);
        noticeId = res.data?.detail;
        message.success('公告已新增');
      }

      // 如果有選擇檔案，上傳附件（支援多檔）
      if (fileList.length > 0 && noticeId) {
        const formData = new FormData();
        fileList.forEach((f) => {
          const file = f.originFileObj || f;
          formData.append('file', file);
        });
        try {
          await announcementAPI.uploadFile(noticeId, formData, countryParam);
          message.success(`已上傳 ${fileList.length} 個附件`);
        } catch (uploadErr) {
          console.error('上傳附件失敗', uploadErr);
          message.warning('公告已儲存，但附件上傳失敗：' + (uploadErr.response?.data?.detail || uploadErr.message));
        }
      }

      setModalOpen(false);
      setFileList([]);
      form.resetFields();
      fetchAnnouncements(effectiveCountry);
    } catch (err) {
      if (err.errorFields) return;
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
      dataIndex: 'attachments',
      key: 'attachments',
      width: 120,
      render: (attachments) => {
        if (!attachments || attachments.length === 0) return '-';
        return (
          <Tag color="blue">
            {attachments.length > 1 ? `${attachments.length} 個附件` : '有附件'}
          </Tag>
        );
      },
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
          {/* super_admin 選擇目標國家 */}
          {isSuperAdmin && (
            <Form.Item
              name="target_country"
              label={
                <span>
                  <GlobalOutlined style={{ marginRight: 4 }} />
                  目標國家
                </span>
              }
              rules={[{ required: true, message: '請選擇目標國家' }]}
            >
              <Select
                placeholder="請選擇目標國家"
                options={countries.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))}
              />
            </Form.Item>
          )}
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
          <Form.Item label="附件檔案（PDF）" extra="可選擇多個檔案，每個檔案上限 100 MB">
            <Upload
              multiple
              accept=".pdf"
              fileList={fileList}
              onChange={({ fileList: newFileList }) => setFileList(newFileList)}
              beforeUpload={(file) => {
                if (file.size > 100 * 1024 * 1024) {
                  message.error(`${file.name} 超過 100 MB`);
                  return Upload.LIST_IGNORE;
                }
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>選擇檔案</Button>
            </Upload>
            {editingItem?.attachments?.length > 0 && fileList.length === 0 && (
              <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>
                <PaperClipOutlined style={{ marginRight: 4 }} />
                目前附件：{editingItem.attachments.map((a) => a.name).join('、')}（不選擇新檔案則保留原附件）
              </div>
            )}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AnnouncementSettings;
