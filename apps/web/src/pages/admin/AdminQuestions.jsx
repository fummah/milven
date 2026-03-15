import React, { useEffect, useMemo, useState } from 'react';
import { Card, Form, Input, Button, Select, message, Space, Typography, Table, Upload, Modal, Drawer, Tag, Tooltip, Radio, Divider, Spin, Collapse, Tabs, InputNumber, Row, Col, Checkbox } from 'antd';
import { DownloadOutlined, UploadOutlined, PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, PictureOutlined, DeleteFilled, FilterOutlined, QuestionCircleOutlined, BookOutlined, SearchOutlined, CalendarOutlined, CheckCircleOutlined, DownOutlined, UpOutlined, RobotOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { RichTextEditor } from '../../components/RichTextEditor.jsx';

// Ensure HTML from API renders as HTML (unescape entities if stored escaped)
function safeHtml(html) {
	if (html == null || typeof html !== 'string') return '';
	return html
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

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
	const [listTab, setListTab] = useState('all'); // 'all' | 'ai'
	const [aiGenerateModalOpen, setAiGenerateModalOpen] = useState(false);
	const [aiGenerateLoading, setAiGenerateLoading] = useState(false);
	const [aiGenerateCourseId, setAiGenerateCourseId] = useState('');
	const [aiGenerateVolumeId, setAiGenerateVolumeId] = useState('');
	const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
	const [aiPreview, setAiPreview] = useState(null);
	const [aiAcceptLoading, setAiAcceptLoading] = useState(false);
	const [aiSelectedIndices, setAiSelectedIndices] = useState([]);
	const [drawerMode, setDrawerMode] = useState('single'); // 'single' | 'bundle'
	const [aiForm] = Form.useForm();
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(20);
	const [total, setTotal] = useState(0); // underlying questions (for pagination)
	const [logicalTotal, setLogicalTotal] = useState(0); // vignette bundles + non-vignette
	const [showOptionalFields, setShowOptionalFields] = useState(false);
	const [vignettePanelsOpen, setVignettePanelsOpen] = useState([]);
	const [constructedPanelsOpen, setConstructedPanelsOpen] = useState([]);

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
	const [questionType, setQuestionType] = useState(() => {
		const types = searchParams.get('types');
		const type = searchParams.get('type');
		if (types) return types.split(',').filter(Boolean);
		if (type) return type;
		return '';
	});
	const [wording, setWording] = useState(searchParams.get('q') || '');

	const [volumes, setVolumes] = useState([]);

	const loadMeta = async () => {
		try {
			const [{ data: t }, { data: c }, { data: v }] = await Promise.all([
				api.get('/api/cms/topics'),
				api.get('/api/cms/courses'),
				api.get('/api/cms/volumes')
			]);
			setTopics(t?.topics || []);
			setCourses(c?.courses || []);
			setVolumes(v?.volumes || []);
		} catch {
			setTopics([]);
			setCourses([]);
			setVolumes([]);
		}
	};

	const loadQuestions = async () => {
		if (loading) return;
		setLoading(true);
		try {
			const params = {
				page,
				pageSize,
				...(listTab === 'ai' ? { aiGenerated: true } : {}),
				...(courseId ? { courseId } : {}),
				...(topicId ? (Array.isArray(topicId) ? { topicIds: topicId.join(',') } : { topicId }) : {}),
				...(difficulty ? (Array.isArray(difficulty) ? { difficulties: difficulty.join(',') } : { difficulty }) : {}),
				...(questionType ? (Array.isArray(questionType) ? { types: questionType.join(',') } : { type: questionType }) : {}),
				...(wording ? { q: wording } : {})
			};
			const { data } = await api.get('/api/cms/questions', { params });
			setQuestions(data?.questions || []);
			setTotal(data?.total ?? 0);
			setLogicalTotal(data?.logicalTotal ?? data?.total ?? 0);
		} catch {
			setQuestions([]);
			setTotal(0);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadMeta();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		loadQuestions();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [page, pageSize, listTab, courseId, topicId, difficulty, questionType, wording]);

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
		const urlType = searchParams.get('type');
		const urlTypes = searchParams.get('types');
		if (urlTypes && !questionType) {
			setQuestionType(urlTypes.split(',').filter(Boolean));
		} else if (urlType && !questionType) {
			setQuestionType(urlType);
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
			if (Array.isArray(questionType) && questionType.length > 0) {
				params.set('types', questionType.join(','));
			} else if (questionType && !Array.isArray(questionType)) {
				params.set('type', questionType);
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
			if (currentParamsStr !== newParamsStr) {
				setSearchParams(params, { replace: true });
			}
			if (page !== 1) {
				setPage(1);
			} else {
				loadQuestions();
			}
			setApplyFilters(false);
		}, 500); // 500ms debounce

		return () => clearTimeout(timeoutId);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [applyFilters, courseId, topicId, difficulty, questionType, wording]);

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
		return (courses || [])
			.slice()
			.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
			.map(c => ({ value: c.id, label: `${c.name} (${c.level})` }));
	}, [courses]);

	const selectedDrawerCourseId = Form.useWatch('courseId', form);
	const selectedDrawerVolumeId = Form.useWatch('volumeId', form);
	const drawerVolumeOptions = useMemo(() => {
		const filteredTopics = selectedDrawerCourseId
			? topics.filter(t => t.courseId === selectedDrawerCourseId || t.course?.id === selectedDrawerCourseId)
			: [];
		const volumeIds = Array.from(new Set(filteredTopics.map(t => t.module?.volumeId).filter(Boolean)));
		return volumeIds
			.map((volumeId) => {
				const volume = (volumes || []).find((v) => v.id === volumeId);
				return volume ? { value: volume.id, label: volume.description ? `${volume.description} (${volume.name})` : volume.name } : null;
			})
			.filter(Boolean);
	}, [topics, volumes, selectedDrawerCourseId]);
	const drawerTopicOptions = useMemo(() => {
		let filtered = selectedDrawerCourseId
			? topics.filter(t => t.courseId === selectedDrawerCourseId || t.course?.id === selectedDrawerCourseId)
			: topics;
		if (selectedDrawerVolumeId) {
			filtered = filtered.filter((t) => t.module?.volumeId === selectedDrawerVolumeId);
		}
		return filtered.map(t => ({ value: t.id, label: t.name }));
	}, [topics, selectedDrawerCourseId, selectedDrawerVolumeId]);

	// Restrict question types in the manual "Add Question" drawer based on selected course level
	const drawerQuestionTypeOptions = useMemo(() => {
		if (!selectedDrawerCourseId) {
			return [
				{ value: 'MCQ', label: 'MCQ' },
				{ value: 'VIGNETTE_MCQ', label: 'Vignette MCQ' },
				{ value: 'CONSTRUCTED_RESPONSE', label: 'Constructed Response' }
			];
		}
		const course = (courses || []).find(c => c.id === selectedDrawerCourseId);
		const level = course?.level;
		if (level === 'LEVEL1') {
			return [{ value: 'MCQ', label: 'MCQ' }];
		}
		if (level === 'LEVEL2') {
			return [{ value: 'VIGNETTE_MCQ', label: 'Vignette MCQ' }];
		}
		if (level === 'LEVEL3') {
			return [
				{ value: 'VIGNETTE_MCQ', label: 'Vignette MCQ' },
				{ value: 'CONSTRUCTED_RESPONSE', label: 'Constructed Response' }
			];
		}
		return [
			{ value: 'MCQ', label: 'MCQ' },
			{ value: 'VIGNETTE_MCQ', label: 'Vignette MCQ' },
			{ value: 'CONSTRUCTED_RESPONSE', label: 'Constructed Response' }
		];
	}, [courses, selectedDrawerCourseId]);

	const selectedTopic = useMemo(() => (topics || []).find(t => t.id === topicId) || null, [topics, topicId]);

	// Restrict AI "Generate questions" type list based on selected course level
	const aiQuestionTypeOptions = useMemo(() => {
		if (!aiGenerateCourseId) {
			return [
				{ value: 'MCQ', label: 'MCQ' },
				{ value: 'VIGNETTE_MCQ', label: 'Vignette MCQ' },
				{ value: 'CONSTRUCTED_RESPONSE', label: 'Constructed response' }
			];
		}
		const course = (courses || []).find(c => c.id === aiGenerateCourseId);
		const level = course?.level;
		if (level === 'LEVEL1') {
			return [{ value: 'MCQ', label: 'MCQ' }];
		}
		if (level === 'LEVEL2') {
			return [{ value: 'VIGNETTE_MCQ', label: 'Vignette MCQ' }];
		}
		if (level === 'LEVEL3') {
			return [
				{ value: 'VIGNETTE_MCQ', label: 'Vignette MCQ' },
				{ value: 'CONSTRUCTED_RESPONSE', label: 'Constructed response' }
			];
		}
		return [
			{ value: 'MCQ', label: 'MCQ' },
			{ value: 'VIGNETTE_MCQ', label: 'Vignette MCQ' },
			{ value: 'CONSTRUCTED_RESPONSE', label: 'Constructed response' }
		];
	}, [courses, aiGenerateCourseId]);

	const submit = async (values, mode = 'close') => {
		try {
			setSubmitting(true);
			const chosenTopicId = values.topicId;
			const t = (topics || []).find(x => x.id === chosenTopicId);

			// Constructed Response bundle: case study parent + sub-questions created in one call
			if (values.type === 'CONSTRUCTED_RESPONSE' && values.bundleMode === 'bundle') {
				const caseStudyText = String(values.caseStudyText || '').trim();
				const subs = Array.isArray(values.constructedSubQuestions)
					? values.constructedSubQuestions
						.map(s => ({
							stem: String(s?.stem || '').trim(),
							marks: s?.marks != null && String(s.marks).trim() !== '' ? Number(s.marks) : 1
						}))
						.filter(s => s.stem.length >= 5)
					: [];
				if (caseStudyText.length < 5) {
					message.error('Case Study Description is required');
					return;
				}
				if (subs.length === 0) {
					message.error('Add at least one sub question');
					return;
				}

				await api.post('/api/cms/questions', {
					stem: '(Case study parent)',
					type: 'CONSTRUCTED_RESPONSE',
					level: t?.level ?? 'LEVEL1',
					difficulty: values.difficulty,
					topicId: chosenTopicId,
					marks: 1,
					vignetteText: caseStudyText,
					subQuestions: subs,
					qid: values.qid || null,
					los: values.los || null,
					traceSection: values.traceSection || null,
					tracePage: values.tracePage || null,
					keyFormulas: values.keyFormulas || null,
					workedSolution: values.workedSolution || null
				});

				message.success(`Created ${subs.length} sub question${subs.length > 1 ? 's' : ''} under one case study`);
				form.resetFields();
				setShowOptionalFields(false);
				setDrawerOpen(false);
				setConstructedPanelsOpen([]);
				loadQuestions();
				return;
			}
			// Vignette MCQ: parent + sub-questions created in one call
			if (values.type === 'VIGNETTE_MCQ' && Array.isArray(values.vignetteQuestions) && values.vignetteQuestions.length > 0) {
				const subQuestions = values.vignetteQuestions
					.filter(qItem => qItem && qItem.stem)
					.map(qItem => ({
						stem: qItem.stem,
						marks: values.marks ? Number(values.marks) : 1,
						options: (qItem.options || []).map(o => ({ text: o.text, isCorrect: !!o.isCorrect }))
					}));
				if (subQuestions.length === 0) {
					message.error('Add at least one vignette question');
					return;
				}
				await api.post('/api/cms/questions', {
					stem: '(Vignette parent)',
					type: 'VIGNETTE_MCQ',
					level: t?.level ?? 'LEVEL1',
					difficulty: values.difficulty,
					topicId: chosenTopicId,
					marks: 1,
					vignetteText: values.vignetteText || '',
					subQuestions,
					qid: values.qid || null,
					los: values.los || null,
					traceSection: values.traceSection || null,
					tracePage: values.tracePage || null,
					keyFormulas: values.keyFormulas || null,
					workedSolution: values.workedSolution || null
				});
				message.success(`Created vignette with ${subQuestions.length} question${subQuestions.length > 1 ? 's' : ''}`);
				form.resetFields();
				setShowOptionalFields(false);
				setDrawerOpen(false);
				loadQuestions();
				return;
			}

			// Default single-question path (MCQ / standalone Constructed)
			const payload = {
				stem: values.stem,
				type: values.type,
				level: t?.level ?? 'LEVEL1',
				difficulty: values.difficulty,
				topicId: chosenTopicId,
				marks: values.marks ? Number(values.marks) : undefined,
				options: values.type !== 'CONSTRUCTED_RESPONSE'
					? (values.options || []).map(o => ({ text: o.text, isCorrect: !!o.isCorrect }))
					: [],
				qid: values.qid || null,
				los: values.los || null,
				traceSection: values.traceSection || null,
				tracePage: values.tracePage || null,
				keyFormulas: values.keyFormulas || null,
				workedSolution: values.workedSolution || null
			};
			await api.post('/api/cms/questions', payload);
			message.success('Question created');

			form.resetFields();
			setShowOptionalFields(false);
			setDrawerOpen(false);

			loadQuestions();
		} catch (e) {
			message.error(e?.response?.data?.error || 'Failed (admin only)');
		} finally {
			setSubmitting(false);
		}
	};

	const deleteQuestion = async (recordOrId) => {
		const questionId = typeof recordOrId === 'string' ? recordOrId : recordOrId?.id;
		if (!questionId) return;
		try {
			await api.delete(`/api/cms/questions/${questionId}`);
			message.success('Question deleted');
			loadQuestions();
		} catch (e) {
			const errMsg = e?.response?.data?.error || e?.message || 'Delete failed';
			message.error(typeof errMsg === 'string' ? errMsg : 'Delete failed - question may be used in exams');
		}
	};

	const openPreview = async (record) => {
		console.log(record);
		setPreviewOpen(true);
		setPreviewQuestion(null);
		setPreviewLoading(true);
		try {
			const { data } = await api.get(`/api/cms/questions/${record.id}`);
			const q = data.question;
			console.log(data);
			const hasChildren = Array.isArray(q?.children) && q.children.length > 0;
			if (hasChildren && q.type === 'VIGNETTE_MCQ') {
				setPreviewQuestion({
					mode: 'VIGNETTE_BUNDLE',
					vignetteText: q.vignetteText || '',
					questions: q.children
				});
			} else if (hasChildren && q.type === 'CONSTRUCTED_RESPONSE') {
				setPreviewQuestion({
					mode: 'CONSTRUCTED_BUNDLE',
					vignetteText: q.vignetteText || '',
					questions: q.children
				});
			} else {
				setPreviewQuestion({
					mode: 'SINGLE',
					question: q
				});
			}
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

	const doAiGenerate = async (values) => {
		try {
			setAiGenerateLoading(true);
			const apiKey = values.openaiApiKey?.trim();
			if (apiKey) {
				await api.put('/api/settings', { openai_api_key: apiKey });
			}
			const diffs = Array.isArray(values.difficulties)
				? values.difficulties.filter(Boolean)
				: (values.difficulty ? [values.difficulty] : []);
			const payload = {
				courseId: values.courseId,
				volumeId: values.volumeId || undefined,
				topicIds: Array.isArray(values.topicIds) ? values.topicIds : (values.topicId ? [values.topicId] : []),
				questionType: values.questionType,
				constructedMode: values.questionType === 'CONSTRUCTED_RESPONSE' ? (values.constructedMode || 'single') : undefined,
				difficulties: diffs.length ? diffs : undefined,
				difficulty: !diffs.length && values.difficulty ? values.difficulty : undefined,
				count: values.count ?? 3
			};

			// Prefer preview flow (admin review before save)
			try {
				const { data } = await api.post('/api/cms/questions/generate-ai/preview', payload);
				const gen = data?.generated || null;
				setAiPreview({
					questionType: values.questionType,
					generated: gen
				});
				// Select all items by default
				// bundles = array of case studies (for VIGNETTE_MCQ / constructed bundle)
				// items = flat array of questions (for MCQ / single constructed)
				const itemCount = Array.isArray(gen?.bundles)
					? gen.bundles.length
					: (gen?.items || []).length;
				setAiSelectedIndices(Array.from({ length: itemCount }, (_, i) => i));
				setAiPreviewOpen(true);
				return;
			} catch {
				// Fallback to legacy endpoint that writes directly to DB
			}

			const { data } = await api.post('/api/cms/questions/generate-ai', payload);
			message.success(`Generated ${data?.created ?? 0} question(s)`);
			setAiGenerateModalOpen(false);
			setListTab('ai');
			setPage(1);
			loadQuestions();
		} catch (e) {
			message.error(e?.response?.data?.error || 'AI generation failed');
		} finally {
			setAiGenerateLoading(false);
		}
	};

	const acceptAiPreview = async (indices) => {
		if (!aiPreview?.questionType || !aiPreview?.generated) return;
		const toSend = indices || aiSelectedIndices;
		if (!toSend || toSend.length === 0) {
			message.warning('Select at least one question to add');
			return;
		}
		try {
			setAiAcceptLoading(true);
			const { data } = await api.post('/api/cms/questions/generate-ai/accept', {
				questionType: aiPreview.questionType,
				generated: aiPreview.generated,
				selectedIndices: toSend
			});
			const dupes = data?.skippedDuplicates || [];
			if (dupes.length > 0) {
				message.warning(`Saved ${data?.created ?? 0} question(s). ${dupes.length} duplicate(s) skipped.`);
			} else {
				message.success(`Saved ${data?.created ?? 0} AI question(s)`);
			}
			setAiPreviewOpen(false);
			setAiGenerateModalOpen(false);
			setAiPreview(null);
			setAiSelectedIndices([]);
			setListTab('ai');
			setPage(1);
			loadQuestions();
		} catch (e) {
			message.error(e?.response?.data?.error || 'Failed to save generated questions');
		} finally {
			setAiAcceptLoading(false);
		}
	};

	const bundledQuestions = useMemo(() => {
		// Backend returns only top-level questions (parentId IS NULL) with _childCount.
		return questions.map(q => {
			const childCount = q._childCount || 0;
			if (childCount > 0 && q.type === 'VIGNETTE_MCQ') {
				return { ...q, _isVignetteBundle: true, _bundleCount: childCount };
			}
			if (childCount > 0 && q.type === 'CONSTRUCTED_RESPONSE') {
				return { ...q, _isConstructedBundle: true, _bundleCount: childCount };
			}
			return q;
		});
	}, [questions]);

	const columns = [
		{ 
			title: 'Question', 
			dataIndex: 'stem', 
			ellipsis: true, 
			render: (text, record) => {
				const isVignette = record._isVignetteBundle;
				const isConstructedBundle = record._isConstructedBundle;
				return (
					<div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
						<div className="icon-badge-sm icon-badge-purple">
							<QuestionCircleOutlined style={{ fontSize: 14 }} />
						</div>
						<div style={{ flex: 1, minWidth: 0 }}>
							<Typography.Text style={{ display: 'block', color: '#1e293b' }}>
								{(() => {
									// Prefer case-study description for bundles, otherwise fall back to question stem
									const raw = (isVignette || isConstructedBundle) && record.vignetteText
										? record.vignetteText
										: (text || '');
									const plain = raw.replace(/<[^>]+>/g, '');
									const base = plain.length > 80 ? `${plain.substring(0, 80)}...` : plain;
									if (isVignette) {
										const count = record._bundleCount || record?._bundleCount || 1;
										return `Vignette (${count} question${count > 1 ? 's' : ''}): ${base}`;
									}
									if (isConstructedBundle) {
										const count = record._bundleCount || record?._bundleCount || 1;
										return `Case Study (${count} question${count > 1 ? 's' : ''}): ${base}`;
									}
									return base;
								})()}
							</Typography.Text>
							{record.qid && (
								<Typography.Text type="secondary" style={{ fontSize: 11 }}>
									ID: {record.qid}
								</Typography.Text>
							)}
						</div>
					</div>
				);
			}
		},
		{ 
			title: 'Type', 
			dataIndex: 'type', 
			width: 180, 
			render: (v, record) => {
				const iconMap = { MCQ: <CheckCircleOutlined />, VIGNETTE_MCQ: <BookOutlined />, CONSTRUCTED_RESPONSE: <EditOutlined /> };
				return (
					<Space size={6} wrap>
						<Tag icon={iconMap[v]} color={v === 'MCQ' ? 'blue' : (v === 'VIGNETTE_MCQ' ? 'purple' : 'cyan')}>{v === 'CONSTRUCTED_RESPONSE' ? 'Constructed' : v}</Tag>
						{record.isAiGenerated && <Tag icon={<RobotOutlined />} color="purple">AI</Tag>}
					</Space>
				);
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
						<button className="action-btn action-btn-view" onClick={() => openPreview(record)}>
							<EyeOutlined />
						</button>
					</Tooltip>
					<Tooltip title="Edit">
						<button className="action-btn action-btn-edit" onClick={() => navigate(`/admin/questions/${record.id}/edit`)}>
							<EditOutlined />
						</button>
					</Tooltip>
					<Tooltip title="Delete">
						<button className="action-btn action-btn-delete" onClick={() => deleteQuestion(record)}>
							<DeleteOutlined />
						</button>
					</Tooltip>
				</Space>
			)
		}
	];

	// Check if any filters are active
	const hasActiveFilters = courseId || (Array.isArray(topicId) ? topicId.length > 0 : topicId) || (Array.isArray(difficulty) ? difficulty.length > 0 : difficulty) || (Array.isArray(questionType) ? questionType.length > 0 : questionType) || wording;

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
						icon={<RobotOutlined />}
						onClick={() => {
							setAiGenerateModalOpen(true);
							setAiGenerateCourseId('');
							setAiGenerateVolumeId('');
							aiForm.resetFields();
							aiForm.setFieldsValue({ questionType: 'MCQ', difficulties: ['MEDIUM'], count: 3, volumeId: undefined, topicIds: undefined });
						}}
						style={{ borderRadius: 10, borderColor: '#8b5cf6', color: '#8b5cf6' }}
					>
						Generate with AI
					</Button>
					<Button 
						type="primary" 
						icon={<PlusOutlined />} 
						onClick={() => {
							setDrawerOpen(true);
							form.resetFields();
							setShowOptionalFields(false);
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
						<Form.Item label="Question Type" style={{ margin: 0 }}>
							<Select
								mode="multiple"
								style={{ minWidth: 200, borderRadius: 10 }}
								allowClear
								placeholder="All types"
								value={Array.isArray(questionType) ? questionType : (questionType ? [questionType] : [])}
								onChange={(v) => {
									setQuestionType(Array.isArray(v) ? (v.length > 0 ? v : '') : (v || ''));
								}}
								options={[
									{ value: 'MCQ', label: 'MCQ' },
									{ value: 'VIGNETTE_MCQ', label: 'Vignette MCQ' },
									{ value: 'CONSTRUCTED_RESPONSE', label: 'Constructed' }
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
								setQuestionType('');
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

			{/* List view: All vs AI Generated */}
			<Tabs
				activeKey={listTab}
				onChange={(k) => { setListTab(k); setPage(1); }}
				items={[
					{ key: 'all', label: <span><QuestionCircleOutlined /> All questions</span> },
					{ key: 'ai', label: <span><RobotOutlined /> AI generated</span> }
				]}
				style={{ marginBottom: 0 }}
			/>

			{/* Questions Table */}
			<Card className="modern-card">
				<div style={{ marginBottom: 16 }}>
					<Typography.Text type="secondary">
						Showing <strong>{bundledQuestions.length}</strong> of <strong>{logicalTotal}</strong> questions
					</Typography.Text>
				</div>
				<Table
					rowKey="id"
					loading={loading}
					dataSource={bundledQuestions}
					columns={columns}
					className="modern-table"
					scroll={{ x: 1200 }}
					pagination={{ 
						current: page,
						pageSize,
						total,
						showSizeChanger: true,
						pageSizeOptions: ['10', '20', '50', '100'],
						showTotal: (t) => `${t} questions`,
						onChange: (newPage, newPageSize) => {
							setPage(newPage);
							if (newPageSize !== pageSize) {
								setPageSize(newPageSize);
								setPage(1);
							}
						}
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

			{/* Generate questions with AI */}
			<Modal
				title={<span><RobotOutlined style={{ marginRight: 8 }} />Generate questions with AI</span>}
				open={aiGenerateModalOpen}
				onCancel={() => !aiGenerateLoading && setAiGenerateModalOpen(false)}
				closable={!aiGenerateLoading}
				maskClosable={!aiGenerateLoading}
				footer={null}
				className="modern-modal"
			>
				<Form
					form={aiForm}
					layout="vertical"
					onFinish={doAiGenerate}
					initialValues={{ questionType: 'MCQ', difficulties: ['MEDIUM'], count: 3, constructedMode: 'single' }}
				>
					<Row gutter={12}>
						<Col span={12}>
							<Form.Item name="courseId" label="Course" rules={[{ required: true, message: 'Select a course' }]}>
								<Select
									placeholder="Select course"
									options={courses.map(c => ({ value: c.id, label: c.name }))}
									showSearch
									optionFilterProp="label"
									onChange={(v) => {
										setAiGenerateCourseId(v || '');
										setAiGenerateVolumeId('');
										aiForm.setFieldsValue({ volumeId: undefined, topicIds: undefined, topicId: undefined });
									}}
								/>
							</Form.Item>
						</Col>
						<Col span={12}>
							<Form.Item name="volumeId" label="Volume">
								<Select
									allowClear
									placeholder="Select volume"
									showSearch
									optionFilterProp="label"
									options={(aiGenerateCourseId
										? (volumes || []).filter(v => (v.courseLinks || []).some(l => l.courseId === aiGenerateCourseId))
										: (volumes || [])
									).map(v => ({ value: v.id, label: v.description ? `${v.description} (${v.name})` : v.name }))}
									onChange={(v) => {
										setAiGenerateVolumeId(v || '');
										aiForm.setFieldsValue({ topicIds: undefined, topicId: undefined });
									}}
								/>
							</Form.Item>
						</Col>
						<Col span={24}>
							<Form.Item name="topicIds" label="Topics" rules={[{ required: true, message: 'Select at least one topic' }]}>
								<Select
									mode="multiple"
									placeholder="Select topics"
									showSearch
									optionFilterProp="label"
									options={(
										aiGenerateCourseId
											? (topics || []).filter(t => (t.courseId === aiGenerateCourseId || t.course?.id === aiGenerateCourseId))
											: (topics || [])
									)
										.filter(t => !aiGenerateVolumeId || t?.module?.volumeId === aiGenerateVolumeId)
										.map(t => ({ value: t.id, label: t.name }))}
								/>
							</Form.Item>
						</Col>
						<Col span={12}>
							<Form.Item name="questionType" label="Question type" rules={[{ required: true }]}>
								<Select
									options={aiQuestionTypeOptions}
								/>
							</Form.Item>
						</Col>
						<Form.Item noStyle shouldUpdate={(prev, cur) => prev.questionType !== cur.questionType}>
							{({ getFieldValue }) => (
								getFieldValue('questionType') === 'CONSTRUCTED_RESPONSE' ? (
									<Col span={12}>
										<Form.Item name="constructedMode" label="Constructed format" rules={[{ required: true, message: 'Select format' }]}>
											<Select
												options={[
													{ value: 'single', label: 'Single constructed question' },
													{ value: 'bundle', label: 'Case study with sub-questions' }
												]}
											/>
										</Form.Item>
									</Col>
								) : null
							)}
						</Form.Item>
						<Col span={12}>
							<Form.Item name="difficulties" label="Difficulty" rules={[{ required: true, type: 'array', min: 1, message: 'Select at least one difficulty' }]}>
								<Select
									mode="multiple"
									options={[
										{ value: 'EASY', label: 'Easy' },
										{ value: 'MEDIUM', label: 'Medium' },
										{ value: 'HARD', label: 'Hard' }
									]}
								/>
							</Form.Item>
						</Col>
						<Col span={12}>
							<Form.Item name="count" label="Number of questions" rules={[{ required: true }]}>
								<InputNumber min={1} max={10} style={{ width: '100%' }} />
							</Form.Item>
						</Col>
						<Col span={12}>
							<Form.Item name="openaiApiKey" label="OpenAI API key (optional)">
								<Input.Password
									placeholder="Leave blank to use saved key from Settings"
									autoComplete="off"
								/>
							</Form.Item>
						</Col>
					</Row>
					<Form.Item style={{ marginBottom: 0 }}>
						<Space>
							<Button type="primary" htmlType="submit" loading={aiGenerateLoading} icon={<ThunderboltOutlined />}>
								Generate preview
							</Button>
							<Button onClick={() => setAiGenerateModalOpen(false)} disabled={aiGenerateLoading}>Cancel</Button>
						</Space>
					</Form.Item>
				</Form>
			</Modal>

			{/* AI preview modal */}
			<Modal
				title={<span><RobotOutlined style={{ marginRight: 8 }} />AI Generated Questions Preview</span>}
				open={aiPreviewOpen}
				onCancel={() => { if (!aiAcceptLoading) { setAiPreviewOpen(false); setAiSelectedIndices([]); } }}
				closable={!aiAcceptLoading}
				maskClosable={!aiAcceptLoading}
				footer={null}
				width={1400}
				className="modern-modal"
			>
				{/* Select all / deselect all toggle */}
				{(() => {
					const hasBundles = Array.isArray(aiPreview?.generated?.bundles);
					const totalCount = hasBundles ? aiPreview.generated.bundles.length : (aiPreview?.generated?.items || []).length;
					const allSelected = aiSelectedIndices.length === totalCount && totalCount > 0;
					const typeLabel = aiPreview?.questionType === 'MCQ' ? 'MCQ' : aiPreview?.questionType === 'VIGNETTE_MCQ' ? 'Vignette MCQ' : hasBundles ? 'Constructed Case Study' : 'Constructed Response';
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
								{typeLabel}{hasBundles ? ` \u00b7 ${totalCount} case stud${totalCount === 1 ? 'y' : 'ies'}` : ''}
							</Typography.Text>
						</div>
					) : null;
				})()}
				<div style={{ maxHeight: '65vh', overflow: 'auto' }}>
					{Array.isArray(aiPreview?.generated?.bundles) && aiPreview.generated.bundles.length > 0 ? (
						<Space direction="vertical" style={{ width: '100%' }} size={16}>
							{aiPreview.generated.bundles.map((bundle, bIdx) => {
								const isChecked = aiSelectedIndices.includes(bIdx);
								const isVignette = aiPreview?.questionType === 'VIGNETTE_MCQ';
								return (
									<Card key={bIdx} size="small" style={{ borderRadius: 14, borderWidth: 2, borderColor: isChecked ? '#91caff' : '#d9d9d9', background: isChecked ? '#fafff5' : undefined }}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
											<Checkbox checked={isChecked} onChange={(e) => { if (e.target.checked) setAiSelectedIndices(prev => [...prev, bIdx].sort((a, b) => a - b)); else setAiSelectedIndices(prev => prev.filter(i => i !== bIdx)); }} />
											<Typography.Text strong style={{ fontSize: 15 }}>{isVignette ? `Vignette Case Study ${bIdx + 1}` : `Case Study ${bIdx + 1}`}</Typography.Text>
											<Tag color="blue">{(bundle.questions || []).length} sub-question{(bundle.questions || []).length !== 1 ? 's' : ''}</Tag>
											<div style={{ flex: 1 }} />
											<Button size="small" type="link" disabled={aiAcceptLoading} onClick={() => acceptAiPreview([bIdx])}>Add this case study</Button>
										</div>
										<Card size="small" style={{ borderRadius: 10, background: '#f0f5ff', borderColor: '#adc6ff', marginBottom: 12 }}>
											<Typography.Text strong style={{ color: '#1d39c4' }}>{isVignette ? 'Case Study Passage' : 'Case Study Scenario'}</Typography.Text>
											<div className="prose prose-sm question-preview-content" style={{ marginTop: 8 }} dangerouslySetInnerHTML={{ __html: safeHtml(bundle.vignetteText || '') }} />
										</Card>
										{(bundle.questions || []).map((q, qIdx) => (
											<div key={qIdx} style={{ padding: '10px 12px', borderRadius: 10, background: '#fafafa', border: '1px solid #f0f0f0', marginBottom: 8 }}>
												<Typography.Text strong style={{ color: '#531dab' }}>{`Sub-question ${qIdx + 1}`}{q?.marks ? ` (${q.marks} mark${q.marks > 1 ? 's' : ''})` : ''}</Typography.Text>
												<div className="prose prose-sm question-preview-content" style={{ marginTop: 4 }} dangerouslySetInnerHTML={{ __html: safeHtml(q?.stem || '') }} />
												<div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
													<Tag color="blue">{q?.topicName || q?.topicId}</Tag>
													<Tag color="purple">{q?.difficulty}</Tag>
													{q?.qid && <Tag color="cyan">{q.qid}</Tag>}
												</div>
												{Array.isArray(q?.options) && q.options.length > 0 && (
													<div style={{ marginTop: 8 }}>
														{q.options.map((o, oi) => (
															<div key={oi} style={{ display: 'flex', gap: 8, padding: '2px 0', color: o.isCorrect ? '#389e0d' : undefined, fontWeight: o.isCorrect ? 600 : 400 }}>
																<span style={{ width: 20, flexShrink: 0 }}>{String.fromCharCode(65 + oi)}.</span>
																<span dangerouslySetInnerHTML={{ __html: safeHtml(o.text || '') }} />
																{o.isCorrect && <CheckCircleOutlined style={{ color: '#389e0d', marginLeft: 4 }} />}
															</div>
														))}
													</div>
												)}
												{q?.explanation && (
													<div style={{ marginTop: 8, padding: '6px 10px', background: '#fffbe6', borderRadius: 6, fontSize: 13 }}>
														<Typography.Text type="secondary" strong>Explanation: </Typography.Text>
														<span dangerouslySetInnerHTML={{ __html: safeHtml(q.explanation) }} />
													</div>
												)}
												{q?.los && (
													<div style={{ marginTop: 6, fontSize: 13 }}>
														<Typography.Text type="secondary" strong>LOS: </Typography.Text>{q.los}
													</div>
												)}
												{(q?.traceSection || q?.tracePage) && (
													<div style={{ fontSize: 13 }}>
														<Typography.Text type="secondary" strong>Trace: </Typography.Text>
														{q.traceSection}{q.traceSection && q.tracePage ? ' \u2013 ' : ''}{q.tracePage ? `Page ${q.tracePage}` : ''}
													</div>
												)}
												{q?.keyFormulas && (
													<div style={{ marginTop: 6, padding: '6px 10px', background: '#f0f5ff', borderRadius: 6, fontSize: 13 }}>
														<Typography.Text type="secondary" strong>Key Formula(s): </Typography.Text>
														<span dangerouslySetInnerHTML={{ __html: safeHtml(q.keyFormulas) }} />
													</div>
												)}
												{q?.workedSolution && (
													<div style={{ marginTop: 6, padding: '6px 10px', background: '#f6ffed', borderRadius: 6, fontSize: 13 }}>
														<Typography.Text type="secondary" strong>Worked Solution: </Typography.Text>
														<span dangerouslySetInnerHTML={{ __html: safeHtml(q.workedSolution) }} />
													</div>
												)}
											</div>
										))}
									</Card>
								);
							})}
						</Space>
					) : (
						<Space direction="vertical" style={{ width: '100%' }} size={12}>
							{(aiPreview?.generated?.items || []).map((q, idx) => {
								const isChecked = aiSelectedIndices.includes(idx);
								return (
									<Card key={idx} size="small" style={{ borderRadius: 12, borderColor: isChecked ? '#91caff' : undefined, background: isChecked ? '#f6ffed' : undefined }}>
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
												<Typography.Text strong>{`Question ${idx + 1}`}</Typography.Text>
												<div className="prose prose-sm question-preview-content" dangerouslySetInnerHTML={{ __html: safeHtml(q?.stem || '') }} />
												<div style={{ marginTop: 8 }}>
													<Tag color="blue">{q?.topicName || q?.topicId}</Tag>
													<Tag color="purple">{q?.difficulty}</Tag>
													{q?.qid && <Tag>{q.qid}</Tag>}
												</div>
												{Array.isArray(q?.options) && q.options.length > 0 && (
													<div style={{ marginTop: 8 }}>
														{q.options.map((o, oi) => (
															<div key={oi} style={{ display: 'flex', gap: 8, padding: '2px 0', color: o.isCorrect ? '#389e0d' : undefined, fontWeight: o.isCorrect ? 600 : 400 }}>
																<span style={{ width: 20, flexShrink: 0 }}>{String.fromCharCode(65 + oi)}.</span>
																<span dangerouslySetInnerHTML={{ __html: safeHtml(o.text || '') }} />
																{o.isCorrect && <CheckCircleOutlined style={{ color: '#389e0d', marginLeft: 4 }} />}
															</div>
														))}
													</div>
												)}
												{q?.explanation && (
													<div style={{ marginTop: 8, padding: '6px 10px', background: '#fffbe6', borderRadius: 6, fontSize: 13 }}>
														<Typography.Text type="secondary" strong>Explanation: </Typography.Text>
														<span dangerouslySetInnerHTML={{ __html: safeHtml(q.explanation) }} />
													</div>
												)}
												{q?.los && (
													<div style={{ marginTop: 8, fontSize: 13 }}>
														<Typography.Text type="secondary" strong>LOS: </Typography.Text>{q.los}
													</div>
												)}
												{(q?.traceSection || q?.tracePage) && (
													<div style={{ fontSize: 13 }}>
														<Typography.Text type="secondary" strong>Trace: </Typography.Text>
														{q.traceSection}{q.traceSection && q.tracePage ? ' - ' : ''}{q.tracePage ? `Page ${q.tracePage}` : ''}
													</div>
												)}
												{q?.keyFormulas && (
													<div style={{ marginTop: 6, fontSize: 13 }}>
														<Typography.Text type="secondary" strong>Key Formula(s): </Typography.Text>
														<span dangerouslySetInnerHTML={{ __html: safeHtml(q.keyFormulas) }} />
													</div>
												)}
												{q?.workedSolution && (
													<div style={{ marginTop: 6, fontSize: 13 }}>
														<Typography.Text type="secondary" strong>Worked Solution: </Typography.Text>
														<span dangerouslySetInnerHTML={{ __html: safeHtml(q.workedSolution) }} />
													</div>
												)}
											</div>
											<Button size="small" type="link" disabled={aiAcceptLoading} onClick={() => acceptAiPreview([idx])}>Add</Button>
										</div>
									</Card>
								);
							})}
						</Space>
					)}
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
						>
							Add selected ({aiSelectedIndices.length}{Array.isArray(aiPreview?.generated?.bundles) ? ' case stud' + (aiSelectedIndices.length === 1 ? 'y' : 'ies') : ''})
						</Button>
						<Button onClick={() => { if (!aiAcceptLoading) { setAiPreviewOpen(false); setAiSelectedIndices([]); } }} disabled={aiAcceptLoading}>
							Back
						</Button>
					</Space>
					<Typography.Text type="secondary" style={{ fontSize: 12 }}>
						Duplicates are automatically detected and skipped
					</Typography.Text>
				</div>
			</Modal>

			{/* Question Builder Drawer */}
			<Drawer
				key="question-builder-drawer"
				title="Add Question"
				open={drawerOpen}
				onClose={() => {
					setDrawerOpen(false);
					form.resetFields();
					form.setFieldsValue({ volumeId: undefined });
					setShowOptionalFields(false);
					if (searchParams.get('drawer')) {
						const params = new URLSearchParams(searchParams);
						params.delete('drawer');
						setSearchParams(params, { replace: true });
					}
				}}
				width={720}
				className="modern-drawer"
			>
				<Form
					layout="vertical"
					form={form}
					onFinish={submit}
					initialValues={{ type: 'MCQ', difficulty: 'MEDIUM', marks: 1, options: [{ text: '', isCorrect: false }], bundleMode: 'single' }}
				>
					<Form.Item name="courseId" label="Course" rules={[{ required: false }]}>
						<Select
							placeholder="Select course to filter topics"
							options={filteredCoursesOptions}
							showSearch
							optionFilterProp="label"
							allowClear
							onChange={(v) => {
								form.setFieldsValue({ topicId: undefined, volumeId: undefined });
								// When course changes, ensure question type still valid for that level
								const course = (courses || []).find(c => c.id === v);
								const level = course?.level;
								let nextType = form.getFieldValue('type');
								if (level === 'LEVEL1') {
									nextType = 'MCQ';
								} else if (level === 'LEVEL2') {
									nextType = 'VIGNETTE_MCQ';
								} else if (level === 'LEVEL3') {
									if (nextType !== 'VIGNETTE_MCQ' && nextType !== 'CONSTRUCTED_RESPONSE') {
										nextType = 'VIGNETTE_MCQ';
									}
								}
								if (nextType && nextType !== form.getFieldValue('type')) {
									form.setFieldsValue({ type: nextType });
								}
							}}
						/>
					</Form.Item>
					<Form.Item name="volumeId" label="Volume">
						<Select
							placeholder="Select volume to filter topics"
							options={drawerVolumeOptions}
							showSearch
							optionFilterProp="label"
							allowClear
							disabled={!selectedDrawerCourseId || drawerVolumeOptions.length === 0}
							onChange={() => {
								form.setFieldsValue({ topicId: undefined });
							}}
						/>
					</Form.Item>
					<Form.Item name="topicId" label="Topic" rules={[{ required: true }]}>
						<Select
							placeholder="Select topic"
							options={drawerTopicOptions}
							showSearch
							optionFilterProp="label"
							disabled={drawerTopicOptions.length === 0}
						/>
					</Form.Item>
					<Space size="large" wrap>
						<Form.Item name="type" label="Type" rules={[{ required: true }]}>
							<Select
								style={{ minWidth: 180 }}
								options={drawerQuestionTypeOptions}
								onChange={(v) => {
									// Reset constructed bundle-specific fields when switching away
									if (v !== 'CONSTRUCTED_RESPONSE') {
										form.setFieldsValue({ bundleMode: 'single', caseStudyText: undefined, constructedSubQuestions: undefined });
										setConstructedPanelsOpen([]);
									} else {
										// constructed response: default to single
										form.setFieldsValue({ bundleMode: 'single', caseStudyText: undefined, constructedSubQuestions: undefined });
										setConstructedPanelsOpen([]);
									}
								}}
							/>
						</Form.Item>
						<Form.Item name="difficulty" label="Difficulty" rules={[{ required: true }]}>
							<Select style={{ minWidth: 160 }} options={[
								{ value: 'EASY', label: 'Easy' },
								{ value: 'MEDIUM', label: 'Medium' },
								{ value: 'HARD', label: 'Hard' }
							]} />
						</Form.Item>
						<Form.Item noStyle shouldUpdate>
							{({ getFieldValue }) => {
								const t = getFieldValue('type');
								const bundleMode = getFieldValue('bundleMode');
								if (t === 'CONSTRUCTED_RESPONSE' && bundleMode === 'bundle') return null;
								return (
									<Form.Item name="marks" label="Marks" rules={[{ required: true }]}>
										<Input type="number" min={1} style={{ width: 120 }} />
									</Form.Item>
								);
							}}
						</Form.Item>
					</Space>
					<Form.Item noStyle shouldUpdate>
						{({ getFieldValue }) => {
							const type = getFieldValue('type');
							const bundleMode = getFieldValue('bundleMode');
							if (type === 'VIGNETTE_MCQ') {
								return null;
							}
							if (type === 'CONSTRUCTED_RESPONSE' && bundleMode === 'bundle') {
								return null;
							}
							return (
								<Form.Item name="stem" label="Question Text" rules={[{ required: true, min: 5 }]}>
									<RichTextEditor placeholder="Enter question stem..." />
								</Form.Item>
							);
						}}
					</Form.Item>

					<Form.Item noStyle shouldUpdate>
						{({ getFieldValue }) => {
							const type = getFieldValue('type');
							if (type !== 'CONSTRUCTED_RESPONSE') return null;
							return (
								<Form.Item name="bundleMode" label="Constructed format" style={{ marginBottom: 8 }}>
									<Select
										onChange={(v) => {
											const isBundle = v === 'bundle';
											form.setFieldsValue({
												bundleMode: v,
												...(isBundle
													? {
														constructedSubQuestions: (form.getFieldValue('constructedSubQuestions')?.length
															? form.getFieldValue('constructedSubQuestions')
															: [{ stem: '', marks: 1 }])
													}
													: {
														caseStudyText: undefined,
														constructedSubQuestions: undefined
													})
											});
											setDrawerMode(isBundle ? 'bundle' : 'single');
											setConstructedPanelsOpen(isBundle ? ['0'] : []);
										}}
										options={[
											{ value: 'single', label: 'Single constructed question' },
											{ value: 'bundle', label: 'Case study with sub-questions' }
										]}
									/>
								</Form.Item>
							);
						}}
					</Form.Item>

					<Form.Item noStyle shouldUpdate>
						{({ getFieldValue }) => {
							const type = getFieldValue('type');
							const bundleMode = getFieldValue('bundleMode');
							if (type === 'VIGNETTE_MCQ') {
								return (
									<>
										<Form.Item name="vignetteText" label="Vignette Text" rules={[{ required: true }]}>
											<RichTextEditor placeholder="Enter vignette passage..." minHeight={160} />
										</Form.Item>
										<Typography.Title level={5} style={{ marginTop: 12 }}>Vignette Questions</Typography.Title>
										<Form.List name="vignetteQuestions">
											{(qFields, { add, remove }) => (
												<>
													{qFields.length === 0 && (
														<Typography.Text type="secondary">
															Add one or more questions that belong to this vignette.
														</Typography.Text>
													)}
													<Collapse
														bordered={false}
														activeKey={vignettePanelsOpen}
														onChange={(keys) => setVignettePanelsOpen(Array.isArray(keys) ? keys : [keys])}
													>
														{qFields.map((qField, idx) => {
															const header = (
																<span>
																	Question {idx + 1}
																</span>
															);
															return (
																<Collapse.Panel
																	key={String(qField.name)}
																	header={header}
																	style={{ borderRadius: 12, border: '1px solid #e2e8f0', marginTop: 8, overflow: 'hidden' }}
																	extra={
																		qFields.length > 1 && (
																			<Button
																				type="link"
																				danger
																				onClick={(e) => {
																					e.stopPropagation();
																					remove(qField.name);
																				}}
																			>
																				Remove
																			</Button>
																		)
																	}
																>
																	<Form.Item
																		name={[qField.name, 'stem']}
																		label="Question Text"
																		rules={[{ required: true, min: 5 }]}
																	>
																		<RichTextEditor placeholder="Enter question text..." />
																	</Form.Item>
																	<Form.List name={[qField.name, 'options']}>
																		{(optFields, { add: addOpt, remove: removeOpt }) => (
																			<>
																				<Typography.Text strong>Options</Typography.Text>
																				{optFields.map((optField) => (
																					<Space key={optField.key} align="baseline" style={{ display: 'flex', width: '100%' }}>
																						<Form.Item
																							{...optField}
																							name={[optField.name, 'text']}
																							rules={[{ required: true }]}
																							style={{ flex: 1 }}
																						>
																							<Input placeholder="Option text" />
																						</Form.Item>
																						<Form.Item
																							{...optField}
																							name={[optField.name, 'isCorrect']}
																							rules={[{ required: true }]}
																						>
																							<Select
																								style={{ width: 140 }}
																								options={[{ value: true, label: 'Correct' }, { value: false, label: 'Incorrect' }]}
																							/>
																						</Form.Item>
																						<Button onClick={() => removeOpt(optField.name)}>Remove</Button>
																					</Space>
																				))}
																				<Button onClick={() => addOpt({ text: '', isCorrect: false })} style={{ marginTop: 8 }}>
																					Add Option
																				</Button>
																			</>
																		)}
																	</Form.List>
																</Collapse.Panel>
															);
														})}
													</Collapse>
													<Button
														type="dashed"
														onClick={() => {
															const nextName = qFields.length ? String(Number(qFields[qFields.length - 1].name) + 1) : '0';
															add({ options: [{ text: '', isCorrect: false }] });
															setVignettePanelsOpen([nextName]);
														}}
														style={{ width: '100%', marginTop: 12 }}
													>
														Add Another Question
													</Button>
												</>
											)}
										</Form.List>
									</>
								);
							}
							if (type === 'CONSTRUCTED_RESPONSE' && bundleMode === 'bundle') {
								return (
									<>
										<Form.Item name="caseStudyText" label="Case Study Description" rules={[{ required: true }]}>
											<RichTextEditor placeholder="Enter the main case study / scenario..." minHeight={160} />
										</Form.Item>
										<Typography.Title level={5} style={{ marginTop: 12 }}>Sub questions</Typography.Title>
										<Form.List name="constructedSubQuestions">
											{(qFields, { add, remove }) => (
												<>
														{qFields.length === 0 && (
															<Typography.Text type="secondary">Add one or more sub-questions.</Typography.Text>
														)}
														<Collapse
															bordered={false}
															activeKey={constructedPanelsOpen}
															onChange={(keys) => setConstructedPanelsOpen(Array.isArray(keys) ? keys : [keys])}
														>
															{qFields.map((qField, idx) => (
																<Collapse.Panel
																	key={String(qField.name)}
																	header={`Sub question ${idx + 1}`}
																	style={{ borderRadius: 12, border: '1px solid #e2e8f0', marginTop: 8, overflow: 'hidden' }}
																	extra={
																	qFields.length > 1 && (
																		<Button
																			type="link"
																			danger
																			onClick={(e) => {
																			e.stopPropagation();
																			remove(qField.name);
																		}}
																		>
																		Remove
																	</Button>
																	)
																}
																>
																	<Form.Item name={[qField.name, 'stem']} label="Question" rules={[{ required: true, min: 5 }]}>
																		<RichTextEditor placeholder="Enter sub-question..." minHeight={100} />
																	</Form.Item>
																	<Form.Item name={[qField.name, 'marks']} label="Marks" rules={[{ required: true }]}>
																		<InputNumber min={1} style={{ width: 140 }} />
																	</Form.Item>
																</Collapse.Panel>
															))}
														</Collapse>
														<Button
															type="dashed"
															onClick={() => {
																const nextName = qFields.length ? String(Number(qFields[qFields.length - 1].name) + 1) : '0';
																add({ stem: '', marks: 1 });
																setConstructedPanelsOpen([nextName]);
															}}
															style={{ width: '100%', marginTop: 12 }}
														>
															Add sub question
														</Button>
													</>
											)}
										</Form.List>
									</>
								);
							}
							// MCQ options
							return (
								<Form.List name="options">
									{(fields, { add, remove }) => (
										<>
											<Form.Item noStyle shouldUpdate>
												{({ getFieldValue: gf }) => {
													const t = gf('type');
													if (t === 'CONSTRUCTED_RESPONSE') return null;
													return (
														<Space direction="vertical" style={{ width: '100%' }}>
															<Typography.Text strong>Options</Typography.Text>
															{fields.map(field => (
																<Space key={field.key} align="baseline" style={{ display: 'flex', width: '100%' }}>
																	<Form.Item
																		{...field}
																		name={[field.name, 'text']}
																		rules={[{ required: true }]}
																		style={{ flex: 1 }}
																	>
																		<Input placeholder="Option text" />
																	</Form.Item>
																	<Form.Item
																		{...field}
																		name={[field.name, 'isCorrect']}
																		rules={[{ required: true }]}
																	>
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
							);
						}}
					</Form.Item>

					<Button
						type="link"
						onClick={() => setShowOptionalFields(v => !v)}
						style={{ paddingLeft: 0 }}
					>
						{showOptionalFields ? 'Hide optional fields' : 'Show optional fields'}
					</Button>
					{showOptionalFields && (
						<>
							<Divider style={{ margin: '8px 0 16px' }} />
							<Space direction="vertical" size={10} style={{ width: '100%' }}>
								<Space size="large" wrap>
									<Form.Item name="qid" label="QID (External ID)">
										<Input style={{ width: 220 }} />
									</Form.Item>
									<Form.Item name="traceSection" label="Trace (Section)">
										<Input style={{ width: 220 }} />
									</Form.Item>
									<Form.Item name="tracePage" label="Trace (Page)">
										<Input style={{ width: 220 }} />
									</Form.Item>
								</Space>
								<Form.Item name="los" label="LOS (Learning Outcome Statement)">
									<Input.TextArea rows={2} />
								</Form.Item>
								<Form.Item name="keyFormulas" label="Key Formula(s)">
									<RichTextEditor placeholder="Enter key formulas..." minHeight={90} />
								</Form.Item>
								<Form.Item name="workedSolution" label="Worked Solution (concise)">
									<RichTextEditor placeholder="Enter worked solution..." minHeight={110} />
								</Form.Item>
							</Space>
						</>
					)}
					<Space style={{ marginTop: 12, width: '100%', justifyContent: 'flex-end' }}>
						<Button
							onClick={() => {
								setDrawerOpen(false);
								form.resetFields();
								setShowOptionalFields(false);
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
						{previewQuestion.mode === 'VIGNETTE_BUNDLE' ? (
							<>
								<Card size="small">
									<Space direction="vertical" size={8} style={{ width: '100%' }}>
										<Space>
											<Tag color="purple">VIGNETTE_MCQ</Tag>
										</Space>
										{previewQuestion.vignetteText && (
											<>
												<Divider style={{ margin: '8px 0' }} />
												<Typography.Text strong>Vignette:</Typography.Text>
												<div
													className="prose question-preview-content"
													style={{ margin: 0, padding: '8px', background: '#f5f5f5', borderRadius: 4 }}
													dangerouslySetInnerHTML={{ __html: safeHtml(previewQuestion.vignetteText) }}
												/>
											</>
										)}
									</Space>
								</Card>
								{(previewQuestion.questions || []).map((q, idx) => (
									<Card key={q.id || idx} size="small">
										<Space direction="vertical" size={8} style={{ width: '100%' }}>
											<Space>
												<Typography.Text strong>{`Question ${idx + 1}`}</Typography.Text>
												<Tag color={q.difficulty === 'EASY' ? 'green' : q.difficulty === 'MEDIUM' ? 'orange' : 'red'}>
													{q.difficulty}
												</Tag>
												<Typography.Text type="secondary">Marks: {q.marks || 1}</Typography.Text>
											</Space>
											<div
												className="prose question-preview-content"
												style={{ margin: 0 }}
												dangerouslySetInnerHTML={{ __html: safeHtml(q.stem) }}
											/>
											{(q.options || []).length > 0 && (
												<Radio.Group value={(q.options || []).find(o => o.isCorrect)?.id} disabled>
													<Space direction="vertical" style={{ width: '100%' }}>
														{(q.options || []).map((option, oIdx) => (
															<Radio key={option.id || oIdx} value={option.id || oIdx}>
																<Space align="start">
																	<span className="prose question-preview-content" style={{ display: 'inline-block' }} dangerouslySetInnerHTML={{ __html: safeHtml(option.text) }} />
																	{option.isCorrect && <Tag color="green">Correct</Tag>}
																</Space>
															</Radio>
														))}
													</Space>
												</Radio.Group>
											)}
										</Space>
									</Card>
								))}
							</>
						) : previewQuestion.mode === 'CONSTRUCTED_BUNDLE' ? (
							<>
								<Card size="small">
									<Space direction="vertical" size={8} style={{ width: '100%' }}>
										<Space>
											<Tag color="cyan">CONSTRUCTED_RESPONSE</Tag>
										</Space>
										{previewQuestion.vignetteText && (
											<>
												<Divider style={{ margin: '8px 0' }} />
												<Typography.Text strong>Case Study:</Typography.Text>
												<div
													className="prose question-preview-content"
													style={{ margin: 0, padding: '8px', background: '#f5f5f5', borderRadius: 4 }}
													dangerouslySetInnerHTML={{ __html: safeHtml(previewQuestion.vignetteText) }}
												/>
											</>
										)}
									</Space>
								</Card>
								{(previewQuestion.questions || []).map((q, idx) => (
									<Card key={q.id || idx} size="small">
										<Space direction="vertical" size={8} style={{ width: '100%' }}>
											<Space>
												<Typography.Text strong>{`Sub question ${idx + 1}`}</Typography.Text>
												<Tag color={q.difficulty === 'EASY' ? 'green' : q.difficulty === 'MEDIUM' ? 'orange' : 'red'}>
													{q.difficulty}
												</Tag>
												<Typography.Text type="secondary">Marks: {q.marks || 1}</Typography.Text>
											</Space>
											<div
												className="prose question-preview-content"
												style={{ margin: 0 }}
												dangerouslySetInnerHTML={{ __html: safeHtml(q.stem) }}
											/>
										</Space>
									</Card>
								))}
							</>
						) : previewQuestion.mode === 'SINGLE' && previewQuestion.question ? (
							<>
								<Card size="small">
									<Space direction="vertical" size={8} style={{ width: '100%' }}>
										<Space>
											<Tag color={previewQuestion.question.type === 'MCQ' ? 'blue' : (previewQuestion.question.type === 'VIGNETTE_MCQ' ? 'purple' : 'default')}>
												{previewQuestion.question.type}
											</Tag>
											<Tag color={previewQuestion.question.difficulty === 'EASY' ? 'green' : previewQuestion.question.difficulty === 'MEDIUM' ? 'orange' : 'red'}>
												{previewQuestion.question.difficulty}
											</Tag>
											<Typography.Text type="secondary">Marks: {previewQuestion.question.marks || 1}</Typography.Text>
										</Space>
										{previewQuestion.question.vignetteText && (
											<>
												<Divider style={{ margin: '8px 0' }} />
												<Typography.Text strong>Vignette:</Typography.Text>
												<div
													className="prose question-preview-content"
													style={{ margin: 0, padding: '8px', background: '#f5f5f5', borderRadius: 4 }}
													dangerouslySetInnerHTML={{ __html: safeHtml(previewQuestion.question.vignetteText) }}
												/>
											</>
										)}
										<Divider style={{ margin: '8px 0' }} />
										<Typography.Text strong>Question:</Typography.Text>
										<div
											className="prose question-preview-content"
											style={{ margin: 0 }}
											dangerouslySetInnerHTML={{ __html: safeHtml(previewQuestion.question.stem) }}
										/>
									</Space>
								</Card>
								{previewQuestion.question.type !== 'CONSTRUCTED_RESPONSE' && (previewQuestion.question.options || []).length > 0 && (
									<Card size="small" title="Options">
										<Radio.Group value={(previewQuestion.question.options || []).find(o => o.isCorrect)?.id} disabled>
											<Space direction="vertical" style={{ width: '100%' }}>
												{(previewQuestion.question.options || []).map((option, idx) => (
													<Radio key={option.id || idx} value={option.id || idx}>
														<Space align="start">
															<span className="prose question-preview-content" style={{ display: 'inline-block' }} dangerouslySetInnerHTML={{ __html: safeHtml(option.text) }} />
															{option.isCorrect && <Tag color="green">Correct</Tag>}
														</Space>
													</Radio>
												))}
											</Space>
										</Radio.Group>
									</Card>
								)}
								{previewQuestion.question.type === 'CONSTRUCTED_RESPONSE' && (
									<Card size="small">
										<Typography.Text type="secondary">Constructed Response - No multiple choice options</Typography.Text>
									</Card>
								)}
								{(previewQuestion.question.qid || previewQuestion.question.los || previewQuestion.question.traceSection || previewQuestion.question.tracePage || previewQuestion.question.keyFormulas || previewQuestion.question.workedSolution) && (
									<Card size="small" title="Additional Info">
										<Space direction="vertical" size={8} style={{ width: '100%' }}>
											{previewQuestion.question.qid && (
												<div><Typography.Text strong>QID:</Typography.Text> <Typography.Text>{previewQuestion.question.qid}</Typography.Text></div>
											)}
											{previewQuestion.question.los && (
												<div><Typography.Text strong>LOS:</Typography.Text> <Typography.Text>{previewQuestion.question.los}</Typography.Text></div>
											)}
											{(previewQuestion.question.traceSection || previewQuestion.question.tracePage) && (
												<div>
													<Typography.Text strong>Trace:</Typography.Text>{' '}
													<Typography.Text>
														{previewQuestion.question.traceSection && <span>{previewQuestion.question.traceSection}</span>}
														{previewQuestion.question.traceSection && previewQuestion.question.tracePage && <span>, </span>}
														{previewQuestion.question.tracePage && <span>Page {previewQuestion.question.tracePage}</span>}
													</Typography.Text>
												</div>
											)}
											{previewQuestion.question.keyFormulas && (
												<div>
													<Typography.Text strong>Key Formula(s):</Typography.Text>
													<div
														className="prose question-preview-content"
														style={{ margin: '4px 0 0 0', padding: '6px', background: '#f5f5f5', borderRadius: 4 }}
														dangerouslySetInnerHTML={{ __html: safeHtml(previewQuestion.question.keyFormulas) }}
													/>
												</div>
											)}
											{previewQuestion.question.workedSolution && (
												<div>
													<Typography.Text strong>Worked Solution:</Typography.Text>
													<div
														className="prose question-preview-content"
														style={{ margin: '4px 0 0 0', padding: '6px', background: '#e6f7ff', borderRadius: 4 }}
														dangerouslySetInnerHTML={{ __html: safeHtml(previewQuestion.question.workedSolution) }}
													/>
												</div>
											)}
										</Space>
									</Card>
								)}
							</>
						) : null}
					</Space>
				) : null}
			</Drawer>
		</Space>
	);
}


