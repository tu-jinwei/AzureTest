import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Pagination, Empty, Spin, message, Tag, Select } from 'antd';
import {
  BookOutlined,
  FilePdfOutlined,
  DownloadOutlined,
  EyeOutlined,
  LeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { libraryAPI } from '../services/api';
import { adaptLibraryDocs } from '../utils/adapters';
import { libraries as mockLibraries } from '../data/mockData';
import { useCountry } from '../contexts/CountryContext';
import './Library.css';

const DOCS_PER_PAGE = 4;

const Library = () => {
  const { effectiveCountry } = useCountry();

  const [libraries, setLibraries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLibrary, setSelectedLibrary] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [pageMap, setPageMap] = useState({});

  // PDF 預覽狀態
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFilename, setPreviewFilename] = useState(null);

  const fetchLibrary = async (country) => {
    setLoading(true);
    try {
      const res = await libraryAPI.list(country);
      setLibraries(adaptLibraryDocs(res.data));
    } catch (err) {
      console.warn('圖書館 API 失敗，使用 mock 資料', err);
      setLibraries(mockLibraries);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedLibrary(null);
    fetchLibrary(effectiveCountry);
  }, [effectiveCountry]);

  const getPage = (libId) => pageMap[libId] || 1;
  const setPage = (libId, page) => setPageMap((prev) => ({ ...prev, [libId]: page }));

  // 載入 PDF 預覽（使用 blob URL）
  const loadPreview = useCallback(async (doc, filename) => {
    // 清除舊的 blob URL
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (!doc?.hasFile) return;

    setPreviewLoading(true);
    setPreviewFilename(filename || null);
    try {
      const res = await libraryAPI.preview(doc.id, effectiveCountry, filename);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err) {
      console.error('PDF 預覽載入失敗:', err);
      message.error('PDF 預覽載入失敗');
      setPreviewUrl(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [previewUrl, effectiveCountry]);

  // 選擇文件時自動載入預覽
  useEffect(() => {
    if (selectedDoc?.hasFile) {
      loadPreview(selectedDoc);
    }
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoc?.id]);

  // 關閉 Modal 時清理
  const handleCloseModal = () => {
    setSelectedDoc(null);
    setPreviewFilename(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  // 下載檔案
  const handleDownload = async (doc, filename) => {
    if (!doc) return;
    try {
      const res = await libraryAPI.download(doc.id, effectiveCountry, filename);
      // 從 content-disposition header 取得原始檔名
      let downloadName = filename || doc.name || 'download';
      const disposition = res.headers['content-disposition'];
      if (disposition) {
        const utf8Match = disposition.match(/filename\*=utf-8''(.+)/i);
        const plainMatch = disposition.match(/filename="?([^";\n]+)"?/i);
        if (utf8Match) {
          downloadName = decodeURIComponent(utf8Match[1]);
        } else if (plainMatch) {
          downloadName = plainMatch[1];
        }
      }
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      message.error('下載失敗：' + (err.response?.data?.detail || err.message));
    }
  };

  if (loading) {
    return (
      <div className="library-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <Spin size="large" tip="載入圖書館資料中..." />
      </div>
    );
  }

  return (
    <div className="library-page">
      <div className="library-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {selectedLibrary && (
            <Button
              type="text"
              icon={<LeftOutlined />}
              onClick={() => setSelectedLibrary(null)}
              style={{ marginRight: 8 }}
            >
              返回
            </Button>
          )}
          <h2 className="page-title" style={{ margin: 0 }}>
            <BookOutlined style={{ marginRight: 8 }} />
            線上圖書館
            <span className="section-subtitle">(Online Library)</span>
          </h2>
        </div>
      </div>

      {!selectedLibrary ? (
        /* ===== 館名卡片概覽 ===== */
        <div className="library-grid">
          {libraries.length === 0 && (
            <Empty description="此國家尚無圖書館文件" style={{ gridColumn: '1 / -1', padding: '40px 0' }} />
          )}
          {libraries.map((lib) => {
            const currentPage = getPage(lib.id);
            const startIdx = (currentPage - 1) * DOCS_PER_PAGE;
            const pagedDocs = lib.documents.slice(startIdx, startIdx + DOCS_PER_PAGE);

            return (
              <div key={lib.id} className="library-card">
                <div
                  className="library-card-header"
                  onClick={() => setSelectedLibrary(lib)}
                >
                  <BookOutlined style={{ marginRight: 8, color: 'var(--primary-color)' }} />
                  <span className="library-card-name">{lib.name}</span>
                  <span className="library-card-count">({lib.documents.length} 文件)</span>
                </div>
                <div className="library-card-docs">
                  {pagedDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="library-card-doc-item"
                      onClick={() => setSelectedDoc(doc)}
                    >
                      <FilePdfOutlined style={{ color: '#e74c3c', marginRight: 8 }} />
                      <span>{doc.name}</span>
                      {doc.files?.length > 1 && (
                        <Tag size="small" style={{ marginLeft: 6, fontSize: 11 }}>
                          {doc.files.length} 檔案
                        </Tag>
                      )}
                    </div>
                  ))}
                </div>
                <div className="library-card-pagination">
                  {lib.documents.length > DOCS_PER_PAGE && (
                    <Pagination
                      size="small"
                      current={currentPage}
                      total={lib.documents.length}
                      pageSize={DOCS_PER_PAGE}
                      onChange={(page) => setPage(lib.id, page)}
                      showSizeChanger={false}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ===== 展開館名 - 卡片式文件 ===== */
        <div className="library-expanded">
          <h3 className="library-expanded-title">{selectedLibrary.name}</h3>
          <div className="library-doc-grid">
            {selectedLibrary.documents.map((doc) => (
              <div
                key={doc.id}
                className="library-doc-card"
                onClick={() => setSelectedDoc(doc)}
              >
                <div className="library-doc-card-icon">
                  <FilePdfOutlined style={{ fontSize: 36, color: '#e74c3c' }} />
                </div>
                <div className="library-doc-card-name">{doc.name}</div>
                <div className="library-doc-card-desc">{doc.description}</div>
                {doc.files?.length > 1 && (
                  <div className="library-doc-card-badge">
                    <Tag size="small" color="blue">{doc.files.length} 個檔案</Tag>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== PDF 預覽 Modal ===== */}
      <Modal
        title={
          <span>
            <FilePdfOutlined style={{ marginRight: 8, color: '#e74c3c' }} />
            {selectedDoc?.name}
          </span>
        }
        open={!!selectedDoc}
        onCancel={handleCloseModal}
        footer={[
          // 多檔案時顯示下載選單
          selectedDoc?.files?.length > 1 ? (
            <Select
              key="file-download"
              placeholder="選擇要下載的檔案"
              style={{ width: 220, marginRight: 8, textAlign: 'left' }}
              onSelect={(filename) => handleDownload(selectedDoc, filename)}
              options={selectedDoc.files.map((f) => ({
                value: f.filename,
                label: (
                  <span>
                    <FilePdfOutlined style={{ marginRight: 4, color: '#e74c3c' }} />
                    {f.filename} ({(f.file_size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                ),
              }))}
            />
          ) : (
            <Button
              key="download"
              type="primary"
              icon={<DownloadOutlined />}
              disabled={!selectedDoc?.hasFile}
              style={selectedDoc?.hasFile ? { background: 'var(--primary-color)', borderColor: 'var(--primary-color)' } : {}}
              onClick={() => handleDownload(selectedDoc)}
            >
              下載
            </Button>
          ),
          <Button key="close" onClick={handleCloseModal}>
            關閉
          </Button>,
        ]}
        width={900}
        styles={{ body: { maxHeight: '75vh', overflow: 'auto' } }}
      >
        {selectedDoc && (
          <div className="pdf-preview-area">
            {/* PDF 預覽區域 */}
            {selectedDoc.hasFile ? (
              previewLoading ? (
                <div className="pdf-preview-placeholder">
                  <Spin indicator={<LoadingOutlined style={{ fontSize: 36 }} spin />} />
                  <p>載入 PDF 預覽中...</p>
                </div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  className="pdf-preview-iframe"
                  title="PDF Preview"
                />
              ) : (
                <div className="pdf-preview-placeholder">
                  <FilePdfOutlined style={{ fontSize: 48, color: '#e74c3c' }} />
                  <p>無法載入預覽</p>
                </div>
              )
            ) : (
              <div className="pdf-preview-placeholder">
                <EyeOutlined style={{ fontSize: 48, color: '#ccc' }} />
                <p>尚未上傳檔案</p>
              </div>
            )}

            {/* 多檔案切換列表 */}
            {selectedDoc.files?.length > 1 && (
              <div className="pdf-file-list">
                <strong style={{ marginBottom: 8, display: 'block' }}>
                  <FileOutlined style={{ marginRight: 4 }} />
                  附件列表（{selectedDoc.files.length} 個檔案）
                </strong>
                <div className="pdf-file-tags">
                  {selectedDoc.files.map((f, i) => (
                    <Tag
                      key={i}
                      color={previewFilename === f.filename || (!previewFilename && i === 0) ? 'blue' : 'default'}
                      className="pdf-file-tag"
                      onClick={() => loadPreview(selectedDoc, f.filename)}
                    >
                      <FilePdfOutlined style={{ marginRight: 4 }} />
                      {f.filename}
                      <span className="pdf-file-size">
                        ({(f.file_size / 1024 / 1024).toFixed(1)} MB)
                      </span>
                    </Tag>
                  ))}
                </div>
              </div>
            )}

            {/* 文件資訊 */}
            <div className="pdf-preview-info">
              <p><strong>檔案名稱：</strong>{selectedDoc.name}</p>
              <p><strong>簡介：</strong>{selectedDoc.description}</p>
              <p>
                <strong>檔案狀態：</strong>
                {selectedDoc.hasFile ? (
                  <Tag icon={<CheckCircleOutlined />} color="success">
                    已上傳{selectedDoc.files?.length > 1 ? ` (${selectedDoc.files.length} 個檔案)` : ''}
                  </Tag>
                ) : (
                  <Tag icon={<CloseCircleOutlined />} color="default">未上傳</Tag>
                )}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Library;
