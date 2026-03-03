import React, { useState } from 'react';
import { Modal, Button, Pagination, Empty } from 'antd';
import {
  BookOutlined,
  FilePdfOutlined,
  DownloadOutlined,
  EyeOutlined,
  LeftOutlined,
} from '@ant-design/icons';
import { libraries } from '../data/mockData';
import './Library.css';

const DOCS_PER_PAGE = 4;

const Library = () => {
  const [selectedLibrary, setSelectedLibrary] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [pageMap, setPageMap] = useState({});

  const getPage = (libId) => pageMap[libId] || 1;
  const setPage = (libId, page) => setPageMap((prev) => ({ ...prev, [libId]: page }));

  return (
    <div className="library-page">
      <div className="library-header">
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
        <h2 className="page-title">
          <BookOutlined style={{ marginRight: 8 }} />
          線上圖書館
          <span className="section-subtitle">(Online Library)</span>
        </h2>
      </div>

      {!selectedLibrary ? (
        /* ===== 館名卡片概覽 ===== */
        <div className="library-grid">
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
        onCancel={() => setSelectedDoc(null)}
        footer={[
          <Button
            key="download"
            type="primary"
            icon={<DownloadOutlined />}
            style={{ background: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}
            onClick={() => window.open(selectedDoc?.pdfUrl, '_blank')}
          >
            下載
          </Button>,
          <Button key="close" onClick={() => setSelectedDoc(null)}>
            關閉
          </Button>,
        ]}
        width={700}
      >
        {selectedDoc && (
          <div className="pdf-preview-area">
            <div className="pdf-preview-placeholder">
              <EyeOutlined style={{ fontSize: 48, color: '#ccc' }} />
              <p>PDF 預覽區域</p>
              <p className="pdf-preview-hint">（實際使用時可嵌入 PDF Viewer）</p>
            </div>
            <div className="pdf-preview-info">
              <p><strong>檔案名稱：</strong>{selectedDoc.name}</p>
              <p><strong>簡介：</strong>{selectedDoc.description}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Library;
