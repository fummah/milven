import React from 'react';
import { levelLabel } from '../../lib/slideUrls';

const TYPES = {
	SLIDES: {
		label: 'MILVEN SLIDES',
		className: 'is-slides'
	},
	MODULE_NOTES: {
		label: 'MILVEN MODULE NOTES',
		className: 'is-notes'
	},
	FORMULA_BOOK: {
		label: 'MILVEN FORMULA BOOK',
		className: 'is-formula'
	},
	SUMMARY_SHEET: {
		label: 'MILVEN SUMMARY SHEETS',
		className: 'is-summary'
	}
};

function CoverArt({ type }) {
	const common = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
	if (type === 'FORMULA_BOOK') {
		return (
			<svg viewBox="0 0 190 130" aria-hidden="true" className="learning-cover-art">
				<rect x="62" y="17" width="100" height="84" rx="8" fill="rgba(255,255,255,0.1)" transform="rotate(5 112 59)" />
				<rect x="46" y="24" width="106" height="88" rx="8" fill="rgba(7,20,39,0.72)" stroke="rgba(255,255,255,0.28)" />
				<rect x="58" y="38" width="40" height="16" rx="4" fill="rgba(255,255,255,0.13)" />
				<text x="78" y="50" textAnchor="middle" fill="#fff" fontFamily="Georgia, serif" fontSize="11">x²</text>
				<rect x="58" y="62" width="64" height="1" fill="rgba(255,255,255,0.24)" />
				<path d="M59 94 L77 80 L92 86 L111 66 L139 76" {...common} stroke="#d4a72c" strokeWidth="2.4" />
				<circle cx="111" cy="66" r="2.4" fill="#fff" />
				<rect x="146" y="82" width="26" height="35" rx="5" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.26)" />
				{[0, 1, 2].map(row => [0, 1].map(col => <rect key={`${row}-${col}`} x={152 + col * 9} y={89 + row * 8} width="5" height="4" rx="1.2" fill={row === 1 && col === 1 ? '#d4a72c' : 'rgba(255,255,255,0.34)'} />))}
			</svg>
		);
	}
	if (type === 'MODULE_NOTES') {
		return (
			<svg viewBox="0 0 190 130" aria-hidden="true" className="learning-cover-art">
				<rect x="62" y="17" width="101" height="93" rx="8" fill="rgba(255,255,255,0.12)" transform="rotate(5 112 63)" />
				<rect x="45" y="22" width="105" height="95" rx="8" fill="rgba(8,26,52,0.74)" stroke="rgba(255,255,255,0.27)" />
				<rect x="58" y="38" width="47" height="5" rx="2.5" fill="#8bb8ff" />
				{[50, 60, 70, 80, 90].map((y, index) => <rect key={y} x="58" y={y} width={index === 4 ? 36 : 64} height="3.4" rx="1.7" fill="rgba(255,255,255,0.28)" />)}
				<path d="M142 94 L162 74 L169 81 L149 101 L139 104 Z" fill="#d4a72c" />
				<path d="M139 104 L149 101 L142 94 Z" fill="#fff" opacity="0.7" />
			</svg>
		);
	}
	if (type === 'SUMMARY_SHEET') {
		return (
			<svg viewBox="0 0 190 130" aria-hidden="true" className="learning-cover-art">
				<rect x="65" y="17" width="99" height="91" rx="8" fill="rgba(255,255,255,0.1)" transform="rotate(5 114 62)" />
				<rect x="46" y="22" width="105" height="94" rx="8" fill="rgba(3,47,40,0.73)" stroke="rgba(255,255,255,0.25)" />
				{[39, 56, 73, 90].map(y => (
					<g key={y}>
						<rect x="59" y={y} width="10" height="10" rx="2.4" fill="none" stroke="#8ff0c3" strokeWidth="1.4" />
						<path d={`M61.5 ${y + 5} l2.4 2.4 l4.5 -5`} {...common} stroke="#fff" strokeWidth="1.5" />
						<rect x="76" y={y + 2.5} width="49" height="3.4" rx="1.7" fill="rgba(255,255,255,0.3)" />
					</g>
				))}
				<circle cx="148" cy="97" r="12" fill="#8ff0c3" />
				<path d="M143 97 l3.4 3.4 l6 -8" {...common} stroke="#064e3b" strokeWidth="2.1" />
			</svg>
		);
	}
	return (
		<svg viewBox="0 0 190 130" aria-hidden="true" className="learning-cover-art">
			<rect x="64" y="16" width="102" height="78" rx="7" fill="rgba(255,255,255,0.1)" transform="rotate(5 115 55)" />
			<rect x="47" y="22" width="108" height="83" rx="7" fill="rgba(10,24,64,0.75)" stroke="rgba(255,255,255,0.27)" />
			<rect x="60" y="36" width="49" height="4" rx="2" fill="rgba(255,255,255,0.38)" />
			<rect x="60" y="46" width="33" height="3" rx="1.5" fill="rgba(255,255,255,0.2)" />
			<path d="M61 91 L78 77 L94 83 L112 65 L140 73" {...common} stroke="#aebcff" strokeWidth="2.4" />
			<circle cx="112" cy="65" r="2.4" fill="#fff" />
			<rect x="143" y="82" width="8" height="31" rx="3" fill="rgba(255,255,255,0.16)" />
			<rect x="155" y="72" width="8" height="41" rx="3" fill="rgba(255,255,255,0.16)" />
			<rect x="167" y="64" width="8" height="49" rx="3" fill="#d4a72c" opacity="0.8" />
		</svg>
	);
}

