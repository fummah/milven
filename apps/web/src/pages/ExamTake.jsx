import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, Button, Typography, Space, message, Switch, InputNumber, Radio, Modal, Drawer, Tag, Divider, Progress, Tooltip } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, TrophyOutlined, SendOutlined, CalculatorOutlined, BookOutlined, FireOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';

const QUESTIONS_PER_PAGE = 10;

function Calculator({ visible, onClose }) {
	const [display, setDisplay] = useState('0');
	const [prev, setPrev] = useState(null);
	const [op, setOp] = useState(null);
	const [waitingForOperand, setWaitingForOperand] = useState(false);

	if (!visible) return null;

	const inputDigit = (d) => {
		if (waitingForOperand) {
			setDisplay(String(d));
			setWaitingForOperand(false);
		} else {
			setDisplay(display === '0' ? String(d) : display + d);
		}
	};

	const inputDot = () => {
		if (waitingForOperand) {
			setDisplay('0.');
			setWaitingForOperand(false);
		} else if (!display.includes('.')) {
			setDisplay(display + '.');
		}
	};

	const clear = () => {
		setDisplay('0');
		setPrev(null);
		setOp(null);
		setWaitingForOperand(false);
	};

	const performOp = (nextOp) => {
		const input = parseFloat(display);
		if (prev == null) {
			setPrev(input);
		} else if (op) {
			const result = op === '+' ? prev + input : op === '-' ? prev - input : op === '*' ? prev * input : op === '/' ? prev / input : input;
			setDisplay(String(result));
			setPrev(result);
		}
		setWaitingForOperand(true);
		setOp(nextOp);
	};

	const calculate = () => {
		if (!op || prev == null) return;
		const input = parseFloat(display);
		const result = op === '+' ? prev + input : op === '-' ? prev - input : op === '*' ? prev * input : op === '/' ? prev / input : input;
		setDisplay(String(result));
		setPrev(null);
		setOp(null);
		setWaitingForOperand(true);
	};

	const btnClass = "w-12 h-10 rounded-lg font-semibold transition-all hover:scale-105 active:scale-95";

	return (
		<motion.div
			initial={{ opacity: 0, y: -10, scale: 0.95 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={{ opacity: 0, y: -10, scale: 0.95 }}
			className="absolute top-full right-0 mt-2 z-50"
		>
			<Card
				size="small"
				className="shadow-2xl border-0"
				style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #102540 100%)', borderRadius: 16, width: 220 }}
				styles={{ body: { padding: 12 } }}
			>
				<div className="bg-white/10 rounded-lg p-3 mb-3 text-right">
					<Typography.Text className="text-2xl font-mono text-white">{display}</Typography.Text>
				</div>
				<div className="grid grid-cols-4 gap-1.5">
					<button onClick={clear} className={`${btnClass} bg-red-500/80 text-white col-span-2`}>AC</button>
					<button onClick={() => performOp('/')} className={`${btnClass} bg-amber-500/80 text-white`}>÷</button>
					<button onClick={() => performOp('*')} className={`${btnClass} bg-amber-500/80 text-white`}>×</button>
					{[7,8,9].map(n => <button key={n} onClick={() => inputDigit(n)} className={`${btnClass} bg-white/20 text-white`}>{n}</button>)}
					<button onClick={() => performOp('-')} className={`${btnClass} bg-amber-500/80 text-white`}>−</button>
					{[4,5,6].map(n => <button key={n} onClick={() => inputDigit(n)} className={`${btnClass} bg-white/20 text-white`}>{n}</button>)}
					<button onClick={() => performOp('+')} className={`${btnClass} bg-amber-500/80 text-white`}>+</button>
					{[1,2,3].map(n => <button key={n} onClick={() => inputDigit(n)} className={`${btnClass} bg-white/20 text-white`}>{n}</button>)}
					<button onClick={calculate} className={`${btnClass} bg-emerald-500 text-white row-span-2`}>=</button>
					<button onClick={() => inputDigit(0)} className={`${btnClass} bg-white/20 text-white col-span-2`}>0</button>
					<button onClick={inputDot} className={`${btnClass} bg-white/20 text-white`}>.</button>
				</div>
			</Card>
		</motion.div>
	);
}

function formatRemaining(seconds) {
	if (seconds == null || seconds < 0) return '0:00';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

	const totalTimeSec = attempt?.exam?.timeLimitMinutes ? attempt.exam.timeLimitMinutes * 60 : null;
	const timeProgress = totalTimeSec && remainingSec != null ? Math.round((remainingSec / totalTimeSec) * 100) : 100;

	const submitRef = useRef(false);

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

	if (!attempt) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<motion.div
					animate={{ rotate: 360 }}
					transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
					className="w-12 h-12 rounded-full border-4 border-[#102540] border-t-transparent"
				/>
			</div>
		);
	}

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
	const answeredCount = answers.filter(a => a.selectedOptionId).length;

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

	const scrollToQuestion = (globalIdx) => {
		const targetPage = Math.floor(globalIdx / QUESTIONS_PER_PAGE);
		if (targetPage !== currentPage) {
			setCurrentPage(targetPage);
			setTimeout(() => {
				const ref = questionRefs.current[globalIdx];
				if (ref) ref.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}, 100);
		} else {
			const ref = questionRefs.current[globalIdx];
			if (ref) ref.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
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

	const getTimerColor = () => {
		if (remainingSec == null) return '#102540';
		if (remainingSec <= 60) return '#ef4444';
		if (remainingSec <= 300) return '#f59e0b';
		return '#10b981';
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40">
			{/* Sticky Header */}
			{!isSubmitted && (
				<div
					className="sticky top-0 z-50 backdrop-blur-xl"
					style={{
						background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 40%, #234567 100%)',
						boxShadow: '0 4px 30px rgba(16, 37, 64, 0.3)'
					}}
				>
					{/* Top Section: Course Name & Timer */}
					<div className="px-4 py-3 border-b border-white/10">
						<div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-3">
							<div className="flex items-center gap-3">
								<div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg">
									<BookOutlined className="text-white text-lg" />
								</div>
								<div>
									<Typography.Text className="text-white/60 text-xs uppercase tracking-wider">
										Exam in Progress
									</Typography.Text>
									<Typography.Title level={5} className="!text-white !m-0 !text-base sm:!text-lg">
										{courseName}
									</Typography.Title>
								</div>
							</div>

							{remainingSec != null && (
								<motion.div
									className="flex items-center gap-3 px-4 py-2 rounded-2xl"
									style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}
									animate={remainingSec <= 60 ? { scale: [1, 1.02, 1] } : {}}
									transition={{ repeat: remainingSec <= 60 ? Infinity : 0, duration: 0.5 }}
								>
									<div className="relative">
										<Progress
											type="circle"
											percent={timeProgress}
											size={44}
											strokeColor={getTimerColor()}
											trailColor="rgba(255,255,255,0.2)"
											format={() => (
												<ClockCircleOutlined style={{ color: getTimerColor(), fontSize: 16 }} />
											)}
										/>
									</div>
									<div className="text-right">
										<Typography.Text className="text-white/60 text-xs block">Time Left</Typography.Text>
										<Typography.Text
											className="text-xl font-bold font-mono"
											style={{ color: getTimerColor() }}
										>
											{formatRemaining(remainingSec)}
										</Typography.Text>
									</div>
								</motion.div>
							)}
						</div>
					</div>

					{/* Bottom Section: Question Numbers & Actions */}
					<div className="px-4 py-4">
						<div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
							{/* Question Number Pills */}
							<div className="flex-1 overflow-x-auto py-1 thin-scrollbar">
								<div className="flex items-center gap-2 min-w-max">
									<Typography.Text className="text-white/60 text-xs mr-2 hidden sm:inline">Questions:</Typography.Text>
									{Array.from({ length: totalQuestions }, (_, i) => {
										const isAnswered = answers[i]?.selectedOptionId;
										const isCurrent = i >= pageStart && i < pageEnd;
										return (
											<Tooltip key={i} title={`Question ${i + 1}${isAnswered ? ' (Answered)' : ' (Not answered)'}`}>
												<motion.button
													whileHover={{ scale: 1.1 }}
													whileTap={{ scale: 0.95 }}
													onClick={() => scrollToQuestion(i)}
													className={`
														w-8 h-8 rounded-lg text-xs font-semibold transition-all
														${isAnswered
															? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30'
															: isCurrent
																? 'bg-white/20 text-white ring-2 ring-cyan-400'
																: 'bg-white/10 text-white/70 hover:bg-white/20'
														}
													`}
												>
													{i + 1}
												</motion.button>
											</Tooltip>
										);
									})}
								</div>
							</div>

							{/* Actions */}
							<div className="flex items-center gap-2 relative">
								<div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white/80 text-sm">
									<CheckCircleOutlined className="text-emerald-400" />
									<span>{answeredCount}/{totalQuestions}</span>
								</div>

								<Tooltip title="Calculator">
									<motion.button
										whileHover={{ scale: 1.05 }}
										whileTap={{ scale: 0.95 }}
										onClick={() => setShowCalc(!showCalc)}
										className={`
											w-10 h-10 rounded-xl flex items-center justify-center transition-all
											${showCalc
												? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg'
												: 'bg-white/10 text-white hover:bg-white/20'
											}
										`}
									>
										<CalculatorOutlined className="text-lg" />
									</motion.button>
								</Tooltip>

								<motion.button
									whileHover={{ scale: 1.03 }}
									whileTap={{ scale: 0.97 }}
									onClick={submit}
									disabled={timeUp}
									className={`
										px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all
										${timeUp
											? 'bg-gray-400 text-white cursor-not-allowed'
											: 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40'
										}
									`}
								>
									<SendOutlined />
									<span>{timeUp ? "Time's up" : 'Submit Exam'}</span>
								</motion.button>

								<AnimatePresence>
									{showCalc && <Calculator visible={showCalc} onClose={() => setShowCalc(false)} />}
								</AnimatePresence>
							</div>
						</div>
					</div>

					{/* Progress Bar */}
					<div className="h-1 bg-white/10">
						<motion.div
							className="h-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400"
							initial={{ width: 0 }}
							animate={{ width: `${(answeredCount / totalQuestions) * 100}%` }}
							transition={{ duration: 0.3 }}
						/>
					</div>
				</div>
			)}

			{/* Main Content */}
			<div className="max-w-4xl mx-auto px-4 py-6">
				{isSubmitted ? (
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						className="max-w-lg mx-auto"
					>
						<Card
							className="overflow-hidden border-0 shadow-2xl"
							style={{ borderRadius: 24 }}
							styles={{ body: { padding: 0 } }}
						>
							<div
								className="p-8 text-center"
								style={{
									background: passed
										? 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)'
										: 'linear-gradient(135deg, #dc2626 0%, #ef4444 50%, #f87171 100%)'
								}}
							>
								<motion.div
									initial={{ scale: 0 }}
									animate={{ scale: 1 }}
									transition={{ type: 'spring', delay: 0.2 }}
								>
									<TrophyOutlined className="text-6xl text-white/90 mb-4" />
								</motion.div>
								<Typography.Title level={2} className="!text-white !mb-2">
									Exam Complete!
								</Typography.Title>
								<Typography.Text className="text-white/80 text-lg">
									Your final score
								</Typography.Text>
								<motion.div
									initial={{ scale: 0.5, opacity: 0 }}
									animate={{ scale: 1, opacity: 1 }}
									transition={{ delay: 0.3, type: 'spring' }}
								>
									<Typography.Title level={1} className="!text-white !text-7xl !my-4 font-bold">
										{scorePct}%
									</Typography.Title>
								</motion.div>
								<Tag
									className="text-lg px-4 py-1 border-0"
									style={{
										background: 'rgba(255,255,255,0.2)',
										color: 'white',
										borderRadius: 20
									}}
								>
									{passed ? '🎉 Congratulations! You Passed!' : '📚 Keep Practicing!'}
								</Tag>
							</div>
							<div className="p-6 bg-white">
								<Space direction="vertical" size={12} className="w-full">
									<Button
										type="primary"
										size="large"
										block
										onClick={() => { setAnswersDrawerAttempt(attempt); setAnswersDrawerOpen(true); }}
										className="h-12 rounded-xl font-semibold"
										style={{ background: '#102540' }}
									>
										View Correct Answers
									</Button>
									<Button
										size="large"
										block
										onClick={() => navigate(window.location.pathname.startsWith('/student/') ? '/student' : -1)}
										className="h-12 rounded-xl font-semibold"
									>
										Back to Dashboard
									</Button>
								</Space>
							</div>
						</Card>
					</motion.div>
				) : hasQuestions ? (
					<Space direction="vertical" size={20} className="w-full">
						{/* Page indicator */}
						<div className="flex items-center justify-between">
							<Typography.Text className="text-slate-500">
								Showing questions {pageStart + 1} - {pageEnd} of {totalQuestions}
							</Typography.Text>
							<Space>
								<Button
									disabled={currentPage <= 0}
									onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
									className="rounded-lg"
								>
									← Previous
								</Button>
								<Button
									disabled={currentPage >= totalPages - 1}
									onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
									className="rounded-lg"
								>
									Next →
								</Button>
							</Space>
						</div>

						{/* Questions */}
						{pageQuestions.map((q, idx) => {
							const globalIdx = pageStart + idx;
							const ans = pageAnswers[idx];
							const isAnswered = !!ans?.selectedOptionId;

							return (
								<motion.div
									key={q?.id || globalIdx}
									ref={(el) => { questionRefs.current[globalIdx] = el; }}
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: idx * 0.05 }}
								>
									<Card
										className={`
											border-0 shadow-lg hover:shadow-xl transition-all overflow-hidden
											${isAnswered ? 'ring-2 ring-emerald-400/50' : ''}
										`}
										style={{ borderRadius: 20 }}
										styles={{ body: { padding: 0 } }}
									>
										{/* Question Header */}
										<div
											className="px-6 py-4 flex items-center justify-between"
											style={{
												background: isAnswered
													? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
													: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)'
											}}
										>
											<div className="flex items-center gap-3">
												<div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
													<span className="text-white font-bold">{globalIdx + 1}</span>
												</div>
												<Typography.Text className="text-white/80 text-sm">
													Question {globalIdx + 1} of {totalQuestions}
												</Typography.Text>
											</div>
											{isAnswered && (
												<Tag className="bg-white/20 text-white border-0 rounded-full">
													<CheckCircleOutlined className="mr-1" /> Answered
												</Tag>
											)}
										</div>

										{/* Question Body */}
										<div className="p-6">
											{q?.vignette?.text && (
												<div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200">
													<div className="flex items-center gap-2 mb-2">
														<FireOutlined className="text-amber-500" />
														<Typography.Text className="text-amber-700 font-semibold text-sm uppercase tracking-wide">
															Case Study
														</Typography.Text>
													</div>
													<Typography.Paragraph className="text-slate-700 !mb-0">
														{q.vignette.text}
													</Typography.Paragraph>
												</div>
											)}

											<Typography.Paragraph className="text-lg text-slate-800 font-medium !mb-6">
												{q?.stem ?? ''}
											</Typography.Paragraph>

											{q?.options?.length ? (
												<Radio.Group
													value={ans?.selectedOptionId ?? undefined}
													onChange={(e) => onSelectOption(q.id, e.target.value)}
													className="w-full"
												>
													<Space direction="vertical" size={12} className="w-full">
														{q.options.map((opt, optIdx) => {
															const isSelected = ans?.selectedOptionId === opt.id;
															const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
															return (
																<motion.div
																	key={opt.id}
																	whileHover={{ scale: 1.01 }}
																	whileTap={{ scale: 0.99 }}
																>
																	<Radio
																		value={opt.id}
																		className={`
																			w-full p-4 rounded-xl border-2 transition-all
																			${isSelected
																				? 'border-emerald-400 bg-emerald-50'
																				: 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
																			}
																		`}
																		style={{ display: 'flex', alignItems: 'flex-start' }}
																	>
																		<div className="flex items-start gap-3">
																			<span
																				className={`
																					w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0
																					${isSelected
																						? 'bg-emerald-500 text-white'
																						: 'bg-slate-100 text-slate-600'
																					}
																				`}
																			>
																				{letters[optIdx] || optIdx + 1}
																			</span>
																			<span className="text-slate-700 pt-1">{opt.text}</span>
																		</div>
																	</Radio>
																</motion.div>
															);
														})}
													</Space>
												</Radio.Group>
											) : (
												<Typography.Paragraph type="secondary">No options available.</Typography.Paragraph>
											)}
										</div>
									</Card>
								</motion.div>
							);
						})}

						{/* Bottom Pagination */}
						<div className="flex items-center justify-center gap-4 pt-4">
							<Button
								size="large"
								disabled={currentPage <= 0}
								onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
								className="rounded-xl px-6"
							>
								← Previous Page
							</Button>
							<div className="px-4 py-2 rounded-xl bg-slate-100">
								<Typography.Text className="font-semibold">
									Page {currentPage + 1} of {totalPages}
								</Typography.Text>
							</div>
							<Button
								size="large"
								disabled={currentPage >= totalPages - 1}
								onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
								className="rounded-xl px-6"
							>
								Next Page →
							</Button>
						</div>
					</Space>
				) : (
					<Card className="text-center p-8 border-0 shadow-lg" style={{ borderRadius: 20 }}>
						<ThunderboltOutlined className="text-5xl text-slate-300 mb-4" />
						<Typography.Title level={4} className="!text-slate-600">
							No questions available
						</Typography.Title>
						<Typography.Paragraph type="secondary" className="mb-6">
							This exam has no questions yet. You can still submit to finish.
						</Typography.Paragraph>
						<Button
							type="primary"
							size="large"
							danger
							onClick={submit}
							disabled={timeUp}
							className="rounded-xl px-8"
						>
							{timeUp ? "Time's up" : 'Submit Exam'}
						</Button>
					</Card>
				)}
			</div>

			{/* Result Modal */}
			<Modal
				title={null}
				open={resultModalOpen}
				onCancel={closeResultModal}
				footer={null}
				width={440}
				centered
				destroyOnClose
				styles={{ body: { padding: 0 } }}
				className="result-modal"
			>
				<div
					className="p-8 text-center"
					style={{
						background: (resultAttempt?.scorePercent ?? 0) >= 70
							? 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)'
							: 'linear-gradient(135deg, #dc2626 0%, #ef4444 50%, #f87171 100%)'
					}}
				>
					<motion.div
						initial={{ scale: 0, rotate: -180 }}
						animate={{ scale: 1, rotate: 0 }}
						transition={{ type: 'spring', duration: 0.6 }}
					>
						<TrophyOutlined className="text-6xl text-white/90 mb-4" />
					</motion.div>
					<Typography.Title level={3} className="!text-white !mb-2">
						Exam Complete!
					</Typography.Title>
					<Typography.Text className="text-white/80">Your final score</Typography.Text>
					<motion.div
						initial={{ scale: 0.5, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{ delay: 0.2, type: 'spring' }}
					>
						<Typography.Title level={1} className="!text-white !text-6xl !my-4 font-bold">
							{resultAttempt != null ? `${Math.round(resultAttempt.scorePercent ?? 0)}%` : '—'}
						</Typography.Title>
					</motion.div>
					{(resultAttempt?.scorePercent ?? 0) >= 70 ? (
						<Tag className="bg-white/20 text-white border-0 text-base px-4 py-1 rounded-full">
							🎉 Congratulations! You Passed!
						</Tag>
					) : (resultAttempt?.scorePercent ?? 0) > 0 ? (
						<Tag className="bg-white/20 text-white border-0 text-base px-4 py-1 rounded-full">
							📚 Keep Practicing!
						</Tag>
					) : null}
				</div>
				<div className="p-6 bg-white">
					<Space direction="vertical" size={12} className="w-full">
						<Button
							type="primary"
							size="large"
							block
							onClick={openAnswersDrawer}
							className="h-12 rounded-xl font-semibold"
							style={{ background: '#102540' }}
						>
							View Correct Answers
						</Button>
						<Button
							size="large"
							block
							onClick={() => { closeResultModal(); navigate(window.location.pathname.startsWith('/student/') ? '/student' : -1); }}
							className="h-12 rounded-xl font-semibold"
						>
							Back to Dashboard
						</Button>
					</Space>
				</div>
			</Modal>

			{/* Answers Drawer */}
			<Drawer
				title={
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
							<CheckCircleOutlined className="text-white text-lg" />
						</div>
						<div>
							<Typography.Text className="text-slate-500 text-xs block">Review</Typography.Text>
							<Typography.Text className="font-semibold text-lg">Correct Answers</Typography.Text>
						</div>
					</div>
				}
				placement="right"
				width={Math.min(520, typeof window !== 'undefined' ? window.innerWidth * 0.92 : 520)}
				open={answersDrawerOpen}
				onClose={closeAnswersDrawer}
				destroyOnClose
				styles={{ body: { padding: '16px', background: '#f8fafc' } }}
			>
				{!answersDrawerAttempt ? (
					<Typography.Text type="secondary">No data.</Typography.Text>
				) : (
					<Space direction="vertical" size={16} className="w-full">
						{(() => {
							const ansList = answersDrawerAttempt.answers || [];
							const total = ansList.length || 1;
							const correctCount = ansList.filter(x => x.isCorrect === true).length;
							const pct = Math.round(answersDrawerAttempt.scorePercent ?? (correctCount / total) * 100);
							const isPassed = pct >= 70;
							return (
								<div
									className="rounded-2xl p-6 text-center"
									style={{
										background: isPassed
											? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
											: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'
									}}
								>
									<Typography.Text className="text-white/70 text-xs uppercase tracking-wider block mb-2">
										Final Score
									</Typography.Text>
									<Typography.Title level={1} className="!text-white !m-0 !text-5xl font-bold">
										{pct}%
									</Typography.Title>
									<div className="mt-3 flex items-center justify-center gap-3">
										<Tag className="bg-white/20 text-white border-0 rounded-full">
											{isPassed ? '✓ Passed' : '✗ Below 70%'}
										</Tag>
										<Tag className="bg-white/20 text-white border-0 rounded-full">
											{correctCount}/{total} Correct
										</Tag>
									</div>
								</div>
							);
						})()}

						<Typography.Text className="text-slate-500 block text-center">
							Review each question with the correct answer highlighted
						</Typography.Text>

						{(answersDrawerAttempt.answers || []).length === 0 ? (
							<Typography.Text type="secondary" className="text-center block">No answers to review.</Typography.Text>
						) : (
							(answersDrawerAttempt.answers || []).map((a, idx) => {
								const correct = a.isCorrect === true;
								const correctOpt = (a?.question?.options || []).find(o => o.isCorrect);
								const correctText = correctOpt?.text ?? '—';
								const yourText = a?.selectedOption?.text ?? '—';
								return (
									<Card
										key={a.id || idx}
										className="border-0 shadow-sm overflow-hidden"
										style={{ borderRadius: 16 }}
										styles={{ body: { padding: 0 } }}
									>
										<div
											className="px-4 py-3 flex items-center gap-3"
											style={{
												background: correct
													? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
													: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'
											}}
										>
											{correct ? (
												<CheckCircleOutlined className="text-white text-lg" />
											) : (
												<CloseCircleOutlined className="text-white text-lg" />
											)}
											<Typography.Text className="text-white font-semibold">
												Question {idx + 1}
											</Typography.Text>
											<Tag className="bg-white/20 text-white border-0 rounded-full ml-auto text-xs">
												{correct ? 'Correct' : 'Incorrect'}
											</Tag>
										</div>
										<div className="p-4">
											<Typography.Paragraph className="text-slate-700 font-medium !mb-4">
												{a?.question?.stem}
											</Typography.Paragraph>
											<div className="space-y-2">
												<div className={`p-3 rounded-xl ${correct ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
													<Typography.Text className="text-slate-500 text-xs block mb-1">Your Answer</Typography.Text>
													<Typography.Text className={correct ? 'text-emerald-700' : 'text-red-700'}>
														{yourText}
													</Typography.Text>
												</div>
												{!correct && (
													<div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
														<Typography.Text className="text-slate-500 text-xs block mb-1">Correct Answer</Typography.Text>
														<Typography.Text className="text-emerald-700 font-medium">
															{correctText}
														</Typography.Text>
													</div>
												)}
											</div>
										</div>
									</Card>
								);
							})
						)}
					</Space>
				)}
			</Drawer>
		</div>
	);
}
