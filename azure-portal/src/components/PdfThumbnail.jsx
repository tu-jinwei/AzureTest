import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Spin } from 'antd';
import { LoadingOutlined, FilePdfOutlined } from '@ant-design/icons';
import * as pdfjsLib from 'pdfjs-dist';

// 設定 worker — 使用 public 目錄中的靜態檔案
// import.meta.env.BASE_URL 會自動對應 vite.config 中的 base 設定
pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

/**
 * PDF 第一頁縮圖元件
 * @param {string} url - PDF 的 blob URL 或遠端 URL
 * @param {number} [width=240] - 縮圖渲染解析度（像素寬度，僅在非 fitHeight 模式使用）
 * @param {number} [maxWidth] - 顯示最大寬度（px），用於 contain 縮放
 * @param {number} [maxHeight] - 顯示最大高度（px），用於 contain 縮放
 * @param {number} [fitHeight] - 若設定，以此高度為基準縮放（維持比例）
 * @param {number} [fitMaxWidth] - 搭配 fitHeight 使用，若計算出的寬度超過此值，改以寬度為基準縮放
 * @param {boolean} [fitContainer] - 若設定，自動偵測容器寬度，以 contain 方式填滿容器（需搭配固定高度的父容器）
 * @param {function} [onClick] - 點擊縮圖的回調
 * @param {string} [className] - 額外的 CSS class
 */
const PdfThumbnail = ({ url, width = 240, maxWidth, maxHeight, fitHeight, fitMaxWidth, fitContainer, onClick, className = '' }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 計算好的 CSS 顯示尺寸（保持比例，不扭曲）
  const [displaySize, setDisplaySize] = useState(null);
  // PDF 原始比例（寬/高）
  const pdfRatioRef = useRef(null);
  // 已渲染的 canvas 尺寸
  const renderedRef = useRef(false);

  const computeContainerFit = useCallback(() => {
    if (!fitContainer || !containerRef.current || !pdfRatioRef.current) return;
    const { pdfW, pdfH } = pdfRatioRef.current;
    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    if (!containerW || !containerH) return;

    const ratio = pdfW / pdfH;
    let cssW = containerW;
    let cssH = cssW / ratio;
    if (cssH > containerH) {
      cssH = containerH;
      cssW = cssH * ratio;
    }
    setDisplaySize({ width: Math.round(cssW), height: Math.round(cssH) });
  }, [fitContainer]);

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
      setDisplaySize(null);
      renderedRef.current = false;
      try {
        const pdf = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const viewport = page.getViewport({ scale: 1 });
        const pdfW = viewport.width;
        const pdfH = viewport.height;

        // 使用 devicePixelRatio 提高 canvas 渲染解析度，避免縮圖模糊
        const dpr = window.devicePixelRatio || 1;

        let renderScale;
        if (fitContainer) {
          // fitContainer 模式：以容器寬度為基準渲染，後續 CSS 再 contain 縮放
          const containerW = containerRef.current?.clientWidth || 400;
          renderScale = containerW / pdfW;
        } else if (fitHeight) {
          // 以高度為基準計算 scale，維持比例
          renderScale = fitHeight / pdfH;
        } else {
          // 以寬度為基準（原本邏輯）
          renderScale = width / pdfW;
        }

        // 實際渲染用高解析度 scale（乘以 dpr），CSS 顯示用原始 scale
        const hiResScale = renderScale * dpr;
        const scaledViewport = page.getViewport({ scale: hiResScale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        const ctx = canvas.getContext('2d');
        await page.render({
          canvasContext: ctx,
          viewport: scaledViewport,
        }).promise;

        if (!cancelled) {
          if (fitContainer) {
            // 儲存 PDF 比例，讓 ResizeObserver 計算 CSS 尺寸
            pdfRatioRef.current = { pdfW, pdfH };
            renderedRef.current = true;
            // 立即計算一次
            const containerW = containerRef.current?.clientWidth || 400;
            const containerH = containerRef.current?.clientHeight || 300;
            const ratio = pdfW / pdfH;
            let cssW = containerW;
            let cssH = cssW / ratio;
            if (cssH > containerH) {
              cssH = containerH;
              cssW = cssH * ratio;
            }
            setDisplaySize({ width: Math.round(cssW), height: Math.round(cssH) });
          } else if (fitHeight) {
            // fitHeight 模式：高度固定，寬度依比例計算
            let cssH = fitHeight;
            let cssW = Math.round(cssH * (pdfW / pdfH));
            // 若寬度超過 fitMaxWidth，改以寬度為基準縮放
            if (fitMaxWidth && cssW > fitMaxWidth) {
              cssW = fitMaxWidth;
              cssH = Math.round(cssW * (pdfH / pdfW));
            }
            setDisplaySize({ width: cssW, height: cssH });
          } else if (maxWidth || maxHeight) {
            // contain 模式：保持比例，不超過 maxWidth/maxHeight
            const mw = maxWidth || Infinity;
            const mh = maxHeight || Infinity;
            const ratio = pdfW / pdfH;

            let cssW = pdfW;
            let cssH = pdfH;

            if (cssW > mw) {
              cssW = mw;
              cssH = cssW / ratio;
            }
            if (cssH > mh) {
              cssH = mh;
              cssW = cssH * ratio;
            }

            setDisplaySize({ width: Math.round(cssW), height: Math.round(cssH) });
          }

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
  }, [url, width, maxWidth, maxHeight, fitHeight, fitContainer]);

  // fitContainer 模式：監聽容器尺寸變化，重新計算 CSS 顯示尺寸
  useEffect(() => {
    if (!fitContainer || !containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (renderedRef.current) {
        computeContainerFit();
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [fitContainer, computeContainerFit]);

  return (
    <div
      ref={containerRef}
      className={`pdf-thumbnail-container ${className}`}
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        width: '100%',
        height: fitHeight ? `${fitHeight}px` : '100%',
        maxHeight: fitHeight ? `${fitHeight}px` : undefined,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
        overflow: 'hidden',
      }}
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
          flexShrink: 0,
          ...(displaySize
            ? { width: `${displaySize.width}px`, height: `${displaySize.height}px` }
            : { maxWidth: '100%', height: 'auto' }
          ),
          borderRadius: 4,
        }}
      />
    </div>
  );
};

export default PdfThumbnail;
