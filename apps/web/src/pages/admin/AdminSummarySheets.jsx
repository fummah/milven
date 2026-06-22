import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, Form, Input, Button, Select, message, Space, Typography, Table, Modal, Drawer, Tag, Tooltip, Switch, InputNumber, Row, Col, Divider, Empty, Spin, Checkbox, Tabs } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined, FileTextOutlined, RobotOutlined, ThunderboltOutlined, CheckCircleOutlined, CopyOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import MathText, { MathVariables } from '../../components/MathText';

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


	// Load lookup data
	useEffect(() => {
		api.get('/api/cms/courses').then(r => setCourses(r.data?.courses || [])).catch(() => {});
		api.get('/api/cms/volumes').then(r => setVolumes(r.data?.volumes || [])).catch(() => {});
	}, []);

	useEffect(() => {
		if (courses.length) {
			api.get('/api/cms/modules').then(r => setModules(r.data?.modules || [])).catch(() => {});
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
		const selectedCourse = courses.find(c => c.id === aiCourseId);
		if (!selectedCourse) return message.warning('Course not found');
		setAiGenerating(true);
		try {
			const payload = {
				courseId: aiCourseId,
				volumeId: aiVolumeId || undefined,
				moduleId: aiModuleId || undefined,
				level: selectedCourse.level,
				year: aiYear,
				count: aiCount || undefined,
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
										form.setFieldsValue({ volumeId: null, moduleId: null });
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
										form.setFieldsValue({ moduleId: null });
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
									}}
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
							AI is generating {aiCount ? `${aiCount} summary sheet${aiCount !== 1 ? 's' : ''}` : 'summary sheets'}…
						</div>
						<div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>
							This may take 20–40 seconds. Please do not close this window.
						</div>
					</div>
				) : (
					<div>
						<div style={{ marginBottom: 20, padding: '12px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
							<Typography.Text style={{ fontSize: 13, color: '#475569' }}>
								AI will generate a Milven Summary Dashboard at Learning Module level with concept maps, formula strips, decision rules, exam traps, and revision checklists.
							</Typography.Text>
						</div>
						<Row gutter={[12, 16]}>
							<Col span={24}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>Course *</Typography.Text>
								<Select
									placeholder="Select course" value={aiCourseId}
									onChange={v => { setAiCourseId(v); setAiVolumeId(null); setAiModuleId(null); }}
									options={courses.map(c => ({ value: c.id, label: `${c.name} (${LEVEL_LABELS[c.level] || c.level})` }))}
									style={{ width: '100%', marginTop: 4 }} allowClear showSearch optionFilterProp="label"
								/>
							</Col>
							<Col span={12}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>Volume</Typography.Text>
								<Select
									placeholder="All volumes" value={aiVolumeId}
									onChange={v => { setAiVolumeId(v); setAiModuleId(null); }}
									options={aiVolumes.map(v => ({ value: v.id, label: v.name }))}
									style={{ width: '100%', marginTop: 4 }} allowClear showSearch optionFilterProp="label"
								/>
							</Col>
							<Col span={12}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>Learning Module</Typography.Text>
								<Select
									placeholder="All modules" value={aiModuleId}
									onChange={v => { setAiModuleId(v); }}
									options={aiModules.map(m => ({ value: m.id, label: m.name }))}
									style={{ width: '100%', marginTop: 4 }} allowClear showSearch optionFilterProp="label"
								/>
							</Col>
							<Col span={6}>
								<Typography.Text strong style={{ fontSize: 12, color: '#102540' }}>Count</Typography.Text>
								<InputNumber min={1} max={20} value={aiCount} onChange={setAiCount} placeholder="All" style={{ width: '100%', marginTop: 4 }} />
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

// ─── Dashboard Section Header ──────────────────────────────────
function DashboardSectionHeader({ number, title, color = '#102540' }) {
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
			<div style={{ width: 28, height: 28, borderRadius: 8, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
				{number}
			</div>
			<Typography.Text strong style={{ fontSize: 14, color, textTransform: 'uppercase', letterSpacing: 0.8 }}>{title}</Typography.Text>
		</div>
	);
}

// ─── Summary Sheet Preview Content (compact, for AI preview) ──────
function SummarySheetPreviewContent({ sheet }) {
	const s = sheet;
	const losItems = Array.isArray(s.coreDefinitions) ? s.coreDefinitions : [];
	const conceptMap = Array.isArray(s.diagrams) ? s.diagrams : [];
	const topicMap = Array.isArray(s.memoryHooks) ? s.memoryHooks : [];
	const formulas = Array.isArray(s.formulas) ? s.formulas : [];
	const rules = Array.isArray(s.distinctions) ? s.distinctions : [];
	const traps = Array.isArray(s.examTraps) ? s.examTraps : [];
	const checks = Array.isArray(s.revisionCheck) ? s.revisionCheck : [];
	const instructorReview = Array.isArray(s.quickDrills) ? s.quickDrills : [];

	return (
		<div>
			<Typography.Text strong style={{ fontSize: 16, color: '#102540' }}>{s.title}</Typography.Text>
			{s.snapshot && (
				<div style={{ marginTop: 8, padding: '10px 14px', background: '#f0f4f8', borderRadius: 8, borderLeft: '4px solid #102540', fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
					{s.snapshot}
				</div>
			)}
			{s.useCase && (
				<Tag color={s.useCase === 'PASS' ? 'green' : s.useCase === 'REVISE' ? 'orange' : 'red'} style={{ marginTop: 6, fontSize: 11 }}>
					Coverage: {s.useCase}
				</Tag>
			)}

			{losItems.length > 0 && (
				<div style={{ marginTop: 12 }}>
					<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540', letterSpacing: 0.5 }}>LOS Snapshot</Typography.Text>
					<div style={{ marginTop: 6 }}>
						{losItems.map((d, i) => (
							<div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #f0f0f0', fontSize: 12 }}>
								<Tag color="blue" style={{ fontSize: 10, flexShrink: 0 }}>{d.ref || d.term}</Tag>
								<span style={{ color: '#374151' }}>{d.statement || d.definition}</span>
								{(d.commandWord) && <Tag style={{ fontSize: 10, flexShrink: 0 }}>{d.commandWord}</Tag>}
							</div>
						))}
					</div>
				</div>
			)}

			{formulas.length > 0 && (
				<div style={{ marginTop: 12, background: '#f0f4f8', borderRadius: 8, padding: '10px 14px', border: '1px solid #e2e8f0' }}>
					<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540', letterSpacing: 0.5 }}>Formula Strip</Typography.Text>
					{formulas.map((f, i) => (
						<div key={i} style={{ padding: '6px 0', borderBottom: i < formulas.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
							<MathText text={f.formula} tag="div" style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 14, fontWeight: 600, color: '#102540' }} />
							{f.useCase && <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 1 }}>{f.useCase}</div>}
							{f.interpretation && <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{f.interpretation}</div>}
						</div>
					))}
				</div>
			)}

			{rules.length > 0 && (
				<div style={{ marginTop: 12 }}>
					<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540', letterSpacing: 0.5 }}>Decision Rules</Typography.Text>
					{rules.map((d, i) => (
						<div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0', fontSize: 12 }}>
							<span style={{ fontWeight: 600, color: '#102540' }}>{d.scenario || d.left}</span>
							<span style={{ color: '#374151' }}> → {d.rule || d.right}</span>
							{(d.apply || d.difference) && <span style={{ color: '#64748b' }}> ({d.apply || d.difference})</span>}
						</div>
					))}
				</div>
			)}

			<Row gutter={12} style={{ marginTop: 12 }}>
				{traps.length > 0 && (
					<Col span={12}>
						<div style={{ padding: '10px 14px', background: '#fef3c7', borderRadius: 8, borderLeft: '3px solid #f59e0b' }}>
							<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#92400e' }}>Exam Traps</Typography.Text>
							{traps.map((t, i) => (
								<div key={i} style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>• {t.trap}</div>
							))}
						</div>
					</Col>
				)}
				{checks.length > 0 && (
					<Col span={12}>
						<div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, borderLeft: '3px solid #102540' }}>
							<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540' }}>Revision Checklist</Typography.Text>
							{checks.map((c, i) => (
								<div key={i} style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>☐ {c.item}</div>
							))}
						</div>
					</Col>
				)}
			</Row>

			{instructorReview.length > 0 && instructorReview[0]?.issue !== 'None identified' && (
				<div style={{ marginTop: 12, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, borderLeft: '3px solid #ef4444' }}>
					<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#991b1b' }}>Instructor Review Required</Typography.Text>
					{instructorReview.map((d, i) => (
						<div key={i} style={{ fontSize: 12, color: '#991b1b', marginTop: 4 }}>{d.issue || d.question}: {d.recommendation || ''}</div>
					))}
				</div>
			)}
		</div>
	);
}

// ─── Summary Sheet Full Preview Card (Milven Dashboard) ─────────
function SummarySheetPreviewCard({ sheet }) {
	const s = sheet;
	const losItems = Array.isArray(s.coreDefinitions) ? s.coreDefinitions : [];
	const conceptMap = Array.isArray(s.diagrams) ? s.diagrams : [];
	const topicMap = Array.isArray(s.memoryHooks) ? s.memoryHooks : [];
	const formulas = Array.isArray(s.formulas) ? s.formulas : [];
	const rules = Array.isArray(s.distinctions) ? s.distinctions : [];
	const traps = Array.isArray(s.examTraps) ? s.examTraps : [];
	const checks = Array.isArray(s.revisionCheck) ? s.revisionCheck : [];
	const instructorReview = Array.isArray(s.quickDrills) ? s.quickDrills : [];
	const coverageStatus = s.useCase || '';

	return (
		<div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden' }}>
			{/* ── Identity Bar ── */}
			<div style={{ background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', padding: '20px 28px' }}>
				<Typography.Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5 }}>
					{LEVEL_LABELS[s.level]} {s.volume?.name ? `| ${s.volume.name}` : ''} {s.module?.name ? `| ${s.module.name}` : ''}
				</Typography.Text>
				<Typography.Title level={3} style={{ margin: '4px 0 0', color: '#fff' }}>{s.title}</Typography.Title>
				<div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
					<Tag style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 11 }}>Milven Summary Dashboard</Tag>
					<Tag style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 11 }}>{s.year} Edition</Tag>
					<Tag color={s.status === 'PUBLISHED' ? 'green' : 'default'} style={{ fontSize: 11 }}>{s.status}</Tag>
					{coverageStatus && (
						<Tag color={coverageStatus === 'PASS' ? 'green' : coverageStatus === 'REVISE' ? 'orange' : 'red'} style={{ fontSize: 11 }}>
							Coverage: {coverageStatus}
						</Tag>
					)}
				</div>
			</div>

			{/* ── 1. Module Objective ── */}
			{s.snapshot && (
				<div style={{ padding: '16px 28px', background: '#f0f4f8', borderBottom: '1px solid #e2e8f0' }}>
					<DashboardSectionHeader number="1" title="Module Objective" />
					<div style={{ padding: '12px 16px', background: '#fff', borderRadius: 10, borderLeft: '4px solid #102540', color: '#374151', fontSize: 14, lineHeight: 1.7 }}>
						{s.snapshot}
					</div>
				</div>
			)}

			<div style={{ padding: '20px 28px' }}>
				{/* ── 2. LOS Snapshot ── */}
				{losItems.length > 0 && (
					<div style={{ marginBottom: 24 }}>
						<DashboardSectionHeader number="2" title="LOS Snapshot" />
						<table style={{ width: '100%', borderCollapse: 'collapse' }}>
							<thead>
								<tr style={{ borderBottom: '2px solid #102540' }}>
									<th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', width: 90 }}>LOS Ref</th>
									<th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Statement</th>
									<th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', width: 100 }}>Command</th>
								</tr>
							</thead>
							<tbody>
								{losItems.map((d, i) => (
									<tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
										<td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600, color: '#102540' }}>{d.ref || d.term}</td>
										<td style={{ padding: '8px 10px', fontSize: 13, color: '#374151' }}>{d.statement || d.definition}</td>
										<td style={{ padding: '8px 10px' }}><Tag color="blue" style={{ fontSize: 11 }}>{d.commandWord || '—'}</Tag></td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				{/* ── 3. Module Concept Map ── */}
				{conceptMap.length > 0 && (
					<div style={{ marginBottom: 24 }}>
						<DashboardSectionHeader number="3" title="Module Concept Map" color="#1b3a5b" />
						<div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
							{conceptMap.map((node, i) => (
								<div key={i} style={{ flex: '1 1 220px', maxWidth: 320, background: '#f0f4f8', borderRadius: 12, border: '2px solid #102540', padding: '14px 16px', position: 'relative' }}>
									<div style={{ fontWeight: 700, color: '#102540', fontSize: 14, marginBottom: 6 }}>{node.topic}</div>
									{Array.isArray(node.subtopics) && node.subtopics.map((sub, j) => (
										<div key={j} style={{ fontSize: 12, color: '#475569', paddingLeft: 10, borderLeft: '2px solid #cbd5e1', marginBottom: 3 }}>{sub}</div>
									))}
									{node.connectionTo && (
										<div style={{ marginTop: 8, fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>
											→ {node.connectionTo}
										</div>
									)}
								</div>
							))}
						</div>
					</div>
				)}

				{/* ── 4. Topic-to-Concept Map ── */}
				{topicMap.length > 0 && (
					<div style={{ marginBottom: 24 }}>
						<DashboardSectionHeader number="4" title="Topic-to-Concept Map" color="#1b3a5b" />
						<table style={{ width: '100%', borderCollapse: 'collapse' }}>
							<thead>
								<tr style={{ borderBottom: '2px solid #102540' }}>
									<th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', width: '25%' }}>Topic</th>
									<th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Key Concepts</th>
									<th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', width: '30%' }}>Link to Objective</th>
								</tr>
							</thead>
							<tbody>
								{topicMap.map((t, i) => (
									<tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
										<td style={{ padding: '8px 10px', fontWeight: 600, fontSize: 13, color: '#102540' }}>{t.topic || t.hook}</td>
										<td style={{ padding: '8px 10px', fontSize: 12, color: '#374151' }}>
											{Array.isArray(t.concepts) ? t.concepts.join(', ') : (t.concepts || '')}
										</td>
										<td style={{ padding: '8px 10px', fontSize: 12, color: '#3b82f6' }}>{t.linkToObjective || ''}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				{/* ── 5. Formula Strip ── */}
				{formulas.length > 0 && (
					<div style={{ marginBottom: 24, background: '#f0f4f8', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0' }}>
						<DashboardSectionHeader number="5" title="Formula Strip" />
						<table style={{ width: '100%', borderCollapse: 'collapse' }}>
							<thead>
								<tr style={{ borderBottom: '2px solid #cbd5e1' }}>
									<th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Formula</th>
									<th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Use Case</th>
									<th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Interpretation</th>
								</tr>
							</thead>
							<tbody>
								{formulas.map((f, i) => (
									<tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
										<td style={{ padding: '8px', fontFamily: "'Cambria Math', Georgia, serif", fontSize: 15, fontWeight: 600, color: '#102540', whiteSpace: 'pre-wrap' }}>
											<MathText text={f.formula} />
										</td>
										<td style={{ padding: '8px', fontSize: 12, color: '#3b82f6' }}>{f.useCase || f.whenToUse || ''}</td>
										<td style={{ padding: '8px', fontSize: 12, color: '#475569' }}>{f.interpretation || ''}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				{/* ── 6. Exam Decision Rules ── */}
				{rules.length > 0 && (
					<div style={{ marginBottom: 24 }}>
						<DashboardSectionHeader number="6" title="Exam Decision Rules" color="#1d4ed8" />
						<div style={{ display: 'grid', gap: 8 }}>
							{rules.map((d, i) => (
								<div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, padding: '10px 14px', background: i % 2 === 0 ? '#eff6ff' : '#fff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
									<div style={{ fontSize: 13, fontWeight: 600, color: '#102540' }}>{d.scenario || d.left}</div>
									<div style={{ fontSize: 18, color: '#3b82f6', fontWeight: 700 }}>→</div>
									<div>
										<div style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>{d.rule || d.right}</div>
										{(d.apply || d.difference) && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{d.apply || d.difference}</div>}
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{/* ── 7. Exam Traps ── */}
				{traps.length > 0 && (
					<div style={{ marginBottom: 24 }}>
						<DashboardSectionHeader number="7" title="Exam Traps" color="#92400e" />
						<div style={{ padding: '14px 18px', background: '#fef3c7', borderRadius: 10, borderLeft: '4px solid #f59e0b' }}>
							{traps.map((t, i) => (
								<div key={i} style={{ fontSize: 13, color: '#92400e', marginTop: i > 0 ? 8 : 0, lineHeight: 1.5, display: 'flex', gap: 8 }}>
									<span style={{ flexShrink: 0, fontWeight: 700 }}>⚠</span>
									<span>{t.trap}</span>
								</div>
							))}
						</div>
					</div>
				)}

				{/* ── 8. Final Revision Checklist ── */}
				{checks.length > 0 && (
					<div style={{ marginBottom: 24 }}>
						<DashboardSectionHeader number="8" title="Final Revision Checklist" />
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
							{checks.map((c, i) => (
								<div key={i} style={{ padding: '8px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 8 }}>
									<div style={{ width: 18, height: 18, borderRadius: 4, border: '2px solid #102540', flexShrink: 0 }} />
									{c.item}
								</div>
							))}
						</div>
					</div>
				)}

				{/* ── 9. Instructor Review Required ── */}
				{instructorReview.length > 0 && (
					<div style={{ marginBottom: 24 }}>
						<DashboardSectionHeader number="9" title="Instructor Review Required" color="#991b1b" />
						{instructorReview[0]?.issue === 'None identified' ? (
							<div style={{ padding: '12px 18px', background: '#f0fdf4', borderRadius: 10, borderLeft: '4px solid #22c55e', fontSize: 13, color: '#166534' }}>
								All content verified — ready for publication.
							</div>
						) : (
							<div style={{ padding: '14px 18px', background: '#fef2f2', borderRadius: 10, borderLeft: '4px solid #ef4444' }}>
								{instructorReview.map((d, i) => (
									<div key={i} style={{ marginTop: i > 0 ? 8 : 0 }}>
										<div style={{ fontSize: 13, fontWeight: 600, color: '#991b1b' }}>{d.issue || d.question}</div>
										{(d.recommendation) && <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 2 }}>→ {d.recommendation}</div>}
									</div>
								))}
							</div>
						)}
					</div>
				)}

				{/* ── 10. Coverage Quality Check ── */}
				{coverageStatus && (
					<div style={{ marginBottom: 10 }}>
						<DashboardSectionHeader number="10" title="Coverage Quality Check" color={coverageStatus === 'PASS' ? '#166534' : '#991b1b'} />
						<div style={{
							padding: '12px 18px', borderRadius: 10, fontSize: 14, fontWeight: 700, textAlign: 'center',
							background: coverageStatus === 'PASS' ? '#f0fdf4' : coverageStatus === 'REVISE' ? '#fffbeb' : '#fef2f2',
							color: coverageStatus === 'PASS' ? '#166534' : coverageStatus === 'REVISE' ? '#92400e' : '#991b1b',
							border: `2px solid ${coverageStatus === 'PASS' ? '#22c55e' : coverageStatus === 'REVISE' ? '#f59e0b' : '#ef4444'}`,
						}}>
							{coverageStatus === 'PASS' ? '✓ ALL TOPICS, LOS, FORMULAS, DECISION RULES & TRAPS COVERED' :
							 coverageStatus === 'REVISE' ? '⚠ REVISION NEEDED — SOME AREAS INCOMPLETE' :
							 '✗ INSTRUCTOR REVIEW REQUIRED'}
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
					Milven Finance School | Milven Summary Dashboard {s.year}
				</Typography.Text>
				<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>
					Simplified. Exam-focused. Built to help you pass.
				</Typography.Text>
			</div>
		</div>
	);
}

export default AdminSummarySheets;
