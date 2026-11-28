import React from 'react';
import { Link } from 'react-router-dom';
import { Select, Skeleton } from 'antd';
import {
	ArrowRightOutlined, BookOutlined, FilePptOutlined, FileTextOutlined,
	FunctionOutlined, ReadOutlined
} from '@ant-design/icons';
import './learning-center.css';

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };

function LearningCenterArtwork() {
	return (
		<svg className="learning-center-hero-art" viewBox="0 0 320 180" aria-hidden="true">
			<defs>
				<linearGradient id="lc-card" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="rgba(255,255,255,0.28)" />
					<stop offset="1" stopColor="rgba(255,255,255,0.04)" />
				</linearGradient>
			</defs>
			<rect x="72" y="18" width="180" height="112" rx="12" fill="rgba(255,255,255,0.1)" transform="rotate(5 162 74)" />
			<rect x="48" y="26" width="184" height="118" rx="12" fill="url(#lc-card)" transform="rotate(-3 140 85)" />
			<rect x="34" y="34" width="178" height="118" rx="12" fill="rgba(7,20,39,0.78)" stroke="rgba(255,255,255,0.26)" />
			<rect x="54" y="52" width="66" height="6" rx="3" fill="#d4a72c" />
			<rect x="54" y="66" width="112" height="4" rx="2" fill="rgba(255,255,255,0.18)" />
			<rect x="54" y="76" width="88" height="4" rx="2" fill="rgba(255,255,255,0.14)" />
			<path d="M56 126 L82 105 L104 113 L130 88 L158 99 L186 72" fill="none" stroke="#d4a72c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
			<circle cx="130" cy="88" r="3" fill="#fff" />
			<circle cx="186" cy="72" r="3" fill="#fff" />
			<rect x="214" y="62" width="86" height="70" rx="9" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.24)" transform="rotate(7 257 97)" />
			<rect x="229" y="77" width="50" height="5" rx="2.5" fill="rgba(255,255,255,0.45)" />
			<rect x="229" y="89" width="36" height="4" rx="2" fill="rgba(255,255,255,0.22)" />
			<path d="M229 112 l8 -9 l8 5 l12 -14 l11 7" fill="none" stroke="#d4a72c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
			<circle cx="282" cy="35" r="18" fill="rgba(212,167,44,0.18)" stroke="#d4a72c" strokeWidth="1.5" />
			<text x="282" y="41" textAnchor="middle" fill="#d4a72c" fontFamily="Georgia, serif" fontSize="18">ƒ</text>
		</svg>
	);
}

export function LearningCenterHero({ courses = [], courseId, onCourseChange, coursesLoading }) {
	return (
		<section className="learning-center-hero">
			<div className="learning-center-hero-copy">
				<div className="learning-center-eyebrow">MILVEN FINANCE SCHOOL</div>
				<h1>Your Learning Center</h1>
				<p>Learn, revise and master your CFA curriculum in one place.</p>
			</div>
			<div className="learning-center-hero-side">
				<LearningCenterArtwork />
				<div className="learning-center-course-panel">
					<div className="learning-center-course-label">
						<span>Selected Course</span>
					</div>
					{coursesLoading ? (
						<Skeleton.Input active block size="small" />
					) : courses.length ? (
						<Select
							value={courseId}
							onChange={onCourseChange}
							options={courses.map(course => ({
								value: course.id,
								label: `${course.name}${course.level ? ` (${LEVEL_LABELS[course.level] || course.level})` : ''}`
							}))}
							showSearch
							optionFilterProp="label"
							aria-label="Select learning course"
							popupMatchSelectWidth={false}
						/>
					) : (
						<span className="learning-center-no-course">No active course</span>
					)}
				</div>
			</div>
		</section>
	);
}

