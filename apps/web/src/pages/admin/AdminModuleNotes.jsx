import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, Form, Input, Button, Select, message, Space, Typography, Table, Modal, Drawer, Tag, Tooltip, Switch, InputNumber, Row, Col, Divider, Empty, Spin, Checkbox, Pagination } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SearchOutlined, BookOutlined, RobotOutlined, ThunderboltOutlined, CheckCircleOutlined, StarFilled, StarOutlined, FilePdfOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import MathText from '../../components/MathText';
import { ModuleNotePreviewCard } from '../../components/ModuleNotePreviewCard';
import AdminModuleNotePdfDrawer from '../../components/moduleNotePdfs/AdminModuleNotePdfDrawer';
import ModuleNoteResourceCard from '../../components/resources/ModuleNoteResourceCard';

const LEVELS = [
	{ value: 'LEVEL1', label: 'Level I' },
	{ value: 'LEVEL2', label: 'Level II' },
	{ value: 'LEVEL3', label: 'Level III' },
];
const LEVEL_COLORS = { LEVEL1: 'blue', LEVEL2: 'purple', LEVEL3: 'gold' };
const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };
const STATUS_COLORS = { DRAFT: 'default', PUBLISHED: 'green' };

export function AdminModuleNotes() {
	const navigate = useNavigate();
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
	const [pdfDrawerOpen, setPdfDrawerOpen] = useState(false);
	const [pdfEditing, setPdfEditing] = useState(null);
	const [replacePdfTarget, setReplacePdfTarget] = useState(null);
	const [pdfReplacing, setPdfReplacing] = useState(false);
	const replacePdfInputRef = React.useRef(null);

	// AI Generate
	const [aiModalOpen, setAiModalOpen] = useState(false);
	const [aiGenerating, setAiGenerating] = useState(false);
	const [aiCourseId, setAiCourseId] = useState(null);
	const [aiVolumeId, setAiVolumeId] = useState(null);
	const [aiModuleId, setAiModuleId] = useState(null);
	const [aiTopicId, setAiTopicId] = useState(null);
	const [aiCount, setAiCount] = useState(null);
	const [aiYear, setAiYear] = useState(2026);

	// AI Provider / Model selection (mirrors AdminQuestions.jsx)
	const [aiProviders, setAiProviders] = useState([]);
	const [aiActiveProvider, setAiActiveProvider] = useState('openai');
	const [aiProvider, setAiProvider] = useState(undefined);
	const [aiModel, setAiModel] = useState(undefined);
	const [aiModels, setAiModels] = useState([]);
	const [aiModelsLoading, setAiModelsLoading] = useState(false);

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
	const [filterStatus, setFilterStatus] = useState(null);
	const [filterSource, setFilterSource] = useState(null);
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
	const resourceVolumes = useMemo(() => filterCourseId ? volumes.filter(v => v.courseLinks?.some(cl => cl.courseId === filterCourseId)) : volumes, [filterCourseId, volumes]);
	const resourceModules = useMemo(() => modules.filter(m => (!filterCourseId || m.courseId === filterCourseId) && (!filterVolumeId || m.volumeId === filterVolumeId)), [modules, filterCourseId, filterVolumeId]);
	const resourceTopics = useMemo(() => topics.filter(t => (!filterCourseId || t.courseId === filterCourseId) && (!filterModuleId || t.moduleId === filterModuleId)), [topics, filterCourseId, filterModuleId]);

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
			if (filterVolumeId) params.volumeId = filterVolumeId;
			if (filterModuleId) params.moduleId = filterModuleId;
			if (filterTopicId) params.topicId = filterTopicId;
			if (filterStatus) params.status = filterStatus;
			if (filterSource) params.source = filterSource;
			if (searchText) params.search = searchText;
			const res = await api.get('/api/module-notes/unified', { params });
			setNotes(res.data?.resources || []);
			setTotal(res.data?.total || 0);
		} catch { message.error('Failed to load module notes'); } finally { setLoading(false); }
	}, [page, pageSize, filterLevel, filterCourseId, filterVolumeId, filterModuleId, filterTopicId, filterStatus, filterSource, searchText]);

	useEffect(() => { fetchNotes(); }, [fetchNotes]);

	const hasProcessingPdf = useMemo(() => notes.some(item => item.type === 'PDF' && ['UPLOADED', 'INDEXING'].includes(item.processingStatus)), [notes]);
	useEffect(() => {
		if (!hasProcessingPdf) return undefined;
		let cancelled = false;
		let timer = null;
		const poll = async () => {
			if (cancelled) return;
			try { await fetchNotes(); } catch {}
			if (!cancelled) timer = setTimeout(poll, 6000);
		};
		timer = setTimeout(poll, 6000);
		return () => { cancelled = true; if (timer) clearTimeout(timer); };
	}, [hasProcessingPdf, fetchNotes]);

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

	const openPdfResource = resource => navigate(`/learning/module-notes-pdf/${resource.resourceId || resource.id}${resource.matchPage ? `?page=${resource.matchPage}` : ''}`);
	const editPdfResource = resource => { setPdfEditing(resource); setPdfDrawerOpen(true); };
	const togglePdfStatus = async resource => {
		try {
			const publicationStatus = resource.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
			await api.put(`/api/module-note-pdfs/${resource.resourceId || resource.id}`, { publicationStatus });
			message.success(publicationStatus === 'PUBLISHED' ? 'Published' : 'Moved to draft');
			fetchNotes();
		} catch (err) { message.error(err?.response?.data?.error || 'Failed to update PDF status'); }
	};
	const downloadPdf = async resource => {
		try {
			const res = await api.get(`/api/module-note-pdfs/${resource.resourceId || resource.id}/download`, { responseType: 'blob' });
			const url = URL.createObjectURL(res.data);
			const anchor = document.createElement('a');
			anchor.href = url; anchor.download = resource.originalFilename || 'module-notes.pdf'; anchor.click();
			URL.revokeObjectURL(url);
		} catch { message.error('Could not download this PDF'); }
	};
	const triggerPdfReplace = resource => { setReplacePdfTarget(resource); setTimeout(() => replacePdfInputRef.current?.click(), 0); };
	const replacePdfFile = async event => {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file || !replacePdfTarget) return;
		setPdfReplacing(true);
		try {
			const body = new FormData();
			body.append('file', file);
			await api.post(`/api/module-note-pdfs/${replacePdfTarget.resourceId || replacePdfTarget.id}/replace`, body, { headers: { 'Content-Type': 'multipart/form-data' } });
			message.success('Replacement PDF uploaded. Indexing has started.');
			fetchNotes();
		} catch (err) { message.error(err?.response?.data?.error || 'Could not replace the PDF'); }
		finally { setPdfReplacing(false); setReplacePdfTarget(null); }
	};
	const deleteResource = resource => {
		if (resource.type === 'PDF') {
			Modal.confirm({ title: 'Delete PDF Module Notes', content: 'The PDF and its indexed pages will be removed. This cannot be undone.', okText: 'Delete', okType: 'danger', onOk: async () => {
				try { await api.delete(`/api/module-note-pdfs/${resource.resourceId || resource.id}`); message.success('Deleted'); fetchNotes(); }
				catch (err) { message.error(err?.response?.data?.error || 'Failed to delete'); }
			} });
			return;
		}
		handleDelete(resource.resourceId || resource.id);
	};
	const toggleResourceStatus = resource => resource.type === 'PDF' ? togglePdfStatus(resource) : toggleStatus(resource);
	const resourcePreview = resource => {
		if (resource.type === 'PDF') openPdfResource(resource);
		else { setPreviewNote(resource); setPreviewOpen(true); }
	};

	const fetchAiModels = async (provider) => {
		const prov = provider || aiProvider || aiActiveProvider || 'openai';
		setAiModelsLoading(true);
		setAiModels([]);
		try {
			const { data } = await api.get(`/api/settings/ai-models?provider=${prov}`);
			const all = data.models || [];
			const filtered = prov === 'openai'
				? all.filter(m => ['gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4-pro', 'o3', 'o1-pro', 'gpt-5.4', 'gpt-5.2-pro', 'gpt-5.2', 'gpt-4.1', 'gpt-4o', 'gpt-4-turbo', 'gpt-5-mini', 'gpt-5.4-mini', 'o4-mini', 'gpt-4.1-mini', 'gpt-4o-mini'].some(approved => m.id.startsWith(approved)))
				: all;
			setAiModels(filtered);
			setAiModel(prev => prev || filtered[0]?.id);
		} catch {
			// silent — user can still generate; notFoundContent explains
		} finally {
			setAiModelsLoading(false);
		}
	};

	const fetchAiConfig = async () => {
		try {
			const { data } = await api.get('/api/settings/ai-config');
			setAiProviders(data.providers || []);
			const prov = data.activeProvider || 'openai';
			setAiActiveProvider(prov);
			setAiProvider(prev => prev || prov);
			setAiModel(prev => prev || data.activeModel || undefined);
			fetchAiModels(prov);
		} catch {
			// ignore — generation surfaces provider errors
		}
	};

	const openAiModal = () => {
		setAiModalOpen(true);
		fetchAiConfig();
	};

	const handleAiGenerate = async () => {
		if (!aiCourseId) return message.warning('Please select a course');
		setAiGenerating(true);
		try {
			const selectedCourse = courses.find(c => c.id === aiCourseId);
			if (!selectedCourse) return message.warning('Course not found');
			const payload = { courseId: aiCourseId, volumeId: aiVolumeId || undefined, moduleId: aiModuleId || undefined, topicId: aiTopicId || undefined, level: selectedCourse.level, year: aiYear, count: aiCount || undefined, provider: aiProvider || undefined, model: aiModel || undefined };
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
				buffer = parts.pop() || '';
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
				if (Array.isArray(data?.skipped) && data.skipped.length > 0) {
					message.warning(`${data.skipped.length} item(s) skipped (failed generation).`);
				}
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
					<Col xs={24} sm={12} md={5}><Input prefix={<SearchOutlined />} placeholder="Search notes and PDFs..." value={searchText} onChange={e => { setSearchText(e.target.value); setPage(1); }} allowClear /></Col>
					<Col xs={12} sm={6} md={2}><Select placeholder="Level" value={filterLevel} onChange={v => { setFilterLevel(v); setPage(1); }} options={[{ value: null, label: 'All Levels' }, ...LEVELS]} style={{ width: '100%' }} allowClear /></Col>
					<Col xs={12} sm={6} md={3}><Select placeholder="Course" value={filterCourseId} onChange={v => { setFilterCourseId(v); setFilterVolumeId(null); setFilterModuleId(null); setFilterTopicId(null); setPage(1); }} options={[{ value: null, label: 'All Courses' }, ...courses.map(c => ({ value: c.id, label: c.name }))]} style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" /></Col>
					<Col xs={12} sm={6} md={3}><Select placeholder="Volume" value={filterVolumeId} onChange={v => { setFilterVolumeId(v); setFilterModuleId(null); setFilterTopicId(null); setPage(1); }} options={[{ value: null, label: 'All Volumes' }, ...resourceVolumes.map(v => ({ value: v.id, label: v.name }))]} style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" /></Col>
					<Col xs={12} sm={6} md={3}><Select placeholder="Module" value={filterModuleId} onChange={v => { setFilterModuleId(v); setFilterTopicId(null); setPage(1); }} options={[{ value: null, label: 'All Modules' }, ...resourceModules.map(m => ({ value: m.id, label: m.name }))]} style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" /></Col>
					<Col xs={12} sm={6} md={3}><Select placeholder="Topic" value={filterTopicId} onChange={v => { setFilterTopicId(v); setPage(1); }} options={[{ value: null, label: 'All Topics' }, ...resourceTopics.map(t => ({ value: t.id, label: t.name }))]} style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" /></Col>
					<Col xs={12} sm={6} md={2}><Select placeholder="Source" value={filterSource} onChange={v => { setFilterSource(v); setPage(1); }} options={[{ value: null, label: 'All Sources' }, { value: 'AI', label: 'AI Generated' }, { value: 'MANUAL', label: 'Manual' }, { value: 'UPLOADED_PDF', label: 'Uploaded PDF' }]} style={{ width: '100%' }} allowClear /></Col>
					<Col xs={12} sm={6} md={2}><Select placeholder="Status" value={filterStatus} onChange={v => { setFilterStatus(v); setPage(1); }} options={[{ value: null, label: 'All' }, { value: 'DRAFT', label: 'Draft' }, { value: 'PUBLISHED', label: 'Published' }]} style={{ width: '100%' }} allowClear /></Col>
					<Col xs={24} md={24} style={{ textAlign: 'right' }}>
						<Space wrap>
							<Button icon={<RobotOutlined />} onClick={openAiModal} style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', borderColor: '#8b5cf6', color: '#fff' }}>AI Generate</Button>
							<Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ background: '#102540', borderColor: '#102540' }}>Add Note</Button>
							<Button icon={<FilePdfOutlined />} onClick={() => { setPdfEditing(null); setPdfDrawerOpen(true); }}>Upload PDF</Button>
						</Space>
					</Col>
				</Row>
			</Card>

			{/* Unified resources */}
			{loading ? (
				<div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>
			) : notes.length === 0 ? (
				<Card style={{ borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'center', padding: 40 }}>
					<Empty description="No module notes or PDFs found" />
				</Card>
			) : (
				<>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 }}>
						{notes.map(resource => (
							<ModuleNoteResourceCard
								key={resource.resourceKey || resource.id}
								resource={resource}
								isAdmin
								onPreview={resourcePreview}
								onEdit={openEdit}
								onToggleStatus={toggleResourceStatus}
								onDelete={deleteResource}
								onOpenPdf={openPdfResource}
								onEditPdf={editPdfResource}
								onReplacePdf={triggerPdfReplace}
								onDownloadPdf={downloadPdf}
								onTogglePdfStatus={togglePdfStatus}
							/>
						))}
					</div>
					<div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
						<Pagination
							current={page}
							pageSize={pageSize}
							total={total}
							showSizeChanger
							showTotal={count => `${count} resource${count === 1 ? '' : 's'}`}
							pageSizeOptions={[10, 25, 50]}
							onChange={(nextPage, nextSize) => { setPage(nextSize !== pageSize ? 1 : nextPage); setPageSize(nextSize); }}
						/>
					</div>
				</>
			)}

			<AdminModuleNotePdfDrawer
				open={pdfDrawerOpen}
				mode={pdfEditing ? 'edit' : 'upload'}
				book={pdfEditing ? { ...pdfEditing, id: pdfEditing.resourceId || pdfEditing.id } : null}
				courses={courses}
				volumes={volumes}
				onClose={() => { setPdfDrawerOpen(false); setPdfEditing(null); }}
				onSaved={fetchNotes}
			/>
			<input ref={replacePdfInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={replacePdfFile} />

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
			<Modal title={<Space><div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><RobotOutlined style={{ fontSize: 18, color: '#fff' }} /></div><div><div style={{ fontWeight: 700, color: '#102540', fontSize: 16 }}>AI Milven Notes Generator</div><div style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>Generate exam-focused notes at topic level with AI</div></div></Space>} open={aiModalOpen} onCancel={() => { if (!aiGenerating) setAiModalOpen(false); }} width={640} centered footer={<Space><Button onClick={() => setAiModalOpen(false)} disabled={aiGenerating}>Cancel</Button><Button type="primary" icon={<ThunderboltOutlined />} loading={aiGenerating} onClick={handleAiGenerate} style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', borderColor: '#8b5cf6' }}>{aiGenerating ? 'Generating…' : 'Generate Preview'}</Button></Space>} closable={!aiGenerating} maskClosable={!aiGenerating}>
				{aiGenerating ? (
					<div style={{ textAlign: 'center', padding: '40px 0' }}><Spin size="large" /><div style={{ marginTop: 16, color: '#64748b' }}>AI is generating topic notes… This may take 30–60 seconds.</div></div>
				) : (
					<div>
						<div style={{ marginBottom: 20, padding: '12px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}><Typography.Text style={{ fontSize: 13, color: '#475569' }}>AI generates one Milven Notes set per topic: LOS coverage, concept map, core concepts, formulas with interpretation, worked examples, exam questions, common mistakes, exam tips, a quick revision box, and a coverage quality check.</Typography.Text></div>
						<Row gutter={[12, 16]}>
							<Col span={24}><Typography.Text strong style={{ fontSize: 12 }}>Course *</Typography.Text><Select placeholder="Select course" value={aiCourseId} onChange={v => { setAiCourseId(v); setAiVolumeId(null); setAiModuleId(null); setAiTopicId(null); }} options={courses.map(c => ({ value: c.id, label: `${c.name} (${LEVEL_LABELS[c.level] || c.level})` }))} style={{ width: '100%', marginTop: 4 }} allowClear showSearch optionFilterProp="label" /></Col>
							<Col span={12}><Typography.Text strong style={{ fontSize: 12 }}>Volume</Typography.Text><Select placeholder="All volumes" value={aiVolumeId} onChange={v => { setAiVolumeId(v); setAiModuleId(null); setAiTopicId(null); }} options={aiVolumes.map(v => ({ value: v.id, label: v.name }))} style={{ width: '100%', marginTop: 4 }} allowClear showSearch optionFilterProp="label" /></Col>
							<Col span={12}><Typography.Text strong style={{ fontSize: 12 }}>Learning Module</Typography.Text><Select placeholder="All modules" value={aiModuleId} onChange={v => { setAiModuleId(v); setAiTopicId(null); }} options={aiModules.map(m => ({ value: m.id, label: m.name }))} style={{ width: '100%', marginTop: 4 }} allowClear showSearch optionFilterProp="label" /></Col>
							<Col span={12}><Typography.Text strong style={{ fontSize: 12 }}>Topic</Typography.Text><Select placeholder="All topics" value={aiTopicId} onChange={setAiTopicId} options={aiTopics.map(t => ({ value: t.id, label: t.name }))} style={{ width: '100%', marginTop: 4 }} allowClear showSearch optionFilterProp="label" /></Col>
							<Col span={6}><Typography.Text strong style={{ fontSize: 12 }}>Count</Typography.Text><InputNumber min={1} max={20} value={aiCount} onChange={setAiCount} placeholder="All" style={{ width: '100%', marginTop: 4 }} /></Col>
							<Col span={6}><Typography.Text strong style={{ fontSize: 12 }}>Year</Typography.Text><InputNumber min={2020} max={2040} value={aiYear} onChange={setAiYear} style={{ width: '100%', marginTop: 4 }} /></Col>
							<Col span={12}>
								<Typography.Text strong style={{ fontSize: 12 }}>AI Provider</Typography.Text>
								<Select
									placeholder="Select provider" value={aiProvider}
									onChange={v => { setAiProvider(v); setAiActiveProvider(v); setAiModel(undefined); fetchAiModels(v); }}
									options={aiProviders.length > 0
										? aiProviders.map(p => ({ value: p.id, label: `${p.label}${p.hasKey ? '' : ' (no key)'}` }))
										: [{ value: 'openai', label: 'OpenAI' }, { value: 'anthropic', label: 'Anthropic (Claude)' }]
									}
									style={{ width: '100%', marginTop: 4 }}
								/>
							</Col>
							<Col span={12}>
								<Typography.Text strong style={{ fontSize: 12 }}>AI Model</Typography.Text>
								<Select
									showSearch optionFilterProp="label"
									loading={aiModelsLoading}
									placeholder={aiModelsLoading ? 'Loading models…' : 'Select model'}
									value={aiModel}
									onChange={setAiModel}
									options={aiModels.map(m => ({ value: m.id, label: m.display_name ? `${m.display_name} (${m.id})` : m.id }))}
									notFoundContent={aiModelsLoading ? 'Loading…' : 'No models found — check API key in Settings'}
									style={{ width: '100%', marginTop: 4 }}
								/>
							</Col>
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

	const covStatus = n.coverageCheck?.status;
	const covColor = covStatus === 'PASS' ? '#166534' : covStatus === 'REVISE' ? '#92400e' : '#991b1b';
	const covBg = covStatus === 'PASS' ? '#f0fdf4' : covStatus === 'REVISE' ? '#fffbeb' : '#fef2f2';
	const covBorder = covStatus === 'PASS' ? '#22c55e' : covStatus === 'REVISE' ? '#f59e0b' : '#ef4444';

	if (n._error) {
		return (
			<div style={{ padding: '12px 16px', borderRadius: 10, background: '#fef2f2', border: '1px solid #ef4444' }}>
				<Typography.Text strong style={{ color: '#991b1b' }}>Generation failed for this topic</Typography.Text>
				<div style={{ fontSize: 12, marginTop: 4, color: '#991b1b' }}>{n._error}</div>
			</div>
		);
	}

	return (
		<div>
			{covStatus && (
				<div style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 8, background: covBg, border: `1px solid ${covBorder}`, color: covColor }}>
					<Typography.Text strong style={{ color: covColor, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>Coverage Quality Check: {covStatus}</Typography.Text>
					{Array.isArray(n.coverageCheck?.findings) && n.coverageCheck.findings.length > 0 && (
						<ul style={{ margin: '4px 0 0 16px', padding: 0, color: covColor, fontSize: 11 }}>
							{n.coverageCheck.findings.slice(0, 5).map((f, i) => <li key={i}>{f}</li>)}
						</ul>
					)}
				</div>
			)}
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
