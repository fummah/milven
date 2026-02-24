import React, { useEffect, useState } from 'react';
import { Card, Collapse, Typography, Empty, Row, Col } from 'antd';
import { QuestionCircleOutlined, CustomerServiceOutlined } from '@ant-design/icons';
import { api } from '../lib/api';
import { motion } from 'framer-motion';

export function Faq() {
	const [faq, setFaq] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		api.get('/api/settings/faq')
			.then((res) => setFaq(Array.isArray(res.data?.faq) ? res.data.faq : []))
			.catch(() => setFaq([]))
			.finally(() => setLoading(false));
	}, []);

	return (
		<div className="min-h-screen bg-gray-50/50">
			{/* Hero */}
			<section
				className="relative overflow-hidden rounded-b-2xl px-6 py-14 md:py-16 text-center"
				style={{
					background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 50%, #2563eb 100%)',
					color: '#fff',
					boxShadow: '0 12px 40px rgba(16, 37, 64, 0.2)'
				}}
			>
				<motion.div
					initial={{ opacity: 0, y: 16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
					className="max-w-2xl mx-auto"
				>
					<div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 mb-5">
						<QuestionCircleOutlined style={{ fontSize: 28 }} />
					</div>
					<Typography.Title level={1} style={{ color: '#fff', marginBottom: 8, fontWeight: 700 }}>
						Frequently Asked Questions
					</Typography.Title>
					<Typography.Paragraph style={{ color: 'rgba(255,255,255,0.9)', fontSize: 17, marginBottom: 0 }}>
						Find answers about our CFA® prep courses, study materials, practice exams, and support.
					</Typography.Paragraph>
				</motion.div>
			</section>

			{/* FAQ content */}
			<section className="max-w-3xl mx-auto px-4 py-12 md:py-16">
				<Card
					loading={loading}
					className="border-0 shadow-lg"
					style={{ borderRadius: 20 }}
					styles={{ body: { padding: loading ? 32 : 0 } }}
				>
					{faq.length === 0 && !loading ? (
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description="No FAQs yet."
							style={{ padding: 48 }}
						/>
					) : (
						<Collapse
							accordion
							bordered={false}
							className="faq-accordion"
							items={faq.map((item, i) => ({
								key: String(i),
								label: (
									<span className="font-medium text-gray-800" style={{ fontSize: 15 }}>
										{item.question || 'Question'}
									</span>
								),
								children: (
									<Typography.Paragraph
										style={{ margin: 0, color: '#525252', lineHeight: 1.7, fontSize: 15 }}
									>
										{item.answer || ''}
									</Typography.Paragraph>
								),
								style: {
									background: '#fff',
									borderRadius: 12,
									marginBottom: 8,
									border: '1px solid #e5e7eb',
									overflow: 'hidden'
								}
							}))}
							expandIconPosition="end"
							style={{ background: 'transparent' }}
						/>
					)}
				</Card>
			</section>

			{/* Contact CTA */}
			<section className="max-w-3xl mx-auto px-4 pb-20">
				<Card
					className="border-0 shadow-md"
					style={{
						borderRadius: 16,
						background: 'linear-gradient(135deg, #f0f7ff 0%, #e6f4ff 100%)',
						border: '1px solid #91caff'
					}}
					styles={{ body: { padding: 24 } }}
				>
					<Row gutter={16} align="middle">
						<Col flex="none">
							<div
								className="inline-flex items-center justify-center w-12 h-12 rounded-xl"
								style={{ background: '#102540', color: '#fff' }}
							>
								<CustomerServiceOutlined style={{ fontSize: 22 }} />
							</div>
						</Col>
						<Col flex="auto">
							<Typography.Title level={5} style={{ margin: 0, color: '#102540' }}>
								Still have questions?
							</Typography.Title>
							<Typography.Text type="secondary">
								Contact support for help with your account, courses, or certificates.
							</Typography.Text>
						</Col>
					</Row>
				</Card>
			</section>
		</div>
	);
}
