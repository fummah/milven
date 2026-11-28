import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import {
	LearningCategoryGrid, LearningCenterFallback, LearningCenterHero
} from '../../components/learning-center/LearningCenter.jsx';

const COURSE_KEY = 'milven.learning-center.selectedCourse';

const CATEGORY_CARDS = [
	{
		tone: 'notes',
		title: 'Milven Module Notes',
		description: 'Comprehensive, exam-focused notes to master your CFA curriculum.',
		cta: 'Explore Notes',
		to: '/student/module-notes'
	},
	{
		tone: 'summaries',
		title: 'Milven Summary Sheets',
		description: 'Revise key concepts quickly with concise, exam-focused summaries.',
		cta: 'Explore Summaries',
		to: '/student/summary-sheets'
	},
	{
		tone: 'formulas',
		title: 'Milven Formula Book',
		description: 'Master essential financial formulas, calculations and investment models.',
		cta: 'Explore Formulas',
		to: '/student/formula-book'
	},
	{
		tone: 'slides',
		title: 'Milven Slides',
		description: 'Study curriculum-aligned presentations and visual explanations.',
		cta: 'Explore Slides',
		to: '/student/slides'
	}
];

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

	useEffect(() => {
		window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
	}, []);

	useEffect(() => {
		let cancelled = false;
		setCoursesLoading(true);
		setCourseError('');
		api.get('/api/slides/library/courses').then(response => {
			if (cancelled) return;
			const list = response.data?.courses || [];
			setCourses(list);
			const requested = requestedCourse.current;
			const chosen = list.find(course => course.id === requested)?.id || list[0]?.id || undefined;
			setCourseId(chosen);
			if (chosen) requestedCourse.current = chosen;
		}).catch(() => {
			if (!cancelled) {
				setCourses([]);
				setCourseError('Could not load your enrolled courses.');
			}
		}).finally(() => {
			if (!cancelled) setCoursesLoading(false);
		});
		return () => { cancelled = true; };
	}, [coursesReloadKey]);

	useEffect(() => {
		if (!courseId) return;
		try { localStorage.setItem(COURSE_KEY, courseId); } catch {}
		const next = new URLSearchParams(searchParams);
		next.set('courseId', courseId);
		if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
	}, [courseId, searchParams, setSearchParams]);

	const noCourses = !coursesLoading && !courseError && courses.length === 0;

	return (
		<div className="learning-center-page">
			<LearningCenterHero
				courses={courses}
				courseId={courseId}
				onCourseChange={setCourseId}
				coursesLoading={coursesLoading}
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

			{noCourses ? (
				<LearningCenterFallback
					title="No active course access"
					description="You do not currently have access to any learning courses. Browse the available CFA courses to get started."
					action={<Button type="primary" onClick={() => navigate('/courses')}>Browse Courses</Button>}
				/>
			) : (
				<>
					<div className="learning-center-section-head">
						<div>
							<h2>Explore Your Learning Resources</h2>
							<p>Choose how you want to study today.</p>
						</div>
					</div>
					<LearningCategoryGrid cards={CATEGORY_CARDS} courseId={courseId} />
				</>
			)}
		</div>
	);
}
