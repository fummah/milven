import { Layout, Menu, Button, Typography, Grid, Dropdown, Space, Tag, Row, Col, Card, Modal } from 'antd';
import { Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { DownOutlined, UserOutlined, PlayCircleFilled, BookOutlined, SolutionOutlined, DollarCircleOutlined, FacebookFilled, TwitterSquareFilled, LinkedinFilled, YoutubeFilled, LoginOutlined, UserAddOutlined, CrownOutlined, MobileOutlined, AndroidOutlined, AppleOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';

import { LoginPage } from './pages/Login.jsx';
import { RegisterPage } from './pages/Register.jsx';
import { VerifyEmailPage } from './pages/VerifyEmail.jsx';
import { ForgotPasswordPage } from './pages/ForgotPassword.jsx';
import { ResetPasswordPage } from './pages/ResetPassword.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { ExamBuilder } from './pages/ExamBuilder.jsx';
import { AdminExamBuilder } from './pages/admin/AdminExamBuilder.jsx';
import { ExamTake } from './pages/ExamTake.jsx';
import { ExamResult } from './pages/ExamResult.jsx';
import { Videos } from './pages/Videos.jsx';
import { Faq } from './pages/Faq.jsx';
import { Account } from './pages/Account.jsx';
import { AdminTopics } from './pages/admin/AdminTopics.jsx';
import { AdminQuestions } from './pages/admin/AdminQuestions.jsx';
import { AdminRevision } from './pages/admin/AdminRevision.jsx';
import { AdminVideos } from './pages/admin/AdminVideos.jsx';
import { AdminLoginPage } from './pages/admin/AdminLogin.jsx';
import { AdminDashboard } from './pages/admin/AdminDashboard.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import { AdminUsers } from './pages/admin/AdminUsers.jsx';
import { AdminStudents } from './pages/admin/AdminStudents.jsx';
import { AdminCourseView } from './pages/admin/AdminCourseView.jsx';
import { AdminCoursePreview } from './pages/admin/AdminCoursePreview';
import { AdminProducts } from './pages/admin/AdminProducts.jsx';
import { AdminInvoices } from './pages/admin/AdminInvoices.jsx';
import { AdminPurchases } from './pages/admin/AdminPurchases.jsx';
import { AdminSubscriptions } from './pages/admin/AdminSubscriptions.jsx';
import { AdminReports } from './pages/admin/AdminReports.jsx';
import { AdminTaxes } from './pages/admin/AdminTaxes.jsx';
import { AdminCourses } from './pages/admin/AdminCourses.jsx';
import StudentLayout from './pages/student/StudentLayout.jsx';
import { StudentDashboard } from './pages/student/StudentDashboard.jsx';
import { StudentInvoices } from './pages/student/StudentInvoices.jsx';
import { StudentExams } from './pages/student/StudentExams.jsx';
import { StudentCourses } from './pages/student/StudentCourses.jsx';
import { StudentBilling } from './pages/student/StudentBilling.jsx';
import { Placeholder } from './pages/admin/Placeholder.jsx';
import { AdminRoles } from './pages/admin/AdminRoles.jsx';
import { AdminLevels } from './pages/admin/AdminLevels.jsx';
import { AdminSettings } from './pages/admin/AdminSettings.jsx';
import { AdminStudentView } from './pages/admin/AdminStudentView.jsx';
import { AdminTopicPreview } from './pages/admin/AdminTopicPreview.jsx';
import { AdminMaterials } from './pages/admin/AdminMaterials.jsx';
import { AdminExamEditor } from './pages/admin/AdminExamEditor.jsx';
import { AdminExams } from './pages/admin/AdminExams.jsx';
import { Home } from './pages/Home.jsx';
import { CoursesPage } from './pages/Courses.jsx';
import { Careers } from './pages/Careers.jsx';
import { useSettings } from './contexts/SettingsContext.jsx';
import { api } from './lib/api.js';

const { Header, Content, Footer } = Layout;
const { useBreakpoint } = Grid;

// Scroll state lives here so only the header re-renders on scroll, not the whole App (prevents content/form reset when scrolling to top)
function PublicHeader({ logoUrl, brandName, exploreMenu, exploreDropdownContent, jobsMenu, accountMenuItems, screens, user, courseInProgress, location, navigate }) {
	const [scrolled, setScrolled] = useState(false);
	const [mobileAppModalOpen, setMobileAppModalOpen] = useState(false);
	useEffect(() => {
		let prev = window.scrollY > 8;
		const onScroll = () => {
			const next = window.scrollY > 8;
			if (next !== prev) {
				prev = next;
				setScrolled(next);
			}
		};
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	}, []);
	const HEADER_HEIGHT = 64;
	return (
		<>
		<Header
			style={{
				display: 'flex',
				alignItems: 'center',
				position: 'fixed',
				top: 0,
				left: 0,
				right: 0,
				zIndex: 1000,
				width: '100%'
			}}
			className={`${scrolled ? 'bg-white/95 shadow-[0_6px_20px_rgba(16,37,64,0.10)]' : 'bg-white/90'} backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b border-gray-100 transition-all duration-300`}
		>
			<Link to="/" className="flex items-center gap-3 mr-6">
				<motion.img
					src={logoUrl}
					alt={brandName}
					className="h-7 w-auto"
					initial={{ opacity: 0, y: -6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4, ease: 'easeOut' }}
				/>
			</Link>
			<div className="hidden md:flex items-center gap-6 text-gray-700" style={{ flex: 1 }}>
				{user ? (
					<Link
					to={user.role === 'ADMIN' ? '/admin' : '/student'}
					className="relative transition-colors duration-200 hover:text-gray-900 after:absolute after:left-0 after:-bottom-1 after:h-0.5 after:w-0 after:bg-[#102540] after:transition-all after:duration-300 hover:after:w-full"
					>
					My Home
					</Link>
				) : (
					<Link to="/" className="relative transition-colors duration-200 hover:text-gray-900 after:absolute after:left-0 after:-bottom-1 after:h-0.5 after:w-0 after:bg-[#102540] after:transition-all after:duration-300 hover:after:w-full">Home</Link>
				)}
				<Dropdown
					trigger={['hover', 'click']}
					dropdownRender={() => exploreDropdownContent}
				>
					<a className="relative transition-colors duration-200 hover:text-gray-900 after:absolute after:left-0 after:-bottom-1 after:h-0.5 after:w-0 after:bg-[#102540] after:transition-all after:duration-300 hover:after:w-full">
						<Space size={4}>
							Explore Courses
							<DownOutlined />
						</Space>
					</a>
				</Dropdown>
				<Link to={user ? (user.role === 'ADMIN' ? '/admin' : '/student') : '/login'} className="relative transition-colors duration-200 hover:text-gray-900 after:absolute after:left-0 after:-bottom-1 after:h-0.5 after:w-0 after:bg-[#102540] after:transition-all after:duration-300 hover:after:w-full">Claim Your Certificates</Link>
				<Dropdown menu={jobsMenu} trigger={['hover']}>
					<a className="relative transition-colors duration-200 hover:text-gray-900 after:absolute after:left-0 after:-bottom-1 after:h-0.5 after:w-0 after:bg-[#102540] after:transition-all after:duration-300 hover:after:w-full">
						<Space size={4}>
							Find Jobs & Careers
							<DownOutlined />
						</Space>
					</a>
				</Dropdown>
			</div>
			<div className="flex items-center gap-3">
				<div className="hidden md:block h-6 w-px bg-gray-200 mr-1" />
				<motion.div
					animate={{ scale: [1, 1.02, 1] }}
					transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
					whileHover={{ scale: 1.06, y: -2 }}
					whileTap={{ scale: 0.97 }}
					style={{ display: 'inline-block' }}
				>
					<Button
						size="middle"
						icon={<MobileOutlined />}
						onClick={() => setMobileAppModalOpen(true)}
						className="flex items-center gap-2 rounded-lg font-medium border-0 text-white transition-all"
						style={{
							borderRadius: 8,
							background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 30%, #6366f1 65%, #8b5cf6 100%)',
							color: '#fff',
							boxShadow: '0 4px 14px rgba(16, 37, 64, 0.35), 0 0 0 0 rgba(99, 102, 241, 0.4)'
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 37, 64, 0.45), 0 0 20px 4px rgba(99, 102, 241, 0.25)';
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.boxShadow = '0 4px 14px rgba(16, 37, 64, 0.35), 0 0 0 0 rgba(99, 102, 241, 0.4)';
						}}
					>
						Get Mobile App
					</Button>
				</motion.div>
				<Modal
					title={<span style={{ fontSize: 18, fontWeight: 600, color: '#102540' }}>Get Mobile App</span>}
					open={mobileAppModalOpen}
					onCancel={() => setMobileAppModalOpen(false)}
					footer={null}
					centered
					width={400}
					styles={{ body: { padding: '24px 0' } }}
				>
					<Space direction="vertical" size={16} style={{ width: '100%' }}>
						<a
							href="#"
							target="_blank"
							rel="noopener noreferrer"
							onClick={(e) => { e.preventDefault(); window.open('#', '_blank'); }}
							className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-[#3ddc84] hover:bg-[#f0fdf4] transition-all no-underline text-gray-800"
							style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, borderRadius: 12, border: '1px solid #e5e7eb' }}
						>
							<div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #3ddc84 0%, #2ecc71 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
								<AndroidOutlined style={{ fontSize: 28, color: '#fff' }} />
							</div>
							<div>
								<div style={{ fontWeight: 600, fontSize: 16, color: '#102540' }}>Android</div>
								<div style={{ fontSize: 13, color: '#6b7280' }}>Download on Google Play</div>
							</div>
						</a>
						<a
							href="#"
							target="_blank"
							rel="noopener noreferrer"
							onClick={(e) => { e.preventDefault(); window.open('#', '_blank'); }}
							className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-[#555] hover:bg-gray-50 transition-all no-underline text-gray-800"
							style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, borderRadius: 12, border: '1px solid #e5e7eb' }}
						>
							<div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #555 0%, #374151 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
								<AppleOutlined style={{ fontSize: 28, color: '#fff' }} />
							</div>
							<div>
								<div style={{ fontWeight: 600, fontSize: 16, color: '#102540' }}>iOS</div>
								<div style={{ fontSize: 13, color: '#6b7280' }}>Download on the App Store</div>
							</div>
						</a>
					</Space>
				</Modal>
				<Dropdown menu={{ items: accountMenuItems }} trigger={['hover', 'click']} placement="bottomRight">
					<a className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900 transition">
						<Space size={6}>
							<UserOutlined style={{ color: '#102540' }} />
							Account
							<DownOutlined />
						</Space>
					</a>
				</Dropdown>
				{screens.md && user?.role === 'STUDENT' && courseInProgress && !location.pathname.startsWith('/admin') && (
					<motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.98 }}>
						<Button
							size="large"
							icon={<PlayCircleFilled />}
							style={{ borderColor: '#00a85a', color: '#00a85a' }}
							onClick={() => navigate(`/student/learn/${courseInProgress.courseId}`)}
						>
							Continue Learning
						</Button>
					</motion.div>
				)}
			</div>
		</Header>
		<div style={{ height: HEADER_HEIGHT, flexShrink: 0 }} aria-hidden />
		</>
	);
}

