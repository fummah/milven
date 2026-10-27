import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Button, Card, Col, Dropdown, Empty, Input, Pagination, Row, Select, Skeleton, Space,
  Statistic, Table, Tag, Tooltip, Typography, Modal, message, Grid
} from 'antd';
import {
  AppstoreOutlined, CheckCircleOutlined, CloudUploadOutlined, DeleteOutlined, DownloadOutlined,
  EditOutlined, EyeOutlined, FilePptOutlined, FileZipOutlined, MoreOutlined, ReloadOutlined,
  SearchOutlined, SyncOutlined, TableOutlined, UploadOutlined
} from '@ant-design/icons';
import { api } from '../../lib/api';
import { assetUrl, levelLabel, presentationViewerPath } from '../../lib/slideUrls';
import AdminSlidesUploadDrawer from '../../components/slides/AdminSlidesUploadDrawer';
import AdminSlidesZipWizard from '../../components/slides/AdminSlidesZipWizard';

const { Text, Title, Paragraph } = Typography;
const { useBreakpoint } = Grid;

const PROCESSING_META = {
  PENDING: { color: 'default', label: 'Queued', icon: <SyncOutlined spin /> },
  PROCESSING: { color: 'processing', label: 'Processing', icon: <SyncOutlined spin /> },
  READY: { color: 'success', label: 'Ready', icon: <CheckCircleOutlined /> },
  FAILED: { color: 'error', label: 'Failed', icon: <ReloadOutlined /> }
};

