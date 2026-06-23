import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Typography, Select, Input, Tag, Space, Spin, Empty, Button, Card, Modal, Grid } from 'antd';
import { BookOutlined, SearchOutlined, MenuOutlined, CloseOutlined, RightOutlined, DownOutlined, AppstoreOutlined, FolderOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { ModuleNotePreviewCard } from '../../components/ModuleNotePreviewCard';

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };

export function StudentModuleNotes() {
	const screens = Grid.useBreakpoint();
	const isMobile = !screens.md;
	const [loading, setLoading] = useState(false);
	const [notes, setNotes] = useState([]);
	const [total, setTotal] = useState(0);
	const [courses, setCourses] = useState([]);
	const [volumes, setVolumes] = useState([]);
	const [modules, setModules] = useState([]);
	const [topics, setTopics] = useState([]);
	const [filterCourseId, setFilterCourseId] = useState(null);
	const [filterVolumeId, setFilterVolumeId] = useState(null);
	const [filterModuleId, setFilterModuleId] = useState(null);
	const [filterTopicId, setFilterTopicId] = useState(null);
	const [searchText, setSearchText] = useState('');
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
		}).catch(() => {});
		api.get('/api/learning/volumes/public').then(r => setVolumes(r.data?.volumes || [])).catch(() => {});
		api.get('/api/learning/modules/public').then(r => setModules(r.data?.modules || [])).catch(() => {});
		api.get('/api/learning/topics/public').then(r => setTopics(r.data?.topics || [])).catch(() => {});
	}, []);

	// Build hierarchy tree: Volume → Module → Topic
	const hierarchyTree = useMemo(() => {
		let volList = filterCourseId ? volumes.filter(v => v.courseLinks?.some(cl => cl.courseId === filterCourseId)) : volumes;
		const search = treeSearch.toLowerCase().trim();
		return volList.map(vol => {
			const volModules = modules.filter(m => m.volumeId === vol.id && (!filterCourseId || m.courseId === filterCourseId));
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
	}, [volumes, modules, topics, filterCourseId, treeSearch]);

	const fetchNotes = useCallback(async () => {
		setLoading(true);
		try {
			const params = { page, limit: 50, status: 'PUBLISHED' };
			if (filterCourseId) params.courseId = filterCourseId;
			if (filterVolumeId) params.volumeId = filterVolumeId;
			if (filterModuleId) params.moduleId = filterModuleId;
			if (filterTopicId) params.topicId = filterTopicId;
			if (searchText) params.search = searchText;
			const res = await api.get('/api/module-notes', { params });
			setNotes(res.data?.notes || []);
			setTotal(res.data?.total || 0);
		} catch { } finally { setLoading(false); }
	}, [page, filterCourseId, filterVolumeId, filterModuleId, filterTopicId, searchText]);

	useEffect(() => { fetchNotes(); }, [fetchNotes]);

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

				{/* Search */}
				<div style={{ marginBottom: 16 }}>
					<Input prefix={<SearchOutlined />} placeholder="Search notes…" value={searchText} onChange={e => { setSearchText(e.target.value); setPage(1); }} allowClear style={{ maxWidth: 400 }} />
				</div>

				{/* Notes Grid */}
				{loading ? (
					<div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
				) : notes.length === 0 ? (
					<Empty description="No module notes available" style={{ padding: 60 }} />
				) : (
					<>
						<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
							{notes.map(n => {
								const losCount = Array.isArray(n.losStatements) ? n.losStatements.length : 0;
								const conceptCount = Array.isArray(n.concepts) ? n.concepts.length : 0;
								const formulaCount = Array.isArray(n.formulaRecap) ? n.formulaRecap.length : 0;
								const practiceCount = Array.isArray(n.practiceSet) ? n.practiceSet.length : 0;
								return (
									<Card hoverable key={n.id} style={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} styles={{ body: { padding: 0 } }} onClick={() => { setPreviewNote(n); setPreviewOpen(true); }}>
										<div style={{ padding: 16 }}>
											<div style={{ fontWeight: 700, fontSize: 15, color: '#102540', lineHeight: 1.3 }}>{n.title}</div>
											{n.module?.name && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{n.module.name}</div>}
											<div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
												<Tag color="blue" style={{ fontSize: 11 }}>{LEVEL_LABELS[n.level]}</Tag>
												{n.difficulty && <Tag style={{ fontSize: 11 }}>{n.difficulty}</Tag>}
												{n.studyTime && <Tag color="geekblue" style={{ fontSize: 11 }}>{n.studyTime}</Tag>}
											</div>
											{n.overview && <div style={{ fontSize: 13, color: '#475569', marginTop: 8, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.overview}</div>}
											<div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
												{losCount > 0 && <Tag color="blue" style={{ fontSize: 11, borderRadius: 6 }}>{losCount} LOS</Tag>}
												{conceptCount > 0 && <Tag color="purple" style={{ fontSize: 11, borderRadius: 6 }}>{conceptCount} concepts</Tag>}
												{formulaCount > 0 && <Tag color="cyan" style={{ fontSize: 11, borderRadius: 6 }}>{formulaCount} formulas</Tag>}
												{practiceCount > 0 && <Tag color="green" style={{ fontSize: 11, borderRadius: 6 }}>{practiceCount} practice Qs</Tag>}
											</div>
										</div>
									</Card>
								);
							})}
						</div>
						{total > 50 && (
							<div style={{ textAlign: 'center', marginTop: 20 }}>
								<Space>
									<Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
									<Typography.Text type="secondary">Page {page} of {Math.ceil(total / 50)}</Typography.Text>
									<Button disabled={notes.length < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
								</Space>
							</div>
						)}
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
