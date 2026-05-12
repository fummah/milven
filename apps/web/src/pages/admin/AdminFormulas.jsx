import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, Form, Input, Button, Select, message, Space, Typography, Table, Modal, Drawer, Tag, Tooltip, Switch, InputNumber, Row, Col, Divider, Empty, Tabs, Spin, Progress, Checkbox } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined, BookOutlined, FilterOutlined, StarOutlined, StarFilled, CopyOutlined, OrderedListOutlined, RobotOutlined, ThunderboltOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

const LEVELS = [
	{ value: 'LEVEL1', label: 'Level I' },
	{ value: 'LEVEL2', label: 'Level II' },
	{ value: 'LEVEL3', label: 'Level III' },
];

const LEVEL_COLORS = { LEVEL1: 'blue', LEVEL2: 'purple', LEVEL3: 'gold' };
const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };

export function AdminFormulas() {
	const [form] = Form.useForm();
	const [formulas, setFormulas] = useState([]);
	const [loading, setLoading] = useState(false);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(25);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [editingId, setEditingId] = useState(null);
	const [submitting, setSubmitting] = useState(false);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewFormula, setPreviewFormula] = useState(null);

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
	const [filterVolumeId, setFilterVolumeId] = useState(null);
	const [filterModuleId, setFilterModuleId] = useState(null);
	const [filterTopicId, setFilterTopicId] = useState(null);
	const [filterHighYield, setFilterHighYield] = useState(false);
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
	const [formVolumes, setFormVolumes] = useState([]);
	const [formModules, setFormModules] = useState([]);
	const [formTopics, setFormTopics] = useState([]);

	// Cascading selects for AI modal
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

	// Load modules when we have courses
	useEffect(() => {
		if (courses.length) {
			api.get('/api/cms/modules').then(r => setModules(r.data?.modules || [])).catch(() => {});
			api.get('/api/cms/topics').then(r => setTopics(r.data?.topics || [])).catch(() => {});
		}
	}, [courses]);

	// Cascading selects for form
	useEffect(() => {
		if (formCourseId) {
			const courseVolIds = volumes.filter(v =>
				v.courseLinks?.some(cl => cl.courseId === formCourseId)
			);
			// Fallback: also include any volume that doesn't have courseLinks
			setFormVolumes(courseVolIds.length ? courseVolIds : volumes);
		} else {
			setFormVolumes(volumes);
		}
	}, [formCourseId, volumes]);

	useEffect(() => {
		if (formCourseId) {
			setFormModules(modules.filter(m => m.courseId === formCourseId && (!formVolumeId || m.volumeId === formVolumeId)));
		} else {
			setFormModules(modules);
		}
	}, [formCourseId, formVolumeId, modules]);

	useEffect(() => {
		if (formModuleId) {
			setFormTopics(topics.filter(t => t.moduleId === formModuleId));
		} else if (formCourseId) {
			setFormTopics(topics.filter(t => t.courseId === formCourseId));
		} else {
			setFormTopics(topics);
		}
	}, [formModuleId, formCourseId, topics]);

	// Load formulas
	const fetchFormulas = useCallback(async () => {
		setLoading(true);
		try {
			const params = { page, limit: pageSize };
			if (filterLevel) params.level = filterLevel;
			if (filterCourseId) params.courseId = filterCourseId;
			if (filterVolumeId) params.volumeId = filterVolumeId;
			if (filterModuleId) params.moduleId = filterModuleId;
			if (filterTopicId) params.topicId = filterTopicId;
			if (filterHighYield) params.highYield = 'true';
			if (searchText) params.search = searchText;
			const res = await api.get('/api/formulas', { params });
			setFormulas(res.data?.formulas || []);
			setTotal(res.data?.total || 0);
		} catch {
			message.error('Failed to load formulas');
		} finally {
			setLoading(false);
		}
	}, [page, pageSize, filterLevel, filterCourseId, filterVolumeId, filterModuleId, filterTopicId, filterHighYield, searchText]);

	useEffect(() => { fetchFormulas(); }, [fetchFormulas]);

	// Open drawer for create/edit
	const openCreate = () => {
		setEditingId(null);
		form.resetFields();
		form.setFieldsValue({ level: 'LEVEL1', order: 0, highYield: false, year: 2026 });
		setFormCourseId(null);
		setFormVolumeId(null);
		setFormModuleId(null);
		setDrawerOpen(true);
	};

	const openEdit = (record) => {
		setEditingId(record.id);
		form.setFieldsValue({
			name: record.name,
			formula: record.formula,
			variables: record.variables,
			interpretation: record.interpretation,
			whenToUse: record.whenToUse,
			watchOut: record.watchOut,
			calculatorCue: record.calculatorCue || '',
			losTag: record.losTag || '',
			level: record.level,
			courseId: record.courseId || null,
			volumeId: record.volumeId || null,
			moduleId: record.moduleId || null,
			topicId: record.topicId || null,
			order: record.order || 0,
			highYield: record.highYield || false,
			year: record.year || 2026,
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
				await api.put(`/api/formulas/${editingId}`, values);
				message.success('Formula updated');
			} else {
				await api.post('/api/formulas', values);
				message.success('Formula created');
			}
			setDrawerOpen(false);
			fetchFormulas();
		} catch (err) {
			if (err?.errorFields) return;
			message.error(err?.response?.data?.error || 'Failed to save formula');
		} finally {
			setSubmitting(false);
		}
	};

	const handleDelete = (id) => {
		Modal.confirm({
			title: 'Delete Formula',
			content: 'Are you sure you want to delete this formula? This cannot be undone.',
			okText: 'Delete',
			okType: 'danger',
			onOk: async () => {
				try {
					await api.delete(`/api/formulas/${id}`);
					message.success('Formula deleted');
					fetchFormulas();
				} catch {
					message.error('Failed to delete');
				}
			},
		});
	};

	const toggleHighYield = async (record) => {
		try {
			await api.put(`/api/formulas/${record.id}`, { highYield: !record.highYield });
			message.success(record.highYield ? 'Removed from high-yield' : 'Marked as high-yield');
			fetchFormulas();
		} catch {
			message.error('Failed to update');
		}
	};

	const handleAiGenerate = async () => {
		if (!aiCourseId) return message.warning('Please select a course');
		const selectedCourse = courses.find(c => c.id === aiCourseId);
		if (!selectedCourse) return message.warning('Course not found');
		setAiGenerating(true);
		try {
			const payload = {
				courseId: aiCourseId,
				volumeId: aiVolumeId || undefined,
				moduleId: aiModuleId || undefined,
				topicId: aiTopicId || undefined,
				level: selectedCourse.level,
				year: aiYear,
				count: aiCount || undefined,
			};
			Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

			// Use preview flow: generate but don't save
			try {
				const res = await api.post('/api/formulas/generate-ai/preview', payload);
				const gen = res.data?.generated || null;
				const meta = res.data?.meta || payload;
				setAiPreview(gen);
				setAiPreviewMeta(meta);
				const itemCount = (gen?.items || []).length;
				setAiSelectedIndices(Array.from({ length: itemCount }, (_, i) => i));
				setAiPreviewOpen(true);
				return;
			} catch (previewErr) {
				// Fallback: if preview endpoint fails, use legacy direct-save
				if (previewErr?.response?.status && previewErr.response.status !== 404) {
					throw previewErr;
				}
			}

			// Legacy fallback: direct save
			const res = await api.post('/api/formulas/generate-ai', payload);
			const count = res.data?.created || 0;
			message.success(`AI generated ${count} formula${count !== 1 ? 's' : ''} successfully!`);
			setAiModalOpen(false);
			fetchFormulas();
		} catch (err) {
			const msg = err?.response?.data?.error || err?.message || 'AI generation failed';
			message.error(msg);
		} finally {
			setAiGenerating(false);
		}
	};

	const acceptAiPreview = async (indices) => {
		if (!aiPreview?.items) return;
		const toSend = indices || aiSelectedIndices;
		if (!toSend || toSend.length === 0) {
			message.warning('Select at least one formula to add');
			return;
		}
		try {
			setAiAcceptLoading(true);
			const { data } = await api.post('/api/formulas/generate-ai/accept', {
				generated: aiPreview,
				meta: aiPreviewMeta,
				selectedIndices: toSend,
			});
			message.success(`Saved ${data?.created ?? 0} AI formula(s)`);
			setAiPreviewOpen(false);
			setAiModalOpen(false);
			setAiSelectedIndices([]);
			fetchFormulas();
		} catch (err) {
			message.error(err?.response?.data?.error || 'Failed to save formulas');
		} finally {
			setAiAcceptLoading(false);
		}
	};

	const duplicateFormula = async (record) => {
		try {
			const { id, createdAt, updatedAt, course, volume, module: mod, topic, ...data } = record;
			data.name = `${data.name} (Copy)`;
			await api.post('/api/formulas', data);
			message.success('Formula duplicated');
			fetchFormulas();
		} catch {
			message.error('Failed to duplicate');
		}
	};

	const columns = [
		{
			title: 'Formula Name',
			dataIndex: 'name',
			key: 'name',
			width: 220,
			render: (text, record) => (
				<Space>
					{record.highYield && <StarFilled style={{ color: '#f59e0b' }} />}
					<span style={{ fontWeight: 600, color: '#102540' }}>{text}</span>
				</Space>
			),
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
			title: 'Topic',
			key: 'topic',
			width: 180,
			render: (_, r) => r.topic?.name || <Typography.Text type="secondary">—</Typography.Text>,
		},
		{
			title: 'Formula',
			dataIndex: 'formula',
			key: 'formula',
			ellipsis: true,
			render: (text) => (
				<Typography.Text code style={{ fontSize: 12 }}>
					{text?.length > 60 ? text.slice(0, 60) + '…' : text}
				</Typography.Text>
			),
		},
		{
			title: 'Actions',
			key: 'actions',
			width: 180,
			fixed: 'right',
			render: (_, record) => (
				<Space size={4}>
					<Tooltip title="Preview">
						<Button size="small" type="text" icon={<EyeOutlined />} onClick={() => { setPreviewFormula(record); setPreviewOpen(true); }} />
					</Tooltip>
					<Tooltip title="Edit">
						<Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
					</Tooltip>
					<Tooltip title={record.highYield ? 'Remove High-Yield' : 'Mark High-Yield'}>
						<Button size="small" type="text" icon={record.highYield ? <StarFilled style={{ color: '#f59e0b' }} /> : <StarOutlined />} onClick={() => toggleHighYield(record)} />
					</Tooltip>
					<Tooltip title="Duplicate">
						<Button size="small" type="text" icon={<CopyOutlined />} onClick={() => duplicateFormula(record)} />
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
						<BookOutlined style={{ fontSize: 22, color: '#fff' }} />
					</div>
					<div>
						<Typography.Title level={3} style={{ margin: 0, color: '#102540' }}>
							Formula Book Master
						</Typography.Title>
						<Typography.Text type="secondary">
							Manage CFA formula cards — Simplified. Exam-focused. Built to help you pass.
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
							placeholder="Search formulas…"
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
							placeholder="Volume"
							value={filterVolumeId}
							onChange={v => { setFilterVolumeId(v); setPage(1); }}
							options={[{ value: null, label: 'All Volumes' }, ...volumes.map(v => ({ value: v.id, label: v.name }))]}
							style={{ width: '100%' }}
							allowClear
							showSearch
							optionFilterProp="label"
						/>
					</Col>
					<Col xs={12} sm={6} md={3}>
						<Select
							placeholder="Module"
							value={filterModuleId}
							onChange={v => { setFilterModuleId(v); setPage(1); }}
							options={[{ value: null, label: 'All Modules' }, ...modules.map(m => ({ value: m.id, label: m.name }))]}
							style={{ width: '100%' }}
							allowClear
							showSearch
							optionFilterProp="label"
						/>
					</Col>
					<Col xs={12} sm={6} md={3}>
						<Button
							type={filterHighYield ? 'primary' : 'default'}
							icon={<StarFilled />}
							onClick={() => { setFilterHighYield(!filterHighYield); setPage(1); }}
							style={filterHighYield ? { background: '#f59e0b', borderColor: '#f59e0b' } : {}}
						>
							High-Yield
						</Button>
					</Col>
					<Col xs={24} sm={12} md={4} style={{ textAlign: 'right' }}>
						<Space>
							<Button icon={<RobotOutlined />} onClick={() => setAiModalOpen(true)}
								style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', borderColor: '#8b5cf6', color: '#fff' }}>
								AI Generate
							</Button>
							<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}
								style={{ background: '#102540', borderColor: '#102540' }}>
								Add Formula
							</Button>
						</Space>
					</Col>
				</Row>
			</Card>

			{/* Table */}
			<Card bodyStyle={{ padding: 0 }} style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
				<Table
					dataSource={formulas}
					columns={columns}
					rowKey="id"
					loading={loading}
					scroll={{ x: 1100 }}
					pagination={{
						current: page,
						pageSize,
						total,
						showSizeChanger: true,
						pageSizeOptions: ['10', '25', '50', '100'],
						onChange: (p, ps) => { setPage(p); setPageSize(ps); },
						showTotal: (t) => <span style={{ color: '#64748b' }}>{t} formula{t !== 1 ? 's' : ''}</span>,
					}}
				/>
			</Card>

			{/* Create / Edit Drawer */}
			<Drawer
				title={editingId ? 'Edit Formula Card' : 'Create Formula Card'}
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
					{/* Section: Identity */}
					<Typography.Text strong style={{ color: '#102540', fontSize: 14 }}>Formula Identity</Typography.Text>
					<Divider style={{ margin: '8px 0 16px' }} />
					<Form.Item name="name" label="Formula Name" rules={[{ required: true }]}>
						<Input placeholder="e.g. Holding Period Return" />
					</Form.Item>

					{/* Section: Hierarchy */}
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
									allowClear
									showSearch
									optionFilterProp="label"
									onChange={v => {
										setFormCourseId(v);
										form.setFieldsValue({ volumeId: null, moduleId: null, topicId: null });
										setFormVolumeId(null);
										setFormModuleId(null);
									}}
								/>
							</Form.Item>
						</Col>
						<Col span={12}>
							<Form.Item name="volumeId" label="Volume">
								<Select
									placeholder="Select volume"
									options={formVolumes.map(v => ({ value: v.id, label: v.name }))}
									allowClear
									showSearch
									optionFilterProp="label"
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
									allowClear
									showSearch
									optionFilterProp="label"
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
									allowClear
									showSearch
									optionFilterProp="label"
								/>
							</Form.Item>
						</Col>
					</Row>

					{/* Section: Formula Card Fields (5 mandatory + optional) */}
					<Typography.Text strong style={{ color: '#102540', fontSize: 14 }}>Formula Card — Mandatory Fields</Typography.Text>
					<Divider style={{ margin: '8px 0 16px' }} />
					<Form.Item name="formula" label="Formula (exact equation)" rules={[{ required: true }]}
						extra="Use plain text or LaTeX notation. E.g. HPR = (P1 - P0 + D1) / P0">
						<Input.TextArea rows={3} placeholder="HPR = (P1 - P0 + D1) / P0" style={{ fontFamily: 'monospace' }} />
					</Form.Item>
					<Form.Item name="variables" label="Variables (define every symbol)" rules={[{ required: true }]}>
						<Input.TextArea rows={3} placeholder="P0 = beginning price; P1 = ending price; D1 = income" />
					</Form.Item>
					<Form.Item name="interpretation" label="Interpretation (plain English)" rules={[{ required: true }]}>
						<Input.TextArea rows={2} placeholder="Measures total return over one holding period." />
					</Form.Item>
					<Form.Item name="whenToUse" label="When to Use (exam context)" rules={[{ required: true }]}>
						<Input placeholder="Use for single-period total return questions." />
					</Form.Item>
					<Form.Item name="watchOut" label="Watch-Out (common trap)" rules={[{ required: true }]}>
						<Input placeholder="Do not omit dividend/income." />
					</Form.Item>

					{/* Optional fields */}
					<Typography.Text strong style={{ color: '#102540', fontSize: 14 }}>Optional Fields</Typography.Text>
					<Divider style={{ margin: '8px 0 16px' }} />
					<Form.Item name="calculatorCue" label="Calculator Cue / Assumption Note">
						<Input.TextArea rows={2} placeholder="Optional: TI BA II Plus keystrokes or assumption note" />
					</Form.Item>
					<Form.Item name="losTag" label="LOS Tag">
						<Input placeholder="e.g. Calculate and interpret different approaches to return measurement" />
					</Form.Item>
					<Form.Item name="highYield" valuePropName="checked" label="High-Yield Formula">
						<Switch checkedChildren="Yes" unCheckedChildren="No" />
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
							<div style={{ fontWeight: 700, color: '#102540', fontSize: 16 }}>AI Formula Generator</div>
							<div style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>Select curriculum hierarchy to generate formulas</div>
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
							AI is generating {aiCount ? `${aiCount} formula${aiCount !== 1 ? 's' : ''}` : 'all formulas'}…
						</div>
						<div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>
							This may take 15–30 seconds. Please do not close this window.
						</div>
					</div>
				) : (
					<div>
						<div style={{ marginBottom: 20, padding: '12px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
							<Typography.Text style={{ fontSize: 13, color: '#475569' }}>
								Select the curriculum hierarchy below. AI will generate formula cards with all mandatory fields
								(formula, variables, interpretation, when to use, watch-out) populated from CFA curriculum knowledge.
								Leave Count empty to generate all formulas for the selected scope.
							</Typography.Text>
						</div>

						<Row gutter={[12, 16]}>
							<Col span={24}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>Course *</Typography.Text>
								<Select
									placeholder="Select course"
									value={aiCourseId}
									onChange={v => { setAiCourseId(v); setAiVolumeId(null); setAiModuleId(null); setAiTopicId(null); }}
									options={courses.map(c => ({ value: c.id, label: `${c.name} (${LEVEL_LABELS[c.level] || c.level})` }))}
									style={{ width: '100%', marginTop: 4 }}
									allowClear
									showSearch
									optionFilterProp="label"
								/>
							</Col>
							<Col span={12}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>Volume</Typography.Text>
								<Select
									placeholder="All volumes"
									value={aiVolumeId}
									onChange={v => { setAiVolumeId(v); setAiModuleId(null); setAiTopicId(null); }}
									options={aiVolumes.map(v => ({ value: v.id, label: v.name }))}
									style={{ width: '100%', marginTop: 4 }}
									allowClear
									showSearch
									optionFilterProp="label"
								/>
							</Col>
							<Col span={12}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>Learning Module</Typography.Text>
								<Select
									placeholder="All modules"
									value={aiModuleId}
									onChange={v => { setAiModuleId(v); setAiTopicId(null); }}
									options={aiModules.map(m => ({ value: m.id, label: m.name }))}
									style={{ width: '100%', marginTop: 4 }}
									allowClear
									showSearch
									optionFilterProp="label"
								/>
							</Col>
							<Col span={12}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>Topic</Typography.Text>
								<Select
									placeholder="All topics"
									value={aiTopicId}
									onChange={setAiTopicId}
									options={aiTopics.map(t => ({ value: t.id, label: t.name }))}
									style={{ width: '100%', marginTop: 4 }}
									allowClear
									showSearch
									optionFilterProp="label"
								/>
							</Col>
							<Col span={6}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>Count</Typography.Text>
								<InputNumber
									min={1}
									max={100}
									value={aiCount}
									onChange={setAiCount}
									placeholder="All"
									style={{ width: '100%', marginTop: 4 }}
								/>
							</Col>
							<Col span={6}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>Year</Typography.Text>
								<InputNumber
									min={2020}
									max={2040}
									value={aiYear}
									onChange={setAiYear}
									style={{ width: '100%', marginTop: 4 }}
								/>
							</Col>
						</Row>
					</div>
				)}
			</Modal>

			{/* AI Generated Formulas Preview */}
			<Modal
				title={<span><RobotOutlined style={{ marginRight: 8 }} />AI Generated Formulas Preview</span>}
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
							<Typography.Text type="secondary" style={{ fontSize: 12 }}>
								Formula Cards
							</Typography.Text>
						</div>
					) : null;
				})()}
				<div style={{ maxHeight: '65vh', overflow: 'auto' }}>
					<Space direction="vertical" style={{ width: '100%' }} size={12}>
						{(aiPreview?.items || []).map((f, idx) => {
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
											<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
												<Typography.Text strong style={{ fontSize: 15, color: '#102540' }}>{f.name}</Typography.Text>
												{f.highYield && <Tag color="gold" style={{ fontSize: 11 }}>HIGH-YIELD</Tag>}
											</div>
											{/* Formula */}
											<div style={{ background: '#f0f4f8', borderRadius: 8, padding: '10px 14px', marginBottom: 10, border: '1px solid #e2e8f0' }}>
												<Typography.Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>FORMULA</Typography.Text>
												<div style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 16, fontWeight: 600, color: '#102540', marginTop: 2, whiteSpace: 'pre-wrap' }}>
													{f.formula}
												</div>
											</div>
											{/* Variables */}
											<div style={{ marginBottom: 8 }}>
												<Typography.Text strong style={{ fontSize: 11, textTransform: 'uppercase', color: '#64748b' }}>Variables</Typography.Text>
												<div style={{ fontSize: 13, color: '#374151', marginTop: 2, whiteSpace: 'pre-wrap' }}>{f.variables}</div>
											</div>
											{/* Interpretation */}
											<div style={{ marginBottom: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, borderLeft: '3px solid #3b82f6' }}>
												<Typography.Text strong style={{ fontSize: 11, textTransform: 'uppercase', color: '#64748b' }}>Interpretation</Typography.Text>
												<div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>{f.interpretation}</div>
											</div>
											<Row gutter={12}>
												<Col span={12}>
													<div style={{ marginBottom: 8 }}>
														<Tag color="blue" style={{ fontWeight: 600, fontSize: 11 }}>WHEN TO USE</Tag>
														<div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}>{f.whenToUse}</div>
													</div>
												</Col>
												<Col span={12}>
													<div style={{ marginBottom: 8, padding: '6px 10px', background: '#fef3c7', borderRadius: 6, borderLeft: '3px solid #f59e0b' }}>
														<Typography.Text strong style={{ fontSize: 11, textTransform: 'uppercase', color: '#92400e' }}>Watch-Out</Typography.Text>
														<div style={{ fontSize: 13, color: '#92400e', marginTop: 2 }}>{f.watchOut}</div>
													</div>
												</Col>
											</Row>
											{f.calculatorCue && (
												<div style={{ marginBottom: 6, padding: '6px 10px', background: '#f0fdf4', borderRadius: 6, borderLeft: '3px solid #22c55e', fontSize: 13 }}>
													<Typography.Text strong style={{ fontSize: 11, color: '#166534' }}>Calculator Cue: </Typography.Text>{f.calculatorCue}
												</div>
											)}
											{f.losTag && (
												<div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
													<strong>LOS:</strong> {f.losTag}
												</div>
											)}
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
							type="primary"
							onClick={() => acceptAiPreview()}
							loading={aiAcceptLoading}
							disabled={aiSelectedIndices.length === 0}
							icon={<CheckCircleOutlined />}
							style={{ background: '#102540', borderColor: '#102540' }}
						>
							Add selected ({aiSelectedIndices.length})
						</Button>
						<Button onClick={() => { if (!aiAcceptLoading) { setAiPreviewOpen(false); setAiSelectedIndices([]); } }} disabled={aiAcceptLoading}>
							Back
						</Button>
					</Space>
					<Typography.Text type="secondary" style={{ fontSize: 12 }}>
						Review formulas before adding to the system
					</Typography.Text>
				</div>
			</Modal>

			{/* Preview Modal (Formula Card) */}
			<Modal
				open={previewOpen}
				onCancel={() => { setPreviewOpen(false); setPreviewFormula(null); }}
				footer={null}
				width={900}
				centered
				title={null}
				styles={{ body: { padding: 0 } }}
			>
				{previewFormula && <FormulaCardPreview formula={previewFormula} />}
			</Modal>
		</div>
	);
}

