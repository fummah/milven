import { useEffect, useState } from 'react';
import { Button, Card, Col, Row, Tag, Typography, message } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const PENDING_COURSE_KEY = 'pendingCourseId';

async function startCourseFlow(course, navigate) {
	try {
		const res = await api.post(`/api/learning/courses/${course.id}/enroll`);
		if (res.data.enrolled) {
			message.success(`Enrolled in ${course.name}`);
			navigate('/student/courses');
			return;
		}
		if (res.data.requiresPayment && res.data.productId) {
			const checkout = await api.post('/api/billing/checkout-session', {
				productId: res.data.productId,
				successUrl: `${window.location.origin}/student/courses?session_id={CHECKOUT_SESSION_ID}`,
				cancelUrl: `${window.location.origin}/student/courses`
			});
			if (checkout.data?.url) {
				window.location.href = checkout.data.url;
				return;
			}
			message.error('Unable to start checkout');
			return;
		}
		message.error(res.data?.error || 'Could not enroll');
	} catch (err) {
		message.error(err.response?.data?.error || 'Failed to start course');
	}
}

const PLACEHOLDER_IMAGES = [
	'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&auto=format&fit=crop&q=60',
	'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1200&auto=format&fit=crop&q=60',
	'https://images.unsplash.com/photo-1588072432836-e10032774350?w=1200&auto=format&fit=crop&q=60',
	'https://images.unsplash.com/photo-1542744095-291d1f67b221?w=1200&auto=format&fit=crop&q=60'
];

function formatCourseLevel(level) {
	if (!level) return '—';
	const map = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III', NONE: '—' };
	return map[level] || level;
}

function formatInterval(interval) {
	if (!interval) return null;
	const map = { ONE_TIME: 'One-off', MONTHLY: 'Monthly', YEARLY: 'Yearly' };
	return map[interval] || interval;
}

export function CoursesPage() {
	const navigate = useNavigate();
	const [courses, setCourses] = useState([]);
	const [loading, setLoading] = useState(true);
	const [startingCourseId, setStartingCourseId] = useState(null);

	useEffect(() => {
		api.get('/api/learning/courses/public')
			.then((res) => setCourses(res.data.courses || []))
			.catch(() => setCourses([]))
			.finally(() => setLoading(false));
	}, []);

	return (
		<div className="max-w-7xl mx-auto px-4 py-10">
			<Typography.Title level={2} style={{ textAlign: 'center', marginBottom: 32 }}>
				Our Courses
			</Typography.Title>
			<Row gutter={[16, 16]}>
				{courses.map((course, idx) => {
					const image = PLACEHOLDER_IMAGES[idx % PLACEHOLDER_IMAGES.length];
					const levelLabel = formatCourseLevel(course.level);
					const hours = course.durationHours != null ? `${course.durationHours} hrs` : '—';
					const intervalLabel = course.product ? formatInterval(course.product.interval) : (course.isFree ? 'Free' : null);
					return (
						<Col xs={24} sm={12} md={12} lg={6} key={course.id}>
							<motion.div
								initial={{ opacity: 0, y: 14 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true, margin: '-80px' }}
								transition={{ delay: idx * 0.05, duration: 0.4 }}
							>
								<Card
									hoverable
									className="h-full"
									bodyStyle={{ paddingTop: 16 }}
									style={{ borderRadius: 16, overflow: 'hidden' }}
									cover={
										<div className="relative">
											<img
												src={image}
												alt={course.name}
												className="h-44 w-full object-cover"
												loading="lazy"
											/>
											<div className="absolute top-2 left-2">
												<Tag color="blue" className="rounded-full">
													{levelLabel}
												</Tag>
											</div>
											<div className="absolute top-2 right-2">
												<Tag color="default" className="rounded-full">
													Course
												</Tag>
											</div>
										</div>
									}
								>
									<Typography.Title
										level={5}
										className="!mb-0 !mt-0"
										style={{ marginBottom: 2, marginTop: 0, lineHeight: 1.25 }}
									>
										{course.name}
									</Typography.Title>
									{course.description && (
										<div
											className="text-gray-600 text-sm line-clamp-2"
											style={{ marginTop: 0, marginBottom: 4 }}
										>
											{course.description}
										</div>
									)}
									<div className="flex items-center gap-4 text-gray-600 text-sm flex-wrap" style={{ marginTop: 4 }}>
										<span className="inline-flex items-center gap-1">
											<ClockCircleOutlined /> {hours}
										</span>
										{intervalLabel && (
											<Tag color="default" style={{ margin: 0 }}>{intervalLabel}</Tag>
										)}
									</div>
									<div className="mt-4">
										<Button
											type="primary"
											loading={startingCourseId === course.id}
											style={{ backgroundColor: '#102540', borderColor: '#102540' }}
											onClick={async () => {
												if (!localStorage.getItem('token')) {
													localStorage.setItem(PENDING_COURSE_KEY, course.id);
													navigate('/register');
													return;
												}
												setStartingCourseId(course.id);
												await startCourseFlow(course, navigate);
												setStartingCourseId(null);
											}}
										>
											Start Learning
										</Button>
									</div>
								</Card>
							</motion.div>
						</Col>
					);
				})}
			</Row>
			{!loading && courses.length === 0 && (
				<div style={{ textAlign: 'center', padding: 48, color: '#999' }}>
					<Typography.Text>No courses available yet.</Typography.Text>
				</div>
			)}
		</div>
	);
}
