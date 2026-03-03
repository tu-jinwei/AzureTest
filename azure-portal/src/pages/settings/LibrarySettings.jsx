import React, { useState } from 'react';
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
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  UploadOutlined,
  DatabaseOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { libraries as initialLibraries, userList } from '../../data/mockData';
import '../Settings.css';

const LibrarySettings = () => {
  const [libs, setLibs] = useState(initialLibraries);
  const [uploadModal, setUploadModal] = useState(false);
  const [permModal, setPermModal] = useState(null);
  const [permUsers, setPermUsers] = useState([]);
  const [form] = Form.useForm();

  // 扁平化所有文件
  const allDocs = libs.flatMap((lib) =>
    lib.documents.map((doc) => ({ ...doc, libraryName: lib.name, libraryId: lib.id }))
  );

  const handleUpload = () => {
    form.validateFields().then((values) => {
      const newDoc = {
        id: Date.now(),
        name: values.name,
        description: values.description,
        coverUrl: '/mock-doc-cover.png',
        pdfUrl: '#',
      };
      setLibs((prev) =>
        prev.map((lib) =>
          lib.id === values.libraryId
            ? { ...lib, documents: [...lib.documents, newDoc] }
            : lib
        )
      );
      message.success('文件已上傳');
      setUploadModal(false);
      form.resetFields();
    });
  };

  const handleDelete = (libraryId, docId) => {
    setLibs((prev) =>
      prev.map((lib) =>
        lib.id === libraryId
          ? { ...lib, documents: lib.documents.filter((d) => d.id !== docId) }
          : lib
      )
    );
    message.success('文件已刪除');
  };

  const openPermModal = (doc) => {
    setPermUsers([1, 2]); // 模擬已有權限的使用者
    setPermModal(doc);
  };

  const handlePermSave = () => {
    message.success('權限已更新');
    setPermModal(null);
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
            onConfirm={() => handleDelete(record.libraryId, record.id)}
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
        <Table
          columns={columns}
          dataSource={allDocs}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: '尚無文件' }}
        />
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
              options={libs.map((lib) => ({ value: lib.id, label: lib.name }))}
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
          <Form.Item label="上傳 PDF 檔案">
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