export default function App() {
	const [user, setUser] = useState(null);
	const [authLoading, setAuthLoading] = useState(false);
	const [courseInProgress, setCourseInProgress] = useState(null);
	const screens = useBreakpoint();
	const navigate = useNavigate();
	const location = useLocation();
	const isLoggedIn = !!localStorage.getItem('token');
	const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
	const { settings } = useSettings();
	const brandName = settings['brand.name'] || 'MILVEN FINANCE SCHOOL';
	const logoUrl = settings['brand.logoUrl'] || '/logo.png';

	// Load current user when token exists
	useEffect(() => {
		async function fetchMe() {
			const token = localStorage.getItem('token');
			if (!token) {
				setUser(null);
				return;
			}
			// Optimistically hydrate from cached user (set during login) to avoid guard flicker
			try {
				const cached = localStorage.getItem('currentUser');
				if (cached) {
					const parsed = JSON.parse(cached);
					if (parsed && parsed.id && parsed.email) setUser(parsed);
				}
			} catch {}
			setAuthLoading(true);
			try {
				const res = await fetch(`${API_URL}/api/users/me`, {
					headers: { Authorization: `Bearer ${token}` }
				});
				if (res.status === 404) {
					// Endpoint not available yet; keep cached user
					setAuthLoading(false);
					return;
				}
				if (res.status === 401 || res.status === 403) {
					// Invalid/expired token – clear and reset
					localStorage.removeItem('token');
					localStorage.removeItem('currentUser');
					setUser(null);
					return;
				}
				if (res.ok) {
					const data = await res.json();
					if (!data?.user) {
						// Token invalid or user missing; clear and broadcast
						localStorage.removeItem('token');
						localStorage.removeItem('currentUser');
						setUser(null);
						try { window.dispatchEvent(new Event('auth:changed')); } catch {}
					} else {
						try { localStorage.setItem('currentUser', JSON.stringify(data.user)); } catch {}
						setUser(data.user);
					}
				} else {
					// Non-ok (non-404/401/403) – keep cached user
				}
			} catch {
				// Network/API failure: treat as logged out to avoid stuck loading
				try { localStorage.removeItem('token'); } catch {}
				try { localStorage.removeItem('currentUser'); } catch {}
				setUser(null);
				try { window.dispatchEvent(new Event('auth:changed')); } catch {}
			} finally {
				setAuthLoading(false);
			}
		}
		fetchMe();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoggedIn]);

	// React to explicit auth change events (login/logout) and storage changes (other tabs)
	useEffect(() => {
		const handleAuthChanged = () => {
			// Re-run the /me fetch by toggling authLoading or simply calling the same logic
			const token = localStorage.getItem('token');
			if (!token) {
				setUser(null);
				return;
			}
			setAuthLoading(true);
			fetch(`${API_URL}/api/users/me`, {
				headers: { Authorization: `Bearer ${token}` }
			})
				.then(async (r) => {
					if (r.status === 404) return { user: JSON.parse(localStorage.getItem('currentUser') || 'null') };
					if (r.ok) return r.json();
					return { user: null };
				})
				.then((data) => {
					if (!data?.user) {
						try { localStorage.removeItem('token'); } catch {}
						setUser(null);
					} else {
						setUser(data.user);
					}
				})
				.catch(() => {
					try { localStorage.removeItem('token'); } catch {}
					setUser(null);
				})
				.finally(() => setAuthLoading(false));
		};
		window.addEventListener('auth:changed', handleAuthChanged);
		window.addEventListener('storage', handleAuthChanged);
		return () => {
			window.removeEventListener('auth:changed', handleAuthChanged);
			window.removeEventListener('storage', handleAuthChanged);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Fetch course in progress for students (only when logged in as student); hide header button when no course in progress
	useEffect(() => {
		if (!user || user.role !== 'STUDENT') {
			setCourseInProgress(null);
			return;
		}
		api.get('/api/learning/me/courses')
			.then((res) => {
				const courses = res.data?.courses || [];
				// First course not yet completed (same as Continue Learning on dashboard: exclude enrollmentStatus === 'COMPLETED')
				const next = courses.find((c) => c.enrollmentStatus !== 'COMPLETED');
				setCourseInProgress(next ? { courseId: next.courseId } : null);
			})
			.catch(() => setCourseInProgress(null));
	}, [user]);

	const logout = () => {
		localStorage.removeItem('token');
		localStorage.removeItem('currentUser');
		setUser(null);
		// inform any listeners
		window.dispatchEvent(new Event('auth:changed'));
		navigate('/');
	};

	const exploreMenu = {
		items: [
			{ key: 'courses', label: <Link to="/courses">Courses</Link> },
			{ key: 'faq', label: <Link to="/faq">FAQ</Link> }
		]
	};

	const exploreDropdownContent = (
		<Card size="small" style={{ minWidth: 280 }} className="shadow-lg">
			<Typography.Text strong style={{ color: '#102540' }}>Explore</Typography.Text>
			<div style={{ marginTop: 8 }}>
				<Link to="/courses" style={{ display: 'block', padding: '6px 0', color: '#102540' }}>Courses</Link>
				<Link to="/faq" style={{ display: 'block', padding: '6px 0', color: '#102540' }}>FAQ</Link>
			</div>
		</Card>
	);

	const jobsMenu = {
		items: [
			{ key: 'careers', label: <Link to="/careers">Careers</Link> }
		]
	};

	const accountMenuItems = user
		? [
				{
					key: 'me',
					label: (
						<Link to="/account">
							<div className="flex items-center gap-2 py-1">
								<UserOutlined className="text-[#102540]" />
								<div>
									<div className="font-medium">My Profile</div>
									<div className="text-xs text-gray-500">{user?.email}</div>
								</div>
							</div>
						</Link>
					)
				},
				user?.role === 'ADMIN'
					? {
							key: 'admin',
							label: (
								<Link to="/admin">
									<div className="flex items-center gap-2 py-1">
										<CrownOutlined className="text-[#102540]" />
										<div>
											<div className="font-medium">Admin Dashboard</div>
											<div className="text-xs text-gray-500">Manage content & users</div>
										</div>
									</div>
								</Link>
							)
					  }
					: null,
				{ type: 'divider' },
				{
					key: 'logout',
					label: (
						<button onClick={logout} className="w-full text-left">
							<div className="flex items-center gap-2 py-1">
								<LoginOutlined rotate={180} className="text-[#102540]" />
								<div className="font-medium">Logout</div>
							</div>
						</button>
					)
				}
		  ].filter(Boolean)
		: authLoading
		? [
				{
					key: 'loading',
					label: (
						<div className="flex items-center gap-2 py-1">
							<UserOutlined className="text-[#102540]" />
							<div>
								<div className="font-medium">Loading account…</div>
								<div className="text-xs text-gray-500">Please wait</div>
							</div>
						</div>
					),
					disabled: true
				}
		  ]
		: [
				{
					key: 'login',
					label: (
						<Link to="/login">
							<div className="flex items-center gap-2 py-1">
								<LoginOutlined className="text-[#102540]" />
								<div>
									<div className="font-medium">Login</div>
									<div className="text-xs text-gray-500">Sign in as Student</div>
								</div>
							</div>
						</Link>
					)
				},
				{
					key: 'admin-login',
					label: (
						<Link to="/admin/login">
							<div className="flex items-center gap-2 py-1">
								<CrownOutlined className="text-[#102540]" />
								<div>
									<div className="font-medium">Admin Login</div>
									<div className="text-xs text-gray-500">Sign in to Admin</div>
								</div>
							</div>
						</Link>
					)
				},
				{ type: 'divider' },
				{
					key: 'register',
					label: (
						<Link to="/register">
							<div className="flex items-center gap-2 py-1">
								<UserAddOutlined className="text-[#102540]" />
								<div>
									<div className="font-medium">Register</div>
									<div className="text-xs text-gray-500">Create a new account</div>
								</div>
							</div>
						</Link>
					)
				}
		  ];

	// Route guards
	function RequireAuth({ children }) {
		const token = localStorage.getItem('token');
		if (!token) return <Navigate to="/" replace />;
		if (authLoading || !user) return <div />; // wait for /me without redirecting
		return children;
	}

	function RequireAdmin({ children }) {
		const token = localStorage.getItem('token');
		if (!token) return <Navigate to="/" replace />;
		if (authLoading || !user) return <div />; // wait for /me without redirecting
		if (user.role !== 'ADMIN') {
			return <Navigate to="/" replace />;
		}
		return children;
	}

	function RequireStudent({ children }) {
		const token = localStorage.getItem('token');
		if (!token) return <Navigate to="/" replace />;
		if (authLoading || !user) return <div />; // wait for /me without redirecting
		if (user.role !== 'STUDENT') {
			// Admins use admin preview route, not student learn pages
			return <Navigate to="/" replace />;
		}
		return children;
	}
	return (
		<Layout style={{ minHeight: '100vh' }} className="bg-gray-50">
			<PublicHeader
				logoUrl={logoUrl}
				brandName={brandName}
				exploreMenu={exploreMenu}
				exploreDropdownContent={exploreDropdownContent}
				jobsMenu={jobsMenu}
				accountMenuItems={accountMenuItems}
				screens={screens}
				user={user}
				courseInProgress={courseInProgress}
				location={location}
				navigate={navigate}
			/>
			{/* CTA strip below header (only on homepage and when logged out) */}
			{!isLoggedIn && location.pathname === '/' && (
			<div className="bg-gray-50 border-b border-gray-100 mt-6 md:mt-8">
				<div className="max-w-screen-xl mx-auto px-4 py-3">
					<div className="flex justify-center">
						<motion.div
							className="p-[3px] rounded-full bg-gradient-to-r from-sky-400/40 via-blue-400/35 to-indigo-400/40 shadow-xl"
							initial={{ opacity: 0, y: -4 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.4 }}
						>
							<div className="flex items-center gap-5 rounded-full px-2 pr-4 py-2 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
								<Button
									type="primary"
									size="large"
									icon={<BookOutlined />}
									shape="round"
									style={{
										background: 'linear-gradient(135deg,#102540 0%,#1b3a5b 50%,#274a74 100%)',
										color: '#ffffff',
										border: 'none',
										boxShadow: '0 10px 22px rgba(16,37,64,0.35)'
									}}
									onClick={() => navigate('/videos')}
								>
									Learn & Get Certificates
								</Button>
								<div className="hidden sm:flex items-center gap-2 text-[#102540] hover:text-[#0c1e33] transition">
									<span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-sky-400/25 via-indigo-400/25 to-violet-400/25 text-[#102540] shadow-md ring-1 ring-[#102540]/20">
										<SolutionOutlined />
									</span>
									<span>Build Your Career</span>
								</div>
								<div className="hidden sm:flex items-center gap-2 text-[#102540] hover:text-[#0c1e33] transition">
									<span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-400/25 via-teal-400/25 to-cyan-400/25 text-[#102540] shadow-md ring-1 ring-[#102540]/20">
										<DollarCircleOutlined />
									</span>
									<span>Earn On MILVEN</span>
								</div>
							</div>
						</motion.div>
					</div>
				</div>
			</div>
			)}
			<Content style={{ padding: '24px', maxWidth: '100%', margin: '0 auto', width: '100%' }}>
				<Routes>
					<Route path="/" element={<Home />} />
					<Route path="/login" element={<LoginPage />} />
					<Route path="/register" element={<RegisterPage />} />
					<Route path="/verify-email" element={<VerifyEmailPage />} />
					<Route path="/forgot-password" element={<ForgotPasswordPage />} />
					<Route path="/reset-password" element={<ResetPasswordPage />} />
					<Route path="/exams/builder" element={<ExamBuilder />} />
					<Route path="/exams/take/:attemptId" element={<ExamTake />} />
					<Route path="/exams/result/:attemptId" element={<ExamResult />} />
					<Route path="/courses" element={<CoursesPage />} />
					<Route path="/videos" element={<Videos />} />
					<Route path="/careers" element={<Careers />} />
					<Route path="/faq" element={<Faq />} />
					<Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
					<Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
						<Route index element={<AdminDashboard />} />
						<Route path="users" element={<AdminUsers />} />
						<Route path="courses" element={<AdminCourses />} />
						<Route path="courses/:id" element={<AdminCourseView />} />
						<Route path="courses/:id/preview" element={<AdminCoursePreview />} />
						<Route path="levels" element={<AdminLevels />} />
						<Route path="products" element={<AdminProducts />} />
						<Route path="students" element={<AdminStudents />} />
						<Route path="students/:id" element={<AdminStudentView />} />
						<Route path="roles" element={<AdminRoles />} />
						{/* Removed explicit Create Course submenu; creation happens in Courses drawer */}
						<Route path="courses/pricing" element={<Placeholder title="Course Pricing" />} />
						<Route path="materials" element={<AdminMaterials />} />
						<Route path="topics" element={<AdminTopics />} />
						<Route path="topics/:id/preview" element={<AdminTopicPreview />} />
						<Route path="exams/:id/edit" element={<AdminExamEditor />} />
						<Route path="revision" element={<AdminRevision />} />
						<Route path="exams/builder" element={<AdminExamBuilder />} />
						<Route path="exams" element={<AdminExams />} />
						<Route path="reports" element={<AdminReports />} />
						<Route path="enrollments" element={<Placeholder title="Enrolled Students" />} />
						<Route path="progress" element={<Placeholder title="Progress Tracking" />} />
						<Route path="invoices" element={<AdminInvoices />} />
						<Route path="purchases" element={<AdminPurchases />} />
						<Route path="subscriptions" element={<AdminSubscriptions />} />
						<Route path="taxes" element={<AdminTaxes />} />
						<Route path="settings" element={<AdminSettings />} />
					</Route>
					{/* Student Portal */}
					<Route path="/student" element={<RequireStudent><StudentLayout /></RequireStudent>}>
						<Route index element={<StudentDashboard />} />
						<Route path="courses" element={<StudentCourses />} />
						<Route path="exams" element={<StudentExams />} />
						<Route path="exams/take/:attemptId" element={<ExamTake />} />
						<Route path="exams/result/:attemptId" element={<ExamResult />} />
						<Route path="billing" element={<StudentBilling />} />
						<Route path="invoices" element={<StudentInvoices />} />
						<Route path="account" element={<Account />} />
						<Route path="learn/:id" element={<AdminCoursePreview />} />
					</Route>
					{/* Learning route */}
					{/* removed standalone /learn; now under /student/learn/:id */}
					<Route path="/admin/login" element={<AdminLoginPage />} />
					<Route path="/admin/topics" element={<AdminTopics />} />
					<Route path="/admin/questions" element={<AdminQuestions />} />
					<Route path="/admin/revision" element={<AdminRevision />} />
					<Route path="/admin/videos" element={<AdminVideos />} />
				</Routes>
			</Content>
			{location.pathname.startsWith('/admin') || location.pathname.startsWith('/student') ? (
				<Footer className="bg-[#102540] text-white" style={{ padding: '12px 24px' }}>
					<div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
						<Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14 }}>
							© {new Date().getFullYear()} Milven Finance School
						</Typography.Text>
					</div>
				</Footer>
			) : (
				<Footer className="bg-[#102540] text-white" style={{ padding: 0 }}>
					<div className="max-w-screen-xl mx-auto px-4 py-12">
						<Row gutter={[24, 24]}>
							<Col xs={24} sm={12} lg={6}>
								<Typography.Title level={5} style={{ color: 'white', marginBottom: 12 }}>CERTIFIED COURSES</Typography.Title>
								<div className="h-px bg-white/10 mb-4" />
								<ul className="space-y-2 text-gray-200">
									<li><a className="hover:text-white" href="#">Business</a></li>
										<li><a className="hover:text-white" href="#">Teaching & Academics</a></li>
								</ul>
							</Col>
							<Col xs={24} sm={12} lg={6}>
								<Typography.Title level={5} style={{ color: 'white', marginBottom: 12 }}>ABOUT</Typography.Title>
								<div className="h-px bg-white/10 mb-4" />
								<ul className="space-y-2 text-gray-200">
									<li><a className="hover:text-white" href="#">Our Story</a></li>
									<li><a className="hover:text-white" href="#">Our Team & Culture</a></li>
									<li><a className="hover:text-white" href="#">Learning on Milven</a></li>
									</ul>
							</Col>
							<Col xs={24} sm={12} lg={6}>
								<Typography.Title level={5} style={{ color: 'white', marginBottom: 12 }}>QUALITY LEARNING</Typography.Title>
								<div className="h-px bg-white/10 mb-4" />
								<ul className="space-y-2 text-gray-200">
									<li><a className="hover:text-white" href="#">Accreditation</a></li>
									<li><a className="hover:text-white" href="#">All Certificates</a></li>
									<li><a className="hover:text-white" href="#">Free Courses</a></li>
								</ul>
							</Col>
							<Col xs={24} sm={12} lg={6}>
								<Typography.Title level={5} style={{ color: 'white', marginBottom: 12 }}>DISCOVER MORE</Typography.Title>
								<div className="h-px bg-white/10 mb-4" />
								<ul className="space-y-2 text-gray-200">
										<li><a className="hover:text-white" href="#">Contact Us</a></li>
										<li><a className="hover:text-white" href="#">About Us</a></li>
									<li><a className="hover:text-white" href="#">Download App</a></li>
								
									<li className="flex gap-3 mt-2">
										<a href="#" aria-label="Facebook" className="text-white/70 hover:text-white"><FacebookFilled /></a>
										<a href="#" aria-label="Twitter" className="text-white/70 hover:text-white"><TwitterSquareFilled /></a>
										<a href="#" aria-label="LinkedIn" className="text-white/70 hover:text-white"><LinkedinFilled /></a>
										</li>
								</ul>
							</Col>
						</Row>
						<div className="h-px bg-white/10 my-8" />
						<div className="flex flex-col md:flex-row items-center justify-between gap-3 text-gray-300">
							<div className="flex items-center gap-3">
								<img src={logoUrl} alt={brandName} className="h-6 w-auto" />
							</div>
							<div className="text-center md:text-right">
								<Typography.Text style={{ color: 'rgba(255,255,255,0.7)' }}>
									© {new Date().getFullYear()} {brandName}. All rights reserved.
								</Typography.Text>
							</div>
						</div>
					</div>
				</Footer>
			)}
		</Layout>
	);
}


