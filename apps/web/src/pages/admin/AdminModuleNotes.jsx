import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, Form, Input, Button, Select, message, Space, Typography, Table, Modal, Drawer, Tag, Tooltip, Switch, InputNumber, Row, Col, Divider, Empty, Spin, Checkbox } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined, BookOutlined, RobotOutlined, ThunderboltOutlined, CheckCircleOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import MathText from '../../components/MathText';
import { ModuleNotePreviewCard } from '../../components/ModuleNotePreviewCard';

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

	const openCreate = () => { setEditingId(null); form.resetFields(); form.setFieldsValue({ level: 'LEVEL1', order: 0, status: 'DRAFT', year: 2026, studyRoadmap: null }); setFormCourseId(null); setFormVolumeId(null); setFormModuleId(null); setDrawerOpen(true); };

	const openEdit = (record) => {
		setEditingId(record.id);
		form.setFieldsValue({ title: record.title, level: record.level, courseId: record.courseId, volumeId: record.volumeId, moduleId: record.moduleId, topicId: record.topicId, year: record.year || 2026, studyTime: record.studyTime || '', difficulty: record.difficulty || '', calculatorUse: record.calculatorUse || '', overview: record.overview || '', studyRoadmap: record.studyRoadmap ? JSON.stringify(record.studyRoadmap) : '', moduleSummary: record.moduleSummary || '', order: record.order || 0, status: record.status || 'DRAFT' });
		setFormCourseId(record.courseId); setFormVolumeId(record.volumeId); setFormModuleId(record.moduleId);
		setDrawerOpen(true);
	};

	const handleSubmit = async () => {
		try {
			const values = await form.validateFields();
			if (values.studyRoadmap) {
				try { values.studyRoadmap = JSON.parse(values.studyRoadmap); } catch { message.warning('Study Roadmap must be valid JSON'); return; }
			}
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
			// Uses fetch+SSE so heartbeats keep the connection alive through Nginx
			const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
			const response = await fetch(`${API_URL}/api/module-notes/generate-ai/preview`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
				},
				body: JSON.stringify(payload),
			});
			if (!response.ok) {
				const errBody = await response.json().catch(() => ({}));
				throw new Error(errBody?.error || `Server error ${response.status}`);
			}
			// Read the SSE stream: ignore :heartbeat comments, handle result/error events
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let data = null;
			let sseError = null;
			outer: while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const parts = buffer.split('\n\n');
				buffer = parts.pop() ?? '';
				for (const part of parts) {
					if (part.startsWith('event: result\ndata: ')) {
						data = JSON.parse(part.slice('event: result\ndata: '.length));
						break outer;
					} else if (part.startsWith('event: error\ndata: ')) {
						const errObj = JSON.parse(part.slice('event: error\ndata: '.length));
						sseError = errObj?.error || 'AI generation failed';
						break outer;
					}
					// :heartbeat lines are ignored
				}
			}
			if (sseError) throw new Error(sseError);
			if (!data) throw new Error('No response received from server');
			const gen = data?.generated || null;
			setAiPreview(gen); setAiPreviewMeta(data?.meta || payload);
			setAiSelectedIndices(Array.from({ length: (gen?.items || []).length }, (_, i) => i));
			setAiPreviewOpen(true);
		} catch (err) { message.error(err?.message || 'AI generation failed'); } finally { setAiGenerating(false); }
	};

	const acceptAiPreview = async (indices) => {
		if (!aiPreview?.items) { message.warning('No generated notes available — please generate first'); return; }
		const toSend = indices || aiSelectedIndices;
		if (!toSend?.length) { message.warning('Select at least one note'); return; }
		try {
			setAiAcceptLoading(true);
			const { data } = await api.post('/api/module-notes/generate-ai/accept', { generated: aiPreview, meta: aiPreviewMeta, selectedIndices: toSend });
			if (data?.created > 0) {
				message.success(`Saved ${data.created} module note(s)`);
				setAiPreviewOpen(false); setAiModalOpen(false); setAiSelectedIndices([]); fetchNotes();
			} else {
				message.error(data?.error || 'Failed to save notes — server returned 0 created. Check server logs.');
				console.error('[acceptAiPreview] Server returned 0 created:', data);
			}
		} catch (err) {
			console.error('[acceptAiPreview] Error:', err);
			message.error(err?.response?.data?.error || err?.message || 'Failed to save notes');
		} finally { setAiAcceptLoading(false); }
	};

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
			{loading ? (
				<div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>
			) : notes.length === 0 ? (
				<Card style={{ borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'center', padding: 40 }}>
					<Empty description="No module notes found" />
				</Card>
			) : (
				<>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
						{notes.map((record) => {
							const losCount = Array.isArray(record.losStatements) ? record.losStatements.length : 0;
							const conceptCount = Array.isArray(record.concepts) ? record.concepts.length : 0;
							const formulaCount = Array.isArray(record.formulaRecap) ? record.formulaRecap.length : 0;
							const practiceCount = Array.isArray(record.practiceSet) ? record.practiceSet.length : 0;
							return (
								<Card
									key={record.id}
									hoverable
									style={{
										borderRadius: 14,
										border: '1px solid #e2e8f0',
										boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
									}}
									styles={{ body: { padding: 0 } }}
								>
									<div style={{ padding: 16 }}>
										<div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
											<div style={{ flex: 1, minWidth: 0 }}>
												<div style={{ fontWeight: 700, fontSize: 15, color: '#102540', lineHeight: 1.3 }}>{record.title}</div>
												{record.module?.name && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{record.module.name}</div>}
											</div>
											<Tag color={STATUS_COLORS[record.status]} style={{ flexShrink: 0, marginTop: 2 }}>{record.status}</Tag>
										</div>
										<div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
											<Tag color={LEVEL_COLORS[record.level]} style={{ fontSize: 11 }}>{LEVEL_LABELS[record.level]}</Tag>
											{record.difficulty && <Tag style={{ fontSize: 11 }}>{record.difficulty}</Tag>}
											{record.studyTime && <Tag color="geekblue" style={{ fontSize: 11 }}>{record.studyTime}</Tag>}
										</div>
										{record.overview && <div style={{ fontSize: 13, color: '#475569', marginTop: 8, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{record.overview}</div>}
										<div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
											{losCount > 0 && <Tag color="blue" style={{ fontSize: 11, borderRadius: 6 }}>{losCount} LOS</Tag>}
											{conceptCount > 0 && <Tag color="purple" style={{ fontSize: 11, borderRadius: 6 }}>{conceptCount} concepts</Tag>}
											{formulaCount > 0 && <Tag color="cyan" style={{ fontSize: 11, borderRadius: 6 }}>{formulaCount} formulas</Tag>}
											{practiceCount > 0 && <Tag color="green" style={{ fontSize: 11, borderRadius: 6 }}>{practiceCount} practice Qs</Tag>}
										</div>
									</div>
									<div style={{ borderTop: '1px solid #f0f0f0', padding: '8px 12px', display: 'flex', justifyContent: 'flex-end', gap: 2, background: '#fafafa' }}>
										<Tooltip title="Preview"><Button size="small" type="text" icon={<EyeOutlined />} onClick={() => { setPreviewNote(record); setPreviewOpen(true); }} /></Tooltip>
										<Tooltip title="Edit"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} /></Tooltip>
										<Tooltip title={record.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}><Button size="small" type="text" icon={record.status === 'PUBLISHED' ? <StarFilled style={{ color: '#22c55e' }} /> : <StarOutlined />} onClick={() => toggleStatus(record)} /></Tooltip>
										<Tooltip title="Delete"><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} /></Tooltip>
									</div>
								</Card>
							);
						})}
					</div>
					<div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
						<Space>
							<Typography.Text style={{ color: '#64748b', fontSize: 13 }}>{total} note{total !== 1 ? 's' : ''}</Typography.Text>
							<Select value={pageSize} onChange={(v) => { setPageSize(v); setPage(1); }} options={[{ value: 10, label: '10/page' }, { value: 25, label: '25/page' }, { value: 50, label: '50/page' }]} style={{ width: 100 }} />
						</Space>
					</div>
				</>
			)}

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
					<Form.Item name="studyRoadmap" label="Study Roadmap (JSON)"><Input.TextArea rows={3} placeholder='[{"step":"1","focus":"...","whyItMatters":"...","examTip":"..."}]' /></Form.Item>
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
	const [expandedLos, setExpandedLos] = useState(false);
	const [expandedConcepts, setExpandedConcepts] = useState(false);

	return (
		<div>
			<Typography.Text strong style={{ fontSize: 15, color: '#102540' }}>{n.title}</Typography.Text>
			{n.overview && <div style={{ color: '#475569', fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{n.overview}</div>}
			<div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
				{n.studyTime && <Tag color="geekblue" style={{ fontSize: 10 }}>{n.studyTime}</Tag>}
				{n.difficulty && <Tag color="blue" style={{ fontSize: 10 }}>{n.difficulty}</Tag>}
				{n.calculatorUse && <Tag color="cyan" style={{ fontSize: 10 }}>Calc: {n.calculatorUse}</Tag>}
				{n.year && <Tag style={{ fontSize: 10 }}>{n.year} Ed.</Tag>}
				{los.length > 0 && <Tag color="blue" style={{ fontSize: 10 }}>{los.length} LOS</Tag>}
				{concepts.length > 0 && <Tag color="purple" style={{ fontSize: 10 }}>{concepts.length} concepts</Tag>}
				{formulas.length > 0 && <Tag color="cyan" style={{ fontSize: 10 }}>{formulas.length} formulas</Tag>}
				{drills.length > 0 && <Tag color="green" style={{ fontSize: 10 }}>{drills.length} practice</Tag>}
			</div>
			{los.length > 0 && (
				<div style={{ marginTop: 8 }}>
					<div onClick={() => setExpandedLos(!expandedLos)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
						<span style={{ fontSize: 12, fontWeight: 600, color: '#102540' }}>LOS</span>
						<span style={{ fontSize: 10, color: '#94a3b8' }}>{expandedLos ? '▲' : '▼'} {los.length} items</span>
					</div>
					{expandedLos && los.map((l, i) => (
						<div key={i} style={{ fontSize: 12, color: '#374151', padding: '2px 0' }}>
							<span style={{ fontWeight: 600, color: '#102540' }}>{l.ref}:</span> {l.statement}
							{l.commandWord && <Tag style={{ fontSize: 9, marginLeft: 4 }}>{l.commandWord}</Tag>}
						</div>
					))}
				</div>
			)}
			{concepts.length > 0 && (
				<div style={{ marginTop: 6 }}>
					<div onClick={() => setExpandedConcepts(!expandedConcepts)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}>
						<span style={{ fontSize: 12, fontWeight: 600, color: '#102540' }}>Concepts</span>
						<span style={{ fontSize: 10, color: '#94a3b8' }}>{expandedConcepts ? '▲' : '▼'} {concepts.length} items</span>
					</div>
					{expandedConcepts && concepts.map((c, i) => (
						<div key={i} style={{ marginTop: 4, padding: '6px 8px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
							<div style={{ fontWeight: 600, color: '#102540', fontSize: 12 }}>{c.title}</div>
							<div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>{c.meaning}</div>
							{c.formula && <MathText text={c.formula} tag="div" style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 13, fontWeight: 600, color: '#102540', marginTop: 2, background: '#f0f4f8', padding: '4px 8px', borderRadius: 4 }} />}
						</div>
					))}
				</div>
			)}
			{formulas.length > 0 && !compact && (
				<div style={{ marginTop: 6, padding: '6px 8px', background: '#f0f4f8', borderRadius: 6 }}>
					<span style={{ fontSize: 11, fontWeight: 600, color: '#102540' }}>Formulas ({formulas.length})</span>
					{formulas.map((f, i) => (
						<div key={i} style={{ marginTop: 4 }}>
							<span style={{ fontSize: 11, color: '#374151' }}>{f.name}: </span>
							<MathText text={f.formula} tag="span" style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 12, fontWeight: 600, color: '#102540' }} />
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export default AdminModuleNotes;
