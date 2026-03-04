import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Upload,
  Popconfirm,
  Tag,
  message,
  Space,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  UploadOutlined,
  DatabaseOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { libraryAPI } from '../../services/api';
import { adaptLibraryDocs } from '../../utils/adapters';
import { libraries as mockLibraries, userList } from '../../data/mockData';
import '../Settings.css';

const LibrarySettings = () => {
  const [libraries, setLibraries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [permModal, setPermModal] = useState(null);
  const [permUsers, setPermUsers] = useState([]);
  const [form] = Form.useForm();

  // 從後端載入圖書館資料
  const fetchLibrary = async () => {
    setLoading(true);
    try {
      const res = await libraryAPI.listAll();
      setLibraries(adaptLibraryDocs(res.data));
    } catch (err) {
      console.warn('圖書館 API 失敗，使用 mock 資料', err);
      setLibraries(mockLibraries);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  // 扁平化所有文件
  const allDocs = libraries.flatMap((lib) =>
    lib.documents.map((doc) => ({ ...doc, libraryName: lib.name, libraryId: lib.id }))
  );

  const handleUpload = async () => {
    try {
      const values = await form.validateFields();
      setUploadLoading(true);

      // 找到對應的 library name
      const targetLib = libraries.find((lib) => lib.id === values.libraryId);
      const libraryName = targetLib ? targetLib.name : '';

      const formData = new FormData();
      // 後端使用 query params，但 libraryAPI.upload 已設定 multipart/form-data
      // 將文件資訊附加到 FormData
      if (values.file && values.file.fileList && values.file.fileList.length > 0) {
        formData.append('file', values.file.fileList[0].originFileObj);
      }

      // 使用 query params 傳遞文件資訊
      await libraryAPI.upload(formData, {
        params: {
          library_name: libraryName,
          name: values.name,
          description: values.description || '',
        },
      });

      message.success('文件已上傳');
      setUploadModal(false);
      form.resetFields();
      fetchLibrary();
    } catch (err) {
      if (err.errorFields) return; // 表單驗證失敗，不顯示 API 錯誤
      message.error('上傳失敗：' + (err.response?.data?.detail || err.message));
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDelete = async (docId) => {
    try {
      await libraryAPI.delete(docId);
      message.success('文件已刪除');
      fetchLibrary();
    } catch (err) {
      message.error('刪除失敗：' + (err.response?.data?.detail || err.message));
    }
  };

  const openPermModal = (doc) => {
    setPermUsers([1, 2]); // 模擬已有權限的使用者
    setPermModal(doc);
  };

  const handlePermSave = async () => {
    if (!permModal) return;
    try {
      const authData = {
        authorized_roles: [],
        authorized_users: permUsers,
        exception_list: [],
      };
      await libraryAPI.updateAuth(permModal.id, authData);
      message.success('文件授權已更新');
      setPermModal(null);
      fetchLibrary();
    } catch (err) {
      message.error('更新失敗：' + (err.response?.data?.detail || err.message));
    }
  };

  const columns = [
    {
      title: '館名',
      dataIndex: 'libraryName',
      key: 'libraryName',
      width: 160,
      render: (name) => <Tag color="blue">{name}</Tag>,
    },
    {
      title: '文件名稱',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '簡介',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => openPermModal(record)}
            style={{ color: 'var(--primary-color)' }}
          >
            權限
          </Button>
          <Popconfirm
            title="確定要刪除此文件嗎？"
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
          <DatabaseOutlined style={{ marginRight: 8 }} />
          圖書館設定
        </h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setUploadModal(true)}
          style={{ background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
        >
          上傳知識文件
        </Button>
      </div>

      <div className="settings-content">
        <Spin spinning={loading} tip="載入中...">
          <Table
            columns={columns}
            dataSource={allDocs}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            locale={{ emptyText: '尚無文件' }}
          />
        </Spin>
      </div>

      {/* 上傳文件 Modal */}
      <Modal
        title="上傳知識文件"
        open={uploadModal}
        onCancel={() => {
          setUploadModal(false);
          form.resetFields();
        }}
        onOk={handleUpload}
        confirmLoading={uploadLoading}
        okText="上傳"
        cancelText="取消"
        okButtonProps={{ style: { background: 'var(--primary-color)', borderColor: 'var(--primary-color)' } }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="libraryId"
            label="選擇館名"
            rules={[{ required: true, message: '請選擇館名' }]}
          >
            <Select
              placeholder="請選擇館名"
              options={libraries.map((lib) => ({ value: lib.id, label: lib.name }))}
            />
          </Form.Item>
          <Form.Item
            name="name"
            label="文件名稱"
            rules={[{ required: true, message: '請輸入文件名稱' }]}
          >
            <Input placeholder="請輸入文件名稱" />
          </Form.Item>
          <Form.Item
            name="description"
            label="簡介"
            rules={[{ required: true, message: '請輸入文件簡介' }]}
          >
            <Input.TextArea rows={3} placeholder="請輸入文件簡介" />
          </Form.Item>
          <Form.Item name="file" label="上傳 PDF 檔案" valuePropName="file">
            <Upload maxCount={1} accept=".pdf" beforeUpload={() => false}>
              <Button icon={<UploadOutlined />}>選擇檔案</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      {/* 權限設定 Modal */}
      <Modal
        title={`權限設定 - ${permModal?.name}`}
        open={!!permModal}
        onCancel={() => setPermModal(null)}
        onOk={handlePermSave}
        okText="儲存"
        cancelText="取消"
        okButtonProps={{ style: { background: 'var(--primary-color)', borderColor: 'var(--primary-color)' } }}
      >
        <p style={{ marginBottom: 12, color: '#666' }}>
          選擇可以查看此文件的使用者：
        </p>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="選擇使用者"
          value={permUsers}
          onChange={setPermUsers}
          options={userList.map((u) => ({
            value: u.id,
            label: `${u.name} (${u.department})`,
          }))}
        />
      </Modal>
    </div>
  );
};

export default LibrarySettings;
