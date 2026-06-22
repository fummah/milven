import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Typography, Select, Input, Tag, Space, Spin, Empty, Button, Row, Col, Card, Modal, Grid, Divider } from 'antd';
import { FileTextOutlined, SearchOutlined, EyeOutlined, PrinterOutlined, MenuOutlined, CloseOutlined, RightOutlined, DownOutlined, BookOutlined, AppstoreOutlined, FolderOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import MathText, { MathVariables } from '../../components/MathText';

// ─── Safe render: stringify objects that React can't render ──
function safeRender(val) {
	if (val === null || val === undefined) return '';
	if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
	if (typeof val === 'object') {
		try { return JSON.stringify(val); } catch { return String(val); }
	}
	return String(val);
}

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };

export function StudentSummarySheets() {
	const screens = Grid.useBreakpoint();
	const isMobile = !screens.md;
	const [loading, setLoading] = useState(false);
	const [sheets, setSheets] = useState([]);
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
	const [previewSheet, setPreviewSheet] = useState(null);
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

	const fetchSheets = useCallback(async () => {
		setLoading(true);
		try {
			const params = { page, limit: 50, status: 'PUBLISHED' };
			if (filterCourseId) params.courseId = filterCourseId;
			if (filterVolumeId) params.volumeId = filterVolumeId;
			if (filterModuleId) params.moduleId = filterModuleId;
			if (filterTopicId) params.topicId = filterTopicId;
			if (searchText) params.search = searchText;
			const res = await api.get('/api/summary-sheets', { params });
			setSheets(res.data?.sheets || []);
			setTotal(res.data?.total || 0);
		} catch { } finally { setLoading(false); }
	}, [page, filterCourseId, filterVolumeId, filterModuleId, filterTopicId, searchText]);

	useEffect(() => { fetchSheets(); }, [fetchSheets]);

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
					<FileTextOutlined style={{ fontSize: 18, color: '#fff' }} />
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
							<FileTextOutlined style={{ fontSize: 20, color: '#fff' }} />
						</div>
						<div>
							<Typography.Title level={4} style={{ margin: 0, color: '#102540' }}>Milven Summary Sheets</Typography.Title>
							<Typography.Text type="secondary" style={{ fontSize: 12 }}>High-impact revision sheets. Simplified. Exam-focused.</Typography.Text>
						</div>
					</div>
				</div>

				{/* Search */}
				<div style={{ marginBottom: 16 }}>
					<Input prefix={<SearchOutlined />} placeholder="Search sheets…" value={searchText} onChange={e => { setSearchText(e.target.value); setPage(1); }} allowClear style={{ maxWidth: 400 }} />
				</div>

				{/* Sheets Grid */}
				{loading ? (
					<div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
				) : sheets.length === 0 ? (
					<Empty description="No summary sheets available" style={{ padding: 60 }} />
				) : (
					<>
						<Row gutter={[16, 16]}>
							{sheets.map(s => (
								<Col xs={24} sm={12} lg={8} key={s.id}>
									<Card hoverable style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', height: '100%' }} bodyStyle={{ padding: 0 }} onClick={() => { setPreviewSheet(s); setPreviewOpen(true); }}>
										<div style={{ background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', padding: '16px 20px' }}>
											<Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
												{LEVEL_LABELS[s.level]} {s.volume?.name ? `| ${s.volume.name}` : ''}
											</Typography.Text>
											<Typography.Title level={5} style={{ color: '#fff', margin: '4px 0 0' }}>{s.title}</Typography.Title>
										</div>
										<div style={{ padding: '12px 20px' }}>
											{s.snapshot && <div style={{ color: '#475569', fontSize: 13, lineHeight: 1.5, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.snapshot}</div>}
											<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
												{s.useCase && <Tag color="blue" style={{ fontSize: 11 }}>{s.useCase}</Tag>}
												<Tag style={{ fontSize: 11 }}>{s.year}</Tag>
											</div>
										</div>
									</Card>
								</Col>
							))}
						</Row>
						{total > 50 && (
							<div style={{ textAlign: 'center', marginTop: 20 }}>
								<Space>
									<Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
									<Typography.Text type="secondary">Page {page} of {Math.ceil(total / 50)}</Typography.Text>
									<Button disabled={sheets.length < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
								</Space>
							</div>
						)}
					</>
				)}

				{/* Preview Modal */}
				<Modal open={previewOpen} onCancel={() => { setPreviewOpen(false); setPreviewSheet(null); }} footer={null} width={isMobile ? '95%' : 1000} centered title={null} styles={{ body: { padding: 0 } }}>
					{previewSheet && <SummarySheetView sheet={previewSheet} />}
				</Modal>
			</div>
		</div>
	);
}

function SummarySheetView({ sheet }) {
	const s = sheet;
	const losItems = Array.isArray(s.coreDefinitions) ? s.coreDefinitions : [];
	const conceptMap = Array.isArray(s.diagrams) ? s.diagrams : [];
	const topicMap = Array.isArray(s.memoryHooks) ? s.memoryHooks : [];
	const formulas = Array.isArray(s.formulas) ? s.formulas : [];
	const rules = Array.isArray(s.distinctions) ? s.distinctions : [];
	const traps = Array.isArray(s.examTraps) ? s.examTraps : [];
	const checks = Array.isArray(s.revisionCheck) ? s.revisionCheck : [];

	return (
		<div style={{ background: '#f8f9fa', borderRadius: 16, overflow: 'hidden' }}>
			{/* ═══════════ PAGE 1: Concept Overview ═══════════ */}
			<div style={{ background: '#fff', marginBottom: 4 }}>
				{/* Header Bar */}
				<div style={{ background: '#102540', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
					<div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
						<Typography.Text style={{ color: '#fff', fontSize: 18, fontWeight: 800, letterSpacing: 1 }}>MILVEN</Typography.Text>
						<Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>FINANCE SCHOOL</Typography.Text>
					</div>
					<Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
						{LEVEL_LABELS[s.level]} | {s.course?.name || s.volume?.name || ''}
					</Typography.Text>
				</div>

				{/* Title */}
				<div style={{ padding: '16px 28px 8px' }}>
					<Typography.Title level={4} style={{ margin: 0, color: '#102540' }}>{s.title}</Typography.Title>
				</div>

				{/* Module Objective - gold bordered box */}
				{s.snapshot && (
					<div style={{ margin: '8px 28px 16px', padding: '14px 18px', border: '2px solid #c9a227', borderRadius: 8, background: '#fffef5' }}>
						<Typography.Text style={{ fontSize: 13, color: '#102540', lineHeight: 1.7 }}>
							<strong>Learning Module Objective:</strong> {safeRender(s.snapshot)}
						</Typography.Text>
					</div>
				)}

				{/* LOS SNAPSHOT - horizontal pills */}
				{losItems.length > 0 && (
					<div style={{ padding: '0 28px 20px' }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 1 }}>LOS SNAPSHOT</Typography.Text>
						<div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
							{losItems.map((d, i) => (
								<div key={i} style={{ flex: '1 1 160px', maxWidth: 220, padding: '10px 14px', background: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: 8, textAlign: 'center' }}>
									<div style={{ fontSize: 12, color: '#374151', lineHeight: 1.4 }}>{safeRender(d.statement || d.definition)}</div>
								</div>
							))}
						</div>
					</div>
				)}

				{/* TOPIC-TO-OBJECTIVE CONCEPT MAP - visual diagram */}
				{conceptMap.length > 0 && (
					<div style={{ padding: '0 28px 24px' }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 1 }}>TOPIC-TO-OBJECTIVE CONCEPT MAP</Typography.Text>
						<div style={{ marginTop: 14, position: 'relative', padding: '20px 0' }}>
							{/* Central module node */}
							<div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
								<div style={{ background: '#102540', color: '#fff', padding: '16px 24px', borderRadius: 10, textAlign: 'center', maxWidth: 380 }}>
									<div style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase' }}>{safeRender(s.module?.name || s.title)}</div>
									{s.snapshot && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{s.snapshot.length > 80 ? s.snapshot.substring(0, 80) + '...' : safeRender(s.snapshot)}</div>}
								</div>
							</div>
							{/* Arrow connector */}
							<div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
								<div style={{ width: 2, height: 24, background: '#102540' }} />
							</div>
							{/* Topic boxes grid */}
							<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
								{conceptMap.map((node, i) => (
									<div key={i} style={{ border: '2px solid #102540', borderRadius: 10, padding: '14px 16px', background: '#fff' }}>
										<div style={{ fontSize: 12, fontWeight: 800, color: '#102540', textTransform: 'uppercase', marginBottom: 4 }}>
											{i + 1}. {safeRender(node.topic)}
										</div>
										{Array.isArray(node.subtopics) && (
											<div style={{ fontSize: 12, color: '#102540', fontWeight: 600 }}>
												{node.subtopics.map(s => safeRender(s)).join(' | ')}
											</div>
										)}
										{node.connectionTo && (
											<div style={{ fontSize: 11, color: '#64748b', marginTop: 6, fontStyle: 'italic' }}>
												{safeRender(node.connectionTo)}
											</div>
										)}
									</div>
								))}
							</div>
						</div>
					</div>
				)}
			</div>

			{/* ═══════════ PAGE 2: Exam Decision Map + Formula Strip ═══════════ */}
			<div style={{ background: '#fff' }}>
				{/* Page 2 Header */}
				<div style={{ background: '#102540', padding: '12px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
					<div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
						<Typography.Text style={{ color: '#fff', fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>MILVEN</Typography.Text>
						<Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>FINANCE SCHOOL</Typography.Text>
					</div>
					<Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Diagrammatic Revision Page</Typography.Text>
				</div>
				<div style={{ padding: '12px 28px 4px' }}>
					<Typography.Title level={5} style={{ margin: 0, color: '#102540' }}>
						{safeRender(s.module?.name || s.title)} | Exam Decision Map + Formula Strip
					</Typography.Title>
				</div>

				<div style={{ padding: '16px 28px 24px', display: 'grid', gridTemplateColumns: topicMap.length > 0 ? '1fr 1fr' : '1fr', gap: 24 }}>
					{/* Left: EXAM LOGIC DECISION MAP (vertical flowchart) */}
					{topicMap.length > 0 && (
						<div>
							<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 1 }}>EXAM LOGIC DECISION MAP</Typography.Text>
							<div style={{ marginTop: 12 }}>
								{topicMap.map((t, i) => (
									<div key={i}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
											{/* Question node (navy rounded) */}
											<div style={{ flex: '0 0 160px', padding: '10px 14px', border: '2px solid #102540', borderRadius: 20, background: '#fff', fontSize: 12, fontWeight: 600, color: '#102540', textAlign: 'center' }}>
												{safeRender(t.topic || t.hook)}
											</div>
											{/* Arrow */}
											<div style={{ flex: '0 0 30px', textAlign: 'center', color: '#c9a227', fontSize: 16, fontWeight: 700 }}>→</div>
											{/* Answer node (gold rounded) */}
											<div style={{ flex: 1, padding: '10px 14px', border: '2px solid #c9a227', borderRadius: 20, background: '#fffef5', fontSize: 12, color: '#374151' }}>
												{Array.isArray(t.concepts) ? t.concepts.join(' | ') : safeRender(t.concepts || '')}
											</div>
										</div>
										{/* Vertical connector */}
										{i < topicMap.length - 1 && (
											<div style={{ marginLeft: 80, width: 2, height: 16, background: '#102540', marginBottom: 4 }} />
										)}
									</div>
								))}
							</div>
						</div>
					)}

					{/* Right column: Formula Strip + Decision Rules + Exam Traps */}
					<div>
						{/* FORMULA STRIP */}
						{formulas.length > 0 && (
							<div style={{ marginBottom: 20 }}>
								<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 1 }}>FORMULA STRIP</Typography.Text>
								<div style={{ marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
									{formulas.map((f, i) => (
										<div key={i} style={{ display: 'flex', padding: '8px 14px', borderBottom: i < formulas.length - 1 ? '1px solid #e2e8f0' : 'none', background: i % 2 === 0 ? '#fff' : '#f8f9fa' }}>
											<div style={{ flex: '0 0 45%', fontSize: 13, fontWeight: 600, color: '#102540' }}>{safeRender(f.useCase || f.whenToUse || '')}</div>
											<div style={{ flex: 1, fontFamily: "'Cambria Math', Georgia, serif", fontSize: 14, color: '#102540' }}><MathText text={f.formula} /></div>
										</div>
									))}
								</div>
							</div>
						)}

						{/* DECISION RULES */}
						{rules.length > 0 && (
							<div style={{ marginBottom: 20 }}>
								<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 1 }}>DECISION RULES</Typography.Text>
								<div style={{ marginTop: 8, padding: '12px 16px', background: '#f8f9fa', borderRadius: 8, border: '1px solid #e2e8f0' }}>
									{rules.map((d, i) => (
										<div key={i} style={{ fontSize: 12, color: '#374151', marginTop: i > 0 ? 6 : 0, lineHeight: 1.5 }}>
											• <strong>{safeRender(d.scenario || d.left)}:</strong> {safeRender(d.rule || d.right)}
										</div>
									))}
								</div>
							</div>
						)}

						{/* EXAM TRAPS */}
						{traps.length > 0 && (
							<div style={{ marginBottom: 20 }}>
								<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 1 }}>EXAM TRAPS</Typography.Text>
								<div style={{ marginTop: 8, padding: '12px 16px', background: '#fef3c7', borderRadius: 8, border: '1px solid #f59e0b' }}>
									{traps.map((t, i) => (
										<div key={i} style={{ fontSize: 12, color: '#92400e', marginTop: i > 0 ? 6 : 0, lineHeight: 1.5 }}>
											• {safeRender(t.trap)}
										</div>
									))}
								</div>
							</div>
						)}
					</div>
				</div>

				{/* FINAL CHECKLIST BEFORE QUESTIONS */}
				{checks.length > 0 && (
					<div style={{ margin: '0 28px 24px', padding: '16px 20px', background: '#f0f4f8', borderRadius: 10, border: '2px solid #102540' }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 1 }}>FINAL CHECKLIST BEFORE QUESTIONS</Typography.Text>
						<div style={{ marginTop: 10, fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
							Can you: {checks.map(c => safeRender(c.item)).join('; ')}?
						</div>
					</div>
				)}

				{/* Footer */}
				<div style={{ padding: '12px 28px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', background: '#f8fafc' }}>
					<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>Milven Finance School | Diagrammatic Revision Dashboard {s.year}</Typography.Text>
					<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>Simplified. Exam-focused. Built to help you pass.</Typography.Text>
				</div>
			</div>
		</div>
	);
}

export default StudentSummarySheets;
