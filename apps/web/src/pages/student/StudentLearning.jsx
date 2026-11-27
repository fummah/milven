import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Progress } from 'antd';
import {
	ArrowRightOutlined, BookOutlined, CalendarOutlined, ClockCircleOutlined, ReloadOutlined
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import {
	LearningCategoryGrid, LearningCenterFallback, LearningCenterHero
} from '../../components/learning-center/LearningCenter.jsx';

const COURSE_KEY = 'milven.learning-center.selectedCourse';

function formatDuration(seconds) {
	const total = Math.max(0, Number(seconds) || 0);
	if (!total) return 'No time recorded yet';
	const hours = Math.floor(total / 3600);
	const minutes = Math.round((total % 3600) / 60);
	if (hours) return `${hours}h ${minutes ? `${minutes}m` : ''}`.trim();
	return `${Math.max(1, minutes)}m`;
}

function formatDateTime(value) {
	if (!value) return null;
	try {
		return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
	} catch {
		return null;
	}
}

function statsFromResult(result, read) {
	if (result?.status !== 'fulfilled') return { ok: false };
	try {
		return { ok: true, ...read(result.value.data || {}) };
	} catch {
		return { ok: false };
	}
}

export default function StudentLearning() {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const requestedCourse = useRef(
		searchParams.get('courseId')
		|| (typeof window !== 'undefined' ? localStorage.getItem(COURSE_KEY) : '')
		|| ''
	);

	const [courses, setCourses] = useState([]);
	const [courseId, setCourseId] = useState(undefined);
	const [coursesLoading, setCoursesLoading] = useState(true);
	const [courseError, setCourseError] = useState('');
	const [coursesReloadKey, setCoursesReloadKey] = useState(0);

	const [progressCourses, setProgressCourses] = useState([]);
	const [progressAvailable, setProgressAvailable] = useState(true);
	const [stats, setStats] = useState(null);
	const [statsLoading, setStatsLoading] = useState(false);
	const [statsError, setStatsError] = useState('');
	const [statsReloadKey, setStatsReloadKey] = useState(0);

	useEffect(() => {
		let cancelled = false;
		setCoursesLoading(true);
		setCourseError('');
		Promise.allSettled([
			api.get('/api/slides/library/courses'),
			api.get('/api/learning/me/courses')
		]).then(([courseResult, progressResult]) => {
			if (cancelled) return;
			if (courseResult.status === 'fulfilled') {
				const list = courseResult.value.data?.courses || [];
				setCourses(list);
				const requested = requestedCourse.current;
				const chosen = list.find(course => course.id === requested)?.id || list[0]?.id || undefined;
				setCourseId(chosen);
				if (chosen) requestedCourse.current = chosen;
			} else {
				setCourses([]);
				setCourseError('Could not load your enrolled courses.');
			}
			if (progressResult.status === 'fulfilled') {
				setProgressCourses(progressResult.value.data?.courses || []);
				setProgressAvailable(true);
			} else {
				setProgressCourses([]);
				setProgressAvailable(false);
			}
		}).finally(() => {
			if (!cancelled) setCoursesLoading(false);
		});
		return () => { cancelled = true; };
	}, [coursesReloadKey]);

	useEffect(() => {
		if (!courseId) {
			setStats(null);
			setStatsLoading(false);
			setStatsError('');
			return undefined;
		}
		const controller = new AbortController();
		let cancelled = false;
		setStatsLoading(true);
		setStatsError('');
		const request = (url, params) => api.get(url, { params, signal: controller.signal });
		Promise.allSettled([
			request('/api/module-notes/unified', { courseId, page: 1, limit: 1, status: 'PUBLISHED' }),
			request('/api/summary-sheets/unified', { courseId, page: 1, limit: 1, status: 'PUBLISHED' }),
			request('/api/formulas/unified', { courseId, page: 1, limit: 1 }),
			request('/api/slides/library/stats', { courseId })
		]).then(results => {
			if (cancelled || controller.signal.aborted) return;
			const next = {
				notes: statsFromResult(results[0], data => ({
					total: Number(data.total) || 0,
					pdf: Number(data.counts?.uploadedPdf) || 0
				})),
				summaries: statsFromResult(results[1], data => ({
					total: Number(data.total) || 0,
					pdf: Number(data.counts?.uploadedPdf) || 0
				})),
				formulas: statsFromResult(results[2], data => ({
					total: Number(data.total) || 0,
					cards: (Number(data.counts?.ai) || 0) + (Number(data.counts?.manual) || 0),
					pdf: Number(data.counts?.uploadedPdf) || 0
				})),
				slides: statsFromResult(results[3], data => ({
					presentations: Number(data.presentations) || 0,
					slides: Number(data.slides) || 0
				}))
			};
			setStats(next);
			setStatsError(Object.values(next).every(item => !item.ok) ? 'Resource counts are temporarily unavailable.' : '');
		}).finally(() => {
			if (!cancelled && !controller.signal.aborted) setStatsLoading(false);
		});
		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [courseId, statsReloadKey]);

	useEffect(() => {
		if (!courseId) return;
		try { localStorage.setItem(COURSE_KEY, courseId); } catch {}
		const next = new URLSearchParams(searchParams);
		next.set('courseId', courseId);
		if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
	}, [courseId, searchParams, setSearchParams]);

	const selectedCourse = courses.find(course => course.id === courseId);
	const selectedProgress = progressCourses.find(course => course.courseId === courseId);
	const progressPercent = Math.max(0, Math.min(100, Math.round(Number(selectedProgress?.progressPercent) || 0)));
	const hasProgress = Boolean(selectedProgress && (progressPercent > 0 || Number(selectedProgress.timeSpentSec) > 0));
	const progressSummary = hasProgress
		? `${progressPercent}% curriculum progress - ${formatDuration(selectedProgress.timeSpentSec)} studied`
		: (selectedProgress ? 'No curriculum progress recorded yet.' : 'No saved curriculum progress yet. Open your course curriculum to begin.');

	const categoryCards = useMemo(() => {
		const notes = stats?.notes;
		const summaries = stats?.summaries;
		const formulas = stats?.formulas;
		const slides = stats?.slides;
		const countsPending = statsLoading || !stats;
		return [
			{
				tone: 'notes',
				title: 'Milven Module Notes',
				description: 'Build a deeper understanding of the CFA curriculum with comprehensive, exam-focused learning notes.',
				cta: 'Explore Notes',
				to: '/student/module-notes',
				loading: countsPending,
				statsUnavailable: !countsPending && Boolean(notes && !notes.ok),
				empty: !countsPending && notes?.ok && notes.total === 0,
				stats: [
					{ label: 'Available notes', value: notes?.total || 0 },
					{ label: 'PDF notes', value: notes?.pdf || 0 }
				]
			},
			{
				tone: 'summaries',
				title: 'Milven Summary Sheets',
				description: 'Revise essential concepts efficiently with concise, high-impact, exam-focused study sheets.',
				cta: 'Explore Summaries',
				to: '/student/summary-sheets',
				loading: countsPending,
				statsUnavailable: !countsPending && Boolean(summaries && !summaries.ok),
				empty: !countsPending && summaries?.ok && summaries.total === 0,
				stats: [
					{ label: 'Summary sheets', value: summaries?.total || 0 },
					{ label: 'PDF summaries', value: summaries?.pdf || 0 }
				]
			},
			{
				tone: 'formulas',
				title: 'Milven Formula Book',
				description: 'Master essential financial equations, calculations and investment models with your dedicated CFA formula library.',
				cta: 'Explore Formulas',
				to: '/student/formula-book',
				loading: countsPending,
				statsUnavailable: !countsPending && Boolean(formulas && !formulas.ok),
				empty: !countsPending && formulas?.ok && formulas.total === 0,
				stats: [
					{ label: 'Formula cards', value: formulas?.cards || 0 },
					{ label: 'PDF books', value: formulas?.pdf || 0 }
				]
			},
			{
				tone: 'slides',
				title: 'Milven Slides',
				description: 'Study curriculum-aligned lecture presentations, visual explanations and worked academic examples.',
				cta: 'Explore Slides',
				to: '/student/slides',
				loading: countsPending,
				statsUnavailable: !countsPending && Boolean(slides && !slides.ok),
				empty: !countsPending && slides?.ok && slides.presentations === 0,
				stats: [
					{ label: 'Presentations', value: slides?.presentations || 0 },
					{ label: 'Total slides', value: slides?.slides || 0 }
				]
			}
		];
	}, [stats, statsLoading]);

	const noCourses = !coursesLoading && !courseError && courses.length === 0;

	return (
		<div className="learning-center-page">
			<LearningCenterHero
				courses={courses}
				courseId={courseId}
				onCourseChange={setCourseId}
				coursesLoading={coursesLoading}
				selectedProgress={selectedProgress}
			/>

			{courseError ? (
				<div className="learning-center-error">
					<Alert
						type="error"
						showIcon
						message={courseError}
						action={<Button size="small" icon={<ReloadOutlined />} onClick={() => setCoursesReloadKey(key => key + 1)}>Retry</Button>}
					/>
				</div>
			) : null}

			{statsError ? (
				<div className="learning-center-error">
					<Alert
						type="warning"
						showIcon
						message={statsError}
						action={<Button size="small" icon={<ReloadOutlined />} onClick={() => setStatsReloadKey(key => key + 1)}>Retry Counts</Button>}
					/>
				</div>
			) : null}

			{noCourses ? (
				<LearningCenterFallback
					title="No active course access"
					description="You do not currently have access to any learning courses. Browse the available CFA courses to get started."
					action={<Button type="primary" onClick={() => navigate('/courses')}>Browse Courses</Button>}
				/>
			) : coursesLoading ? (
				<>
					<div className="learning-center-section-head">
						<div>
							<h2>Explore Your Learning Resources</h2>
							<p>Choose how you want to study today.</p>
						</div>
					</div>
					<LearningCategoryGrid cards={categoryCards} courseId={courseId} />
				</>
			) : (
				<>
					<div className="learning-center-section-head">
						<div>
							<h2>Explore Your Learning Resources</h2>
							<p>Choose how you want to study today.</p>
						</div>
						{selectedCourse && <span style={{ color: '#64748b', fontSize: 12 }}>{selectedCourse.name} resources</span>}
					</div>
					<LearningCategoryGrid cards={categoryCards} courseId={courseId} />

					{selectedCourse && (
						<section className="learning-center-continue">
							<div className="learning-center-continue-head">
								<h2>Continue Learning</h2>
								<p>Pick up where you left off or start with a learning resource above.</p>
							</div>
							{progressAvailable ? (
								<div className="learning-center-continue-card">
									<div className="learning-center-continue-copy">
										<strong>{selectedCourse.name}</strong>
										<span>{progressSummary}</span>
										{selectedProgress?.lastUpdated && (
											<span>
												<CalendarOutlined style={{ marginRight: 5 }} />
												Last activity {formatDateTime(selectedProgress.lastUpdated)}
											</span>
										)}
									</div>
									{selectedProgress && (
										<div className="learning-center-progress">
											<Progress percent={progressPercent} size="small" strokeColor="#2563eb" />
											<span style={{ display: 'block', color: '#64748b', fontSize: 11, marginTop: 2 }}>
												<ClockCircleOutlined style={{ marginRight: 5 }} />
												{hasProgress ? `${formatDuration(selectedProgress.timeSpentSec)} recorded` : 'No study time recorded'}
											</span>
										</div>
									)}
									<div className="learning-center-continue-actions">
										<Button type="primary" icon={<BookOutlined />} onClick={() => navigate(`/student/learn/${courseId}?back=${encodeURIComponent('/student/learning')}`)}>
											{hasProgress ? 'Continue Curriculum' : 'Start Curriculum'}
										</Button>
										<Button onClick={() => navigate('/student/courses')}>My Courses</Button>
									</div>
								</div>
							) : (
								<div className="learning-center-history-empty">
									<span>Learning progress is temporarily unavailable. Your course resources are still available above.</span>
									<Button size="small" onClick={() => navigate('/student/courses')}>My Courses <ArrowRightOutlined /></Button>
								</div>
							)}
						</section>
					)}
				</>
			)}
		</div>
	);
}
