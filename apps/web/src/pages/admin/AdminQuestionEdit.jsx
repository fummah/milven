import React, { useEffect, useState, useMemo } from 'react';
import { Card, Form, Input, Button, Select, message, Space, Typography, Upload, Divider } from 'antd';
import { ArrowLeftOutlined, PictureOutlined, DeleteFilled } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';

export function AdminQuestionEdit() {
	const { id } = useParams();
	const navigate = useNavigate();
	const [form] = Form.useForm();
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [question, setQuestion] = useState(null);
	const [topics, setTopics] = useState([]);
	const [courses, setCourses] = useState([]);
	const [imageUploading, setImageUploading] = useState(false);
	const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

	useEffect(() => {
		let mounted = true;
		(async () => {
			try {
				const [qRes, tRes, cRes] = await Promise.all([
					api.get(`/api/cms/questions/${id}`),
					api.get('/api/cms/topics'),
					api.get('/api/cms/courses')
				]);
				if (!mounted) return;
				const q = qRes.data?.question;
				setQuestion(q);
				setTopics(tRes.data?.topics || []);
				setCourses(cRes.data?.courses || []);

				if (q) {
					form.setFieldsValue({
						stem: q.stem,
						type: q.type,
						difficulty: q.difficulty,
						marks: q.marks || 1,
						topicId: q.topicId,
						courseId: q.courseId,
						vignetteText: q.vignette?.text || '',
						imageUrl: q.imageUrl || '',
						qid: q.qid || '',
						los: q.los || '',
						traceSection: q.traceSection || '',
						tracePage: q.tracePage || '',
						keyFormulas: q.keyFormulas || '',
						workedSolution: q.workedSolution || '',
						options: (q.options || []).map(o => ({ text: o.text, isCorrect: o.isCorrect }))
					});
				}
			} catch (e) {
				message.error('Failed to load question');
				navigate('/admin/questions');
			} finally {
				if (mounted) setLoading(false);
			}
		})();
		return () => { mounted = false; };
	}, [id, form, navigate]);

	const filteredCoursesOptions = useMemo(() => {
		return (courses || []).map(c => ({ value: c.id, label: `${c.name} (${c.level})` }));
	}, [courses]);

	const filteredTopicOptions = useMemo(() => {
		const courseId = form.getFieldValue('courseId');
		const filtered = courseId
			? topics.filter(t => t.courseId === courseId)
			: topics;
		return filtered.map(t => ({ value: t.id, label: t.name }));
	}, [topics, form]);

	const submit = async (values) => {
		try {
			setSubmitting(true);
			await api.put(`/api/cms/questions/${id}`, {
				stem: values.stem,
				type: values.type,
				difficulty: values.difficulty,
				marks: values.marks ? Number(values.marks) : undefined,
				topicId: values.topicId,
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
			message.success('Question updated');
			navigate('/admin/questions');
		} catch (e) {
			message.error(e?.response?.data?.error || 'Failed to update question');
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) {
		return (
			<Card loading style={{ maxWidth: 800, margin: '0 auto' }}>
				<div style={{ height: 400 }} />
			</Card>
		);
	}

	if (!question) {
		return (
			<Card style={{ maxWidth: 800, margin: '0 auto' }}>
				<Typography.Text type="danger">Question not found</Typography.Text>
				<br />
				<Button onClick={() => navigate('/admin/questions')} style={{ marginTop: 16 }}>
					Back to Questions
				</Button>
			</Card>
		);
	}

	return (
		<Space direction="vertical" size={16} style={{ width: '100%', maxWidth: 800, margin: '0 auto' }}>
			<Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/questions')}>
				Back to Questions
			</Button>

			<Card title="Edit Question">
				<Form layout="vertical" form={form} onFinish={submit}>
					<Form.Item name="courseId" label="Course">
						<Select
							placeholder="Select course to filter topics"
							options={filteredCoursesOptions}
							showSearch
							optionFilterProp="label"
							allowClear
							onChange={() => {
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
					<Space style={{ marginTop: 24, width: '100%', justifyContent: 'flex-end' }}>
						<Button onClick={() => navigate('/admin/questions')}>Cancel</Button>
						<Button type="primary" htmlType="submit" loading={submitting}>
							Save Changes
						</Button>
					</Space>
				</Form>
			</Card>
		</Space>
	);
}
