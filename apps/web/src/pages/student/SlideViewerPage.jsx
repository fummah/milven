import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, Drawer, Empty, Input, Skeleton, Spin, Tag, Tooltip, Typography, Grid } from 'antd';
import {
  ArrowLeftOutlined, CloseOutlined, DownloadOutlined, FullscreenExitOutlined, FullscreenOutlined,
  LeftOutlined, MenuOutlined, MinusOutlined, PlusOutlined, RightOutlined, SearchOutlined,
  ZoomInOutlined, ZoomOutOutlined
} from '@ant-design/icons';
import { api } from '../../lib/api';
import { assetUrl, highlightParts, levelLabel } from '../../lib/slideUrls';

const { Text } = Typography;
const { useBreakpoint } = Grid;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function SlideViewerPage() {
  const { presentationId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const [presentation, setPresentation] = useState(null);
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentSlide, setCurrentSlide] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [imageLoading, setImageLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const viewerRef = useRef(null);
  const mainRef = useRef(null);
  const thumbRefs = useRef(new Map());
  const touchStart = useRef(null);

  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch { return null; }
  }, []);
  const isAdmin = user?.role === 'ADMIN';
  const backPath = isAdmin ? '/admin/slides' : '/student/slides';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.get(`/api/slides/presentations/${presentationId}`)
      .then(res => {
        if (cancelled) return;
        const data = res.data?.presentation;
        setPresentation(data);
        const list = data?.slides || [];
        setSlides(list);
        const requested = parseInt(searchParams.get('slide'), 10);
        setCurrentSlide(list.length ? clamp(Number.isFinite(requested) ? requested : 1, 1, list.length) : 1);
        if (data?.title) document.title = `${data.title} — Milven Slides`;
      })
      .catch(err => {
        if (cancelled) return;
        setError(err?.response?.data?.error || 'Could not open this presentation.');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [presentationId]);

  useEffect(() => {
    const requested = parseInt(searchParams.get('slide'), 10);
    if (!slides.length || !Number.isFinite(requested)) return;
    const next = clamp(requested, 1, slides.length);
    setCurrentSlide(prev => (prev === next ? prev : next));
    setImageLoading(true);
  }, [searchParams, slides.length]);

  const goToSlide = useCallback((number) => {
    if (!slides.length) return;
    const next = clamp(Number(number) || 1, 1, slides.length);
    setCurrentSlide(next);
    setImageLoading(true);
    setMobileNavOpen(false);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('slide', String(next));
    setSearchParams(nextParams, { replace: true });
  }, [slides.length, searchParams, setSearchParams]);

  const nextSlide = useCallback(() => goToSlide(currentSlide + 1), [currentSlide, goToSlide]);
  const previousSlide = useCallback(() => goToSlide(currentSlide - 1), [currentSlide, goToSlide]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = String(event.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); nextSlide(); }
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); previousSlide(); }
      else if (event.key === 'Home') { event.preventDefault(); goToSlide(1); }
      else if (event.key === 'End') { event.preventDefault(); goToSlide(slides.length); }
      else if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom(z => clamp(Number((z + 0.15).toFixed(2)), 0.5, 3)); }
      else if (event.key === '-') { event.preventDefault(); setZoom(z => clamp(Number((z - 0.15).toFixed(2)), 0.5, 3)); }
      else if (event.key === '0') { event.preventDefault(); setZoom(1); }
      else if (event.key.toLowerCase() === 'f') { event.preventDefault(); toggleFullscreen(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nextSlide, previousSlide, goToSlide, slides.length]);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    const active = thumbRefs.current.get(currentSlide);
    if (active && typeof active.scrollIntoView === 'function' && !isMobile) {
      active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const slide = slides[currentSlide - 1];
    if (!slide?.previewUrl) return;
    [currentSlide - 1, currentSlide + 1].forEach((index) => {
      const neighbor = slides[index];
      if (neighbor?.previewUrl) {
        const image = new Image();
        image.src = assetUrl(neighbor.previewUrl);
      }
    });
  }, [currentSlide, slides, isMobile]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!presentationId) return;
    if (searchTerm.length < 2) {
      setSearchResults([]);
      setSearchError('');
      return;
    }
    setSearching(true);
    setSearchError('');
    api.get(`/api/slides/presentations/${presentationId}/search`, { params: { q: searchTerm } })
      .then(res => setSearchResults(res.data?.results || []))
      .catch(err => {
        setSearchResults([]);
        setSearchError(err?.response?.data?.error || 'Search is temporarily unavailable.');
      })
      .finally(() => setSearching(false));
  }, [presentationId, searchTerm]);

  const toggleFullscreen = () => {
    const element = viewerRef.current;
    if (!element) return;
    if (!document.fullscreenElement) {
      element.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const handleTouchStart = (event) => {
    if (event.touches.length !== 1) {
      touchStart.current = null;
      return;
    }
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };

  const handleTouchEnd = (event) => {
    if (!touchStart.current || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - touchStart.current.x;
    const dy = event.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) nextSlide();
    else previousSlide();
  };

  const downloadCurrentSlide = async () => {
    const slide = slides[currentSlide - 1];
    if (!slide?.previewUrl) return;
    try {
      const response = await fetch(assetUrl(slide.previewUrl));
      if (!response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${presentation?.title || 'slide'}-${currentSlide}.jpg`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {}
  };

  const downloadOriginal = async () => {
    try {
      const response = await api.get(`/api/slides/admin/presentations/${presentationId}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = presentation?.originalFilename || 'presentation.pptx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {}
  };

  const activeSlide = slides[currentSlide - 1];
  const thumbnails = searchTerm.length >= 2 ? searchResults : slides;

  const navigatorPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#111827' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #1f2937' }}>
        <Input
          allowClear
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          placeholder="Search in this presentation"
          style={{ background: '#0b1220', borderColor: '#334155', color: '#e2e8f0' }}
        />
        {searchTerm.length >= 2 && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#94a3b8', fontSize: 11 }}>
              {searching ? 'Searching…' : `${searchResults.length} result${searchResults.length === 1 ? '' : 's'}`}
            </Text>
            <Button type="link" size="small" style={{ padding: 0, fontSize: 11 }} onClick={() => { setSearchInput(''); setSearchTerm(''); }}>
              Clear
            </Button>
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
              key={result.slideNumber}
              type="button"
              onClick={() => goToSlide(result.slideNumber)}
              style={{
                width: '100%', textAlign: 'left', border: '1px solid #1f2937', borderRadius: 8,
                background: currentSlide === result.slideNumber ? '#1d4ed8' : '#0b1220',
                color: '#e2e8f0', padding: 8, marginBottom: 6, cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: 11, color: currentSlide === result.slideNumber ? '#dbeafe' : '#93c5fd', marginBottom: 2 }}>
                Slide {result.slideNumber}
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.35, color: '#cbd5e1', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {highlightParts(result.excerpt, searchTerm).map((part, index) => (
                  part.match ? <mark key={index} style={{ background: '#fbbf24', color: '#111827' }}>{part.text}</mark> : <React.Fragment key={index}>{part.text}</React.Fragment>
                ))}
              </div>
            </button>
          ))
        ) : slides.map(slide => (
          <button
            key={slide.slideNumber}
            type="button"
            ref={(node) => { if (node) thumbRefs.current.set(slide.slideNumber, node); else thumbRefs.current.delete(slide.slideNumber); }}
            onClick={() => goToSlide(slide.slideNumber)}
            style={{
              width: '100%', border: currentSlide === slide.slideNumber ? '2px solid #3b82f6' : '2px solid transparent',
              borderRadius: 8, background: '#0b1220', padding: 4, marginBottom: 6, cursor: 'pointer',
              opacity: currentSlide === slide.slideNumber ? 1 : 0.82
            }}
            aria-label={`Slide ${slide.slideNumber}`}
          >
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#020617', borderRadius: 4, overflow: 'hidden' }}>
              {slide.thumbnailUrl && (
                <img src={assetUrl(slide.thumbnailUrl)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              )}
              <span style={{ position: 'absolute', left: 4, bottom: 3, fontSize: 10, color: '#e2e8f0', background: 'rgba(2,6,23,0.75)', padding: '0 4px', borderRadius: 3 }}>
                {slide.slideNumber}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0b1220', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Skeleton active paragraph={{ rows: 4 }} title={{ width: 320 }} style={{ maxWidth: 500 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0b1220', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 560, width: '100%' }}>
          <Alert
            type="error"
            showIcon
            message="Presentation unavailable"
            description={error}
            action={<Button onClick={() => navigate(backPath)}>Back to Slides</Button>}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={viewerRef}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: '#0b1220', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ minHeight: 56, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#111827', borderBottom: '1px solid #1f2937', flexWrap: 'wrap' }}>
        <Tooltip title="Back to slides library">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(backPath)} style={{ color: '#e2e8f0' }} aria-label="Back to slides library" />
        </Tooltip>
        {isMobile && (
          <Button type="text" icon={<MenuOutlined />} onClick={() => setMobileNavOpen(true)} style={{ color: '#e2e8f0' }} aria-label="Open slide navigator" />
        )}
        <div style={{ flex: 1, minWidth: 140 }}>
          <Text style={{ color: '#f8fafc', fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {presentation?.title}
          </Text>
          <Text style={{ color: '#94a3b8', fontSize: 11 }}>
            {levelLabel(presentation?.course?.level)} · {presentation?.volume?.name}{presentation?.module?.name ? ` · ${presentation.module.name}` : ''}
            {isAdmin && <Tag color="gold" style={{ marginLeft: 8 }}>Admin preview</Tag>}
            {presentation?.status === 'DRAFT' && <Tag color="default" style={{ marginLeft: 4 }}>Draft</Tag>}
          </Text>
        </div>
        <Text style={{ color: '#94a3b8', fontSize: 12 }}>{currentSlide} / {slides.length}</Text>
        <Tooltip title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}>
          <Button type="text" icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={toggleFullscreen} style={{ color: '#e2e8f0' }} aria-label="Toggle fullscreen" />
        </Tooltip>
        {isAdmin && (
          <Tooltip title="Download original PowerPoint">
            <Button type="text" icon={<DownloadOutlined />} onClick={downloadOriginal} style={{ color: '#e2e8f0' }} aria-label="Download original PowerPoint" />
          </Tooltip>
        )}
        <Tooltip title="Download current slide">
          <Button type="text" icon={<DownloadOutlined />} onClick={downloadCurrentSlide} style={{ color: '#e2e8f0' }} aria-label="Download current slide" />
        </Tooltip>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {!isMobile && !sidebarCollapsed && (
          <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #1f2937', background: '#111827' }}>
            {navigatorPanel}
          </div>
        )}
        {!isMobile && (
          <div style={{ width: 24, flexShrink: 0, background: '#111827', borderRight: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Tooltip title={sidebarCollapsed ? 'Show slide navigator' : 'Hide slide navigator'} placement="right">
              <Button
                type="text"
                size="small"
                onClick={() => setSidebarCollapsed(value => !value)}
                icon={sidebarCollapsed ? <RightOutlined /> : <LeftOutlined />}
                style={{ color: '#94a3b8' }}
                aria-label="Toggle slide navigator"
              />
            </Tooltip>
          </div>
        )}

        <div
          ref={mainRef}
          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: 12, position: 'relative' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {!activeSlide?.previewUrl ? (
            <Empty description={<span style={{ color: '#94a3b8' }}>This slide has no rendered preview.</span>} />
          ) : (
            <>
              {imageLoading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <Spin size="large" />
                </div>
              )}
              <img
                key={activeSlide.previewUrl}
                src={assetUrl(activeSlide.previewUrl)}
                alt={`${presentation?.title} — slide ${currentSlide}`}
                onLoad={() => setImageLoading(false)}
                onError={() => setImageLoading(false)}
                style={{
                  maxWidth: zoom <= 1 ? '100%' : 'none',
                  maxHeight: zoom <= 1 ? '100%' : 'none',
                  width: zoom > 1 ? `${Math.round(100 * zoom)}%` : undefined,
                  height: 'auto',
                  display: 'block',
                  imageRendering: 'auto',
                  objectFit: 'contain',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
                  background: '#020617',
                  borderRadius: 4,
                  transition: 'width 0.15s ease'
                }}
              />
            </>
          )}

          {isMobile && (
            <>
              <Button
                shape="circle"
                icon={<LeftOutlined />}
                onClick={previousSlide}
                disabled={currentSlide <= 1}
                style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.85 }}
                aria-label="Previous slide"
              />
              <Button
                shape="circle"
                icon={<RightOutlined />}
                onClick={nextSlide}
                disabled={currentSlide >= slides.length}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.85 }}
                aria-label="Next slide"
              />
            </>
          )}
        </div>
      </div>

      <div style={{ minHeight: 56, padding: '8px 12px', background: '#111827', borderTop: '1px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Tooltip title="Previous slide (←)"><Button type="text" icon={<LeftOutlined />} onClick={previousSlide} disabled={currentSlide <= 1} style={{ color: '#e2e8f0' }} /></Tooltip>
        <Tooltip title="Next slide (→)"><Button type="text" icon={<RightOutlined />} onClick={nextSlide} disabled={currentSlide >= slides.length} style={{ color: '#e2e8f0' }} /></Tooltip>
        <Input
          type="number"
          min={1}
          max={slides.length}
          value={currentSlide}
          onChange={(event) => {
            const value = parseInt(event.target.value, 10);
            if (Number.isFinite(value) && value >= 1 && value <= slides.length) goToSlide(value);
          }}
          style={{ width: 64, textAlign: 'center', background: '#0b1220', borderColor: '#334155', color: '#e2e8f0' }}
          aria-label="Jump to slide number"
        />
        <Text style={{ color: '#94a3b8', fontSize: 12 }}>/ {slides.length}</Text>
        <Tooltip title="Zoom out (-)"><Button type="text" icon={<ZoomOutOutlined />} onClick={() => setZoom(z => clamp(Number((z - 0.15).toFixed(2)), 0.5, 3))} style={{ color: '#e2e8f0' }} /></Tooltip>
        <Text style={{ color: '#94a3b8', fontSize: 12, minWidth: 42, textAlign: 'center' }}>{Math.round(zoom * 100)}%</Text>
        <Tooltip title="Zoom in (+)"><Button type="text" icon={<ZoomInOutlined />} onClick={() => setZoom(z => clamp(Number((z + 0.15).toFixed(2)), 0.5, 3))} style={{ color: '#e2e8f0' }} /></Tooltip>
        <Tooltip title="Fit to screen (0)"><Button type="text" onClick={() => setZoom(1)} style={{ color: '#e2e8f0' }}>Fit</Button></Tooltip>
        <Tooltip title="Fullscreen (F)"><Button type="text" icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={toggleFullscreen} style={{ color: '#e2e8f0' }} /></Tooltip>
        {isMobile && (
          <Button type="text" icon={<MenuOutlined />} onClick={() => setMobileNavOpen(true)} style={{ color: '#e2e8f0' }}>Slides</Button>
        )}
      </div>

      {isMobile && (
        <Drawer
          placement="left"
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          width={Math.min(320, typeof window !== 'undefined' ? window.innerWidth * 0.86 : 320)}
          styles={{ body: { padding: 0, background: '#111827' }, header: { display: 'none' } }}
        >
          <div style={{ height: '100%' }}>{navigatorPanel}</div>
        </Drawer>
      )}
    </div>
  );
}
