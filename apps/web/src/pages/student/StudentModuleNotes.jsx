import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Typography, Input, Tag, Space, Spin, Empty, Button, Card, Modal, Grid, Table, Row, Col } from 'antd';
import { BookOutlined, SearchOutlined, MenuOutlined, AppstoreOutlined, OrderedListOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { ModuleNotePreviewCard } from '../../components/ModuleNotePreviewCard';
import ModuleNoteResourceCard from '../../components/resources/ModuleNoteResourceCard';
import StudentResourceSidebar from '../../components/resources/StudentResourceSidebar';
import { PdfThumbnail, ResourceTypeTag } from '../../components/resources/ResourceVisuals';

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };

export function StudentModuleNotes() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const screens = Grid.useBreakpoint();
	const isMobile = !screens.lg;
	const initial = useRef({
		courseId: searchParams.get('courseId') || '',
		volumeId: searchParams.get('volumeId') || '',
		moduleId: searchParams.get('moduleId') || ''
	});
	const initialNavigationApplied = useRef(false);
	const requestSequence = useRef(0);
	const [loading, setLoading] = useState(false);
	const [notes, setNotes] = useState([]);
	const [total, setTotal] = useState(0);
	const [counts, setCounts] = useState({ ai: 0, manual: 0, uploadedPdf: 0 });
	const [coursesLoaded, setCoursesLoaded] = useState(false);
	const [viewMode, setViewMode] = useState(() => localStorage.getItem('milven.student-module-notes.view') || 'table');
	const [courses, setCourses] = useState([]);
	const [volumes, setVolumes] = useState([]);
	const [navigationTotal, setNavigationTotal] = useState(0);
	const [hierarchyLoading, setHierarchyLoading] = useState(false);
	const [hierarchyError, setHierarchyError] = useState('');
	const [filterCourseId, setFilterCourseId] = useState(initial.current.courseId || null);
	const [filterVolumeId, setFilterVolumeId] = useState(null);
	const [searchText, setSearchText] = useState('');
	const [searchTerm, setSearchTerm] = useState('');
	const [page, setPage] = useState(1);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewNote, setPreviewNote] = useState(null);
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [treeSearch, setTreeSearch] = useState('');

	useEffect(() => {
		let cancelled = false;
		api.get('/api/slides/library/courses').then(r => {
			if (cancelled) return;
			const list = r.data?.courses || [];
			setCourses(list);
			const requested = list.find(course => course.id === initial.current.courseId)?.id;
			const fallback = list.length === 1 ? list[0].id : null;
			setFilterCourseId(previous => (previous && list.some(course => course.id === previous) ? previous : requested || fallback));
		}).catch(() => {
			if (!cancelled) setCourses([]);
		}).finally(() => {
			if (!cancelled) setCoursesLoaded(true);
		});
		return () => { cancelled = true; };
	}, []);

	useEffect(() => {
		if (!coursesLoaded) return undefined;
		if (!courses.length) {
			setVolumes([]);
			setNavigationTotal(0);
			setHierarchyLoading(false);
			return undefined;
		}
		let cancelled = false;
		setHierarchyLoading(true);
		setHierarchyError('');
		api.get('/api/module-notes/navigation', { params: filterCourseId ? { courseId: filterCourseId } : {} })
			.then(r => {
				if (cancelled) return;
				const list = r.data?.volumes || [];
				setVolumes(list);
				setNavigationTotal(r.data?.totalCount || 0);
				if (!initialNavigationApplied.current) {
					const volume = list.find(item => item.id === initial.current.volumeId)
						|| (initial.current.moduleId ? list.find(item => item.modules.some(module => module.id === initial.current.moduleId)) : null);
					if (volume) setFilterVolumeId(volume.id);
					initialNavigationApplied.current = true;
				}
			})
			.catch(() => {
				if (cancelled) return;
				setVolumes([]);
				setNavigationTotal(0);
				setHierarchyError('Could not load your curriculum.');
			})
			.finally(() => {
				if (!cancelled) setHierarchyLoading(false);
			});
		return () => { cancelled = true; };
	}, [coursesLoaded, courses.length, filterCourseId]);

	const hierarchyTree = useMemo(() => {
		const search = treeSearch.toLowerCase().trim();
		if (!search) return volumes;
		return volumes.filter(volume => (
			volume.name?.toLowerCase().includes(search)
			|| volume.modules.some(module => module.name?.toLowerCase().includes(search))
		));
	}, [volumes, treeSearch]);

	const selectedVolume = volumes.find(volume => volume.id === filterVolumeId);

	useEffect(() => {
		const timer = setTimeout(() => { setSearchTerm(searchText.trim()); setPage(1); }, 300);
		return () => clearTimeout(timer);
	}, [searchText]);

	const fetchNotes = useCallback(async (silent = false) => {
		const sequence = ++requestSequence.current;
		if (!silent) setLoading(true);
		try {
			const params = { page, limit: 24, status: 'PUBLISHED' };
			if (filterCourseId) params.courseId = filterCourseId;
			if (filterVolumeId) params.volumeId = filterVolumeId;
			if (searchTerm) params.search = searchTerm;
			const res = await api.get('/api/module-notes/unified', { params });
			if (sequence !== requestSequence.current) return;
			setNotes(res.data?.resources || []);
			setTotal(res.data?.total || 0);
			setCounts(res.data?.counts || { ai: 0, manual: 0, uploadedPdf: 0 });
		} catch {
			if (sequence === requestSequence.current) {
				setNotes([]);
				setTotal(0);
				setCounts({ ai: 0, manual: 0, uploadedPdf: 0 });
			}
		} finally {
			if (!silent && sequence === requestSequence.current) setLoading(false);
		}
	}, [page, filterCourseId, filterVolumeId, searchTerm]);

	useEffect(() => { fetchNotes(); }, [fetchNotes]);

	const hasProcessingPdf = useMemo(() => notes.some(item => item.type === 'PDF' && ['UPLOADED', 'INDEXING'].includes(item.processingStatus)), [notes]);
	useEffect(() => {
		if (!hasProcessingPdf) return undefined;
		let cancelled = false;
		let timer = null;
		const poll = async () => {
			if (cancelled) return;
			try { await fetchNotes(true); } catch {}
			if (!cancelled) timer = setTimeout(poll, 6000);
		};
		timer = setTimeout(poll, 6000);
		return () => { cancelled = true; if (timer) clearTimeout(timer); };
	}, [hasProcessingPdf, fetchNotes]);

	const selectAll = () => {
		clearTreeFilter();
		if (isMobile) setSidebarOpen(false);
	};

	const selectVolume = volume => {
		setFilterVolumeId(volume.id);
		setPage(1);
		if (isMobile) setSidebarOpen(false);
	};

	const clearTreeFilter = () => { setFilterVolumeId(null); setPage(1); };

	const clearAllFilters = () => {
		setSearchText('');
		clearTreeFilter();
	};

	const changeCourse = value => {
		setFilterCourseId(value || null);
		setFilterVolumeId(null);
		setPage(1);
		if (isMobile) setSidebarOpen(false);
	};

	const activeLabel = selectedVolume?.name || null;
	const hasActiveFilters = Boolean(searchText || filterVolumeId);

	const changeView = mode => {
		setViewMode(mode);
		try { localStorage.setItem('milven.student-module-notes.view', mode); } catch {}
	};

	const openResource = resource => {
		if (resource.type === 'PDF') openPdfResource(resource);
		else { setPreviewNote(resource); setPreviewOpen(true); }
	};

	const columns = [
		{ title: 'Resource', key: 'resource', width: 380, render: (_, resource) => (
			<Space align="start">
				{resource.type === 'PDF' ? <button type="button" onClick={() => openResource(resource)} aria-label={`View ${resource.title}`} style={{ width: 76, height: 44, overflow: 'hidden', borderRadius: 4, flexShrink: 0, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}><PdfThumbnail url={resource.thumbnailUrl} title={resource.title} height={44} /></button> : <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><BookOutlined style={{ color: '#2563eb', fontSize: 20 }} /></div>}
				<div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, color: '#102540' }}>{resource.title}</div></div>
			</Space>
		) },
		{ title: 'Level', key: 'level', width: 95, render: (_, resource) => <Tag color={resource.level === 'LEVEL1' ? 'blue' : resource.level === 'LEVEL2' ? 'purple' : 'gold'}>{LEVEL_LABELS[resource.level] || resource.level}</Tag> },
		{ title: 'Volume', key: 'volume', width: 180, render: (_, resource) => (
			<div>
				<div style={{ color: '#334155' }}>{resource.volume?.name || <Typography.Text type="secondary">-</Typography.Text>}</div>
				<div style={{ marginTop: 4 }}><ResourceTypeTag type={resource.type === 'PDF' ? 'PDF' : 'NOTE'} /></div>
			</div>
		) },
		{ title: 'Actions', key: 'actions', width: 100, fixed: 'right', render: (_, resource) => <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openResource(resource)}>View</Button> }
	];
	const openPdfResource = resource => navigate(`/learning/module-notes-pdf/${resource.resourceId || resource.id}${resource.matchPage ? `?page=${resource.matchPage}` : ''}`);

	return (
		<div style={{ display: 'flex', height: 'calc(100vh - 120px)', overflow: 'hidden' }}>

			<StudentResourceSidebar
				title="Milven Notes"
				icon={<BookOutlined style={{ fontSize: 18, color: '#fff' }} />}
				allLabel="All Notes"
				courses={courses}
				courseId={filterCourseId}
				onCourseChange={changeCourse}
				volumes={hierarchyTree}
				totalCount={navigationTotal}
				selectedVolumeId={filterVolumeId}
				onSelectAll={selectAll}
				onSelectVolume={selectVolume}
				showModules={false}
				activeLabel={activeLabel}
				onClearFilter={clearTreeFilter}
				treeSearch={treeSearch}
				onTreeSearch={setTreeSearch}
				isMobile={isMobile}
				open={sidebarOpen}
				onClose={() => setSidebarOpen(false)}
				loading={hierarchyLoading}
				error={hierarchyError}
			/>
			{/* ═══ Main Content ═══ */}
			<div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px 12px' : '20px 24px' }}>
				{/* Header */}
				<div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
					{isMobile && <Button icon={<MenuOutlined />} aria-label="Open Milven Notes navigation" onClick={() => setSidebarOpen(true)} style={{ flexShrink: 0 }} />}
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
						<div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
							<BookOutlined style={{ fontSize: 20, color: '#fff' }} />
						</div>
						<div>
							<Typography.Title level={4} style={{ margin: 0, color: '#102540' }}>Milven Module Notes</Typography.Title>
							<Typography.Text type="secondary" style={{ fontSize: 12 }}>{activeLabel ? `${activeLabel} - Volume` : 'Premium exam-focused learning module notes'}</Typography.Text>
						</div>
					</div>
				</div>

				<Row gutter={[10, 10]} style={{ marginBottom: 14 }}>
					{[{ label: 'Available resources', value: total }, { label: 'Learning notes', value: (counts.ai || 0) + (counts.manual || 0) }, { label: 'PDF module notes', value: counts.uploadedPdf || 0 }].map(item => (
						<Col xs={12} sm={8} lg={8} key={item.label}><Card size="small" style={{ borderRadius: 12, border: '1px solid #e2e8f0' }} styles={{ body: { padding: '10px 12px' } }}><Typography.Text type="secondary" style={{ fontSize: 11 }}>{item.label}</Typography.Text><div style={{ fontSize: 22, fontWeight: 700, color: '#102540', fontVariantNumeric: 'tabular-nums' }}>{Number(item.value || 0).toLocaleString('en-US')}</div></Card></Col>
					))}
				</Row>

				{/* Search */}
				<Card size="small" style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #e2e8f0' }} styles={{ body: { padding: 12 } }}>
					<Row gutter={[10, 10]} align="middle">
						<Col xs={24} md={14}><Input prefix={<SearchOutlined />} placeholder="Search notes and PDFs..." value={searchText} onChange={e => { setSearchText(e.target.value); setPage(1); }} allowClear style={{ width: 330 }} /></Col>
						<Col xs={24} md={10} style={{ textAlign: 'right' }}><Space wrap>{hasActiveFilters && <Button size="small" onClick={clearAllFilters}>Clear Filters</Button>}<Button.Group><Button type={viewMode === 'cards' ? 'primary' : 'default'} icon={<AppstoreOutlined />} onClick={() => changeView('cards')} aria-label="Card view" /><Button type={viewMode === 'table' ? 'primary' : 'default'} icon={<OrderedListOutlined />} onClick={() => changeView('table')} aria-label="Table view" /></Button.Group></Space></Col>
					</Row>
				</Card>

				{/* Notes listing */}
				{loading ? (
					<div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
				) : coursesLoaded && courses.length === 0 ? (
					<Card style={{ borderRadius: 12, textAlign: 'center', padding: 30 }}><Empty description="You do not currently have access to any learning courses."><Button type="primary" onClick={() => navigate('/courses')}>Browse Courses</Button></Empty></Card>
				) : notes.length === 0 ? (
					<Card style={{ borderRadius: 12, textAlign: 'center', padding: 30 }}><Empty description={hasActiveFilters ? 'No resources match your selected filters.' : 'No learning resources are available for your enrolled course yet.'}>{hasActiveFilters && <Button onClick={clearAllFilters}>Clear Filters</Button>}</Empty></Card>
				) : viewMode === 'table' ? (
					<Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }} styles={{ body: { padding: 0 } }}><Table dataSource={notes} columns={columns} rowKey={resource => resource.resourceKey || resource.id} scroll={{ x: 800 }} pagination={{ current: page, pageSize: 24, total, showSizeChanger: false, onChange: setPage, showTotal: count => `${count} resources` }} /></Card>
				) : (
					<>
						<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 }}>
							{notes.map(resource => <ModuleNoteResourceCard key={resource.resourceKey || resource.id} resource={resource} onPreview={resource => { if (resource.type !== 'PDF') { setPreviewNote(resource); setPreviewOpen(true); } }} onOpenPdf={openPdfResource} />)}
						</div>
						{total > 24 && <div style={{ textAlign: 'center', marginTop: 20 }}><Space><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><Typography.Text type="secondary">Page {page} of {Math.ceil(total / 24)}</Typography.Text><Button disabled={notes.length < 24} onClick={() => setPage(p => p + 1)}>Next</Button></Space></div>}
					</>
				)}

				{/* Preview Modal */}
				<Modal open={previewOpen} onCancel={() => { setPreviewOpen(false); setPreviewNote(null); }} footer={null} width={isMobile ? '95%' : 1100} centered title={null} styles={{ body: { padding: 0 } }}>
					{previewNote && <ModuleNotePreviewCard note={previewNote} />}
				</Modal>
			</div>
		</div>
	);
}

export default StudentModuleNotes;