function joinSecondary(...values) {
	return values.filter(Boolean).filter((value, index, list) => list.indexOf(value) === index);
}

export default function LearningResourceCover({
	resourceType = 'SLIDES',
	resourceTitle,
	volumeName,
	learningModuleName,
	level,
	curriculumYear,
	wholeVolume = false,
	compact = false,
	className = ''
}) {
	const type = TYPES[resourceType] || TYPES.SLIDES;
	const title = resourceTitle || learningModuleName || volumeName || 'Learning Resource';
	const secondary = joinSecondary(
		volumeName && volumeName !== title ? volumeName : null,
		learningModuleName && learningModuleName !== title && learningModuleName !== volumeName ? learningModuleName : null
	);

	return (
		<div className={`learning-resource-cover ${type.className} ${compact ? 'is-compact' : 'is-full'} ${className}`.trim()}>
			<div className="learning-cover-glow" aria-hidden="true" />
			<div className="learning-cover-top">
				<div className="learning-cover-brand" aria-label="Milven Finance School">
					<span className="learning-cover-brand-mark">M</span>
					<span className="learning-cover-brand-name">MILVEN</span>
					{!compact && <span className="learning-cover-brand-sub">FINANCE SCHOOL</span>}
				</div>
				<div className="learning-cover-top-meta">
					{level && <span className="learning-cover-level">CFA {levelLabel(level).toUpperCase()}</span>}
					{curriculumYear && <span className="learning-cover-year">{curriculumYear}</span>}
				</div>
			</div>
			<div className="learning-cover-main">
				<div className="learning-cover-copy">
					<div className="learning-cover-category">{type.label}</div>
					<div className="learning-cover-title">{title}</div>
					{secondary.length > 0 && <div className="learning-cover-volume">{secondary.join(' · ')}</div>}
					{wholeVolume && <span className="learning-cover-badge">Whole Volume Review</span>}
				</div>
				<div className="learning-cover-visual">
					<CoverArt type={resourceType} />
				</div>
			</div>
			<svg className="learning-cover-lines" viewBox="0 0 300 90" preserveAspectRatio="none" aria-hidden="true">
				<path d="M0 74 C68 32 148 98 300 34" fill="none" stroke="#d4a72c" strokeWidth="1.4" opacity="0.55" />
				<path d="M0 88 C88 50 174 104 300 56" fill="none" stroke="#7ea7ff" strokeWidth="1" opacity="0.32" />
			</svg>
		</div>
	);
}
