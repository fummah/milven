import { Card, Row, Col, Typography, List, Space } from 'antd';
import {
	TrophyOutlined,
	ReadOutlined,
	CalendarOutlined,
	GlobalOutlined,
	SafetyCertificateOutlined,
	CheckCircleOutlined,
	LinkOutlined
} from '@ant-design/icons';
import { motion } from 'framer-motion';

const levels = [
	{ level: 'Level I', focus: 'Foundations: ethics, quant, economics, FRA, equity, fixed income, derivatives, alternatives, portfolio basics.' },
	{ level: 'Level II', focus: 'Asset valuation and application. Deeper analysis and case-based thinking.' },
	{ level: 'Level III', focus: 'Portfolio management and wealth planning. Synthesis and decision-making.' }
];

const curriculumAreas = [
	'Ethical and Professional Standards',
	'Quantitative Methods',
	'Economics',
	'Financial Statement Analysis',
	'Corporate Issuers',
	'Equity Investments',
	'Fixed Income',
	'Derivatives',
	'Alternative Investments',
	'Portfolio Management'
];

export function AboutCfa() {
	return (
		<div className="min-h-screen bg-gray-50/50">
			{/* Hero */}
			<section
				className="relative overflow-hidden rounded-b-2xl px-6 py-16 md:py-20 text-center"
				style={{
					background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 40%, #2563eb 100%)',
					color: '#fff',
					boxShadow: '0 12px 40px rgba(16, 37, 64, 0.25)'
				}}
			>
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
					className="max-w-3xl mx-auto"
				>
					<div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 mb-6">
						<TrophyOutlined style={{ fontSize: 28 }} />
					</div>
					<Typography.Title level={1} style={{ color: '#fff', marginBottom: 12, fontWeight: 700 }}>
						About the CFA® Program
					</Typography.Title>
					<Typography.Paragraph style={{ color: 'rgba(255,255,255,0.9)', fontSize: 18, marginBottom: 0 }}>
						The Chartered Financial Analyst® (CFA) designation is the most respected credential in investment management globally.
					</Typography.Paragraph>
				</motion.div>
			</section>

			{/* What is the CFA Program */}
			<section className="max-w-4xl mx-auto px-4 py-12">
				<Card bordered={false} className="shadow-md" style={{ borderRadius: 20 }} styles={{ body: { padding: 32 } }}>
					<Typography.Title level={4} style={{ color: '#102540', marginBottom: 16 }}>
						What is the CFA Program?
					</Typography.Title>
					<Typography.Paragraph style={{ fontSize: 15, lineHeight: 1.8, color: '#525252' }}>
						The CFA Program is a globally recognized, graduate-level curriculum that equips investment professionals with the knowledge and skills needed in today’s markets. It covers ethical standards, quantitative methods, economics, financial reporting, equity and fixed income analysis, derivatives, alternatives, and portfolio management. The program is administered by <Typography.Link href="https://www.cfainstitute.org/" target="_blank" rel="noopener noreferrer">CFA Institute</Typography.Link>, a not-for-profit organization that promotes the highest standards of ethics, education, and professional excellence in the investment industry.
					</Typography.Paragraph>
				</Card>
			</section>

			{/* Three levels */}
			<section className="max-w-6xl mx-auto px-4 py-8">
				<Typography.Title level={3} style={{ color: '#102540', marginBottom: 24, textAlign: 'center' }}>
					Three levels
				</Typography.Title>
				<Row gutter={[20, 20]}>
					{levels.map((item, idx) => (
						<Col xs={24} md={8} key={idx}>
							<motion.div
								initial={{ opacity: 0, y: 14 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true }}
								transition={{ delay: idx * 0.08, duration: 0.4 }}
							>
								<Card
									bordered={false}
									className="h-full shadow-sm"
									style={{ borderRadius: 16 }}
									styles={{ body: { padding: 24 } }}
								>
									<div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[#102540] text-white mb-3">
										<ReadOutlined style={{ fontSize: 18 }} />
									</div>
									<Typography.Title level={5} style={{ marginBottom: 8, color: '#102540' }}>
										{item.level}
									</Typography.Title>
									<Typography.Text type="secondary" style={{ fontSize: 14, lineHeight: 1.6 }}>
										{item.focus}
									</Typography.Text>
								</Card>
							</motion.div>
						</Col>
					))}
				</Row>
			</section>

			{/* Curriculum areas */}
			<section className="max-w-4xl mx-auto px-4 py-8">
				<Card bordered={false} className="shadow-md" style={{ borderRadius: 20 }} styles={{ body: { padding: 28 } }}>
					<Typography.Title level={4} style={{ color: '#102540', marginBottom: 16 }}>
						Curriculum areas
					</Typography.Title>
					<List
						grid={{ gutter: 12, xs: 1, sm: 2 }}
						dataSource={curriculumAreas}
						renderItem={(item) => (
							<List.Item>
								<Space>
									<CheckCircleOutlined style={{ color: '#16a34a' }} />
									<span style={{ fontSize: 14 }}>{item}</span>
								</Space>
							</List.Item>
						)}
					/>
				</Card>
			</section>

			{/* Exam format */}
			<section className="max-w-4xl mx-auto px-4 py-8">
				<Card bordered={false} className="shadow-md" style={{ borderRadius: 20 }} styles={{ body: { padding: 28 } }}>
					<Typography.Title level={4} style={{ color: '#102540', marginBottom: 16 }}>
						<CalendarOutlined style={{ marginRight: 8 }} />
						Exam format
					</Typography.Title>
					<ul style={{ paddingLeft: 20, margin: 0, lineHeight: 2, color: '#525252', fontSize: 15 }}>
						<li>Exams are <strong>computer-based</strong>.</li>
						<li><strong>Level I</strong> is offered in multiple windows throughout the year.</li>
						<li><strong>Level II and III</strong> are typically offered in specific exam windows (e.g. once or twice per year).</li>
						<li>Candidates are recommended to invest roughly <strong>300 hours</strong> of study per level.</li>
					</ul>
				</Card>
			</section>

			{/* Ethics & official info */}
			<section className="max-w-4xl mx-auto px-4 py-8 pb-20">
				<Card
					bordered={false}
					className="shadow-md"
					style={{ borderRadius: 20, background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)' }}
					styles={{ body: { padding: 28 } }}
				>
					<Space align="start" size="middle">
						<div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#102540] text-white">
							<SafetyCertificateOutlined style={{ fontSize: 22 }} />
						</div>
						<div>
							<Typography.Title level={5} style={{ marginBottom: 8, color: '#102540' }}>
								Ethics and official information
							</Typography.Title>
							<Typography.Paragraph style={{ marginBottom: 12, fontSize: 14, lineHeight: 1.7 }}>
								The CFA Program places strong emphasis on the Code of Ethics and Standards of Professional Conduct. For official curriculum, exam dates, fees, and policies, always refer to CFA Institute.
							</Typography.Paragraph>
							<Typography.Link
								href="https://www.cfainstitute.org/en/programs/cfa"
								target="_blank"
								rel="noopener noreferrer"
								style={{ fontSize: 15 }}
							>
								<GlobalOutlined style={{ marginRight: 6 }} />
								CFA Program at CFA Institute
								<LinkOutlined style={{ marginLeft: 4 }} />
							</Typography.Link>
						</div>
					</Space>
				</Card>
			</section>
		</div>
	);
}
