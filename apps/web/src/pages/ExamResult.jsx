import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, Typography, Button, Space, Collapse, Tag, Spin } from 'antd';
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
	RobotOutlined
} from '@ant-design/icons';

function safeHtml(html) {
	if (html == null || typeof html !== 'string') return '';
	return html
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

export function ExamResult() {
	const { attemptId } = useParams();
	const navigate = useNavigate();
	const [attempt, setAttempt] = useState(null);
	const [topics, setTopics] = useState([]);
	const [loading, setLoading] = useState(true);
	const [aiHints, setAiHints] = useState({});
	const [hintsLoading, setHintsLoading] = useState(false);

	useEffect(() => {
		let mounted = true;
		(async () => {
			try {
				const [a, analytics] = await Promise.all([
					api.get(`/api/exams/attempts/${attemptId}`),
					api.get(`/api/exams/attempts/${attemptId}/analytics`).catch(() => ({ data: { byTopic: [] } }))
				]);
				if (mounted) {
					setAttempt(a.data.attempt);
					setTopics(analytics?.data?.byTopic ?? []);
				}
			} finally {
				if (mounted) setLoading(false);
			}
		})();
		return () => { mounted = false; };
	}, [attemptId]);

	const correctOption = (opts) => (opts || []).find((o) => o.isCorrect);
	const yourOptionText = (a) => a?.selectedOption?.text ?? '—';
	const correctOptionText = (a) => (correctOption(a?.question?.options)?.text) ?? '—';
	const isConstructed = (a) => a?.question?.type === 'CONSTRUCTED_RESPONSE';

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
		<div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
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
							style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%)' }}
						>
							<TrophyOutlined className="text-5xl text-white/90 mb-4" />
							<Typography.Title level={2} className="!text-white !mb-2">
								Responses submitted for marking
							</Typography.Title>
							<Typography.Paragraph className="!text-white/90 !mb-0 text-base max-w-md mx-auto">
								Your responses have been submitted. You will be notified when marking is complete. No score is shown until then.
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
					{topics.length > 0 && !hasPendingConstructed && (
						<div className="p-6 bg-white border-t border-slate-100">
							<Typography.Text strong className="text-slate-700 block mb-3">By topic</Typography.Text>
							<div className="flex flex-wrap gap-3">
								{topics.map((t) => (
									<div
										key={t.topic}
										className="flex items-center justify-between gap-4 px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 min-w-[140px]"
									>
										<span className="text-slate-700 font-medium truncate">{t.topic}</span>
										<span className="text-slate-500 text-sm whitespace-nowrap">
											{t.correct}/{t.total} · {Math.round(t.percent)}%
										</span>
									</div>
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
				) : (
					<Space direction="vertical" size={20} style={{ width: '100%' }}>
						{answers.map((a, idx) => {
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
								<Card
									key={a.id || idx}
									className="overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md"
									style={{
										borderLeftWidth: 4,
										borderLeftColor: correct ? '#22c55e' : (constructed && marksAwarded == null ? '#eab308' : '#ef4444')
									}}
								>
									<div className="flex items-start gap-3 mb-3">
										<div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white font-semibold bg-slate-600">
											{idx + 1}
										</div>
										<div className="flex-1 min-w-0">
											<div
												className="prose prose-sm question-preview-content text-slate-700 max-w-none"
												dangerouslySetInnerHTML={{ __html: safeHtml(a?.question?.stem) || '' }}
											/>
										</div>
									</div>

									{/* Your answer */}
									<div className="mt-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
										<div className="flex items-start gap-2">
											{constructed ? (
												marksAwarded != null ? (
													<CheckCircleOutlined className="text-green-600 mt-0.5 text-lg flex-shrink-0" />
												) : (
													<Tag color="gold" className="flex-shrink-0">Pending</Tag>
												)
											) : correct ? (
												<CheckCircleOutlined className="text-green-600 mt-0.5 text-lg flex-shrink-0" />
											) : (
												<CloseCircleOutlined className="text-red-500 mt-0.5 text-lg flex-shrink-0" />
											)}
											<div className="flex-1 min-w-0">
												<Typography.Text type="secondary" className="text-xs uppercase tracking-wide">Your answer</Typography.Text>
												{constructed ? (
													<div className="mt-1 text-slate-800 whitespace-pre-wrap">{yourText}</div>
												) : (
													<div className="mt-1 prose prose-sm question-preview-content max-w-none" dangerouslySetInnerHTML={{ __html: safeHtml(yourText) || '—' }} />
												)}
											</div>
										</div>
									</div>

									{constructed && marksAwarded != null && (
										<div className="mt-3 flex items-center gap-2">
											<Tag color="green">Mark: {marksAwarded} / {maxMarks}</Tag>
										</div>
									)}

									{!constructed && !correct && correctText && (
										<div className="mt-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200">
											<Typography.Text strong className="text-emerald-800 text-sm">Correct answer</Typography.Text>
											<div className="mt-1 prose prose-sm question-preview-content text-emerald-900 max-w-none" dangerouslySetInnerHTML={{ __html: safeHtml(correctText) }} />
										</div>
									)}

									{failed && (
										<AIHelpPanel
											questionId={a?.question?.id}
											selectedOptionId={a?.selectedOptionId}
											selectedOptionText={a?.selectedOption?.text}
											textAnswer={constructed ? a?.textAnswer : undefined}
											mode="result_review"
										/>
									)}

									{/* AI hint when failed and no full explanation block */}
									{failed && aiHints[a.id]?.hint && !hasExplanation && (
										<div className="mt-4 p-4 rounded-xl border border-violet-200 bg-violet-50/80">
											<div className="flex items-center gap-2 mb-2">
												<RobotOutlined className="text-violet-600" />
												<Typography.Text strong className="text-violet-800">AI hint</Typography.Text>
											</div>
											<div className="text-slate-800 text-sm">{aiHints[a.id].hint}</div>
										</div>
									)}

									{/* Key Formula(s) & Worked Solution: expanded for failed questions, collapse for correct */}
									{hasExplanation && (
										<div className="mt-4">
											{failed ? (
												<div className="rounded-xl border-2 border-amber-200 bg-amber-50/80 overflow-hidden">
													<div className="px-4 py-2 bg-amber-100 border-b border-amber-200 flex items-center gap-2">
														<RocketOutlined className="text-amber-700" />
														<Typography.Text strong className="text-amber-900">Learn from this question</Typography.Text>
													</div>
													<div className="p-4 space-y-4">
														{(traceSection || tracePage) && (
															<div>
																<Typography.Text strong className="text-purple-700 text-sm">Reference</Typography.Text>
																<div className="text-slate-700 mt-1">
																	{traceSection && <span>{traceSection}</span>}
																	{traceSection && tracePage && <span>, </span>}
																	{tracePage && <span>Page {tracePage}</span>}
																</div>
															</div>
														)}
														{keyFormulas && (
															<div>
																<div className="flex items-center gap-2 mb-2">
																	<CalculatorOutlined className="text-blue-600" />
																	<Typography.Text strong className="text-blue-800">Key Formula(s)</Typography.Text>
																</div>
																<div
																	className="prose prose-sm question-preview-content p-4 rounded-lg bg-blue-50/80 border border-blue-200 text-slate-800 max-w-none"
																	dangerouslySetInnerHTML={{ __html: safeHtml(keyFormulas) }}
																/>
															</div>
														)}
														{workedSolution && (
															<div>
																<div className="flex items-center gap-2 mb-2">
																	<BulbOutlined className="text-green-600" />
																	<Typography.Text strong className="text-green-800">Worked Solution</Typography.Text>
																</div>
																<div
																	className="prose prose-sm question-preview-content p-4 rounded-lg bg-green-50/80 border border-green-200 text-slate-800 max-w-none"
																	dangerouslySetInnerHTML={{ __html: safeHtml(workedSolution) }}
																/>
															</div>
														)}
														{aiHints[a.id]?.hint && (
															<div>
																<div className="flex items-center gap-2 mb-2">
																	<RobotOutlined className="text-violet-600" />
																	<Typography.Text strong className="text-violet-800">AI hint</Typography.Text>
																</div>
																<div className="p-4 rounded-lg bg-violet-50/80 border border-violet-200 text-slate-800 text-sm">
																	{aiHints[a.id].hint}
																</div>
															</div>
														)}
														{aiHints[a.id]?.error && (
															<Typography.Text type="secondary" className="text-sm">AI hint unavailable</Typography.Text>
														)}
													</div>
												</div>
											) : (
												<Collapse
													size="small"
													className="bg-slate-50 rounded-lg border border-slate-200"
													items={[{
														key: 'explanation',
														label: (
															<span className="flex items-center gap-2">
																<BulbOutlined className="text-slate-500" />
																<Typography.Text>View explanation</Typography.Text>
															</span>
														),
														children: (
															<Space direction="vertical" size={12} style={{ width: '100%' }}>
																{(traceSection || tracePage) && (
																	<div>
																		<Typography.Text strong className="text-purple-700 text-sm">Reference</Typography.Text>
																		<div className="text-slate-600 mt-1">
																			{traceSection && <span>{traceSection}</span>}
																			{traceSection && tracePage && <span>, </span>}
																			{tracePage && <span>Page {tracePage}</span>}
																		</div>
																	</div>
																)}
																{keyFormulas && (
																	<div>
																		<Typography.Text strong className="text-blue-700 text-sm">Key Formula(s)</Typography.Text>
																		<div className="prose prose-sm question-preview-content mt-1 p-3 rounded bg-blue-50/50 border border-blue-100" dangerouslySetInnerHTML={{ __html: safeHtml(keyFormulas) }} />
																	</div>
																)}
																{workedSolution && (
																	<div>
																		<Typography.Text strong className="text-green-700 text-sm">Worked Solution</Typography.Text>
																		<div className="prose prose-sm question-preview-content mt-1 p-3 rounded bg-green-50/50 border border-green-100" dangerouslySetInnerHTML={{ __html: safeHtml(workedSolution) }} />
																	</div>
																)}
															</Space>
														)
													}]}
												/>
											)}
										</div>
									)}
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
		</div>
	);
}
