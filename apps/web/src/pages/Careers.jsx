import { Card, Row, Col, Typography, Tag } from 'antd';
import {
	RocketOutlined,
	TeamOutlined,
	ReadOutlined,
	BulbOutlined,
	CheckCircleOutlined,
	RiseOutlined,
	LinkedinOutlined,
	MailOutlined
} from '@ant-design/icons';
import { motion } from 'framer-motion';

const tips = [
	{
		icon: <ReadOutlined />,
		title: 'Build your profile',
		desc: 'Complete your courses and certifications so employers can see your qualifications at a glance.'
	},
	{
		icon: <RiseOutlined />,
		title: 'Tailor your applications',
		desc: 'Match your skills and experience to each role. Use keywords from the job description.'
	},
	{
		icon: <TeamOutlined />,
		title: 'Network actively',
		desc: 'Connect with professionals in your field. Many opportunities come through referrals.'
	},
	{
		icon: <BulbOutlined />,
		title: 'Prepare for interviews',
		desc: 'Research the company, practice common questions, and prepare questions to ask them.'
	}
];

const resources = [
	{ label: 'LinkedIn', icon: <LinkedinOutlined />, href: 'https://linkedin.com', color: '#0a66c2' },
	{ label: 'CFA Institute Career Insights', icon: <RiseOutlined />, href: 'https://www.cfainstitute.org/en/community/career', color: '#102540' },
	{ label: 'Job boards', icon: <MailOutlined />, href: '#', color: '#102540' }
];

export function Careers() {
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
						<RocketOutlined style={{ fontSize: 28 }} />
					</div>
					<Typography.Title level={1} style={{ color: '#fff', marginBottom: 12, fontWeight: 700 }}>
						Careers & Jobs
					</Typography.Title>
					<Typography.Paragraph style={{ color: 'rgba(255,255,255,0.9)', fontSize: 18, marginBottom: 0 }}>
						Resources and tips to advance in investment management. CFA® charterholders are highly valued by employers globally.
					</Typography.Paragraph>
				</motion.div>
			</section>

			{/* Tips grid */}
			<section className="max-w-6xl mx-auto px-4 py-12 md:py-16">
				<Typography.Title level={3} style={{ color: '#102540', marginBottom: 24, textAlign: 'center' }}>
					Career tips
				</Typography.Title>
				<Row gutter={[20, 20]}>
					{tips.map((item, idx) => (
						<Col xs={24} sm={12} lg={6} key={idx}>
							<motion.div
								initial={{ opacity: 0, y: 16 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true }}
								transition={{ delay: idx * 0.08, duration: 0.4 }}
							>
								<Card
									hoverable
									className="h-full border-0 shadow-md hover:shadow-lg transition-shadow"
									style={{ borderRadius: 16 }}
									styles={{ body: { padding: 24 } }}
								>
									<div
										className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
										style={{ background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', color: '#fff' }}
									>
										<span style={{ fontSize: 20 }}>{item.icon}</span>
									</div>
									<Typography.Title level={5} style={{ marginBottom: 8, color: '#102540' }}>
										{item.title}
									</Typography.Title>
									<Typography.Text type="secondary" style={{ fontSize: 14, lineHeight: 1.6 }}>
										{item.desc}
									</Typography.Text>
								</Card>
							</motion.div>
						</Col>
					))}
				</Row>
			</section>

			{/* Resources */}
			<section className="max-w-6xl mx-auto px-4 pb-16">
				<Typography.Title level={3} style={{ color: '#102540', marginBottom: 24, textAlign: 'center' }}>
					Useful resources
				</Typography.Title>
				<div className="flex flex-wrap justify-center gap-4">
					{resources.map((r, idx) => (
						<motion.a
							key={r.label}
							href={r.href}
							target="_blank"
							rel="noopener noreferrer"
							initial={{ opacity: 0, scale: 0.95 }}
							whileInView={{ opacity: 1, scale: 1 }}
							viewport={{ once: true }}
							transition={{ delay: idx * 0.1 }}
							className="inline-flex items-center gap-3 px-6 py-4 rounded-xl border border-gray-200 bg-white hover:border-[#102540] hover:shadow-md transition-all no-underline text-gray-800"
						>
							<span style={{ color: r.color, fontSize: 22 }}>{r.icon}</span>
							<span className="font-medium">{r.label}</span>
						</motion.a>
					))}
				</div>
			</section>

			{/* CTA */}
			<section className="max-w-3xl mx-auto px-4 pb-20">
				<Card
					className="border-0 shadow-lg"
					style={{
						borderRadius: 20,
						background: 'linear-gradient(135deg, #f0f7ff 0%, #e6f4ff 100%)',
						border: '1px solid #91caff'
					}}
					styles={{ body: { padding: 32 } }}
				>
					<div className="flex flex-wrap items-center gap-4">
						<div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#102540] text-white">
							<CheckCircleOutlined style={{ fontSize: 24 }} />
						</div>
						<div>
							<Typography.Title level={4} style={{ margin: 0, color: '#102540' }}>
								Ready to apply?
							</Typography.Title>
							<Typography.Text type="secondary">
								Complete your CFA® prep courses and practice exams to strengthen your profile for roles in investment management.
							</Typography.Text>
						</div>
					</div>
				</Card>
			</section>
		</div>
	);
}
