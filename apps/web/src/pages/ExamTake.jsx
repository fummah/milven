import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatFormulaHtml } from '../lib/formatFormula';
import { Card, Button, Typography, Space, message, Switch, InputNumber, Radio, Modal, Drawer, Tag, Divider, Progress, Tooltip, Alert, Collapse } from 'antd';
import { RichTextEditor } from '../components/RichTextEditor.jsx';
import { AIHelpPanel } from '../components/AIHelpPanel.jsx';
import { ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, TrophyOutlined, SendOutlined, CalculatorOutlined, BookOutlined, FireOutlined, ThunderboltOutlined, BulbOutlined, FileTextOutlined, PlusOutlined, StarOutlined, ExclamationCircleOutlined, RocketOutlined, SafetyOutlined, EyeOutlined, EyeInvisibleOutlined, LockOutlined, ExperimentOutlined, SnippetsOutlined, InfoCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { ModuleNotesDrawer } from '../components/ModuleNotesDrawer.jsx';

// Strip leading question numbers like "Question 2:", "Q2.", "Question 12 -", "Q.2:", etc.
function stripQuestionNumber(text) {
	if (!text) return text;
	return text.replace(/^(<[^>]*>)*\s*(Question|Q)\.?\s*\d+\s*[:.\-–—]\s*/i, '$1');
}

// Smart Review Panel Component - Shows after answering in Practice Mode
function SmartReviewPanel({ answer, question, visible, onAddToRevision, onAddToWeakTopic, onOpenNotes, mode }) {
	if (!visible || mode === 'exam' || !answer?.selectedOptionId) return null;

	const isCorrect = answer.isCorrect;
	const correctOption = question?.options?.find(o => o.isCorrect);
	const selectedOption = question?.options?.find(o => o.id === answer.selectedOptionId);
	const difficultyColors = { EASY: '#22c55e', MEDIUM: '#f59e0b', HARD: '#ef4444' };

	return (
		<motion.div
			initial={{ opacity: 0, height: 0 }}
			animate={{ opacity: 1, height: 'auto' }}
			exit={{ opacity: 0, height: 0 }}
			className="mt-4 overflow-hidden"
		>
			<div
				className="rounded-2xl overflow-hidden"
				style={{
					background: isCorrect 
						? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' 
						: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)',
					border: isCorrect ? '1px solid #86efac' : '1px solid #fca5a5'
				}}
			>
				{/* Review Header */}
				<div 
					className="px-5 py-4 flex items-center justify-between"
					style={{
						background: isCorrect 
							? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
							: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'
					}}
				>
					<div className="flex items-center gap-3">
						{isCorrect ? (
							<CheckCircleOutlined className="text-white text-xl" />
						) : (
							<CloseCircleOutlined className="text-white text-xl" />
						)}
						<Typography.Text className="text-white font-semibold text-lg">
							{isCorrect ? 'Correct!' : 'Incorrect'}
						</Typography.Text>
					</div>
					<div className="flex items-center gap-2">
						{question?.difficulty && (
							<Tag 
								className="border-0 rounded-full"
								style={{ 
									background: 'rgba(255,255,255,0.2)', 
									color: 'white'
								}}
							>
								{question.difficulty}
							</Tag>
						)}
					</div>
				</div>

				{/* Answer Comparison */}
				<div className="p-5 space-y-4">
					{!isCorrect && (
						<>
							<div className="p-4 rounded-xl bg-white border border-red-200">
								<Typography.Text className="text-red-500 text-xs font-semibold uppercase tracking-wide block mb-2">
									Your Answer
								</Typography.Text>
								<Typography.Text className="text-red-700">
									{selectedOption?.text || 'No answer selected'}
								</Typography.Text>
							</div>
							<div className="p-4 rounded-xl bg-white border border-emerald-200">
								<Typography.Text className="text-emerald-600 text-xs font-semibold uppercase tracking-wide block mb-2">
									Correct Answer
								</Typography.Text>
								<Typography.Text className="text-emerald-700 font-medium">
									{correctOption?.text || 'N/A'}
								</Typography.Text>
							</div>
						</>
					)}

					{/* Explanation */}
					{question?.workedSolution && (
						<Collapse
							ghost
							items={[{
								key: 'explanation',
								label: (
									<span className="flex items-center gap-2 font-semibold text-slate-700">
										<BulbOutlined className="text-amber-500" /> Explanation
									</span>
								),
								children: (
									<div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
										<div className="!mb-0 text-slate-700 whitespace-pre-wrap formula-content" dangerouslySetInnerHTML={{ __html: formatFormulaHtml(question.workedSolution) }} />
									</div>
								)
							}]}
						/>
					)}

					{/* LOS Reference & Concept */}
					{(question?.los || question?.traceSection) && (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
							{question?.los && (
								<div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
									<Typography.Text className="text-blue-600 text-xs font-semibold uppercase tracking-wide block mb-1">
										<FileTextOutlined className="mr-1" /> LOS Reference
									</Typography.Text>
									<Typography.Text className="text-slate-700 text-sm">
										{question.los}
									</Typography.Text>
								</div>
							)}
							{question?.traceSection && (
								<div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
									<Typography.Text className="text-purple-600 text-xs font-semibold uppercase tracking-wide block mb-1">
										<BookOutlined className="mr-1" /> Section
									</Typography.Text>
									<Typography.Text className="text-slate-700 text-sm">
										{question.traceSection}
										{question?.tracePage && ` (p. ${question.tracePage})`}
									</Typography.Text>
								</div>
							)}
						</div>
					)}

					{/* Key Formulas */}
					{question?.keyFormulas && (
						<div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200">
							<Typography.Text className="text-indigo-600 text-xs font-semibold uppercase tracking-wide block mb-2">
								<ExperimentOutlined className="mr-1" /> Key Formulas
							</Typography.Text>
							<div className="text-slate-700 font-mono text-sm whitespace-pre-wrap formula-content" dangerouslySetInnerHTML={{ __html: formatFormulaHtml(question.keyFormulas) }} />
						</div>
					)}

					{/* LOS Reference for incorrect answers */}
					{!isCorrect && question?.los && (
						<div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
							<div className="flex items-center gap-2 mb-1">
								<FileTextOutlined className="text-blue-600" />
								<Typography.Text className="text-blue-800 text-xs font-semibold uppercase tracking-wide">Learning Outcome Statement (LOS)</Typography.Text>
							</div>
							<Typography.Text className="text-slate-700 text-sm">{question.los}</Typography.Text>
						</div>
					)}

					{/* Topic Info */}
					{question?.topic?.name && (
						<div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
							<Typography.Text className="text-slate-500 text-xs font-semibold uppercase tracking-wide block mb-1">
								Topic
							</Typography.Text>
							<Typography.Text className="text-slate-700">
								{question.topic.name}
							</Typography.Text>
						</div>
					)}

					{/* Action Buttons */}
					{!isCorrect && (
						<div className="flex flex-wrap gap-2 pt-2">
							<Button
								icon={<PlusOutlined />}
								onClick={() => onAddToRevision(question.id)}
								className="rounded-xl"
								style={{ background: '#f0f9ff', borderColor: '#bae6fd', color: '#0284c7' }}
							>
								Add to Revision List
							</Button>
							{question?.topic?.id && (
								<Button
									icon={<StarOutlined />}
									onClick={() => onAddToWeakTopic(question.topic.id)}
									className="rounded-xl"
									style={{ background: '#fef3c7', borderColor: '#fcd34d', color: '#b45309' }}
								>
									Mark as Weak Topic
								</Button>
							)}
							{question?.topic?.id && onOpenNotes && (
								<Button
									icon={<SnippetsOutlined />}
									onClick={() => onOpenNotes(question.topic.id, question.topic.name)}
									className="rounded-xl"
									style={{ background: '#f0f4f8', borderColor: '#cbd5e1', color: '#102540' }}
								>
									View Module Notes
								</Button>
							)}
							<div className="w-full">
								<AIHelpPanel
									questionId={question?.id}
									selectedOptionId={answer?.selectedOptionId}
									selectedOptionText={selectedOption?.text}
									mode="practice_failed"
								/>
							</div>
						</div>
					)}
				</div>
			</div>
		</motion.div>
	);
}

