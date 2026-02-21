import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Typography, Tag, Space, Spin, message, Row, Col } from 'antd';
import { ClockCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { api } from '../lib/api';
import { motion } from 'framer-motion';

const PLACEHOLDER_IMAGES = [
	'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&auto=format&fit=crop&q=60',
	'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1200&auto=format&fit=crop&q=60',
	'https://images.unsplash.com/photo-1588072432836-e10032774350?w=1200&auto=format&fit=crop&q=60',
	'https://images.unsplash.com/photo-1542744095-291d1f67b221?w=1200&auto=format&fit=crop&q=60'
];

const PENDING_COURSE_KEY = 'pendingCourseId';

function formatCourseLevel(level) {
	if (!level) return '—';
	const map = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III', NONE: '—' };
	return map[level] || level;
}

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

export function CourseDetail() {
	const { courseId } = useParams();
	const navigate = useNavigate();
	const [course, setCourse] = useState(null);
	const [loading, setLoading] = useState(true);
	const [starting, setStarting] = useState(false);

	useEffect(() => {
		(async () => {
			setLoading(true);
			try {
				const { data } = await api.get(`/api/learning/courses/public`);
				const courses = data.courses || [];
				const found = courses.find(c => c.id === courseId);
				setCourse(found || null);
			} catch (e) {
				message.error('Failed to load course');
				setCourse(null);
			} finally {
				setLoading(false);
			}
		})();
	}, [courseId]);

	if (loading) {
		return (
			<div className="max-w-7xl mx-auto px-4 py-20" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
				<Spin size="large" />
			</div>
		);
	}

	if (!course) {
		return (
			<div className="max-w-7xl mx-auto px-4 py-20">
				<Card>
					<Typography.Title level={3}>Course not found</Typography.Title>
					<Button onClick={() => navigate('/courses')}>Back to Courses</Button>
				</Card>
			</div>
		);
	}

	const image = course.imageUrl || PLACEHOLDER_IMAGES[0];
	const levelLabel = formatCourseLevel(course.level);
	const hours = course.durationHours != null ? `${course.durationHours} hrs` : '—';

	const handleStartLearning = async () => {
		if (!localStorage.getItem('token')) {
			localStorage.setItem(PENDING_COURSE_KEY, course.id);
			navigate('/register');
			return;
		}
		setStarting(true);
		await startCourseFlow(course, navigate);
		setStarting(false);
	};

	return (
		<div className="max-w-7xl mx-auto px-4 py-10">
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5 }}
			>
				<Row gutter={[32, 32]}>
					<Col xs={24} lg={12}>
						<div className="relative" style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
							<img
								src={image}
								alt={course.name}
								className="w-full h-auto"
								style={{ maxHeight: '500px', objectFit: 'cover' }}
							/>
							<div className="absolute top-4 left-4">
								<Tag color="blue" style={{ fontSize: 14, padding: '4px 12px', borderRadius: 20 }}>
									{levelLabel}
								</Tag>
							</div>
						</div>
					</Col>
					<Col xs={24} lg={12}>
						<Space direction="vertical" size={24} style={{ width: '100%' }}>
							<div>
								<Typography.Title level={1} style={{ marginBottom: 16, color: '#102540' }}>
									{course.name}
								</Typography.Title>
								{course.description && (
									<Typography.Paragraph style={{ fontSize: 16, lineHeight: 1.8, color: '#4b5563' }}>
										{course.description}
									</Typography.Paragraph>
								)}
							</div>
							<Space size={16} wrap>
								<Space>
									<ClockCircleOutlined style={{ color: '#6b7280' }} />
									<Typography.Text strong style={{ color: '#374151' }}>{hours} of learning</Typography.Text>
								</Space>
								<Tag color="default" style={{ fontSize: 14, padding: '4px 12px' }}>
									{levelLabel}
								</Tag>
							</Space>
							<div>
								<Button
									type="primary"
									size="large"
									icon={<PlayCircleOutlined />}
									loading={starting}
									onClick={handleStartLearning}
									style={{
										backgroundColor: '#102540',
										borderColor: '#102540',
										height: 50,
										fontSize: 16,
										fontWeight: 600,
										padding: '0 32px'
									}}
								>
									Start Learning
								</Button>
							</div>
						</Space>
					</Col>
				</Row>
			</motion.div>
		</div>
	);
}

