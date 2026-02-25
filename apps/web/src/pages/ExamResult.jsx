import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, Typography, Table, Button, Space, Collapse } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ArrowLeftOutlined, BulbOutlined, CalculatorOutlined } from '@ant-design/icons';

export function ExamResult() {
	const { attemptId } = useParams();
	const navigate = useNavigate();
	const [attempt, setAttempt] = useState(null);
	const [topics, setTopics] = useState([]);

	useEffect(() => {
		let mounted = true;
		(async () => {
			const [a, analytics] = await Promise.all([
				api.get(`/api/exams/attempts/${attemptId}`),
				api.get(`/api/exams/attempts/${attemptId}/analytics`)
			]);
			if (mounted) {
				setAttempt(a.data.attempt);
				setTopics(analytics.data.byTopic);
			}
		})();
		return () => {
			mounted = false;
		};
	}, [attemptId]);

	if (!attempt) return null;

	const answers = attempt.answers || [];
	const correctOption = (opts) => (opts || []).find((o) => o.isCorrect);
	const yourOptionText = (a) => a?.selectedOption?.text ?? '—';
	const correctOptionText = (a) => (correctOption(a?.question?.options)?.text) ?? '—';

	return (
		<div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
			<Space direction="vertical" size={24} style={{ width: '100%' }}>
				<Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
					Back
				</Button>
				<Card title="Quiz / Exam Result">
					<Typography.Title level={3} style={{ marginTop: 0 }}>
						Score: {Math.round(attempt.scorePercent ?? 0)}%
					</Typography.Title>
					{topics.length > 0 && (
						<>
							<Typography.Text type="secondary">By topic</Typography.Text>
							<Table
								rowKey="topic"
								dataSource={topics}
								columns={[
									{ title: 'Topic', dataIndex: 'topic' },
									{ title: 'Correct', dataIndex: 'correct' },
									{ title: 'Total', dataIndex: 'total' },
									{
										title: 'Percent',
										render: (_, r) => `${Math.round(r.percent)}%`
									}
								]}
								pagination={false}
								size="small"
								style={{ marginTop: 8 }}
							/>
						</>
					)}
				</Card>

				<Card title="Correct answers">
					<Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
						Review each question with the correct answer and your answer.
					</Typography.Paragraph>
					{answers.length === 0 ? (
						<Typography.Text type="secondary">No answers to review.</Typography.Text>
					) : (
						<Space direction="vertical" size={16} style={{ width: '100%' }}>
							{answers.map((a, idx) => {
								const correct = a.isCorrect === true;
								const correctText = correctOptionText(a);
								const yourText = yourOptionText(a);
								const keyFormulas = a?.question?.keyFormulas;
								const workedSolution = a?.question?.workedSolution;
								const traceSection = a?.question?.traceSection;
								const tracePage = a?.question?.tracePage;
								const hasExplanation = keyFormulas || workedSolution || traceSection || tracePage;
								return (
									<div key={a.id || idx} style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
										<Typography.Text strong>Question {idx + 1}</Typography.Text>
										<Typography.Paragraph style={{ margin: '8px 0 4px' }}>{a?.question?.stem}</Typography.Paragraph>
										<Space direction="vertical" size={4} style={{ width: '100%' }}>
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
											{hasExplanation && (
												<Collapse
													size="small"
													style={{ marginTop: 8, background: '#fafafa' }}
													items={[{
														key: 'explanation',
														label: <span><BulbOutlined style={{ marginRight: 6 }} />View Explanation</span>,
														children: (
															<Space direction="vertical" size={12} style={{ width: '100%' }}>
																{(traceSection || tracePage) && (
																	<div>
																		<Typography.Text strong style={{ color: '#722ed1' }}>Reference: </Typography.Text>
																		<Typography.Text>
																			{traceSection && <span>{traceSection}</span>}
																			{traceSection && tracePage && <span>, </span>}
																			{tracePage && <span>Page {tracePage}</span>}
																		</Typography.Text>
																	</div>
																)}
																{keyFormulas && (
																	<div>
																		<Space align="start">
																			<CalculatorOutlined style={{ color: '#1890ff', marginTop: 4 }} />
																			<div>
																				<Typography.Text strong style={{ color: '#1890ff' }}>Key Formula(s)</Typography.Text>
																				<Typography.Paragraph 
																					style={{ 
																						margin: '4px 0 0 0', 
																						padding: '8px 12px', 
																						background: '#f0f5ff', 
																						borderRadius: 4,
																						fontFamily: 'monospace',
																						fontSize: 13,
																						whiteSpace: 'pre-wrap'
																					}}
																				>
																					{keyFormulas}
																				</Typography.Paragraph>
																			</div>
																		</Space>
																	</div>
																)}
																{workedSolution && (
																	<div>
																		<Space align="start">
																			<BulbOutlined style={{ color: '#52c41a', marginTop: 4 }} />
																			<div>
																				<Typography.Text strong style={{ color: '#52c41a' }}>Worked Solution</Typography.Text>
																				<Typography.Paragraph 
																					style={{ 
																						margin: '4px 0 0 0', 
																						padding: '8px 12px', 
																						background: '#f6ffed', 
																						borderRadius: 4,
																						whiteSpace: 'pre-wrap'
																					}}
																				>
																					{workedSolution}
																				</Typography.Paragraph>
																			</div>
																		</Space>
																	</div>
																)}
															</Space>
														)
													}]}
												/>
											)}
										</Space>
									</div>
								);
							})}
						</Space>
					)}
				</Card>
			</Space>
		</div>
	);
}


