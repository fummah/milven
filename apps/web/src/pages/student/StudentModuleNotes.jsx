import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Typography, Select, Input, Tag, Space, Spin, Empty, Button, Row, Col, Card, Modal, Grid } from 'antd';
import { BookOutlined, SearchOutlined, ClockCircleOutlined, ThunderboltOutlined, CalculatorOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

const LEVELS = [
	{ value: 'LEVEL1', label: 'Level I' },
	{ value: 'LEVEL2', label: 'Level II' },
	{ value: 'LEVEL3', label: 'Level III' },
];
const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };

// ─── Safe render: stringify objects that React can't render ──
function safeRender(val) {
	if (val === null || val === undefined) return '';
	if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
	if (typeof val === 'object') {
		try { return JSON.stringify(val); } catch { return String(val); }
	}
	return String(val);
}

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
	const [filterLevel, setFilterLevel] = useState(null);
	const [filterCourseId, setFilterCourseId] = useState(null);
	const [filterVolumeId, setFilterVolumeId] = useState(null);
	const [filterModuleId, setFilterModuleId] = useState(null);
	const [filterTopicId, setFilterTopicId] = useState(null);
	const [searchText, setSearchText] = useState('');
	const [page, setPage] = useState(1);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewNote, setPreviewNote] = useState(null);

	useEffect(() => {
		api.get('/api/learning/courses/public').then(r => setCourses(r.data?.courses || [])).catch(() => {});
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

	const fetchNotes = useCallback(async () => {
		setLoading(true);
		try {
			const params = { page, limit: 50, status: 'PUBLISHED' };
			if (filterLevel) params.level = filterLevel;
			if (filterCourseId) params.courseId = filterCourseId;
			if (filterVolumeId) params.volumeId = filterVolumeId;
			if (filterModuleId) params.moduleId = filterModuleId;
			if (filterTopicId) params.topicId = filterTopicId;
			if (searchText) params.search = searchText;
			const res = await api.get('/api/module-notes', { params });
			setNotes(res.data?.notes || []);
			setTotal(res.data?.total || 0);
		} catch { } finally { setLoading(false); }
	}, [page, filterLevel, filterCourseId, filterVolumeId, filterModuleId, filterTopicId, searchText]);

	useEffect(() => { fetchNotes(); }, [fetchNotes]);

	return (
		<div>
			{/* Header */}
			<div style={{ marginBottom: 24 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
					<div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
						<BookOutlined style={{ fontSize: 22, color: '#fff' }} />
					</div>
					<div>
						<Typography.Title level={3} style={{ margin: 0, color: '#102540' }}>Module Notes</Typography.Title>
						<Typography.Text type="secondary">Premium exam-focused learning module notes</Typography.Text>
					</div>
				</div>
			</div>

			{/* Filters */}
			<Card size="small" style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
				<Row gutter={[12, 12]} align="middle">
					<Col xs={24} sm={8} md={5}><Input prefix={<SearchOutlined />} placeholder="Search…" value={searchText} onChange={e => { setSearchText(e.target.value); setPage(1); }} allowClear /></Col>
					<Col xs={12} sm={6} md={3}><Select placeholder="Level" value={filterLevel} onChange={v => { setFilterLevel(v); setPage(1); }} options={[{ value: null, label: 'All Levels' }, ...LEVELS]} style={{ width: '100%' }} allowClear /></Col>
					<Col xs={12} sm={6} md={4}><Select placeholder="Course" value={filterCourseId} onChange={v => { setFilterCourseId(v); setFilterVolumeId(null); setFilterModuleId(null); setFilterTopicId(null); setPage(1); }} options={[{ value: null, label: 'All Courses' }, ...courses.map(c => ({ value: c.id, label: c.name }))]} style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" /></Col>
					<Col xs={12} sm={6} md={4}><Select placeholder="Volume" value={filterVolumeId} onChange={v => { setFilterVolumeId(v); setFilterModuleId(null); setFilterTopicId(null); setPage(1); }} options={[{ value: null, label: 'All Volumes' }, ...filteredVolumes.map(v => ({ value: v.id, label: v.name }))]} style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" /></Col>
					<Col xs={12} sm={6} md={4}><Select placeholder="Module" value={filterModuleId} onChange={v => { setFilterModuleId(v); setFilterTopicId(null); setPage(1); }} options={[{ value: null, label: 'All Modules' }, ...filteredModules.map(m => ({ value: m.id, label: m.name }))]} style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" /></Col>
					<Col xs={12} sm={6} md={4}><Select placeholder="Topic" value={filterTopicId} onChange={v => { setFilterTopicId(v); setPage(1); }} options={[{ value: null, label: 'All Topics' }, ...filteredTopics.map(t => ({ value: t.id, label: t.name }))]} style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" /></Col>
				</Row>
			</Card>

			{/* Grid */}
			{loading ? (
				<div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
			) : notes.length === 0 ? (
				<Empty description="No module notes available" style={{ padding: 60 }} />
			) : (
				<>
					<Row gutter={[16, 16]}>
						{notes.map(n => (
							<Col xs={24} sm={12} lg={8} key={n.id}>
								<Card
									hoverable
									style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', height: '100%' }}
									bodyStyle={{ padding: 0 }}
									onClick={() => { setPreviewNote(n); setPreviewOpen(true); }}
								>
									<div style={{ background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', padding: '16px 20px' }}>
										<Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
											{LEVEL_LABELS[n.level]} {n.volume?.name ? `| ${n.volume.name}` : ''}
										</Typography.Text>
										<Typography.Title level={5} style={{ color: '#fff', margin: '4px 0 0' }}>{n.title}</Typography.Title>
									</div>
									<div style={{ padding: '12px 20px' }}>
										<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
											{n.studyTime && <Tag icon={<ClockCircleOutlined />} style={{ fontSize: 11 }}>{n.studyTime}</Tag>}
											{n.difficulty && <Tag color="blue" style={{ fontSize: 11 }}>{n.difficulty}</Tag>}
											{n.calculatorUse && <Tag color="geekblue" style={{ fontSize: 11 }}>Calc: {n.calculatorUse}</Tag>}
										</div>
										{n.overview && <div style={{ color: '#475569', fontSize: 13, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.overview}</div>}
										<div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
											{Array.isArray(n.concepts) && <Tag style={{ fontSize: 10 }}>{n.concepts.length} concepts</Tag>}
											{Array.isArray(n.formulaRecap) && <Tag style={{ fontSize: 10 }}>{n.formulaRecap.length} formulas</Tag>}
											{Array.isArray(n.practiceSet) && <Tag style={{ fontSize: 10 }}>{n.practiceSet.length} practice Q</Tag>}
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
								<Button disabled={notes.length < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
							</Space>
						</div>
					)}
				</>
			)}

			{/* Preview Modal */}
			<Modal open={previewOpen} onCancel={() => { setPreviewOpen(false); setPreviewNote(null); }} footer={null} width={isMobile ? '95%' : 1100} centered title={null} styles={{ body: { padding: 0 } }}>
				{previewNote && <ModuleNoteView note={previewNote} />}
			</Modal>
		</div>
	);
}

function ModuleNoteView({ note }) {
	const n = note;
	const los = Array.isArray(n.losStatements) ? n.losStatements : [];
	const concepts = Array.isArray(n.concepts) ? n.concepts : [];
	const formulas = Array.isArray(n.formulaRecap) ? n.formulaRecap : [];
	const practiceSet = Array.isArray(n.practiceSet) ? n.practiceSet : [];
	const solutions = Array.isArray(n.workedSolutions) ? n.workedSolutions : [];
	const checks = Array.isArray(n.revisionCheck) ? n.revisionCheck : [];

	return (
		<div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden' }}>
			{/* Module Divider */}
			<div style={{ background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', padding: '28px 32px' }}>
				<Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5 }}>LEARNING MODULE</Typography.Text>
				<Typography.Title level={2} style={{ margin: '4px 0 0', color: '#fff' }}>{n.title}</Typography.Title>
				<Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
					{LEVEL_LABELS[n.level]} {n.volume?.name ? `| ${n.volume.name}` : ''} {n.module?.name ? `| ${n.module.name}` : ''}
				</Typography.Text>
				<div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
					<Tag style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff' }}>{n.year} Edition</Tag>
				</div>
			</div>

			{/* Identity Strip */}
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderBottom: '1px solid #e2e8f0' }}>
				{[{ label: 'Study Time', value: n.studyTime }, { label: 'Difficulty', value: n.difficulty }, { label: 'Calculator Use', value: n.calculatorUse }].map((item, i) => (
					<div key={i} style={{ padding: '12px 20px', borderRight: i < 2 ? '1px solid #e2e8f0' : 'none', textAlign: 'center' }}>
						<div style={{ fontSize: 10, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: 1 }}>{item.label}</div>
						<div style={{ fontSize: 14, fontWeight: 600, color: '#102540', marginTop: 2 }}>{item.value || '—'}</div>
					</div>
				))}
			</div>

			{/* Overview */}
			{n.overview && <div style={{ padding: '16px 32px', background: '#f0f4f8', borderBottom: '1px solid #e2e8f0' }}><div style={{ color: '#374151', fontSize: 14, lineHeight: 1.6 }}>{safeRender(n.overview)}</div></div>}

			<div style={{ padding: '24px 32px' }}>
				{/* LOS */}
				{los.length > 0 && (
					<div style={{ marginBottom: 24 }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 0.5 }}>Learning Outcome Statements</Typography.Text>
						<table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse' }}>
							<thead><tr style={{ borderBottom: '2px solid #cbd5e1' }}><th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b' }}>LOS</th><th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b' }}>Statement</th><th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b' }}>Command</th></tr></thead>
							<tbody>{los.map((l, i) => (<tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={{ padding: '8px', fontWeight: 600, color: '#102540', fontSize: 13 }}>{safeRender(l.ref)}</td><td style={{ padding: '8px', fontSize: 13, color: '#374151' }}>{safeRender(l.statement)}</td><td style={{ padding: '8px' }}><Tag color="blue" style={{ fontSize: 11 }}>{safeRender(l.commandWord)}</Tag></td></tr>))}</tbody>
						</table>
					</div>
				)}

				{/* Concepts */}
				{concepts.map((c, i) => (
					<div key={i} style={{ marginBottom: 20, padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
						<Typography.Text strong style={{ fontSize: 15, color: '#102540' }}>{i + 1}. {safeRender(c.title)}</Typography.Text>
						<div style={{ marginTop: 8 }}>
							<div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}><strong>Plain-English meaning:</strong> {safeRender(c.meaning)}</div>
							{c.explanation && <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>{safeRender(c.explanation)}</div>}
							{c.formula && (
								<div style={{ background: '#f0f4f8', borderRadius: 8, padding: '12px 16px', marginBottom: 8, border: '1px solid #e2e8f0' }}>
									<Typography.Text style={{ fontSize: 10, textTransform: 'uppercase', color: '#64748b', letterSpacing: 1 }}>FORMULA</Typography.Text>
									<div style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 16, fontWeight: 600, color: '#102540', marginTop: 4 }}>{safeRender(c.formula)}</div>
									{c.formulaVariables && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{safeRender(c.formulaVariables)}</div>}
								</div>
							)}
							{c.interpretation && <div style={{ fontSize: 13, color: '#374151', marginBottom: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, borderLeft: '3px solid #3b82f6' }}><strong>Interpretation:</strong> {safeRender(c.interpretation)}</div>}
							{c.workedExample && (
								<div style={{ marginBottom: 8, padding: '10px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
									<Typography.Text strong style={{ fontSize: 12, color: '#1d4ed8' }}>Worked Example</Typography.Text>
									<div style={{ fontSize: 13, marginTop: 4 }}><strong>Given:</strong> {safeRender(c.workedExample.given)}</div>
									<div style={{ fontSize: 13 }}><strong>Required:</strong> {safeRender(c.workedExample.required)}</div>
									<div style={{ fontSize: 13 }}><strong>Solution:</strong> {safeRender(c.workedExample.solution)}</div>
									<div style={{ fontSize: 13 }}><strong>Conclusion:</strong> {safeRender(c.workedExample.conclusion)}</div>
								</div>
							)}
							<Row gutter={12}>
								{c.examTip && <Col span={12}><div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, borderLeft: '3px solid #22c55e' }}><Typography.Text strong style={{ fontSize: 11, color: '#166534' }}>EXAM TIP</Typography.Text><div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>{safeRender(c.examTip)}</div></div></Col>}
								{c.commonMistake && <Col span={12}><div style={{ padding: '8px 12px', background: '#fef3c7', borderRadius: 6, borderLeft: '3px solid #f59e0b' }}><Typography.Text strong style={{ fontSize: 11, color: '#92400e' }}>COMMON MISTAKE</Typography.Text><div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>{safeRender(c.commonMistake)}</div></div></Col>}
							</Row>
						</div>
					</div>
				))}

				{/* Module Summary */}
				{n.moduleSummary && <div style={{ marginBottom: 20, padding: '16px 20px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}><Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540' }}>Module Summary</Typography.Text><div style={{ fontSize: 13, color: '#374151', marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{safeRender(n.moduleSummary)}</div></div>}

				{/* Formula Recap */}
				{formulas.length > 0 && (
					<div style={{ marginBottom: 20, background: '#f0f4f8', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0' }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540' }}>Formula Recap</Typography.Text>
						{formulas.map((f, i) => (<div key={i} style={{ padding: '8px 0', borderBottom: i < formulas.length - 1 ? '1px solid #e2e8f0' : 'none' }}><div style={{ fontWeight: 600, color: '#102540', fontSize: 13 }}>{safeRender(f.name)}</div><div style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 15, fontWeight: 600, color: '#102540', marginTop: 2 }}>{safeRender(f.formula)}</div><div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{safeRender(f.variables)}</div></div>))}
					</div>
				)}

				{/* Practice Set */}
				{practiceSet.length > 0 && (
					<div style={{ marginBottom: 20, padding: '14px 18px', background: '#eff6ff', borderRadius: 10, borderLeft: '4px solid #3b82f6' }}>
						<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#1d4ed8' }}>Practice Set</Typography.Text>
						{practiceSet.map((q, i) => (<div key={i} style={{ fontSize: 13, color: '#1e3a5a', marginTop: 6 }}><strong>{i + 1}.</strong> {safeRender(q.question)} {q.losRef && <Tag style={{ fontSize: 10 }}>{safeRender(q.losRef)}</Tag>}</div>))}
					</div>
				)}

				{/* Worked Solutions */}
				{solutions.length > 0 && (
					<div style={{ marginBottom: 20 }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540' }}>Worked Solutions</Typography.Text>
						{solutions.map((s, i) => (<div key={i} style={{ marginTop: 8, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}><div style={{ fontWeight: 600, fontSize: 13, color: '#102540' }}>{i + 1}. {safeRender(s.question)}</div><div style={{ fontSize: 13, marginTop: 4 }}><strong>Answer:</strong> {safeRender(s.answer)}</div>{s.method && <div style={{ fontSize: 12, color: '#475569' }}><strong>Method:</strong> {safeRender(s.method)}</div>}{s.interpretation && <div style={{ fontSize: 12, color: '#3b82f6' }}><strong>Interpretation:</strong> {safeRender(s.interpretation)}</div>}{s.trap && <div style={{ fontSize: 12, color: '#92400e' }}><strong>Trap:</strong> {safeRender(s.trap)}</div>}</div>))}
					</div>
				)}

				{/* Revision Checklist */}
				{checks.length > 0 && (
					<div style={{ padding: '14px 18px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
						<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540' }}>Revision Checklist</Typography.Text>
						<div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>{checks.map((c, i) => (<div key={i} style={{ padding: '6px 12px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}>☐ {safeRender(c.item)}</div>))}</div>
					</div>
				)}
			</div>

			{/* Footer */}
			<div style={{ padding: '12px 32px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', background: '#f8fafc' }}>
				<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>Milven Finance School | Module Notes {n.year}</Typography.Text>
				<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>Simplified. Exam-focused. Built to help you pass.</Typography.Text>
			</div>
		</div>
	);
}

export default StudentModuleNotes;