// ─── FormulaCardPreview ─────────────────────────────────────
function FormulaCardPreview({ formula }) {
	return (
		<div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden' }}>
			{/* Header stripe */}
			<div style={{
				background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)',
				padding: '16px 24px',
				display: 'flex', justifyContent: 'space-between', alignItems: 'center',
			}}>
				<div>
					<Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
						{LEVEL_LABELS[formula.level]} {formula.volume?.name ? `| ${formula.volume.name}` : ''}
					</Typography.Text>
					<Typography.Title level={4} style={{ margin: 0, color: '#fff' }}>
						{formula.name}
					</Typography.Title>
				</div>
				{formula.highYield && (
					<Tag color="gold" style={{ fontWeight: 600, fontSize: 11 }}>HIGH-YIELD</Tag>
				)}
			</div>

			{/* Body */}
			<div style={{ padding: '20px 24px' }}>
				{/* Formula */}
				<div style={{
					background: '#f0f4f8', borderRadius: 10, padding: '14px 18px',
					marginBottom: 16, border: '1px solid #e2e8f0',
				}}>
					<Typography.Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
						FORMULA
					</Typography.Text>
					<div style={{
						fontFamily: "'Cambria Math', 'Latin Modern Math', 'STIX Two Math', Georgia, serif",
						fontSize: 18, fontWeight: 600, color: '#102540',
						marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap',
					}}>
						{formula.formula}
					</div>
				</div>

				{/* Variables */}
				<div style={{ marginBottom: 14 }}>
					<Typography.Text strong style={{ color: '#102540', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
						Variables
					</Typography.Text>
					<div style={{ color: '#374151', fontSize: 13, marginTop: 4, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
						{formula.variables}
					</div>
				</div>

				{/* Interpretation */}
				<div style={{ marginBottom: 14, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, borderLeft: '3px solid #3b82f6' }}>
					<Typography.Text strong style={{ color: '#102540', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
						Interpretation
					</Typography.Text>
					<div style={{ color: '#374151', fontSize: 13, marginTop: 2 }}>
						{formula.interpretation}
					</div>
				</div>

				{/* When to Use */}
				<div style={{ marginBottom: 14 }}>
					<Tag color="blue" style={{ fontWeight: 600, fontSize: 11 }}>WHEN TO USE</Tag>
					<div style={{ color: '#374151', fontSize: 13, marginTop: 4 }}>
						{formula.whenToUse}
					</div>
				</div>

				{/* Watch-Out */}
				<div style={{
					marginBottom: 14, padding: '10px 14px',
					background: '#fef3c7', borderRadius: 8, borderLeft: '3px solid #f59e0b',
				}}>
					<Typography.Text strong style={{ color: '#92400e', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
						Watch-Out
					</Typography.Text>
					<div style={{ color: '#92400e', fontSize: 13, marginTop: 2 }}>
						{formula.watchOut}
					</div>
				</div>

				{/* Optional: Calculator Cue */}
				{formula.calculatorCue && (
					<div style={{
						marginBottom: 14, padding: '10px 14px',
						background: '#f0fdf4', borderRadius: 8, borderLeft: '3px solid #22c55e',
					}}>
						<Typography.Text strong style={{ color: '#166534', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
							Calculator Cue
						</Typography.Text>
						<div style={{ color: '#166534', fontSize: 13, marginTop: 2 }}>
							{formula.calculatorCue}
						</div>
					</div>
				)}

				{/* LOS Tag */}
				{formula.losTag && (
					<div style={{ marginTop: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px dashed #cbd5e1' }}>
						<Typography.Text style={{ fontSize: 11, color: '#64748b' }}>
							<strong>LOS:</strong> {formula.losTag}
						</Typography.Text>
					</div>
				)}
			</div>

			{/* Footer */}
			<div style={{
				padding: '10px 24px', borderTop: '1px solid #e2e8f0',
				display: 'flex', justifyContent: 'space-between', alignItems: 'center',
				background: '#f8fafc',
			}}>
				<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>
					Milven Finance School | Formula Book {formula.year}
				</Typography.Text>
				<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>
					{formula.topic?.name || ''} {formula.module?.name ? `• ${formula.module.name}` : ''}
				</Typography.Text>
			</div>
		</div>
	);
}

export default AdminFormulas;
