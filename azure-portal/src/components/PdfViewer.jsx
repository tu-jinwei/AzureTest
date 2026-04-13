import React, { useRef, useEffect, useState } from 'react';
import { Spin } from 'antd';
import { LoadingOutlined, FilePdfOutlined } from '@ant-design/icons';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

/**
 * PDF 完整預覽元件（多頁，以容器高度為基準縮放，維持比例，白色背景）
 * @param {string} url - PDF 的 blob URL
 * @param {string} [className] - 額外的 CSS class
 */
const PdfViewer = ({ url, className = '' }) => {
  const containerRef = useRef(null);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 用 ref 儲存高度，避免 containerHeight 變化觸發重複渲染
  const heightRef = useRef(0);
  const [ready, setReady] = useState(false); // 高度就緒後才開始渲染

  // 取得容器高度（同步 + ResizeObserver 雙保險）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const trySetHeight = (h) => {
      if (h > 0 && heightRef.current === 0) {
        heightRef.current = h;
        setReady(true);
      }
    };

    // 同步取得初始高度
    trySetHeight(el.getBoundingClientRect().height || el.clientHeight);

    // ResizeObserver 作為備援（Modal 動畫結束後才有高度）
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        trySetHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!url || !ready) return;

    const targetHeight = heightRef.current;
    if (targetHeight === 0) return;

    let cancelled = false;

    const renderPdf = async () => {
      setLoading(true);
      setError(false);
      setPages([]);

      try {
        const pdf = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;

        const totalPages = pdf.numPages;
        const renderedPages = [];

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          if (cancelled) return;

          const page = await pdf.getPage(pageNum);
          if (cancelled) return;

          // 以容器高度為基準計算 scale（每頁獨立計算，支援直向/橫向混合）
          const viewport1 = page.getViewport({ scale: 1 });
          const scale = targetHeight / viewport1.height;
          const scaledViewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = scaledViewport.width;
          canvas.height = scaledViewport.height;

          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
          if (cancelled) return;

          renderedPages.push({
            canvas,
            pageNum,
            width: scaledViewport.width,
            height: scaledViewport.height,
          });
        }

        if (!cancelled) {
          setPages(renderedPages);
          setLoading(false);
        }
      } catch (err) {
        console.error('PDF 預覽渲染失敗:', err);
        if (!cancelled) {
          setLoading(false);
          setError(true);
        }
      }
    };

    renderPdf();

    return () => {
      cancelled = true;
    };
  }, [url, ready]);

  return (
    <div
      ref={containerRef}
      className={`pdf-viewer-container ${className}`}
      style={{
        width: '100%',
        flex: 1,
        minHeight: 0,
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        overflowX: 'auto',
        overflowY: 'hidden',
        gap: 12,
        padding: '0 16px',
        boxSizing: 'border-box',
      }}
    >
      {loading && (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          color: '#999',
        }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
          <span style={{ fontSize: 14 }}>載入中...</span>
        </div>
      )}
      {error && !loading && (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          color: '#999',
        }}>
          <FilePdfOutlined style={{ fontSize: 48, color: '#e74c3c' }} />
          <span style={{ fontSize: 14 }}>無法載入 PDF</span>
        </div>
      )}
      {!loading && !error && pages.map(({ canvas, pageNum, width, height }) => (
        <div
          key={pageNum}
          style={{
            flexShrink: 0,
            height: heightRef.current || height,
            width: width,
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}
        >
          <canvas
            ref={(el) => {
              if (el && canvas) {
                // 將離屏 canvas 的內容複製到 DOM canvas
                el.width = canvas.width;
                el.height = canvas.height;
                el.getContext('2d').drawImage(canvas, 0, 0);
              }
            }}
            style={{
              display: 'block',
              width: width,
              height: height,
            }}
          />
        </div>
      ))}
    </div>
  );
};

export default PdfViewer;