// Mode Selection Modal
function ModeSelectionModal({ visible, onSelect, examName }) {
	return (
		<Modal
			open={visible}
			footer={null}
			closable={false}
			centered
			width={520}
			styles={{ body: { padding: 0 } }}
		>
			<div className="p-6">
				<div className="text-center mb-6">
					<div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
						<RocketOutlined className="text-white text-3xl" />
					</div>
					<Typography.Title level={3} className="!mb-2">Choose Your Mode</Typography.Title>
					<Typography.Text className="text-slate-500">
						{examName || 'Exam'}
					</Typography.Text>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{/* Practice Mode */}
					<motion.div
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
						onClick={() => onSelect('practice')}
						className="cursor-pointer"
					>
						<Card
							className="border-2 border-emerald-200 hover:border-emerald-400 transition-all h-full"
							style={{ borderRadius: 16 }}
							styles={{ body: { padding: 20 } }}
						>
							<div className="text-center">
								<div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
									<EyeOutlined className="text-white text-xl" />
								</div>
								<Typography.Title level={5} className="!mb-2">Practice Mode</Typography.Title>
								<Typography.Text className="text-slate-500 text-sm block mb-4">
									Learn as you go
								</Typography.Text>
								<div className="space-y-2 text-left">
									<div className="flex items-center gap-2 text-sm text-slate-600">
										<CheckCircleOutlined className="text-emerald-500" />
										<span>Instant explanations</span>
									</div>
									<div className="flex items-center gap-2 text-sm text-slate-600">
										<CheckCircleOutlined className="text-emerald-500" />
										<span>See correct answers</span>
									</div>
									<div className="flex items-center gap-2 text-sm text-slate-600">
										<CheckCircleOutlined className="text-emerald-500" />
										<span>LOS references</span>
									</div>
									<div className="flex items-center gap-2 text-sm text-slate-600">
										<CheckCircleOutlined className="text-emerald-500" />
										<span>Flexible navigation</span>
									</div>
								</div>
							</div>
						</Card>
					</motion.div>

					{/* Exam Mode */}
					<motion.div
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
						onClick={() => onSelect('exam')}
						className="cursor-pointer"
					>
						<Card
							className="border-2 border-blue-200 hover:border-blue-400 transition-all h-full"
							style={{ borderRadius: 16 }}
							styles={{ body: { padding: 20 } }}
						>
							<div className="text-center">
								<div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
									<SafetyOutlined className="text-white text-xl" />
								</div>
								<Typography.Title level={5} className="!mb-2">Exam Mode</Typography.Title>
								<Typography.Text className="text-slate-500 text-sm block mb-4">
									Real CFA® experience
								</Typography.Text>
								<div className="space-y-2 text-left">
									<div className="flex items-center gap-2 text-sm text-slate-600">
										<LockOutlined className="text-blue-500" />
										<span>No explanations</span>
									</div>
									<div className="flex items-center gap-2 text-sm text-slate-600">
										<ClockCircleOutlined className="text-blue-500" />
										<span>Strict timer</span>
									</div>
									<div className="flex items-center gap-2 text-sm text-slate-600">
										<EyeInvisibleOutlined className="text-blue-500" />
										<span>Answers hidden</span>
									</div>
									<div className="flex items-center gap-2 text-sm text-slate-600">
										<SafetyOutlined className="text-blue-500" />
										<span>Exam conditions</span>
									</div>
								</div>
							</div>
						</Card>
					</motion.div>
				</div>
			</div>
		</Modal>
	);
}

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
	const [searchParams] = useSearchParams();
	const [attempt, setAttempt] = useState(null);
	const [currentPage, setCurrentPage] = useState(0);
	const [showCalc, setShowCalc] = useState(false);
	const questionRefs = useRef([]);
	const [now, setNow] = useState(() => Date.now());
	const [resultModalOpen, setResultModalOpen] = useState(false);
	const [resultAttempt, setResultAttempt] = useState(null);
	const [answersDrawerOpen, setAnswersDrawerOpen] = useState(false);
	const [answersDrawerAttempt, setAnswersDrawerAttempt] = useState(null);
	
	// Mode & Smart Review state
	const [mode, setMode] = useState(searchParams.get('mode') || null); // 'practice' | 'exam' | null
	const [showModeSelection, setShowModeSelection] = useState(false);
	const [reviewedQuestions, setReviewedQuestions] = useState(new Set()); // Track which questions have been reviewed
	const [revisionList, setRevisionList] = useState(new Set()); // Questions added to revision
	const [weakTopics, setWeakTopics] = useState(new Set()); // Topics marked as weak
	const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
	const [notesDrawerTopicId, setNotesDrawerTopicId] = useState(null);
	const [notesDrawerTopicName, setNotesDrawerTopicName] = useState(null);
	const openNotesDrawer = (topicId, topicName) => { setNotesDrawerTopicId(topicId); setNotesDrawerTopicName(topicName); setNotesDrawerOpen(true); };
	const [constructedDrafts, setConstructedDrafts] = useState({}); // questionId -> text for constructed response while typing

	// Mock exam instructions state
	const mockExamId = searchParams.get('mockExamId');
	const mockSession = searchParams.get('session');
	const isMockExam = !!mockExamId;
	const [showInstructions, setShowInstructions] = useState(false);
	const [instructionsData, setInstructionsData] = useState(null);
	const [mockExamData, setMockExamData] = useState(null);

	// Session 2 prompt state (shown after S1 submission for multi-session mocks)
	const [showSession2Prompt, setShowSession2Prompt] = useState(false);
	const [breakExpiresAt, setBreakExpiresAt] = useState(null);
	const [breakNow, setBreakNow] = useState(() => Date.now());

	// Break countdown timer
	useEffect(() => {
		if (!showSession2Prompt || !breakExpiresAt) return;
		const t = setInterval(() => setBreakNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, [showSession2Prompt, breakExpiresAt]);

	// Auto-complete mock if break expires
	const breakExpiredRef = useRef(false);
	useEffect(() => {
		if (!showSession2Prompt || !breakExpiresAt || breakExpiredRef.current) return;
		const remaining = breakExpiresAt - breakNow;
		if (remaining > 0) return;
		breakExpiredRef.current = true;
		(async () => {
			try {
				await api.post(`/api/exams/mock/${mockExamId}/complete-session`, { session: 2, score: 0 });
			} catch { /* silent */ }
			setShowSession2Prompt(false);
			message.warning('Break time expired. Session 2 scored as 0%.');
			navigate(window.location.pathname.startsWith('/student/') ? '/student/mock-exams' : -1);
		})();
	}, [showSession2Prompt, breakExpiresAt, breakNow, mockExamId, navigate]);

	useEffect(() => {
		let mounted = true;
		(async () => {
			try {
				const res = await api.get(`/api/exams/attempts/${attemptId}`);
				if (mounted) {
					setAttempt(res.data.attempt);
					// Show mode selection if not already set and exam is in progress
					if (!mode && res.data.attempt.status === 'IN_PROGRESS') {
						setShowModeSelection(true);
					}
					// Show instructions for mock exams
					if (isMockExam && res.data.attempt.status === 'IN_PROGRESS') {
						setShowInstructions(true);
					}
				}
			} catch {
				message.error('Unable to load attempt');
			}
		})();
		return () => {
			mounted = false;
		};
	}, [attemptId]);

	// Fetch mock exam details and weight breakdown for instructions
	useEffect(() => {
		if (!isMockExam || !mockExamId) return;
		(async () => {
			try {
				const { data } = await api.get(`/api/exams/mock/${mockExamId}`);
				setMockExamData(data.mockExam);
				if (data.mockExam?.courseId) {
					const bd = await api.get(`/api/exams/mock/weight-breakdown/${data.mockExam.courseId}`);
					setInstructionsData(bd.data);
				}
			} catch { /* silent */ }
		})();
	}, [isMockExam, mockExamId]);

	// Handle mode selection
	const handleModeSelect = (selectedMode) => {
		setMode(selectedMode);
		setShowModeSelection(false);
		message.success(`${selectedMode === 'practice' ? 'Practice' : 'Exam'} mode activated`);
	};

	// Add to revision list
	const handleAddToRevision = async (questionId) => {
		if (revisionList.has(questionId)) {
			message.info('Already in revision list');
			return;
		}
		try {
			await api.post('/api/exams/revision', { questionId, priority: 2 });
			setRevisionList(prev => new Set([...prev, questionId]));
			message.success('Added to revision list');
		} catch {
			message.error('Failed to add to revision list');
		}
	};

	// Add to weak topics
	const handleAddToWeakTopic = async (topicId) => {
		if (weakTopics.has(topicId)) {
			message.info('Already marked as weak topic');
			return;
		}
		try {
			await api.post('/api/exams/weak-topics', { topicId });
			setWeakTopics(prev => new Set([...prev, topicId]));
			message.success('Marked as weak topic');
		} catch {
			message.error('Failed to mark as weak topic');
		}
	};

	// Auto-add wrong answers to mistake bank
	const addToMistakeBank = async (questionId, wrongOptionId, correctOptionId) => {
		try {
			await api.post('/api/exams/mistakes', {
				questionId,
				attemptId,
				wrongOptionId,
				correctOptionId
			});
		} catch {
			// Silent fail - don't interrupt user flow
		}
	};

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
		(async () => {
			try {
				await api.post(`/api/exams/attempts/${attemptId}/submit`);
				const res = await api.get(`/api/exams/attempts/${attemptId}`);
				setAttempt(res.data.attempt);

				// Handle mock exam session completion
				const mId = searchParams.get('mockExamId');
				const mSession = searchParams.get('session');
				if (mId && mSession) {
					try {
						const score = res.data.attempt?.scorePercent ?? null;
						const completeRes = await api.post(`/api/exams/mock/${mId}/complete-session`, {
							session: parseInt(mSession, 10), score
						});
						const updatedMock = completeRes.data?.mockExam;
						if (parseInt(mSession, 10) === 1 && updatedMock?.status === 'BREAK' && updatedMock?.session2ExamId) {
							const breakMins = updatedMock.breakMinutes || 30;
							setBreakExpiresAt(Date.now() + breakMins * 60 * 1000);
							setShowSession2Prompt(true);
							return;
						}
					} catch { /* silent */ }
				}

				setResultAttempt(res.data.attempt);
				setResultModalOpen(true);
			} catch {
				submitRef.current = false;
			}
		})();
	}, [remainingSec, attempt?.status, attemptId]);

	const courseName = attempt?.courseName || attempt?.exam?.name || 'Exam';
	const timeUp = remainingSec !== null && remainingSec <= 0;
	const isSubmitted = attempt?.status === 'SUBMITTED';
	const hasConstructedPending = (attempt?.answers || []).some(
		(a) => a?.question?.type === 'CONSTRUCTED_RESPONSE' && a.marksAwarded == null
	);

	// Keep all hooks before any early return (answers may be empty when attempt is null)
	const answers = attempt?.answers ?? [];
	const questions = useMemo(() => answers.map(a => a.question).filter(Boolean), [answers]);
	const hasQuestions = questions.length > 0;
	const totalQuestions = questions.length;

	const buildGroups = useCallback((ans) => {
		const out = [];
		let i = 0;
		let vignetteGroupNumber = 0;
		while (i < ans.length) {
			const a = ans[i];
			const pid = a?.question?.parentId;
			if (pid && a?.question?.parent) {
				vignetteGroupNumber += 1;
				const group = {
					type: 'vignette',
					vignetteText: a.question.parent.vignetteText || '',
					answers: [],
					vignetteGroupNumber
				};
				while (i < ans.length && ans[i]?.question?.parentId === pid) {
					group.answers.push(ans[i]);
					i++;
				}
				out.push(group);
			} else {
				out.push({ type: 'single', vignetteText: null, answers: [ans[i]] });
				i++;
			}
		}
		return out;
	}, []);

	const groups = useMemo(() => buildGroups(answers), [buildGroups, answers]);

	// Paginate by groups (never split a vignette group)
	// IMPORTANT: Each vignette/case-study bundle must occupy its OWN page.
	// This matches CFA-style layout and prevents mixing vignette bundles with unrelated questions.
	const { pageGroups, totalPages, pageStart: pageStartAnswerIndex, allPages } = useMemo(() => {
		let count = 0;
		const pages = [];
		let current = [];
		const flush = () => {
			if (current.length > 0) pages.push(current);
			current = [];
			count = 0;
		};

		for (const g of groups) {
			const n = g.answers.length;
			if (g.type === 'vignette') {
				// Vignette bundles always on their own page
				flush();
				pages.push([g]);
				continue;
			}
			// Singles packed by QUESTIONS_PER_PAGE
			if (count + n > QUESTIONS_PER_PAGE && current.length > 0) {
				flush();
			}
			current.push(g);
			count += n;
		}
		flush();

		const total = Math.max(1, pages.length);
		let start = 0;
		for (let p = 0; p < currentPage && p < pages.length; p++) {
			start += pages[p].reduce((s, gr) => s + gr.answers.length, 0);
		}
		return {
			pageGroups: pages[currentPage] || [],
			totalPages: total,
			pageStart: start,
			allPages: pages
		};
	}, [groups, currentPage]);

	const toRoman = (n) => {
		const romans = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
		return romans[n - 1] || String(n);
	};

	const flatPageItems = useMemo(() => {
		const items = [];
		let idx = pageStartAnswerIndex;
		for (const group of pageGroups) {
			const isVignetteGroup = group.type === 'vignette';
			for (let subIdx = 0; subIdx < group.answers.length; subIdx++) {
				const ans = group.answers[subIdx];
				items.push({
					ans,
					q: ans?.question,
					globalIdx: idx,
					subIdx,
					groupType: group.type,
					vignetteGroupNumber: isVignetteGroup ? group.vignetteGroupNumber : null,
					showVignette: isVignetteGroup && subIdx === 0,
					vignetteText: group.vignetteText
				});
				idx++;
			}
		}
		return items;
	}, [pageGroups, pageStartAnswerIndex]);

	const pageStart = pageStartAnswerIndex;
	const pageEnd = pageStartAnswerIndex + flatPageItems.length;

	// Build navigation items: each group (vignette = 1 item, single = 1 item) gets one pill
	// Also map each group to its page index
	const navItems = useMemo(() => {
		// Build group-to-page mapping from allPages
		const groupPageMap = new Map(); // group ref -> page index
		for (let pIdx = 0; pIdx < allPages.length; pIdx++) {
			for (const g of allPages[pIdx]) {
				groupPageMap.set(g, pIdx);
			}
		}

		const items = [];
		let ansIdx = 0;
		for (const g of groups) {
			const groupAnswers = g.answers;
			const isAnswered = groupAnswers.every(a => {
				const q = a?.question;
				if (q?.type === 'CONSTRUCTED_RESPONSE') return a?.textAnswer != null && String(a.textAnswer).trim() !== '';
				return !!a?.selectedOptionId;
			});
			items.push({
				type: g.type,
				label: items.length + 1,
				answerStartIdx: ansIdx,
				answerCount: groupAnswers.length,
				isAnswered,
				vignetteGroupNumber: g.vignetteGroupNumber,
				pageIdx: groupPageMap.get(g) ?? 0
			});
			ansIdx += groupAnswers.length;
		}
		return items;
	}, [groups, allPages]);

	// Total display items (vignettes count as 1, singles count as 1)
	const displayTotalItems = navItems.length;

	// Answered count based on nav items (each vignette/single = 1 if all sub-Qs answered)
	const answeredNavCount = useMemo(() => navItems.filter(n => n.isAnswered).length, [navItems]);

	// Scroll to top when page changes
	useEffect(() => {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}, [currentPage]);

	const scorePct = Math.round(attempt?.scorePercent ?? 0);
	const passed = scorePct >= 70;
	const answeredCount = useMemo(() => answers.filter(a => {
		const q = questions.find(qq => qq?.id === a.questionId);
		if (q?.type === 'CONSTRUCTED_RESPONSE') return a.textAnswer != null && String(a.textAnswer).trim() !== '';
		return !!a.selectedOptionId;
	}).length, [answers, questions]);

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

	// Mock exam instructions screen
	if (showInstructions && isMockExam) {
		const mock = mockExamData;
		const course = mock?.course;
		const level = course?.level || 'LEVEL1';
		const isVignetteExam = level === 'LEVEL2' || level === 'LEVEL3';
		const countItemSets = (eqs) => {
			if (!eqs) return 0;
			const parentIds = new Set();
			const standaloneIds = [];
			for (const eq of eqs) {
				const pid = eq.question?.parentId;
				if (pid) {
					parentIds.add(pid);
				} else {
					standaloneIds.push(eq.questionId);
				}
			}
			// Exclude standalone questions that are parents of children in the same set
			const trueStandalone = standaloneIds.filter(id => !parentIds.has(id)).length;
			return parentIds.size + trueStandalone;
		};
		const s1Count = isVignetteExam
			? (countItemSets(mock?.session1Exam?.examQuestions) || totalQuestions)
			: (mock?.session1Exam?.examQuestions?.length || totalQuestions);
		const s2Count = isVignetteExam
			? countItemSets(mock?.session2Exam?.examQuestions)
			: (mock?.session2Exam?.examQuestions?.length || 0);
		const bd = instructionsData;
		const breakdown = bd?.breakdown || [];
		const examConditions = course?.examConditions || bd?.course?.examConditions;
		const session1Breakdown = breakdown.filter(b => b.session === 1);
		const session2Breakdown = breakdown.filter(b => b.session === 2);
		const currentSessionNum = parseInt(mockSession, 10) || 1;

		return (
			<div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40">
				<div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
					<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
						{/* Header */}
						<div className="text-center">
							<div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
								<FileTextOutlined className="text-white text-2xl" />
							</div>
							<Typography.Title level={2} className="!mb-1">Exam Instructions</Typography.Title>
							<Typography.Text className="text-slate-500 text-base">
								{courseName} {(level === 'LEVEL1' || level === 'LEVEL2') && s2Count > 0 ? `— Session ${currentSessionNum}` : ''}
							</Typography.Text>
						</div>

						{/* Exam Conditions */}
						{examConditions && (
							<Card size="small" style={{ borderRadius: 16, background: '#fffbeb', borderColor: '#fde68a' }}>
								<div className="flex items-start gap-3">
									<InfoCircleOutlined className="text-amber-500 mt-0.5 text-lg" />
									<div>
										<Typography.Text strong className="text-amber-800 block mb-1">Exam Conditions</Typography.Text>
										<Typography.Text className="text-slate-700 whitespace-pre-line">{examConditions}</Typography.Text>
									</div>
								</div>
							</Card>
						)}

						{/* Level-specific format */}
						{level === 'LEVEL1' && (
							<Card size="small" style={{ borderRadius: 16, background: '#eff6ff', borderColor: '#bfdbfe' }}>
								<div className="flex items-start gap-3">
									<BookOutlined className="text-blue-500 mt-0.5 text-lg" />
									<div>
										<Typography.Text strong className="text-blue-800 block mb-1">CFA Level I Exam Format</Typography.Text>
										<Typography.Text className="text-slate-700">
											The CFA Level I exam consists of {s1Count + s2Count} multiple-choice questions, divided into two sessions of {mock?.session1Minutes || 135} minutes each.
											Session 1 contains {s1Count} questions and Session 2 contains {s2Count} questions.
											Candidates are advised to spend approximately 90 seconds per question. Maximum break time between sessions is {mock?.breakMinutes || 30} minutes.
										</Typography.Text>
									</div>
								</div>
							</Card>
						)}
						{level === 'LEVEL2' && (
							<Card size="small" style={{ borderRadius: 16, background: '#f5f3ff', borderColor: '#c4b5fd' }}>
								<div className="flex items-start gap-3">
									<BookOutlined className="text-purple-500 mt-0.5 text-lg" />
									<div>
										<Typography.Text strong className="text-purple-800 block mb-1">Exam Conditions</Typography.Text>
										<Typography.Text className="text-slate-700">
											The CFA Level II exam is standardized with 11 item sets for each session, for a total of 22 on the exam. Each Vignette is followed by 4 questions.
										</Typography.Text>
									</div>
								</div>
							</Card>
						)}
						{level === 'LEVEL3' && (
							<Card size="small" style={{ borderRadius: 16, background: '#fefce8', borderColor: '#fde047' }}>
								<div className="flex items-start gap-3">
									<BookOutlined className="text-yellow-600 mt-0.5 text-lg" />
									<div>
										<Typography.Text strong className="text-yellow-800 block mb-1">CFA Level III Exam Format</Typography.Text>
										<Typography.Text className="text-slate-700">
											The Level III exam consists of item sets and constructed response (essay) sets. Both question types combine vignettes with accompanying multiple-choice items for item sets and constructed response items for essay sets.
											All questions must be answered in English based on the information in the vignette.
											Each session will have either 6 item sets and 5 essay sets or 5 item sets and 6 essay sets.
											Overall, the Level III exam contains 11 item sets and 11 essay sets for 12 points each.
											The CFA Program curriculum topic areas for Level III will be randomly placed on the exam.
										</Typography.Text>
									</div>
								</div>
							</Card>
						)}

						{/* Current Session Info */}
						{level === 'LEVEL1' && s2Count > 0 && (
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<Card size="small" style={{ borderRadius: 16, borderColor: currentSessionNum === 1 ? '#3b82f6' : '#e2e8f0', borderWidth: currentSessionNum === 1 ? 2 : 1, background: currentSessionNum === 1 ? '#f0f7ff' : '#fafafa' }}>
									<Typography.Text strong className={currentSessionNum === 1 ? 'text-blue-700 block mb-2' : 'text-slate-500 block mb-2'}>
										Session 1 {currentSessionNum === 1 ? '(Current)' : ''}
									</Typography.Text>
									<ul className="text-sm text-slate-700 space-y-1 list-disc pl-4 mb-0">
										<li>{s1Count} multiple-choice questions</li>
										<li>{mock?.session1Minutes || 135} minutes time limit</li>
										<li>~90 seconds per question</li>
									</ul>
								</Card>
								<Card size="small" style={{ borderRadius: 16, borderColor: currentSessionNum === 2 ? '#8b5cf6' : '#e2e8f0', borderWidth: currentSessionNum === 2 ? 2 : 1, background: currentSessionNum === 2 ? '#f5f3ff' : '#fafafa' }}>
									<Typography.Text strong className={currentSessionNum === 2 ? 'text-purple-700 block mb-2' : 'text-slate-500 block mb-2'}>
										Session 2 {currentSessionNum === 2 ? '(Current)' : ''}
									</Typography.Text>
									<ul className="text-sm text-slate-700 space-y-1 list-disc pl-4 mb-0">
										<li>{s2Count} multiple-choice questions</li>
										<li>{mock?.session2Minutes || 135} minutes time limit</li>
										<li>~90 seconds per question</li>
									</ul>
								</Card>
							</div>
						)}

						{/* L2 Current Session Info */}
						{level === 'LEVEL2' && s2Count > 0 && (
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<Card size="small" style={{ borderRadius: 16, borderColor: currentSessionNum === 1 ? '#8b5cf6' : '#e2e8f0', borderWidth: currentSessionNum === 1 ? 2 : 1, background: currentSessionNum === 1 ? '#f5f3ff' : '#fafafa' }}>
									<Typography.Text strong className={currentSessionNum === 1 ? 'text-purple-700 block mb-2' : 'text-slate-500 block mb-2'}>
										Session 1 {currentSessionNum === 1 ? '(Current)' : ''}
									</Typography.Text>
									<ul className="text-sm text-slate-700 space-y-1 list-disc pl-4 mb-0">
										<li>{s1Count} item sets (vignettes)</li>
										<li>4 questions per item set</li>
										<li>{mock?.session1Minutes || 132} minutes time limit</li>
									</ul>
								</Card>
								<Card size="small" style={{ borderRadius: 16, borderColor: currentSessionNum === 2 ? '#8b5cf6' : '#e2e8f0', borderWidth: currentSessionNum === 2 ? 2 : 1, background: currentSessionNum === 2 ? '#f5f3ff' : '#fafafa' }}>
									<Typography.Text strong className={currentSessionNum === 2 ? 'text-purple-700 block mb-2' : 'text-slate-500 block mb-2'}>
										Session 2 {currentSessionNum === 2 ? '(Current)' : ''}
									</Typography.Text>
									<ul className="text-sm text-slate-700 space-y-1 list-disc pl-4 mb-0">
										<li>{s2Count} item sets (vignettes)</li>
										<li>4 questions per item set</li>
										<li>{mock?.session2Minutes || 132} minutes time limit</li>
									</ul>
								</Card>
							</div>
						)}

						{/* Question Distribution by Volume */}
						{breakdown.length > 0 && (
							<Card style={{ borderRadius: 16 }}>
								<Typography.Text strong className="text-slate-800 block mb-3">Question Distribution by Volume</Typography.Text>
								{level === 'LEVEL1' && session1Breakdown.length > 0 && session2Breakdown.length > 0 ? (
									<div className="space-y-4">
										{currentSessionNum === 1 || !currentSessionNum ? (
											<div>
												<Typography.Text className="text-blue-700 text-sm font-semibold block mb-2">Session 1</Typography.Text>
												<table className="w-full text-sm">
													<thead><tr className="border-b border-slate-200"><th className="text-left py-2 text-slate-500 font-medium">Volume</th><th className="text-left py-2 text-slate-500 font-medium w-28">Weight</th><th className="text-left py-2 text-slate-500 font-medium w-28">Est. Questions</th></tr></thead>
													<tbody>
														{session1Breakdown.map(r => (
															<tr key={r.volumeId} className="border-b border-slate-100">
																<td className="py-2 text-slate-700">{r.volumeName}</td>
																<td className="py-2 text-slate-600">{r.weightMin}%–{r.weightMax}%</td>
																<td className="py-2"><Tag color="blue">{r.estimatedQuestions}</Tag></td>
															</tr>
														))}
													</tbody>
												</table>
											</div>
										) : null}
										{currentSessionNum === 2 ? (
											<div>
												<Typography.Text className="text-purple-700 text-sm font-semibold block mb-2">Session 2</Typography.Text>
												<table className="w-full text-sm">
													<thead><tr className="border-b border-slate-200"><th className="text-left py-2 text-slate-500 font-medium">Volume</th><th className="text-left py-2 text-slate-500 font-medium w-28">Weight</th><th className="text-left py-2 text-slate-500 font-medium w-28">Est. Questions</th></tr></thead>
													<tbody>
														{session2Breakdown.map(r => (
															<tr key={r.volumeId} className="border-b border-slate-100">
																<td className="py-2 text-slate-700">{r.volumeName}</td>
																<td className="py-2 text-slate-600">{r.weightMin}%–{r.weightMax}%</td>
																<td className="py-2"><Tag color="purple">{r.estimatedQuestions}</Tag></td>
															</tr>
														))}
													</tbody>
												</table>
											</div>
										) : null}
									</div>
								) : (
									<table className="w-full text-sm">
										<thead><tr className="border-b border-slate-200"><th className="text-left py-2 text-slate-500 font-medium">Volume</th><th className="text-left py-2 text-slate-500 font-medium w-28">Weight</th><th className="text-left py-2 text-slate-500 font-medium w-28">Est. Questions</th></tr></thead>
										<tbody>
											{breakdown.map(r => (
												<tr key={r.volumeId} className="border-b border-slate-100">
													<td className="py-2 text-slate-700">{r.volumeName}</td>
													<td className="py-2 text-slate-600">{r.weightMin}%–{r.weightMax}%</td>
													<td className="py-2"><Tag color="blue">{r.estimatedQuestions}</Tag></td>
												</tr>
											))}
										</tbody>
									</table>
								)}
							</Card>
						)}

						{/* Begin Button */}
						<div className="text-center pt-4">
							<Button
								type="primary"
								size="large"
								onClick={() => setShowInstructions(false)}
								className="rounded-xl px-12"
								style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', height: 52, fontSize: 16 }}
							>
								Begin Exam
							</Button>
							<Typography.Text className="text-slate-400 text-xs block mt-3">
								Timer is already running. Click above when you are ready to start answering.
							</Typography.Text>
						</div>
					</motion.div>
				</div>
			</div>
		);
	}

	const onSelectOption = async (questionId, optionId) => {
		try {
			await api.post(`/api/exams/attempts/${attemptId}/answers`, {
				questionId,
				selectedOptionId: optionId
			});
			const res = await api.get(`/api/exams/attempts/${attemptId}`);
			setAttempt(res.data.attempt);

			// In practice mode, mark as reviewed and check if wrong
			if (mode === 'practice') {
				setReviewedQuestions(prev => new Set([...prev, questionId]));
				
				// Find the answer to check if it's correct
				const answer = res.data.attempt.answers?.find(a => a.questionId === questionId);
				if (answer && answer.isCorrect === false) {
					// Auto-add to mistake bank
					const question = answer.question;
					const correctOption = question?.options?.find(o => o.isCorrect);
					addToMistakeBank(questionId, optionId, correctOption?.id);
				}
			}
		} catch {
			message.error('Failed to save answer');
		}
	};

	const onSaveTextAnswer = async (questionId, text) => {
		try {
			await api.post(`/api/exams/attempts/${attemptId}/answers`, {
				questionId,
				textAnswer: text ?? ''
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

	// Ensure any in-progress constructed responses are saved before final submit
	const saveAllConstructedDrafts = async () => {
		const toSave = [];
		for (const a of answers) {
			const q = a?.question;
			if (q?.type !== 'CONSTRUCTED_RESPONSE') continue;
			const draft = constructedDrafts[q.id];
			if (typeof draft === 'string') {
				const current = a?.textAnswer ?? '';
				if (draft !== current) {
					toSave.push(onSaveTextAnswer(q.id, draft));
				}
			}
		}
		if (toSave.length > 0) {
			await Promise.all(toSave);
		}
	};

	const submit = async () => {
		if (submitRef.current) return;
		submitRef.current = true;
		try {
			// Make sure any unsaved constructed answers are persisted first
			await saveAllConstructedDrafts();

			await api.post(`/api/exams/attempts/${attemptId}/submit`);
			const res = await api.get(`/api/exams/attempts/${attemptId}`);
			setAttempt(res.data.attempt);

			// If this is a mock exam session, complete the session
			const mId = searchParams.get('mockExamId');
			const mSession = searchParams.get('session');
			if (mId && mSession) {
				try {
					const score = res.data.attempt?.scorePercent ?? null;
					const completeRes = await api.post(`/api/exams/mock/${mId}/complete-session`, {
						session: parseInt(mSession, 10),
						score
					});

					// If session 1 just completed and there IS a session 2, show the S2 prompt
					const updatedMock = completeRes.data?.mockExam;
					if (parseInt(mSession, 10) === 1 && updatedMock?.status === 'BREAK' && updatedMock?.session2ExamId) {
						const breakMins = updatedMock.breakMinutes || 30;
						setBreakExpiresAt(Date.now() + breakMins * 60 * 1000);
						setShowSession2Prompt(true);
						return; // Don't show the normal result modal
					}
				} catch {
					// Silent fail - mock status will be stale but not blocking
				}
			}

			// Show result modal for non-mock or after final session
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
									<div className="flex items-center gap-2">
										<Typography.Text className="text-white/60 text-xs uppercase tracking-wider">
											{mode === 'practice' ? 'Practice Mode' : mode === 'exam' ? 'Exam Mode' : 'Exam in Progress'}
										</Typography.Text>
										{mode && (
											<Tag 
												className="border-0 text-xs rounded-full"
												style={{ 
													background: mode === 'practice' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(59, 130, 246, 0.3)',
													color: 'white'
												}}
											>
												{mode === 'practice' ? <EyeOutlined className="mr-1" /> : <LockOutlined className="mr-1" />}
												{mode === 'practice' ? 'Learn' : 'Test'}
											</Tag>
										)}
									</div>
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
							{/* Question/Item-Set Number Pills */}
							<div className="flex-1 overflow-x-auto py-1 thin-scrollbar">
								<div className="flex items-center gap-2 min-w-max">
									<Typography.Text className="text-white/60 text-xs mr-2 hidden sm:inline">
										{navItems.some(n => n.type === 'vignette') ? 'Item Sets:' : 'Questions:'}
									</Typography.Text>
									{navItems.map((nav, i) => {
										const isCurrent = nav.pageIdx === currentPage;
										return (
											<Tooltip key={i} title={`${nav.type === 'vignette' ? 'Item Set' : 'Question'} ${nav.label}${nav.isAnswered ? ' (Answered)' : ' (Not answered)'}`}>
												<motion.button
													whileHover={{ scale: 1.1 }}
													whileTap={{ scale: 0.95 }}
													onClick={() => setCurrentPage(nav.pageIdx)}
													className={`
														w-8 h-8 rounded-lg text-xs font-semibold transition-all
														${nav.isAnswered
															? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30'
															: isCurrent
																? 'bg-white/20 text-white ring-2 ring-cyan-400'
																: 'bg-white/10 text-white/70 hover:bg-white/20'
														}
													`}
												>
													{nav.label}
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
									<span>{answeredNavCount}/{displayTotalItems}</span>
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
			<div className="max-w-6xl mx-auto px-4 py-6">
				{isSubmitted ? (
					hasConstructedPending ? (
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
									style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%)' }}
								>
									<motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}>
										<TrophyOutlined className="text-6xl text-white/90 mb-4" />
									</motion.div>
									<Typography.Title level={2} className="!text-white !mb-2">
										Responses submitted
									</Typography.Title>
									<Typography.Paragraph className="!text-white/90 !mb-0 text-base" style={{ maxWidth: 360, margin: '0 auto' }}>
										Your responses have been submitted for marking. You will be notified when the admin is done marking.
									</Typography.Paragraph>
								</div>
								<div className="p-6 bg-white">
									<Space direction="vertical" size={12} className="w-full">
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
					) : (
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
					)
				) : hasQuestions ? (
					<Space direction="vertical" size={20} className="w-full">
						{/* Page indicator */}
						<div className="flex items-center justify-between">
							<Typography.Text className="text-slate-500">
								{navItems.some(n => n.type === 'vignette')
									? `Item Set ${currentPage + 1} of ${totalPages}`
									: `Showing questions ${pageStartAnswerIndex + 1} - ${pageStartAnswerIndex + flatPageItems.length} of ${totalQuestions}`
								}
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

						{(() => {
							const renderedItems = [];
							for (let idx = 0; idx < flatPageItems.length; idx += 1) {
								const item = flatPageItems[idx];
								const { ans, q, globalIdx, showVignette, vignetteText, subIdx, groupType } = item;

								if (groupType === 'vignette' && showVignette) {
									const vignetteItems = [item];
									let nextIdx = idx + 1;
									while (
										nextIdx < flatPageItems.length &&
										flatPageItems[nextIdx]?.groupType === 'vignette' &&
										!flatPageItems[nextIdx]?.showVignette
									) {
										vignetteItems.push(flatPageItems[nextIdx]);
										nextIdx += 1;
									}

									const caseStudyAnswered = vignetteItems.some(({ ans: subAns, q: subQ }) => {
										const subConstructed = subQ?.type === 'CONSTRUCTED_RESPONSE';
										return subConstructed
											? (subAns?.textAnswer != null && String(subAns.textAnswer).trim() !== '')
											: !!subAns?.selectedOptionId;
									});

									renderedItems.push(
										<motion.div
											key={`vignette-${q?.parent?.id || q?.id || globalIdx}`}
											initial={{ opacity: 0, y: 20 }}
											animate={{ opacity: 1, y: 0 }}
											transition={{ delay: idx * 0.05 }}
											className="mb-6"
										>
											<Card
												className={`border-0 shadow-lg hover:shadow-xl transition-all overflow-hidden ${caseStudyAnswered ? 'ring-2 ring-emerald-400/50' : ''}`}
												style={{ borderRadius: 20 }}
												styles={{ body: { padding: 0 } }}
											>
												<div
													ref={(el) => { questionRefs.current[globalIdx] = el; }}
													className="px-6 py-4 flex items-center justify-between"
													style={{
														background: caseStudyAnswered
															? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
															: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)'
													}}
												>
													<div className="flex items-center gap-3">
														<div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
															<span className="text-white font-bold">{globalIdx + 1}</span>
														</div>
														<Typography.Text className="text-white/90 font-semibold">
															Case Study
														</Typography.Text>
														{caseStudyAnswered && (
															<Tag className="bg-white/20 text-white border-0 rounded-full">
																<CheckCircleOutlined className="mr-1" /> Answered
															</Tag>
														)}
													</div>
												</div>

												<div className="p-6">
													<div
														className="text-slate-800 text-base md:text-lg prose max-w-none"
														dangerouslySetInnerHTML={{ __html: vignetteText || q?.parent?.vignetteText || '' }}
													/>

													<div className="mt-6 border-t border-slate-200" />

													<div className="divide-y divide-slate-200">
														{vignetteItems.map(({ ans: subAns, q: subQ, globalIdx: subGlobalIdx, subIdx: subQuestionIdx }, subRenderIdx) => {
															const subConstructed = subQ?.type === 'CONSTRUCTED_RESPONSE';
															const subAnswered = subConstructed
																? (subAns?.textAnswer != null && String(subAns.textAnswer).trim() !== '')
																: !!subAns?.selectedOptionId;

															return (
																<div
																	key={subQ?.id || subGlobalIdx}
																	ref={(el) => { questionRefs.current[subGlobalIdx] = el; }}
																	className={subRenderIdx === 0 ? 'pt-6' : 'py-6'}
																>
																	<div className="flex items-center justify-between gap-3 mb-4">
																	
																		{subAnswered && (
																			<Tag color="green" className="rounded-full mr-0">Answered</Tag>
																		)}
																	</div>

																<div
  className="text-sm md:text-base text-slate-500 font-medium mb-6 prose max-w-none"
  style={{ display: "flex" }}
  dangerouslySetInnerHTML={{ __html: `<p>${toRoman(subQuestionIdx + 1)}) ${stripQuestionNumber(subQ?.stem) || ''}</p>` }}
/>

																	{subConstructed ? (
																		<div className="flex flex-col">
																			<RichTextEditor
																				value={constructedDrafts[subQ?.id] !== undefined ? constructedDrafts[subQ?.id] : (subAns?.textAnswer ?? '')}
																				onChange={(value) => setConstructedDrafts(prev => ({ ...prev, [subQ?.id]: value }))}
																				onBlur={() => {
																					const val = constructedDrafts[subQ?.id] ?? subAns?.textAnswer ?? '';
																					onSaveTextAnswer(subQ.id, val);
																					setConstructedDrafts(prev => ({ ...prev, [subQ?.id]: undefined }));
																				}}
																				placeholder="Type your answer here..."
																				minHeight={200}
																			/>
																		</div>
																	) : (
																		<Radio.Group
																			value={subAns?.selectedOptionId ?? undefined}
																			onChange={(e) => onSelectOption(subQ.id, e.target.value)}
																			className="w-full"
																		>
																			<Space direction="vertical" size={12} className="w-full">
																				{subQ?.options?.map((opt, optIdx) => {
																					const letters = ['A','B','C','D','E','F'];
																					return (
																						<Radio
																							key={opt.id}
																							value={opt.id}
																							className="w-full p-4 rounded-xl border border-slate-200 hover:bg-slate-50"
																							style={{ display: 'flex', alignItems: 'flex-start' }}
																						>
																							<div className="flex items-start gap-3">
																								<span className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm bg-slate-100 text-slate-600">
																									{letters[optIdx] || optIdx + 1}
																								</span>
																								<span className="pt-1 text-slate-700">{opt.text}</span>
																							</div>
																						</Radio>
																					);
																				})}
																			</Space>
																		</Radio.Group>
																	)}

																	<AnimatePresence>
																		<SmartReviewPanel
																			answer={subAns}
																			question={subQ}
																			visible={mode === 'practice' && subAnswered && reviewedQuestions.has(subQ?.id)}
																			onAddToRevision={handleAddToRevision}
																			onAddToWeakTopic={handleAddToWeakTopic}
																			onOpenNotes={openNotesDrawer}
																			mode={mode}
																		/>
																	</AnimatePresence>
																</div>
															);
														})}
													</div>
												</div>
											</Card>
										</motion.div>
									);

									idx = nextIdx - 1;
									continue;
								}

								const isConstructed = q?.type === 'CONSTRUCTED_RESPONSE';
								const isAnswered = isConstructed
									? (ans?.textAnswer != null && String(ans.textAnswer).trim() !== '')
									: !!ans?.selectedOptionId;
								const displayNumber = String(globalIdx + 1);

								renderedItems.push(
									<motion.div
										key={q?.id || globalIdx}
										ref={(el) => { questionRefs.current[globalIdx] = el; }}
										initial={{ opacity: 0, y: 20 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ delay: idx * 0.05 }}
										className="mb-6"
									>
										<Card
											className={`border-0 shadow-lg hover:shadow-xl transition-all overflow-hidden ${isAnswered ? 'ring-2 ring-emerald-400/50' : ''}`}
											style={{ borderRadius: 20 }}
											styles={{ body: { padding: 0 } }}
										>
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
														<span className="text-white font-bold">{displayNumber}</span>
													</div>
													{isAnswered && (
														<Tag className="bg-white/20 text-white border-0 rounded-full">
															<CheckCircleOutlined className="mr-1" /> Answered
														</Tag>
													)}
												</div>
											</div>

											<div className="p-6">
												<div
													className="text-lg text-slate-800 font-medium mb-6 prose max-w-none"
													dangerouslySetInnerHTML={{ __html: stripQuestionNumber(q?.stem) || '' }}
												/>

												{isConstructed ? (
													<div className="flex flex-col">
														<RichTextEditor
															value={constructedDrafts[q?.id] !== undefined ? constructedDrafts[q?.id] : (ans?.textAnswer ?? '')}
															onChange={(value) => setConstructedDrafts(prev => ({ ...prev, [q?.id]: value }))}
															onBlur={() => {
																const val = constructedDrafts[q?.id] ?? ans?.textAnswer ?? '';
																onSaveTextAnswer(q.id, val);
																setConstructedDrafts(prev => ({ ...prev, [q?.id]: undefined }));
															}}
															placeholder="Type your answer here..."
															minHeight={200}
														/>
													</div>
												) : (
													<Radio.Group
														value={ans?.selectedOptionId ?? undefined}
														onChange={(e) => onSelectOption(q.id, e.target.value)}
														className="w-full"
													>
														<Space direction="vertical" size={12} className="w-full">
															{q?.options?.map((opt, optIdx) => {
																const letters = ['A','B','C','D','E','F'];
																return (
																	<Radio
																		key={opt.id}
																		value={opt.id}
																		className="w-full p-4 rounded-xl border border-slate-200 hover:bg-slate-50"
																		style={{ display: 'flex', alignItems: 'flex-start' }}
																	>
																		<div className="flex items-start gap-3">
																			<span className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm bg-slate-100 text-slate-600">
																				{letters[optIdx] || optIdx + 1}
																			</span>
																			<span className="pt-1 text-slate-700">{opt.text}</span>
																		</div>
																	</Radio>
																);
															})}
														</Space>
													</Radio.Group>
												)}

												<AnimatePresence>
													<SmartReviewPanel
														answer={ans}
														question={q}
														visible={mode === 'practice' && isAnswered && reviewedQuestions.has(q?.id)}
														onAddToRevision={handleAddToRevision}
														onAddToWeakTopic={handleAddToWeakTopic}
														onOpenNotes={openNotesDrawer}
														mode={mode}
													/>
												</AnimatePresence>
											</div>
										</Card>
									</motion.div>
								);
							}

							return renderedItems;
						})()}

						{/* Bottom Pagination */}
						<div className="flex items-center justify-center gap-4 pt-4">
							<Button
								size="large"
								disabled={currentPage <= 0}
								onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
								className="rounded-lg"
							>
								← Previous
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
								className="rounded-lg"
							>
								Next →
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

			{/* Session 2 Break Prompt */}
			<Modal
				title={null}
				open={showSession2Prompt}
				closable={false}
				footer={null}
				width={480}
				centered
				destroyOnClose
				styles={{ body: { padding: 0 } }}
			>
				{(() => {
					const breakRemainingSec = breakExpiresAt ? Math.max(0, Math.floor((breakExpiresAt - breakNow) / 1000)) : 0;
					const breakMins = Math.floor(breakRemainingSec / 60);
					const breakSecs = breakRemainingSec % 60;
					const breakExpired = breakRemainingSec <= 0 && breakExpiresAt;

					return (
						<>
							<div className="p-8 text-center" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 50%, #a78bfa 100%)' }}>
								<motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', duration: 0.5 }}>
									<PauseCircleOutlined className="text-6xl text-white/90 mb-4" />
								</motion.div>
								<Typography.Title level={3} className="!text-white !mb-2">
									Session 1 Complete!
								</Typography.Title>
								<Typography.Paragraph className="!text-white/90 !mb-4 text-base">
									Take a break before starting Session 2
								</Typography.Paragraph>
								<div className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/20 backdrop-blur">
									<ClockCircleOutlined className="text-white text-xl" />
									<span className="text-white text-2xl font-mono font-bold">
										{String(breakMins).padStart(2, '0')}:{String(breakSecs).padStart(2, '0')}
									</span>
									<span className="text-white/70 text-sm ml-1">remaining</span>
								</div>
							</div>
							<div className="p-6 bg-white space-y-3">
								<Alert
									type="warning"
									showIcon
									message="Session 2 must be started within the break time"
									description="If you don't start Session 2 before the timer expires, it will be scored as 0% and your exam will be completed."
									className="rounded-xl"
								/>
								<Button
									type="primary"
									block
									size="large"
									onClick={async () => {
										try {
											const { data } = await api.post(`/api/exams/mock/${mockExamId}/start-session`, { session: 2 });
											setShowSession2Prompt(false);
											navigate(`/student/exam/${data.attempt.id}?mode=mock&mockExamId=${mockExamId}&session=2`);
										} catch (err) {
											message.error(err.response?.data?.error || 'Failed to start Session 2');
										}
									}}
									disabled={breakExpired}
									className="rounded-xl h-12 font-semibold"
									style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
								>
									Start Session 2
								</Button>
								<Button
									block
									size="large"
									onClick={async () => {
										try {
											await api.post(`/api/exams/mock/${mockExamId}/complete-session`, { session: 2, score: 0 });
										} catch { /* silent */ }
										setShowSession2Prompt(false);
										navigate(window.location.pathname.startsWith('/student/') ? '/student/mock-exams' : -1);
									}}
									className="rounded-xl"
								>
									Skip Session 2 (Score as 0%)
								</Button>
							</div>
						</>
					);
				})()}
			</Modal>

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
				{(() => {
					const hasConstructedPending = (resultAttempt?.answers || []).some(
						(a) => a?.question?.type === 'CONSTRUCTED_RESPONSE' && a.marksAwarded == null
					);
					if (hasConstructedPending) {
						return (
							<>
								<div
									className="p-8 text-center"
									style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%)' }}
								>
									<motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', duration: 0.5 }}>
										<TrophyOutlined className="text-6xl text-white/90 mb-4" />
									</motion.div>
									<Typography.Title level={3} className="!text-white !mb-2">
										Responses submitted
									</Typography.Title>
									<Typography.Paragraph className="!text-white/90 !mb-0 text-base" style={{ maxWidth: 320, margin: '0 auto' }}>
										Your responses have been submitted for marking. You will be notified when the admin is done marking.
									</Typography.Paragraph>
								</div>
								<div className="p-6 bg-white">
									<Space direction="vertical" size={12} className="w-full">
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
							</>
						);
					}
					const scorePct = Math.round(resultAttempt?.scorePercent ?? 0);
					const passed = scorePct >= 70;
					return (
						<>
							<div
								className="p-8 text-center"
								style={{
									background: passed
										? 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)'
										: 'linear-gradient(135deg, #dc2626 0%, #ef4444 50%, #f87171 100%)'
								}}
							>
								<motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', duration: 0.6 }}>
									<TrophyOutlined className="text-6xl text-white/90 mb-4" />
								</motion.div>
								<Typography.Title level={3} className="!text-white !mb-2">
									Exam Complete!
								</Typography.Title>
								<Typography.Text className="text-white/80">Your final score</Typography.Text>
								<motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, type: 'spring' }}>
									<Typography.Title level={1} className="!text-white !text-6xl !my-4 font-bold">
										{scorePct}%
									</Typography.Title>
								</motion.div>
								{passed ? (
									<Tag className="bg-white/20 text-white border-0 text-base px-4 py-1 rounded-full">🎉 Congratulations! You Passed!</Tag>
								) : scorePct > 0 ? (
									<Tag className="bg-white/20 text-white border-0 text-base px-4 py-1 rounded-full">📚 Keep Practicing!</Tag>
								) : null}
							</div>
							<div className="p-6 bg-white">
								<Space direction="vertical" size={12} className="w-full">
									<Button
										type="primary"
										size="large"
										block
										onClick={() => { closeResultModal(); navigate(`/student/exams/result/${resultAttempt?.id || attemptId}`); }}
										className="h-12 rounded-xl font-semibold"
										style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
									>
										View Detailed Results
									</Button>
									<Button size="large" block onClick={() => { closeResultModal(); navigate(window.location.pathname.startsWith('/student/') ? '/student' : -1); }} className="h-12 rounded-xl font-semibold">
										Back to Dashboard
									</Button>
								</Space>
							</div>
						</>
					);
				})()}
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
							const correctCount = ansList.filter(x => {
								if (x?.question?.type === 'CONSTRUCTED_RESPONSE') return x.marksAwarded != null;
								return x.isCorrect === true;
							}).length;
							const pct = Math.round(answersDrawerAttempt.scorePercent ?? (total ? (correctCount / total) * 100 : 0));
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
								const isConstructed = a?.question?.type === 'CONSTRUCTED_RESPONSE';
								const correct = isConstructed ? (a.marksAwarded != null) : (a.isCorrect === true);
								const correctOpt = (a?.question?.options || []).find(o => o.isCorrect);
								const correctText = correctOpt?.text ?? '—';
								const yourText = isConstructed ? (a?.textAnswer || '—') : (a?.selectedOption?.text ?? '—');
								const maxMarks = a?.question?.marks ?? 1;
								const awarded = a?.marksAwarded ?? null;
								return (
									<Card
										key={a.id || idx}
										className="border-0 shadow-sm overflow-hidden"
										style={{ borderRadius: 16 }}
										styles={{ body: { padding: 0 } }}
									>
										<div
											className="px-4 py-3 flex items-center gap-3 flex-wrap"
											style={{
												background: correct
													? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
													: isConstructed && awarded == null
														? 'linear-gradient(135deg, #64748b 0%, #475569 100%)'
														: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'
											}}
										>
											{correct ? (
												<CheckCircleOutlined className="text-white text-lg" />
											) : (
												<CloseCircleOutlined className="text-white text-lg" />
											)}
											<Typography.Text className="text-white font-semibold">
												{idx + 1}
											</Typography.Text>
											{isConstructed ? (
												<>
													{awarded != null ? (
														<Tag className="bg-white/20 text-white border-0 rounded-full text-xs">
															Mark: {awarded} / {maxMarks}
														</Tag>
													) : (
														<Tag className="bg-white/20 text-white border-0 rounded-full text-xs">
															Pending marking
														</Tag>
													)}
												</>
											) : (
												<Tag className="bg-white/20 text-white border-0 rounded-full ml-auto text-xs">
													{correct ? 'Correct' : 'Incorrect'}
												</Tag>
											)}
										</div>
										<div className="p-4">
											<div className="text-slate-700 font-medium mb-4 prose max-w-none text-sm rich-content-display" dangerouslySetInnerHTML={{ __html: a?.question?.stem || '' }} />
											<div className="space-y-2">
												<div className={`p-3 rounded-xl ${correct ? 'bg-emerald-50 border border-emerald-200' : isConstructed && awarded == null ? 'bg-slate-50 border border-slate-200' : 'bg-red-50 border border-red-200'}`}>
													<Typography.Text className="text-slate-500 text-xs block mb-1">Your Answer</Typography.Text>
													{isConstructed ? (
														<Typography.Paragraph className="!mb-0 text-slate-700 whitespace-pre-wrap">{yourText}</Typography.Paragraph>
													) : (
														<Typography.Text className={correct ? 'text-emerald-700' : 'text-red-700'}>{yourText}</Typography.Text>
													)}
												</div>
												{isConstructed && awarded != null && (
													<div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
														<Typography.Text className="text-blue-600 text-xs block mb-1">Marks awarded</Typography.Text>
														<Typography.Text className="text-blue-800 font-semibold">{awarded} / {maxMarks}</Typography.Text>
													</div>
												)}
												{!isConstructed && !correct && (
													<div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
														<Typography.Text className="text-slate-500 text-xs block mb-1">Correct Answer</Typography.Text>
														<Typography.Text className="text-emerald-700 font-medium">{correctText}</Typography.Text>
													</div>
												)}
												{!correct && !(isConstructed && awarded == null) && (
													<AIHelpPanel
														questionId={a?.question?.id}
														selectedOptionId={a?.selectedOptionId}
														selectedOptionText={a?.selectedOption?.text}
														textAnswer={isConstructed ? a?.textAnswer : undefined}
														mode="result_review"
													/>
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

			{/* Mode Selection Modal */}
			<ModeSelectionModal
				visible={showModeSelection}
				onSelect={handleModeSelect}
				examName={courseName}
			/>
			<ModuleNotesDrawer open={notesDrawerOpen} onClose={() => setNotesDrawerOpen(false)} topicId={notesDrawerTopicId} topicName={notesDrawerTopicName} />
		</div>
	);
}
