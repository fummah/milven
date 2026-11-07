import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Typography, Select, Input, Tag, Space, Spin, Empty, Button, Card, Modal, Grid, Table, Row, Col } from 'antd';
import { BookOutlined, SearchOutlined, MenuOutlined, CloseOutlined, RightOutlined, DownOutlined, AppstoreOutlined, FolderOutlined, FilePdfOutlined, OrderedListOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { ModuleNotePreviewCard } from '../../components/ModuleNotePreviewCard';
import ModuleNoteResourceCard from '../../components/resources/ModuleNoteResourceCard';
import { PdfThumbnail, ResourceTypeTag } from '../../components/resources/ResourceVisuals';

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };

export function StudentModuleNotes() {
	const navigate = useNavigate();
	const screens = Grid.useBreakpoint();
	const isMobile = !screens.md;
	const [loading, setLoading] = useState(false);
	const [notes, setNotes] = useState([]);
	const [total, setTotal] = useState(0);
	const [counts, setCounts] = useState({ ai: 0, manual: 0, uploadedPdf: 0 });
	const [coursesLoaded, setCoursesLoaded] = useState(false);
	const [viewMode, setViewMode] = useState(() => localStorage.getItem('milven.student-module-notes.view') || 'table');
	const [courses, setCourses] = useState([]);
	const [volumes, setVolumes] = useState([]);
	const [modules, setModules] = useState([]);
	const [topics, setTopics] = useState([]);
	const [filterCourseId, setFilterCourseId] = useState(null);
	const [filterVolumeId, setFilterVolumeId] = useState(null);
	const [filterModuleId, setFilterModuleId] = useState(null);
	const [filterTopicId, setFilterTopicId] = useState(null);
	const [searchText, setSearchText] = useState('');
	const [searchTerm, setSearchTerm] = useState('');
	const [filterSource, setFilterSource] = useState(null);
	const [page, setPage] = useState(1);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewNote, setPreviewNote] = useState(null);
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [expandedVolumes, setExpandedVolumes] = useState(new Set());
	const [expandedModules, setExpandedModules] = useState(new Set());
	const [treeSearch, setTreeSearch] = useState('');

	useEffect(() => {
		api.get('/api/learning/me/courses').then(r => {
			const enrollments = r.data?.courses || [];
			setCourses(enrollments.map(e => ({ id: e.courseId, name: e.name, level: e.level })).filter(e => e.id));
		}).catch(() => {}).finally(() => setCoursesLoaded(true));
		api.get('/api/learning/volumes/public').then(r => setVolumes(r.data?.volumes || [])).catch(() => {});
		api.get('/api/learning/modules/public').then(r => setModules(r.data?.modules || [])).catch(() => {});
		api.get('/api/learning/topics/public').then(r => setTopics(r.data?.topics || [])).catch(() => {});
	}, []);

	// Build hierarchy tree: Volume → Module → Topic
	const accessibleCourseIds = useMemo(() => new Set(courses.map(course => course.id)), [courses]);

	const hierarchyTree = useMemo(() => {
		const inAccessibleCourse = row => row?.courseId ? accessibleCourseIds.has(row.courseId) : row?.courseLinks?.some(link => accessibleCourseIds.has(link.courseId));
		let volList = filterCourseId
			? volumes.filter(v => v.courseLinks?.some(cl => cl.courseId === filterCourseId))
			: volumes.filter(v => v.courseLinks?.some(cl => accessibleCourseIds.has(cl.courseId)));
		const search = treeSearch.toLowerCase().trim();
		return volList.map(vol => {
			const volModules = modules.filter(m => m.volumeId === vol.id && (filterCourseId ? m.courseId === filterCourseId : inAccessibleCourse(m)));
			const modulesWithTopics = volModules.map(mod => {
				const modTopics = topics.filter(t => t.moduleId === mod.id);
				return { ...mod, topics: modTopics };
			});
			return { ...vol, modules: modulesWithTopics };
		}).filter(vol => {
			if (!search) return vol.modules.length > 0;
			const volMatch = vol.name?.toLowerCase().includes(search);
			const hasChild = vol.modules.some(m => m.name?.toLowerCase().includes(search) || m.topics.some(t => t.name?.toLowerCase().includes(search)));
			return volMatch || hasChild;
		});
	}, [volumes, modules, topics, filterCourseId, treeSearch, accessibleCourseIds]);

	useEffect(() => {
		const timer = setTimeout(() => { setSearchTerm(searchText.trim()); setPage(1); }, 300);
		return () => clearTimeout(timer);
	}, [searchText]);

	const fetchNotes = useCallback(async (silent = false) => {
		if (!silent) setLoading(true);
		try {
			const params = { page, limit: 24, status: 'PUBLISHED' };
			if (filterCourseId) params.courseId = filterCourseId;
			if (filterVolumeId) params.volumeId = filterVolumeId;
			if (filterModuleId) params.moduleId = filterModuleId;
			if (filterTopicId) params.topicId = filterTopicId;
			if (searchTerm) params.search = searchTerm;
			if (filterSource) params.source = filterSource;
			const res = await api.get('/api/module-notes/unified', { params });
			setNotes(res.data?.resources || []);
			setTotal(res.data?.total || 0);
			setCounts(res.data?.counts || { ai: 0, manual: 0, uploadedPdf: 0 });
		} catch { } finally { if (!silent) setLoading(false); }
	}, [page, filterCourseId, filterVolumeId, filterModuleId, filterTopicId, filterSource, searchTerm]);

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

	const selectTreeItem = (type, id) => {
		if (type === 'volume') { setFilterVolumeId(id); setFilterModuleId(null); setFilterTopicId(null); }
		else if (type === 'module') { setFilterModuleId(id); setFilterTopicId(null); }
		else if (type === 'topic') { setFilterTopicId(id); }
		setPage(1);
		if (isMobile) setSidebarOpen(false);
	};

	const clearTreeFilter = () => { setFilterVolumeId(null); setFilterModuleId(null); setFilterTopicId(null); setPage(1); };

	const activeLabel = filterTopicId
		? topics.find(t => t.id === filterTopicId)?.name
		: filterModuleId
			? modules.find(m => m.id === filterModuleId)?.name
			: filterVolumeId
				? volumes.find(v => v.id === filterVolumeId)?.name
				: null;

	const changeView = mode => {
		setViewMode(mode);
		try { localStorage.setItem('milven.student-module-notes.view', mode); } catch {}
	};

	const openResource = resource => {
		if (resource.type === 'PDF') openPdfResource(resource);
		else { setPreviewNote(resource); setPreviewOpen(true); }
	};

	const columns = [
		{ title: 'Resource', key: 'resource', width: 340, render: (_, resource) => (
			<Space align="start">
				{resource.type === 'PDF' ? <button type="button" onClick={() => openResource(resource)} aria-label={`View ${resource.title}`} style={{ width: 76, height: 44, overflow: 'hidden', borderRadius: 4, flexShrink: 0, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}><PdfThumbnail url={resource.thumbnailUrl} title={resource.title} height={44} /></button> : <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><BookOutlined style={{ color: '#2563eb', fontSize: 20 }} /></div>}
				<div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, color: '#102540' }}>{resource.title}</div></div>
			</Space>
		) },
		{ title: 'Type', key: 'type', width: 120, render: (_, resource) => <ResourceTypeTag type={resource.type} /> },
		{ title: 'Level', key: 'level', width: 95, render: (_, resource) => <Tag color={resource.level === 'LEVEL1' ? 'blue' : resource.level === 'LEVEL2' ? 'purple' : 'gold'}>{LEVEL_LABELS[resource.level] || resource.level}</Tag> },
		{ title: 'Volume', key: 'volume', width: 150, render: (_, resource) => resource.volume?.name || <Typography.Text type="secondary">-</Typography.Text> },
		{ title: 'Learning Module', key: 'module', width: 190, render: (_, resource) => resource.type === 'PDF' ? <Tag>Whole Volume</Tag> : resource.module?.name || <Typography.Text type="secondary">-</Typography.Text> },
		{ title: 'Status', key: 'status', width: 100, render: (_, resource) => <Tag color={resource.status === 'PUBLISHED' ? 'green' : 'default'}>{resource.status === 'PUBLISHED' ? 'Published' : 'Draft'}</Tag> },
		{ title: 'Actions', key: 'actions', width: 100, fixed: 'right', render: (_, resource) => <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openResource(resource)}>View</Button> }
	];

	const openPdfResource = resource => navigate(`/learning/module-notes-pdf/${resource.resourceId || resource.id}${resource.matchPage ? `?page=${resource.matchPage}` : ''}`);

	return (
		<div style={{ display: 'flex', height: 'calc(100vh - 120px)', overflow: 'hidden' }}>
			{/* Mobile overlay */}
			{isMobile && sidebarOpen && (
				<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }} onClick={() => setSidebarOpen(false)} />
			)}

			{/* ═══ Sidebar Tree ═══ */}
			<div style={{
				width: isMobile ? '85vw' : 290, minWidth: isMobile ? undefined : 260, maxWidth: isMobile ? 360 : 310,
				borderRight: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden',
				...(isMobile ? { position: 'fixed', left: sidebarOpen ? 0 : '-100%', top: 0, bottom: 0, zIndex: 50, transition: 'left 0.3s ease', boxShadow: sidebarOpen ? '4px 0 16px rgba(0,0,0,0.12)' : undefined } : {}),
			}}>
				{/* Sidebar header */}
				<div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', display: 'flex', alignItems: 'center', gap: 10 }}>
					<BookOutlined style={{ fontSize: 18, color: '#fff' }} />
					<span style={{ fontWeight: 700, fontSize: 15, color: '#fff', flex: 1 }}>Curriculum</span>
					{isMobile && <Button type="text" icon={<CloseOutlined style={{ color: '#fff' }} />} size="small" onClick={() => setSidebarOpen(false)} />}
				</div>

				{/* Course filter */}
				<div style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', background: '#f8fafc' }}>
					<Select
						placeholder="Select Course" value={filterCourseId} size="small"
						onChange={v => { setFilterCourseId(v); setFilterVolumeId(null); setFilterModuleId(null); setFilterTopicId(null); setPage(1); }}
						options={[{ value: null, label: 'All Courses' }, ...courses.map(c => ({ value: c.id, label: c.name }))]}
						style={{ width: '100%' }} allowClear showSearch optionFilterProp="label"
					/>
				</div>

				{/* Tree search */}
				<div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
					<Input prefix={<SearchOutlined style={{ color: '#94a3b8' }} />} placeholder="Search curriculum…" value={treeSearch} onChange={e => setTreeSearch(e.target.value)} allowClear size="small" />
				</div>

				{/* Active filter badge */}
				{(filterVolumeId || filterModuleId || filterTopicId) && (
					<div style={{ padding: '6px 12px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 6 }}>
						<Tag color="blue" style={{ margin: 0, fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeLabel}</Tag>
						<Button type="link" size="small" style={{ fontSize: 11, padding: 0 }} onClick={clearTreeFilter}>Clear</Button>
					</div>
				)}

				{/* Tree */}
				<div style={{ flex: 1, overflowY: 'auto' }}>
					{hierarchyTree.length === 0 ? (
						<div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
							<FolderOutlined style={{ fontSize: 28, opacity: 0.4 }} />
							<div style={{ fontSize: 13, marginTop: 8 }}>No curriculum items</div>
						</div>
					) : hierarchyTree.map(vol => {
						const isVolExp = expandedVolumes.has(vol.id);
						const isVolActive = filterVolumeId === vol.id && !filterModuleId && !filterTopicId;
						return (
							<div key={vol.id}>
								{/* Volume row */}
								<div
									onClick={() => { setExpandedVolumes(prev => { const s = new Set(prev); s.has(vol.id) ? s.delete(vol.id) : s.add(vol.id); return s; }); }}
									style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', cursor: 'pointer', background: isVolActive ? '#eff6ff' : 'transparent', borderLeft: isVolActive ? '3px solid #2563eb' : '3px solid transparent' }}
									onMouseEnter={e => { if (!isVolActive) e.currentTarget.style.background = '#f8fafc'; }}
									onMouseLeave={e => { if (!isVolActive) e.currentTarget.style.background = isVolActive ? '#eff6ff' : 'transparent'; }}
								>
									{isVolExp ? <DownOutlined style={{ fontSize: 10, color: '#2563eb' }} /> : <RightOutlined style={{ fontSize: 10, color: '#94a3b8' }} />}
									<BookOutlined style={{ fontSize: 13, color: '#2563eb' }} />
									<span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vol.name}</span>
									<span style={{ fontSize: 10, color: '#94a3b8' }}>{vol.modules.length}</span>
									<Button type="text" size="small" style={{ fontSize: 10, padding: '0 4px', height: 20, color: '#2563eb' }}
										onClick={e => { e.stopPropagation(); selectTreeItem('volume', vol.id); }}>
										Filter
									</Button>
								</div>

								{/* Modules under volume */}
								{isVolExp && vol.modules.map(mod => {
									const isModExp = expandedModules.has(mod.id);
									const isModActive = filterModuleId === mod.id && !filterTopicId;
									return (
										<div key={mod.id}>
											<div
												onClick={() => { setExpandedModules(prev => { const s = new Set(prev); s.has(mod.id) ? s.delete(mod.id) : s.add(mod.id); return s; }); }}
												style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px 7px 32px', cursor: 'pointer', background: isModActive ? '#f0fdf4' : 'transparent', borderLeft: isModActive ? '3px solid #16a34a' : '3px solid transparent' }}
												onMouseEnter={e => { if (!isModActive) e.currentTarget.style.background = '#fafafa'; }}
												onMouseLeave={e => { if (!isModActive) e.currentTarget.style.background = isModActive ? '#f0fdf4' : 'transparent'; }}
											>
												{mod.topics.length > 0 ? (isModExp ? <DownOutlined style={{ fontSize: 9, color: '#16a34a' }} /> : <RightOutlined style={{ fontSize: 9, color: '#94a3b8' }} />) : <span style={{ width: 9 }} />}
												<AppstoreOutlined style={{ fontSize: 12, color: '#16a34a' }} />
												<span style={{ fontSize: 12, fontWeight: 500, color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mod.name}</span>
												<Button type="text" size="small" style={{ fontSize: 10, padding: '0 4px', height: 18, color: '#16a34a' }}
													onClick={e => { e.stopPropagation(); selectTreeItem('module', mod.id); }}>
													Filter
												</Button>
											</div>

											{/* Topics under module */}
											{isModExp && mod.topics.map(topic => {
												const isTopicActive = filterTopicId === topic.id;
												return (
													<div
														key={topic.id}
														onClick={() => selectTreeItem('topic', topic.id)}
														style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px 6px 54px', cursor: 'pointer', background: isTopicActive ? '#fefce8' : 'transparent', borderLeft: isTopicActive ? '3px solid #eab308' : '3px solid transparent' }}
														onMouseEnter={e => { if (!isTopicActive) e.currentTarget.style.background = '#fafafa'; }}
														onMouseLeave={e => { if (!isTopicActive) e.currentTarget.style.background = isTopicActive ? '#fefce8' : 'transparent'; }}
													>
														<span style={{ width: 6, height: 6, borderRadius: '50%', background: isTopicActive ? '#eab308' : '#cbd5e1', flexShrink: 0 }} />
														<span style={{ fontSize: 12, color: isTopicActive ? '#92400e' : '#475569', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.name}</span>
													</div>
												);
											})}
										</div>
									);
								})}
							</div>
						);
					})}
				</div>
			</div>

			{/* ═══ Main Content ═══ */}
			<div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px 12px' : '20px 24px' }}>
				{/* Header */}
				<div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
					{isMobile && <Button icon={<MenuOutlined />} onClick={() => setSidebarOpen(true)} style={{ flexShrink: 0 }} />}
					<div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
						<div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
							<BookOutlined style={{ fontSize: 20, color: '#fff' }} />
						</div>
						<div>
							<Typography.Title level={4} style={{ margin: 0, color: '#102540' }}>Milven Module Notes</Typography.Title>
							<Typography.Text type="secondary" style={{ fontSize: 12 }}>Premium exam-focused learning module notes</Typography.Text>
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
						<Col xs={24} md={14}><Space wrap><Input prefix={<SearchOutlined />} placeholder="Search notes and PDFs..." value={searchText} onChange={e => { setSearchText(e.target.value); setPage(1); }} allowClear style={{ width: 330 }} /><Select placeholder="Source" value={filterSource} onChange={v => { setFilterSource(v); setPage(1); }} options={[{ value: null, label: 'All Sources' }, { value: 'AI', label: 'AI Generated' }, { value: 'MANUAL', label: 'Manual' }, { value: 'UPLOADED_PDF', label: 'Uploaded PDF' }]} style={{ width: 160 }} allowClear /></Space></Col>
						<Col xs={24} md={10} style={{ textAlign: 'right' }}><Space wrap>{filterModuleId && <Button size="small" onClick={() => { const mod = modules.find(m => m.id === filterModuleId); navigate(`/student/slides?courseId=${mod?.courseId || filterCourseId || ''}&volumeId=${filterVolumeId || mod?.volumeId || ''}&moduleId=${filterModuleId}`); }}>Open Slides</Button>}<Button.Group><Button type={viewMode === 'cards' ? 'primary' : 'default'} icon={<AppstoreOutlined />} onClick={() => changeView('cards')} aria-label="Card view" /><Button type={viewMode === 'table' ? 'primary' : 'default'} icon={<OrderedListOutlined />} onClick={() => changeView('table')} aria-label="Table view" /></Button.Group></Space></Col>
					</Row>
				</Card>

				{/* Notes listing */}
				{loading ? (
					<div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
				) : coursesLoaded && courses.length === 0 ? (
					<Card style={{ borderRadius: 12, textAlign: 'center', padding: 30 }}><Empty description="You do not currently have access to any learning courses."><Button type="primary" onClick={() => navigate('/courses')}>Browse Courses</Button></Empty></Card>
				) : notes.length === 0 ? (
					<Card style={{ borderRadius: 12, textAlign: 'center', padding: 30 }}><Empty description={searchText || filterSource || filterVolumeId || filterModuleId || filterTopicId ? 'No resources match your selected filters.' : 'No learning resources are available for your enrolled course yet.'}>{(searchText || filterSource || filterVolumeId || filterModuleId || filterTopicId) && <Button onClick={() => { setSearchText(''); setFilterSource(null); setFilterVolumeId(null); setFilterModuleId(null); setFilterTopicId(null); setPage(1); }}>Clear Filters</Button>}</Empty></Card>
				) : viewMode === 'table' ? (
					<Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }} styles={{ body: { padding: 0 } }}><Table dataSource={notes} columns={columns} rowKey={resource => resource.resourceKey || resource.id} scroll={{ x: 1200 }} pagination={{ current: page, pageSize: 24, total, showSizeChanger: false, onChange: setPage, showTotal: count => `${count} resources` }} /></Card>
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
