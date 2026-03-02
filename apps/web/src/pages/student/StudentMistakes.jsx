import { useEffect, useState } from 'react';
import { Card, Typography, Button, Space, Tag, Empty, Spin, Modal, Radio, Progress, message, Tooltip, Tabs } from 'antd';
import { 
	ExclamationCircleOutlined, 
	ReloadOutlined, 
	DeleteOutlined, 
	CheckCircleOutlined, 
	CloseCircleOutlined,
	RocketOutlined,
	BookOutlined,
	BulbOutlined,
	TrophyOutlined,
	FireOutlined,
	ClockCircleOutlined
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';

export default function StudentMistakes() {
	const navigate = useNavigate();
	const [loading, setLoading] = useState(true);
	const [mistakes, setMistakes] = useState([]);
	const [stats, setStats] = useState({ total: 0, unreviewedCount: 0 });
	const [activeTab, setActiveTab] = useState('all');
	const [retestModalOpen, setRetestModalOpen] = useState(false);
	const [retestConfig, setRetestConfig] = useState({ questionCount: 10, timeLimitMinutes: 20 });
	const [creatingRetest, setCreatingRetest] = useState(false);
	const [practiceQuestion, setPracticeQuestion] = useState(null);
	const [practiceAnswer, setPracticeAnswer] = useState(null);
	const [showPracticeResult, setShowPracticeResult] = useState(false);

	useEffect(() => {
		loadMistakes();
	}, []);

	const loadMistakes = async () => {
		setLoading(true);
		try {
			const res = await api.get('/api/exams/mistakes/me');
			setMistakes(res.data.mistakes || []);
			setStats({ total: res.data.total || 0, unreviewedCount: res.data.unreviewedCount || 0 });
		} catch {
			message.error('Failed to load mistakes');
		}
		setLoading(false);
	};

	const handleDelete = async (questionId) => {
		try {
			await api.delete(`/api/exams/mistakes/${questionId}`);
			setMistakes(prev => prev.filter(m => m.questionId !== questionId));
			message.success('Removed from mistake bank');
		} catch {
			message.error('Failed to remove');
		}
	};

	const handleCreateRetest = async () => {
		setCreatingRetest(true);
		try {
			const res = await api.post('/api/exams/mistakes/retest', retestConfig);
			message.success('Retest exam created!');
			setRetestModalOpen(false);
			// Start the exam
			const attemptRes = await api.post(`/api/exams/${res.data.examId}/attempts`);
			navigate(`/student/exam/${attemptRes.data.attempt.id}?mode=practice`);
		} catch (err) {
			message.error(err.response?.data?.error || 'Failed to create retest');
		}
		setCreatingRetest(false);
	};

	const startQuickPractice = (mistake) => {
		setPracticeQuestion(mistake.question);
		setPracticeAnswer(null);
		setShowPracticeResult(false);
	};

	const handlePracticeAnswer = async (optionId) => {
		setPracticeAnswer(optionId);
		setShowPracticeResult(true);
		
		const isCorrect = practiceQuestion?.options?.find(o => o.id === optionId)?.isCorrect;
		
		// Mark as retested
		try {
			await api.put(`/api/exams/mistakes/${practiceQuestion.id}/retest`, { correct: isCorrect });
			// Update local state
			setMistakes(prev => prev.map(m => 
				m.questionId === practiceQuestion.id 
					? { ...m, retested: true, retestedCorrect: isCorrect }
					: m
			));
		} catch {}
	};

	const filteredMistakes = activeTab === 'all' 
		? mistakes 
		: activeTab === 'unreviewed' 
			? mistakes.filter(m => !m.retested)
			: mistakes.filter(m => m.retested);

	const difficultyColors = {
		EASY: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
		MEDIUM: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
		HARD: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' }
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
				<div>
					<Typography.Title level={2} className="!mb-1 flex items-center gap-3">
						<span className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
							<ExclamationCircleOutlined className="text-white text-lg" />
						</span>
						My Mistakes
					</Typography.Title>
					<Typography.Text className="text-slate-500">
						Review and retest questions you got wrong
					</Typography.Text>
				</div>
				<Space>
					<Button 
						icon={<ReloadOutlined />} 
						onClick={loadMistakes}
						className="rounded-xl"
					>
						Refresh
					</Button>
					<Button 
						type="primary"
						icon={<RocketOutlined />}
						onClick={() => setRetestModalOpen(true)}
						disabled={stats.unreviewedCount === 0}
						className="rounded-xl"
						style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
					>
						Start Retest ({stats.unreviewedCount})
					</Button>
				</Space>
			</div>

			{/* Stats Cards */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<Card className="border-0 shadow-md" style={{ borderRadius: 16 }}>
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center">
							<CloseCircleOutlined className="text-white text-xl" />
						</div>
						<div>
							<Typography.Text className="text-slate-500 text-sm">Total Mistakes</Typography.Text>
							<Typography.Title level={3} className="!m-0">{stats.total}</Typography.Title>
						</div>
					</div>
				</Card>
				<Card className="border-0 shadow-md" style={{ borderRadius: 16 }}>
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
							<ClockCircleOutlined className="text-white text-xl" />
						</div>
						<div>
							<Typography.Text className="text-slate-500 text-sm">Pending Review</Typography.Text>
							<Typography.Title level={3} className="!m-0">{stats.unreviewedCount}</Typography.Title>
						</div>
					</div>
				</Card>
				<Card className="border-0 shadow-md" style={{ borderRadius: 16 }}>
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
							<CheckCircleOutlined className="text-white text-xl" />
						</div>
						<div>
							<Typography.Text className="text-slate-500 text-sm">Reviewed</Typography.Text>
							<Typography.Title level={3} className="!m-0">{stats.total - stats.unreviewedCount}</Typography.Title>
						</div>
					</div>
				</Card>
			</div>

			{/* Tabs */}
			<Tabs
				activeKey={activeTab}
				onChange={setActiveTab}
				items={[
					{ key: 'all', label: `All (${mistakes.length})` },
					{ key: 'unreviewed', label: `Pending (${stats.unreviewedCount})` },
					{ key: 'reviewed', label: `Reviewed (${stats.total - stats.unreviewedCount})` }
				]}
			/>

			{/* Mistakes List */}
			{loading ? (
				<div className="flex justify-center py-12">
					<Spin size="large" />
				</div>
			) : filteredMistakes.length === 0 ? (
				<Card className="border-0 shadow-md text-center py-12" style={{ borderRadius: 20 }}>
					<Empty
						image={Empty.PRESENTED_IMAGE_SIMPLE}
						description={
							<div className="space-y-2">
								<Typography.Text className="text-slate-500 block">
									{activeTab === 'all' 
										? "No mistakes yet! Keep practicing."
										: activeTab === 'unreviewed'
											? "All mistakes reviewed!"
											: "No reviewed mistakes yet"
									}
								</Typography.Text>
							</div>
						}
					/>
				</Card>
			) : (
				<div className="space-y-4">
					<AnimatePresence>
						{filteredMistakes.map((mistake, idx) => {
							const q = mistake.question;
							const diffStyle = difficultyColors[q?.difficulty] || difficultyColors.MEDIUM;
							
							return (
								<motion.div
									key={mistake.id}
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, x: -100 }}
									transition={{ delay: idx * 0.03 }}
								>
									<Card
										className={`border-0 shadow-md overflow-hidden ${mistake.retested ? 'opacity-75' : ''}`}
										style={{ borderRadius: 16 }}
										styles={{ body: { padding: 0 } }}
									>
										{/* Header */}
										<div 
											className="px-5 py-3 flex items-center justify-between"
											style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)' }}
										>
											<div className="flex items-center gap-3">
												<Tag 
													style={{ 
														background: diffStyle.bg, 
														color: diffStyle.text, 
														border: `1px solid ${diffStyle.border}`,
														borderRadius: 8 
													}}
												>
													{q?.difficulty || 'MEDIUM'}
												</Tag>
												{q?.topic?.name && (
													<Tag className="bg-white/10 text-white border-0 rounded-lg">
														<BookOutlined className="mr-1" />
														{q.topic.name}
													</Tag>
												)}
											</div>
											<div className="flex items-center gap-2">
												{mistake.retested && (
													<Tag 
														className="border-0 rounded-full"
														style={{ 
															background: mistake.retestedCorrect ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
															color: mistake.retestedCorrect ? '#4ade80' : '#f87171'
														}}
													>
														{mistake.retestedCorrect ? <CheckCircleOutlined className="mr-1" /> : <CloseCircleOutlined className="mr-1" />}
														{mistake.retestedCorrect ? 'Got it right!' : 'Still learning'}
													</Tag>
												)}
												<Tooltip title="Remove from mistakes">
													<Button
														type="text"
														size="small"
														icon={<DeleteOutlined />}
														onClick={() => handleDelete(mistake.questionId)}
														className="text-white/60 hover:text-white"
													/>
												</Tooltip>
											</div>
										</div>

										{/* Body */}
										<div className="p-5">
											<Typography.Paragraph className="text-slate-800 font-medium !mb-4 text-base">
												{q?.stem}
											</Typography.Paragraph>

											{/* Quick Practice Button */}
											{!mistake.retested && (
												<Button
													type="primary"
													icon={<FireOutlined />}
													onClick={() => startQuickPractice(mistake)}
													className="rounded-xl"
													style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}
												>
													Quick Practice
												</Button>
											)}
										</div>
									</Card>
								</motion.div>
							);
						})}
					</AnimatePresence>
				</div>
			)}

			{/* Retest Configuration Modal */}
			<Modal
				title={
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
							<RocketOutlined className="text-white text-lg" />
						</div>
						<div>
							<Typography.Text className="text-slate-500 text-xs block">Create</Typography.Text>
							<Typography.Text className="font-semibold text-lg">Retest Exam</Typography.Text>
						</div>
					</div>
				}
				open={retestModalOpen}
				onCancel={() => setRetestModalOpen(false)}
				footer={null}
				width={480}
			>
				<div className="py-4 space-y-6">
					<div>
						<Typography.Text className="text-slate-600 block mb-3">Number of Questions</Typography.Text>
						<Radio.Group 
							value={retestConfig.questionCount}
							onChange={e => setRetestConfig(prev => ({ ...prev, questionCount: e.target.value }))}
							className="w-full"
						>
							<Space direction="vertical" className="w-full">
								{[5, 10, 20, stats.unreviewedCount].filter((v, i, arr) => arr.indexOf(v) === i && v <= stats.unreviewedCount).map(count => (
									<Radio key={count} value={count} className="w-full p-3 border rounded-xl hover:bg-slate-50">
										{count === stats.unreviewedCount ? `All (${count})` : `${count} questions`}
									</Radio>
								))}
							</Space>
						</Radio.Group>
					</div>

					<div>
						<Typography.Text className="text-slate-600 block mb-3">Time Limit</Typography.Text>
						<Radio.Group 
							value={retestConfig.timeLimitMinutes}
							onChange={e => setRetestConfig(prev => ({ ...prev, timeLimitMinutes: e.target.value }))}
							className="w-full"
						>
							<Space wrap>
								{[10, 20, 30, 45, 60].map(mins => (
									<Radio.Button key={mins} value={mins} className="rounded-lg">
										{mins} min
									</Radio.Button>
								))}
							</Space>
						</Radio.Group>
					</div>

					<Button
						type="primary"
						size="large"
						block
						loading={creatingRetest}
						onClick={handleCreateRetest}
						className="h-12 rounded-xl font-semibold"
						style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
					>
						Start Retest
					</Button>
				</div>
			</Modal>

			{/* Quick Practice Modal */}
			<Modal
				title={null}
				open={!!practiceQuestion}
				onCancel={() => setPracticeQuestion(null)}
				footer={null}
				width={600}
				centered
				styles={{ body: { padding: 0 } }}
			>
				{practiceQuestion && (
					<div>
						<div 
							className="p-5"
							style={{ background: 'linear-gradient(135deg, #102540 0%, #1e3a5f 100%)' }}
						>
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
									<FireOutlined className="text-white text-lg" />
								</div>
								<div>
									<Typography.Text className="text-white/60 text-xs block">Quick Practice</Typography.Text>
									<Typography.Text className="text-white font-semibold">Answer this question</Typography.Text>
								</div>
							</div>
						</div>

						<div className="p-6">
							<Typography.Paragraph className="text-slate-800 font-medium text-base !mb-6">
								{practiceQuestion.stem}
							</Typography.Paragraph>

							<Radio.Group 
								value={practiceAnswer}
								onChange={e => !showPracticeResult && handlePracticeAnswer(e.target.value)}
								className="w-full"
								disabled={showPracticeResult}
							>
								<Space direction="vertical" size={12} className="w-full">
									{practiceQuestion.options?.map((opt, idx) => {
										const letters = ['A', 'B', 'C', 'D', 'E'];
										const isSelected = practiceAnswer === opt.id;
										const isCorrect = opt.isCorrect;
										const showAsCorrect = showPracticeResult && isCorrect;
										const showAsWrong = showPracticeResult && isSelected && !isCorrect;

										return (
											<Radio
												key={opt.id}
												value={opt.id}
												className={`
													w-full p-4 rounded-xl border-2 transition-all
													${showAsCorrect
														? 'border-emerald-400 bg-emerald-50'
														: showAsWrong
															? 'border-red-400 bg-red-50'
															: isSelected
																? 'border-blue-400 bg-blue-50'
																: 'border-slate-200 hover:border-slate-300'
													}
												`}
											>
												<div className="flex items-center gap-3">
													<span className={`
														w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm
														${showAsCorrect
															? 'bg-emerald-500 text-white'
															: showAsWrong
																? 'bg-red-500 text-white'
																: isSelected
																	? 'bg-blue-500 text-white'
																	: 'bg-slate-100 text-slate-600'
														}
													`}>
														{showAsCorrect ? <CheckCircleOutlined /> : showAsWrong ? <CloseCircleOutlined /> : letters[idx]}
													</span>
													<span className={showAsWrong ? 'text-red-700' : showAsCorrect ? 'text-emerald-700 font-medium' : 'text-slate-700'}>
														{opt.text}
													</span>
												</div>
											</Radio>
										);
									})}
								</Space>
							</Radio.Group>

							{/* Result & Explanation */}
							{showPracticeResult && (
								<motion.div
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									className="mt-6"
								>
									<div className={`p-4 rounded-xl ${practiceQuestion.options.find(o => o.id === practiceAnswer)?.isCorrect ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
										<div className="flex items-center gap-2 mb-2">
											{practiceQuestion.options.find(o => o.id === practiceAnswer)?.isCorrect ? (
												<>
													<CheckCircleOutlined className="text-emerald-600" />
													<Typography.Text className="text-emerald-700 font-semibold">Correct!</Typography.Text>
												</>
											) : (
												<>
													<CloseCircleOutlined className="text-red-600" />
													<Typography.Text className="text-red-700 font-semibold">Incorrect</Typography.Text>
												</>
											)}
										</div>
										{practiceQuestion.workedSolution && (
											<Typography.Paragraph className="text-slate-600 !mb-0 text-sm">
												{practiceQuestion.workedSolution}
											</Typography.Paragraph>
										)}
									</div>

									<Button
										type="primary"
										block
										onClick={() => setPracticeQuestion(null)}
										className="mt-4 h-11 rounded-xl"
										style={{ background: '#102540' }}
									>
										Continue
									</Button>
								</motion.div>
							)}
						</div>
					</div>
				)}
			</Modal>
		</div>
	);
}
