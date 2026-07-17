import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Upload, Popconfirm,
  Tag, message, Space, Spin, Divider, Tooltip, Segmented, Dropdown,
  Empty, Checkbox, Switch,
} from 'antd';
import {
  DeleteOutlined, UploadOutlined, DatabaseOutlined,
  GlobalOutlined, FolderAddOutlined, FolderOutlined,
  EditOutlined, PaperClipOutlined, CloudUploadOutlined, PictureOutlined,
  FileTextOutlined, SearchOutlined, MoreOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { globalLibraryAPI, piiAPI, userAPI } from '../../services/api';
import { useCountry } from '../../contexts/CountryContext';
import { useLanguage } from '../../contexts/LanguageContext';
import '../Settings.css';

// ─── 全域館封面圖片元件 ───────────────────────────────────────────────────────
const CatalogCoverImage = memo(({ catalogId }) => {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let url = null, cancelled = false;
    setLoading(true);
    globalLibraryAPI.getCatalogImage(catalogId)
      .then((res) => { if (!cancelled) { url = URL.createObjectURL(res.data); setSrc(url); } })
      .catch(() => { if (!cancelled) setSrc(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [catalogId]);
  if (loading) return <div className="catalog-card-img-placeholder"><Spin size="small" /></div>;
  if (!src) return <div className="catalog-card-img-placeholder"><PictureOutlined style={{ fontSize: 36, color: '#d9d9d9' }} /></div>;
  return <img src={src} alt="cover" className="catalog-card-img" />;
});
CatalogCoverImage.displayName = 'CatalogCoverImage';

// ─── 分發規則列（單一國家設定）────────────────────────────────────────────────
const DistributionRow = ({ rule, catalogOptionsByCountry, countries, onRemove, onChange, userListByCountry, userListLoading, t }) => {
  // 取得此 row 對應國家的使用者列表
  const userList = userListByCountry?.[rule.country_code] || [];
  const countryLabel = (() => {
    const c = countries.find((x) => x.code === rule.country_code);
    if (!c) return rule.country_code;
    const translated = t('countries.' + c.code);
    return translated.startsWith('countries.') ? (c.name_zh || c.name_en || c.code) : translated;
  })();
  // 根據此 row 的 country_code 取得對應的館名選項
  const catalogOptions = (catalogOptionsByCountry || {})[rule.country_code] || [];

  return (
    <div style={{ border: '1px solid #e8e8e8', borderRadius: 8, padding: '12px 16px', marginBottom: 10, background: '#fafafa' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Space>
          <GlobalOutlined style={{ color: 'var(--primary-color)' }} />
          <span style={{ fontWeight: 600 }}>{countryLabel} ({rule.country_code})</span>
          <Switch
            size="small"
            checked={rule.is_active}
            onChange={(v) => onChange({ ...rule, is_active: v })}
            checkedChildren={t('librarySettings.distributionActive')}
            unCheckedChildren="停用"
          />
        </Space>
        <Button type="text" danger icon={<DeleteOutlined />} size="small" onClick={onRemove} />
      </div>

      {/* 館名選擇 */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{t('librarySettings.distributionCatalog')}</div>
        <Select
          value={rule.catalog_name || undefined}
          onChange={(v) => onChange({ ...rule, catalog_name: v })}
          options={catalogOptions}
          placeholder={t('librarySettings.libraryNamePlaceholder')}
          style={{ width: '100%' }}
          showSearch
        />
      </div>

      {/* 存取規則 */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: '#666' }}>{t('librarySettings.enableAccessRestriction')}</div>
          <Switch
            size="small"
            checked={rule._restricted}
            onChange={(v) => onChange({
              ...rule,
              _restricted: v,
              auth_rules: v ? rule.auth_rules : { authorized_roles: [], authorized_users: [], exception_list: [] },
            })}
            checkedChildren="限定"
            unCheckedChildren="公開"
          />
        </div>
        {rule._restricted && (
          <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: 6, padding: '4px 0', background: '#fff' }}>
            {userListLoading ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}><Spin size="small" /></div>
            ) : userList.filter((u) => u.role !== 'root').map((u) => (
              <label key={u.email} style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', cursor: 'pointer', userSelect: 'none' }}>
                <Checkbox
                  checked={(rule.auth_rules?.authorized_users || []).includes(u.email)}
                  style={{ marginRight: 8 }}
                  onChange={(e) => {
                    const prev = rule.auth_rules?.authorized_users || [];
                    const next = e.target.checked ? [...prev, u.email] : prev.filter((em) => em !== u.email);
                    onChange({ ...rule, auth_rules: { ...rule.auth_rules, authorized_users: next } });
                  }}
                />
                <span style={{ flex: 1, fontSize: 13 }}>{u.name || u.email}</span>
                <span style={{ fontSize: 11, color: '#999' }}>{u.email}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── 主元件 ──────────────────────────────────────────────────────────────────
const LibrarySettings = () => {
  const { countries } = useCountry();
  const { t } = useLanguage();

  // ── 資料狀態 ──
  const [catalogs, setCatalogs] = useState([]);       // 當前國家的館清單
  const [allCatalogs, setAllCatalogs] = useState([]); // 所有國家的館清單（供分發 Modal 用）
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Tab ──
  const [activeTab, setActiveTab] = useState('catalogs');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCountry, setCatalogCountry] = useState(''); // 館名管理 Tab 的國家篩選
  const [docSearch, setDocSearch] = useState('');
  const [docFilterCatalog, setDocFilterCatalog] = useState(null);

  // ── 新增館 Modal ──
  const [addCatalogModal, setAddCatalogModal] = useState(false);
  const [addCatalogName, setAddCatalogName] = useState('');
  const [addCatalogDesc, setAddCatalogDesc] = useState('');
  const [addCatalogCountry, setAddCatalogCountry] = useState(''); // 新增館的國家
  const [addCatalogLoading, setAddCatalogLoading] = useState(false);

  // ── 編輯館 Modal ──
  const [editCatalogModal, setEditCatalogModal] = useState(null);
  const [editCatalogName, setEditCatalogName] = useState('');
  const [editCatalogDesc, setEditCatalogDesc] = useState('');
  const [editCatalogLoading, setEditCatalogLoading] = useState(false);
  const [editCatalogImageFileList, setEditCatalogImageFileList] = useState([]);
  const [editCatalogImagePreview, setEditCatalogImagePreview] = useState(null);
  const [editCatalogImageUploading, setEditCatalogImageUploading] = useState(false);
  const [editCatalogExistingImageUrl, setEditCatalogExistingImageUrl] = useState(null);
  const [editCatalogDocs, setEditCatalogDocs] = useState([]);
  const [editCatalogDocsLoading, setEditCatalogDocsLoading] = useState(false);

  // ── 上傳文件 Modal ──
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [piiScanning, setPiiScanning] = useState(false);
  const [uploadLeaveConfirmOpen, setUploadLeaveConfirmOpen] = useState(false);
  const uploadInitialFormValuesRef = useRef(null);
  const [form] = Form.useForm();
  const [distributions, setDistributions] = useState([]);

  // ── 編輯文件 Modal ──
  const [editModal, setEditModal] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editFileList, setEditFileList] = useState([]);
  const [editForm] = Form.useForm();

  // ── 分發規則 Modal ──
  const [distModal, setDistModal] = useState(null);
  const [distRules, setDistRules] = useState([]);
  const [distLoading, setDistLoading] = useState(false);
  const [distSaving, setDistSaving] = useState(false);

  // ── 使用者清單（按國家分組）──
  const [userListByCountry, setUserListByCountry] = useState({}); // { TW: [...], JP: [...] }
  const [userListLoading, setUserListLoading] = useState(false);

  // ─── 資料載入 ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [allCatRes, docRes] = await Promise.all([
        globalLibraryAPI.listCatalogs(),   // 所有館（供分發 Modal 用）
        globalLibraryAPI.listDocs(),
      ]);
      const allCats = Array.isArray(allCatRes.data) ? allCatRes.data : [];
      setAllCatalogs(allCats);
      setDocs(Array.isArray(docRes.data) ? docRes.data : []);
    } catch (err) {
      console.warn('fetchData error', err);
      message.error('載入資料失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  // 依 catalogCountry 篩選館清單
  useEffect(() => {
    if (!catalogCountry) {
      setCatalogs(allCatalogs);
    } else {
      setCatalogs(allCatalogs.filter((c) => c.country_code === catalogCountry));
    }
  }, [allCatalogs, catalogCountry]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchUserList = useCallback(async () => {
    // 若所有國家都已載入則跳過
    const loadedCodes = Object.keys(userListByCountry);
    const allCodes = countries.map((c) => c.code);
    if (allCodes.length > 0 && allCodes.every((code) => loadedCodes.includes(code))) return;

    setUserListLoading(true);
    try {
      // 並行載入每個國家的使用者
      const results = await Promise.all(
        allCodes.map((code) =>
          userAPI.list({ country: code })
            .then((res) => {
              const users = Array.isArray(res.data) ? res.data : (res.data?.users || res.data?.items || []);
              return [code, users];
            })
            .catch(() => [code, []])
        )
      );
      setUserListByCountry(Object.fromEntries(results));
    } catch { /* ignore */ } finally { setUserListLoading(false); }
  }, [userListByCountry, countries]);

  // ─── PII 掃描 ─────────────────────────────────────────────────────────────
  const handlePiiScan = async (newFileList, setListFn) => {
    if (!newFileList || newFileList.length === 0) return true;
    const exts = ['.pdf', '.doc', '.docx', '.txt', '.csv'];
    const scannable = newFileList.filter((f) => exts.some((ext) => (f.originFileObj?.name || f.name || '').toLowerCase().endsWith(ext)));
    if (scannable.length === 0) return true;
    setPiiScanning(true);
    try {
      const fd = new FormData();
      scannable.forEach((f) => fd.append('file', f.originFileObj || f));
      const res = await piiAPI.scanFiles(fd);
      if (res.data.has_pii) {
        const piiFiles = (res.data.files || []).filter((f) => f.has_pii);
        Modal.warning({
          title: t('pii.detectedTitle'),
          content: (
            <div>
              <p>{t('pii.detectedMessage')}</p>
              <ul style={{ paddingLeft: 20 }}>
                {piiFiles.map((pf, i) => (
                  <li key={i} style={{ color: '#cf1322' }}>
                    {t('pii.entityFile', { filename: pf.filename, count: pf.entity_count, types: pf.entity_types.join(', ') })}
                  </li>
                ))}
              </ul>
            </div>
          ),
          okText: t('pii.understood'),
          width: 520,
        });
        if (setListFn) setListFn([]);
        return false;
      }
      return true;
    } catch { return true; } finally { setPiiScanning(false); }
  };

  // ─── 館管理 ───────────────────────────────────────────────────────────────
  const catalogOptions = catalogs.map((c) => ({ value: c.catalog_name, label: c.catalog_name }));

  const handleAddCatalog = async () => {
    const n = addCatalogName.trim();
    if (!n) { message.warning(t('librarySettings.documentNameRequired')); return; }
    if (!addCatalogCountry) { message.warning(t('librarySettings.catalogCountryRequired')); return; }
    // 同一國家內不可重複
    if (allCatalogs.some((c) => c.catalog_name === n && c.country_code === addCatalogCountry)) {
      message.warning(t('librarySettings.libraryExists')); return;
    }
    setAddCatalogLoading(true);
    try {
      await globalLibraryAPI.createCatalog({ catalog_name: n, country_code: addCatalogCountry, description: addCatalogDesc.trim() });
      message.success(t('librarySettings.libraryAdded', { name: n }));
      setAddCatalogModal(false);
      setAddCatalogName('');
      setAddCatalogDesc('');
      setAddCatalogCountry('');
      fetchData();
    } catch (e) {
      message.error(t('librarySettings.addLibraryFailed') + ': ' + (e.response?.data?.detail || e.message));
    } finally { setAddCatalogLoading(false); }
  };

  const handleOpenEditCatalog = async (cat) => {
    setEditCatalogModal(cat);
    setEditCatalogName(cat.catalog_name);
    setEditCatalogDesc(cat.description || '');
    setEditCatalogImageFileList([]);
    setEditCatalogImagePreview(null);
    setEditCatalogExistingImageUrl(null);
    setEditCatalogDocs([]);

    if (cat.image_url) {
      try {
        const r = await globalLibraryAPI.getCatalogImage(cat.catalog_id);
        setEditCatalogExistingImageUrl(URL.createObjectURL(r.data));
      } catch { /* ignore */ }
    }

    setEditCatalogDocsLoading(true);
    try {
      const res = await globalLibraryAPI.listDocs({ catalog_name: cat.catalog_name });
      setEditCatalogDocs(Array.isArray(res.data) ? res.data : []);
    } catch {
      setEditCatalogDocs(docs.filter((d) => (d.distribution_catalogs || []).includes(cat.catalog_name)));
    } finally { setEditCatalogDocsLoading(false); }
  };

  const handleCloseEditCatalog = () => {
    setEditCatalogModal(null);
    setEditCatalogName('');
    setEditCatalogDesc('');
    setEditCatalogImageFileList([]);
    setEditCatalogImagePreview(null);
    if (editCatalogExistingImageUrl) { URL.revokeObjectURL(editCatalogExistingImageUrl); setEditCatalogExistingImageUrl(null); }
    setEditCatalogDocs([]);
  };

  const handleSaveEditCatalog = async () => {
    if (!editCatalogModal) return;
    const newName = editCatalogName.trim();
    if (!newName) { message.warning(t('librarySettings.editLibraryNameRequired')); return; }
    if (newName !== editCatalogModal.catalog_name && catalogs.some((c) => c.catalog_name === newName && c.catalog_id !== editCatalogModal.catalog_id)) {
      message.warning(t('librarySettings.editLibraryNameExists')); return;
    }
    setEditCatalogLoading(true);
    try {
      const updateData = {};
      if (newName !== editCatalogModal.catalog_name) updateData.catalog_name = newName;
      if (editCatalogDesc.trim() !== (editCatalogModal.description || '')) updateData.description = editCatalogDesc.trim();
      if (Object.keys(updateData).length > 0) {
        await globalLibraryAPI.updateCatalog(editCatalogModal.catalog_id, updateData);
      }
      if (editCatalogImageFileList.length > 0) {
        const fd = new FormData();
        fd.append('file', editCatalogImageFileList[0].originFileObj);
        await globalLibraryAPI.uploadCatalogImage(editCatalogModal.catalog_id, fd);
      }
      message.success(t('librarySettings.editLibrarySaved', { name: newName }));
      handleCloseEditCatalog();
      fetchData();
    } catch (e) {
      message.error(t('librarySettings.editLibrarySaveFailed') + ': ' + (e.response?.data?.detail || e.message));
    } finally { setEditCatalogLoading(false); }
  };

  const handleDeleteCatalog = async (cat) => {
    try {
      await globalLibraryAPI.deleteCatalog(cat.catalog_id);
      message.success(t('librarySettings.libraryDeleted', { name: cat.catalog_name }));
      fetchData();
    } catch (e) {
      message.error(t('librarySettings.deleteFailed') + ': ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleEditCatalogDeleteImage = async () => {
    if (!editCatalogModal) return;
    try {
      await globalLibraryAPI.deleteCatalogImage(editCatalogModal.catalog_id);
      message.success(t('librarySettings.coverImageDeleted'));
      if (editCatalogExistingImageUrl) { URL.revokeObjectURL(editCatalogExistingImageUrl); setEditCatalogExistingImageUrl(null); }
      setEditCatalogModal((prev) => prev ? { ...prev, image_url: null } : prev);
      fetchData();
    } catch (e) {
      message.error(t('librarySettings.coverImageDeleteFailed') + ': ' + (e.response?.data?.detail || e.message));
    }
  };

  const handleEditCatalogUploadImage = async () => {
    if (!editCatalogModal || editCatalogImageFileList.length === 0) return;
    setEditCatalogImageUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', editCatalogImageFileList[0].originFileObj);
      await globalLibraryAPI.uploadCatalogImage(editCatalogModal.catalog_id, fd);
      message.success(t('librarySettings.coverImageUploaded'));
      setEditCatalogImageFileList([]);
      setEditCatalogImagePreview(null);
      try {
        const r = await globalLibraryAPI.getCatalogImage(editCatalogModal.catalog_id);
        if (editCatalogExistingImageUrl) URL.revokeObjectURL(editCatalogExistingImageUrl);
        setEditCatalogExistingImageUrl(URL.createObjectURL(r.data));
        setEditCatalogModal((prev) => prev ? { ...prev, image_url: 'updated' } : prev);
      } catch { /* ignore */ }
      fetchData();
    } catch (e) {
      message.error(t('librarySettings.coverImageUploadFailed') + ': ' + (e.response?.data?.detail || e.message));
    } finally { setEditCatalogImageUploading(false); }
  };

  // ─── 上傳文件 Modal ───────────────────────────────────────────────────────
  const hasUploadFormData = () => {
    const values = form.getFieldsValue();
    const initial = uploadInitialFormValuesRef.current || {};
    return (values.name || '').trim() !== (initial.name || '').trim()
      || (values.description || '').trim() !== (initial.description || '').trim()
      || (values.file?.fileList || []).length > 0
      || distributions.length > 0;
  };

  const closeUploadModal = () => {
    setUploadModal(false);
    setUploadLeaveConfirmOpen(false);
    form.resetFields();
    setDistributions([]);
    uploadInitialFormValuesRef.current = null;
  };

  const handleUploadCancel = () => {
    if (hasUploadFormData()) setUploadLeaveConfirmOpen(true);
    else closeUploadModal();
  };

  const handleOpenUpload = () => {
    form.resetFields();
    setDistributions([]);
    uploadInitialFormValuesRef.current = { name: '', description: '' };
    fetchUserList();
    setUploadModal(true);
  };

  const handleToggleDistInUpload = (countryCode, checked) => {
    if (checked) {
      if (distributions.some((d) => d.country_code === countryCode)) return;
      setDistributions((prev) => [...prev, {
        country_code: countryCode,
        catalog_name: '',
        auth_rules: { authorized_roles: [], authorized_users: [], exception_list: [] },
        is_active: true,
        _restricted: false,
      }]);
    } else {
      setDistributions((prev) => prev.filter((d) => d.country_code !== countryCode));
    }
  };

  const handleUpload = async () => {
    if (piiScanning) { message.warning(t('pii.scanningFiles')); return; }
    const missing = distributions.filter((r) => !r.catalog_name);
    if (missing.length > 0) {
      message.warning(t('librarySettings.distributionCatalogRequired', { countries: missing.map((r) => r.country_code).join(', ') }));
      return;
    }
    try {
      const v = await form.validateFields();
      setUploadLoading(true);
      const fd = new FormData();
      fd.append('name', v.name);
      fd.append('description', v.description || '');
      const fileList = v.file?.fileList || [];
      if (fileList.length > 0) fd.append('file', fileList[0].originFileObj);
      const distPayload = distributions.map(({ country_code, catalog_name, auth_rules, is_active }) => ({
        country_code, catalog_name, auth_rules, is_active,
      }));
      fd.append('distributions', JSON.stringify(distPayload));
      await globalLibraryAPI.upload(fd);
      message.success(t('librarySettings.documentUploaded'));
      closeUploadModal();
      fetchData();
    } catch (e) {
      if (e.errorFields) return;
      message.error(t('librarySettings.uploadFailed') + ': ' + (e.response?.data?.detail || e.message));
    } finally { setUploadLoading(false); }
  };

  const fileUploadValueHandler = (e) => {
    if (!e || !e.fileList) return e;
    const latestFile = e.fileList.slice(-1);
    const fileSize = latestFile[0]?.originFileObj?.size || latestFile[0]?.size || 0;
    if (fileSize > 100 * 1024 * 1024) {
      message.error(t('librarySettings.fileSizeExceeded', { size: (fileSize / 1024 / 1024).toFixed(1) }));
      return { fileList: [] };
    }
    if (latestFile.length > 0) {
      handlePiiScan(latestFile, () => form.setFieldsValue({ file: { fileList: [] } }));
    }
    return { fileList: latestFile };
  };

  // ─── 編輯文件 Modal ───────────────────────────────────────────────────────
  const handleOpenEdit = (doc) => {
    setEditModal(doc);
    setEditFileList([]);
    editForm.setFieldsValue({ name: doc.name, description: doc.description });
  };

  const handleEditSave = async () => {
    if (!editModal) return;
    if (piiScanning) { message.warning(t('pii.scanningFiles')); return; }
    try {
      const v = await editForm.validateFields();
      setEditLoading(true);
      const ud = {};
      if (v.name !== editModal.name) ud.name = v.name;
      if (v.description !== editModal.description) ud.description = v.description;
      if (Object.keys(ud).length > 0) await globalLibraryAPI.updateDoc(editModal.doc_id, ud);
      if (editFileList.length > 0) {
        // 替換模式：先刪除所有舊檔，再上傳新檔
        const existingFiles = editModal.files || [];
        for (const f of existingFiles) {
          try { await globalLibraryAPI.deleteFile(editModal.doc_id, f.filename); } catch { /* ignore */ }
        }
        const fd = new FormData();
        fd.append('file', editFileList[0].originFileObj || editFileList[0]);
        try {
          await globalLibraryAPI.uploadFile(editModal.doc_id, fd);
        } catch (ue) {
          message.warning(t('librarySettings.appendUploadFailed') + ': ' + (ue.response?.data?.detail || ue.message));
        }
      }
      message.success(t('librarySettings.documentUpdated'));
      setEditModal(null);
      setEditFileList([]);
      editForm.resetFields();
      fetchData();
    } catch (e) {
      if (e.errorFields) return;
      message.error(t('librarySettings.updateFailed') + ': ' + (e.response?.data?.detail || e.message));
    } finally { setEditLoading(false); }
  };

  const handleDeleteFile = async (docId, fn) => {
    try {
      await globalLibraryAPI.deleteFile(docId, fn);
      message.success(t('librarySettings.attachmentDeleted', { name: fn }));
      setEditModal((p) => p ? { ...p, files: (p.files || []).filter((f) => f.filename !== fn) } : p);
      fetchData();
    } catch (e) { message.error(t('librarySettings.attachmentDeleteFailed') + ': ' + (e.response?.data?.detail || e.message)); }
  };

  const handleDeleteDoc = async (docId) => {
    try {
      await globalLibraryAPI.deleteDoc(docId);
      message.success(t('librarySettings.documentDeleted'));
      fetchData();
    } catch (e) { message.error(t('librarySettings.deleteFailed') + ': ' + (e.response?.data?.detail || e.message)); }
  };

  // ─── 分發規則 Modal ───────────────────────────────────────────────────────
  const handleOpenDist = async (doc) => {
    setDistModal(doc);
    setDistLoading(true);
    fetchUserList();
    try {
      const res = await globalLibraryAPI.getDistributions(doc.doc_id);
      const rules = (Array.isArray(res.data) ? res.data : []).map((r) => ({
        ...r,
        _restricted: (r.auth_rules?.authorized_users || []).length > 0,
      }));
      setDistRules(rules);
    } catch {
      setDistRules([]);
    } finally { setDistLoading(false); }
  };

  const handleToggleDist2 = (countryCode, checked) => {
    if (checked) {
      if (distRules.some((d) => d.country_code === countryCode)) return;
      setDistRules((prev) => [...prev, {
        country_code: countryCode,
        catalog_name: '',
        auth_rules: { authorized_roles: [], authorized_users: [], exception_list: [] },
        is_active: true,
        _restricted: false,
      }]);
    } else {
      setDistRules((prev) => prev.filter((d) => d.country_code !== countryCode));
    }
  };

  const handleSaveDist = async () => {
    if (!distModal) return;
    const missing = distRules.filter((r) => !r.catalog_name);
    if (missing.length > 0) {
      message.warning(t('librarySettings.distributionCatalogRequired', { countries: missing.map((r) => r.country_code).join(', ') }));
      return;
    }
    setDistSaving(true);
    try {
      const payload = distRules.map(({ country_code, catalog_name, auth_rules, is_active }) => ({
        country_code, catalog_name, auth_rules, is_active,
      }));
      await globalLibraryAPI.updateDistributions(distModal.doc_id, payload);
      message.success(t('librarySettings.distributionUpdated'));
      setDistModal(null);
      setDistRules([]);
      fetchData();
    } catch (e) {
      message.error(t('librarySettings.distributionUpdateFailed') + ': ' + (e.response?.data?.detail || e.message));
    } finally { setDistSaving(false); }
  };

  // ─── 計算資料 ─────────────────────────────────────────────────────────────
  const filteredCatalogs = catalogs.filter((c) =>
    !catalogSearch.trim() || c.catalog_name?.toLowerCase().includes(catalogSearch.toLowerCase())
  );

  const filteredDocs = docs.filter((d) => {
    if (docFilterCatalog) {
      const inCatalog = (d.distribution_catalogs || []).includes(docFilterCatalog);
      if (!inCatalog) return false;
    }
    if (!docSearch.trim()) return true;
    const kw = docSearch.toLowerCase();
    return d.name?.toLowerCase().includes(kw) || d.description?.toLowerCase().includes(kw);
  });

  const usedCountriesInDist = distRules.map((r) => r.country_code);
  const usedCountriesInUpload = distributions.map((r) => r.country_code);

  const countrySelectOptions = countries.map((c) => {
    const translated = t('countries.' + c.code);
    const displayName = translated.startsWith('countries.') ? (c.name_zh || c.name_en || c.code) : translated;
    return { value: c.code, label: `${displayName} (${c.code})` };
  });

  // 按 country_code 分組的館名選項（供 DistributionRow 使用）
  const catalogOptionsByCountry = allCatalogs.reduce((acc, cat) => {
    const code = cat.country_code || '';
    if (!acc[code]) acc[code] = [];
    acc[code].push({ value: cat.catalog_name, label: cat.catalog_name });
    return acc;
  }, {});

  // ─── 文件表格欄位 ─────────────────────────────────────────────────────────
  const columns = [
    {
      title: t('librarySettings.documentName'), dataIndex: 'name', key: 'name', ellipsis: true,
      render: (name, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          {r.description && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{r.description}</div>}
        </div>
      ),
    },
    {
      title: t('librarySettings.distributedCountries'), key: 'distributions', width: 200,
      render: (_, r) => {
        const codes = r.distribution_countries || [];
        if (codes.length === 0) return <Tag color="default">{t('librarySettings.noDistributedCountries')}</Tag>;
        if (codes.length <= 3) {
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {codes.map((code) => (
                <Tag key={code} color="blue" style={{ margin: 0 }}>{code}</Tag>
              ))}
            </div>
          );
        }
        // 4 個以上：顯示「X 個國家」，hover 顯示所有國家名稱
        const tooltipContent = codes.map((code) => {
          const c = countries.find((x) => x.code === code);
          if (!c) return code;
          const translated = t('countries.' + code);
          const name = translated.startsWith('countries.') ? (c.name_zh || c.name_en || code) : translated;
          return `${name} (${code})`;
        }).join('、');
        return (
          <Tooltip title={tooltipContent} placement="topLeft">
            <Tag color="blue" style={{ cursor: 'default' }}>
              {codes.length} {t('librarySettings.countriesCount')}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: t('common.files'), key: 'files', width: 100,
      render: (_, r) => {
        const fc = (r.files || []).length;
        return fc > 0
          ? <Tag color="green">{t('librarySettings.fileUploaded')}{fc > 1 ? ` (${fc})` : ''}</Tag>
          : <Tag color="default">{t('librarySettings.fileNotUploaded')}</Tag>;
      },
    },
    {
      title: t('common.actions'), key: 'actions', width: 80,
      render: (_, r) => (
        <Dropdown
          menu={{
            items: [
              { key: 'edit', icon: <EditOutlined />, label: t('common.edit'), onClick: () => handleOpenEdit(r) },
              { key: 'dist', icon: <SendOutlined />, label: t('librarySettings.distributionSettings'), onClick: () => handleOpenDist(r) },
              { type: 'divider' },
              {
                key: 'del', icon: <DeleteOutlined />, label: t('common.delete'), danger: true,
                onClick: () => Modal.confirm({
                  title: t('librarySettings.deleteDocument'),
                  content: t('librarySettings.deleteDocumentHint'),
                  onOk: () => handleDeleteDoc(r.doc_id),
                  okText: t('common.delete'),
                  cancelText: t('common.cancel'),
                  okButtonProps: { danger: true },
                }),
              },
            ],
          }}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button type="text" icon={<MoreOutlined />} style={{ fontSize: 18 }} />
        </Dropdown>
      ),
    },
  ];

  // ─── 渲染 ─────────────────────────────────────────────────────────────────
  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2 className="page-title">
          <DatabaseOutlined style={{ marginRight: 8 }} />
          {t('librarySettings.title')}
        </h2>
      </div>

      <div className="lib-tab-bar">
        <Segmented
          value={activeTab}
          onChange={setActiveTab}
          options={[
            {
              value: 'catalogs',
              label: (
                <span className="lib-tab-label">
                  <FolderOutlined style={{ marginRight: 6 }} />
                  {t('librarySettings.libraryManagement')}
                  <Tag className="lib-tab-count" color={activeTab === 'catalogs' ? 'blue' : 'default'}>{catalogs.length}</Tag>
                </span>
              ),
            },
            {
              value: 'documents',
              label: (
                <span className="lib-tab-label">
                  <FileTextOutlined style={{ marginRight: 6 }} />
                  {t('librarySettings.documentManagement')}
                  <Tag className="lib-tab-count" color={activeTab === 'documents' ? 'blue' : 'default'}>{docs.length}</Tag>
                </span>
              ),
            },
          ]}
          size="large"
          block
        />
      </div>

      <div className="lib-tab-content">
        <Spin spinning={loading} tip={t('common.loading')}>
          {activeTab === 'catalogs' ? (
            /* ── 館管理 Tab ── */
            <div className="catalog-view">
              <div className="lib-toolbar">
                <div className="lib-toolbar-filters">
                  <Input
                    placeholder={t('librarySettings.searchLibraryPlaceholder')}
                    prefix={<SearchOutlined style={{ color: '#bbb' }} />}
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    allowClear
                    className="lib-toolbar-search"
                  />
                  <Select
                    value={catalogCountry || undefined}
                    onChange={(v) => setCatalogCountry(v || '')}
                    placeholder={t('librarySettings.filterByCountry')}
                    allowClear
                    style={{ width: 160 }}
                    options={countrySelectOptions}
                  />
                </div>
                <Button
                  type="primary"
                  icon={<FolderAddOutlined />}
                  onClick={() => setAddCatalogModal(true)}
                  style={{ background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
                >
                  {t('librarySettings.addNewLibrary')}
                </Button>
              </div>

              {filteredCatalogs.length === 0 ? (
                <Empty description={catalogSearch ? t('common.noData') : t('librarySettings.noCatalogs')} style={{ padding: '60px 0' }} />
              ) : (
                <div className="catalog-grid">
                  {filteredCatalogs.map((cat) => (
                    <div key={cat.catalog_id} className="catalog-card">
                      <div className="catalog-card-image-area">
                        {cat.image_url ? (
                          <CatalogCoverImage catalogId={cat.catalog_id} />
                        ) : (
                          <div className="catalog-card-img-placeholder">
                            <PictureOutlined style={{ fontSize: 36, color: '#d9d9d9' }} />
                          </div>
                        )}
                      </div>
                      <div className="catalog-card-body">
                        <Tooltip title={cat.catalog_name} placement="top">
                          <div className="catalog-card-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'default', display: 'flex', alignItems: 'center' }}>
                            <FolderOutlined style={{ marginRight: 6, color: 'var(--primary-color)', flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.catalog_name}</span>
                          </div>
                        </Tooltip>
                        <div className="catalog-card-stat" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                          {cat.country_code && (
                            <Tag color="geekblue" style={{ margin: 0, fontSize: 11 }}>
                              {(() => {
                                const c = countries.find((x) => x.code === cat.country_code);
                                if (!c) return cat.country_code;
                                const translated = t('countries.' + cat.country_code);
                                return translated.startsWith('countries.') ? (c.name_zh || c.name_en || cat.country_code) : translated;
                              })()}
                            </Tag>
                          )}
                          <Tag color={(cat.doc_count || 0) > 0 ? 'blue' : 'default'}>
                            {t('librarySettings.documentCount', { count: cat.doc_count || 0 })}
                          </Tag>
                        </div>
                      </div>
                      <div className="catalog-card-actions">
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          onClick={() => handleOpenEditCatalog(cat)}
                          size="small"
                          style={{ color: 'var(--primary-color)' }}
                        >
                          {t('librarySettings.editLibrary')}
                        </Button>
                        {(cat.doc_count || 0) === 0 ? (
                          <Popconfirm
                            title={t('librarySettings.deleteLibraryConfirm', { name: cat.catalog_name })}
                            onConfirm={() => handleDeleteCatalog(cat)}
                            okText={t('librarySettings.confirmDelete')}
                            cancelText={t('common.cancel')}
                            okButtonProps={{ danger: true }}
                          >
                            <Button type="text" danger icon={<DeleteOutlined />} size="small">
                              {t('librarySettings.deleteLibraryBtn')}
                            </Button>
                          </Popconfirm>
                        ) : (
                          <Tooltip title={t('librarySettings.deleteLibraryDisabledHint')}>
                            <Button type="text" icon={<DeleteOutlined />} size="small" disabled style={{ color: '#ccc' }}>
                              {t('librarySettings.deleteLibraryBtn')}
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ── 文件管理 Tab ── */
            <div className="document-view">
              <div className="lib-toolbar">
                <div className="lib-toolbar-filters">
                  <Select
                    placeholder={t('librarySettings.filterByLibrary')}
                    value={docFilterCatalog}
                    onChange={setDocFilterCatalog}
                    allowClear
                    style={{ minWidth: 180 }}
                    options={catalogOptions}
                  />
                  <Input
                    placeholder={t('librarySettings.searchDocPlaceholder')}
                    prefix={<SearchOutlined style={{ color: '#bbb' }} />}
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    allowClear
                    className="lib-toolbar-search"
                  />
                </div>
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  onClick={handleOpenUpload}
                  style={{ background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
                >
                  {t('librarySettings.uploadDocument')}
                </Button>
              </div>

              {docFilterCatalog && (
                <div className="lib-filter-tag">
                  <span>{t('librarySettings.filteringBy')}</span>
                  <Tag closable onClose={() => setDocFilterCatalog(null)} color="blue">
                    <FolderOutlined style={{ marginRight: 4 }} />{docFilterCatalog}
                  </Tag>
                </div>
              )}

              <Table
                columns={columns}
                dataSource={filteredDocs}
                rowKey="doc_id"
                pagination={{ pageSize: 10 }}
                locale={{ emptyText: t('librarySettings.noDocuments') }}
              />
            </div>
          )}
        </Spin>
      </div>

      {/* ── 新增館 Modal ── */}
      <Modal
        title={<span><FolderAddOutlined style={{ marginRight: 8 }} />{t('librarySettings.addNewLibrary')}</span>}
        open={addCatalogModal}
        onCancel={() => { setAddCatalogModal(false); setAddCatalogName(''); setAddCatalogDesc(''); setAddCatalogCountry(''); }}
        onOk={handleAddCatalog}
        confirmLoading={addCatalogLoading}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        okButtonProps={{ style: { background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }, disabled: !addCatalogName.trim() || !addCatalogCountry }}
      >
        <p style={{ marginBottom: 12, color: '#666' }}>{t('librarySettings.addNewLibraryHint')}</p>
        {/* 國家選擇 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
            {t('librarySettings.catalogCountryLabel')} <span style={{ color: '#ff4d4f' }}>*</span>
          </div>
          <Select
            value={addCatalogCountry || undefined}
            onChange={(v) => setAddCatalogCountry(v || '')}
            placeholder={t('librarySettings.catalogCountryPlaceholder')}
            options={countrySelectOptions}
            style={{ width: '100%' }}
            size="large"
          />
        </div>
        <Input
          placeholder={t('librarySettings.newLibraryPlaceholder')}
          value={addCatalogName}
          onChange={(e) => setAddCatalogName(e.target.value)}
          onPressEnter={handleAddCatalog}
          prefix={<FolderOutlined style={{ color: '#bbb' }} />}
          size="large"
          style={{ marginBottom: 10 }}
        />
        <Input.TextArea
          placeholder={t('librarySettings.libraryDescPlaceholder')}
          value={addCatalogDesc}
          onChange={(e) => setAddCatalogDesc(e.target.value)}
          rows={2}
        />
      </Modal>

      {/* ── 上傳文件 Modal ── */}
      <Modal
        title={<span><UploadOutlined style={{ marginRight: 8 }} />{t('librarySettings.uploadDocument')}</span>}
        open={uploadModal}
        onCancel={handleUploadCancel}
        onOk={handleUpload}
        confirmLoading={uploadLoading}
        okText={piiScanning ? t('pii.scanningFiles') : t('common.upload')}
        cancelText={t('common.cancel')}
        okButtonProps={{
          style: { background: 'var(--primary-color)', borderColor: 'var(--primary-color)' },
          disabled: piiScanning,
          loading: piiScanning,
        }}
        width={640}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('librarySettings.documentName')} rules={[{ required: true, message: t('librarySettings.documentNameRequired') }]}>
            <Input placeholder={t('librarySettings.documentNamePlaceholder')} />
          </Form.Item>
          <Form.Item name="description" label={t('librarySettings.descriptionLabel')} rules={[{ required: true, message: t('librarySettings.descriptionRequired') }]}>
            <Input.TextArea rows={3} placeholder={t('librarySettings.descriptionPlaceholder')} />
          </Form.Item>
          <Form.Item
            name="file"
            label={t('librarySettings.uploadFile')}
            valuePropName="file"
            extra={piiScanning ? t('pii.scanningFiles') : t('librarySettings.uploadFileHint')}
            getValueFromEvent={fileUploadValueHandler}
          >
            <Upload maxCount={1} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.odp" beforeUpload={() => false}>
              <Button icon={<UploadOutlined />} loading={piiScanning}>
                {piiScanning ? t('pii.scanningFiles') : t('common.selectFile')}
              </Button>
            </Upload>
          </Form.Item>

          <Divider style={{ margin: '12px 0' }} />

          {/* 分發設定 */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
              <GlobalOutlined style={{ marginRight: 6, color: 'var(--primary-color)' }} />
              {t('librarySettings.distributionSettings')}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>{t('librarySettings.distributionSettingsHint')}</div>

            <div style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 2 }}>
              {distributions.map((rule, idx) => (
                <DistributionRow
                  key={rule.country_code + idx}
                  rule={rule}
                  catalogOptionsByCountry={catalogOptionsByCountry}
                  countries={countries}
                  userListByCountry={userListByCountry}
                  userListLoading={userListLoading}
                  t={t}
                  onRemove={() => setDistributions((prev) => prev.filter((_, i) => i !== idx))}
                  onChange={(updated) => setDistributions((prev) => prev.map((r, i) => i === idx ? updated : r))}
                />
              ))}
            </div>

            {/* 國家勾選清單（含全選） */}
            <div style={{ border: '1px solid #e8e8e8', borderRadius: 8, padding: '8px 12px', background: '#fafafa', marginBottom: 8 }}>
              {countries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '8px 0', color: '#bbb', fontSize: 13 }}>{t('common.noData')}</div>
              ) : (
                <>
                  {/* 全選 */}
                  <div style={{ marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid #e8e8e8' }}>
                    <Checkbox
                      checked={usedCountriesInUpload.length === countries.length && countries.length > 0}
                      indeterminate={usedCountriesInUpload.length > 0 && usedCountriesInUpload.length < countries.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          countries.forEach((c) => handleToggleDistInUpload(c.code, true));
                        } else {
                          setDistributions([]);
                        }
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{t('common.selectAll') || '全選'}</span>
                    </Checkbox>
                  </div>
                  {countries.map((c) => {
                    const translated = t('countries.' + c.code);
                    const displayName = translated.startsWith('countries.') ? (c.name_zh || c.name || c.code) : translated;
                    const isChecked = usedCountriesInUpload.includes(c.code);
                    return (
                      <div key={c.code} style={{ marginBottom: 4 }}>
                        <Checkbox
                          checked={isChecked}
                          onChange={(e) => handleToggleDistInUpload(c.code, e.target.checked)}
                        >
                          <span style={{ fontWeight: 500 }}>{displayName}</span>
                          <span style={{ color: '#999', marginLeft: 6, fontSize: 12 }}>({c.code})</span>
                        </Checkbox>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </Form>
      </Modal>

      {/* ── 編輯文件 Modal ── */}
      <Modal
        title={<span><EditOutlined style={{ marginRight: 8 }} />{t('librarySettings.editDocument')}</span>}
        open={!!editModal}
        onCancel={() => { setEditModal(null); setEditFileList([]); editForm.resetFields(); }}
        onOk={handleEditSave}
        confirmLoading={editLoading}
        okText={piiScanning ? t('pii.scanningFiles') : t('common.save')}
        cancelText={t('common.cancel')}
        okButtonProps={{
          style: { background: 'var(--primary-color)', borderColor: 'var(--primary-color)' },
          disabled: piiScanning,
          loading: piiScanning,
        }}
        width={560}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="name" label={t('librarySettings.documentName')} rules={[{ required: true, message: t('librarySettings.documentNameRequired') }]}>
            <Input placeholder={t('librarySettings.documentNamePlaceholder')} />
          </Form.Item>
          <Form.Item name="description" label={t('librarySettings.descriptionLabel')}>
            <Input.TextArea rows={3} placeholder={t('librarySettings.descriptionPlaceholder')} />
          </Form.Item>

          {/* 目前檔案（唯讀顯示） */}
          {editModal?.files?.length > 0 && editFileList.length === 0 && (
            <Form.Item label={t('librarySettings.currentAttachments')}>
              {editModal.files.map((f) => (
                <div key={f.filename} style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', background: '#f5f5f5', borderRadius: 4, fontSize: 13 }}>
                  <PaperClipOutlined style={{ marginRight: 6, color: '#1890ff' }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.filename}
                    {f.file_size ? ` (${(f.file_size / 1024).toFixed(0)} KB)` : ''}
                  </span>
                </div>
              ))}
            </Form.Item>
          )}

          <Form.Item
            label={t('librarySettings.uploadFile')}
            extra={editFileList.length > 0
              ? t('librarySettings.replaceFileHint')
              : (piiScanning ? t('pii.scanningFiles') : t('librarySettings.replaceFileHintEmpty'))}
          >
            <Upload
              maxCount={1}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.odp"
              fileList={editFileList}
              onChange={({ fileList: newFileList }) => {
                const latest = newFileList.slice(-1);
                const fileSize = latest[0]?.originFileObj?.size || latest[0]?.size || 0;
                if (fileSize > 100 * 1024 * 1024) {
                  message.error(t('librarySettings.fileSizeExceeded', { size: (fileSize / 1024 / 1024).toFixed(1) }));
                  return;
                }
                setEditFileList(latest);
                if (latest.length > 0) handlePiiScan(latest, setEditFileList);
              }}
              beforeUpload={() => false}
            >
              <Button icon={<CloudUploadOutlined />} loading={piiScanning}>
                {piiScanning ? t('pii.scanningFiles') : t('common.selectFile')}
              </Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      {/* ── 分發規則 Modal ── */}
      <Modal
        title={
          <span>
            <SendOutlined style={{ marginRight: 8 }} />
            {t('librarySettings.editDistribution')} — {distModal?.name}
          </span>
        }
        open={!!distModal}
        onCancel={() => { setDistModal(null); setDistRules([]); }}
        onOk={handleSaveDist}
        confirmLoading={distSaving}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        okButtonProps={{ style: { background: 'var(--primary-color)', borderColor: 'var(--primary-color)' } }}
        width={640}
      >
        {distLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin /></div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>{t('librarySettings.distributionSettingsHint')}</div>

            <div style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 2 }}>
              {distRules.map((rule, idx) => (
                <DistributionRow
                  key={rule.country_code}
                  rule={rule}
                  catalogOptionsByCountry={catalogOptionsByCountry}
                  countries={countries}
                  userListByCountry={userListByCountry}
                  userListLoading={userListLoading}
                  t={t}
                  onRemove={() => setDistRules((prev) => prev.filter((_, i) => i !== idx))}
                  onChange={(updated) => setDistRules((prev) => prev.map((r, i) => i === idx ? updated : r))}
                />
              ))}
            </div>

            {/* 國家勾選清單（含全選） */}
            <div style={{ border: '1px solid #e8e8e8', borderRadius: 8, padding: '8px 12px', background: '#fafafa', marginBottom: 8 }}>
              {countries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '8px 0', color: '#bbb', fontSize: 13 }}>{t('common.noData')}</div>
              ) : (
                <>
                  {/* 全選 */}
                  <div style={{ marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid #e8e8e8' }}>
                    <Checkbox
                      checked={usedCountriesInDist.length === countries.length && countries.length > 0}
                      indeterminate={usedCountriesInDist.length > 0 && usedCountriesInDist.length < countries.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          countries.forEach((c) => handleToggleDist2(c.code, true));
                        } else {
                          setDistRules([]);
                        }
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{t('common.selectAll') || '全選'}</span>
                    </Checkbox>
                  </div>
                  {countries.map((c) => {
                    const translated = t('countries.' + c.code);
                    const displayName = translated.startsWith('countries.') ? (c.name_zh || c.name || c.code) : translated;
                    const isChecked = usedCountriesInDist.includes(c.code);
                    return (
                      <div key={c.code} style={{ marginBottom: 4 }}>
                        <Checkbox
                          checked={isChecked}
                          onChange={(e) => handleToggleDist2(c.code, e.target.checked)}
                        >
                          <span style={{ fontWeight: 500 }}>{displayName}</span>
                          <span style={{ color: '#999', marginLeft: 6, fontSize: 12 }}>({c.code})</span>
                        </Checkbox>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* ── 編輯館 Modal ── */}
      <Modal
        title={
          <span>
            <EditOutlined style={{ marginRight: 8 }} />
            {t('librarySettings.editLibraryTitle', { name: editCatalogModal?.catalog_name })}
          </span>
        }
        open={!!editCatalogModal}
        onCancel={handleCloseEditCatalog}
        onOk={handleSaveEditCatalog}
        confirmLoading={editCatalogLoading}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        okButtonProps={{ style: { background: 'var(--primary-color)', borderColor: 'var(--primary-color)' } }}
        width={600}
      >
        {/* 館名編輯 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
            <FolderOutlined style={{ marginRight: 6, color: 'var(--primary-color)' }} />
            {t('librarySettings.editLibraryNameLabel')}
          </div>
          <Input
            value={editCatalogName}
            onChange={(e) => setEditCatalogName(e.target.value)}
            placeholder={t('librarySettings.editLibraryNamePlaceholder')}
            size="large"
            prefix={<FolderOutlined style={{ color: '#bbb' }} />}
            style={{ marginBottom: 8 }}
          />
          <Input.TextArea
            value={editCatalogDesc}
            onChange={(e) => setEditCatalogDesc(e.target.value)}
            placeholder="館的描述（選填）"
            rows={2}
          />
        </div>

        <Divider style={{ margin: '16px 0' }} />

        {/* 封面圖片管理 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
            <PictureOutlined style={{ marginRight: 6, color: 'var(--primary-color)' }} />
            {t('librarySettings.coverImage')}
          </div>

          {editCatalogExistingImageUrl && !editCatalogImagePreview && (
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={editCatalogExistingImageUrl} alt="cover" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #d9d9d9' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{t('librarySettings.currentCoverImage')}</div>
                <Popconfirm
                  title={t('librarySettings.deleteCoverImageConfirm')}
                  onConfirm={handleEditCatalogDeleteImage}
                  okText={t('common.confirm')}
                  cancelText={t('common.cancel')}
                  okButtonProps={{ danger: true }}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>{t('librarySettings.deleteImage')}</Button>
                </Popconfirm>
              </div>
            </div>
          )}

          <Upload
            accept=".png,.jpg,.jpeg"
            maxCount={1}
            fileList={editCatalogImageFileList}
            beforeUpload={(file) => {
              if (file.size > 5 * 1024 * 1024) { message.error(t('librarySettings.imageSizeExceeded')); return Upload.LIST_IGNORE; }
              const reader = new FileReader();
              reader.onload = (e) => setEditCatalogImagePreview(e.target.result);
              reader.readAsDataURL(file);
              return false;
            }}
            onChange={({ fileList }) => {
              setEditCatalogImageFileList(fileList.slice(-1));
              if (fileList.length === 0) setEditCatalogImagePreview(null);
            }}
            onRemove={() => setEditCatalogImagePreview(null)}
          >
            <Button icon={<PictureOutlined />} size="small">
              {editCatalogExistingImageUrl ? t('librarySettings.changeImage') : t('librarySettings.uploadImage')}
            </Button>
          </Upload>

          {editCatalogImagePreview && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={editCatalogImagePreview} alt="preview" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #d9d9d9' }} />
              <div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{t('librarySettings.imagePreview')}</div>
                <Button type="primary" size="small" loading={editCatalogImageUploading} onClick={handleEditCatalogUploadImage} style={{ background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}>
                  {t('common.upload')}
                </Button>
              </div>
            </div>
          )}
        </div>

        <Divider style={{ margin: '16px 0' }} />

        {/* 館內文件列表 */}
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
            <FileTextOutlined style={{ marginRight: 6, color: 'var(--primary-color)' }} />
            {t('librarySettings.editLibraryDocsTitle')}
            <Tag color="blue" style={{ marginLeft: 8, fontSize: 11 }}>{editCatalogDocs.length}</Tag>
          </div>

          {editCatalogDocsLoading ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}><Spin size="small" /></div>
          ) : editCatalogDocs.length === 0 ? (
            <Empty description={t('librarySettings.editLibraryNoDocuments')} style={{ padding: '20px 0' }} />
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
              {editCatalogDocs.map((doc) => (
                <div
                  key={doc.doc_id}
                  style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f5f5f5', gap: 8 }}
                >
                  <FileTextOutlined style={{ color: '#1890ff', flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                    {doc.name}
                  </span>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {(doc.distribution_countries || []).map((code) => (
                      <Tag key={code} color="blue" style={{ margin: 0, fontSize: 11 }}>
                        {code}
                      </Tag>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* ── 離開確認 Modal ── */}
      <Modal
        title={t('librarySettings.leaveConfirmTitle')}
        open={uploadLeaveConfirmOpen}
        onCancel={() => setUploadLeaveConfirmOpen(false)}
        footer={[
          <Button key="discard" danger onClick={closeUploadModal}>
            {t('librarySettings.leaveConfirmDiscard')}
          </Button>,
          <Button
            key="continue"
            type="primary"
            onClick={() => setUploadLeaveConfirmOpen(false)}
            style={{ background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
          >
            {t('librarySettings.leaveConfirmContinue')}
          </Button>,
        ]}
        centered
        width={420}
      >
        <p>{t('librarySettings.leaveConfirmMessage')}</p>
      </Modal>
    </div>
  );
};

export default LibrarySettings;
