import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Button, Card, Col, Empty, Input, Pagination, Row, Select, Skeleton, Space, Tag,
  Typography, Grid, Drawer
} from 'antd';
import {
  ArrowLeftOutlined, ArrowRightOutlined, BookOutlined, CloseOutlined, DownOutlined,
  FilePptOutlined, FileTextOutlined, FolderOutlined, FunctionOutlined, MenuOutlined,
  RightOutlined, SearchOutlined, SnippetsOutlined
} from '@ant-design/icons';
import { api } from '../../lib/api';
import { assetUrl, highlightParts, levelLabel, presentationViewerPath } from '../../lib/slideUrls';

const { Text, Title, Paragraph } = Typography;
const { useBreakpoint } = Grid;

export default function StudentSlides() {
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [searchParams] = useSearchParams();
  const initial = useRef({
    courseId: searchParams.get('courseId') || '',
    volumeId: searchParams.get('volumeId') || '',
    moduleId: searchParams.get('moduleId') || '',
    scope: searchParams.get('scope') || '',
    q: searchParams.get('q') || ''
  });

  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState(undefined);
  const [volumes, setVolumes] = useState([]);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [selectedVolumeId, setSelectedVolumeId] = useState(undefined);
  const [selectedModuleId, setSelectedModuleId] = useState(undefined);
  const [wholeVolumeOnly, setWholeVolumeOnly] = useState(false);
  const [expandedVolumes, setExpandedVolumes] = useState(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [presentations, setPresentations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchInput, setSearchInput] = useState(initial.current.q);
  const [searchTerm, setSearchTerm] = useState(initial.current.q);
  const [searchResults, setSearchResults] = useState([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    api.get('/api/slides/library/courses')
      .then(res => {
        const list = res.data?.courses || [];
        setCourses(list);
        const requested = initial.current.courseId;
        const chosen = list.find(c => c.id === requested)?.id || list[0]?.id;
        setCourseId(chosen);
      })
      .catch(() => setError('Could not load your enrolled courses.'));
  }, []);

  useEffect(() => {
    if (!courseId) return;
    setHierarchyLoading(true);
    setPresentations([]);
    api.get('/api/slides/library/hierarchy', { params: { courseId } })
      .then(res => {
        const list = res.data?.volumes || [];
        setVolumes(list);
        const requestedVolume = initial.current.volumeId;
        const requestedModule = initial.current.moduleId;
        const volume = list.find(v => v.id === requestedVolume);
        if (volume) {
          setSelectedVolumeId(volume.id);
          setExpandedVolumes(new Set([volume.id]));
          if (requestedModule && volume.modules.some(m => m.id === requestedModule)) {
            setSelectedModuleId(requestedModule);
          } else if (initial.current.scope === 'WHOLE_VOLUME') {
            setWholeVolumeOnly(true);
          }
        } else {
          setSelectedVolumeId(undefined);
          setSelectedModuleId(undefined);
          setWholeVolumeOnly(false);
        }
        initial.current.volumeId = '';
        initial.current.moduleId = '';
        initial.current.scope = '';
      })
      .catch(() => {
        setVolumes([]);
        setError('Could not load the slides hierarchy for this course.');
      })
      .finally(() => setHierarchyLoading(false));
  }, [courseId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!courseId) return;
    const term = searchTerm.trim();
    if (term.length >= 2) {
      setSearching(true);
      setSearchError('');
      const params = { q: term, page, limit: pageSize, courseId };
      if (selectedVolumeId) params.volumeId = selectedVolumeId;
      if (selectedModuleId) params.moduleId = selectedModuleId;
      api.get('/api/slides/search', { params })
        .then(res => {
          setSearchResults(res.data?.results || []);
          setSearchTotal(res.data?.total || 0);
        })
        .catch(err => {
          setSearchResults([]);
          setSearchTotal(0);
          setSearchError(err?.response?.data?.error || 'Search is temporarily unavailable.');
        })
        .finally(() => setSearching(false));
      return;
    }

    setLoading(true);
    setError('');
    const params = { courseId, page, limit: pageSize };
    if (selectedVolumeId) params.volumeId = selectedVolumeId;
    if (selectedModuleId) params.moduleId = selectedModuleId;
    if (wholeVolumeOnly) params.scope = 'WHOLE_VOLUME';
    api.get('/api/slides/library/presentations', { params })
      .then(res => {
        setPresentations(res.data?.presentations || []);
        setTotal(res.data?.total || 0);
      })
      .catch(err => {
        setPresentations([]);
        setTotal(0);
        setError(err?.response?.data?.error || 'Could not load presentations.');
      })
      .finally(() => setLoading(false));
  }, [courseId, selectedVolumeId, selectedModuleId, wholeVolumeOnly, page, pageSize, searchTerm]);

  const course = courses.find(c => c.id === courseId);
  const selectedVolume = volumes.find(v => v.id === selectedVolumeId);
  const selectedModule = selectedVolume?.modules?.find(m => m.id === selectedModuleId);

  const flatModules = useMemo(() => {
    const rows = [];
    volumes
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
      .forEach(volume => {
        volume.modules.forEach(module => {
          if ((module.presentationCount || 0) > 0) {
            rows.push({ ...module, volumeId: volume.id, volumeName: volume.name });
          }
        });
      });
    return rows;
  }, [volumes]);

  const moduleIndex = selectedModuleId ? flatModules.findIndex(m => m.id === selectedModuleId) : -1;
  const previousModule = moduleIndex > 0 ? flatModules[moduleIndex - 1] : null;
  const nextModule = moduleIndex >= 0 && moduleIndex < flatModules.length - 1 ? flatModules[moduleIndex + 1] : null;

  const selectAll = () => {
    setSelectedVolumeId(undefined);
    setSelectedModuleId(undefined);
    setWholeVolumeOnly(false);
    setPage(1);
    if (isMobile) setSidebarOpen(false);
  };

  const selectVolume = (volume, whole = false) => {
    setSelectedVolumeId(volume.id);
    setSelectedModuleId(undefined);
    setWholeVolumeOnly(whole);
    setPage(1);
    if (isMobile) setSidebarOpen(false);
  };

  const selectModule = (module, volume) => {
    setSelectedVolumeId(volume.id);
    setSelectedModuleId(module.id);
    setWholeVolumeOnly(false);
    setPage(1);
    if (isMobile) setSidebarOpen(false);
  };

  const goToModule = (module) => {
    const volume = volumes.find(v => v.id === module.volumeId);
    if (volume) selectModule(module, volume);
    setExpandedVolumes(prev => new Set([...prev, module.volumeId]));
  };

  const openPresentation = (presentation, slideNumber) => {
    navigate(presentationViewerPath(presentation.id, slideNumber));
  };

  const activeLabel = wholeVolumeOnly
    ? `${selectedVolume?.name || 'Volume'} — Whole Volume Review`
    : selectedModule
      ? selectedModule.name
      : selectedVolume
        ? `${selectedVolume.name} — all presentations`
        : 'All presentations';

  const searchMode = searchTerm.trim().length >= 2;

  const moduleResourceLinks = selectedModule ? (
    <Space wrap size={[8, 8]} style={{ marginBottom: 14 }}>
      <Button size="small" icon={<SnippetsOutlined />} onClick={() => navigate(`/student/module-notes?moduleId=${selectedModule.id}&volumeId=${selectedVolumeId}`)}>Module Notes</Button>
      <Button size="small" icon={<FileTextOutlined />} onClick={() => navigate(`/student/summary-sheets?moduleId=${selectedModule.id}&volumeId=${selectedVolumeId}`)}>Summary Sheets</Button>
      <Button size="small" icon={<FunctionOutlined />} onClick={() => navigate('/student/formula-book')}>Formula Book</Button>
      <Button size="small" icon={<BookOutlined />} onClick={() => navigate('/student/exams')}>Practice Questions</Button>
    </Space>
  ) : null;

  const tree = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #e2e8f0', background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <FilePptOutlined style={{ color: '#fff', fontSize: 18 }} />
        <span style={{ color: '#fff', fontWeight: 700, flex: 1 }}>Milven Slides</span>
        {isMobile && <Button type="text" size="small" icon={<CloseOutlined style={{ color: '#fff' }} />} onClick={() => setSidebarOpen(false)} />}
      </div>
      <div style={{ padding: 10, borderBottom: '1px solid #f1f5f9' }}>
        <Select
          value={courseId}
          onChange={(value) => {
            setCourseId(value);
            setSelectedVolumeId(undefined);
            setSelectedModuleId(undefined);
            setWholeVolumeOnly(false);
            setPage(1);
          }}
          style={{ width: '100%' }}
          showSearch
          optionFilterProp="label"
          options={courses.map(c => ({ value: c.id, label: `${c.name} (${levelLabel(c.level)})` }))}
        />
      </div>
      <div
        onClick={selectAll}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', cursor: 'pointer',
          background: !selectedVolumeId ? '#eff6ff' : 'transparent',
          borderLeft: !selectedVolumeId ? '3px solid #2563eb' : '3px solid transparent'
        }}
      >
        <AppstoreIcon />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>All presentations</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 12 }}>
        {hierarchyLoading ? (
          <div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 6 }} /></div>
        ) : volumes.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
            <FolderOutlined style={{ fontSize: 28 }} />
            <div style={{ fontSize: 13, marginTop: 8 }}>No curriculum volumes with slides yet.</div>
          </div>
        ) : volumes.map(volume => {
          const expanded = expandedVolumes.has(volume.id);
          const active = selectedVolumeId === volume.id && !selectedModuleId && !wholeVolumeOnly;
          return (
            <div key={volume.id}>
              <div
                onClick={() => setExpandedVolumes(prev => {
                  const next = new Set(prev);
                  if (next.has(volume.id)) next.delete(volume.id);
                  else next.add(volume.id);
                  return next;
                })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', cursor: 'pointer',
                  background: active ? '#eff6ff' : 'transparent',
                  borderLeft: active ? '3px solid #2563eb' : '3px solid transparent'
                }}
              >
                {expanded ? <DownOutlined style={{ fontSize: 10, color: '#2563eb' }} /> : <RightOutlined style={{ fontSize: 10, color: '#94a3b8' }} />}
                <BookOutlined style={{ fontSize: 13, color: '#2563eb' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{volume.name}</span>
                <Tag style={{ margin: 0, fontSize: 10 }}>{volume.presentationCount || 0}</Tag>
                <Button
                  type="text"
                  size="small"
                  style={{ fontSize: 10, padding: '0 4px', height: 20, color: '#2563eb' }}
                  onClick={(event) => { event.stopPropagation(); selectVolume(volume, false); }}
                >
                  Filter
                </Button>
              </div>
              {expanded && (
                <div style={{ marginLeft: 12, borderLeft: '1px solid #e2e8f0' }}>
                  {volume.modules.map(module => {
                    const isActive = selectedModuleId === module.id;
                    return (
                      <div
                        key={module.id}
                        onClick={() => selectModule(module, volume)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px 7px 16px', cursor: 'pointer',
                          background: isActive ? '#f0fdf4' : 'transparent',
                          borderLeft: isActive ? '3px solid #16a34a' : '3px solid transparent'
                        }}
                      >
                        <FilePptOutlined style={{ fontSize: 12, color: module.presentationCount ? '#16a34a' : '#cbd5e1' }} />
                        <span style={{ fontSize: 12, color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{module.name}</span>
                        <span style={{ fontSize: 10, color: module.presentationCount ? '#16a34a' : '#cbd5e1' }}>{module.presentationCount || 0}</span>
                      </div>
                    );
                  })}
                  {volume.wholeVolumeCount > 0 && (
                    <div
                      onClick={() => selectVolume(volume, true)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px 7px 16px', cursor: 'pointer',
                        background: wholeVolumeOnly && selectedVolumeId === volume.id ? '#fffbeb' : 'transparent',
                        borderLeft: wholeVolumeOnly && selectedVolumeId === volume.id ? '3px solid #d97706' : '3px solid transparent'
                      }}
                    >
                      <FileTextOutlined style={{ fontSize: 12, color: '#d97706' }} />
                      <span style={{ fontSize: 12, color: '#92400e', flex: 1 }}>Whole Volume Review</span>
                      <span style={{ fontSize: 10, color: '#d97706' }}>{volume.wholeVolumeCount}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', overflow: 'hidden', border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc' }}>
      {!isMobile && (
        <div style={{ width: 300, minWidth: 280, borderRight: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {tree}
        </div>
      )}
      {isMobile && (
        <Drawer placement="left" open={sidebarOpen} onClose={() => setSidebarOpen(false)} width={Math.min(340, typeof window !== 'undefined' ? window.innerWidth * 0.9 : 340)} styles={{ body: { padding: 0 } }} title={null}>
          {tree}
        </Drawer>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {isMobile && <Button icon={<MenuOutlined />} onClick={() => setSidebarOpen(true)}>Curriculum</Button>}
            <div style={{ flex: 1, minWidth: 160 }}>
              <Title level={4} style={{ margin: 0 }}>Slides</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>{activeLabel}</Text>
            </div>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              placeholder="Search slide content, e.g. convexity"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              style={{ maxWidth: 360, width: isMobile ? '100%' : 360 }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 12 : 18 }}>
          {selectedModule && !searchMode && moduleResourceLinks}

          {selectedModule && !searchMode && (
            <Space style={{ marginBottom: 14 }} wrap>
              <Button icon={<ArrowLeftOutlined />} disabled={!previousModule} onClick={() => previousModule && goToModule(previousModule)}>
                {previousModule ? previousModule.name.split(':')[0] : 'Previous module'}
              </Button>
              <Button icon={<ArrowRightOutlined />} iconPosition="end" disabled={!nextModule} onClick={() => nextModule && goToModule(nextModule)}>
                {nextModule ? nextModule.name.split(':')[0] : 'Next module'}
              </Button>
            </Space>
          )}

          {searchMode ? (
            <SearchPanel
              q={searchTerm}
              loading={searching}
              error={searchError}
              results={searchResults}
              total={searchTotal}
              page={page}
              pageSize={pageSize}
              onPageChange={(nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize || pageSize); }}
              onOpen={openPresentation}
            />
          ) : loading ? (
            <Row gutter={[14, 14]}>
              {[1, 2, 3, 4].map(i => (
                <Col xs={24} sm={12} lg={8} key={i}><Card><Skeleton active avatar paragraph={{ rows: 3 }} /></Card></Col>
              ))}
            </Row>
          ) : error ? (
            <Alert type="error" showIcon message={error} />
          ) : presentations.length === 0 ? (
            <Card>
              <Empty description="No published presentations are available in this section yet." />
            </Card>
          ) : (
            <>
              <Row gutter={[14, 14]}>
                {presentations.map(presentation => (
                  <Col xs={24} sm={12} lg={8} xl={6} key={presentation.id}>
                    <PresentationCard presentation={presentation} onOpen={() => openPresentation(presentation)} />
                  </Col>
                ))}
              </Row>
              {total > pageSize && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <Pagination current={page} pageSize={pageSize} total={total} showSizeChanger pageSizeOptions={[12, 24, 48]} onChange={(nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize || pageSize); }} showTotal={count => `${count} presentations`} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AppstoreIcon() {
  return <FilePptOutlined style={{ fontSize: 13, color: '#2563eb' }} />;
}

function PresentationCard({ presentation, onOpen }) {
  return (
    <Card
      hoverable
      size="small"
      onClick={onOpen}
      styles={{ body: { padding: 12 } }}
      cover={(
        <div style={{ height: 145, background: '#0f172a', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FilePptOutlined style={{ color: '#94a3b8', fontSize: 36, position: 'absolute' }} />
          {presentation.thumbnailUrl && (
            <img
              src={assetUrl(presentation.thumbnailUrl)}
              alt=""
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'relative' }}
              onError={(event) => { event.currentTarget.style.display = 'none'; }}
            />
          )}
        </div>
      )}
    >
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Text strong ellipsis={{ tooltip: presentation.title }} style={{ fontSize: 14 }}>{presentation.title}</Text>
        <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: presentation.module?.name || 'Whole Volume Review' }}>
          {presentation.scope === 'WHOLE_VOLUME' ? 'Whole Volume Review' : presentation.module?.name}
        </Text>
        <Space size={[4, 4]} wrap>
          <Tag>{presentation.slideCount} slides</Tag>
          <Tag>{presentation.year}</Tag>
          {presentation.topics?.length > 0 && <Tag color="purple">{presentation.topics.length} topic{presentation.topics.length === 1 ? '' : 's'}</Tag>}
          {presentation.scope === 'WHOLE_VOLUME' && <Tag color="gold">Volume Review</Tag>}
        </Space>
      </Space>
    </Card>
  );
}

function SearchPanel({ q, loading, error, results, total, page, pageSize, onPageChange, onOpen }) {
  if (loading) {
    return <Card><Skeleton active paragraph={{ rows: 8 }} /></Card>;
  }
  if (error) return <Alert type="error" showIcon message={error} />;
  if (!results.length) {
    return <Card><Empty description={`No published slides match “${q}”. Try a different concept or phrase.`} /></Card>;
  }
  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        {total} matching result{total === 1 ? '' : 's'} for “{q}”
      </Text>
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        {results.map((result, index) => {
          const presentation = result.presentation || {};
          return (
            <Card
              key={`${result.presentationId}-${result.slideNumber}-${index}`}
              hoverable
              size="small"
              onClick={() => onOpen(presentation, result.slideNumber)}
              styles={{ body: { padding: 12 } }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 150, height: 84, flexShrink: 0, background: '#0f172a', borderRadius: 6, overflow: 'hidden' }}>
                  {result.thumbnailUrl && (
                    <img
                      src={assetUrl(result.thumbnailUrl)}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onError={(event) => { event.currentTarget.style.display = 'none'; }}
                    />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Space size={6} wrap style={{ marginBottom: 4 }}>
                    <Text strong>{presentation.title}</Text>
                    <Tag color="blue">Slide {result.slideNumber}</Tag>
                    {result.matchType === 'PRESENTATION' && <Tag>Presentation match</Tag>}
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                    {levelLabel(presentation.course?.level)} · {presentation.volume?.name}{presentation.module?.name ? ` · ${presentation.module.name}` : ''}
                  </Text>
                  <Paragraph className="mb-0" style={{ marginBottom: 0, fontSize: 13, color: '#334155' }} ellipsis={{ rows: 2, tooltip: result.excerpt }}>
                    {highlightParts(result.excerpt, q).map((part, i) => (
                      part.match
                        ? <mark key={i} style={{ background: '#fde68a', padding: 0 }}>{part.text}</mark>
                        : <React.Fragment key={i}>{part.text}</React.Fragment>
                    ))}
                  </Paragraph>
                </div>
                <Button type="link">Open Slide</Button>
              </div>
            </Card>
          );
        })}
      </Space>
      {total > pageSize && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Pagination current={page} pageSize={pageSize} total={total} onChange={onPageChange} showTotal={count => `${count} results`} />
        </div>
      )}
    </div>
  );
}
