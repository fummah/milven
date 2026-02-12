import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, Typography, Table, Button, Space } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, ArrowLeftOutlined } from '@ant-design/icons';

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
							})}
						</Space>
					)}
				</Card>
			</Space>
		</div>
	);
}