function CategoryArtwork({ variant }) {
	const art = {
		notes: (
			<>
				<rect x="40" y="20" width="122" height="98" rx="10" fill="rgba(255,255,255,0.16)" transform="rotate(5 101 69)" />
				<rect x="25" y="24" width="124" height="104" rx="10" fill="rgba(255,255,255,0.2)" transform="rotate(-3 87 76)" />
				<rect x="20" y="27" width="122" height="105" rx="10" fill="rgba(9,28,54,0.7)" stroke="rgba(255,255,255,0.25)" />
				<rect x="38" y="45" width="57" height="6" rx="3" fill="#a7c7ff" />
				{[63, 76, 89, 102, 114].map((y, index) => <rect key={y} x="38" y={y} width={index === 4 ? 43 : 82} height="4" rx="2" fill="rgba(255,255,255,0.3)" />)}
				<path d="M146 103 L171 78 L179 86 L154 111 L143 114 Z" fill="#f0b44c" />
				<path d="M143 114 L154 111 L146 103 Z" fill="#fff" opacity="0.72" />
			</>
		),
		summaries: (
			<>
				<rect x="46" y="19" width="118" height="102" rx="10" fill="rgba(255,255,255,0.16)" transform="rotate(5 105 70)" />
				<rect x="26" y="24" width="124" height="105" rx="10" fill="rgba(255,255,255,0.2)" transform="rotate(-3 88 76)" />
				<rect x="21" y="27" width="122" height="104" rx="10" fill="rgba(4,51,43,0.72)" stroke="rgba(255,255,255,0.24)" />
				{[45, 65, 85, 105].map((y) => (
					<g key={y}>
						<rect x="37" y={y - 10} width="12" height="12" rx="3" fill="none" stroke="#8ff0c3" strokeWidth="1.6" />
						<path d={`M40 ${y - 4} l3 3 l5 -6`} fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
						<rect x="57" y={y - 7} width="64" height="4" rx="2" fill="rgba(255,255,255,0.35)" />
					</g>
				))}
				<circle cx="153" cy="113" r="13" fill="#8ff0c3" />
				<path d="M147 113 l4 4 l8 -10" fill="none" stroke="#064e3b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
			</>
		),
		formulas: (
			<>
				<rect x="48" y="19" width="116" height="103" rx="10" fill="rgba(255,255,255,0.16)" transform="rotate(4 106 70)" />
				<rect x="25" y="24" width="126" height="105" rx="10" fill="rgba(255,255,255,0.2)" transform="rotate(-3 88 76)" />
				<rect x="21" y="27" width="126" height="105" rx="10" fill="rgba(46,32,7,0.64)" stroke="rgba(255,255,255,0.28)" />
				<rect x="38" y="44" width="47" height="21" rx="4" fill="rgba(255,255,255,0.18)" />
				<text x="61" y="59" textAnchor="middle" fill="#fff" fontFamily="Georgia, serif" fontSize="13">x²</text>
				<rect x="38" y="74" width="79" height="1" fill="rgba(255,255,255,0.3)" />
				<path d="M40 111 L62 94 L80 101 L104 76 L126 86" fill="none" stroke="#f0b44c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
				<circle cx="104" cy="76" r="3" fill="#fff" />
				<rect x="130" y="47" width="7" height="17" rx="2" fill="#f0b44c" opacity="0.8" />
			</>
		),
		slides: (
			<>
				<rect x="50" y="18" width="116" height="83" rx="9" fill="rgba(255,255,255,0.16)" transform="rotate(5 108 60)" />
				<rect x="31" y="25" width="126" height="88" rx="9" fill="rgba(255,255,255,0.2)" transform="rotate(-3 94 69)" />
				<rect x="24" y="30" width="128" height="91" rx="9" fill="rgba(12,25,63,0.78)" stroke="rgba(255,255,255,0.28)" />
				<rect x="41" y="47" width="62" height="5" rx="2.5" fill="rgba(255,255,255,0.38)" />
				<rect x="41" y="59" width="42" height="4" rx="2" fill="rgba(255,255,255,0.2)" />
				<path d="M42 102 L63 86 L82 93 L104 70 L132 80" fill="none" stroke="#b7abff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
				<circle cx="104" cy="70" r="3" fill="#fff" />
				<rect x="139" y="108" width="7" height="16" rx="3" fill="#d4a72c" opacity="0.8" />
			</>
		)
	};
	return <svg viewBox="0 0 190 145" aria-hidden="true" className="learning-category-art">{art[variant]}</svg>;
}

const CARD_ICONS = {
	notes: <BookOutlined />,
	summaries: <FileTextOutlined />,
	formulas: <FunctionOutlined />,
	slides: <FilePptOutlined />
};

export function LearningCategoryCard({ card, courseId }) {
	const to = courseId ? `${card.to}?courseId=${encodeURIComponent(courseId)}` : card.to;
	return (
		<Link className={`learning-category-card learning-category-${card.tone}`} to={to} aria-label={card.cta}>
			<div className="learning-category-visual">
				<div className="learning-category-icon">{CARD_ICONS[card.tone]}</div>
				<CategoryArtwork variant={card.tone} />
			</div>
			<div className="learning-category-body">
				<h3>{card.title}</h3>
				<p>{card.description}</p>
				<span className="learning-category-cta">
					{card.cta}
					<ArrowRightOutlined />
				</span>
			</div>
		</Link>
	);
}

export function LearningCategoryGrid({ cards, courseId }) {
	return (
		<div className="learning-category-grid">
			{cards.map(card => <LearningCategoryCard key={card.tone} card={card} courseId={courseId} />)}
		</div>
	);
}

export function LearningCenterFallback({ title, description, action }) {
	return (
		<div className="learning-center-empty">
			<div className="learning-center-empty-icon"><ReadOutlined /></div>
			<h2>{title}</h2>
			<p>{description}</p>
			{action}
		</div>
	);
}
