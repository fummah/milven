import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, Drawer, Empty, Input, Space, Spin, Tag, Tooltip, Typography, Grid, message } from 'antd';
import {
  ArrowLeftOutlined, CloseOutlined, DownloadOutlined, FullscreenExitOutlined, FullscreenOutlined,
  LeftOutlined, MenuOutlined, RightOutlined, SearchOutlined, ZoomInOutlined, ZoomOutOutlined
} from '@ant-design/icons';
import { api } from '../../lib/api';
import { highlightParts, levelLabel } from '../../lib/slideUrls';
import { getPdfErrorInfo, loadPdfDocument } from '../../lib/pdfViewer';


const { Text } = Typography;
const { useBreakpoint } = Grid;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function LazyPdfThumbnail({ pdfDoc, pageNumber, active, onSelect }) {
  const ref = useRef(null);
  const canvasRef = useRef(null);
  const [visible, setVisible] = useState(Boolean(active));
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (active) setVisible(true);
  }, [active]);

  useEffect(() => {
    if (visible || !ref.current) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { root: null, rootMargin: '400px 0px', threshold: 0.01 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !pdfDoc || !canvasRef.current || rendered) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        const scale = 150 / viewport.width;
        const scaled = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(scaled.width * ratio);
        canvas.height = Math.floor(scaled.height * ratio);
        canvas.style.width = `${Math.floor(scaled.width)}px`;
        canvas.style.height = `${Math.floor(scaled.height)}px`;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined }).promise;
        if (!cancelled) setRendered(true);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [visible, pdfDoc, pageNumber, rendered]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      style={{
        width: '100%', border: active ? '2px solid #3b82f6' : '2px solid transparent',
        borderRadius: 8, background: '#0b1220', padding: 4, marginBottom: 6, cursor: 'pointer',
        opacity: active ? 1 : 0.82
      }}
      aria-label={`Page ${pageNumber}`}
    >
      <div style={{ position: 'relative', minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617', borderRadius: 4, overflow: 'hidden' }}>
        {!rendered && <Spin size="small" />}
        <canvas ref={canvasRef} style={{ display: rendered ? 'block' : 'none', maxWidth: '100%' }} />
        <span style={{ position: 'absolute', left: 4, bottom: 3, fontSize: 10, color: '#e2e8f0', background: 'rgba(2,6,23,0.75)', padding: '0 4px', borderRadius: 3 }}>
          {pageNumber}
        </span>
      </div>
    </button>
  );
}

