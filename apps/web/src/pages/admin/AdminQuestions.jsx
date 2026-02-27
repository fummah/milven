import React, { useEffect, useMemo, useState } from 'react';
import { Card, Form, Input, Button, Select, message, Space, Typography, Table, Upload, Modal, Drawer, Tag, Tooltip, Radio, Divider, Collapse, Spin } from 'antd';
import { DownloadOutlined, UploadOutlined, PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, PictureOutlined, DeleteFilled, FilterOutlined, QuestionCircleOutlined, BookOutlined, SearchOutlined, CalendarOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';

export function AdminQuestions() {
	const [form] = Form.useForm();
	const [bulkForm] = Form.useForm();
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();

	const [topics, setTopics] = useState([]);
	const [courses, setCourses] = useState([]);
	const [questions, setQuestions] = useState([]);
	const [loading, setLoading] = useState(false);
	const [bulkOpen, setBulkOpen] = useState(false);
	const [bulkResult, setBulkResult] = useState(null);
	const [bulkUploading, setBulkUploading] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewQuestion, setPreviewQuestion] = useState(null);
	const [previewLoading, setPreviewLoading] = useState(false);
	const [imageUploading, setImageUploading] = useState(false);
	const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

	// Filters
	const [filtersVisible, setFiltersVisible] = useState(false);
	const [courseId, setCourseId] = useState(searchParams.get('courseId') || '');
	const [topicId, setTopicId] = useState(() => {
		const topicIds = searchParams.get('topicIds');
		const topicId = searchParams.get('topicId');
		if (topicIds) return topicIds.split(',').filter(Boolean);
		if (topicId) return topicId;
		return '';
	});
	const [difficulty, setDifficulty] = useState(() => {
		const difficulties = searchParams.get('difficulties');
		const difficulty = searchParams.get('difficulty');
		if (difficulties) return difficulties.split(',').filter(Boolean);
		if (difficulty) return difficulty;
		return '';
	});
	const [wording, setWording] = useState(searchParams.get('q') || '');

	const loadMeta = async () => {
		try {
			const [{ data: t }, { data: c }] = await Promise.all([
				api.get('/api/cms/topics'),
				api.get('/api/cms/courses')
			]);
			setTopics(t?.topics || []);
			setCourses(c?.courses || []);
		} catch {
			setTopics([]);
			setCourses([]);
		}
	};

	const loadQuestions = async () => {
		if (loading) return; // Prevent multiple simultaneous requests
		setLoading(true);
		try {
			const params = {
				...(courseId ? { courseId } : {}),
				...(topicId ? (Array.isArray(topicId) ? { topicIds: topicId.join(',') } : { topicId }) : {}),
				...(difficulty ? (Array.isArray(difficulty) ? { difficulties: difficulty.join(',') } : { difficulty }) : {}),
				...(wording ? { q: wording } : {})
			};
			const { data } = await api.get('/api/cms/questions', { params });
			setQuestions(data?.questions || []);
		} catch {
			setQuestions([]);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadMeta();
		loadQuestions();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Initialize from URL params on mount
	useEffect(() => {
		const drawerParam = searchParams.get('drawer');
		if (drawerParam === 'open') {
			setDrawerOpen(true);
		}
		const urlCourseId = searchParams.get('courseId');
		if (urlCourseId && !courseId) {
			setCourseId(urlCourseId);
			// Pre-populate course in drawer form
			form.setFieldsValue({ courseId: urlCourseId });
		}
		const urlTopicId = searchParams.get('topicId');
		const urlTopicIds = searchParams.get('topicIds');
		if (urlTopicIds && !topicId) {
			setTopicId(urlTopicIds.split(',').filter(Boolean));
		} else if (urlTopicId && !topicId) {
			setTopicId(urlTopicId);
		}
		const urlDifficulty = searchParams.get('difficulty');
		const urlDifficulties = searchParams.get('difficulties');
		if (urlDifficulties && !difficulty) {
			setDifficulty(urlDifficulties.split(',').filter(Boolean));
		} else if (urlDifficulty && !difficulty) {
			setDifficulty(urlDifficulty);
		}
		const urlWording = searchParams.get('q');
		if (urlWording && !wording) {
			setWording(urlWording);
		}
		// Clean up drawer param from URL
		if (drawerParam === 'open') {
			const newParams = new URLSearchParams(searchParams);
			newParams.delete('drawer');
			setSearchParams(newParams, { replace: true });
		}
		// Only run on mount
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// State to track if filters should auto-apply
	const [applyFilters, setApplyFilters] = useState(false);

	// Debounced effect for filters to prevent excessive API calls
	useEffect(() => {
		if (!applyFilters) return; // Don't auto-apply until user clicks filter button or finishes typing
		const timeoutId = setTimeout(() => {
			const params = new URLSearchParams();
			if (courseId) params.set('courseId', courseId);
			if (Array.isArray(topicId) && topicId.length > 0) {
				params.set('topicIds', topicId.join(','));
			} else if (topicId && !Array.isArray(topicId)) {
				params.set('topicId', topicId);
			}
			if (Array.isArray(difficulty) && difficulty.length > 0) {
				params.set('difficulties', difficulty.join(','));
			} else if (difficulty && !Array.isArray(difficulty)) {
				params.set('difficulty', difficulty);
			}
			if (wording) params.set('q', wording);
			// Build current params string (excluding drawer)
			const currentParamsStr = Array.from(searchParams.entries())
				.filter(([key]) => key !== 'drawer')
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, val]) => `${key}=${val}`)
				.join('&');
			const newParamsStr = Array.from(params.entries())
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, val]) => `${key}=${val}`)
				.join('&');
			// Only update URL if params actually changed to prevent infinite loop
			if (currentParamsStr !== newParamsStr) {
				setSearchParams(params, { replace: true });
			}
			loadQuestions();
			setApplyFilters(false);
		}, 500); // 500ms debounce

		return () => clearTimeout(timeoutId);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [applyFilters, courseId, topicId, difficulty, wording]);

	// Auto-apply filters for wording (search input) as user types
	useEffect(() => {
		const timeoutId = setTimeout(() => {
			if (wording !== undefined) {
				setApplyFilters(true);
			}
		}, 800); // Longer debounce for search
		return () => clearTimeout(timeoutId);
	}, [wording]);

	const filteredTopicOptions = useMemo(() => {
		const filtered = courseId 
			? topics.filter(t => t.courseId === courseId)
			: topics;
		return filtered.map(t => ({ value: t.id, label: t.name }));
	}, [topics, courseId]);

	const filteredCoursesOptions = useMemo(() => {
		return (courses || []).map(c => ({ value: c.id, label: `${c.name} (${c.level})` }));
	}, [courses]);

	const selectedTopic = useMemo(() => (topics || []).find(t => t.id === topicId) || null, [topics, topicId]);

	const submit = async (values) => {
		try {
			setSubmitting(true);
			const chosenTopicId = values.topicId;
			const t = (topics || []).find(x => x.id === chosenTopicId);
			await api.post('/api/cms/questions', {
				stem: values.stem,
				type: values.type,
				level: t?.level ?? 'LEVEL1',
				difficulty: values.difficulty,
				topicId: chosenTopicId,
				marks: values.marks ? Number(values.marks) : undefined,
				vignetteText: values.type === 'VIGNETTE_MCQ' ? (values.vignetteText || undefined) : undefined,
				imageUrl: values.imageUrl || null,
				options: values.type !== 'CONSTRUCTED_RESPONSE'
					? (values.options || []).map(o => ({ text: o.text, isCorrect: !!o.isCorrect }))
					: [],
				qid: values.qid || null,
				los: values.los || null,
				traceSection: values.traceSection || null,
				tracePage: values.tracePage || null,
				keyFormulas: values.keyFormulas || null,
				workedSolution: values.workedSolution || null
			});
			message.success('Question created');
			form.resetFields();
			setDrawerOpen(false);
			loadQuestions();
		} catch (e) {
			message.error(e?.response?.data?.error || 'Failed (admin only)');
		} finally {
			setSubmitting(false);
		}
	};

	const deleteQuestion = async (questionId) => {
		try {
			await api.delete(`/api/cms/questions/${questionId}`);
			message.success('Question deleted');
			loadQuestions();
		} catch (e) {
			const errMsg = e?.response?.data?.error || e?.message || 'Delete failed';
			message.error(typeof errMsg === 'string' ? errMsg : 'Delete failed - question may be used in exams');
		}
	};

	const openPreview = async (questionId) => {
		setPreviewLoading(true);
		setPreviewOpen(true);
		try {
			const { data } = await api.get(`/api/cms/questions/${questionId}`);
			setPreviewQuestion(data.question);
		} catch {
			message.error('Failed to load question');
			setPreviewOpen(false);
		} finally {
			setPreviewLoading(false);
		}
	};

	const downloadTemplate = async () => {
		try {
			const res = await api.get('/api/cms/questions/template.xlsx', { responseType: 'blob' });
			const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'question_template.xlsx';
			a.click();
			window.URL.revokeObjectURL(url);
		} catch {
			message.error('Could not download template');
		}
	};

	const doBulkUpload = async (content, isExcel = false) => {
		try {
			setBulkUploading(true);
			const payload = isExcel ? { xlsx: content } : { csv: content };
			const { data } = await api.post('/api/cms/questions/bulk-upload', payload);
			setBulkResult(data);
			message.success(`Created ${data?.created ?? 0} questions`);
			loadQuestions();
		} catch (e) {
			message.error(e?.response?.data?.error || 'Upload failed');
		} finally {
			setBulkUploading(false);
		}
	};

	const columns = [
		{ 
			title: 'Question', 
			dataIndex: 'stem', 
			ellipsis: true, 
			render: (text, record) => (
				<div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
					<div className="icon-badge-sm icon-badge-purple">
						<QuestionCircleOutlined style={{ fontSize: 14 }} />
					</div>
					<div style={{ flex: 1, minWidth: 0 }}>
						<Typography.Text style={{ display: 'block', color: '#1e293b' }}>
							{text.length > 80 ? `${text.substring(0, 80)}...` : text}
						</Typography.Text>
						{record.qid && (
							<Typography.Text type="secondary" style={{ fontSize: 11 }}>
								ID: {record.qid}
							</Typography.Text>
						)}
					</div>
				</div>
			)
		},
		{ 
			title: 'Type', 
			dataIndex: 'type', 
			width: 150, 
			render: (v) => {
				const iconMap = { MCQ: <CheckCircleOutlined />, VIGNETTE_MCQ: <BookOutlined />, CONSTRUCTED_RESPONSE: <EditOutlined /> };
				return <Tag icon={iconMap[v]} color={v === 'MCQ' ? 'blue' : (v === 'VIGNETTE_MCQ' ? 'purple' : 'cyan')}>{v === 'CONSTRUCTED_RESPONSE' ? 'Constructed' : v}</Tag>;
			}
		},
		{ 
			title: 'Difficulty', 
			dataIndex: 'difficulty', 
			width: 120, 
			render: (d) => <Tag color={d === 'EASY' ? 'success' : d === 'MEDIUM' ? 'warning' : 'error'}>{d}</Tag> 
		},
		{ 
			title: 'Marks', 
			dataIndex: 'marks', 
			width: 90,
			render: (v) => <Typography.Text strong style={{ color: '#3b82f6' }}>{v || 1}</Typography.Text>
		},
		{ 
			title: 'Topic', 
			dataIndex: 'topicId', 
			width: 180,
			ellipsis: true,
			render: (topicId) => {
				const topic = topics.find(t => t.id === topicId);
				return topic ? (
					<Tag 
						icon={<BookOutlined />} 
						style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
						title={topic.name}
					>
						{topic.name.length > 20 ? `${topic.name.substring(0, 20)}...` : topic.name}
					</Tag>
				) : <Tag>—</Tag>;
			}
		},
		{ 
			title: 'Created', 
			dataIndex: 'createdAt', 
			width: 120, 
			render: v => v ? (
				<span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>
					<CalendarOutlined />
					{new Date(v).toLocaleDateString()}
				</span>
			) : '-' 
		},
		{
			title: 'Actions',
			width: 140,
			fixed: 'right',
			render: (_, record) => (
				<Space size={8}>
					<Tooltip title="Preview">
						<button className="action-btn action-btn-view" onClick={() => openPreview(record.id)}>
							<EyeOutlined />
						</button>
					</Tooltip>
					<Tooltip title="Edit">
						<button className="action-btn action-btn-edit" onClick={() => navigate(`/admin/questions/${record.id}/edit`)}>
							<EditOutlined />
						</button>
					</Tooltip>
					<Tooltip title="Delete">
						<button className="action-btn action-btn-delete" onClick={() => deleteQuestion(record.id)}>
							<DeleteOutlined />
						</button>
					</Tooltip>
				</Space>
			)
		}
	];

	// Check if any filters are active
	const hasActiveFilters = courseId || (Array.isArray(topicId) ? topicId.length > 0 : topicId) || (Array.isArray(difficulty) ? difficulty.length > 0 : difficulty) || wording;

	return (
		<Space key="admin-questions-page" direction="vertical" size={16} style={{ width: '100%' }}>
			{/* Page Header */}
			<div className="page-header">
				<div>
					<Typography.Title level={3} className="page-header-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
						<div className="icon-badge icon-badge-purple">
							<QuestionCircleOutlined style={{ fontSize: 20 }} />
						</div>
						Question Bank
					</Typography.Title>
					<Typography.Text type="secondary" className="page-header-subtitle">
						Manage exam questions, bulk upload, and organize by topic
					</Typography.Text>
				</div>
				<Space>
					<Button 
						icon={<DownloadOutlined />} 
						onClick={downloadTemplate}
						style={{ borderRadius: 10 }}
					>
						Excel Template
					</Button>
					<Button 
						icon={<UploadOutlined />} 
						onClick={() => { setBulkOpen(true); setBulkResult(null); bulkForm.resetFields(); }}
						style={{ borderRadius: 10 }}
					>
						Bulk Upload
					</Button>
					<Button 
						type="primary" 
						icon={<PlusOutlined />} 
						onClick={() => {
							setDrawerOpen(true);
							form.resetFields();
							form.setFieldsValue({ type: 'MCQ', difficulty: 'MEDIUM', marks: 1, options: [{ text: '', isCorrect: false }] });
						}}
						style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', border: 'none', borderRadius: 10, height: 40, fontWeight: 500 }}
					>
						Add Question
					</Button>
				</Space>
			</div>

			{/* Filter Toggle Button */}
			<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
				<Button 
					icon={<FilterOutlined />} 
					onClick={() => setFiltersVisible(!filtersVisible)}
					type={hasActiveFilters ? 'primary' : 'default'}
					style={{ borderRadius: 10 }}
				>
					{filtersVisible ? 'Hide Filters' : 'Show Filters'}
					{hasActiveFilters && !filtersVisible && ' (Active)'}
				</Button>
				{hasActiveFilters && !filtersVisible && (
					<Button 
						size="small" 
						onClick={() => {
							setCourseId('');
							setTopicId('');
							setDifficulty('');
							setWording('');
							form.setFieldsValue({ courseId: undefined });
							setApplyFilters(true);
						}}
						style={{ borderRadius: 8 }}
					>
						Clear Filters
					</Button>
				)}
			</div>

			{/* Collapsible Filters */}
			{filtersVisible && (
				<Card size="small" className="modern-card">
					<Space wrap size={12}>
						<Form.Item label="Course" style={{ margin: 0 }}>
							<Select
								style={{ minWidth: 200, borderRadius: 10 }}
								allowClear
								placeholder="All courses"
								value={courseId || undefined}
								onChange={(v) => {
									setCourseId(v || '');
									setTopicId('');
								}}
								options={filteredCoursesOptions}
								showSearch
								optionFilterProp="label"
							/>
						</Form.Item>
						<Form.Item label="Topic" style={{ margin: 0 }}>
							<Select
								mode="multiple"
								style={{ minWidth: 200, borderRadius: 10 }}
								allowClear
								placeholder="All topics"
								value={Array.isArray(topicId) ? topicId : (topicId ? [topicId] : [])}
								onChange={(v) => {
									setTopicId(Array.isArray(v) ? (v.length > 0 ? v : '') : (v || ''));
								}}
								options={filteredTopicOptions}
								showSearch
								optionFilterProp="label"
							/>
						</Form.Item>
						<Form.Item name="difficulty" label="Difficulty" style={{ margin: 0 }}>
							<Select
								mode="multiple"
								style={{ minWidth: 200, borderRadius: 10 }}
								allowClear
								placeholder="All"
								value={Array.isArray(difficulty) ? difficulty : (difficulty ? [difficulty] : [])}
								onChange={(v) => {
									setDifficulty(Array.isArray(v) ? (v.length > 0 ? v : '') : (v || ''));
								}}
								options={[
									{ value: 'EASY', label: 'Easy' },
									{ value: 'MEDIUM', label: 'Medium' },
									{ value: 'HARD', label: 'Hard' }
								]}
							/>
						</Form.Item>
						<Form.Item label="Search" style={{ margin: 0 }}>
							<Input
								style={{ minWidth: 200, borderRadius: 10 }}
								placeholder="Search in question text..."
								prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
								value={wording}
								onChange={(e) => setWording(e.target.value)}
							/>
						</Form.Item>
						<Button 
							type="primary" 
							onClick={() => setApplyFilters(true)}
							style={{ borderRadius: 10, background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', border: 'none' }}
						>
							Apply Filters
						</Button>
						<Button 
							onClick={() => {
								setCourseId('');
								setTopicId('');
								setDifficulty('');
								setWording('');
								form.setFieldsValue({ courseId: undefined });
								setApplyFilters(true);
							}}
							style={{ borderRadius: 10 }}
						>
							Clear Filters
						</Button>
					</Space>
				</Card>
			)}

			{/* Questions Table */}
			<Card className="modern-card">
				<div style={{ marginBottom: 16 }}>
					<Typography.Text type="secondary">
						Showing <strong>{questions.length}</strong> questions
					</Typography.Text>
				</div>
				<Table
					rowKey="id"
					loading={loading}
					dataSource={questions}
					columns={columns}
					className="modern-table"
					scroll={{ x: 1200 }}
					pagination={{ 
						pageSize: 10, 
						showSizeChanger: true, 
						pageSizeOptions: ['10', '20', '50'],
						showTotal: (total) => `${total} questions`
					}}
				/>
			</Card>

			<Modal
				title="Bulk Upload Questions (Excel/CSV)"
				open={bulkOpen}
				onCancel={() => !bulkUploading && setBulkOpen(false)}
				closable={!bulkUploading}
				maskClosable={!bulkUploading}
				onOk={() => {
					const csv = bulkForm.getFieldValue('csv');
					const xlsx = bulkForm.getFieldValue('xlsx');
					if (!csv && !xlsx) return message.error('Upload an Excel file or paste CSV content');
					if (xlsx) {
						doBulkUpload(xlsx, true);
					} else {
						doBulkUpload(csv, false);
					}
				}}
				okText={bulkUploading ? 'Uploading...' : 'Upload'}
				okButtonProps={{ loading: bulkUploading, style: { background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', border: 'none', borderRadius: 8 } }}
				cancelButtonProps={{ disabled: bulkUploading, style: { borderRadius: 8 } }}
				className="modern-modal"
			>
				<Spin spinning={bulkUploading} tip="Uploading questions...">
					<Form form={bulkForm} layout="vertical">
						<Form.Item label="Upload Excel File (Recommended)" name="xlsx">
							<Upload
								beforeUpload={(file) => {
									const reader = new FileReader();
									reader.onload = (e) => {
										const base64 = btoa(
											new Uint8Array(e.target?.result).reduce((data, byte) => data + String.fromCharCode(byte), '')
										);
										bulkForm.setFieldsValue({ xlsx: base64, csv: '' });
									};
									reader.readAsArrayBuffer(file);
									return false;
								}}
								maxCount={1}
								accept=".xlsx,.xls"
								disabled={bulkUploading}
							>
								<Button icon={<UploadOutlined />} disabled={bulkUploading}>Select Excel File (.xlsx)</Button>
							</Upload>
						</Form.Item>
						<Divider plain>Or paste CSV</Divider>
						<Form.Item label="Paste CSV Content" name="csv">
							<Input.TextArea rows={6} placeholder="Paste CSV here..." onChange={() => bulkForm.setFieldsValue({ xlsx: '' })} disabled={bulkUploading} />
						</Form.Item>
					</Form>
				</Spin>

				{bulkResult && (
					<div style={{ marginTop: 12 }}>
						<Typography.Text strong>Result</Typography.Text>
						<div>Created: {bulkResult.created ?? 0}</div>
						{(bulkResult.errors || []).length > 0 && (
							<div style={{ marginTop: 8 }}>
								<Typography.Text type="danger">Errors</Typography.Text>
								<Table
									rowKey={(r) => `${r.row}-${r.error}`}
									dataSource={bulkResult.errors}
									pagination={{ pageSize: 5 }}
									columns={[
										{ title: 'Row', dataIndex: 'row', width: 80 },
										{ title: 'Error', dataIndex: 'error' }
									]}
								/>
							</div>
						)}
					</div>
				)}
			</Modal>

			{/* Question Builder Drawer */}
			<Drawer
				key="question-builder-drawer"
				title="Add Question"
				open={drawerOpen}
				onClose={() => {
					setDrawerOpen(false);
					form.resetFields();
					if (searchParams.get('drawer')) {
						const params = new URLSearchParams(searchParams);
						params.delete('drawer');
						setSearchParams(params, { replace: true });
					}
				}}
				width={720}
				className="modern-drawer"
			>
				<Form layout="vertical" form={form} onFinish={submit} initialValues={{ type: 'MCQ', difficulty: 'MEDIUM', marks: 1, options: [{ text: '', isCorrect: false }] }}>
					<Form.Item name="courseId" label="Course" rules={[{ required: false }]}>
						<Select
							placeholder="Select course to filter topics"
							options={filteredCoursesOptions}
							showSearch
							optionFilterProp="label"
							allowClear
							onChange={(v) => {
								form.setFieldsValue({ topicId: undefined });
							}}
						/>
					</Form.Item>
					<Form.Item noStyle shouldUpdate={(prev, curr) => prev.courseId !== curr.courseId}>
						{({ getFieldValue }) => {
							const selectedCourseId = getFieldValue('courseId');
							const topicOpts = selectedCourseId
								? topics.filter(t => t.courseId === selectedCourseId || t.course?.id === selectedCourseId).map(t => ({ value: t.id, label: t.name }))
								: filteredTopicOptions;
							return (
								<Form.Item name="topicId" label="Topic" rules={[{ required: true }]}>
									<Select
										placeholder="Select topic"
										options={topicOpts}
										showSearch
										optionFilterProp="label"
									/>
								</Form.Item>
							);
						}}
					</Form.Item>
					<Form.Item name="stem" label="Question Text" rules={[{ required: true, min: 5 }]}>
						<Input.TextArea rows={3} placeholder="Enter question stem..." />
					</Form.Item>
					<Form.Item noStyle shouldUpdate>
						{({ getFieldValue, setFieldsValue }) => {
							const imageUrl = getFieldValue('imageUrl');
							const doUpload = async ({ file, onSuccess, onError }) => {
								try {
									setImageUploading(true);
									const fd = new FormData();
									fd.append('file', file);
									// Don't set Content-Type header - let axios set it automatically with boundary
									const response = await api.post('/api/cms/upload', fd);
									if (response?.data?.url) {
										setFieldsValue({ imageUrl: response.data.url });
										onSuccess?.(response.data, file);
										message.success('Image uploaded');
									} else {
										throw new Error('No URL in response');
									}
								} catch (e) {
									const errorMsg = e?.response?.data?.error || e?.message || 'Upload failed';
									message.error(errorMsg);
									onError?.(e);
								} finally {
									setImageUploading(false);
								}
							};
							const asUrl = (u) => {
								if (!u) return u;
								// Don't try to display local file paths
								if (u.startsWith('file://') || u.startsWith('C:/') || u.includes('fakepath')) return null;
								if (u.startsWith('http://') || u.startsWith('https://')) return u;
								if (u.startsWith('/uploads')) return `${API_URL}${u}`;
								return u;
							};
							const displayUrl = asUrl(imageUrl);
							return (
								<Form.Item name="imageUrl" label="Question Image (Optional)">
									<Space direction="vertical" style={{ width: '100%' }}>
										{displayUrl ? (
											<div style={{ position: 'relative', display: 'inline-block' }}>
												<img
													src={displayUrl}
													alt="Question preview"
													style={{ maxWidth: '100%', maxHeight: 300, border: '1px solid #d9d9d9', borderRadius: 4 }}
													onError={(e) => {
														e.target.style.display = 'none';
													}}
												/>
												<Button
													type="text"
													danger
													icon={<DeleteFilled />}
													style={{ position: 'absolute', top: 4, right: 4 }}
													onClick={() => {
														setFieldsValue({ imageUrl: null });
													}}
												/>
											</div>
										) : imageUrl && imageUrl.includes('fakepath') ? (
											<Typography.Text type="secondary">Uploading...</Typography.Text>
										) : (
											<Upload
												customRequest={doUpload}
												showUploadList={false}
												accept="image/*"
												disabled={imageUploading}
											>
												<Button icon={<PictureOutlined />} loading={imageUploading}>
													Upload Image
												</Button>
											</Upload>
										)}
									</Space>
								</Form.Item>
							);
						}}
					</Form.Item>
					<Space size="large" wrap>
						<Form.Item name="type" label="Type" rules={[{ required: true }]}>
							<Select style={{ minWidth: 180 }} options={[
								{ value: 'MCQ', label: 'MCQ' },
								{ value: 'VIGNETTE_MCQ', label: 'Vignette MCQ' },
								{ value: 'CONSTRUCTED_RESPONSE', label: 'Constructed Response' }
							]} />
						</Form.Item>
						<Form.Item name="difficulty" label="Difficulty" rules={[{ required: true }]}>
							<Select style={{ minWidth: 160 }} options={[
								{ value: 'EASY', label: 'Easy' },
								{ value: 'MEDIUM', label: 'Medium' },
								{ value: 'HARD', label: 'Hard' }
							]} />
						</Form.Item>
						<Form.Item name="marks" label="Marks" rules={[{ required: true }]}>
							<Input type="number" min={1} style={{ width: 120 }} />
						</Form.Item>
					</Space>
					<Divider orientation="left" plain style={{ marginTop: 24 }}>Optional Fields</Divider>
					<Space size="large" wrap style={{ width: '100%' }}>
						<Form.Item name="qid" label="QID (External ID)">
							<Input placeholder="e.g. IND9-001" style={{ width: 160 }} />
						</Form.Item>
						<Form.Item name="los" label="LOS (Learning Outcome Statement)">
							<Input placeholder="e.g. t-test for correlation" style={{ width: 280 }} />
						</Form.Item>
					</Space>
					<Space size="large" wrap style={{ width: '100%' }}>
						<Form.Item name="traceSection" label="Trace (Section)">
							<Input placeholder="e.g. Section 4.2" style={{ width: 180 }} />
						</Form.Item>
						<Form.Item name="tracePage" label="Trace (Page)">
							<Input placeholder="e.g. 125" style={{ width: 120 }} />
						</Form.Item>
					</Space>
					<Form.Item name="keyFormulas" label="Key Formula(s)">
						<Input.TextArea rows={2} placeholder="e.g. t = r√((n-2)/(1-r²))" />
					</Form.Item>
					<Form.Item name="workedSolution" label="Worked Solution (concise)">
						<Input.TextArea rows={3} placeholder="Brief step-by-step solution..." />
					</Form.Item>
					<Form.Item noStyle shouldUpdate>
						{({ getFieldValue }) => {
							const type = getFieldValue('type');
							if (type === 'VIGNETTE_MCQ') {
								return (
									<Form.Item name="vignetteText" label="Vignette Text">
										<Input.TextArea rows={4} placeholder="Enter vignette passage..." />
									</Form.Item>
								);
							}
							return null;
						}}
					</Form.Item>
					<Form.List name="options">
						{(fields, { add, remove }) => (
							<>
								<Form.Item noStyle shouldUpdate>
									{({ getFieldValue }) => {
										const type = getFieldValue('type');
										if (type === 'CONSTRUCTED_RESPONSE') return null;
										return (
											<Space direction="vertical" style={{ width: '100%' }}>
												<Typography.Text strong>Options</Typography.Text>
												{fields.map(field => (
													<Space key={field.key} align="baseline" style={{ display: 'flex', width: '100%' }}>
														<Form.Item {...field} name={[field.name, 'text']} rules={[{ required: true }]} style={{ flex: 1 }}>
															<Input placeholder="Option text" />
														</Form.Item>
														<Form.Item {...field} name={[field.name, 'isCorrect']}>
															<Select
																style={{ width: 140 }}
																options={[{ value: true, label: 'Correct' }, { value: false, label: 'Incorrect' }]}
															/>
														</Form.Item>
														<Button onClick={() => remove(field.name)}>Remove</Button>
													</Space>
												))}
												<Button onClick={() => add({ text: '', isCorrect: false })}>Add Option</Button>
											</Space>
										);
									}}
								</Form.Item>
							</>
						)}
					</Form.List>
					<Space style={{ marginTop: 12, width: '100%', justifyContent: 'flex-end' }}>
						<Button 
							onClick={() => {
								setDrawerOpen(false);
								form.resetFields();
								const params = new URLSearchParams(searchParams);
								params.delete('drawer');
								setSearchParams(params, { replace: true });
							}}
							style={{ borderRadius: 8 }}
						>
							Cancel
						</Button>
						<Button 
							type="primary" 
							loading={submitting} 
							htmlType="submit"
							style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', border: 'none', borderRadius: 8 }}
						>
							Create Question
						</Button>
					</Space>
				</Form>
			</Drawer>

			{/* Question Preview Drawer */}
			<Drawer
				title="Question Preview"
				open={previewOpen}
				onClose={() => {
					setPreviewOpen(false);
					setPreviewQuestion(null);
				}}
				width={720}
				className="modern-drawer"
			>
				{previewLoading ? (
					<Typography.Text>Loading...</Typography.Text>
				) : previewQuestion ? (
					<Space direction="vertical" size={16} style={{ width: '100%' }}>
						<Card size="small">
							<Space direction="vertical" size={8} style={{ width: '100%' }}>
								<Space>
									<Tag color={previewQuestion.type === 'MCQ' ? 'blue' : (previewQuestion.type === 'VIGNETTE_MCQ' ? 'purple' : 'default')}>
										{previewQuestion.type}
									</Tag>
									<Tag color={previewQuestion.difficulty === 'EASY' ? 'green' : previewQuestion.difficulty === 'MEDIUM' ? 'orange' : 'red'}>
										{previewQuestion.difficulty}
									</Tag>
									<Typography.Text type="secondary">Marks: {previewQuestion.marks || 1}</Typography.Text>
								</Space>
								{previewQuestion.vignette?.text && (
									<>
										<Divider style={{ margin: '8px 0' }} />
										<Typography.Text strong>Vignette:</Typography.Text>
										<Typography.Paragraph style={{ margin: 0, padding: '8px', background: '#f5f5f5', borderRadius: 4 }}>
											{previewQuestion.vignette.text}
										</Typography.Paragraph>
									</>
								)}
								<Divider style={{ margin: '8px 0' }} />
								<Typography.Text strong>Question:</Typography.Text>
								<Typography.Paragraph style={{ margin: 0 }}>{previewQuestion.stem}</Typography.Paragraph>
							</Space>
						</Card>
						{previewQuestion.type !== 'CONSTRUCTED_RESPONSE' && (previewQuestion.options || []).length > 0 && (
							<Card size="small" title="Options">
								<Radio.Group value={(previewQuestion.options || []).find(o => o.isCorrect)?.id} disabled>
									<Space direction="vertical" style={{ width: '100%' }}>
										{(previewQuestion.options || []).map((option, idx) => (
											<Radio key={option.id || idx} value={option.id || idx}>
												<Space>
													<span>{option.text}</span>
													{option.isCorrect && <Tag color="green">Correct</Tag>}
												</Space>
											</Radio>
										))}
									</Space>
								</Radio.Group>
							</Card>
						)}
						{previewQuestion.type === 'CONSTRUCTED_RESPONSE' && (
							<Card size="small">
								<Typography.Text type="secondary">Constructed Response - No multiple choice options</Typography.Text>
							</Card>
						)}
						{(previewQuestion.qid || previewQuestion.los || previewQuestion.traceSection || previewQuestion.tracePage || previewQuestion.keyFormulas || previewQuestion.workedSolution) && (
							<Card size="small" title="Additional Info">
								<Space direction="vertical" size={8} style={{ width: '100%' }}>
									{previewQuestion.qid && (
										<div><Typography.Text strong>QID:</Typography.Text> <Typography.Text>{previewQuestion.qid}</Typography.Text></div>
									)}
									{previewQuestion.los && (
										<div><Typography.Text strong>LOS:</Typography.Text> <Typography.Text>{previewQuestion.los}</Typography.Text></div>
									)}
									{(previewQuestion.traceSection || previewQuestion.tracePage) && (
										<div>
											<Typography.Text strong>Trace:</Typography.Text>{' '}
											<Typography.Text>
												{previewQuestion.traceSection && <span>{previewQuestion.traceSection}</span>}
												{previewQuestion.traceSection && previewQuestion.tracePage && <span>, </span>}
												{previewQuestion.tracePage && <span>Page {previewQuestion.tracePage}</span>}
											</Typography.Text>
										</div>
									)}
									{previewQuestion.keyFormulas && (
										<div>
											<Typography.Text strong>Key Formula(s):</Typography.Text>
											<Typography.Paragraph style={{ margin: '4px 0 0 0', padding: '6px', background: '#f5f5f5', borderRadius: 4, fontFamily: 'monospace' }}>
												{previewQuestion.keyFormulas}
											</Typography.Paragraph>
										</div>
									)}
									{previewQuestion.workedSolution && (
										<div>
											<Typography.Text strong>Worked Solution:</Typography.Text>
											<Typography.Paragraph style={{ margin: '4px 0 0 0', padding: '6px', background: '#e6f7ff', borderRadius: 4 }}>
												{previewQuestion.workedSolution}
											</Typography.Paragraph>
										</div>
									)}
								</Space>
							</Card>
						)}
					</Space>
				) : null}
			</Drawer>
		</Space>
	);
}


