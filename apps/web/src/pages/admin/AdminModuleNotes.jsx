import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, Form, Input, Button, Select, message, Space, Typography, Table, Modal, Drawer, Tag, Tooltip, Switch, InputNumber, Row, Col, Divider, Empty, Spin, Checkbox } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined, BookOutlined, RobotOutlined, ThunderboltOutlined, CheckCircleOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

const LEVELS = [
	{ value: 'LEVEL1', label: 'Level I' },
	{ value: 'LEVEL2', label: 'Level II' },
	{ value: 'LEVEL3', label: 'Level III' },
];
const LEVEL_COLORS = { LEVEL1: 'blue', LEVEL2: 'purple', LEVEL3: 'gold' };
const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };
const STATUS_COLORS = { DRAFT: 'default', PUBLISHED: 'green' };

export function AdminModuleNotes() {
	const [form] = Form.useForm();
	const [notes, setNotes] = useState([]);
	const [loading, setLoading] = useState(false);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(25);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [editingId, setEditingId] = useState(null);
	const [submitting, setSubmitting] = useState(false);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewNote, setPreviewNote] = useState(null);

	// AI Generate
	const [aiModalOpen, setAiModalOpen] = useState(false);
	const [aiGenerating, setAiGenerating] = useState(false);
	const [aiCourseId, setAiCourseId] = useState(null);
	const [aiVolumeId, setAiVolumeId] = useState(null);
	const [aiModuleId, setAiModuleId] = useState(null);
	const [aiTopicId, setAiTopicId] = useState(null);
	const [aiCount, setAiCount] = useState(null);
	const [aiYear, setAiYear] = useState(2026);

	// AI Preview
	const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
	const [aiPreview, setAiPreview] = useState(null);
	const [aiPreviewMeta, setAiPreviewMeta] = useState(null);
	const [aiSelectedIndices, setAiSelectedIndices] = useState([]);
	const [aiAcceptLoading, setAiAcceptLoading] = useState(false);

	// Filters
	const [filterLevel, setFilterLevel] = useState(null);
	const [filterCourseId, setFilterCourseId] = useState(null);
	const [filterStatus, setFilterStatus] = useState(null);
	const [searchText, setSearchText] = useState('');

	// Lookup data
	const [courses, setCourses] = useState([]);
	const [volumes, setVolumes] = useState([]);
	const [modules, setModules] = useState([]);
	const [topics, setTopics] = useState([]);

	const [formCourseId, setFormCourseId] = useState(null);
	const [formVolumeId, setFormVolumeId] = useState(null);
	const [formModuleId, setFormModuleId] = useState(null);

	const formVolumes = useMemo(() => !formCourseId ? volumes : volumes.filter(v => v.courseLinks?.some(cl => cl.courseId === formCourseId)), [formCourseId, volumes]);
	const formModules = useMemo(() => { let l = modules; if (formCourseId) l = l.filter(m => m.courseId === formCourseId); if (formVolumeId) l = l.filter(m => m.volumeId === formVolumeId); return l; }, [formCourseId, formVolumeId, modules]);
	const formTopics = useMemo(() => { let l = topics; if (formCourseId) l = l.filter(t => t.courseId === formCourseId); if (formModuleId) l = l.filter(t => t.moduleId === formModuleId); return l; }, [formCourseId, formModuleId, topics]);

	const aiVolumes = useMemo(() => !aiCourseId ? volumes : volumes.filter(v => v.courseLinks?.some(cl => cl.courseId === aiCourseId)), [aiCourseId, volumes]);
	const aiModules = useMemo(() => { let l = modules; if (aiCourseId) l = l.filter(m => m.courseId === aiCourseId); if (aiVolumeId) l = l.filter(m => m.volumeId === aiVolumeId); return l; }, [aiCourseId, aiVolumeId, modules]);
	const aiTopics = useMemo(() => { let l = topics; if (aiCourseId) l = l.filter(t => t.courseId === aiCourseId); if (aiModuleId) l = l.filter(t => t.moduleId === aiModuleId); return l; }, [aiCourseId, aiModuleId, topics]);

	useEffect(() => {
		api.get('/api/cms/courses').then(r => setCourses(r.data?.courses || [])).catch(() => {});
		api.get('/api/cms/volumes').then(r => setVolumes(r.data?.volumes || [])).catch(() => {});
	}, []);
	useEffect(() => { if (courses.length) { api.get('/api/cms/modules').then(r => setModules(r.data?.modules || [])).catch(() => {}); api.get('/api/cms/topics').then(r => setTopics(r.data?.topics || [])).catch(() => {}); } }, [courses]);

	const fetchNotes = useCallback(async () => {
		setLoading(true);
		try {
			const params = { page, limit: pageSize };
			if (filterLevel) params.level = filterLevel;
			if (filterCourseId) params.courseId = filterCourseId;
			if (filterStatus) params.status = filterStatus;
			if (searchText) params.search = searchText;
			const res = await api.get('/api/module-notes', { params });
			setNotes(res.data?.notes || []);
			setTotal(res.data?.total || 0);
		} catch { message.error('Failed to load module notes'); } finally { setLoading(false); }
	}, [page, pageSize, filterLevel, filterCourseId, filterStatus, searchText]);

	useEffect(() => { fetchNotes(); }, [fetchNotes]);

	const openCreate = () => { setEditingId(null); form.resetFields(); form.setFieldsValue({ level: 'LEVEL1', order: 0, status: 'DRAFT', year: 2026 }); setFormCourseId(null); setFormVolumeId(null); setFormModuleId(null); setDrawerOpen(true); };

	const openEdit = (record) => {
		setEditingId(record.id);
		form.setFieldsValue({ title: record.title, level: record.level, courseId: record.courseId, volumeId: record.volumeId, moduleId: record.moduleId, topicId: record.topicId, year: record.year || 2026, studyTime: record.studyTime || '', difficulty: record.difficulty || '', calculatorUse: record.calculatorUse || '', overview: record.overview || '', moduleSummary: record.moduleSummary || '', order: record.order || 0, status: record.status || 'DRAFT' });
		setFormCourseId(record.courseId); setFormVolumeId(record.volumeId); setFormModuleId(record.moduleId);
		setDrawerOpen(true);
	};

	const handleSubmit = async () => {
		try {
			const values = await form.validateFields();
			setSubmitting(true);
			if (editingId) { await api.put(`/api/module-notes/${editingId}`, values); message.success('Module note updated'); }
			else { await api.post('/api/module-notes', values); message.success('Module note created'); }
			setDrawerOpen(false); fetchNotes();
		} catch (err) { if (err?.errorFields) return; message.error(err?.response?.data?.error || 'Failed to save'); } finally { setSubmitting(false); }
	};

	const handleDelete = (id) => { Modal.confirm({ title: 'Delete Module Note', content: 'This cannot be undone.', okText: 'Delete', okType: 'danger', onOk: async () => { try { await api.delete(`/api/module-notes/${id}`); message.success('Deleted'); fetchNotes(); } catch { message.error('Failed to delete'); } } }); };

	const toggleStatus = async (record) => { try { const s = record.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'; await api.put(`/api/module-notes/${record.id}`, { status: s }); message.success(s === 'PUBLISHED' ? 'Published' : 'Moved to draft'); fetchNotes(); } catch { message.error('Failed to update status'); } };

	const handleAiGenerate = async () => {
		if (!aiCourseId) return message.warning('Please select a course');
		setAiGenerating(true);
		try {
			const selectedCourse = courses.find(c => c.id === aiCourseId);
			if (!selectedCourse) return message.warning('Course not found');
			const payload = { courseId: aiCourseId, volumeId: aiVolumeId || undefined, moduleId: aiModuleId || undefined, topicId: aiTopicId || undefined, level: selectedCourse.level, year: aiYear, count: aiCount || undefined };
			Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
			const res = await api.post('/api/module-notes/generate-ai/preview', payload);
			const gen = res.data?.generated || null;
			setAiPreview(gen); setAiPreviewMeta(res.data?.meta || payload);
			setAiSelectedIndices(Array.from({ length: (gen?.items || []).length }, (_, i) => i));
			setAiPreviewOpen(true);
		} catch (err) { message.error(err?.response?.data?.error || 'AI generation failed'); } finally { setAiGenerating(false); }
	};

	const acceptAiPreview = async (indices) => {
		if (!aiPreview?.items) return;
		const toSend = indices || aiSelectedIndices;
		if (!toSend?.length) { message.warning('Select at least one note'); return; }
		try {
			setAiAcceptLoading(true);
			const { data } = await api.post('/api/module-notes/generate-ai/accept', { generated: aiPreview, meta: aiPreviewMeta, selectedIndices: toSend });
			message.success(`Saved ${data?.created ?? 0} module note(s)`);
			setAiPreviewOpen(false); setAiModalOpen(false); setAiSelectedIndices([]); fetchNotes();
		} catch (err) { message.error(err?.response?.data?.error || 'Failed to save'); } finally { setAiAcceptLoading(false); }
	};

	const columns = [
		{ title: 'Title', dataIndex: 'title', key: 'title', width: 260, render: (t) => <span style={{ fontWeight: 600, color: '#102540' }}>{t}</span> },
		{ title: 'Level', dataIndex: 'level', key: 'level', width: 90, render: (l) => <Tag color={LEVEL_COLORS[l]}>{LEVEL_LABELS[l]}</Tag> },
		{ title: 'Volume', key: 'volume', width: 140, render: (_, r) => r.volume?.name || <Typography.Text type="secondary">—</Typography.Text> },
		{ title: 'Module', key: 'module', width: 160, render: (_, r) => r.module?.name || <Typography.Text type="secondary">—</Typography.Text> },
		{ title: 'Difficulty', dataIndex: 'difficulty', key: 'difficulty', width: 110, render: (d) => d ? <Tag>{d}</Tag> : '—' },
		{ title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: (s) => <Tag color={STATUS_COLORS[s]}>{s}</Tag> },
		{
			title: 'Actions', key: 'actions', width: 180, fixed: 'right',
			render: (_, record) => (
				<Space size={4}>
					<Tooltip title="Preview"><Button size="small" type="text" icon={<EyeOutlined />} onClick={() => { setPreviewNote(record); setPreviewOpen(true); }} /></Tooltip>
					<Tooltip title="Edit"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} /></Tooltip>
					<Tooltip title={record.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}><Button size="small" type="text" icon={record.status === 'PUBLISHED' ? <StarFilled style={{ color: '#22c55e' }} /> : <StarOutlined />} onClick={() => toggleStatus(record)} /></Tooltip>
					<Tooltip title="Delete"><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} /></Tooltip>
				</Space>
			),
		},
	];

	return (
		<div>
			{/* Header */}
			<div style={{ marginBottom: 24 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
					<div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
						<BookOutlined style={{ fontSize: 22, color: '#fff' }} />
					</div>
					<div>
						<Typography.Title level={3} style={{ margin: 0, color: '#102540' }}>CFA Learning Module Notes</Typography.Title>
						<Typography.Text type="secondary">Premium exam-focused learning module notes</Typography.Text>
					</div>
				</div>
			</div>

			{/* Filters */}
			<Card size="small" style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
				<Row gutter={[12, 12]} align="middle">
					<Col xs={24} sm={12} md={4}><Input prefix={<SearchOutlined />} placeholder="Search notes…" value={searchText} onChange={e => { setSearchText(e.target.value); setPage(1); }} allowClear /></Col>
					<Col xs={12} sm={6} md={3}><Select placeholder="Level" value={filterLevel} onChange={v => { setFilterLevel(v); setPage(1); }} options={[{ value: null, label: 'All Levels' }, ...LEVELS]} style={{ width: '100%' }} allowClear /></Col>
					<Col xs={12} sm={6} md={4}><Select placeholder="Course" value={filterCourseId} onChange={v => { setFilterCourseId(v); setPage(1); }} options={[{ value: null, label: 'All Courses' }, ...courses.map(c => ({ value: c.id, label: c.name }))]} style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" /></Col>
					<Col xs={12} sm={6} md={3}><Select placeholder="Status" value={filterStatus} onChange={v => { setFilterStatus(v); setPage(1); }} options={[{ value: null, label: 'All' }, { value: 'DRAFT', label: 'Draft' }, { value: 'PUBLISHED', label: 'Published' }]} style={{ width: '100%' }} allowClear /></Col>
					<Col xs={24} sm={12} md={6} style={{ textAlign: 'right' }}>
						<Space>
							<Button icon={<RobotOutlined />} onClick={() => setAiModalOpen(true)} style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', borderColor: '#8b5cf6', color: '#fff' }}>AI Generate</Button>
							<Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ background: '#102540', borderColor: '#102540' }}>Add Note</Button>
						</Space>
					</Col>
				</Row>
			</Card>

			{/* Table */}
			<Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
				<Table dataSource={notes} columns={columns} rowKey="id" loading={loading} scroll={{ x: 1000 }} pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: ['10', '25', '50'], onChange: (p, ps) => { setPage(p); setPageSize(ps); }, showTotal: (t) => <span style={{ color: '#64748b' }}>{t} note{t !== 1 ? 's' : ''}</span> }} />
			</Card>

			{/* Create/Edit Drawer */}
			<Drawer title={editingId ? 'Edit Module Note' : 'Create Module Note'} placement="right" width={Math.min(680, typeof window !== 'undefined' ? window.innerWidth * 0.9 : 680)} open={drawerOpen} onClose={() => setDrawerOpen(false)}
				extra={<Space><Button onClick={() => setDrawerOpen(false)}>Cancel</Button><Button type="primary" loading={submitting} onClick={handleSubmit} style={{ background: '#102540', borderColor: '#102540' }}>{editingId ? 'Update' : 'Create'}</Button></Space>}>
				<Form form={form} layout="vertical" autoComplete="off">
					<Form.Item name="title" label="Title" rules={[{ required: true }]}><Input placeholder="e.g. Rates and Returns" /></Form.Item>
					<Row gutter={12}>
						<Col span={8}><Form.Item name="level" label="CFA Level" rules={[{ required: true }]}><Select options={LEVELS} /></Form.Item></Col>
						<Col span={8}><Form.Item name="year" label="Year"><InputNumber min={2020} max={2040} style={{ width: '100%' }} /></Form.Item></Col>
						<Col span={8}><Form.Item name="order" label="Order"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
					</Row>
					<Row gutter={12}>
						<Col span={12}><Form.Item name="courseId" label="Course"><Select placeholder="Select course" options={courses.map(c => ({ value: c.id, label: c.name }))} allowClear showSearch optionFilterProp="label" onChange={v => { setFormCourseId(v); form.setFieldsValue({ volumeId: null, moduleId: null, topicId: null }); setFormVolumeId(null); setFormModuleId(null); }} /></Form.Item></Col>
						<Col span={12}><Form.Item name="volumeId" label="Volume"><Select placeholder="Select volume" options={formVolumes.map(v => ({ value: v.id, label: v.name }))} allowClear showSearch optionFilterProp="label" onChange={v => { setFormVolumeId(v); form.setFieldsValue({ moduleId: null, topicId: null }); setFormModuleId(null); }} /></Form.Item></Col>
					</Row>
					<Row gutter={12}>
						<Col span={12}><Form.Item name="moduleId" label="Learning Module"><Select placeholder="Select module" options={formModules.map(m => ({ value: m.id, label: m.name }))} allowClear showSearch optionFilterProp="label" onChange={v => { setFormModuleId(v); form.setFieldsValue({ topicId: null }); }} /></Form.Item></Col>
						<Col span={12}><Form.Item name="topicId" label="Topic"><Select placeholder="Select topic" options={formTopics.map(t => ({ value: t.id, label: t.name }))} allowClear showSearch optionFilterProp="label" /></Form.Item></Col>
					</Row>
					<Divider style={{ margin: '8px 0 16px' }} />
					<Row gutter={12}>
						<Col span={8}><Form.Item name="studyTime" label="Study Time"><Input placeholder="e.g. 2.5 hours" /></Form.Item></Col>
						<Col span={8}><Form.Item name="difficulty" label="Difficulty"><Select placeholder="Select" options={[{ value: 'Foundational', label: 'Foundational' }, { value: 'Intermediate', label: 'Intermediate' }, { value: 'Advanced', label: 'Advanced' }]} allowClear /></Form.Item></Col>
						<Col span={8}><Form.Item name="calculatorUse" label="Calculator Use"><Select placeholder="Select" options={[{ value: 'Minimal', label: 'Minimal' }, { value: 'Moderate', label: 'Moderate' }, { value: 'Heavy', label: 'Heavy' }]} allowClear /></Form.Item></Col>
					</Row>
					<Form.Item name="overview" label="Overview"><Input.TextArea rows={3} placeholder="Why this module matters…" /></Form.Item>
					<Form.Item name="moduleSummary" label="Module Summary"><Input.TextArea rows={3} placeholder="Key ideas, exam traps, memory triggers…" /></Form.Item>
					<Form.Item name="status" label="Status"><Select options={[{ value: 'DRAFT', label: 'Draft' }, { value: 'PUBLISHED', label: 'Published' }]} /></Form.Item>
				</Form>
			</Drawer>

			{/* AI Generate Modal */}
			<Modal title={<Space><div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><RobotOutlined style={{ fontSize: 18, color: '#fff' }} /></div><div><div style={{ fontWeight: 700, color: '#102540', fontSize: 16 }}>AI Module Notes Generator</div><div style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>Generate full learning module notes with AI</div></div></Space>} open={aiModalOpen} onCancel={() => { if (!aiGenerating) setAiModalOpen(false); }} width={640} centered footer={<Space><Button onClick={() => setAiModalOpen(false)} disabled={aiGenerating}>Cancel</Button><Button type="primary" icon={<ThunderboltOutlined />} loading={aiGenerating} onClick={handleAiGenerate} style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', borderColor: '#8b5cf6' }}>{aiGenerating ? 'Generating…' : 'Generate Preview'}</Button></Space>} closable={!aiGenerating} maskClosable={!aiGenerating}>
				{aiGenerating ? (
					<div style={{ textAlign: 'center', padding: '40px 0' }}><Spin size="large" /><div style={{ marginTop: 16, color: '#64748b' }}>AI is generating module notes… This may take 30–60 seconds.</div></div>
				) : (
					<div>
						<div style={{ marginBottom: 20, padding: '12px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}><Typography.Text style={{ fontSize: 13, color: '#475569' }}>AI will generate complete module notes with LOS, concept pages, formulas, worked examples, practice questions, and revision checklists.</Typography.Text></div>
						<Row gutter={[12, 16]}>
							<Col span={24}><Typography.Text strong style={{ fontSize: 12 }}>Course *</Typography.Text><Select placeholder="Select course" value={aiCourseId} onChange={v => { setAiCourseId(v); setAiVolumeId(null); setAiModuleId(null); setAiTopicId(null); }} options={courses.map(c => ({ value: c.id, label: `${c.name} (${LEVEL_LABELS[c.level] || c.level})` }))} style={{ width: '100%', marginTop: 4 }} allowClear showSearch optionFilterProp="label" /></Col>
							<Col span={12}><Typography.Text strong style={{ fontSize: 12 }}>Volume</Typography.Text><Select placeholder="All volumes" value={aiVolumeId} onChange={v => { setAiVolumeId(v); setAiModuleId(null); setAiTopicId(null); }} options={aiVolumes.map(v => ({ value: v.id, label: v.name }))} style={{ width: '100%', marginTop: 4 }} allowClear showSearch optionFilterProp="label" /></Col>
							<Col span={12}><Typography.Text strong style={{ fontSize: 12 }}>Learning Module</Typography.Text><Select placeholder="All modules" value={aiModuleId} onChange={v => { setAiModuleId(v); setAiTopicId(null); }} options={aiModules.map(m => ({ value: m.id, label: m.name }))} style={{ width: '100%', marginTop: 4 }} allowClear showSearch optionFilterProp="label" /></Col>
							<Col span={12}><Typography.Text strong style={{ fontSize: 12 }}>Topic</Typography.Text><Select placeholder="All topics" value={aiTopicId} onChange={setAiTopicId} options={aiTopics.map(t => ({ value: t.id, label: t.name }))} style={{ width: '100%', marginTop: 4 }} allowClear showSearch optionFilterProp="label" /></Col>
							<Col span={6}><Typography.Text strong style={{ fontSize: 12 }}>Count</Typography.Text><InputNumber min={1} max={20} value={aiCount} onChange={setAiCount} placeholder="All" style={{ width: '100%', marginTop: 4 }} /></Col>
							<Col span={6}><Typography.Text strong style={{ fontSize: 12 }}>Year</Typography.Text><InputNumber min={2020} max={2040} value={aiYear} onChange={setAiYear} style={{ width: '100%', marginTop: 4 }} /></Col>
						</Row>
					</div>
				)}
			</Modal>

			{/* AI Preview Modal */}
			<Modal title={<span><RobotOutlined style={{ marginRight: 8 }} />AI Generated Module Notes Preview</span>} open={aiPreviewOpen} onCancel={() => { if (!aiAcceptLoading) { setAiPreviewOpen(false); setAiSelectedIndices([]); } }} closable={!aiAcceptLoading} maskClosable={!aiAcceptLoading} footer={null} width={1400} centered className="modern-modal">
				{(() => { const tc = (aiPreview?.items || []).length; const all = aiSelectedIndices.length === tc && tc > 0; return tc > 0 ? (<div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Checkbox checked={all} indeterminate={aiSelectedIndices.length > 0 && !all} onChange={(e) => { if (e.target.checked) setAiSelectedIndices(Array.from({ length: tc }, (_, i) => i)); else setAiSelectedIndices([]); }}><Typography.Text strong>Select all ({aiSelectedIndices.length}/{tc})</Typography.Text></Checkbox></div>) : null; })()}
				<div style={{ maxHeight: '65vh', overflow: 'auto' }}>
					<Space direction="vertical" style={{ width: '100%' }} size={16}>
						{(aiPreview?.items || []).map((n, idx) => { const isChecked = aiSelectedIndices.includes(idx); return (
							<Card key={idx} size="small" style={{ borderRadius: 14, borderWidth: 2, borderColor: isChecked ? '#91caff' : '#d9d9d9', background: isChecked ? '#f6ffed' : undefined }}>
								<div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
									<Checkbox checked={isChecked} onChange={(e) => { if (e.target.checked) setAiSelectedIndices(prev => [...prev, idx].sort((a, b) => a - b)); else setAiSelectedIndices(prev => prev.filter(i => i !== idx)); }} style={{ marginTop: 3 }} />
									<div style={{ flex: 1, minWidth: 0 }}><ModuleNotePreviewContent note={n} compact /></div>
									<Button size="small" type="link" disabled={aiAcceptLoading} onClick={() => acceptAiPreview([idx])}>Add</Button>
								</div>
							</Card>
						); })}
					</Space>
				</div>
				<Divider style={{ margin: '12px 0' }} />
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
					<Space><Button type="primary" onClick={() => acceptAiPreview()} loading={aiAcceptLoading} disabled={aiSelectedIndices.length === 0} icon={<CheckCircleOutlined />} style={{ background: '#102540', borderColor: '#102540' }}>Add selected ({aiSelectedIndices.length})</Button><Button onClick={() => { if (!aiAcceptLoading) { setAiPreviewOpen(false); setAiSelectedIndices([]); } }} disabled={aiAcceptLoading}>Back</Button></Space>
					<Typography.Text type="secondary" style={{ fontSize: 12 }}>Review notes before adding to the system</Typography.Text>
				</div>
			</Modal>

			{/* Preview Modal */}
			<Modal open={previewOpen} onCancel={() => { setPreviewOpen(false); setPreviewNote(null); }} footer={null} width={1100} centered title={null} styles={{ body: { padding: 0 } }}>
				{previewNote && <ModuleNotePreviewCard note={previewNote} />}
			</Modal>
		</div>
	);
}

// ─── Compact preview content (for AI preview cards) ───────
function ModuleNotePreviewContent({ note, compact }) {
	const n = note;
	const los = Array.isArray(n.losStatements) ? n.losStatements : [];
	const concepts = Array.isArray(n.concepts) ? n.concepts : [];
	const formulas = Array.isArray(n.formulaRecap) ? n.formulaRecap : [];
	const drills = Array.isArray(n.practiceSet) ? n.practiceSet : [];
	const checks = Array.isArray(n.revisionCheck) ? n.revisionCheck : [];

	return (
		<div>
			<Typography.Text strong style={{ fontSize: 16, color: '#102540' }}>{n.title}</Typography.Text>
			<div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
				{n.studyTime && <Tag>{n.studyTime}</Tag>}
				{n.difficulty && <Tag color="blue">{n.difficulty}</Tag>}
				{n.calculatorUse && <Tag color="geekblue">Calc: {n.calculatorUse}</Tag>}
			</div>
			{n.overview && <div style={{ color: '#475569', fontSize: 13, marginTop: 6 }}>{n.overview}</div>}
			{los.length > 0 && <div style={{ marginTop: 10 }}><Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540' }}>LOS ({los.length})</Typography.Text>{los.slice(0, compact ? 3 : 99).map((l, i) => (<div key={i} style={{ fontSize: 12, color: '#374151', padding: '3px 0', borderBottom: '1px solid #f0f0f0' }}><strong>{l.ref}:</strong> {l.statement} <Tag style={{ fontSize: 10 }}>{l.commandWord}</Tag></div>))}{compact && los.length > 3 && <div style={{ fontSize: 11, color: '#94a3b8' }}>+{los.length - 3} more</div>}</div>}
			{concepts.length > 0 && <div style={{ marginTop: 10 }}><Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540' }}>Concepts ({concepts.length})</Typography.Text>{concepts.slice(0, compact ? 2 : 99).map((c, i) => (<div key={i} style={{ marginTop: 6, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}><div style={{ fontWeight: 600, color: '#102540', fontSize: 13 }}>{c.title}</div><div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{c.meaning}</div>{c.formula && <div style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 14, fontWeight: 600, color: '#102540', marginTop: 4, background: '#f0f4f8', padding: '6px 10px', borderRadius: 6 }}>{c.formula}</div>}</div>))}{compact && concepts.length > 2 && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>+{concepts.length - 2} more concepts</div>}</div>}
			{formulas.length > 0 && <div style={{ marginTop: 10, padding: '8px 10px', background: '#f0f4f8', borderRadius: 8 }}><Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540' }}>Formula Recap ({formulas.length})</Typography.Text></div>}
			<div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
				{drills.length > 0 && <Tag color="blue">{drills.length} practice Q</Tag>}
				{checks.length > 0 && <Tag>{checks.length} revision items</Tag>}
			</div>
		</div>
	);
}

// ─── Full preview card (premium styled) ───────────────────
function ModuleNotePreviewCard({ note }) {
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
				<Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{LEVEL_LABELS[n.level]} {n.volume?.name ? `| ${n.volume.name}` : ''} {n.module?.name ? `| ${n.module.name}` : ''}</Typography.Text>
				<div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
					<Tag style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff' }}>{n.year} Edition</Tag>
					<Tag color={n.status === 'PUBLISHED' ? 'green' : 'default'}>{n.status}</Tag>
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
			{n.overview && <div style={{ padding: '16px 32px', background: '#f0f4f8', borderBottom: '1px solid #e2e8f0' }}><div style={{ color: '#374151', fontSize: 14, lineHeight: 1.6 }}>{n.overview}</div></div>}

			<div style={{ padding: '24px 32px' }}>
				{/* LOS */}
				{los.length > 0 && (
					<div style={{ marginBottom: 24 }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 0.5 }}>Learning Outcome Statements</Typography.Text>
						<table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse' }}>
							<thead><tr style={{ borderBottom: '2px solid #cbd5e1' }}><th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b' }}>LOS</th><th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b' }}>Statement</th><th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b' }}>Command</th></tr></thead>
							<tbody>{los.map((l, i) => (<tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={{ padding: '8px', fontWeight: 600, color: '#102540', fontSize: 13 }}>{l.ref}</td><td style={{ padding: '8px', fontSize: 13, color: '#374151' }}>{l.statement}</td><td style={{ padding: '8px' }}><Tag color="blue" style={{ fontSize: 11 }}>{l.commandWord}</Tag></td></tr>))}</tbody>
						</table>
					</div>
				)}

				{/* Concepts */}
				{concepts.map((c, i) => (
					<div key={i} style={{ marginBottom: 20, padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
						<Typography.Text strong style={{ fontSize: 15, color: '#102540' }}>{i + 1}. {c.title}</Typography.Text>
						<div style={{ marginTop: 8 }}>
							<div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}><strong>Plain-English meaning:</strong> {c.meaning}</div>
							{c.explanation && <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>{c.explanation}</div>}
							{c.formula && (
								<div style={{ background: '#f0f4f8', borderRadius: 8, padding: '12px 16px', marginBottom: 8, border: '1px solid #e2e8f0' }}>
									<Typography.Text style={{ fontSize: 10, textTransform: 'uppercase', color: '#64748b', letterSpacing: 1 }}>FORMULA</Typography.Text>
									<div style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 16, fontWeight: 600, color: '#102540', marginTop: 4 }}>{c.formula}</div>
									{c.formulaVariables && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{c.formulaVariables}</div>}
								</div>
							)}
							{c.interpretation && <div style={{ fontSize: 13, color: '#374151', marginBottom: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, borderLeft: '3px solid #3b82f6' }}><strong>Interpretation:</strong> {c.interpretation}</div>}
							{c.workedExample && (
								<div style={{ marginBottom: 8, padding: '10px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
									<Typography.Text strong style={{ fontSize: 12, color: '#1d4ed8' }}>Worked Example</Typography.Text>
									<div style={{ fontSize: 13, marginTop: 4 }}><strong>Given:</strong> {c.workedExample.given}</div>
									<div style={{ fontSize: 13 }}><strong>Required:</strong> {c.workedExample.required}</div>
									<div style={{ fontSize: 13 }}><strong>Solution:</strong> {c.workedExample.solution}</div>
									<div style={{ fontSize: 13 }}><strong>Conclusion:</strong> {c.workedExample.conclusion}</div>
								</div>
							)}
							<Row gutter={12}>
								{c.examTip && <Col span={12}><div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, borderLeft: '3px solid #22c55e' }}><Typography.Text strong style={{ fontSize: 11, color: '#166534' }}>EXAM TIP</Typography.Text><div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>{c.examTip}</div></div></Col>}
								{c.commonMistake && <Col span={12}><div style={{ padding: '8px 12px', background: '#fef3c7', borderRadius: 6, borderLeft: '3px solid #f59e0b' }}><Typography.Text strong style={{ fontSize: 11, color: '#92400e' }}>COMMON MISTAKE</Typography.Text><div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>{c.commonMistake}</div></div></Col>}
							</Row>
						</div>
					</div>
				))}

				{/* Module Summary */}
				{n.moduleSummary && <div style={{ marginBottom: 20, padding: '16px 20px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}><Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540' }}>Module Summary</Typography.Text><div style={{ fontSize: 13, color: '#374151', marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{n.moduleSummary}</div></div>}

				{/* Formula Recap */}
				{formulas.length > 0 && (
					<div style={{ marginBottom: 20, background: '#f0f4f8', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0' }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540' }}>Formula Recap</Typography.Text>
						{formulas.map((f, i) => (<div key={i} style={{ padding: '8px 0', borderBottom: i < formulas.length - 1 ? '1px solid #e2e8f0' : 'none' }}><div style={{ fontWeight: 600, color: '#102540', fontSize: 13 }}>{f.name}</div><div style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 15, fontWeight: 600, color: '#102540', marginTop: 2 }}>{f.formula}</div><div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{f.variables}</div></div>))}
					</div>
				)}

				{/* Practice Set */}
				{practiceSet.length > 0 && (
					<div style={{ marginBottom: 20, padding: '16px 20px', background: '#eff6ff', borderRadius: 12, borderLeft: '4px solid #3b82f6' }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#1d4ed8' }}>Practice Set</Typography.Text>
						{practiceSet.map((q, i) => (<div key={i} style={{ fontSize: 13, color: '#1e3a5a', marginTop: 6 }}><strong>{i + 1}.</strong> {q.question} {q.losRef && <Tag style={{ fontSize: 10 }}>{q.losRef}</Tag>}</div>))}
					</div>
				)}

				{/* Worked Solutions */}
				{solutions.length > 0 && (
					<div style={{ marginBottom: 20 }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540' }}>Worked Solutions</Typography.Text>
						{solutions.map((s, i) => (<div key={i} style={{ marginTop: 8, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}><div style={{ fontWeight: 600, fontSize: 13, color: '#102540' }}>{i + 1}. {s.question}</div><div style={{ fontSize: 13, marginTop: 4 }}><strong>Answer:</strong> {s.answer}</div>{s.method && <div style={{ fontSize: 12, color: '#475569' }}><strong>Method:</strong> {s.method}</div>}{s.interpretation && <div style={{ fontSize: 12, color: '#3b82f6' }}><strong>Interpretation:</strong> {s.interpretation}</div>}{s.trap && <div style={{ fontSize: 12, color: '#92400e' }}><strong>Trap:</strong> {s.trap}</div>}</div>))}
					</div>
				)}

				{/* Revision Checklist */}
				{checks.length > 0 && (
					<div style={{ padding: '14px 18px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
						<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540' }}>Revision Checklist</Typography.Text>
						<div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>{checks.map((c, i) => (<div key={i} style={{ padding: '6px 12px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}>☐ {c.item}</div>))}</div>
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

export default AdminModuleNotes;