function fileSizeLabel(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AdminSlides() {
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [searchParams] = useSearchParams();

  const [courses, setCourses] = useState([]);
  const [allVolumes, setAllVolumes] = useState([]);
  const [filterModules, setFilterModules] = useState([]);
  const [filterTopics, setFilterTopics] = useState([]);
  const [filterConcepts, setFilterConcepts] = useState([]);

  const [filters, setFilters] = useState({
    q: '', courseId: undefined, volumeId: undefined, moduleId: undefined,
    topicId: undefined, conceptId: undefined, year: undefined, status: undefined, scope: undefined
  });
  const [searchInput, setSearchInput] = useState('');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('milven.slides.view') || 'cards');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState('upload');
  const [editingPresentation, setEditingPresentation] = useState(null);
  const [uploadPreselect, setUploadPreselect] = useState(null);
  const [zipOpen, setZipOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState(null);
  const [replacing, setReplacing] = useState(false);
  const replaceInputRef = useRef(null);
  const lastQueryRef = useRef('');

  const loadBase = useCallback(async () => {
    try {
      const [coursesRes, volumesRes, statsRes] = await Promise.all([
        api.get('/api/cms/courses'),
        api.get('/api/cms/volumes'),
        api.get('/api/slides/admin/stats')
      ]);
      setCourses(coursesRes.data?.courses || []);
      setAllVolumes(volumesRes.data?.volumes || []);
      setStats(statsRes.data || null);
    } catch {
      setError('Could not load courses, volumes or slide statistics.');
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: pageSize };
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') params[key] = value;
      });
      const { data: res } = await api.get('/api/slides/admin/presentations', { params });
      setData(res.presentations || []);
      setTotal(res.total || 0);
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not load the presentations library.');
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => (prev.q === searchInput.trim() ? prev : { ...prev, q: searchInput.trim() }));
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!filters.courseId) {
      setFilterModules([]);
      setFilterTopics([]);
      setFilterConcepts([]);
      return;
    }
    const params = { courseId: filters.courseId };
    if (filters.volumeId) params.volumeId = filters.volumeId;
    api.get('/api/cms/modules', { params })
      .then(res => setFilterModules(res.data?.modules || []))
      .catch(() => setFilterModules([]));
  }, [filters.courseId, filters.volumeId]);

  useEffect(() => {
    if (!filters.moduleId) {
      setFilterTopics([]);
      setFilterConcepts([]);
      return;
    }
    Promise.all([
      api.get('/api/cms/topics', { params: { moduleId: filters.moduleId } }),
      api.get('/api/cms/concepts', { params: { moduleId: filters.moduleId } })
    ]).then(([topicsRes, conceptsRes]) => {
      setFilterTopics(topicsRes.data?.topics || []);
      setFilterConcepts(conceptsRes.data?.concepts || []);
    }).catch(() => {
      setFilterTopics([]);
      setFilterConcepts([]);
    });
  }, [filters.moduleId]);

  useEffect(() => {
    const queryCourse = searchParams.get('courseId') || undefined;
    const queryVolume = searchParams.get('volumeId') || undefined;
    const queryModule = searchParams.get('moduleId') || undefined;
    if (!queryCourse && !queryVolume && !queryModule) return;
    setFilters(prev => ({
      ...prev,
      courseId: prev.courseId || queryCourse,
      volumeId: prev.volumeId || queryVolume,
      moduleId: prev.moduleId || queryModule
    }));
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    const query = searchParams.toString();
    if (query === lastQueryRef.current) return;
    lastQueryRef.current = query;
    if (searchParams.get('upload') !== '1') return;
    setUploadPreselect({
      courseId: searchParams.get('courseId') || undefined,
      volumeId: searchParams.get('volumeId') || undefined,
      moduleId: searchParams.get('moduleId') || undefined,
      year: searchParams.get('year') ? Number(searchParams.get('year')) : 2027,
      scope: searchParams.get('scope') === 'WHOLE_VOLUME' ? 'WHOLE_VOLUME' : 'LEARNING_MODULE'
    });
    setDrawerMode('upload');
    setEditingPresentation(null);
    setDrawerOpen(true);
  }, [searchParams]);

  const volumeOptions = useMemo(() => {
    const list = filters.courseId
      ? allVolumes.filter(v => (v.courseLinks || []).some(l => l.courseId === filters.courseId))
      : allVolumes;
    return list.map(v => ({ value: v.id, label: v.name }));
  }, [allVolumes, filters.courseId]);

  const conceptOptions = useMemo(() => {
    const list = filters.topicId
      ? filterConcepts.filter(c => c.topicId === filters.topicId)
      : filterConcepts;
    return list.map(c => ({ value: c.id, label: c.name }));
  }, [filterConcepts, filters.topicId]);

  const setFilter = (key, value) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'courseId') {
        next.volumeId = undefined; next.moduleId = undefined; next.topicId = undefined; next.conceptId = undefined;
      }
      if (key === 'volumeId') {
        next.moduleId = undefined; next.topicId = undefined; next.conceptId = undefined;
      }
      if (key === 'moduleId') {
        next.topicId = undefined; next.conceptId = undefined;
      }
      if (key === 'topicId') {
        next.conceptId = undefined;
      }
      return next;
    });
    setPage(1);
  };

  const resetFilters = () => {
    setSearchInput('');
    setFilters({
      q: '', courseId: undefined, volumeId: undefined, moduleId: undefined,
      topicId: undefined, conceptId: undefined, year: undefined, status: undefined, scope: undefined
    });
    setPage(1);
  };

  const refreshAll = useCallback(() => {
    loadList();
    api.get('/api/slides/admin/stats').then(res => setStats(res.data)).catch(() => {});
  }, [loadList]);

  const changeView = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem('milven.slides.view', mode); } catch {}
  };

  const openUpload = () => {
    setDrawerMode('upload');
    setEditingPresentation(null);
    setUploadPreselect(null);
    setDrawerOpen(true);
  };

  const openEdit = (presentation) => {
    setDrawerMode('edit');
    setEditingPresentation(presentation);
    setUploadPreselect(null);
    setDrawerOpen(true);
  };

  const openPreview = (presentation) => {
    navigate(presentationViewerPath(presentation.id));
  };

  const togglePublish = async (presentation) => {
    try {
      await api.patch(`/api/slides/admin/presentations/${presentation.id}/publish`, {
        published: presentation.status !== 'PUBLISHED'
      });
      message.success(presentation.status === 'PUBLISHED' ? 'Presentation unpublished.' : 'Presentation published.');
      refreshAll();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Could not change publication status.');
    }
  };

  const deletePresentation = (presentation) => {
    Modal.confirm({
      title: 'Delete this presentation?',
      content: `"${presentation.title}" will be removed from student views and its rendered assets will be deleted. The original file will no longer be available.`,
      okText: 'Delete',
      okType: 'danger',
      async onOk() {
        try {
          await api.delete(`/api/slides/admin/presentations/${presentation.id}`);
          message.success('Presentation deleted.');
          refreshAll();
        } catch (err) {
          message.error(err?.response?.data?.error || 'Could not delete presentation.');
        }
      }
    });
  };

  const retryPresentation = async (presentation) => {
    try {
      await api.post(`/api/slides/admin/presentations/${presentation.id}/retry`);
      message.success('Processing queued again.');
      refreshAll();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Could not retry processing.');
    }
  };

  const downloadOriginal = async (presentation) => {
    try {
      const response = await api.get(`/api/slides/admin/presentations/${presentation.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = presentation.originalFilename || 'presentation.pptx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      message.error('Could not download the original PowerPoint.');
    }
  };

  const triggerReplace = (presentation) => {
    setReplaceTarget(presentation);
    setTimeout(() => replaceInputRef.current?.click(), 0);
  };

  const handleReplaceFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !replaceTarget) return;
    if (!/\.pptx$/i.test(file.name)) {
      message.error('Select a .pptx file.');
      return;
    }
    setReplacing(true);
    const key = 'slide-replace';
    message.open({ key, type: 'loading', content: 'Uploading replacement PowerPoint…', duration: 0 });
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/api/slides/admin/presentations/${replaceTarget.id}/replace`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.open({ key, type: 'success', content: 'Replacement uploaded. Previews and search index are regenerating.', duration: 4 });
      refreshAll();
    } catch (err) {
      message.open({ key, type: 'error', content: err?.response?.data?.error || 'Replacement failed.', duration: 5 });
    } finally {
      setReplacing(false);
      setReplaceTarget(null);
    }
  };

  const menuItems = (presentation) => {
    const items = [
      { key: 'preview', icon: <EyeOutlined />, label: 'Preview' },
      { key: 'edit', icon: <EditOutlined />, label: 'Edit Details' },
      { key: 'replace', icon: <UploadOutlined />, label: 'Replace PowerPoint', disabled: replacing },
      { key: 'publish', icon: <CheckCircleOutlined />, label: presentation.status === 'PUBLISHED' ? 'Unpublish' : 'Publish' },
      { key: 'download', icon: <DownloadOutlined />, label: 'Download Original' },
      ...(presentation.processingStatus === 'FAILED'
        ? [{ key: 'retry', icon: <ReloadOutlined />, label: 'Retry Processing' }]
        : []),
      { type: 'divider' },
      { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true }
    ];
    return items;
  };

  const onMenuClick = (presentation, key) => {
    if (key === 'preview') openPreview(presentation);
    if (key === 'edit') openEdit(presentation);
    if (key === 'replace') triggerReplace(presentation);
    if (key === 'publish') togglePublish(presentation);
    if (key === 'download') downloadOriginal(presentation);
    if (key === 'retry') retryPresentation(presentation);
    if (key === 'delete') deletePresentation(presentation);
  };

  const renderStatus = (presentation) => {
    const meta = PROCESSING_META[presentation.processingStatus] || PROCESSING_META.PENDING;
    return (
      <Space size={4} wrap>
        <Tag color={presentation.status === 'PUBLISHED' ? 'green' : 'default'}>
          {presentation.status === 'PUBLISHED' ? 'Published' : 'Draft'}
        </Tag>
        <Tooltip title={presentation.processingError || meta.label}>
          <Tag color={meta.color} icon={meta.icon}>{meta.label}</Tag>
        </Tooltip>
      </Space>
    );
  };

  const Thumb = ({ presentation, height = 150 }) => (
    <div
      style={{
        height,
        background: 'linear-gradient(135deg, #eef4ff 0%, #e2e8f0 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <FilePptOutlined style={{ fontSize: 42, color: '#94a3b8', position: 'absolute' }} />
      {presentation.thumbnailUrl && (
        <img
          src={assetUrl(presentation.thumbnailUrl)}
          alt=""
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#0f172a', position: 'relative' }}
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}
    </div>
  );

  const cardView = (
    <>
      <Row gutter={[16, 16]}>
        {data.map(presentation => (
          <Col xs={24} sm={12} lg={8} xl={6} key={presentation.id}>
            <Card
              hoverable
              size="small"
              styles={{ body: { padding: 14 } }}
              cover={<Thumb presentation={presentation} />}
            >
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ fontSize: 15, display: 'block' }} ellipsis={{ tooltip: presentation.title }}>
                      {presentation.title}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {levelLabel(presentation.course?.level)} · {presentation.volume?.name}
                    </Text>
                  </div>
                  <Dropdown
                    trigger={['click']}
                    menu={{ items: menuItems(presentation), onClick: ({ key }) => onMenuClick(presentation, key) }}
                  >
                    <Button type="text" size="small" icon={<MoreOutlined />} aria-label="Presentation actions" />
                  </Dropdown>
                </div>

                <Text type="secondary" style={{ fontSize: 12, minHeight: 32 }} ellipsis={{ tooltip: presentation.module?.name || 'Whole Volume Review' }}>
                  {presentation.scope === 'WHOLE_VOLUME' ? 'Whole Volume Review' : (presentation.module?.name || 'No module')}
                </Text>

                <Space size={[6, 6]} wrap>
                  {renderStatus(presentation)}
                  <Tag>{presentation.slideCount || 0} slides</Tag>
                  <Tag>{presentation.year}</Tag>
                  {presentation.topics?.length > 0 && <Tag color="purple">{presentation.topics.length} topic{presentation.topics.length === 1 ? '' : 's'}</Tag>}
                  {presentation.importBatch && <Tag color="blue">ZIP</Tag>}
                </Space>

                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => openPreview(presentation)}>Preview</Button>
                  <Text type="secondary" style={{ fontSize: 11 }}>{fileSizeLabel(presentation.fileSize)}</Text>
                </Space>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
      {total > pageSize && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            pageSizeOptions={[12, 24, 48, 96]}
            onChange={(nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize || pageSize); }}
            showTotal={(count) => `${count} presentations`}
          />
        </div>
      )}
    </>
  );

  const tableColumns = [
    {
      title: 'Presentation',
      dataIndex: 'title',
      width: 320,
      render: (_, presentation) => (
        <Space>
          <div style={{ width: 76, height: 44, overflow: 'hidden', borderRadius: 4, flexShrink: 0 }}>
            <Thumb presentation={presentation} height={44} />
          </div>
          <div style={{ minWidth: 0 }}>
            <Text strong ellipsis={{ tooltip: presentation.title }} style={{ maxWidth: 210, display: 'block' }}>
              {presentation.title}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{presentation.originalFilename}</Text>
          </div>
        </Space>
      )
    },
    {
      title: 'Level',
      width: 110,
      render: (_, p) => <Tag color="blue">{levelLabel(p.course?.level)}</Tag>
    },
    { title: 'Volume', dataIndex: ['volume', 'name'], width: 150, ellipsis: true },
    {
      title: 'Learning Module',
      width: 260,
      ellipsis: true,
      render: (_, p) => p.scope === 'WHOLE_VOLUME' ? <Tag color="cyan">Whole Volume Review</Tag> : (p.module?.name || '—')
    },
    {
      title: 'Slides',
      dataIndex: 'slideCount',
      width: 80,
      render: (value) => <Tag>{value || 0}</Tag>
    },
    {
      title: 'Status',
      width: 190,
      render: (_, p) => renderStatus(p)
    },
    {
      title: 'Actions',
      width: 170,
      fixed: 'right',
      render: (_, p) => (
        <Space size={2}>
          <Tooltip title="Preview"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openPreview(p)} /></Tooltip>
          <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(p)} /></Tooltip>
          <Dropdown
            trigger={['click']}
            menu={{ items: menuItems(p), onClick: ({ key }) => onMenuClick(p, key) }}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} aria-label="More actions" />
          </Dropdown>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Milven Slides</Title>
          <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            Manage curriculum-aligned PowerPoint presentations and searchable learning slides.
          </Paragraph>
        </div>
        <Space wrap>
          <Button icon={<FileZipOutlined />} onClick={() => setZipOpen(true)}>Bulk Upload ZIP</Button>
          <Button type="primary" icon={<CloudUploadOutlined />} onClick={openUpload}>Upload Presentation</Button>
        </Space>
      </div>

      {stats && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {[
            { title: 'Presentations', value: stats.total, color: '#102540' },
            { title: 'Published', value: stats.published, color: '#16a34a' },
            { title: 'Drafts', value: stats.draft, color: '#64748b' },
            { title: 'Processing', value: stats.processing, color: '#2563eb' },
            { title: 'Failed', value: stats.failed, color: stats.failed ? '#dc2626' : '#94a3b8' },
            { title: 'Slides', value: stats.slides, color: '#7c3aed' }
          ].map(item => (
            <Col xs={12} sm={8} md={4} key={item.title}>
              <Card size="small" styles={{ body: { padding: '10px 12px' } }}>
                <Statistic title={<span style={{ fontSize: 12 }}>{item.title}</span>} value={item.value} valueStyle={{ color: item.color, fontSize: 20 }} />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {stats?.renderer && !stats.renderer.available && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Slide rendering is not available on this server"
          description="Install LibreOffice and Poppler, or configure LIBREOFFICE_PATH and PDFTOPPM_PATH. Uploads can still be stored, but previews will not render until the renderer is available."
        />
      )}

      <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: 12 } }}>
        <Row gutter={[10, 10]} align="middle">
          <Col xs={24} lg={7}>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              placeholder="Search presentations, topics, concepts or slide content..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </Col>
          <Col xs={12} sm={8} lg={2}>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder="Level"
              value={filters.courseId}
              onChange={(value) => setFilter('courseId', value)}
              options={courses.map(c => ({ value: c.id, label: `${c.name} (${levelLabel(c.level)})` }))}
              showSearch
              optionFilterProp="label"
            />
          </Col>
          <Col xs={12} sm={8} lg={3}>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder="Volume"
              value={filters.volumeId}
              onChange={(value) => setFilter('volumeId', value)}
              options={volumeOptions}
              disabled={!filters.courseId}
              showSearch
              optionFilterProp="label"
            />
          </Col>
          <Col xs={12} sm={8} lg={3}>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder="Learning Module"
              value={filters.moduleId}
              onChange={(value) => setFilter('moduleId', value)}
              options={filterModules.map(m => ({ value: m.id, label: m.name }))}
              disabled={!filters.courseId}
              showSearch
              optionFilterProp="label"
            />
          </Col>
          <Col xs={12} sm={8} lg={2}>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder="Topic"
              value={filters.topicId}
              onChange={(value) => setFilter('topicId', value)}
              options={filterTopics.map(t => ({ value: t.id, label: t.name }))}
              disabled={!filters.moduleId}
              showSearch
              optionFilterProp="label"
            />
          </Col>
          <Col xs={12} sm={8} lg={2}>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder="Concept"
              value={filters.conceptId}
              onChange={(value) => setFilter('conceptId', value)}
              options={conceptOptions}
              disabled={!filters.moduleId}
              showSearch
              optionFilterProp="label"
            />
          </Col>
          <Col xs={12} sm={8} lg={2}>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder="Year"
              value={filters.year}
              onChange={(value) => setFilter('year', value)}
              options={[...new Set([2025, 2026, 2027, 2028])].map(y => ({ value: y, label: String(y) }))}
            />
          </Col>
          <Col xs={12} sm={8} lg={2}>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder="Status"
              value={filters.status}
              onChange={(value) => setFilter('status', value)}
              options={[{ value: 'PUBLISHED', label: 'Published' }, { value: 'DRAFT', label: 'Draft' }]}
            />
          </Col>
          <Col xs={12} sm={8} lg={2}>
            <Select
              allowClear
              style={{ width: '100%' }}
              placeholder="Scope"
              value={filters.scope}
              onChange={(value) => setFilter('scope', value)}
              options={[{ value: 'LEARNING_MODULE', label: 'Module' }, { value: 'WHOLE_VOLUME', label: 'Volume Review' }]}
            />
          </Col>
          <Col xs={24} lg={1} style={{ textAlign: 'right' }}>
            <Tooltip title="Reset filters"><Button icon={<ReloadOutlined />} onClick={resetFilters} /></Tooltip>
          </Col>
        </Row>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Text type="secondary">{total} presentation{total === 1 ? '' : 's'}</Text>
        <Space>
          <Button size="small" type={viewMode === 'cards' ? 'primary' : 'default'} icon={<AppstoreOutlined />} onClick={() => changeView('cards')}>Cards</Button>
          <Button size="small" type={viewMode === 'table' ? 'primary' : 'default'} icon={<TableOutlined />} onClick={() => changeView('table')}>Table</Button>
        </Space>
      </div>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} action={<Button size="small" onClick={refreshAll}>Retry</Button>} />}

      {loading ? (
        viewMode === 'cards' ? (
          <Row gutter={[16, 16]}>
            {[1, 2, 3, 4].map(i => (
              <Col xs={24} sm={12} lg={8} xl={6} key={i}><Card><Skeleton active avatar paragraph={{ rows: 3 }} /></Card></Col>
            ))}
          </Row>
        ) : <Card><Skeleton active paragraph={{ rows: 8 }} /></Card>
      ) : data.length === 0 ? (
        <Card>
          <Empty
            description={filters.q || filters.courseId || filters.status
              ? 'No presentations match these filters.'
              : 'No presentations have been uploaded yet.'}
          >
            <Space>
              {(filters.q || filters.courseId || filters.status) && <Button onClick={resetFilters}>Reset Filters</Button>}
              <Button type="primary" icon={<CloudUploadOutlined />} onClick={openUpload}>Upload Presentation</Button>
            </Space>
          </Empty>
        </Card>
      ) : viewMode === 'cards' ? cardView : (
        <Card styles={{ body: { padding: 0 } }}>
          <Table
            rowKey="id"
            dataSource={data}
            columns={tableColumns}
            scroll={{ x: 1200 }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: [12, 24, 48, 96],
              onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize || pageSize); },
              showTotal: (count) => `${count} presentations`,
              style: { padding: '0 16px' }
            }}
          />
        </Card>
      )}

      <AdminSlidesUploadDrawer
        open={drawerOpen}
        mode={drawerMode}
        presentation={editingPresentation}
        preselect={uploadPreselect}
        courses={courses}
        allVolumes={allVolumes}
        onClose={() => { setDrawerOpen(false); setEditingPresentation(null); }}
        onSaved={refreshAll}
      />

      <AdminSlidesZipWizard
        open={zipOpen}
        courses={courses}
        allVolumes={allVolumes}
        onClose={() => setZipOpen(false)}
        onImported={refreshAll}
      />

      <input
        ref={replaceInputRef}
        type="file"
        accept=".pptx"
        style={{ display: 'none' }}
        onChange={handleReplaceFile}
      />
    </div>
  );
}

export default AdminSlides;
