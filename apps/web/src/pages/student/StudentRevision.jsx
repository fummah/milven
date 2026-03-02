import { useEffect, useState } from 'react';
import { Card, Typography, Button, Space, Tag, Empty, Spin, Modal, Input, Select, message, Tooltip, Collapse, Tabs } from 'antd';
import { 
	BookOutlined, 
	ReloadOutlined, 
	DeleteOutlined, 
	CheckCircleOutlined,
	StarOutlined,
	StarFilled,
	EditOutlined,
	BulbOutlined,
	FileTextOutlined,
	ExperimentOutlined
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api';

export default function StudentRevision() {
	const [loading, setLoading] = useState(true);
	const [entries, setEntries] = useState([]);
	const [stats, setStats] = useState({ total: 0, unreviewedCount: 0 });
	const [activeTab, setActiveTab] = useState('all');
	const [editingNote, setEditingNote] = useState(null);
	const [noteText, setNoteText] = useState('');

	useEffect(() => {
		loadRevision();
	}, []);

	const loadRevision = async () => {
		setLoading(true);
		try {
			const res = await api.get('/api/exams/revision/me');
			setEntries(res.data.entries || []);
			setStats({ total: res.data.total || 0, unreviewedCount: res.data.unreviewedCount || 0 });
		} catch {
			message.error('Failed to load revision list');
		}
		setLoading(false);
	};

	const handleDelete = async (questionId) => {
		try {
			await api.delete(`/api/exams/revision/${questionId}`);
			setEntries(prev => prev.filter(e => e.questionId !== questionId));
			message.success('Removed from revision list');
		} catch {
			message.error('Failed to remove');
		}
	};

	const handleMarkReviewed = async (questionId) => {
		try {
			await api.put(`/api/exams/revision/${questionId}`, { reviewed: true });
			setEntries(prev => prev.map(e => 
				e.questionId === questionId ? { ...e, reviewed: true } : e
			));
			message.success('Marked as reviewed');
		} catch {
			message.error('Failed to update');
		}
	};

	const handleUpdatePriority = async (questionId, priority) => {
		try {
			await api.put(`/api/exams/revision/${questionId}`, { priority });
			setEntries(prev => prev.map(e => 
				e.questionId === questionId ? { ...e, priority } : e
			));
		} catch {
			message.error('Failed to update priority');
		}
	};

	const handleSaveNote = async (questionId) => {
		try {
			await api.put(`/api/exams/revision/${questionId}`, { note: noteText });
			setEntries(prev => prev.map(e => 
				e.questionId === questionId ? { ...e, note: noteText } : e
			));
			setEditingNote(null);
			setNoteText('');
			message.success('Note saved');
		} catch {
			message.error('Failed to save note');
		}
	};

	const filteredEntries = activeTab === 'all' 
		? entries 
		: activeTab === 'pending' 
			? entries.filter(e => !e.reviewed)
			: activeTab === 'high'
				? entries.filter(e => e.priority === 3)
				: entries.filter(e => e.reviewed);

	const priorityConfig = {
		1: { label: 'Low', color: '#64748b', bg: '#f1f5f9' },
		2: { label: 'Medium', color: '#f59e0b', bg: '#fef3c7' },
		3: { label: 'High', color: '#ef4444', bg: '#fee2e2' }
	};

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
						<span className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
							<BookOutlined className="text-white text-lg" />
						</span>
						Revision List
					</Typography.Title>
					<Typography.Text className="text-slate-500">
						Questions saved for focused review
					</Typography.Text>
				</div>
				<Button 
					icon={<ReloadOutlined />} 
					onClick={loadRevision}
					className="rounded-xl"
				>
					Refresh
				</Button>
			</div>

			{/* Stats Cards */}
			<div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
				<Card className="border-0 shadow-md" style={{ borderRadius: 16 }}>
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center">
							<BookOutlined className="text-white text-xl" />
						</div>
						<div>
							<Typography.Text className="text-slate-500 text-sm">Total Items</Typography.Text>
							<Typography.Title level={3} className="!m-0">{stats.total}</Typography.Title>
						</div>
					</div>
				</Card>
				<Card className="border-0 shadow-md" style={{ borderRadius: 16 }}>
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
							<StarOutlined className="text-white text-xl" />
						</div>
						<div>
							<Typography.Text className="text-slate-500 text-sm">Pending Review</Typography.Text>
							<Typography.Title level={3} className="!m-0">{stats.unreviewedCount}</Typography.Title>
						</div>
					</div>
				</Card>
				<Card className="border-0 shadow-md" style={{ borderRadius: 16 }}>
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center">
							<StarFilled className="text-white text-xl" />
						</div>
						<div>
							<Typography.Text className="text-slate-500 text-sm">High Priority</Typography.Text>
							<Typography.Title level={3} className="!m-0">{entries.filter(e => e.priority === 3).length}</Typography.Title>
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
					{ key: 'all', label: `All (${entries.length})` },
					{ key: 'pending', label: `Pending (${stats.unreviewedCount})` },
					{ key: 'high', label: `High Priority (${entries.filter(e => e.priority === 3).length})` },
					{ key: 'reviewed', label: `Reviewed (${stats.total - stats.unreviewedCount})` }
				]}
			/>

			{/* Revision List */}
			{loading ? (
				<div className="flex justify-center py-12">
					<Spin size="large" />
				</div>
			) : filteredEntries.length === 0 ? (
				<Card className="border-0 shadow-md text-center py-12" style={{ borderRadius: 20 }}>
					<Empty
						image={Empty.PRESENTED_IMAGE_SIMPLE}
						description={
							<Typography.Text className="text-slate-500">
								{activeTab === 'all' 
									? "No items in revision list yet"
									: "No items match this filter"
								}
							</Typography.Text>
						}
					/>
				</Card>
			) : (
				<div className="space-y-4">
					<AnimatePresence>
						{filteredEntries.map((entry, idx) => {
							const q = entry.question;
							const diffStyle = difficultyColors[q?.difficulty] || difficultyColors.MEDIUM;
							const prioConfig = priorityConfig[entry.priority] || priorityConfig[1];

							return (
								<motion.div
									key={entry.id}
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, x: -100 }}
									transition={{ delay: idx * 0.03 }}
								>
									<Card
										className={`border-0 shadow-md overflow-hidden ${entry.reviewed ? 'opacity-60' : ''}`}
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
														background: prioConfig.bg, 
														color: prioConfig.color, 
														border: 'none',
														borderRadius: 8 
													}}
												>
													<StarFilled className="mr-1" />
													{prioConfig.label}
												</Tag>
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
														{q.topic.name}
													</Tag>
												)}
											</div>
											<div className="flex items-center gap-2">
												{entry.reviewed && (
													<Tag className="bg-emerald-500/20 text-emerald-400 border-0 rounded-full">
														<CheckCircleOutlined className="mr-1" /> Reviewed
													</Tag>
												)}
												<Select
													size="small"
													value={entry.priority}
													onChange={(val) => handleUpdatePriority(entry.questionId, val)}
													options={[
														{ value: 1, label: 'Low' },
														{ value: 2, label: 'Medium' },
														{ value: 3, label: 'High' }
													]}
													className="w-24"
												/>
												<Tooltip title="Remove">
													<Button
														type="text"
														size="small"
														icon={<DeleteOutlined />}
														onClick={() => handleDelete(entry.questionId)}
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

											{/* Collapsible Content */}
											<Collapse
												ghost
												items={[
													{
														key: 'details',
														label: <span className="text-slate-600 font-medium">View Details & Answer</span>,
														children: (
															<div className="space-y-4 pt-2">
																{/* Options */}
																{q?.options?.map((opt, optIdx) => {
																	const letters = ['A', 'B', 'C', 'D', 'E'];
																	return (
																		<div 
																			key={opt.id}
																			className={`p-3 rounded-xl border ${opt.isCorrect ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}
																		>
																			<div className="flex items-start gap-3">
																				<span className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${opt.isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
																					{opt.isCorrect ? <CheckCircleOutlined /> : letters[optIdx]}
																				</span>
																				<span className={opt.isCorrect ? 'text-emerald-700 font-medium' : 'text-slate-600'}>
																					{opt.text}
																				</span>
																			</div>
																		</div>
																	);
																})}

																{/* Explanation */}
																{q?.workedSolution && (
																	<div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
																		<div className="flex items-center gap-2 mb-2">
																			<BulbOutlined className="text-amber-500" />
																			<Typography.Text className="text-amber-700 font-semibold text-sm">Explanation</Typography.Text>
																		</div>
																		<Typography.Paragraph className="!mb-0 text-slate-700 whitespace-pre-wrap">
																			{q.workedSolution}
																		</Typography.Paragraph>
																	</div>
																)}

																{/* LOS & Section */}
																{(q?.los || q?.traceSection) && (
																	<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
																		{q?.los && (
																			<div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
																				<Typography.Text className="text-blue-600 text-xs font-semibold block mb-1">
																					<FileTextOutlined className="mr-1" /> LOS Reference
																				</Typography.Text>
																				<Typography.Text className="text-slate-700 text-sm">{q.los}</Typography.Text>
																			</div>
																		)}
																		{q?.traceSection && (
																			<div className="p-3 bg-purple-50 rounded-xl border border-purple-200">
																				<Typography.Text className="text-purple-600 text-xs font-semibold block mb-1">
																					<BookOutlined className="mr-1" /> Section
																				</Typography.Text>
																				<Typography.Text className="text-slate-700 text-sm">
																					{q.traceSection}
																					{q?.tracePage && ` (p. ${q.tracePage})`}
																				</Typography.Text>
																			</div>
																		)}
																	</div>
																)}

																{/* Key Formulas */}
																{q?.keyFormulas && (
																	<div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200">
																		<Typography.Text className="text-indigo-600 text-xs font-semibold block mb-1">
																			<ExperimentOutlined className="mr-1" /> Key Formulas
																		</Typography.Text>
																		<Typography.Text className="text-slate-700 font-mono text-sm whitespace-pre-wrap">
																			{q.keyFormulas}
																		</Typography.Text>
																	</div>
																)}
															</div>
														)
													}
												]}
											/>

											{/* Note */}
											{editingNote === entry.questionId ? (
												<div className="mt-4 flex gap-2">
													<Input.TextArea
														value={noteText}
														onChange={e => setNoteText(e.target.value)}
														placeholder="Add a note..."
														autoSize={{ minRows: 2 }}
														className="rounded-xl"
													/>
													<Space direction="vertical">
														<Button 
															type="primary" 
															size="small"
															onClick={() => handleSaveNote(entry.questionId)}
															className="rounded-lg"
														>
															Save
														</Button>
														<Button 
															size="small"
															onClick={() => { setEditingNote(null); setNoteText(''); }}
															className="rounded-lg"
														>
															Cancel
														</Button>
													</Space>
												</div>
											) : entry.note ? (
												<div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
													<div className="flex items-start justify-between">
														<div>
															<Typography.Text className="text-slate-500 text-xs block mb-1">Your Note</Typography.Text>
															<Typography.Text className="text-slate-700">{entry.note}</Typography.Text>
														</div>
														<Button
															type="text"
															size="small"
															icon={<EditOutlined />}
															onClick={() => { setEditingNote(entry.questionId); setNoteText(entry.note || ''); }}
														/>
													</div>
												</div>
											) : null}

											{/* Actions */}
											<div className="mt-4 flex items-center gap-2">
												{!entry.note && editingNote !== entry.questionId && (
													<Button
														size="small"
														icon={<EditOutlined />}
														onClick={() => { setEditingNote(entry.questionId); setNoteText(''); }}
														className="rounded-lg"
													>
														Add Note
													</Button>
												)}
												{!entry.reviewed && (
													<Button
														type="primary"
														size="small"
														icon={<CheckCircleOutlined />}
														onClick={() => handleMarkReviewed(entry.questionId)}
														className="rounded-lg"
														style={{ background: '#10b981' }}
													>
														Mark as Reviewed
													</Button>
												)}
											</div>
										</div>
									</Card>
								</motion.div>
							);
						})}
					</AnimatePresence>
				</div>
			)}
		</div>
	);
}
