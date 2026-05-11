import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, Typography, Button, Space, Collapse, Tag, Spin, Tree, Progress, InputNumber, Radio, message } from 'antd';
import { AIHelpPanel } from '../components/AIHelpPanel.jsx';
import {
	CheckCircleOutlined,
	CloseCircleOutlined,
	ArrowLeftOutlined,
	BulbOutlined,
	CalculatorOutlined,
	TrophyOutlined,
	BookOutlined,
	RocketOutlined,
	RobotOutlined,
	SnippetsOutlined,
	FileTextOutlined,
	EditOutlined,
	SendOutlined,
	LeftOutlined,
	RightOutlined
} from '@ant-design/icons';
import { ModuleNotesDrawer } from '../components/ModuleNotesDrawer.jsx';
import { safeHtml, formatFormulaHtml } from '../lib/formatFormula';

export function ExamResult() {
	const { attemptId } = useParams();
	const navigate = useNavigate();
	const [attempt, setAttempt] = useState(null);
	const [topics, setTopics] = useState([]);
	const [analyticsTree, setAnalyticsTree] = useState([]);
	const [loading, setLoading] = useState(true);
	const [aiHints, setAiHints] = useState({});
	const [hintsLoading, setHintsLoading] = useState(false);
	const [searchParams] = useSearchParams();
	const isSelfMarkMode = searchParams.get('selfMark') === '1';
	const [selfGrades, setSelfGrades] = useState({}); // answerId -> { choice: 'Y'|'N'|'PARTIAL', marks: number }
	const [submittingGrades, setSubmittingGrades] = useState(false);
	const [selfMarkPage, setSelfMarkPage] = useState(0);
	const [siblingAttemptId, setSiblingAttemptId] = useState(null);
	const [mainAnswerIds, setMainAnswerIds] = useState(new Set());
	const topRef = useRef(null);

	const toRoman = (num) => {
		const romanNumerals = ['i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii','xiii','xiv','xv','xvi','xvii','xviii','xix','xx'];
		return romanNumerals[num - 1] || String(num);
	};

	const scrollToTop = () => {
		if (topRef.current) topRef.current.scrollIntoView({ behavior: 'smooth' });
		else window.scrollTo({ top: 0, behavior: 'smooth' });
	};
	const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
	const [notesDrawerTopicId, setNotesDrawerTopicId] = useState(null);
	const [notesDrawerTopicName, setNotesDrawerTopicName] = useState(null);
	const openNotesDrawer = (topicId, topicName) => { setNotesDrawerTopicId(topicId); setNotesDrawerTopicName(topicName); setNotesDrawerOpen(true); };

	useEffect(() => {
		let mounted = true;
		(async () => {
			try {
				const [a, analytics] = await Promise.all([
					api.get(`/api/exams/attempts/${attemptId}`),
					api.get(`/api/exams/attempts/${attemptId}/analytics`).catch(() => ({ data: { byTopic: [] } }))
				]);
				if (mounted) {
					let mainAttempt = a.data.attempt;
					// Track which answer IDs belong to the main attempt
					const mainAIds = new Set((mainAttempt.answers || []).map(ans => ans.id));
					setMainAnswerIds(mainAIds);
					// For self-marking: if there's a sibling session, load and merge its answers
					if (isSelfMarkMode && mainAttempt.siblingAttempt?.id) {
						try {
							const sibRes = await api.get(`/api/exams/attempts/${mainAttempt.siblingAttempt.id}`);
							const sibAttempt = sibRes.data.attempt;
							if (sibAttempt?.answers?.length) {
								setSiblingAttemptId(mainAttempt.siblingAttempt.id);
								// Determine order: session 1 first, session 2 second
								const currentSession = mainAttempt.currentSession || 1;
								const s1Answers = currentSession === 1 ? mainAttempt.answers : sibAttempt.answers;
								const s2Answers = currentSession === 1 ? sibAttempt.answers : mainAttempt.answers;
								mainAttempt = { ...mainAttempt, answers: [...s1Answers, ...s2Answers] };
							}
						} catch { /* sibling load failed, proceed with single session */ }
					}
					setAttempt(mainAttempt);
					setTopics(analytics?.data?.byTopic ?? []);
					setAnalyticsTree(analytics?.data?.tree ?? []);
				}
			} finally {
				if (mounted) setLoading(false);
			}
		})();
		return () => { mounted = false; };
	}, [attemptId, isSelfMarkMode]);

	const correctOption = (opts) => (opts || []).find((o) => o.isCorrect);
	const yourOptionText = (a) => a?.selectedOption?.text ?? '—';
	const correctOptionText = (a) => (correctOption(a?.question?.options)?.text) ?? '—';
	const isConstructed = (a) => a?.question?.type === 'CONSTRUCTED_RESPONSE';

	// Group answers by case study (parent question) for vignette display
	const answerGroups = useMemo(() => {
		if (!attempt?.answers) return [];
		const ans = attempt.answers;
		const groups = [];
		let i = 0;
		let caseStudyNum = 0;
		while (i < ans.length) {
			const a = ans[i];
			const pid = a?.question?.parentId;
			if (pid && a?.question?.parent) {
				caseStudyNum++;
				const group = {
					type: 'vignette',
					parentId: pid,
					vignetteText: a.question.parent.vignetteText || '',
					parentType: a.question.parent.type,
					caseStudyNum,
					answers: []
				};
				while (i < ans.length && ans[i]?.question?.parentId === pid) {
					group.answers.push(ans[i]);
					i++;
				}
				groups.push(group);
			} else {
				caseStudyNum++;
				groups.push({ type: 'single', caseStudyNum, answers: [ans[i]] });
				i++;
			}
		}
		return groups;
	}, [attempt?.answers]);

	// Self-grade helpers
	const setGrade = (answerId, choice, maxMarks) => {
		setSelfGrades(prev => ({
			...prev,
			[answerId]: {
				choice,
				marks: choice === 'Y' ? maxMarks : choice === 'N' ? 0 : (prev[answerId]?.marks ?? 0)
			}
		}));
	};
	const setPartialMarks = (answerId, marks) => {
		setSelfGrades(prev => ({
			...prev,
			[answerId]: { ...prev[answerId], choice: 'PARTIAL', marks }
		}));
	};

	const submitSelfGrades = async () => {
		const constructedAnswers = (attempt?.answers || []).filter(a => isConstructed(a) && a.marksAwarded == null);
		const allGraded = constructedAnswers.every(a => selfGrades[a.id]?.choice);
		if (!allGraded) {
			message.warning('Please grade all constructed response questions before submitting.');
			return;
		}
		setSubmittingGrades(true);
		try {
			const allGrades = constructedAnswers.map(a => ({
				answerId: a.id,
				marksAwarded: Math.max(0, selfGrades[a.id]?.marks ?? 0)
			}));
			// Split grades by attempt (main vs sibling)
			const mainGrades = allGrades.filter(g => mainAnswerIds.has(g.answerId));
			const sibGrades = allGrades.filter(g => !mainAnswerIds.has(g.answerId));

			const promises = [];
			if (mainGrades.length > 0) {
				promises.push(api.post(`/api/exams/attempts/${attemptId}/self-grade`, { grades: mainGrades }));
			}
			if (sibGrades.length > 0 && siblingAttemptId) {
				promises.push(api.post(`/api/exams/attempts/${siblingAttemptId}/self-grade`, { grades: sibGrades }));
			}
			await Promise.all(promises);

			setAttempt(prev => ({ ...prev, answers: prev.answers.map(a => {
				const g = allGrades.find(gr => gr.answerId === a.id);
				return g ? { ...a, marksAwarded: g.marksAwarded } : a;
			})}));
			message.success('Grading submitted successfully!');
			window.scrollTo({ top: 0, behavior: 'smooth' });
			navigate(`/student/exams/result/${attemptId}`, { replace: true });
		} catch (err) {
			message.error(err?.response?.data?.error || 'Failed to submit grades');
		}
		setSubmittingGrades(false);
	};

	const fetchAiHints = async () => {
		setHintsLoading(true);
		try {
			const { data } = await api.post(`/api/exams/attempts/${attemptId}/hints`);
			const map = {};
			(data?.hints || []).forEach((h) => { map[h.answerId] = { hint: h.hint, error: h.error }; });
			setAiHints(map);
		} catch (e) {
			const errMsg = e?.response?.data?.error || 'Failed to fetch AI hints';
			// Hints are optional, but show feedback so user knows what to fix
			// (e.g. missing OpenAI key)
			// eslint-disable-next-line no-console
			console.warn('AI hints fetch failed:', errMsg);
			setAiHints({});
		} finally {
			setHintsLoading(false);
		}
	};

	if (loading) {
		return (
			<div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-6">
				<Spin size="large" tip="Loading results..." />
			</div>
		);
	}

	if (!attempt) {
		return (
			<div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-6">
				<Card className="shadow-lg rounded-2xl max-w-md">
					<Typography.Text type="secondary">Could not load this result.</Typography.Text>
					<Button type="primary" className="mt-4" onClick={() => navigate(-1)}>Go back</Button>
				</Card>
			</div>
		);
	}

	const answers = attempt.answers || [];
	const hasPendingConstructed = answers.some((a) => isConstructed(a) && a.marksAwarded == null);
	const scorePct = Math.round(attempt.scorePercent ?? 0);
	const passed = scorePct >= 70;
	const wrongCount = answers.filter((a) => {
		const c = isConstructed(a) ? (a.marksAwarded != null) : (a.isCorrect === true);
		return !c;
	}).length;

	return (
		<div ref={topRef} className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
			<div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
				{/* Back */}
				<Button
					type="text"
					icon={<ArrowLeftOutlined />}
					onClick={() => navigate(-1)}
					className="mb-4 text-slate-600 hover:text-slate-900"
				>
					Back
				</Button>

				{/* Hero score card */}
				<Card
					className="overflow-hidden border-0 shadow-xl rounded-2xl mb-8"
					styles={{ body: { padding: 0 } }}
				>
					{hasPendingConstructed ? (
						<div
							className="p-8 sm:p-10 text-center"
							style={{ background: isSelfMarkMode ? 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 50%, #a78bfa 100%)' : 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%)' }}
						>
							{isSelfMarkMode ? <EditOutlined className="text-5xl text-white/90 mb-4" /> : <TrophyOutlined className="text-5xl text-white/90 mb-4" />}
							<Typography.Title level={2} className="!text-white !mb-2">
								{isSelfMarkMode ? 'Self-Marking Mode' : 'Responses submitted for marking'}
							</Typography.Title>
							<Typography.Paragraph className="!text-white/90 !mb-0 text-base max-w-md mx-auto">
								{isSelfMarkMode
									? 'Review your answers below and grade each constructed response (all sessions included). Use Y for full points, N for zero, or enter partial points.'
									: 'Your responses have been submitted. You will be notified when marking is complete. No score is shown until then.'}
							</Typography.Paragraph>
						</div>
					) : (
						<div
							className="p-8 sm:p-10 text-center"
							style={{
								background: passed
									? 'linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%)'
									: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 50%, #ef4444 100%)'
							}}
						>
							<TrophyOutlined className="text-5xl text-white/90 mb-4" />
							<Typography.Title level={2} className="!text-white !mb-1">
								{passed ? 'You passed!' : 'Exam complete'}
							</Typography.Title>
							<Typography.Text className="text-white/90 text-lg">Your score</Typography.Text>
							<div className="my-4">
								<span className="text-6xl sm:text-7xl font-bold text-white">{scorePct}%</span>
							</div>
							<Tag className="text-base px-4 py-1 rounded-full border-0 bg-white/20 text-white">
								{passed ? '🎉 Congratulations!' : wrongCount > 0 ? `Review ${wrongCount} question${wrongCount !== 1 ? 's' : ''} below` : 'Keep practicing'}
							</Tag>
						</div>
					)}
					{analyticsTree.length > 0 && !hasPendingConstructed && (
						<div className="p-6 bg-white border-t border-slate-100">
							<Typography.Text strong className="text-slate-700 block mb-3">Performance Breakdown</Typography.Text>
							<div className="space-y-2">
								{analyticsTree.map((vol) => (
									<Collapse
										key={vol.id}
										size="small"
										items={[
											{
												key: vol.id,
												label: (
													<div className="flex items-center justify-between w-full pr-2">
														<span className="font-semibold text-slate-800">{vol.name}</span>
														<span className="flex items-center gap-2">
															<Progress percent={vol.percent} size="small" style={{ width: 80 }} strokeColor={vol.percent >= 70 ? '#22c55e' : '#ef4444'} />
															<Tag color={vol.percent >= 70 ? 'green' : 'red'}>{vol.correct}/{vol.total}</Tag>
														</span>
													</div>
												),
												children: (
													<div className="space-y-1 pl-2">
														{vol.modules.map((mod) => (
															<Collapse
																key={mod.id}
																size="small"
																items={[
																	{
																		key: mod.id,
																		label: (
																			<div className="flex items-center justify-between w-full pr-2">
																				<span className="font-medium text-slate-700">{mod.name}</span>
																				<span className="flex items-center gap-2">
																					<Progress percent={mod.percent} size="small" style={{ width: 70 }} strokeColor={mod.percent >= 70 ? '#22c55e' : '#ef4444'} />
																					<span className="text-xs text-slate-500">{mod.correct}/{mod.total}</span>
																				</span>
																			</div>
																		),
																		children: (
																			<div className="space-y-1 pl-4">
																				{mod.topics.map((t) => (
																					<div key={t.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-100">
																						<span className="text-slate-600 text-sm">{t.name}</span>
																						<span className="flex items-center gap-2">
																							<Progress percent={t.percent} size="small" style={{ width: 60 }} strokeColor={t.percent >= 70 ? '#22c55e' : '#ef4444'} />
																							<span className="text-xs text-slate-500">{t.correct}/{t.total}</span>
																						</span>
																					</div>
																				))}
																			</div>
																		)
																	}
																]}
																className="bg-transparent"
																style={{ border: 'none' }}
															/>
														))}
													</div>
												)
											}
										]}
										className="bg-transparent"
										style={{ border: 'none' }}
									/>
								))}
							</div>
						</div>
					)}
				</Card>

				{/* Section title + AI hints */}
				<div className="flex flex-wrap items-center justify-between gap-3 mb-4">
					<div className="flex items-center gap-2">
						<BookOutlined className="text-slate-500 text-lg" />
						<Typography.Title level={4} className="!mb-0 !text-slate-800">
							Question review
						</Typography.Title>
					</div>
					{!hasPendingConstructed && wrongCount > 0 && (
						<Button
							type="default"
							icon={<RobotOutlined />}
							onClick={fetchAiHints}
							loading={hintsLoading}
							className="rounded-lg"
						>
							{Object.keys(aiHints).length > 0 ? 'Refresh AI hints' : 'Get AI hints for wrong answers'}
						</Button>
					)}
				</div>

				{answers.length === 0 ? (
					<Card className="rounded-xl border-slate-200 shadow-sm">
						<Typography.Text type="secondary">No answers to review.</Typography.Text>
					</Card>
				) : isSelfMarkMode && hasPendingConstructed ? (
					/* ========== SELF-MARKING MODE (paginated) ========== */
					<div>
						{/* Navigation pills – sub-question level */}
						<div className="mb-4 p-3 rounded-xl bg-white border border-slate-200 shadow-sm sticky top-0 z-10">
							<div className="flex items-center gap-2 mb-2">
								<Typography.Text strong className="text-slate-600 text-xs uppercase tracking-wide">Questions</Typography.Text>
								<Typography.Text className="text-slate-400 text-xs">({answerGroups.reduce((sum, g) => sum + g.answers.length, 0)} total sub-questions)</Typography.Text>
							</div>
							<div className="flex flex-wrap gap-1.5">
								{answerGroups.map((group, gIdx) => {
									const allGraded = group.answers.every(a => !isConstructed(a) || selfGrades[a.id]?.choice);
									const isCurrent = gIdx === selfMarkPage;
									return (
										<button
											key={group.parentId || group.caseStudyNum}
											onClick={() => { setSelfMarkPage(gIdx); scrollToTop(); }}
											className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${isCurrent ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : allGraded ? 'bg-green-100 text-green-800 border-green-300' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
										>
											<span>Q{group.caseStudyNum}</span>
											{allGraded && !isCurrent && <CheckCircleOutlined className="text-green-600 text-[10px]" />}
										</button>
									);
								})}
							</div>
							<div className="mt-2 flex items-center gap-2">
								<div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
									<div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.round((answerGroups.filter(g => g.answers.every(a => !isConstructed(a) || selfGrades[a.id]?.choice)).length / answerGroups.length) * 100)}%` }} />
								</div>
								<Typography.Text className="text-slate-500 text-xs">{answerGroups.filter(g => g.answers.every(a => !isConstructed(a) || selfGrades[a.id]?.choice)).length}/{answerGroups.length} marked</Typography.Text>
							</div>
						</div>

						{/* Current case study page */}
						{(() => {
							const group = answerGroups[selfMarkPage];
							if (!group) return null;
							const isVignette = group.type === 'vignette';
							return (
								<Card
									key={group.parentId || group.caseStudyNum}
									className="overflow-hidden rounded-xl border-0 shadow-lg"
									styles={{ body: { padding: 0 }, wrapper: { borderRadius: 20 } }}
								>
									{isVignette && (
										<>
											<div className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)' }}>
												<div className="flex items-center gap-3">
													<div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
														<span className="text-white font-bold">{group.caseStudyNum}</span>
													</div>
													<Typography.Text className="text-white/90 font-semibold">
														Case Study {group.caseStudyNum}
													</Typography.Text>
													<Tag className="bg-white/20 text-white border-0 rounded-full ml-auto">
														<EditOutlined className="mr-1" /> Self-Marking
													</Tag>
												</div>
											</div>
											<div className="p-6 bg-slate-50 border-b border-slate-200">
												<div className="prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: safeHtml(group.vignetteText) }} />
											</div>
										</>
									)}
									{!isVignette && (
										<div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
											<div className="flex items-center gap-2">
												<div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
													<span className="text-white font-bold text-sm">{group.caseStudyNum}</span>
												</div>
												<Typography.Text strong className="text-slate-700">Question {group.caseStudyNum}</Typography.Text>
												<Tag className="bg-purple-100 text-purple-700 border-0 rounded-full ml-auto"><EditOutlined className="mr-1" /> Self-Marking</Tag>
											</div>
										</div>
									)}
									<div className="divide-y divide-slate-200">
										{group.answers.map((a, subIdx) => {
											const constructed = isConstructed(a);
											const maxMarks = a?.question?.marks ?? 1;
											const yourText = constructed ? (a?.textAnswer ?? '—') : yourOptionText(a);
											const grade = selfGrades[a.id];
											const los = a?.question?.los;
											const kf = a?.question?.keyFormulas;
											const ws = a?.question?.workedSolution;
											const guidelines = a?.question?.questionGuidelines;
											const modelAnswer = a?.question?.output;

											if (!constructed) {
												const correct = a.isCorrect === true;
												return (
													<div key={a.id} className="p-6">
														<div className="flex items-start gap-3 mb-2">
															<div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-white font-semibold text-sm bg-slate-500">{toRoman(subIdx + 1)}</div>
															<div className="flex-1">
																<div className="prose prose-sm text-slate-700 max-w-none" dangerouslySetInnerHTML={{ __html: safeHtml(a?.question?.stem) || '' }} />
																<div className="mt-2">{correct ? <Tag color="green"><CheckCircleOutlined /> Correct</Tag> : <Tag color="red"><CloseCircleOutlined /> Incorrect</Tag>}</div>
															</div>
														</div>
													</div>
												);
											}

											return (
												<div key={a.id} className="p-6">
													<div className="flex items-start gap-3 mb-4">
														<div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-white font-semibold text-sm bg-indigo-600">{toRoman(subIdx + 1)}</div>
														<div className="flex-1">
															<div className="prose prose-sm text-slate-700 max-w-none" dangerouslySetInnerHTML={{ __html: safeHtml(a?.question?.stem) || '' }} />
															<Tag color="blue" className="mt-1">{maxMarks} point{maxMarks !== 1 ? 's' : ''}</Tag>
														</div>
													</div>
													<div className="p-4 rounded-lg bg-blue-50 border border-blue-200 mb-4">
														<Typography.Text strong className="text-blue-800 text-xs uppercase tracking-wide block mb-1">Your Answer</Typography.Text>
														<div className="text-slate-800 whitespace-pre-wrap prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: safeHtml(yourText) || '—' }} />
													</div>
													<div className="space-y-3 mb-4">
														{los && (
															<div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200">
																<div className="flex items-center gap-2 mb-1"><FileTextOutlined className="text-indigo-600" /><Typography.Text strong className="text-indigo-800 text-sm">Learning Outcome (LOS)</Typography.Text></div>
																<Typography.Text className="text-slate-700 text-sm">{los}</Typography.Text>
															</div>
														)}
														{modelAnswer && (
															<div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
																<div className="flex items-center gap-2 mb-1"><BulbOutlined className="text-emerald-600" /><Typography.Text strong className="text-emerald-800 text-sm">Model Answer / Expected Output</Typography.Text></div>
																<div className="text-slate-700 text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: safeHtml(modelAnswer) }} />
															</div>
														)}
														{guidelines && (
															<div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
																<div className="flex items-center gap-2 mb-1"><RocketOutlined className="text-amber-600" /><Typography.Text strong className="text-amber-800 text-sm">Marking Guidelines</Typography.Text></div>
																<div className="text-slate-700 text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: safeHtml(guidelines) }} />
															</div>
														)}
														{kf && (
															<div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
																<div className="flex items-center gap-2 mb-1"><CalculatorOutlined className="text-blue-600" /><Typography.Text strong className="text-blue-800 text-sm">Key Formula(s)</Typography.Text></div>
																<div className="prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: formatFormulaHtml(kf) }} />
															</div>
														)}
														{ws && (
															<div className="p-3 rounded-lg bg-green-50 border border-green-200">
																<div className="flex items-center gap-2 mb-1"><BulbOutlined className="text-green-600" /><Typography.Text strong className="text-green-800 text-sm">Worked Solution</Typography.Text></div>
																<div className="prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: formatFormulaHtml(ws) }} />
															</div>
														)}
													</div>
													<div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
														<Typography.Text strong className="text-slate-700 block mb-3">Score this answer:</Typography.Text>
														<div className="flex items-center gap-3 flex-wrap">
															<Button type={grade?.choice === 'Y' ? 'primary' : 'default'} onClick={() => setGrade(a.id, 'Y', maxMarks)} style={grade?.choice === 'Y' ? { background: '#16a34a', borderColor: '#16a34a' } : {}} className="rounded-lg font-semibold min-w-[80px]">Y ({maxMarks}/{maxMarks})</Button>
															<Button type={grade?.choice === 'N' ? 'primary' : 'default'} danger={grade?.choice === 'N'} onClick={() => setGrade(a.id, 'N', maxMarks)} className="rounded-lg font-semibold min-w-[80px]">N (0/{maxMarks})</Button>
															<div className="flex items-center gap-2">
																<Typography.Text className="text-slate-500 text-sm">Partial:</Typography.Text>
																<InputNumber min={0} max={maxMarks} value={grade?.choice === 'PARTIAL' ? grade.marks : undefined} placeholder="pts" onChange={(v) => v != null && setPartialMarks(a.id, v)} className="rounded-lg" style={{ width: 80 }} />
																<Typography.Text className="text-slate-400 text-sm">/ {maxMarks}</Typography.Text>
															</div>
														</div>
														{grade && (
															<div className="mt-2">
																<Tag color={grade.marks >= maxMarks ? 'green' : grade.marks > 0 ? 'orange' : 'red'}>Awarded: {grade.marks} / {maxMarks}</Tag>
															</div>
														)}
													</div>
												</div>
											);
										})}
									</div>
								</Card>
							);
						})()}

						{/* Pagination controls */}
						<div className="flex items-center justify-between mt-6">
							<Button
								icon={<LeftOutlined />}
								onClick={() => { setSelfMarkPage(p => Math.max(0, p - 1)); scrollToTop(); }}
								disabled={selfMarkPage === 0}
								className="rounded-lg"
							>
								Previous
							</Button>
							<Typography.Text className="text-slate-500 text-sm font-medium">
								{selfMarkPage + 1} / {answerGroups.length}
							</Typography.Text>
							{selfMarkPage < answerGroups.length - 1 ? (
								<Button
									type="primary"
									onClick={() => { setSelfMarkPage(p => Math.min(answerGroups.length - 1, p + 1)); scrollToTop(); }}
									className="rounded-lg"
									style={{ background: '#4f46e5', borderColor: '#4f46e5' }}
								>
									Next <RightOutlined />
								</Button>
							) : (
								<Button
									type="primary"
									icon={<SendOutlined />}
									onClick={submitSelfGrades}
									loading={submittingGrades}
									className="rounded-lg font-semibold"
									style={{ background: 'linear-gradient(135deg, #059669, #10b981)', borderColor: '#059669' }}
								>
									Submit All Points
								</Button>
							)}
						</div>
					</div>
				) : (
					/* ========== NORMAL RESULTS VIEW (grouped by case study) ========== */
					<Space direction="vertical" size={20} style={{ width: '100%' }}>
						{answerGroups.map((group) => {
							const isVignette = group.type === 'vignette';
							return (
								<Card
									key={group.parentId || group.caseStudyNum}
									className="overflow-hidden rounded-xl border-0 shadow-lg"
									styles={{ body: { padding: 0 }, wrapper: { borderRadius: 20 } }}
								>
									{isVignette && (
										<>
											<div className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)' }}>
												<div className="flex items-center gap-3">
													<div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
														<span className="text-white font-bold">{group.caseStudyNum}</span>
													</div>
													<Typography.Text className="text-white/90 font-semibold">Case Study {group.caseStudyNum}</Typography.Text>
												</div>
											</div>
											<div className="p-6 bg-slate-50 border-b border-slate-200">
												<div className="prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: safeHtml(group.vignetteText) }} />
											</div>
										</>
									)}
									<div className="divide-y divide-slate-200">
										{group.answers.map((a, subIdx) => {
											const constructed = isConstructed(a);
											const maxMarks = a?.question?.marks ?? 1;
											const correct = constructed ? (a.marksAwarded != null && a.marksAwarded >= maxMarks) : (a.isCorrect === true);
											const failed = !constructed ? !a.isCorrect : (a.marksAwarded != null && a.marksAwarded < maxMarks);
											const correctText = correctOptionText(a);
											const yourText = constructed ? (a?.textAnswer ?? '—') : yourOptionText(a);
											const keyFormulas = a?.question?.keyFormulas;
											const workedSolution = a?.question?.workedSolution;
											const traceSection = a?.question?.traceSection;
											const tracePage = a?.question?.tracePage;
											const hasExplanation = keyFormulas || workedSolution || traceSection || tracePage;
											const marksAwarded = a?.marksAwarded;

											return (
												<div key={a.id || subIdx} className="p-6" style={{ borderLeftWidth: 4, borderLeftColor: correct ? '#22c55e' : (constructed && marksAwarded == null ? '#eab308' : '#ef4444') }}>
													<div className="flex items-start gap-3 mb-3">
														<div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white font-semibold bg-slate-600">{toRoman(subIdx + 1)}</div>
														<div className="flex-1 min-w-0">
															<div className="prose prose-sm question-preview-content text-slate-700 max-w-none" dangerouslySetInnerHTML={{ __html: safeHtml(a?.question?.stem) || '' }} />
														</div>
													</div>
													<div className="mt-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
														<div className="flex items-start gap-2">
															{constructed ? (marksAwarded != null ? <CheckCircleOutlined className="text-green-600 mt-0.5 text-lg flex-shrink-0" /> : <Tag color="gold" className="flex-shrink-0">Pending</Tag>) : correct ? <CheckCircleOutlined className="text-green-600 mt-0.5 text-lg flex-shrink-0" /> : <CloseCircleOutlined className="text-red-500 mt-0.5 text-lg flex-shrink-0" />}
															<div className="flex-1 min-w-0">
																<Typography.Text type="secondary" className="text-xs uppercase tracking-wide">Your answer</Typography.Text>
																{constructed ? <div className="mt-1 text-slate-800 whitespace-pre-wrap">{yourText}</div> : <div className="mt-1 prose prose-sm question-preview-content max-w-none" dangerouslySetInnerHTML={{ __html: safeHtml(yourText) || '—' }} />}
															</div>
														</div>
													</div>
													{constructed && marksAwarded != null && (<div className="mt-3 flex items-center gap-2"><Tag color="green">Points: {marksAwarded} / {maxMarks}</Tag></div>)}
													{!constructed && !correct && correctText && (
														<div className="mt-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
															<Typography.Text strong className="text-emerald-800 text-sm">Correct answer</Typography.Text>
															<div className="mt-1 prose prose-sm question-preview-content text-emerald-900 max-w-none" dangerouslySetInnerHTML={{ __html: safeHtml(correctText) }} />
														</div>
													)}
													{failed && a?.question?.los && (
														<div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
															<div className="flex items-center gap-2 mb-1"><FileTextOutlined className="text-blue-600" /><Typography.Text strong className="text-blue-800 text-sm">Learning Outcome Statement (LOS)</Typography.Text></div>
															<Typography.Text className="text-slate-700 text-sm">{a.question.los}</Typography.Text>
														</div>
													)}
													{failed && a?.question?.topic?.id && (
														<div className="mt-3">
															<Button icon={<SnippetsOutlined />} onClick={() => openNotesDrawer(a.question.topic.id, a.question.topic.name)} className="rounded-xl" style={{ background: '#f0f4f8', borderColor: '#cbd5e1', color: '#102540' }}>View Module Notes – {a.question.topic.name}</Button>
														</div>
													)}
													{failed && (<AIHelpPanel questionId={a?.question?.id} selectedOptionId={a?.selectedOptionId} selectedOptionText={a?.selectedOption?.text} textAnswer={constructed ? a?.textAnswer : undefined} mode="result_review" />)}
													{failed && aiHints[a.id]?.hint && !hasExplanation && (
														<div className="mt-4 p-4 rounded-xl border border-violet-200 bg-violet-50/80">
															<div className="flex items-center gap-2 mb-2"><RobotOutlined className="text-violet-600" /><Typography.Text strong className="text-violet-800">AI hint</Typography.Text></div>
															<div className="text-slate-800 text-sm">{aiHints[a.id].hint}</div>
														</div>
													)}
													{hasExplanation && (
														<div className="mt-4">
															{failed ? (
																<div className="rounded-xl border-2 border-amber-200 bg-amber-50/80 overflow-hidden">
																	<div className="px-4 py-2 bg-amber-100 border-b border-amber-200 flex items-center gap-2"><RocketOutlined className="text-amber-700" /><Typography.Text strong className="text-amber-900">Learn from this question</Typography.Text></div>
																	<div className="p-4 space-y-4">
																		{(traceSection || tracePage) && (<div><Typography.Text strong className="text-purple-700 text-sm">Reference</Typography.Text><div className="text-slate-700 mt-1">{traceSection && <span>{traceSection}</span>}{traceSection && tracePage && <span>, </span>}{tracePage && <span>Page {tracePage}</span>}</div></div>)}
																		{keyFormulas && (<div><div className="flex items-center gap-2 mb-2"><CalculatorOutlined className="text-blue-600" /><Typography.Text strong className="text-blue-800">Key Formula(s)</Typography.Text></div><div className="prose prose-sm question-preview-content p-4 rounded-lg bg-blue-50/80 border border-blue-200 text-slate-800 max-w-none" dangerouslySetInnerHTML={{ __html: formatFormulaHtml(keyFormulas) }} /></div>)}
																		{workedSolution && (<div><div className="flex items-center gap-2 mb-2"><BulbOutlined className="text-green-600" /><Typography.Text strong className="text-green-800">Worked Solution</Typography.Text></div><div className="prose prose-sm question-preview-content p-4 rounded-lg bg-green-50/80 border border-green-200 text-slate-800 max-w-none" dangerouslySetInnerHTML={{ __html: formatFormulaHtml(workedSolution) }} /></div>)}
																		{aiHints[a.id]?.hint && (<div><div className="flex items-center gap-2 mb-2"><RobotOutlined className="text-violet-600" /><Typography.Text strong className="text-violet-800">AI hint</Typography.Text></div><div className="p-4 rounded-lg bg-violet-50/80 border border-violet-200 text-slate-800 text-sm">{aiHints[a.id].hint}</div></div>)}
																	</div>
																</div>
															) : (
																<Collapse size="small" className="bg-slate-50 rounded-lg border border-slate-200" items={[{ key: 'explanation', label: (<span className="flex items-center gap-2"><BulbOutlined className="text-slate-500" /><Typography.Text>View explanation</Typography.Text></span>), children: (<Space direction="vertical" size={12} style={{ width: '100%' }}>{(traceSection || tracePage) && (<div><Typography.Text strong className="text-purple-700 text-sm">Reference</Typography.Text><div className="text-slate-600 mt-1">{traceSection && <span>{traceSection}</span>}{traceSection && tracePage && <span>, </span>}{tracePage && <span>Page {tracePage}</span>}</div></div>)}{keyFormulas && (<div><Typography.Text strong className="text-blue-700 text-sm">Key Formula(s)</Typography.Text><div className="prose prose-sm question-preview-content mt-1 p-3 rounded bg-blue-50/50 border border-blue-100" dangerouslySetInnerHTML={{ __html: formatFormulaHtml(keyFormulas) }} /></div>)}{workedSolution && (<div><Typography.Text strong className="text-green-700 text-sm">Worked Solution</Typography.Text><div className="prose prose-sm question-preview-content mt-1 p-3 rounded bg-green-50/50 border border-green-100" dangerouslySetInnerHTML={{ __html: formatFormulaHtml(workedSolution) }} /></div>)}</Space>) }]} />
															)}
														</div>
													)}
												</div>
											);
										})}
									</div>
								</Card>
							);
						})}

					</Space>
				)}

				<div className="mt-8 flex justify-center">
					<Button
						type="primary"
						size="large"
						onClick={() => navigate(window.location.pathname.startsWith('/student/') ? '/student' : -1)}
						className="rounded-xl px-8 font-semibold"
						style={{ background: '#102540', borderColor: '#102540' }}
					>
						Back to Dashboard
					</Button>
				</div>
			</div>
			<ModuleNotesDrawer open={notesDrawerOpen} onClose={() => setNotesDrawerOpen(false)} topicId={notesDrawerTopicId} topicName={notesDrawerTopicName} />
		</div>
	);
}
