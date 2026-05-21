import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Typography, Select, Input, Tag, Space, Spin, Empty, Button, Row, Col, Card, Modal, Grid, Divider } from 'antd';
import { FileTextOutlined, SearchOutlined, EyeOutlined, PrinterOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

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

	useEffect(() => {
		api.get('/api/learning/me/courses').then(r => {
			const enrollments = r.data?.courses || [];
			setCourses(enrollments.map(e => ({ id: e.courseId, name: e.name, level: e.level })).filter(e => e.id));
		}).catch(() => {});
		api.get('/api/learning/volumes/public').then(r => setVolumes(r.data?.volumes || [])).catch(() => {});
		api.get('/api/learning/modules/public').then(r => setModules(r.data?.modules || [])).catch(() => {});
		api.get('/api/learning/topics/public').then(r => setTopics(r.data?.topics || [])).catch(() => {});
	}, []);

	const filteredVolumes = useMemo(() => {
		if (!filterCourseId) return volumes;
		return volumes.filter(v => v.courseLinks?.some(cl => cl.courseId === filterCourseId));
	}, [filterCourseId, volumes]);

	const filteredModules = useMemo(() => {
		let list = modules;
		if (filterCourseId) list = list.filter(m => m.courseId === filterCourseId);
		if (filterVolumeId) list = list.filter(m => m.volumeId === filterVolumeId);
		return list;
	}, [filterCourseId, filterVolumeId, modules]);

	const filteredTopics = useMemo(() => {
		let list = topics;
		if (filterCourseId) list = list.filter(t => t.courseId === filterCourseId);
		if (filterModuleId) list = list.filter(t => t.moduleId === filterModuleId);
		return list;
	}, [filterCourseId, filterModuleId, topics]);

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

	return (
		<div>
			{/* Header */}
			<div style={{ marginBottom: 24 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
					<div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
						<FileTextOutlined style={{ fontSize: 22, color: '#fff' }} />
					</div>
					<div>
						<Typography.Title level={3} style={{ margin: 0, color: '#102540' }}>Summary Sheets</Typography.Title>
						<Typography.Text type="secondary">High-impact revision sheets. Simplified. Exam-focused.</Typography.Text>
					</div>
				</div>
			</div>

			{/* Filters */}
			<Card size="small" style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
				<Row gutter={[12, 12]} align="middle">
					<Col xs={24} sm={8} md={6}><Input prefix={<SearchOutlined />} placeholder="Search…" value={searchText} onChange={e => { setSearchText(e.target.value); setPage(1); }} allowClear /></Col>
					<Col xs={12} sm={6} md={5}><Select placeholder="Course" value={filterCourseId} onChange={v => { setFilterCourseId(v); setFilterVolumeId(null); setFilterModuleId(null); setFilterTopicId(null); setPage(1); }} options={[{ value: null, label: 'All Courses' }, ...courses.map(c => ({ value: c.id, label: c.name }))]} style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" /></Col>
					<Col xs={12} sm={6} md={4}><Select placeholder="Volume" value={filterVolumeId} onChange={v => { setFilterVolumeId(v); setFilterModuleId(null); setFilterTopicId(null); setPage(1); }} options={[{ value: null, label: 'All Volumes' }, ...filteredVolumes.map(v => ({ value: v.id, label: v.name }))]} style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" /></Col>
					<Col xs={12} sm={6} md={4}><Select placeholder="Module" value={filterModuleId} onChange={v => { setFilterModuleId(v); setFilterTopicId(null); setPage(1); }} options={[{ value: null, label: 'All Modules' }, ...filteredModules.map(m => ({ value: m.id, label: m.name }))]} style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" /></Col>
					<Col xs={12} sm={6} md={4}><Select placeholder="Topic" value={filterTopicId} onChange={v => { setFilterTopicId(v); setPage(1); }} options={[{ value: null, label: 'All Topics' }, ...filteredTopics.map(t => ({ value: t.id, label: t.name }))]} style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" /></Col>
				</Row>
			</Card>

			{/* Grid of sheets */}
			{loading ? (
				<div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
			) : sheets.length === 0 ? (
				<Empty description="No summary sheets available" style={{ padding: 60 }} />
			) : (
				<>
					<Row gutter={[16, 16]}>
						{sheets.map(s => (
							<Col xs={24} sm={12} lg={8} key={s.id}>
								<Card
									hoverable
									style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', height: '100%' }}
									bodyStyle={{ padding: 0 }}
									onClick={() => { setPreviewSheet(s); setPreviewOpen(true); }}
								>
									{/* Card header */}
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

				{formulas.length > 0 && (<div style={{ marginBottom: 20, background: '#f0f4f8', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0' }}><Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540' }}>Formula Zone</Typography.Text><table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse' }}><thead><tr style={{ borderBottom: '2px solid #cbd5e1' }}><th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Formula</th><th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Variables</th><th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>When to Use</th></tr></thead><tbody>{formulas.map((f, i) => (<tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={{ padding: '8px', fontFamily: "'Cambria Math', Georgia, serif", fontSize: 15, fontWeight: 600, color: '#102540' }}>{safeRender(f.formula)}</td><td style={{ padding: '8px', fontSize: 12, color: '#475569' }}>{safeRender(f.variables)}</td><td style={{ padding: '8px', fontSize: 12, color: '#3b82f6' }}>{safeRender(f.whenToUse)}</td></tr>))}</tbody></table></div>)}

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
