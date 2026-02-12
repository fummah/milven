import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, Button, Typography, Space, message, Switch, InputNumber, Radio, Modal, Drawer, Tag, Divider } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, TrophyOutlined } from '@ant-design/icons';

const QUESTIONS_PER_PAGE = 10;

function Calculator({ visible }) {
	const [a, setA] = useState(0);
	const [b, setB] = useState(0);
	if (!visible) return null;
	return (
		<Card size="small" title="Calculator" style={{ marginBottom: 12 }}>
			<Space>
				<InputNumber value={a} onChange={setA} />
				<InputNumber value={b} onChange={setB} />
				<Typography.Text>= {Number(a || 0) + Number(b || 0)}</Typography.Text>
			</Space>
		</Card>
	);
}

function formatRemaining(seconds) {
	if (seconds == null || seconds < 0) return '0:00';
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}

export function ExamTake() {
	const { attemptId } = useParams();
	const navigate = useNavigate();
	const [attempt, setAttempt] = useState(null);
	const [currentPage, setCurrentPage] = useState(0);
	const [showCalc, setShowCalc] = useState(false);
	const questionRefs = useRef([]);
	const [now, setNow] = useState(() => Date.now());
	const [resultModalOpen, setResultModalOpen] = useState(false);
	const [resultAttempt, setResultAttempt] = useState(null);
	const [answersDrawerOpen, setAnswersDrawerOpen] = useState(false);
	const [answersDrawerAttempt, setAnswersDrawerAttempt] = useState(null);

	useEffect(() => {
		let mounted = true;
		(async () => {
			try {
				const res = await api.get(`/api/exams/attempts/${attemptId}`);
				if (mounted) setAttempt(res.data.attempt);
			} catch {
				message.error('Unable to load attempt');
			}
		})();
		return () => {
			mounted = false;
		};
	}, [attemptId]);

	// Live countdown: remaining time from startedAt + timeLimitMinutes (only while in progress)
	useEffect(() => {
		if (!attempt || attempt.status !== 'IN_PROGRESS' || !attempt.exam?.timeLimitMinutes) return;
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, [attempt?.id, attempt?.status, attempt?.exam?.timeLimitMinutes]);

	const remainingSec = useMemo(() => {
		if (!attempt || attempt.status !== 'IN_PROGRESS' || !attempt.exam?.timeLimitMinutes) return null;
		const startedAt = attempt.startedAt ? new Date(attempt.startedAt).getTime() : 0;
		const totalMs = attempt.exam.timeLimitMinutes * 60 * 1000;
		const elapsed = now - startedAt;
		return Math.max(0, Math.floor((totalMs - elapsed) / 1000));
	}, [attempt, now]);

	const submitRef = useRef(false);

	// Auto-submit once when time runs out; show result modal
	useEffect(() => {
		if (remainingSec !== 0 || attempt?.status !== 'IN_PROGRESS' || submitRef.current) return;
		submitRef.current = true;
		api.post(`/api/exams/attempts/${attemptId}/submit`)
			.then(() => api.get(`/api/exams/attempts/${attemptId}`))
			.then((res) => {
				setAttempt(res.data.attempt);
				setResultAttempt(res.data.attempt);
				setResultModalOpen(true);
			})
			.catch(() => { submitRef.current = false; });
	}, [remainingSec, attempt?.status, attemptId]);

	const courseName = attempt?.courseName || attempt?.exam?.name || 'Exam';
	const timeUp = remainingSec !== null && remainingSec <= 0;
	const isSubmitted = attempt?.status === 'SUBMITTED';

	if (!attempt) return null;
	const answers = attempt.answers || [];
	const questions = answers.map(a => a.question).filter(Boolean);
	const hasQuestions = questions.length > 0;
	const totalQuestions = questions.length;
	const totalPages = Math.max(1, Math.ceil(totalQuestions / QUESTIONS_PER_PAGE));
	const pageStart = currentPage * QUESTIONS_PER_PAGE;
	const pageEnd = Math.min(pageStart + QUESTIONS_PER_PAGE, totalQuestions);
	const pageAnswers = answers.slice(pageStart, pageEnd);
	const pageQuestions = questions.slice(pageStart, pageEnd);
	const scorePct = Math.round(attempt.scorePercent ?? 0);
	const passed = scorePct >= 70;

	const onSelectOption = async (questionId, optionId) => {
		try {
			await api.post(`/api/exams/attempts/${attemptId}/answers`, {
				questionId,
				selectedOptionId: optionId
			});
			const res = await api.get(`/api/exams/attempts/${attemptId}`);
			setAttempt(res.data.attempt);
		} catch {
			message.error('Failed to save answer');
		}
	};

	const scrollToQuestion = (idx) => {
		const ref = questionRefs.current[pageStart + idx];
		if (ref) ref.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	const submit = async () => {
		if (submitRef.current) return;
		submitRef.current = true;
		try {
			await api.post(`/api/exams/attempts/${attemptId}/submit`);
			const res = await api.get(`/api/exams/attempts/${attemptId}`);
			setAttempt(res.data.attempt);
			setResultAttempt(res.data.attempt);
			setResultModalOpen(true);
		} catch {
			submitRef.current = false;
		}
	};

	const closeResultModal = () => {
		setResultModalOpen(false);
		setResultAttempt(null);
	};

	const openAnswersDrawer = () => {
		setAnswersDrawerAttempt(resultAttempt);
		closeResultModal();
		setAnswersDrawerOpen(true);
	};

	const closeAnswersDrawer = () => {
		setAnswersDrawerOpen(false);
		setAnswersDrawerAttempt(null);
	};

	return (
		<Space direction="vertical" size={16} style={{ width: '100%', maxWidth: 1200, margin: '0 auto', padding: 16 }}>
			<Card size="small" style={{ marginBottom: 8 }}>
				<Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
					<Typography.Title level={5} style={{ margin: 0 }}>
						{courseName}
					</Typography.Title>
					{!isSubmitted && remainingSec != null && (
						<Space>
							<ClockCircleOutlined />
							<Typography.Text strong style={{ color: remainingSec <= 300 ? '#cf1322' : undefined }}>
								Remaining: {formatRemaining(remainingSec)}
							</Typography.Text>
						</Space>
					)}
				</Space>
			</Card>

			{isSubmitted ? (
				<Card title="Exam submitted" style={{ maxWidth: 480 }}>
					<Space direction="vertical" size={16} style={{ width: '100%' }}>
						<Typography.Title level={3} style={{ margin: 0 }}>{scorePct}%</Typography.Title>
						<Tag color={passed ? 'success' : 'error'}>{passed ? 'Passed' : 'Below passing (70%)'}</Tag>
						<Space>
							<Button type="primary" onClick={() => { setAnswersDrawerAttempt(attempt); setAnswersDrawerOpen(true); }}>
								View correct answers
							</Button>
							<Button onClick={() => navigate(window.location.pathname.startsWith('/student/') ? '/student' : -1)}>
								Back to dashboard
							</Button>
						</Space>
					</Space>
				</Card>
			) : (
				<Card
					title={null}
					extra={
						<Space>
							<Switch checkedChildren="Calc" unCheckedChildren="Calc" checked={showCalc} onChange={setShowCalc} />
							<Button type="primary" danger onClick={submit} disabled={timeUp}>
								{timeUp ? 'Time\'s up' : 'Submit'}
							</Button>
						</Space>
					}
				>
					{hasQuestions ? (
						<Space direction="vertical" size={16} style={{ width: '100%' }}>
							{/* Top row: question numbers for current page */}
							<Space wrap size="small">
								{Array.from({ length: pageEnd - pageStart }, (_, i) => pageStart + i + 1).map((num, i) => (
									<Button
										key={num}
										type="default"
										size="small"
										onClick={() => scrollToQuestion(i)}
									>
										{num}
									</Button>
								))}
							</Space>
							{/* Scrollable questions (quiz-style) */}
							<div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 8 }}>
								<Space direction="vertical" size={16} style={{ width: '100%' }}>
									{pageQuestions.length === 0 && (
										<Typography.Text type="secondary">No questions on this page.</Typography.Text>
									)}
									{pageQuestions.map((q, idx) => {
										const globalIdx = pageStart + idx;
										const ans = pageAnswers[idx];
										return (
											<div
												key={q?.id || globalIdx}
												ref={(el) => { questionRefs.current[globalIdx] = el; }}
												style={{ paddingBottom: 8 }}
											>
												<Typography.Text strong>{`Q${globalIdx + 1}. ${q?.stem ?? ''}`}</Typography.Text>
												{q?.vignette?.text && (
													<Card size="small" style={{ marginTop: 8, marginBottom: 8 }} title="Vignette">
														<Typography.Paragraph style={{ margin: 0 }}>{q.vignette.text}</Typography.Paragraph>
													</Card>
												)}
												{q?.options?.length ? (
													<Radio.Group
														value={ans?.selectedOptionId ?? undefined}
														onChange={(e) => onSelectOption(q.id, e.target.value)}
														style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}
													>
														{q.options.map((opt) => (
															<Radio key={opt.id} value={opt.id} style={{ marginLeft: 0 }}>
																{opt.text}
															</Radio>
														))}
													</Radio.Group>
												) : (
													<Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>No options.</Typography.Paragraph>
												)}
												<Divider style={{ margin: '12px 0 0' }} />
											</div>
										);
									})}
								</Space>
							</div>
							<Space>
								<Button
									disabled={currentPage <= 0}
									onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
								>
									Previous page
								</Button>
								<Button
									disabled={currentPage >= totalPages - 1}
									onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
								>
									Next page
								</Button>
								<Typography.Text type="secondary">
									Page {currentPage + 1} of {totalPages} (questions {pageStart + 1}–{pageEnd})
								</Typography.Text>
							</Space>
						</Space>
					) : (
						<Space direction="vertical" size={16}>
							<Typography.Paragraph type="secondary">This exam has no questions yet. You can still submit to finish.</Typography.Paragraph>
							<Button type="primary" danger onClick={submit} disabled={timeUp}>
								{timeUp ? 'Time\'s up' : 'Submit'}
							</Button>
						</Space>
					)}
				</Card>
			)}

			<Modal
				title={null}
				open={resultModalOpen}
				onCancel={closeResultModal}
				footer={null}
				width={420}
				centered
				destroyOnClose
				styles={{ body: { padding: '24px 24px 16px' } }}
			>
				<Space direction="vertical" size={20} style={{ width: '100%', textAlign: 'center' }}>
					<div style={{ padding: '16px 0' }}>
						<TrophyOutlined style={{ fontSize: 48, color: '#faad14' }} />
						<Typography.Title level={3} style={{ margin: '12px 0 4px' }}>
							Exam complete
						</Typography.Title>
						<Typography.Text type="secondary">Your score</Typography.Text>
						<Typography.Title level={1} style={{ margin: '8px 0', color: '#102540' }}>
							{resultAttempt != null ? `${Math.round(resultAttempt.scorePercent ?? 0)}%` : '—'}
						</Typography.Title>
						{(resultAttempt?.scorePercent ?? 0) >= 70 ? (
							<Space style={{ color: '#52c41a' }}>
								<CheckCircleOutlined /> Passed
							</Space>
						) : (resultAttempt?.scorePercent ?? 0) > 0 ? (
							<Space style={{ color: '#ff4d4f' }}>
								<CloseCircleOutlined /> Below passing (70%)
							</Space>
						) : null}
					</div>
					<Space style={{ width: '100%', justifyContent: 'center' }} size="middle">
						<Button type="primary" size="large" onClick={openAnswersDrawer}>
							View correct answers
						</Button>
						<Button size="large" onClick={() => { closeResultModal(); navigate(window.location.pathname.startsWith('/student/') ? '/student' : -1); }}>
							Close
						</Button>
					</Space>
				</Space>
			</Modal>

			<Drawer
				title="Correct answers"
				placement="right"
				width={Math.min(480, typeof window !== 'undefined' ? window.innerWidth * 0.9 : 480)}
				open={answersDrawerOpen}
				onClose={closeAnswersDrawer}
				destroyOnClose
			>
				{!answersDrawerAttempt ? (
					<Typography.Text type="secondary">No data.</Typography.Text>
				) : (
					<Space direction="vertical" size={20} style={{ width: '100%' }}>
						{(() => {
							const ansList = answersDrawerAttempt.answers || [];
							const total = ansList.length || 1;
							const correctCount = ansList.filter(x => x.isCorrect === true).length;
							const pct = Math.round(answersDrawerAttempt.scorePercent ?? (correctCount / total) * 100);
							const isPassed = pct >= 70;
							return (
								<div
									style={{
										background: isPassed ? 'linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)' : 'linear-gradient(135deg, #fff2f0 0%, #ffccc7 100%)',
										borderRadius: 12,
										padding: 20,
										border: `1px solid ${isPassed ? '#b7eb8f' : '#ffa39e'}`,
										marginBottom: 8
									}}
								>
									<Space direction="vertical" size={12} style={{ width: '100%', alignItems: 'center', textAlign: 'center' }}>
										<Typography.Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
											Exam result
										</Typography.Text>
										<Typography.Title level={2} style={{ margin: 0, color: isPassed ? '#389e0d' : '#cf1322', fontWeight: 700 }}>
											{pct}%
										</Typography.Title>
										<Tag color={isPassed ? 'success' : 'error'} style={{ margin: 0, fontWeight: 600 }}>
											{isPassed ? 'Passed' : 'Below passing (70%)'}
										</Tag>
										<Typography.Text style={{ color: '#595959', fontSize: 14 }}>
											{correctCount} of {total} correct
										</Typography.Text>
									</Space>
								</div>
							);
						})()}
						<Typography.Text type="secondary" style={{ display: 'block' }}>
							Review each question with the correct answer and your answer.
						</Typography.Text>
						{(answersDrawerAttempt.answers || []).length === 0 ? (
							<Typography.Text type="secondary">No answers to review.</Typography.Text>
						) : (
							(answersDrawerAttempt.answers || []).map((a, idx) => {
								const correct = a.isCorrect === true;
								const correctOpt = (a?.question?.options || []).find(o => o.isCorrect);
								const correctText = correctOpt?.text ?? '—';
								const yourText = a?.selectedOption?.text ?? '—';
								return (
									<div key={a.id || idx} style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
										<Typography.Text strong>Question {idx + 1}</Typography.Text>
										<Typography.Paragraph style={{ margin: '8px 0 4px' }}>{a?.question?.stem}</Typography.Paragraph>
										<Space direction="vertical" size={4}>
											<Space>
												{correct ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
												<Typography.Text type="secondary">Your answer:</Typography.Text>
												<Typography.Text>{yourText}</Typography.Text>
											</Space>
											{!correct && (
												<Space style={{ marginLeft: 24 }}>
													<Typography.Text type="secondary">Correct answer:</Typography.Text>
													<Typography.Text style={{ color: '#52c41a' }}>{correctText}</Typography.Text>
												</Space>
											)}
										</Space>
									</div>
								);
							})
						)}
					</Space>
				)}
			</Drawer>
		</Space>
	);
}


