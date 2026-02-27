import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Card, Col, Input, Row, Space, Tag, Typography, Badge, message, Progress, Statistic } from 'antd';
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
	UsergroupAddOutlined,
	TrophyOutlined,
	SafetyCertificateOutlined,
	RiseOutlined,
	BookFilled,
	CheckCircleOutlined,
	FileTextOutlined,
	ExperimentOutlined,
	QuestionCircleOutlined,
	ThunderboltOutlined,
	DashboardOutlined,
	AimOutlined,
	BarChartOutlined,
	FireOutlined,
	RocketOutlined,
	PlayCircleOutlined,
	FieldTimeOutlined,
	FundOutlined,
	AlertOutlined,
	BulbFilled,
	StarFilled,
	SafetyOutlined,
	AuditOutlined,
	ScheduleOutlined,
	ControlOutlined,
	ProfileOutlined,
	SolutionOutlined,
	FlagOutlined,
	PieChartOutlined,
	ArrowRightOutlined,
	UserOutlined,
	LockOutlined
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
		<div className="space-y-0">
			{/* HERO - Performance Focused */}
			<section
				className="relative overflow-hidden rounded-2xl p-8 md:p-14"
				style={{
					background: `linear-gradient(to right, #0f172a 0%, #0f172a 45%, rgba(15, 23, 42, 0.85) 65%, rgba(15, 23, 42, 0.6) 100%), url('https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&auto=format&fit=crop&q=80')`,
					backgroundSize: 'cover',
					backgroundPosition: 'right center'
				}}
			>
				<div className="max-w-6xl mx-auto">
					<Row gutter={[48, 32]} align="middle">
						<Col xs={24} lg={14}>
							<motion.div
								initial={{ y: 20, opacity: 0 }}
								animate={{ y: 0, opacity: 1 }}
								transition={{ duration: 0.6 }}
							>
								<Tag color="blue" className="mb-4" style={{ borderRadius: 20, padding: '4px 16px', fontSize: 13, fontWeight: 500 }}>
									<ThunderboltOutlined /> The Intelligent CFA Performance Engine
								</Tag>
								<h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white" style={{ lineHeight: 1.3 }}>
									Don't Just Study.
									<br />
									<span style={{ display: 'inline-block', marginTop: 8, background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #06b6d4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
										Pass the CFA® Exam.
									</span>
								</h1>
								<p className="mt-5 text-lg text-gray-300 max-w-xl">
									AI-powered analytics, 10,000+ practice questions, full-length mocks, and real-time performance tracking. Know exactly where you stand and what to focus on.
								</p>
								
								{/* Key Metrics Row */}
								<div className="mt-8 flex flex-wrap gap-6">
									<div className="flex items-center gap-3">
										<div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59, 130, 246, 0.2)' }}>
											<FileTextOutlined style={{ fontSize: 22, color: '#3b82f6' }} />
										</div>
										<div>
											<div className="text-2xl font-bold text-white">10,000+</div>
											<div className="text-sm text-gray-400">Practice Questions</div>
										</div>
									</div>
									<div className="flex items-center gap-3">
										<div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(139, 92, 246, 0.2)' }}>
											<AuditOutlined style={{ fontSize: 22, color: '#8b5cf6' }} />
										</div>
										<div>
											<div className="text-2xl font-bold text-white">50+</div>
											<div className="text-sm text-gray-400">Full-Length Mocks</div>
										</div>
									</div>
									<div className="flex items-center gap-3">
										<div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(34, 197, 94, 0.2)' }}>
											<TrophyOutlined style={{ fontSize: 22, color: '#22c55e' }} />
										</div>
										<div>
											<div className="text-2xl font-bold text-white">85%</div>
											<div className="text-sm text-gray-400">Pass Rate</div>
										</div>
									</div>
								</div>

								{/* CTA Buttons */}
								<div className="mt-8 flex flex-wrap gap-4">
									<Button 
										type="primary" 
										size="large" 
										icon={<PlayCircleOutlined />}
										onClick={() => navigate('/register')}
										style={{ 
											height: 52, 
											paddingInline: 32, 
											fontSize: 16, 
											fontWeight: 600,
											background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
											border: 'none',
											borderRadius: 12
										}}
									>
										Start Free Mock Exam
									</Button>
									<Button 
										size="large" 
										icon={<DashboardOutlined />}
										onClick={() => navigate('/demo-dashboard')}
										style={{ 
											height: 52, 
											paddingInline: 28, 
											fontSize: 16,
											borderRadius: 12,
											background: 'rgba(255,255,255,0.1)',
											borderColor: 'rgba(255,255,255,0.2)',
											color: 'white'
										}}
									>
										View Demo Dashboard
									</Button>
								</div>

								{/* Trust badges */}
								<div className="mt-8 flex items-center gap-4 flex-wrap">
									<div className="flex items-center gap-2 text-gray-400 text-sm">
										<CheckCircleOutlined style={{ color: '#22c55e' }} />
										<span>CFA® Charterholder Instructors</span>
									</div>
									<div className="flex items-center gap-2 text-gray-400 text-sm">
										<CheckCircleOutlined style={{ color: '#22c55e' }} />
										<span>Updated for 2026 Curriculum</span>
									</div>
								</div>
							</motion.div>
						</Col>

						{/* Dashboard Preview */}
						<Col xs={24} lg={10}>
							<motion.div
								initial={{ opacity: 0, x: 30 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ duration: 0.7, delay: 0.2 }}
								className="relative"
							>
								<div 
									className="rounded-2xl p-6"
									style={{ 
										background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%)',
										border: '1px solid rgba(255,255,255,0.15)',
										boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
									}}
								>
									<div className="flex items-center gap-3 mb-4">
										<div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
											<UserOutlined style={{ color: 'white' }} />
										</div>
										<div>
											<div className="text-white font-semibold">Your Performance Dashboard</div>
											<div className="text-gray-400 text-sm">Real-time exam readiness</div>
										</div>
									</div>

									{/* Readiness Score */}
									<div className="bg-white/5 rounded-xl p-4 mb-4">
										<div className="flex items-center justify-between mb-2">
											<span className="text-gray-300 text-sm">Milven Readiness Score™</span>
											<Tag color="green">On Track</Tag>
										</div>
										<div className="flex items-center gap-4">
											<div className="text-4xl font-bold text-white">78</div>
											<div className="flex-1">
												<Progress 
													percent={78} 
													showInfo={false}
													strokeColor={{ from: '#22c55e', to: '#3b82f6' }}
													trailColor="rgba(255,255,255,0.1)"
												/>
											</div>
										</div>
										<div className="text-xs text-gray-400 mt-2">Estimated pass probability: 82%</div>
									</div>

									{/* Topic Performance */}
									<div className="text-gray-300 text-sm mb-3">Topic Performance</div>
									<div className="space-y-2">
										{[
											{ topic: 'Ethics', score: 71, color: '#22c55e' },
											{ topic: 'Equity', score: 78, color: '#22c55e' },
											{ topic: 'FRA', score: 62, color: '#f59e0b' },
											{ topic: 'Fixed Income', score: 54, color: '#ef4444' }
										].map((item, idx) => (
											<div key={idx} className="flex items-center gap-3">
												<span className="text-gray-400 text-xs w-24">{item.topic}</span>
												<div className="flex-1">
													<Progress 
														percent={item.score} 
														size="small"
														strokeColor={item.color}
														trailColor="rgba(255,255,255,0.1)"
														format={(p) => <span style={{ color: item.color, fontSize: 11 }}>{p}%</span>}
													/>
												</div>
											</div>
										))}
									</div>

									{/* Quick Stats */}
									<div className="grid grid-cols-3 gap-3 mt-4">
										<div className="bg-white/5 rounded-lg p-3 text-center">
											<div className="text-xl font-bold text-white">847</div>
											<div className="text-xs text-gray-400">Questions Done</div>
										</div>
										<div className="bg-white/5 rounded-lg p-3 text-center">
											<div className="text-xl font-bold text-white">12</div>
											<div className="text-xs text-gray-400">Mocks Taken</div>
										</div>
										<div className="bg-white/5 rounded-lg p-3 text-center">
											<div className="text-xl font-bold text-white">+8%</div>
											<div className="text-xs text-gray-400">This Week</div>
										</div>
									</div>
								</div>

								{/* Floating badges */}
								<div className="absolute -top-3 -right-3 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-semibold shadow-lg">
									Live Preview
								</div>
							</motion.div>
						</Col>
					</Row>
				</div>

				{/* Decorative elements */}
				<div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
				<div className="pointer-events-none absolute -left-32 -bottom-32 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
			</section>

			{/* Advanced Analytics Showcase */}
			<section className="py-20" style={{ background: '#f8fafc' }}>
				<div className="max-w-6xl mx-auto px-4">
					<div className="text-center mb-14">
						<Tag color="blue" style={{ borderRadius: 20, padding: '4px 14px', marginBottom: 16 }}>
							<BarChartOutlined /> Advanced Analytics
						</Tag>
						<Typography.Title level={2} style={{ color: '#0f172a', marginBottom: 12, fontWeight: 700 }}>
							Know Exactly Where You Stand
						</Typography.Title>
						<Typography.Text style={{ fontSize: 17, color: '#64748b' }}>
							AI-powered insights that tell you what to study, not just what to read
						</Typography.Text>
					</div>
					<Row gutter={[28, 28]}>
						{[
							{ 
								icon: <DashboardOutlined />, 
								title: 'Readiness Score', 
								desc: 'AI-calculated probability of passing based on your performance, coverage, and time efficiency.',
								gradient: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
								bgLight: 'rgba(59, 130, 246, 0.08)'
							},
							{ 
								icon: <PieChartOutlined />, 
								title: 'Topic Heat Map', 
								desc: 'Visual breakdown of every topic. Green (>70%), Yellow (60-70%), Red (<60%). Know your weak spots instantly.',
								gradient: 'linear-gradient(135deg, #22c55e 0%, #4ade80 100%)',
								bgLight: 'rgba(34, 197, 94, 0.08)'
							},
							{ 
								icon: <AlertOutlined />, 
								title: 'Weakness Detection', 
								desc: 'Sub-topic level analysis. "Fixed Income → Term Structure → Weak". Surgical precision.',
								gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
								bgLight: 'rgba(245, 158, 11, 0.08)'
							},
							{ 
								icon: <FieldTimeOutlined />, 
								title: 'Speed Analytics', 
								desc: 'Track time per question, identify slowest topics, compare against peers.',
								gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
								bgLight: 'rgba(139, 92, 246, 0.08)'
							},
							{ 
								icon: <FundOutlined />, 
								title: 'Improvement Trends', 
								desc: 'Visual progress from first mock to latest. See your growth curve.',
								gradient: 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)',
								bgLight: 'rgba(6, 182, 212, 0.08)'
							},
							{ 
								icon: <AimOutlined />, 
								title: 'Percentile Ranking', 
								desc: 'See how you compare against other candidates. Top 10%? Top 25%?',
								gradient: 'linear-gradient(135deg, #ec4899 0%, #f472b6 100%)',
								bgLight: 'rgba(236, 72, 153, 0.08)'
							}
						].map((item, idx) => (
							<Col xs={24} sm={12} lg={8} key={idx}>
								<motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ delay: idx * 0.05, duration: 0.4 }}>
									<Card 
										bordered={false} 
										className="h-full hover:shadow-2xl transition-all duration-300 hover:-translate-y-2" 
										style={{ 
											borderRadius: 20, 
											background: '#ffffff',
											boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
										}} 
										styles={{ body: { padding: 28 } }}
									>
										<div 
											className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5"
											style={{ background: item.bgLight }}
										>
											<div 
												className="w-10 h-10 rounded-xl flex items-center justify-center"
												style={{ background: item.gradient }}
											>
												<span style={{ fontSize: 20, color: '#ffffff' }}>{item.icon}</span>
											</div>
										</div>
										<Typography.Title level={5} style={{ marginBottom: 10, color: '#0f172a', fontWeight: 600 }}>{item.title}</Typography.Title>
										<Typography.Text style={{ fontSize: 14, lineHeight: 1.7, color: '#64748b' }}>{item.desc}</Typography.Text>
									</Card>
								</motion.div>
							</Col>
						))}
					</Row>
				</div>
			</section>

			{/* Why the CFA Program */}
			<section className="max-w-6xl mx-auto px-4 py-16">
				<Typography.Title level={2} style={{ textAlign: 'center', marginBottom: 32, color: '#102540' }}>
					Why the CFA® Program?
				</Typography.Title>
				<Row gutter={[20, 20]}>
					{[
						{ icon: <GlobalOutlined />, title: 'Global recognition', desc: 'The CFA charter is the most respected credential in investment management worldwide, recognized by employers in over 190+ markets.' },
						{ icon: <SafetyCertificateOutlined />, title: 'Ethics & standards', desc: 'The program emphasizes the Code of Ethics and Standards of Professional Conduct, building trust and integrity in the industry.' },
						{ icon: <RiseOutlined />, title: 'Career advancement', desc: 'Charterholders often see stronger hiring preference and compensation. Stand out in portfolio management, research, and advisory roles.' },
						{ icon: <BookFilled />, title: 'Rigorous curriculum', desc: 'Three levels cover ethical standards, quantitative methods, economics, financial reporting, equity, fixed income, derivatives, and more.' }
					].map((item, idx) => (
						<Col xs={24} sm={12} lg={6} key={idx}>
							<motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ delay: idx * 0.06, duration: 0.4 }}>
								<Card bordered={false} className="h-full shadow-lg hover:shadow-xl transition-shadow" style={{ borderRadius: 16, background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 50%, #274a74 100%)' }} styles={{ body: { padding: 24 } }}>
									<div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4" style={{ background: 'rgba(255, 255, 255, 0.15)', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
										<span style={{ fontSize: 22, color: '#ffffff' }}>{item.icon}</span>
									</div>
									<Typography.Title level={5} style={{ marginBottom: 8, color: '#ffffff' }}>{item.title}</Typography.Title>
									<Typography.Text style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(255, 255, 255, 0.85)' }}>{item.desc}</Typography.Text>
								</Card>
							</motion.div>
						</Col>
					))}
				</Row>
			</section>

			{/* CFA at a glance */}
			<section className="max-w-4xl mx-auto px-4 mt-16">
				<Card bordered={false} className="shadow-md" style={{ borderRadius: 20, background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }} styles={{ body: { padding: 32 } }}>
					<Typography.Title level={4} style={{ textAlign: 'center', marginBottom: 20, color: '#102540' }}>
						CFA® Program at a glance
					</Typography.Title>
					<Row gutter={[24, 16]}>
						<Col xs={24} sm={12}><Space><CheckCircleOutlined style={{ color: '#16a34a' }} /><span>Three levels: Level I, II, and III</span></Space></Col>
						<Col xs={24} sm={12}><Space><CheckCircleOutlined style={{ color: '#16a34a' }} /><span>Computer-based exams; Level I offered year-round</span></Space></Col>
						<Col xs={24} sm={12}><Space><CheckCircleOutlined style={{ color: '#16a34a' }} /><span>Ethics, quant, economics, FRA, equity, fixed income, derivatives, alternatives</span></Space></Col>
						<Col xs={24} sm={12}><Space><CheckCircleOutlined style={{ color: '#16a34a' }} /><span>~300 hours study per level (recommended)</span></Space></Col>
					</Row>
					<div className="text-center mt-6">
						<Typography.Link href="https://www.cfainstitute.org/en/programs/cfa" target="_blank" rel="noopener noreferrer" style={{ fontSize: 14 }}>
							Official program details at CFA Institute →
						</Typography.Link>
					</div>
				</Card>
			</section>

			{/* Trust + Stats band - Performance Metrics */}
			<section className="w-full !mt-0">
				<div className="bg-gradient-to-r from-[#0f172a] via-[#1e3a5f] to-[#0f172a] text-white">
					<div className="px-6 md:px-10 py-6">
						<div className="flex flex-wrap items-center justify-center gap-6 md:gap-12 text-center">
							<div className="flex items-center gap-3">
								<span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20">
									<FileTextOutlined style={{ color: '#3b82f6', fontSize: 18 }} />
								</span>
								<div className="text-left">
									<span className="text-2xl font-bold text-white">10,000+</span>
									<span className="block text-xs text-gray-400">Practice Questions</span>
								</div>
							</div>
							<div className="hidden md:block w-px h-10 bg-white/10" />
							<div className="flex items-center gap-3">
								<span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20">
									<AuditOutlined style={{ color: '#8b5cf6', fontSize: 18 }} />
								</span>
								<div className="text-left">
									<span className="text-2xl font-bold text-white">50+</span>
									<span className="block text-xs text-gray-400">Full-Length Mocks</span>
								</div>
							</div>
							<div className="hidden md:block w-px h-10 bg-white/10" />
							<div className="flex items-center gap-3">
								<span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/20">
									<TrophyOutlined style={{ color: '#22c55e', fontSize: 18 }} />
								</span>
								<div className="text-left">
									<span className="text-2xl font-bold text-white">85%</span>
									<span className="block text-xs text-gray-400">Pass Rate</span>
								</div>
							</div>
							<div className="hidden md:block w-px h-10 bg-white/10" />
							<div className="flex items-center gap-3">
								<span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/20">
									<RiseOutlined style={{ color: '#f59e0b', fontSize: 18 }} />
								</span>
								<div className="text-left">
									<span className="text-2xl font-bold text-white">+23%</span>
									<span className="block text-xs text-gray-400">Avg Score Improvement</span>
								</div>
							</div>
							<div className="hidden md:block w-px h-10 bg-white/10" />
							<div className="flex items-center gap-3">
								<span className="text-[#00b67a] text-xl">★★★★★</span>
								<div className="text-left">
									<span className="text-lg font-semibold text-white">4.9/5</span>
									<span className="block text-xs text-gray-400">Student Rating</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Custom Exam Builder CTA Section */}
			<section className="max-w-6xl mx-auto px-4 py-16">
				<Row gutter={[48, 32]} align="middle">
					<Col xs={24} lg={12}>
						<motion.div
							initial={{ opacity: 0, x: -20 }}
							whileInView={{ opacity: 1, x: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.5 }}
						>
							<Tag color="purple" style={{ borderRadius: 20, padding: '4px 14px', marginBottom: 16 }}>
								<ControlOutlined /> Powerful Feature
							</Tag>
							<Typography.Title level={2} style={{ color: '#0f172a', marginBottom: 16 }}>
								Build Your Custom Practice Exam
							</Typography.Title>
							<Typography.Paragraph style={{ fontSize: 16, color: '#64748b', marginBottom: 24 }}>
								Take control of your preparation. Create personalized exams tailored to your weak areas and study goals.
							</Typography.Paragraph>
							<div className="space-y-3">
								{[
									{ icon: <BookOutlined />, text: 'Choose specific topics or mix across curriculum' },
									{ icon: <AimOutlined />, text: 'Select difficulty: Easy, Medium, or Hard' },
									{ icon: <FieldTimeOutlined />, text: 'Timed or untimed practice modes' },
									{ icon: <ProfileOutlined />, text: 'Vignette-only, MCQ-only, or mixed format' },
									{ icon: <BarChartOutlined />, text: 'Instant analytics after each session' }
								].map((item, idx) => (
									<div key={idx} className="flex items-center gap-3">
										<div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' }}>
											<span style={{ color: 'white', fontSize: 14 }}>{item.icon}</span>
										</div>
										<span className="text-gray-700">{item.text}</span>
									</div>
								))}
							</div>
							<div className="mt-8">
								<Button 
									type="primary" 
									size="large"
									icon={<RocketOutlined />}
									onClick={() => navigate('/student/exams')}
									style={{ 
										height: 48, 
										paddingInline: 28,
										background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
										border: 'none',
										borderRadius: 10,
										fontWeight: 600
									}}
								>
									Build Custom Exam Now
								</Button>
							</div>
						</motion.div>
					</Col>
					<Col xs={24} lg={12}>
						<motion.div
							initial={{ opacity: 0, x: 20 }}
							whileInView={{ opacity: 1, x: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.5, delay: 0.1 }}
						>
							<Card 
								className="shadow-xl"
								style={{ borderRadius: 20, border: '1px solid #e2e8f0' }}
								styles={{ body: { padding: 24 } }}
							>
								<div className="text-center mb-6">
									<Typography.Title level={4} style={{ margin: 0, color: '#0f172a' }}>
										<ControlOutlined style={{ marginRight: 8, color: '#8b5cf6' }} />
										Exam Builder
									</Typography.Title>
								</div>
								<div className="space-y-4">
									<div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
										<span className="text-gray-600">Level</span>
										<Tag color="blue">CFA Level I</Tag>
									</div>
									<div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
										<span className="text-gray-600">Topics</span>
										<div className="flex gap-1">
											<Tag>FRA</Tag>
											<Tag>Ethics</Tag>
											<Tag>+2</Tag>
										</div>
									</div>
									<div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
										<span className="text-gray-600">Questions</span>
										<Tag color="purple">40 Questions</Tag>
									</div>
									<div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
										<span className="text-gray-600">Difficulty</span>
										<Tag color="orange">Medium-Hard</Tag>
									</div>
									<div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
										<span className="text-gray-600">Time</span>
										<Tag color="green">60 minutes</Tag>
									</div>
								</div>
								<Button 
									type="primary" 
									block 
									size="large"
									style={{ 
										marginTop: 20, 
										height: 44,
										background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
										border: 'none',
										borderRadius: 10
									}}
								>
									Generate Exam <ArrowRightOutlined />
								</Button>
							</Card>
						</motion.div>
					</Col>
				</Row>
			</section>

			{/* CFA Level courses grid */}
			<section className="rounded-b-3xl rounded-t-none text-white p-6 md:p-10 !mt-0" style={{ background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 25%, #2563eb 50%, #6366f1 75%, #8b5cf6 100%)' }}>
				<Typography.Title level={2} style={{ color: 'white', textAlign: 'center', marginBottom: 24 }}>
					CFA Level Courses
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
			<section className="mt-20 pt-8">
				<div className="text-center mb-12">
					<Tag color="purple" style={{ borderRadius: 20, padding: '4px 14px', marginBottom: 16 }}>
						<BookOutlined /> Exam Prep Courses
					</Tag>
					<Typography.Title level={2} style={{ textAlign: 'center', marginBottom: 8, color: '#0f172a', fontWeight: 700 }}>
						Our Courses
					</Typography.Title>
					<Typography.Text style={{ fontSize: 16, color: '#64748b' }}>
						Comprehensive CFA preparation tailored to your level
					</Typography.Text>
				</div>
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

			{/* How we help you prepare */}
			<section className="py-20" style={{ background: '#f8fafc' }}>
				<div className="max-w-6xl mx-auto px-4">
				<div className="text-center mb-14">
					<Tag color="green" style={{ borderRadius: 20, padding: '4px 14px', marginBottom: 16 }}>
						<RocketOutlined /> Your Success Path
					</Tag>
					<Typography.Title level={2} style={{ textAlign: 'center', marginBottom: 8, color: '#0f172a', fontWeight: 700 }}>
						How we help you prepare
					</Typography.Title>
					<Typography.Text style={{ fontSize: 16, color: '#64748b' }}>
						Everything you need to succeed on exam day
					</Typography.Text>
				</div>
				<Row gutter={[28, 28]}>
					{[
						{ icon: <ReadOutlined />, title: 'Structured curriculum', desc: 'Topics and modules aligned to the CFA curriculum. Study at your own pace with volumes and learning materials.', gradient: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)', bgLight: 'rgba(59, 130, 246, 0.08)' },
						{ icon: <FileTextOutlined />, title: 'Practice exams & MCQs', desc: 'Mock exams and vignette-style questions to build exam readiness and time management.', gradient: 'linear-gradient(135deg, #22c55e 0%, #4ade80 100%)', bgLight: 'rgba(34, 197, 94, 0.08)' },
						{ icon: <ExperimentOutlined />, title: 'Track progress', desc: 'See what you’ve covered and where to focus. Stay on track for your exam date.', gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)', bgLight: 'rgba(139, 92, 246, 0.08)' }
					].map((item, idx) => (
						<Col xs={24} md={8} key={idx}>
							<motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ delay: idx * 0.08, duration: 0.4 }}>
								<Card 
									bordered={false} 
									className="h-full hover:shadow-2xl transition-all duration-300 hover:-translate-y-2" 
									style={{ 
										borderRadius: 20, 
										background: '#ffffff',
										boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
									}} 
									styles={{ body: { padding: 28 } }}
								>
									<div 
										className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5"
										style={{ background: item.bgLight || 'rgba(59, 130, 246, 0.08)' }}
									>
										<div 
											className="w-10 h-10 rounded-xl flex items-center justify-center"
											style={{ background: item.gradient || 'linear-gradient(135deg, #2563eb 0%, #6366f1 100%)' }}
										>
											<span style={{ fontSize: 20, color: '#ffffff' }}>{item.icon}</span>
										</div>
									</div>
									<Typography.Title level={5} style={{ marginBottom: 10, color: '#0f172a', fontWeight: 600 }}>{item.title}</Typography.Title>
									<Typography.Text style={{ fontSize: 14, lineHeight: 1.7, color: '#64748b' }}>{item.desc}</Typography.Text>
								</Card>
							</motion.div>
						</Col>
					))}
				</Row>
				</div>
			</section>

			{/* Resources */}
			<section className="max-w-4xl mx-auto px-4 py-16">
				<div className="text-center mb-10">
					<Tag color="cyan" style={{ borderRadius: 20, padding: '4px 14px', marginBottom: 16 }}>
						<GlobalOutlined /> Quick Links
					</Tag>
					<Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 8, color: '#0f172a', fontWeight: 700 }}>
						Resources
					</Typography.Title>
					<Typography.Text style={{ fontSize: 15, color: '#64748b' }}>
						Explore more about the CFA program
					</Typography.Text>
				</div>
				<Row gutter={[16, 16]} justify="center">
					<Col><Button type="outline" size="large" onClick={() => navigate('/courses')} icon={<BookOutlined />} style={{ borderRadius: 8 }}>Browse courses</Button></Col>
					<Col><Button type="outline" size="large" onClick={() => navigate('/about-cfa')} icon={<TrophyOutlined />} style={{ borderRadius: 8 }}>About CFA</Button></Col>
					<Col><Button type="outline" size="large" onClick={() => navigate('/faq')} icon={<QuestionCircleOutlined />} style={{ borderRadius: 8 }}>FAQ</Button></Col>
					<Col><Button type="outline" size="large" onClick={() => navigate('/careers')} icon={<RiseOutlined />} style={{ borderRadius: 8 }}>Careers</Button></Col>
					<Col><Button type="outline" size="large" onClick={() => window.open('https://www.cfainstitute.org/', '_blank')} icon={<GlobalOutlined />} style={{ borderRadius: 8 }}>CFA Institute</Button></Col>
				</Row>
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


