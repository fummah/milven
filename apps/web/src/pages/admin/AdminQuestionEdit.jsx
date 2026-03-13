import React, { useEffect, useState, useMemo } from 'react';
import { Card, Form, Input, Button, Select, message, Space, Typography, Collapse, InputNumber } from 'antd';
import { ArrowLeftOutlined, PictureOutlined, DeleteFilled, DownOutlined, UpOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { RichTextEditor } from '../../components/RichTextEditor.jsx';

export function AdminQuestionEdit() {
	const { id } = useParams();
	const navigate = useNavigate();
	const [form] = Form.useForm();
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [question, setQuestion] = useState(null);
	const [topics, setTopics] = useState([]);
	const [courses, setCourses] = useState([]);
	const [volumes, setVolumes] = useState([]);
	const [showOptionalFields, setShowOptionalFields] = useState(false);
	const [vignettePanelsOpen, setVignettePanelsOpen] = useState([]);
	const [initialVignetteQuestionIds, setInitialVignetteQuestionIds] = useState([]);
	const [constructedPanelsOpen, setConstructedPanelsOpen] = useState([]);
	const [initialConstructedQuestionIds, setInitialConstructedQuestionIds] = useState([]);

	useEffect(() => {
		let mounted = true;
		(async () => {
			try {
				const [qRes, tRes, cRes, vRes] = await Promise.all([
					api.get(`/api/cms/questions/${id}`),
					api.get('/api/cms/topics'),
					api.get('/api/cms/courses'),
					api.get('/api/cms/volumes')
				]);
				if (!mounted) return;
				const q = qRes.data?.question;
				setQuestion(q);
				setTopics(tRes.data?.topics || []);
				setCourses(cRes.data?.courses || []);
				setVolumes(vRes.data?.volumes || []);

				if (q) {
					const children = Array.isArray(q.children) ? q.children : [];
					const hasChildren = children.length > 0;
					// Vignette MCQ parent with children
					if (q.type === 'VIGNETTE_MCQ' && hasChildren) {
						const vignetteQuestions = children.map(item => ({
							id: item.id,
							stem: item.stem,
							orderIndex: item.orderIndex ?? 0,
							options: (item.options || []).map(o => ({ text: o.text, isCorrect: o.isCorrect }))
						}));
						setInitialVignetteQuestionIds(vignetteQuestions.map(v => v.id));
						form.setFieldsValue({
							type: q.type,
							difficulty: q.difficulty,
							marks: q.marks || 1,
							topicId: q.topicId,
							courseId: q.courseId,
							volumeId: q.module?.volumeId,
							vignetteText: q.vignetteText || '',
							qid: q.qid || '',
							los: q.los || '',
							traceSection: q.traceSection || '',
							tracePage: q.tracePage || '',
							keyFormulas: q.keyFormulas || '',
							workedSolution: q.workedSolution || '',
							vignetteQuestions
						});
						if (vignetteQuestions.length > 0) {
							setVignettePanelsOpen([String(0)]);
						}
					} else if (q.type === 'CONSTRUCTED_RESPONSE' && hasChildren) {
						const constructedSubQuestions = children.map(item => ({
							id: item.id,
							stem: item.stem,
							marks: item.marks || 1,
							orderIndex: item.orderIndex ?? 0
						}));
						setInitialConstructedQuestionIds(constructedSubQuestions.map(v => v.id).filter(Boolean));
						form.setFieldsValue({
							type: q.type,
							difficulty: q.difficulty,
							topicId: q.topicId,
							courseId: q.courseId,
							volumeId: q.module?.volumeId,
							caseStudyText: q.vignetteText || '',
							qid: q.qid || '',
							los: q.los || '',
							traceSection: q.traceSection || '',
							tracePage: q.tracePage || '',
							keyFormulas: q.keyFormulas || '',
							workedSolution: q.workedSolution || '',
							constructedSubQuestions
						});
						if (constructedSubQuestions.length > 0) {
							setConstructedPanelsOpen([String(0)]);
						}
					} else {
						form.setFieldsValue({
							stem: q.stem,
							type: q.type,
							difficulty: q.difficulty,
							marks: q.marks || 1,
							topicId: q.topicId,
							courseId: q.courseId,
							volumeId: q.module?.volumeId,
							vignetteText: q.vignetteText || '',
							qid: q.qid || '',
							los: q.los || '',
							traceSection: q.traceSection || '',
							tracePage: q.tracePage || '',
							keyFormulas: q.keyFormulas || '',
							workedSolution: q.workedSolution || '',
							options: (q.options || []).map(o => ({ text: o.text, isCorrect: o.isCorrect }))
						});
					}
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
		return (courses || [])
			.slice()
			.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
			.map(c => ({ value: c.id, label: `${c.name} (${c.level})` }));
	}, [courses]);

	const filteredTopicOptions = useMemo(() => {
		const courseId = form.getFieldValue('courseId');
		const filtered = courseId
			? topics.filter(t => t.courseId === courseId)
			: topics;
		return filtered.map(t => ({ value: t.id, label: t.name }));
	}, [topics, form]);

	const selectedCourseId = Form.useWatch('courseId', form);
	const selectedVolumeId = Form.useWatch('volumeId', form);
	const volumeOptions = useMemo(() => {
		const filteredTopics = selectedCourseId
			? topics.filter(t => t.courseId === selectedCourseId || t.course?.id === selectedCourseId)
			: [];
		const volumeIds = Array.from(new Set(filteredTopics.map(t => t.module?.volumeId).filter(Boolean)));
		return volumeIds
			.map((volumeId) => {
				const volume = (volumes || []).find((v) => v.id === volumeId);
				return volume ? { value: volume.id, label: volume.name } : null;
			})
			.filter(Boolean);
	}, [topics, volumes, selectedCourseId]);
	const topicOptions = useMemo(() => {
		let filtered = selectedCourseId
			? topics.filter(t => t.courseId === selectedCourseId || t.course?.id === selectedCourseId)
			: topics;
		if (selectedVolumeId) {
			filtered = filtered.filter((t) => t.module?.volumeId === selectedVolumeId);
		}
		return filtered.map(t => ({ value: t.id, label: t.name }));
	}, [topics, selectedCourseId, selectedVolumeId]);

	const submit = async (values) => {
		try {
			setSubmitting(true);
			const hasChildren = Array.isArray(question?.children) && question.children.length > 0;

			// Constructed response bundle: single PUT with subQuestions
			if (values.type === 'CONSTRUCTED_RESPONSE' && hasChildren && Array.isArray(values.constructedSubQuestions)) {
				const subQuestions = values.constructedSubQuestions
					.filter(sq => sq && sq.stem)
					.map(sq => ({
						id: sq.id || undefined,
						stem: sq.stem,
						marks: sq.marks != null && String(sq.marks).trim() !== '' ? Number(sq.marks) : 1
					}));
				await api.put(`/api/cms/questions/${id}`, {
					type: values.type,
					difficulty: values.difficulty,
					topicId: values.topicId,
					vignetteText: values.caseStudyText || null,
					subQuestions,
					qid: values.qid || null,
					los: values.los || null,
					traceSection: values.traceSection || null,
					tracePage: values.tracePage || null,
					keyFormulas: values.keyFormulas || null,
					workedSolution: values.workedSolution || null
				});
			} else if (values.type === 'VIGNETTE_MCQ' && Array.isArray(values.vignetteQuestions) && values.vignetteQuestions.length > 0) {
				// Vignette MCQ bundle: single PUT with subQuestions
				const subQuestions = values.vignetteQuestions
					.filter(sq => sq && sq.stem)
					.map(sq => ({
						id: sq.id || undefined,
						stem: sq.stem,
						marks: values.marks ? Number(values.marks) : 1,
						options: (sq.options || []).map(o => ({ text: o.text, isCorrect: !!o.isCorrect }))
					}));
				await api.put(`/api/cms/questions/${id}`, {
					type: values.type,
					difficulty: values.difficulty,
					marks: values.marks ? Number(values.marks) : undefined,
					topicId: values.topicId,
					vignetteText: values.vignetteText || null,
					subQuestions,
					qid: values.qid || null,
					los: values.los || null,
					traceSection: values.traceSection || null,
					tracePage: values.tracePage || null,
					keyFormulas: values.keyFormulas || null,
					workedSolution: values.workedSolution || null
				});
			} else {
				// Standard single-question update
				await api.put(`/api/cms/questions/${id}`, {
					stem: values.stem,
					type: values.type,
					difficulty: values.difficulty,
					marks: values.marks ? Number(values.marks) : undefined,
					topicId: values.topicId,
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
			}
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
			<div style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
				<Card loading style={{ width: '100%', maxWidth: 800 }}>
					<div style={{ height: 400 }} />
				</Card>
			</div>
		);
	}

	if (!question) {
		return (
			<div style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
				<Card style={{ width: '100%', maxWidth: 800 }}>
					<Typography.Text type="danger">Question not found</Typography.Text>
					<br />
					<Button onClick={() => navigate('/admin/questions')} style={{ marginTop: 16 }}>
						Back to Questions
					</Button>
				</Card>
			</div>
		);
	}

	return (
		<div style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
		<Space direction="vertical" size={16} style={{ width: '100%', maxWidth: 800 }}>
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
								form.setFieldsValue({ topicId: undefined, volumeId: undefined });
							}}
						/>
					</Form.Item>
					<Form.Item name="volumeId" label="Volume">
						<Select
							placeholder="Select volume to filter topics"
							options={volumeOptions}
							showSearch
							optionFilterProp="label"
							allowClear
							disabled={!selectedCourseId || volumeOptions.length === 0}
							onChange={() => {
								form.setFieldsValue({ topicId: undefined });
							}}
						/>
					</Form.Item>
					<Form.Item name="topicId" label="Topic" rules={[{ required: true }]}>
						<Select
							placeholder="Select topic"
							options={topicOptions}
							showSearch
							optionFilterProp="label"
							disabled={topicOptions.length === 0}
						/>
					</Form.Item>
					<Form.Item noStyle shouldUpdate>
						{({ getFieldValue }) => {
							const type = getFieldValue('type');
							if (type === 'VIGNETTE_MCQ') {
								return null;
							}
							if (type === 'CONSTRUCTED_RESPONSE' && Array.isArray(question?.children) && question.children.length > 0) {
								return null;
							}
							return (
								<Form.Item name="stem" label="Question Text" rules={[{ required: true, min: 5 }]}>
									<RichTextEditor placeholder="Enter question stem..." />
								</Form.Item>
							);
						}}
					</Form.Item>
					{/* Image upload is now handled directly inside rich text fields (question, vignette, solution). */}
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
						<Form.Item noStyle shouldUpdate>
							{({ getFieldValue }) => {
								const t = getFieldValue('type');
								if (t === 'CONSTRUCTED_RESPONSE' && Array.isArray(question?.children) && question.children.length > 0) return null;
								return (
									<Form.Item name="marks" label="Marks" rules={[{ required: true }]}>
										<Input type="number" min={1} style={{ width: 120 }} />
									</Form.Item>
								);
							}}
						</Form.Item>
					</Space>
					<div style={{ marginTop: 24 }}>
						<Button
							type="link"
							icon={showOptionalFields ? <UpOutlined /> : <DownOutlined />}
							onClick={() => setShowOptionalFields(!showOptionalFields)}
							style={{ padding: 0, height: 'auto', fontWeight: 500 }}
						>
							{showOptionalFields ? 'Hide optional fields' : 'Show optional fields'}
						</Button>
						{showOptionalFields && (
							<>
								<Space size="large" wrap style={{ width: '100%', marginTop: 12 }}>
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
									<RichTextEditor placeholder="e.g. t = r√((n-2)/(1-r²))" minHeight={80} />
								</Form.Item>
								<Form.Item name="workedSolution" label="Worked Solution (concise)">
									<RichTextEditor placeholder="Brief step-by-step solution..." minHeight={100} />
								</Form.Item>
							</>
						)}
					</div>
					<Form.Item noStyle shouldUpdate>
						{({ getFieldValue }) => {
							const type = getFieldValue('type');
							if (type === 'VIGNETTE_MCQ') {
								return (
									<>
										<Form.Item name="vignetteText" label="Vignette Text">
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
																	{/* hidden id field so we know existing vs new */}
																	<Form.Item name={[qField.name, 'id']} style={{ display: 'none' }}>
																		<Input type="hidden" />
																	</Form.Item>
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
																				<Button
																					onClick={() => addOpt({ text: '', isCorrect: false })}
																					style={{ marginTop: 8 }}
																				>
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
							if (type === 'CONSTRUCTED_RESPONSE' && Array.isArray(question?.children) && question.children.length > 0) {
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
																	<Form.Item name={[qField.name, 'id']} style={{ display: 'none' }}>
																		<Input type="hidden" />
																	</Form.Item>
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
							);
						}}
					</Form.Item>
					<Space style={{ marginTop: 24, width: '100%', justifyContent: 'flex-end' }}>
						<Button onClick={() => navigate('/admin/questions')}>Cancel</Button>
						<Button type="primary" htmlType="submit" loading={submitting}>
							Save Changes
						</Button>
					</Space>
				</Form>
			</Card>
		</Space>
		</div>
	);
}
