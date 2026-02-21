import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Card, Col, Input, Row, Tag, Typography, Badge, message } from 'antd';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import {
	GlobalOutlined,
	ReadOutlined,
	TeamOutlined,
	VideoCameraOutlined,
	SearchOutlined,
	CloudOutlined,
	HeartOutlined,
	TranslationOutlined,
	LineChartOutlined,
	ToolOutlined,
	BookOutlined,
	BulbOutlined,
	SlidersOutlined,
	StarTwoTone,
	LikeOutlined,
	ClockCircleOutlined,
	UsergroupAddOutlined
} from '@ant-design/icons';

const categories = [
	'CFA Level I',
	'CFA Level II',
	'CFA Level III'
];

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

export function Home() {
	const navigate = useNavigate();
	const [courses, setCourses] = useState([]);
	const [startingCourseId, setStartingCourseId] = useState(null);
	useEffect(() => {
		api.get('/api/learning/courses/public').then(res => setCourses(res.data.courses || [])).catch(() => setCourses([]));
	}, []);
	const suggestions = useMemo(
		() => [
			'CFA Level I',
			'CFA Level II',
			'CFA Level III'
		],
		[]
	);
	const [typed, setTyped] = useState('');
	const [isDeleting, setIsDeleting] = useState(false);
	const [loopIndex, setLoopIndex] = useState(0);

	useEffect(() => {
		const current = suggestions[loopIndex % suggestions.length];
		const delay = isDeleting ? 60 : 100;

		const timeout = setTimeout(() => {
			if (!isDeleting) {
				const next = current.slice(0, typed.length + 1);
				setTyped(next);
				if (next === current) {
					setTimeout(() => setIsDeleting(true), 900);
				}
			} else {
				const next = current.slice(0, Math.max(typed.length - 1, 0));
				setTyped(next);
				if (next.length === 0) {
					setIsDeleting(false);
					setLoopIndex((i) => i + 1);
				}
			}
		}, delay);
		return () => clearTimeout(timeout);
	}, [typed, isDeleting, loopIndex, suggestions]);

	const levelToLabel = { LEVEL1: 'CFA Level I', LEVEL2: 'CFA Level II', LEVEL3: 'CFA Level III' };
	const courseByCategory = useMemo(() => {
		const map = {};
		courses.forEach((c) => {
			const label = levelToLabel[c.level];
			if (label && !map[label]) map[label] = c;
		});
		return map;
	}, [courses]);

	const getCategoryVisual = (label) => {
		// Returns icon element and gradient colors for avatar background
		switch (label) {
			case 'CFA Level I':
				return { icon: <CloudOutlined />, from: 'from-cyan-500', to: 'to-teal-500', iconColor: '#06b6d4' };
			case 'CFA Level II':
				return { icon: <LineChartOutlined />, from: 'from-pink-500', to: 'to-rose-500', iconColor: '#f43f5e' };
			case 'CFA Level III':
				return { icon: <TeamOutlined />, from: 'from-blue-500', to: 'to-indigo-500', iconColor: '#3b82f6' };
			default:
				return { icon: null, from: 'from-gray-400', to: 'to-gray-500', iconColor: '#64748b' };
		}
	};

	const handleCategoryClick = (categoryLabel) => {
		const course = courseByCategory[categoryLabel];
		if (!course) {
			message.info('No course available for this level yet.');
			return;
		}
		navigate(`/course/${course.id}`);
	};

	return (
		<div className="space-y-20">
			{/* Hero */}
			<section
				className="relative overflow-hidden rounded-2xl p-8 md:p-12 shadow-xl-soft"
				style={{
					backgroundImage:
						'radial-gradient(900px 420px at 0% 0%, rgba(56, 189, 248, 0.30), transparent 60%), radial-gradient(800px 380px at 100% 0%, rgba(99, 102, 241, 0.28), transparent 60%), radial-gradient(700px 320px at 50% 100%, rgba(236, 72, 153, 0.18), transparent 60%), linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%)'
				}}
			>
				<div className="max-w-4xl mx-auto text-center flex flex-col items-center">
					<motion.h1
						className="text-3xl md:text-5xl font-extrabold tracking-tight text-gray-900"
						initial={{ y: 20, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						transition={{ duration: 0.6 }}
					>
						Courses to Power Your CFA Journey
					</motion.h1>
					<motion.p
						className="mt-4 text-lg md:text-xl text-gray-600"
						initial={{ y: 20, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						transition={{ delay: 0.1, duration: 0.6 }}
					>
						Learn exam topics, practice with MCQs and vignettes, and track your progress — all in one place.
					</motion.p>
					<motion.div
						className="mt-8 w-full flex justify-center"
						initial={{ opacity: 0, scale: 0.98 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ duration: 0.5, delay: 0.15 }}
					>
						{/* Gradient glow wrapper to mimic Canva-like effect */}
						<div className="w-full max-w-3xl p-[2px] rounded-full bg-gradient-to-r from-cyan-400/60 via-fuchsia-400/60 to-pink-400/60 animate-pulse">
							<div
								className="rounded-full bg-white/90 backdrop-blur ring-1 ring-black/5 transition-all duration-300"
								style={{ boxShadow: '0 12px 28px rgba(56,189,248,0.20), 0 8px 20px rgba(168,85,247,0.15)' }}
							>
								<Input
									size="large"
									placeholder={typed ? `Search: ${typed}` : 'Search topics...'}
									prefix={
										<span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 text-white mr-1 shadow-sm">
											<StarTwoTone twoToneColor="#ffffff" style={{ fontSize: 12 }} />
										</span>
									}
									suffix={
										<span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
											<SlidersOutlined />
										</span>
									}
									allowClear
									className="w-full rounded-full border-0 bg-transparent px-2 py-3 text-base"
									style={{ height: 56 }}
								/>
							</div>
						</div>
					</motion.div>
					<div className="mt-6 flex flex-wrap gap-2 justify-center">
						{categories.map((c) => {
							const { icon, from, to, iconColor } = getCategoryVisual(c);
							return (
								<motion.span key={c} whileHover={{ y: -2, scale: 1.03 }} whileTap={{ scale: 0.98 }}>
									<Tag
										className="px-3 py-1.5 text-sm rounded-full bg-white shadow hover:shadow-md transition-all flex items-center gap-2 cursor-pointer"
										onClick={() => handleCategoryClick(c)}
									>
										<span className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br ${from} ${to} shadow-sm`}>
											<span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white">
												<span style={{ color: iconColor, fontSize: 14, lineHeight: 0 }}>{icon}</span>
											</span>
										</span>
										{c}
									</Tag>
								</motion.span>
							);
						})}
					</div>
				</div>
				{/* Decorative blob */}
				<div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/20 blur-3xl" />
				<div className="pointer-events-none absolute -left-24 top-16 h-64 w-64 rounded-full bg-sky-300/30 blur-3xl" />
				<div className="pointer-events-none absolute right-1/3 -bottom-24 h-64 w-64 rounded-full bg-fuchsia-300/20 blur-3xl" />
			</section>

			{/* Trust + Stats band (restored) */}
			<section className="w-full !mt-0 !mb-0">
				<div className="mt-2 bg-[#0b2a3a] text-white">
					<div className="px-6 md:px-10 py-5">
						<div className="flex flex-wrap items-center justify-center gap-4 md:gap-10 text-center">
							<div className="flex items-center gap-3">
								<span className="text-gray-200">Rated</span>
								<span className="font-semibold">Excellent</span>
								<span className="ml-1 text-[#00b67a]">★★★★★</span>
								<span className="text-gray-300">on Trustpilot</span>
							</div>
							<div className="hidden md:block w-px h-6 bg-white/20" />
							<div className="flex items-center gap-3">
								<span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">👥</span>
								<span className="text-gray-100"><span className="font-semibold">100+</span> Learners</span>
							</div>
							<div className="hidden md:block w-px h-6 bg-white/20" />
							<div className="flex items-center gap-3">
								<span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">🎓</span>
								<span className="text-gray-100"><span className="font-semibold">100+</span> Graduates</span>
							</div>
							<div className="hidden md:block w-px h-6 bg-white/20" />
							<div className="flex items-center gap-3">
								<span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">🌍</span>
								<span className="text-gray-100"><span className="font-semibold">5</span> Countries</span>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Categories grid (Alison-style) */}
			<section className="rounded-b-3xl rounded-t-none text-white p-6 md:p-10 !mt-0" style={{ background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 25%, #2563eb 50%, #6366f1 75%, #8b5cf6 100%)' }}>
				<Typography.Title level={2} style={{ color: 'white', textAlign: 'center', marginBottom: 24 }}>
					Many Online Courses
				</Typography.Title>
				<Row gutter={[16, 16]}>
					{[
						{ title: 'CFA Level I', count: '1 Course', icon: <CloudOutlined /> },
						{ title: 'CFA Level II', count: '1 Course', icon: <HeartOutlined /> },
						{ title: 'CFA Level III', count: '1 Course', icon: <TranslationOutlined /> },
						{ title: 'Business', count: '3 Courses', icon: <LineChartOutlined /> }
					].map((c, idx) => (
						<Col key={c.title} xs={24} sm={12} md={12} lg={6}>
							<motion.div
								initial={{ opacity: 0, y: 14, scale: 0.98 }}
								whileInView={{ opacity: 1, y: 0, scale: 1 }}
								viewport={{ once: true, margin: '-80px' }}
								transition={{ delay: idx * 0.05, duration: 0.4 }}
							>
								<Card
									hoverable
									bordered={false}
									className="h-full text-gray-800 transition-transform hover:-translate-y-1"
									style={{ borderRadius: 24 }}
								>
									<div className="flex flex-col items-center text-center">
										<div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand text-2xl">
											{c.icon}
										</div>
										<Typography.Title level={4} style={{ marginBottom: 6 }}>
											{c.title}
										</Typography.Title>
										<Typography.Text type="secondary">{c.count}</Typography.Text>
									</div>
								</Card>
							</motion.div>
						</Col>
					))}
				</Row>
			</section>

			{/* Our Courses (from system) */}
			<section className="mt-14">
				<Typography.Title level={2} style={{ textAlign: 'center', marginBottom: 24 }}>
					Our Courses
				</Typography.Title>
				<Row gutter={[16, 16]}>
					{courses.map((course, idx) => {
						const image = PLACEHOLDER_IMAGES[idx % PLACEHOLDER_IMAGES.length];
						const levelLabel = formatCourseLevel(course.level);
						const hours = course.durationHours != null ? `${course.durationHours} hrs` : '—';
						const intervalLabel = course.product ? formatInterval(course.product.interval) : (course.isFree ? 'Free' : null);
						return (
							<Col xs={24} md={12} lg={6} key={course.id}>
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
													<Tag color="default" className="rounded-full">Course</Tag>
												</div>
											</div>
										}
									>
										<Typography.Title level={5} className="!mb-0 !mt-0" style={{ marginBottom: 2, marginTop: 0, lineHeight: 1.25 }}>
											{course.name}
										</Typography.Title>
										{course.description && (
											<div className="text-gray-600 text-sm line-clamp-2" style={{ marginTop: 0, marginBottom: 4 }}>
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
				{courses.length === 0 && (
					<div style={{ textAlign: 'center', padding: 48, color: '#999' }}>
						<Typography.Text>No courses available yet.</Typography.Text>
					</div>
				)}
			</section>

			{/* App CTA */}
			<section className="rounded-2xl border border-gray-100 p-8 md:p-12 bg-white shadow-xl-soft flex flex-col md:flex-row md:items-center justify-between gap-6">
				<div className="text-center md:text-left">
					<Typography.Title level={3} style={{ marginBottom: 8 }}>
						Learn anywhere. Track progress everywhere.
					</Typography.Title>
					<Typography.Paragraph type="secondary" className="max-w-2xl">
						Use Milven on web and mobile to keep your momentum and stay exam-ready.
					</Typography.Paragraph>
					<div className="flex gap-3 justify-center md:justify-start">
						<Button type="primary" size="large" onClick={() => navigate('/register')}>
							Create a free account
						</Button>
					</div>
				</div>
				<div className="hidden md:block">
					<motion.div
						className="relative"
						initial={{ scale: 0.9, opacity: 0 }}
						whileInView={{ scale: 1, opacity: 1 }}
						viewport={{ once: true }}
						transition={{ duration: 0.5 }}
					>
						<div className="h-28 w-28 rounded-xl bg-gradient-to-br from-brand to-blue-400 opacity-80 blur-lg" />
						<img
							className="absolute -top-6 -left-10 h-24 w-24 rounded-xl object-cover shadow-xl-soft"
							src="https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?w=400&auto=format&fit=crop&q=60"
							alt="Learning"
						/>
						<img
							className="absolute -bottom-6 -right-10 h-24 w-24 rounded-xl object-cover shadow-xl-soft"
							src="https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400&auto=format&fit=crop&q=60"
							alt="Practice"
						/>
					</motion.div>
				</div>
			</section>
		</div>
	);
}


