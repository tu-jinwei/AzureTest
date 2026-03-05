import React, { useRef, useEffect, useState } from 'react';
import { Spin } from 'antd';
import { LoadingOutlined, FilePdfOutlined } from '@ant-design/icons';
import * as pdfjsLib from 'pdfjs-dist';

// 設定 worker — 使用 public 目錄中的靜態檔案
// import.meta.env.BASE_URL 會自動對應 vite.config 中的 base 設定
pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

/**
 * PDF 第一頁縮圖元件
 * @param {string} url - PDF 的 blob URL 或遠端 URL
 * @param {number} [width=240] - 縮圖寬度
 * @param {function} [onClick] - 點擊縮圖的回調
 * @param {string} [className] - 額外的 CSS class
 */
const PdfThumbnail = ({ url, width = 240, onClick, className = '' }) => {
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      setError(true);
      return;
    }

    let cancelled = false;
    const renderThumbnail = async () => {
      setLoading(true);
      setError(false);
      try {
        const pdf = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // 計算縮放比例
        const viewport = page.getViewport({ scale: 1 });
        const scale = width / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        const ctx = canvas.getContext('2d');
        await page.render({
          canvasContext: ctx,
          viewport: scaledViewport,
        }).promise;

        if (!cancelled) {
          setLoading(false);
        }
      } catch (err) {
        console.error('PDF 縮圖渲染失敗:', err);
        if (!cancelled) {
          setLoading(false);
          setError(true);
        }
      }
    };

    renderThumbnail();

    return () => {
      cancelled = true;
    };
  }, [url, width]);

  return (
    <div
      className={`pdf-thumbnail-container ${className}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {loading && (
        <div className="pdf-thumbnail-loading">
          <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
        </div>
      )}
      {error && !loading && (
        <div className="pdf-thumbnail-error">
          <FilePdfOutlined style={{ fontSize: 36, color: '#e74c3c' }} />
          <span>無法載入預覽</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{
          display: loading || error ? 'none' : 'block',
          maxWidth: '100%',
          borderRadius: 6,
        }}
      />
    </div>
  );
};

export default PdfThumbnail;
