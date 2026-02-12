import { Card, Row, Col, Typography } from 'antd';

export function Dashboard() {
	return (
		<div>
			<Typography.Title level={2}>Welcome to Mutingwende</Typography.Title>
			<Typography.Paragraph>
				Build your CFA exam readiness with practice exams, lectures, and analytics.
			</Typography.Paragraph>
			<Row gutter={[16, 16]}>
				<Col xs={24} md={12} lg={8}>
					<Card title="Practice Exams">Level I, II, and III exam prep (coming soon).</Card>
				</Col>
				<Col xs={24} md={12} lg={8}>
					<Card title="Video Lectures">Topic-based lectures and progress tracking.</Card>
				</Col>
				<Col xs={24} md={12} lg={8}>
					<Card title="Performance Analytics">Detailed insights post-exam.</Card>
				</Col>
			</Row>
		</div>
	);
}


