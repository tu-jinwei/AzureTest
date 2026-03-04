import React, { useState, useEffect, useCallback } from 'react';
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
  Divider,
  Card,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  UploadOutlined,
  DatabaseOutlined,
  SettingOutlined,
  GlobalOutlined,
  FolderAddOutlined,
  FolderOutlined,
} from '@ant-design/icons';
import { libraryAPI } from '../../services/api';
import { adaptLibraryDocs } from '../../utils/adapters';
import { libraries as mockLibraries, userList } from '../../data/mockData';
import { useCountry } from '../../contexts/CountryContext';
import '../Settings.css';

const LibrarySettings = () => {
  const { effectiveCountry, countries, isSuperAdmin, displayCountry } = useCountry();

  const [libraries, setLibraries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [permModal, setPermModal] = useState(null);
  const [permUsers, setPermUsers] = useState([]);
  const [form] = Form.useForm();

  // Modal 中的館名選項（根據 Modal 中選擇的目標國家動態載入）
  const [modalLibraries, setModalLibraries] = useState([]);
  const [modalLibLoading, setModalLibLoading] = useState(false);

  // 新增館名
  const [newLibraryName, setNewLibraryName] = useState('');

  // 從後端載入圖書館資料（列表頁面用）
  const fetchLibrary = async (country) => {
    setLoading(true);
    try {
      const res = await libraryAPI.listAll(country);
      setLibraries(adaptLibraryDocs(res.data));
    } catch (err) {
      console.warn('圖書館 API 失敗，使用 mock 資料', err);
      setLibraries(mockLibraries);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary(effectiveCountry);
  }, [effectiveCountry]);

  // 載入特定國家的館名列表（Modal 用）
  const fetchModalLibraries = useCallback(async (country) => {
    setModalLibLoading(true);
    try {
      const countryParam = isSuperAdmin ? country : undefined;
      const res = await libraryAPI.listAll(countryParam);
      setModalLibraries(adaptLibraryDocs(res.data));
    } catch {
      // 失敗時使用列表頁面的資料
      setModalLibraries(libraries);
    } finally {
      setModalLibLoading(false);
    }
  }, [isSuperAdmin, libraries]);

  // 扁平化所有文件
  const allDocs = libraries.flatMap((lib) =>
    lib.documents.map((doc) => ({ ...doc, libraryName: lib.name, libraryId: lib.id }))
  );

  // Modal 中的館名選項
  const modalLibraryOptions = modalLibraries.map((lib) => ({ value: lib.name, label: lib.name }));

  const handleAddNewLibrary = () => {
    const trimmed = newLibraryName.trim();
    if (!trimmed) return;
    // 檢查是否已存在
    if (modalLibraries.some((lib) => lib.name === trimmed)) {
      message.warning('此館名已存在');
      return;
    }
    // 加入到 modalLibraries 選項中，並設定到表單
    setModalLibraries((prev) => [...prev, { id: `new-${Date.now()}`, name: trimmed, documents: [] }]);
    form.setFieldsValue({ libraryName: trimmed });
    setNewLibraryName('');
    message.success(`已新增館名「${trimmed}」`);
  };

  const handleOpenUpload = () => {
    form.resetFields();
    setNewLibraryName('');

    if (isSuperAdmin) {
      const targetCountry = displayCountry;
      form.setFieldsValue({ target_country: targetCountry });
      // 載入目標國家的館名
      fetchModalLibraries(targetCountry);
    } else {
      // 非 super_admin 載入自己國家的館名
      setModalLibraries(libraries);
    }
    setUploadModal(true);
  };

  // Modal 中目標國家變更時，重新載入館名
  const handleModalCountryChange = (value) => {
    form.setFieldsValue({ target_country: value, libraryName: undefined });
    fetchModalLibraries(value);
  };

  const handleUpload = async () => {
    try {
      const values = await form.validateFields();
      setUploadLoading(true);

      const formData = new FormData();
      // 支援多檔案上傳：迴圈 append 同名 "file"
      if (values.file && values.file.fileList && values.file.fileList.length > 0) {
        values.file.fileList.forEach((f) => {
          formData.append('file', f.originFileObj);
        });
      }

      const params = {
        library_name: values.libraryName,
        name: values.name,
        description: values.description || '',
      };
      if (isSuperAdmin && values.target_country) {
        params.country = values.target_country;
      }

      await libraryAPI.upload(formData, { params });

      const fileCount = values.file?.fileList?.length || 0;
      message.success(`文件已上傳${fileCount > 1 ? `（共 ${fileCount} 個檔案）` : ''}`);
      setUploadModal(false);
      form.resetFields();
      fetchLibrary(effectiveCountry);
    } catch (err) {
      if (err.errorFields) return;
      message.error('上傳失敗：' + (err.response?.data?.detail || err.message));
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDelete = async (docId) => {
    try {
      if (isSuperAdmin && effectiveCountry) {
        await libraryAPI.delete(docId, { params: { country: effectiveCountry } });
      } else {
        await libraryAPI.delete(docId);
      }
      message.success('文件已刪除');
      fetchLibrary(effectiveCountry);
    } catch (err) {
      message.error('刪除失敗：' + (err.response?.data?.detail || err.message));
    }
  };

  const openPermModal = (doc) => {
    setPermUsers([1, 2]);
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
      fetchLibrary(effectiveCountry);
    } catch (err) {
      message.error('更新失敗：' + (err.response?.data?.detail || err.message));
    }
  };

  // ===== 刪除館 =====
  const handleDeleteLibrary = async (libraryName) => {
    try {
      await libraryAPI.deleteLibrary(libraryName, isSuperAdmin ? effectiveCountry : undefined);
      message.success(`館「${libraryName}」已刪除`);
      fetchLibrary(effectiveCountry);
    } catch (err) {
      message.error('刪除失敗：' + (err.response?.data?.detail || err.message));
    }
  };

  // 計算每個館的文件數量
  const libraryStats = libraries.map((lib) => ({
    name: lib.name,
    docCount: lib.documents.length,
  }));

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
      title: '檔案',
      dataIndex: 'hasFile',
      key: 'hasFile',
      width: 120,
      render: (hasFile, record) => {
        const fileCount = record.files?.length || 0;
        if (hasFile) {
          return (
            <Tag color="green">
              已上傳{fileCount > 1 ? ` (${fileCount})` : ''}
            </Tag>
          );
        }
        return <Tag color="default">未上傳</Tag>;
      },
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
        <div className="settings-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenUpload}
            style={{ background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
          >
            上傳知識文件
          </Button>
        </div>
      </div>

      <div className="settings-content">
        {/* 館名管理區塊 */}
        {libraryStats.length > 0 && (
          <Card
            size="small"
            title={
              <span>
                <FolderOutlined style={{ marginRight: 6 }} />
                館名管理
              </span>
            }
            style={{ marginBottom: 20 }}
          >
            <Table
              size="small"
              dataSource={libraryStats}
              rowKey="name"
              pagination={false}
              columns={[
                {
                  title: '館名',
                  dataIndex: 'name',
                  key: 'name',
                  render: (name) => (
                    <span>
                      <FolderOutlined style={{ marginRight: 6, color: 'var(--primary-color)' }} />
                      {name}
                    </span>
                  ),
                },
                {
                  title: '文件數',
                  dataIndex: 'docCount',
                  key: 'docCount',
                  width: 100,
                  render: (count) => (
                    <Tag color={count > 0 ? 'blue' : 'default'}>
                      {count} 個文件
                    </Tag>
                  ),
                },
                {
                  title: '操作',
                  key: 'action',
                  width: 120,
                  render: (_, record) =>
                    record.docCount === 0 ? (
                      <Popconfirm
                        title={`確定要刪除空館「${record.name}」嗎？`}
                        onConfirm={() => handleDeleteLibrary(record.name)}
                        okText="確定刪除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                      >
                        <Button type="text" danger icon={<DeleteOutlined />} size="small">
                          刪除館
                        </Button>
                      </Popconfirm>
                    ) : (
                      <Tooltip title="需先刪除館內所有文件才能刪除此館">
                        <Button type="text" icon={<DeleteOutlined />} size="small" disabled style={{ color: '#ccc' }}>
                          刪除館
                        </Button>
                      </Tooltip>
                    ),
                },
              ]}
            />
          </Card>
        )}

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
          setNewLibraryName('');
        }}
        onOk={handleUpload}
        confirmLoading={uploadLoading}
        okText="上傳"
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
                onChange={handleModalCountryChange}
              />
            </Form.Item>
          )}
          <Form.Item
            name="libraryName"
            label="館名"
            rules={[{ required: true, message: '請選擇或輸入館名' }]}
          >
            <Select
              placeholder={modalLibLoading ? '載入館名中...' : '請選擇館名或新增'}
              options={modalLibraryOptions}
              loading={modalLibLoading}
              showSearch
              allowClear
              notFoundContent={modalLibLoading ? <Spin size="small" /> : '此國家尚無館名，請新增'}
              dropdownRender={(menu) => (
                <>
                  {menu}
                  <Divider style={{ margin: '8px 0' }} />
                  <div style={{ display: 'flex', gap: 8, padding: '0 8px 8px' }}>
                    <Input
                      placeholder="輸入新館名"
                      value={newLibraryName}
                      onChange={(e) => setNewLibraryName(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      style={{ flex: 1 }}
                    />
                    <Button
                      type="primary"
                      icon={<FolderAddOutlined />}
                      onClick={handleAddNewLibrary}
                      style={{ background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
                    >
                      新增
                    </Button>
                  </div>
                </>
              )}
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
          <Form.Item name="file" label="上傳 PDF 檔案" valuePropName="file" extra="可選擇多個檔案，每個檔案上限 100 MB">
            <Upload
              multiple
              accept=".pdf"
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