export default function ModuleNotePdfViewer() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch { return null; }
  }, []);
  const isAdmin = user?.role === 'ADMIN';
  const backPath = isAdmin ? '/admin/module-notes' : '/student/module-notes';

  const [meta, setMeta] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState('page');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const viewerRef = useRef(null);
  const canvasRef = useRef(null);
  const mainRef = useRef(null);
  const renderTaskRef = useRef(null);
  const touchStart = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 900, height: 700 });

  useEffect(() => {
    let cancelled = false;
    let loadingTask = null;
    setLoading(true);
    setError('');
    setErrorCode('');
    setPdfDoc(null);
    setNumPages(0);
    api.get(`/api/module-note-pdfs/${id}/pdf-access`)
      .then(async res => {
        if (cancelled) return;
        setMeta(res.data);
        loadingTask = loadPdfDocument(res.data.pdfUrl);
        const doc = await loadingTask.promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        const requested = parseInt(searchParams.get('page'), 10);
        setPage(doc.numPages ? clamp(Number.isFinite(requested) ? requested : 1, 1, doc.numPages) : 1);
        if (res.data.book?.title) document.title = `${res.data.book.title} - Milven Module Notes`;
      })
      .catch(err => {
        if (cancelled) return;
        const info = getPdfErrorInfo(err);
        setError(info.message);
        setErrorCode(info.code);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      loadingTask?.destroy?.();
    };
  }, [id, reloadKey]);

  useEffect(() => {
    const requested = parseInt(searchParams.get('page'), 10);
    if (!numPages || !Number.isFinite(requested)) return;
    setPage(prev => (prev === clamp(requested, 1, numPages) ? prev : clamp(requested, 1, numPages)));
  }, [searchParams, numPages]);

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setContainerSize({ width: rect.width, height: rect.height });
    });
    if (mainRef.current) observer.observe(mainRef.current);
    return () => observer.disconnect();
  }, [pdfDoc]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return undefined;
    let cancelled = false;
    setRendering(true);
    (async () => {
      try {
        const pdfPage = await pdfDoc.getPage(page);
        if (cancelled || !canvasRef.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const widthScale = Math.max(0.2, (containerSize.width - 24) / base.width);
        const heightScale = Math.max(0.2, (containerSize.height - 24) / base.height);
        const fitScale = fitMode === 'width' ? widthScale : fitMode === 'page' ? Math.min(widthScale, heightScale) : 1;
        const viewport = pdfPage.getViewport({ scale: fitScale * zoom });
        const canvas = canvasRef.current;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch {}
        }
        const task = pdfPage.render({
          canvasContext: canvas.getContext('2d'),
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined
        });
        renderTaskRef.current = task;
        await task.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          const info = getPdfErrorInfo(err, 'The PDF page could not be rendered. Please retry.');
          setError(info.message);
          setErrorCode(info.code);
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, page, zoom, fitMode, containerSize.width, containerSize.height]);

  useEffect(() => {
    const onKey = event => {
      const tag = String(event.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); goToPage(page + 1); }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); goToPage(page - 1); }
      if (event.key === '+') setZoom(value => clamp(Number((value + 0.15).toFixed(2)), 0.5, 3));
      if (event.key === '-') setZoom(value => clamp(Number((value - 0.15).toFixed(2)), 0.5, 3));
      if (event.key === '0') { setZoom(1); setFitMode('page'); }
      if (event.key.toLowerCase() === 'f') toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, numPages]);

  useEffect(() => {
    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (searchTerm.length < 2) { setSearchResults([]); setSearchError(''); return undefined; }
    let cancelled = false;
    setSearching(true);
    setSearchError('');
    api.get(`/api/module-note-pdfs/${id}/search`, { params: { q: searchTerm } })
      .then(res => { if (!cancelled) setSearchResults(res.data?.results || []); })
      .catch(err => { if (!cancelled) { setSearchResults([]); setSearchError(err?.response?.data?.error || 'Search unavailable.'); } })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [id, searchTerm]);

  const goToPage = useCallback(next => {
    if (!numPages) return;
    const target = clamp(Number(next) || 1, 1, numPages);
    setPage(target);
    setMobileNavOpen(false);
    const params = new URLSearchParams(searchParams);
    params.set('page', String(target));
    setSearchParams(params, { replace: true });
  }, [numPages, searchParams, setSearchParams]);

  const toggleFullscreen = () => {
    if (!viewerRef.current) return;
    if (!document.fullscreenElement) viewerRef.current.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/api/module-note-pdfs/${id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = meta?.book?.originalFilename || 'module-notes.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      message.error('Could not download this PDF.');
    }
  };

  const handleTouchStart = event => {
    if (event.touches.length !== 1) { touchStart.current = null; return; }
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, page };
  };
  const handleTouchEnd = event => {
    if (!touchStart.current || event.changedTouches.length !== 1) return;
    if (!['page', 'width'].includes(fitMode) || zoom !== 1) return;
    const dx = event.changedTouches[0].clientX - touchStart.current.x;
    const dy = event.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
    goToPage(page + (dx < 0 ? 1 : -1));
  };

  const navigator = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#111827' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #1f2937' }}>
        <Input
          allowClear
          value={searchInput}
          onChange={event => setSearchInput(event.target.value)}
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          placeholder="Search in this PDF"
          style={{ background: '#0b1220', borderColor: '#334155', color: '#e2e8f0' }}
        />
        {searchTerm.length >= 2 && (
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
            <Text style={{ color: '#94a3b8', fontSize: 11 }}>{searching ? 'Searching...' : `${searchResults.length} result(s)`}</Text>
            <Button type="link" size="small" style={{ padding: 0, fontSize: 11 }} onClick={() => { setSearchInput(''); setSearchTerm(''); }}>Clear</Button>
          </div>
        )}
        {searchError && <Text style={{ color: '#f87171', fontSize: 11 }}>{searchError}</Text>}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {searchTerm.length >= 2 ? (
          searchResults.length === 0 && !searching ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: '#94a3b8' }}>No matches</span>} />
          ) : searchResults.map(result => (
            <button
              key={result.pageNumber}
              type="button"
              onClick={() => goToPage(result.pageNumber)}
              style={{
                width: '100%', textAlign: 'left', border: '1px solid #1f2937', borderRadius: 8,
                background: page === result.pageNumber ? '#1d4ed8' : '#0b1220', color: '#e2e8f0',
                padding: 8, marginBottom: 6, cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: 11, color: '#93c5fd', marginBottom: 2 }}>Page {result.pageNumber}</div>
              <div style={{ fontSize: 11, color: '#cbd5e1', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {highlightParts(result.excerpt, searchTerm).map((part, index) => part.match
                  ? <mark key={index} style={{ background: '#fbbf24', color: '#111827' }}>{part.text}</mark>
                  : <React.Fragment key={index}>{part.text}</React.Fragment>)}
              </div>
            </button>
          ))
        ) : Array.from({ length: numPages }, (_, index) => index + 1).map(number => (
          <LazyPdfThumbnail
            key={number}
            pdfDoc={pdfDoc}
            pageNumber={number}
            active={page === number}
            onSelect={() => goToPage(number)}
          />
        ))}
      </div>
    </div>
  );

  if (loading) {
    return <div style={{ position: 'fixed', inset: 0, background: '#0b1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" /></div>;
  }

  if (error || !pdfDoc) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0b1220', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Alert
          type="error"
          showIcon
          message="PDF unavailable"
          description={(
            <div>
              <div>{error || 'Could not load this PDF.'}</div>
              {isAdmin && errorCode && <div style={{ marginTop: 6, fontSize: 11, opacity: 0.75 }}>Reference: {errorCode}</div>}
            </div>
          )}
          action={(
            <Space>
              <Button onClick={() => setReloadKey(value => value + 1)}>Retry</Button>
              <Button onClick={() => navigate(backPath)}>Back to Module Notes</Button>
            </Space>
          )}
        />
      </div>
    );
  }

  return (
    <div
      ref={viewerRef}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: '#0b1220', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ minHeight: 56, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#111827', borderBottom: '1px solid #1f2937', flexWrap: 'wrap' }}>
        <Tooltip title="Back to Module Notes"><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(backPath)} style={{ color: '#e2e8f0' }} /></Tooltip>
        {isMobile && <Button type="text" icon={<MenuOutlined />} onClick={() => setMobileNavOpen(true)} style={{ color: '#e2e8f0' }} />}
        <div style={{ flex: 1, minWidth: 150 }}>
          <Text style={{ color: '#f8fafc', fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta?.book?.title}</Text>
          <Text style={{ color: '#94a3b8', fontSize: 11 }}>
            {levelLabel(meta?.book?.level)} · {meta?.book?.volume?.name}{meta?.book?.module?.name ? ` · ${meta.book.module.name}` : ''}
            {isAdmin && <Tag color="gold" style={{ marginLeft: 8 }}>Admin preview</Tag>}
            {meta?.book?.publicationStatus === 'DRAFT' && <Tag style={{ marginLeft: 4 }}>Draft</Tag>}
            {meta?.processingStatus !== 'READY' && <Tag color="processing" style={{ marginLeft: 4 }}>Indexing</Tag>}
          </Text>
        </div>
        <Text style={{ color: '#94a3b8', fontSize: 12 }}>{page} / {numPages}</Text>
        <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}><Button type="text" icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={toggleFullscreen} style={{ color: '#e2e8f0' }} /></Tooltip>
        <Tooltip title="Download PDF"><Button type="text" icon={<DownloadOutlined />} onClick={downloadPdf} style={{ color: '#e2e8f0' }} /></Tooltip>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {!isMobile && !sidebarCollapsed && <div style={{ width: 180, flexShrink: 0, borderRight: '1px solid #1f2937' }}>{navigator}</div>}
        {!isMobile && (
          <div style={{ width: 24, flexShrink: 0, background: '#111827', borderRight: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Tooltip title={sidebarCollapsed ? 'Show pages' : 'Hide pages'} placement="right">
              <Button type="text" size="small" onClick={() => setSidebarCollapsed(v => !v)} icon={sidebarCollapsed ? <RightOutlined /> : <LeftOutlined />} style={{ color: '#94a3b8' }} />
            </Tooltip>
          </div>
        )}
        <div
          ref={mainRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{ flex: 1, minWidth: 0, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 12, position: 'relative', background: '#1e293b' }}
        >
          <canvas ref={canvasRef} style={{ display: 'block', background: '#fff', boxShadow: '0 12px 40px rgba(0,0,0,0.45)' }} />
          {rendering && <div style={{ position: 'absolute', top: 12, right: 12 }}><Spin /></div>}
        </div>
      </div>

      <div style={{ minHeight: 56, padding: '8px 12px', background: '#111827', borderTop: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Tooltip title="Previous page"><Button type="text" icon={<LeftOutlined />} onClick={() => goToPage(page - 1)} disabled={page <= 1} style={{ color: '#e2e8f0' }} /></Tooltip>
        <Tooltip title="Next page"><Button type="text" icon={<RightOutlined />} onClick={() => goToPage(page + 1)} disabled={page >= numPages} style={{ color: '#e2e8f0' }} /></Tooltip>
        <Input type="number" min={1} max={numPages} value={page} onChange={event => { const value = parseInt(event.target.value, 10); if (Number.isFinite(value)) goToPage(value); }} style={{ width: 64, textAlign: 'center', background: '#0b1220', borderColor: '#334155', color: '#e2e8f0' }} />
        <Text style={{ color: '#94a3b8', fontSize: 12 }}>/ {numPages}</Text>
        <Tooltip title="Zoom out"><Button type="text" icon={<ZoomOutOutlined />} onClick={() => setZoom(v => clamp(Number((v - 0.15).toFixed(2)), 0.5, 3))} style={{ color: '#e2e8f0' }} /></Tooltip>
        <Text style={{ color: '#94a3b8', fontSize: 12, minWidth: 42, textAlign: 'center' }}>{Math.round(zoom * 100)}%</Text>
        <Tooltip title="Zoom in"><Button type="text" icon={<ZoomInOutlined />} onClick={() => setZoom(v => clamp(Number((v + 0.15).toFixed(2)), 0.5, 3))} style={{ color: '#e2e8f0' }} /></Tooltip>
        <Button type="text" onClick={() => { setZoom(1); setFitMode('width'); }} style={{ color: '#e2e8f0' }}>Fit width</Button>
        <Button type="text" onClick={() => { setZoom(1); setFitMode('page'); }} style={{ color: '#e2e8f0' }}>Fit page</Button>
        <Tooltip title="Fullscreen"><Button type="text" icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={toggleFullscreen} style={{ color: '#e2e8f0' }} /></Tooltip>
        {isMobile && <Button type="text" icon={<MenuOutlined />} onClick={() => setMobileNavOpen(true)} style={{ color: '#e2e8f0' }}>Pages</Button>}
      </div>

      {isMobile && (
        <Drawer placement="left" open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} width={Math.min(300, window.innerWidth * 0.86)} styles={{ body: { padding: 0, background: '#111827' }, header: { display: 'none' } }}>
          <div style={{ height: '100%' }}>{navigator}</div>
        </Drawer>
      )}
    </div>
  );
}
