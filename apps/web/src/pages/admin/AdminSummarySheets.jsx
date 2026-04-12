import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, Form, Input, Button, Select, message, Space, Typography, Table, Modal, Drawer, Tag, Tooltip, Switch, InputNumber, Row, Col, Divider, Empty, Spin, Checkbox, Tabs } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined, FileTextOutlined, RobotOutlined, ThunderboltOutlined, CheckCircleOutlined, CopyOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

const LEVELS = [
	{ value: 'LEVEL1', label: 'Level I' },
	{ value: 'LEVEL2', label: 'Level II' },
	{ value: 'LEVEL3', label: 'Level III' },
];
const LEVEL_COLORS = { LEVEL1: 'blue', LEVEL2: 'purple', LEVEL3: 'gold' };
const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };
const STATUS_COLORS = { DRAFT: 'default', PUBLISHED: 'green' };

export function AdminSummarySheets() {
	const [form] = Form.useForm();
	const [sheets, setSheets] = useState([]);
	const [loading, setLoading] = useState(false);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(25);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [editingId, setEditingId] = useState(null);
	const [submitting, setSubmitting] = useState(false);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewSheet, setPreviewSheet] = useState(null);

	// AI Generate
	const [aiModalOpen, setAiModalOpen] = useState(false);
	const [aiGenerating, setAiGenerating] = useState(false);
	const [aiCourseId, setAiCourseId] = useState(null);
	const [aiVolumeId, setAiVolumeId] = useState(null);
	const [aiModuleId, setAiModuleId] = useState(null);
	const [aiTopicId, setAiTopicId] = useState(null);
	const [aiLevel, setAiLevel] = useState('LEVEL1');
	const [aiCount, setAiCount] = useState(1);
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

	// Form cascading selects
	const [formCourseId, setFormCourseId] = useState(null);
	const [formVolumeId, setFormVolumeId] = useState(null);
	const [formModuleId, setFormModuleId] = useState(null);

	const formVolumes = useMemo(() => {
		if (!formCourseId) return volumes;
		return volumes.filter(v => v.courseLinks?.some(cl => cl.courseId === formCourseId));
	}, [formCourseId, volumes]);

	const formModules = useMemo(() => {
		let list = modules;
		if (formCourseId) list = list.filter(m => m.courseId === formCourseId);
		if (formVolumeId) list = list.filter(m => m.volumeId === formVolumeId);
		return list;
	}, [formCourseId, formVolumeId, modules]);

	const formTopics = useMemo(() => {
		let list = topics;
		if (formCourseId) list = list.filter(t => t.courseId === formCourseId);
		if (formModuleId) list = list.filter(t => t.moduleId === formModuleId);
		return list;
	}, [formCourseId, formModuleId, topics]);

	// AI modal cascading
	const aiVolumes = useMemo(() => {
		if (!aiCourseId) return volumes;
		return volumes.filter(v => v.courseLinks?.some(cl => cl.courseId === aiCourseId));
	}, [aiCourseId, volumes]);

	const aiModules = useMemo(() => {
		let list = modules;
		if (aiCourseId) list = list.filter(m => m.courseId === aiCourseId);
		if (aiVolumeId) list = list.filter(m => m.volumeId === aiVolumeId);
		return list;
	}, [aiCourseId, aiVolumeId, modules]);

	const aiTopics = useMemo(() => {
		let list = topics;
		if (aiCourseId) list = list.filter(t => t.courseId === aiCourseId);
		if (aiModuleId) list = list.filter(t => t.moduleId === aiModuleId);
		return list;
	}, [aiCourseId, aiModuleId, topics]);

	// Load lookup data
	useEffect(() => {
		api.get('/api/cms/courses').then(r => setCourses(r.data?.courses || [])).catch(() => {});
		api.get('/api/cms/volumes').then(r => setVolumes(r.data?.volumes || [])).catch(() => {});
	}, []);

	useEffect(() => {
		if (courses.length) {
			api.get('/api/cms/modules').then(r => setModules(r.data?.modules || [])).catch(() => {});
			api.get('/api/cms/topics').then(r => setTopics(r.data?.topics || [])).catch(() => {});
		}
	}, [courses]);

	// Load sheets
	const fetchSheets = useCallback(async () => {
		setLoading(true);
		try {
			const params = { page, limit: pageSize };
			if (filterLevel) params.level = filterLevel;
			if (filterCourseId) params.courseId = filterCourseId;
			if (filterStatus) params.status = filterStatus;
			if (searchText) params.search = searchText;
			const res = await api.get('/api/summary-sheets', { params });
			setSheets(res.data?.sheets || []);
			setTotal(res.data?.total || 0);
		} catch {
			message.error('Failed to load summary sheets');
		} finally {
			setLoading(false);
		}
	}, [page, pageSize, filterLevel, filterCourseId, filterStatus, searchText]);

	useEffect(() => { fetchSheets(); }, [fetchSheets]);

	const openCreate = () => {
		setEditingId(null);
		form.resetFields();
		form.setFieldsValue({ level: 'LEVEL1', order: 0, status: 'DRAFT', year: 2026 });
		setFormCourseId(null); setFormVolumeId(null); setFormModuleId(null);
		setDrawerOpen(true);
	};

	const openEdit = (record) => {
		setEditingId(record.id);
		form.setFieldsValue({
			title: record.title,
			level: record.level,
			courseId: record.courseId,
			volumeId: record.volumeId,
			moduleId: record.moduleId,
			topicId: record.topicId,
			year: record.year || 2026,
			snapshot: record.snapshot || '',
			useCase: record.useCase || '',
			order: record.order || 0,
			status: record.status || 'DRAFT',
		});
		setFormCourseId(record.courseId);
		setFormVolumeId(record.volumeId);
		setFormModuleId(record.moduleId);
		setDrawerOpen(true);
	};

	const handleSubmit = async () => {
		try {
			const values = await form.validateFields();
			setSubmitting(true);
			if (editingId) {
				await api.put(`/api/summary-sheets/${editingId}`, values);
				message.success('Summary sheet updated');
			} else {
				await api.post('/api/summary-sheets', values);
				message.success('Summary sheet created');
			}
			setDrawerOpen(false);
			fetchSheets();
		} catch (err) {
			if (err?.errorFields) return;
			message.error(err?.response?.data?.error || 'Failed to save');
		} finally {
			setSubmitting(false);
		}
	};

	const handleDelete = (id) => {
		Modal.confirm({
			title: 'Delete Summary Sheet',
			content: 'Are you sure? This cannot be undone.',
			okText: 'Delete',
			okType: 'danger',
			onOk: async () => {
				try {
					await api.delete(`/api/summary-sheets/${id}`);
					message.success('Deleted');
					fetchSheets();
				} catch {
					message.error('Failed to delete');
				}
			},
		});
	};

	const toggleStatus = async (record) => {
		try {
			const newStatus = record.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
			await api.put(`/api/summary-sheets/${record.id}`, { status: newStatus });
			message.success(newStatus === 'PUBLISHED' ? 'Published' : 'Moved to draft');
			fetchSheets();
		} catch {
			message.error('Failed to update status');
		}
	};

	const handleAiGenerate = async () => {
		if (!aiCourseId) return message.warning('Please select a course');
		setAiGenerating(true);
		try {
			const payload = {
				courseId: aiCourseId,
				volumeId: aiVolumeId || undefined,
				moduleId: aiModuleId || undefined,
				topicId: aiTopicId || undefined,
				level: aiLevel,
				year: aiYear,
				count: aiCount,
			};
			Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

			const res = await api.post('/api/summary-sheets/generate-ai/preview', payload);
			const gen = res.data?.generated || null;
			const meta = res.data?.meta || payload;
			setAiPreview(gen);
			setAiPreviewMeta(meta);
			const itemCount = (gen?.items || []).length;
			setAiSelectedIndices(Array.from({ length: itemCount }, (_, i) => i));
			setAiPreviewOpen(true);
		} catch (err) {
			message.error(err?.response?.data?.error || err?.message || 'AI generation failed');
		} finally {
			setAiGenerating(false);
		}
	};

	const acceptAiPreview = async (indices) => {
		if (!aiPreview?.items) return;
		const toSend = indices || aiSelectedIndices;
		if (!toSend || toSend.length === 0) {
			message.warning('Select at least one summary sheet to add');
			return;
		}
		try {
			setAiAcceptLoading(true);
			const { data } = await api.post('/api/summary-sheets/generate-ai/accept', {
				generated: aiPreview,
				meta: aiPreviewMeta,
				selectedIndices: toSend,
			});
			message.success(`Saved ${data?.created ?? 0} summary sheet(s)`);
			setAiPreviewOpen(false);
			setAiModalOpen(false);
			setAiSelectedIndices([]);
			fetchSheets();
		} catch (err) {
			message.error(err?.response?.data?.error || 'Failed to save');
		} finally {
			setAiAcceptLoading(false);
		}
	};

	const columns = [
		{
			title: 'Title',
			dataIndex: 'title',
			key: 'title',
			width: 260,
			render: (text) => <span style={{ fontWeight: 600, color: '#102540' }}>{text}</span>,
		},
		{
			title: 'Level',
			dataIndex: 'level',
			key: 'level',
			width: 90,
			render: (l) => <Tag color={LEVEL_COLORS[l]}>{LEVEL_LABELS[l]}</Tag>,
		},
		{
			title: 'Volume',
			key: 'volume',
			width: 140,
			render: (_, r) => r.volume?.name || <Typography.Text type="secondary">—</Typography.Text>,
		},
		{
			title: 'Module',
			key: 'module',
			width: 160,
			render: (_, r) => r.module?.name || <Typography.Text type="secondary">—</Typography.Text>,
		},
		{
			title: 'Status',
			dataIndex: 'status',
			key: 'status',
			width: 100,
			render: (s) => <Tag color={STATUS_COLORS[s]}>{s}</Tag>,
		},
		{
			title: 'Actions',
			key: 'actions',
			width: 180,
			fixed: 'right',
			render: (_, record) => (
				<Space size={4}>
					<Tooltip title="Preview">
						<Button size="small" type="text" icon={<EyeOutlined />} onClick={() => { setPreviewSheet(record); setPreviewOpen(true); }} />
					</Tooltip>
					<Tooltip title="Edit">
						<Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
					</Tooltip>
					<Tooltip title={record.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}>
						<Button size="small" type="text" icon={record.status === 'PUBLISHED' ? <StarFilled style={{ color: '#22c55e' }} /> : <StarOutlined />} onClick={() => toggleStatus(record)} />
					</Tooltip>
					<Tooltip title="Delete">
						<Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
					</Tooltip>
				</Space>
			),
		},
	];

	return (
		<div>
			{/* Header */}
			<div style={{ marginBottom: 24 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
					<div style={{
						width: 44, height: 44, borderRadius: 12,
						background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)',
						display: 'flex', alignItems: 'center', justifyContent: 'center',
					}}>
						<FileTextOutlined style={{ fontSize: 22, color: '#fff' }} />
					</div>
					<div>
						<Typography.Title level={3} style={{ margin: 0, color: '#102540' }}>
							CFA Summary Sheet Master
						</Typography.Title>
						<Typography.Text type="secondary">
							Simplified. Exam-focused. Built to help you pass.
						</Typography.Text>
					</div>
				</div>
			</div>

			{/* Filters */}
			<Card size="small" style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
				<Row gutter={[12, 12]} align="middle">
					<Col xs={24} sm={12} md={4}>
						<Input
							prefix={<SearchOutlined />}
							placeholder="Search sheets…"
							value={searchText}
							onChange={e => { setSearchText(e.target.value); setPage(1); }}
							allowClear
						/>
					</Col>
					<Col xs={12} sm={6} md={3}>
						<Select
							placeholder="Level"
							value={filterLevel}
							onChange={v => { setFilterLevel(v); setPage(1); }}
							options={[{ value: null, label: 'All Levels' }, ...LEVELS]}
							style={{ width: '100%' }}
							allowClear
						/>
					</Col>
					<Col xs={12} sm={6} md={4}>
						<Select
							placeholder="Course"
							value={filterCourseId}
							onChange={v => { setFilterCourseId(v); setPage(1); }}
							options={[{ value: null, label: 'All Courses' }, ...courses.map(c => ({ value: c.id, label: c.name }))]}
							style={{ width: '100%' }}
							allowClear
							showSearch
							optionFilterProp="label"
						/>
					</Col>
					<Col xs={12} sm={6} md={3}>
						<Select
							placeholder="Status"
							value={filterStatus}
							onChange={v => { setFilterStatus(v); setPage(1); }}
							options={[{ value: null, label: 'All Statuses' }, { value: 'DRAFT', label: 'Draft' }, { value: 'PUBLISHED', label: 'Published' }]}
							style={{ width: '100%' }}
							allowClear
						/>
					</Col>
					<Col xs={24} sm={12} md={6} style={{ textAlign: 'right' }}>
						<Space>
							<Button icon={<RobotOutlined />} onClick={() => setAiModalOpen(true)}
								style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', borderColor: '#8b5cf6', color: '#fff' }}>
								AI Generate
							</Button>
							<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}
								style={{ background: '#102540', borderColor: '#102540' }}>
								Add Sheet
							</Button>
						</Space>
					</Col>
				</Row>
			</Card>

			{/* Table */}
			<Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
				<Table
					dataSource={sheets}
					columns={columns}
					rowKey="id"
					loading={loading}
					scroll={{ x: 1000 }}
					pagination={{
						current: page,
						pageSize,
						total,
						showSizeChanger: true,
						pageSizeOptions: ['10', '25', '50'],
						onChange: (p, ps) => { setPage(p); setPageSize(ps); },
						showTotal: (t) => <span style={{ color: '#64748b' }}>{t} sheet{t !== 1 ? 's' : ''}</span>,
					}}
				/>
			</Card>

			{/* Create/Edit Drawer */}
			<Drawer
				title={editingId ? 'Edit Summary Sheet' : 'Create Summary Sheet'}
				placement="right"
				width={Math.min(680, typeof window !== 'undefined' ? window.innerWidth * 0.9 : 680)}
				open={drawerOpen}
				onClose={() => setDrawerOpen(false)}
				extra={
					<Space>
						<Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
						<Button type="primary" loading={submitting} onClick={handleSubmit}
							style={{ background: '#102540', borderColor: '#102540' }}>
							{editingId ? 'Update' : 'Create'}
						</Button>
					</Space>
				}
			>
				<Form form={form} layout="vertical" autoComplete="off">
					<Typography.Text strong style={{ color: '#102540', fontSize: 14 }}>Sheet Identity</Typography.Text>
					<Divider style={{ margin: '8px 0 16px' }} />
					<Form.Item name="title" label="Sheet Title" rules={[{ required: true }]}>
						<Input placeholder="e.g. Rates and Returns" />
					</Form.Item>

					<Typography.Text strong style={{ color: '#102540', fontSize: 14 }}>Curriculum Hierarchy</Typography.Text>
					<Divider style={{ margin: '8px 0 16px' }} />
					<Row gutter={12}>
						<Col span={8}>
							<Form.Item name="level" label="CFA Level" rules={[{ required: true }]}>
								<Select options={LEVELS} />
							</Form.Item>
						</Col>
						<Col span={8}>
							<Form.Item name="year" label="Year">
								<InputNumber min={2020} max={2040} style={{ width: '100%' }} />
							</Form.Item>
						</Col>
						<Col span={8}>
							<Form.Item name="order" label="Display Order">
								<InputNumber min={0} style={{ width: '100%' }} />
							</Form.Item>
						</Col>
					</Row>
					<Row gutter={12}>
						<Col span={12}>
							<Form.Item name="courseId" label="Course">
								<Select
									placeholder="Select course"
									options={courses.map(c => ({ value: c.id, label: c.name }))}
									allowClear showSearch optionFilterProp="label"
									onChange={v => {
										setFormCourseId(v);
										form.setFieldsValue({ volumeId: null, moduleId: null, topicId: null });
										setFormVolumeId(null); setFormModuleId(null);
									}}
								/>
							</Form.Item>
						</Col>
						<Col span={12}>
							<Form.Item name="volumeId" label="Volume">
								<Select
									placeholder="Select volume"
									options={formVolumes.map(v => ({ value: v.id, label: v.name }))}
									allowClear showSearch optionFilterProp="label"
									onChange={v => {
										setFormVolumeId(v);
										form.setFieldsValue({ moduleId: null, topicId: null });
										setFormModuleId(null);
									}}
								/>
							</Form.Item>
						</Col>
					</Row>
					<Row gutter={12}>
						<Col span={12}>
							<Form.Item name="moduleId" label="Learning Module">
								<Select
									placeholder="Select module"
									options={formModules.map(m => ({ value: m.id, label: m.name }))}
									allowClear showSearch optionFilterProp="label"
									onChange={v => {
										setFormModuleId(v);
										form.setFieldsValue({ topicId: null });
									}}
								/>
							</Form.Item>
						</Col>
						<Col span={12}>
							<Form.Item name="topicId" label="Topic">
								<Select
									placeholder="Select topic"
									options={formTopics.map(t => ({ value: t.id, label: t.name }))}
									allowClear showSearch optionFilterProp="label"
								/>
							</Form.Item>
						</Col>
					</Row>

					<Typography.Text strong style={{ color: '#102540', fontSize: 14 }}>Content</Typography.Text>
					<Divider style={{ margin: '8px 0 16px' }} />
					<Form.Item name="snapshot" label="Module Snapshot (what this sheet covers)">
						<Input.TextArea rows={3} placeholder="e.g. return measures, rate interpretation, cross-rates, forward relationships" />
					</Form.Item>
					<Form.Item name="useCase" label="Use Case">
						<Input placeholder="e.g. final review, tutor recap, formula refresh" />
					</Form.Item>
					<Form.Item name="status" label="Status">
						<Select options={[{ value: 'DRAFT', label: 'Draft' }, { value: 'PUBLISHED', label: 'Published' }]} />
					</Form.Item>
				</Form>
			</Drawer>

			{/* AI Generate Modal */}
			<Modal
				title={
					<Space>
						<div style={{
							width: 36, height: 36, borderRadius: 10,
							background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
							display: 'flex', alignItems: 'center', justifyContent: 'center',
						}}>
							<RobotOutlined style={{ fontSize: 18, color: '#fff' }} />
						</div>
						<div>
							<div style={{ fontWeight: 700, color: '#102540', fontSize: 16 }}>AI Summary Sheet Generator</div>
							<div style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>Generate exam-focused revision sheets with AI</div>
						</div>
					</Space>
				}
				open={aiModalOpen}
				onCancel={() => { if (!aiGenerating) setAiModalOpen(false); }}
				width={640}
				centered
				footer={
					<Space>
						<Button onClick={() => setAiModalOpen(false)} disabled={aiGenerating}>Cancel</Button>
						<Button
							type="primary"
							icon={<ThunderboltOutlined />}
							loading={aiGenerating}
							onClick={handleAiGenerate}
							style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', borderColor: '#8b5cf6' }}
						>
							{aiGenerating ? 'Generating…' : 'Generate Preview'}
						</Button>
					</Space>
				}
				closable={!aiGenerating}
				maskClosable={!aiGenerating}
			>
				{aiGenerating ? (
					<div style={{ textAlign: 'center', padding: '40px 0' }}>
						<Spin size="large" />
						<div style={{ marginTop: 16, color: '#64748b', fontSize: 14 }}>
							AI is generating {aiCount} summary sheet{aiCount !== 1 ? 's' : ''}…
						</div>
						<div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>
							This may take 20–40 seconds. Please do not close this window.
						</div>
					</div>
				) : (
					<div>
						<div style={{ marginBottom: 20, padding: '12px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
							<Typography.Text style={{ fontSize: 13, color: '#475569' }}>
								AI will generate a complete CFA Summary Sheet with key definitions, formulas, distinctions, exam traps, memory hooks, quick drills, and a revision checklist.
							</Typography.Text>
						</div>
						<Row gutter={[12, 16]}>
							<Col span={12}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>CFA Level *</Typography.Text>
								<Select value={aiLevel} onChange={setAiLevel} options={LEVELS} style={{ width: '100%', marginTop: 4 }} />
							</Col>
							<Col span={12}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>Course *</Typography.Text>
								<Select
									placeholder="Select course" value={aiCourseId}
									onChange={v => { setAiCourseId(v); setAiVolumeId(null); setAiModuleId(null); setAiTopicId(null); }}
									options={courses.map(c => ({ value: c.id, label: c.name }))}
									style={{ width: '100%', marginTop: 4 }} allowClear showSearch optionFilterProp="label"
								/>
							</Col>
							<Col span={12}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>Volume</Typography.Text>
								<Select
									placeholder="All volumes" value={aiVolumeId}
									onChange={v => { setAiVolumeId(v); setAiModuleId(null); setAiTopicId(null); }}
									options={aiVolumes.map(v => ({ value: v.id, label: v.name }))}
									style={{ width: '100%', marginTop: 4 }} allowClear showSearch optionFilterProp="label"
								/>
							</Col>
							<Col span={12}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>Learning Module</Typography.Text>
								<Select
									placeholder="All modules" value={aiModuleId}
									onChange={v => { setAiModuleId(v); setAiTopicId(null); }}
									options={aiModules.map(m => ({ value: m.id, label: m.name }))}
									style={{ width: '100%', marginTop: 4 }} allowClear showSearch optionFilterProp="label"
								/>
							</Col>
							<Col span={12}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>Topic</Typography.Text>
								<Select
									placeholder="All topics" value={aiTopicId} onChange={setAiTopicId}
									options={aiTopics.map(t => ({ value: t.id, label: t.name }))}
									style={{ width: '100%', marginTop: 4 }} allowClear showSearch optionFilterProp="label"
								/>
							</Col>
							<Col span={6}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>Count</Typography.Text>
								<InputNumber min={1} max={5} value={aiCount} onChange={setAiCount} style={{ width: '100%', marginTop: 4 }} />
							</Col>
							<Col span={6}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>Year</Typography.Text>
								<InputNumber min={2020} max={2040} value={aiYear} onChange={setAiYear} style={{ width: '100%', marginTop: 4 }} />
							</Col>
						</Row>
					</div>
				)}
			</Modal>

			{/* AI Preview Modal */}
			<Modal
				title={<span><RobotOutlined style={{ marginRight: 8 }} />AI Generated Summary Sheets Preview</span>}
				open={aiPreviewOpen}
				onCancel={() => { if (!aiAcceptLoading) { setAiPreviewOpen(false); setAiSelectedIndices([]); } }}
				closable={!aiAcceptLoading}
				maskClosable={!aiAcceptLoading}
				footer={null}
				width={1400}
				centered
				className="modern-modal"
			>
				{(() => {
					const totalCount = (aiPreview?.items || []).length;
					const allSelected = aiSelectedIndices.length === totalCount && totalCount > 0;
					return totalCount > 0 ? (
						<div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
							<Checkbox
								checked={allSelected}
								indeterminate={aiSelectedIndices.length > 0 && !allSelected}
								onChange={(e) => {
									if (e.target.checked) setAiSelectedIndices(Array.from({ length: totalCount }, (_, i) => i));
									else setAiSelectedIndices([]);
								}}
							>
								<Typography.Text strong>Select all ({aiSelectedIndices.length}/{totalCount})</Typography.Text>
							</Checkbox>
							<Typography.Text type="secondary" style={{ fontSize: 12 }}>Summary Sheets</Typography.Text>
						</div>
					) : null;
				})()}
				<div style={{ maxHeight: '65vh', overflow: 'auto' }}>
					<Space direction="vertical" style={{ width: '100%' }} size={16}>
						{(aiPreview?.items || []).map((s, idx) => {
							const isChecked = aiSelectedIndices.includes(idx);
							return (
								<Card key={idx} size="small" style={{ borderRadius: 14, borderWidth: 2, borderColor: isChecked ? '#91caff' : '#d9d9d9', background: isChecked ? '#f6ffed' : undefined }}>
									<div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
										<Checkbox
											checked={isChecked}
											onChange={(e) => {
												if (e.target.checked) setAiSelectedIndices(prev => [...prev, idx].sort((a, b) => a - b));
												else setAiSelectedIndices(prev => prev.filter(i => i !== idx));
											}}
											style={{ marginTop: 3 }}
										/>
										<div style={{ flex: 1, minWidth: 0 }}>
											<SummarySheetPreviewContent sheet={s} compact />
										</div>
										<Button size="small" type="link" disabled={aiAcceptLoading} onClick={() => acceptAiPreview([idx])}>Add</Button>
									</div>
								</Card>
							);
						})}
					</Space>
				</div>
				<Divider style={{ margin: '12px 0' }} />
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
					<Space>
						<Button
							type="primary" onClick={() => acceptAiPreview()} loading={aiAcceptLoading}
							disabled={aiSelectedIndices.length === 0} icon={<CheckCircleOutlined />}
							style={{ background: '#102540', borderColor: '#102540' }}
						>
							Add selected ({aiSelectedIndices.length})
						</Button>
						<Button onClick={() => { if (!aiAcceptLoading) { setAiPreviewOpen(false); setAiSelectedIndices([]); } }} disabled={aiAcceptLoading}>
							Back
						</Button>
					</Space>
					<Typography.Text type="secondary" style={{ fontSize: 12 }}>Review sheets before adding to the system</Typography.Text>
				</div>
			</Modal>

			{/* Preview Modal */}
			<Modal
				open={previewOpen}
				onCancel={() => { setPreviewOpen(false); setPreviewSheet(null); }}
				footer={null}
				width={1000}
				centered
				title={null}
				styles={{ body: { padding: 0 } }}
			>
				{previewSheet && <SummarySheetPreviewCard sheet={previewSheet} />}
			</Modal>
		</div>
	);
}

// ─── Summary Sheet Preview Content (compact, for AI preview) ──────
function SummarySheetPreviewContent({ sheet, compact }) {
	const s = sheet;
	const defs = Array.isArray(s.coreDefinitions) ? s.coreDefinitions : [];
	const formulas = Array.isArray(s.formulas) ? s.formulas : [];
	const distinctions = Array.isArray(s.distinctions) ? s.distinctions : [];
	const traps = Array.isArray(s.examTraps) ? s.examTraps : [];
	const hooks = Array.isArray(s.memoryHooks) ? s.memoryHooks : [];
	const drills = Array.isArray(s.quickDrills) ? s.quickDrills : [];
	const checks = Array.isArray(s.revisionCheck) ? s.revisionCheck : [];

	return (
		<div>
			<Typography.Text strong style={{ fontSize: 16, color: '#102540' }}>{s.title}</Typography.Text>
			{s.snapshot && <div style={{ color: '#475569', fontSize: 13, marginTop: 4 }}>{s.snapshot}</div>}
			{s.useCase && <Tag color="blue" style={{ marginTop: 6, fontSize: 11 }}>{s.useCase}</Tag>}

			{defs.length > 0 && (
				<div style={{ marginTop: 12 }}>
					<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540', letterSpacing: 0.5 }}>Key Definitions</Typography.Text>
					<div style={{ marginTop: 6 }}>
						{defs.map((d, i) => (
							<div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
								<span style={{ fontWeight: 600, color: '#102540', minWidth: compact ? 100 : 140, flexShrink: 0 }}>{d.term}</span>
								<span style={{ color: '#374151' }}>{d.definition}</span>
							</div>
						))}
					</div>
				</div>
			)}

			{formulas.length > 0 && (
				<div style={{ marginTop: 12, background: '#f0f4f8', borderRadius: 8, padding: '10px 14px', border: '1px solid #e2e8f0' }}>
					<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540', letterSpacing: 0.5 }}>Formula Zone</Typography.Text>
					{formulas.map((f, i) => (
						<div key={i} style={{ padding: '6px 0', borderBottom: i < formulas.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
							<div style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 15, fontWeight: 600, color: '#102540' }}>{f.formula}</div>
							<div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{f.variables}</div>
							{f.whenToUse && <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 1 }}>{f.whenToUse}</div>}
						</div>
					))}
				</div>
			)}

			{distinctions.length > 0 && (
				<div style={{ marginTop: 12 }}>
					<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540', letterSpacing: 0.5 }}>Compare & Distinguish</Typography.Text>
					<div style={{ marginTop: 6 }}>
						{distinctions.map((d, i) => (
							<div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
								<div style={{ padding: '6px 10px', background: '#eff6ff', borderRadius: 6, fontSize: 13 }}>
									<span style={{ fontWeight: 600, color: '#1d4ed8' }}>{d.left}</span>
								</div>
								<div style={{ padding: '6px 10px', background: '#fef3c7', borderRadius: 6, fontSize: 13 }}>
									<span style={{ fontWeight: 600, color: '#92400e' }}>{d.right}</span>
								</div>
								{d.difference && (
									<div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#64748b', paddingLeft: 10 }}>
										↳ {d.difference}
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			)}

			<Row gutter={12} style={{ marginTop: 12 }}>
				{traps.length > 0 && (
					<Col span={12}>
						<div style={{ padding: '10px 14px', background: '#fef3c7', borderRadius: 8, borderLeft: '3px solid #f59e0b' }}>
							<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#92400e' }}>Exam Traps</Typography.Text>
							{traps.map((t, i) => (
								<div key={i} style={{ fontSize: 13, color: '#92400e', marginTop: 4 }}>• {t.trap}</div>
							))}
						</div>
					</Col>
				)}
				{hooks.length > 0 && (
					<Col span={12}>
						<div style={{ padding: '10px 14px', background: '#f0fdf4', borderRadius: 8, borderLeft: '3px solid #22c55e' }}>
							<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#166534' }}>Memory Hooks</Typography.Text>
							{hooks.map((h, i) => (
								<div key={i} style={{ fontSize: 13, color: '#166534', marginTop: 4 }}>• {h.hook}</div>
							))}
						</div>
					</Col>
				)}
			</Row>

			{drills.length > 0 && (
				<div style={{ marginTop: 12, padding: '10px 14px', background: '#eff6ff', borderRadius: 8, borderLeft: '3px solid #3b82f6' }}>
					<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#1d4ed8' }}>Quick Drills</Typography.Text>
					{drills.map((d, i) => (
						<div key={i} style={{ fontSize: 13, color: '#1e3a5a', marginTop: 4 }}>{i + 1}. {d.question}</div>
					))}
				</div>
			)}

			{checks.length > 0 && (
				<div style={{ marginTop: 12 }}>
					<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540' }}>Revision Checklist</Typography.Text>
					<div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
						{checks.map((c, i) => (
							<Tag key={i} style={{ fontSize: 12 }}>☐ {c.item}</Tag>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// ─── Summary Sheet Full Preview Card (premium styled) ─────────
function SummarySheetPreviewCard({ sheet }) {
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
			{/* Identity bar */}
			<div style={{
				background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)',
				padding: '20px 28px',
			}}>
				<Typography.Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5 }}>
					{LEVEL_LABELS[s.level]} {s.volume?.name ? `| ${s.volume.name}` : ''} {s.module?.name ? `| ${s.module.name}` : ''}
				</Typography.Text>
				<Typography.Title level={3} style={{ margin: '4px 0 0', color: '#fff' }}>
					{s.title}
				</Typography.Title>
				<div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
					<Tag style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 11 }}>Milven Summary Sheet</Tag>
					<Tag style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 11 }}>{s.year} Edition</Tag>
					<Tag color={s.status === 'PUBLISHED' ? 'green' : 'default'} style={{ fontSize: 11 }}>{s.status}</Tag>
				</div>
			</div>

			{/* Module Snapshot */}
			{(s.snapshot || s.useCase) && (
				<div style={{ padding: '16px 28px', background: '#f0f4f8', borderBottom: '1px solid #e2e8f0' }}>
					{s.snapshot && <div style={{ color: '#374151', fontSize: 14, lineHeight: 1.6 }}>{s.snapshot}</div>}
					{s.useCase && <div style={{ color: '#3b82f6', fontSize: 12, marginTop: 4 }}><strong>Use case:</strong> {s.useCase}</div>}
				</div>
			)}

			<div style={{ padding: '20px 28px' }}>
				{/* Core Definitions */}
				{defs.length > 0 && (
					<div style={{ marginBottom: 20 }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 0.5 }}>
							Key Definitions
						</Typography.Text>
						<div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
							{defs.map((d, i) => (
								<div key={i} style={{ display: 'flex', gap: 12, padding: '8px 12px', background: i % 2 === 0 ? '#f8fafc' : '#fff', borderRadius: 8, border: '1px solid #f0f0f0' }}>
									<span style={{ fontWeight: 700, color: '#102540', minWidth: 150, flexShrink: 0, fontSize: 13 }}>{d.term}</span>
									<span style={{ color: '#374151', fontSize: 13 }}>{d.definition}</span>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Formula Zone */}
				{formulas.length > 0 && (
					<div style={{ marginBottom: 20, background: '#f0f4f8', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0' }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 0.5 }}>
							Formula Zone
						</Typography.Text>
						<table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse' }}>
							<thead>
								<tr style={{ borderBottom: '2px solid #cbd5e1' }}>
									<th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Formula</th>
									<th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Variables</th>
									<th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>When to Use</th>
								</tr>
							</thead>
							<tbody>
								{formulas.map((f, i) => (
									<tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
										<td style={{ padding: '8px', fontFamily: "'Cambria Math', Georgia, serif", fontSize: 15, fontWeight: 600, color: '#102540', whiteSpace: 'pre-wrap' }}>{f.formula}</td>
										<td style={{ padding: '8px', fontSize: 12, color: '#475569' }}>{f.variables}</td>
										<td style={{ padding: '8px', fontSize: 12, color: '#3b82f6' }}>{f.whenToUse}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				{/* Distinctions */}
				{distinctions.length > 0 && (
					<div style={{ marginBottom: 20 }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 0.5 }}>
							Compare & Distinguish
						</Typography.Text>
						<div style={{ marginTop: 8 }}>
							{distinctions.map((d, i) => (
								<div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
									<div style={{ padding: '10px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
										<Typography.Text strong style={{ color: '#1d4ed8', fontSize: 13 }}>{d.left}</Typography.Text>
									</div>
									<div style={{ padding: '10px 14px', background: '#fef3c7', borderRadius: 8, border: '1px solid #fcd34d' }}>
										<Typography.Text strong style={{ color: '#92400e', fontSize: 13 }}>{d.right}</Typography.Text>
									</div>
									{d.difference && (
										<div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#64748b', paddingLeft: 14, fontStyle: 'italic' }}>
											{d.difference}
										</div>
									)}
								</div>
							))}
						</div>
					</div>
				)}

				{/* Exam Traps & Memory Hooks side by side */}
				<Row gutter={16} style={{ marginBottom: 20 }}>
					{traps.length > 0 && (
						<Col span={12}>
							<div style={{ padding: '14px 18px', background: '#fef3c7', borderRadius: 10, borderLeft: '4px solid #f59e0b', height: '100%' }}>
								<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#92400e', letterSpacing: 0.5 }}>
									Exam Traps
								</Typography.Text>
								{traps.map((t, i) => (
									<div key={i} style={{ fontSize: 13, color: '#92400e', marginTop: 6, lineHeight: 1.5 }}>⚠ {t.trap}</div>
								))}
							</div>
						</Col>
					)}
					{hooks.length > 0 && (
						<Col span={12}>
							<div style={{ padding: '14px 18px', background: '#f0fdf4', borderRadius: 10, borderLeft: '4px solid #22c55e', height: '100%' }}>
								<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#166534', letterSpacing: 0.5 }}>
									Memory Hooks
								</Typography.Text>
								{hooks.map((h, i) => (
									<div key={i} style={{ fontSize: 13, color: '#166534', marginTop: 6, lineHeight: 1.5 }}>💡 {h.hook}</div>
								))}
							</div>
						</Col>
					)}
				</Row>

				{/* Quick Drills */}
				{drills.length > 0 && (
					<div style={{ marginBottom: 20, padding: '14px 18px', background: '#eff6ff', borderRadius: 10, borderLeft: '4px solid #3b82f6' }}>
						<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#1d4ed8', letterSpacing: 0.5 }}>
							Quick Drills
						</Typography.Text>
						{drills.map((d, i) => (
							<div key={i} style={{ fontSize: 13, color: '#1e3a5a', marginTop: 6, lineHeight: 1.5 }}>
								<strong>{i + 1}.</strong> {d.question}
							</div>
						))}
					</div>
				)}

				{/* Revision Checklist */}
				{checks.length > 0 && (
					<div style={{ padding: '14px 18px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
						<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540', letterSpacing: 0.5 }}>
							Revision Check
						</Typography.Text>
						<div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
							{checks.map((c, i) => (
								<div key={i} style={{ padding: '6px 12px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, color: '#374151' }}>
									☐ {c.item}
								</div>
							))}
						</div>
					</div>
				)}
			</div>

			{/* Footer */}
			<div style={{
				padding: '12px 28px', borderTop: '1px solid #e2e8f0',
				display: 'flex', justifyContent: 'space-between', alignItems: 'center',
				background: '#f8fafc',
			}}>
				<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>
					Milven Finance School | Summary Sheet {s.year}
				</Typography.Text>
				<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>
					Simplified. Exam-focused. Built to help you pass.
				</Typography.Text>
			</div>
		</div>
	);
}

export default AdminSummarySheets;
