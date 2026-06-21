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
							<Typography.Title level={4} style={{ margin: 0, color: '#102540' }}>Summary Sheets</Typography.Title>
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
	const defs = Array.isArray(s.coreDefinitions) ? s.coreDefinitions : [];
	const formulas = Array.isArray(s.formulas) ? s.formulas : [];
	const distinctions = Array.isArray(s.distinctions) ? s.distinctions : [];
	const traps = Array.isArray(s.examTraps) ? s.examTraps : [];
	const hooks = Array.isArray(s.memoryHooks) ? s.memoryHooks : [];
	const drills = Array.isArray(s.quickDrills) ? s.quickDrills : [];
	const checks = Array.isArray(s.revisionCheck) ? s.revisionCheck : [];

	return (
		<div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden' }}>
			<div style={{ background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', padding: '24px 28px' }}>
				<Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5 }}>
					{LEVEL_LABELS[s.level]} {s.volume?.name ? `| ${s.volume.name}` : ''} {s.module?.name ? `| ${s.module.name}` : ''}
				</Typography.Text>
				<Typography.Title level={3} style={{ margin: '4px 0 0', color: '#fff' }}>{s.title}</Typography.Title>
				<div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
					<Tag style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 11 }}>Milven Summary Sheet</Tag>
					<Tag style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 11 }}>{s.year} Edition</Tag>
				</div>
			</div>

			{(s.snapshot || s.useCase) && (<div style={{ padding: '16px 28px', background: '#f0f4f8', borderBottom: '1px solid #e2e8f0' }}>{s.snapshot && <div style={{ color: '#374151', fontSize: 14, lineHeight: 1.6 }}>{safeRender(s.snapshot)}</div>}{s.useCase && <div style={{ color: '#3b82f6', fontSize: 12, marginTop: 4 }}><strong>Use case:</strong> {safeRender(s.useCase)}</div>}</div>)}

			<div style={{ padding: '20px 28px' }}>
				{defs.length > 0 && (<div style={{ marginBottom: 20 }}><Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540' }}>Key Definitions</Typography.Text><div style={{ marginTop: 8 }}>{defs.map((d, i) => (<div key={i} style={{ display: 'flex', gap: 12, padding: '8px 12px', background: i % 2 === 0 ? '#f8fafc' : '#fff', borderRadius: 8, border: '1px solid #f0f0f0' }}><span style={{ fontWeight: 700, color: '#102540', minWidth: 140, flexShrink: 0, fontSize: 13 }}>{safeRender(d.term)}</span><span style={{ color: '#374151', fontSize: 13 }}>{safeRender(d.definition)}</span></div>))}</div></div>)}

				{formulas.length > 0 && (<div style={{ marginBottom: 20, background: '#f0f4f8', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0' }}><Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540' }}>Formula Zone</Typography.Text><table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse' }}><thead><tr style={{ borderBottom: '2px solid #cbd5e1' }}><th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Formula</th><th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Variables</th><th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>When to Use</th></tr></thead><tbody>{formulas.map((f, i) => (<tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={{ padding: '8px', fontFamily: "'Cambria Math', Georgia, serif", fontSize: 15, fontWeight: 600, color: '#102540' }}><MathText text={f.formula} /></td><td style={{ padding: '8px', fontSize: 12, color: '#475569' }}><MathVariables text={safeRender(f.variables)} /></td><td style={{ padding: '8px', fontSize: 12, color: '#3b82f6' }}>{safeRender(f.whenToUse)}</td></tr>))}</tbody></table></div>)}

				{distinctions.length > 0 && (<div style={{ marginBottom: 20 }}><Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540' }}>Compare & Distinguish</Typography.Text><div style={{ marginTop: 8 }}>{distinctions.map((d, i) => (<div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}><div style={{ padding: '10px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}><Typography.Text strong style={{ color: '#1d4ed8', fontSize: 13 }}>{safeRender(d.left)}</Typography.Text></div><div style={{ padding: '10px 14px', background: '#fef3c7', borderRadius: 8, border: '1px solid #fcd34d' }}><Typography.Text strong style={{ color: '#92400e', fontSize: 13 }}>{safeRender(d.right)}</Typography.Text></div>{d.difference && <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#64748b', paddingLeft: 14, fontStyle: 'italic' }}>{safeRender(d.difference)}</div>}</div>))}</div></div>)}

				<Row gutter={16} style={{ marginBottom: 20 }}>
					{traps.length > 0 && (<Col span={12}><div style={{ padding: '14px 18px', background: '#fef3c7', borderRadius: 10, borderLeft: '4px solid #f59e0b', height: '100%' }}><Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#92400e' }}>Exam Traps</Typography.Text>{traps.map((t, i) => (<div key={i} style={{ fontSize: 13, color: '#92400e', marginTop: 6, lineHeight: 1.5 }}>⚠ {safeRender(t.trap)}</div>))}</div></Col>)}
					{hooks.length > 0 && (<Col span={12}><div style={{ padding: '14px 18px', background: '#f0fdf4', borderRadius: 10, borderLeft: '4px solid #22c55e', height: '100%' }}><Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#166534' }}>Memory Hooks</Typography.Text>{hooks.map((h, i) => (<div key={i} style={{ fontSize: 13, color: '#166534', marginTop: 6, lineHeight: 1.5 }}>💡 {safeRender(h.hook)}</div>))}</div></Col>)}
				</Row>

				{drills.length > 0 && (<div style={{ marginBottom: 20, padding: '14px 18px', background: '#eff6ff', borderRadius: 10, borderLeft: '4px solid #3b82f6' }}><Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#1d4ed8' }}>Quick Drills</Typography.Text>{drills.map((d, i) => (<div key={i} style={{ fontSize: 13, color: '#1e3a5a', marginTop: 6 }}><strong>{i + 1}.</strong> {safeRender(d.question)}</div>))}</div>)}

				{checks.length > 0 && (<div style={{ padding: '14px 18px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}><Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540' }}>Revision Check</Typography.Text><div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>{checks.map((c, i) => (<div key={i} style={{ padding: '6px 12px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}>☐ {safeRender(c.item)}</div>))}</div></div>)}
			</div>

			<div style={{ padding: '12px 28px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', background: '#f8fafc' }}>
				<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>Milven Finance School | Summary Sheet {s.year}</Typography.Text>
				<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>Simplified. Exam-focused. Built to help you pass.</Typography.Text>
			</div>
		</div>
	);
}

export default StudentSummarySheets;
