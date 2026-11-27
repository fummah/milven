import React, { useState } from 'react';
import { Button, Empty, Input, Skeleton, Tooltip } from 'antd';
import {
	AppstoreOutlined, FilterOutlined, SearchOutlined, TableOutlined
} from '@ant-design/icons';
import './learning-explorer.css';

function HeroArtwork({ variant }) {
	const line = '#d4a72c';
	const pale = 'rgba(255,255,255,0.16)';
	const soft = 'rgba(255,255,255,0.28)';
	return (
		<svg className="learning-hero-art" viewBox="0 0 280 150" aria-hidden="true">
			<defs>
				<linearGradient id="hero-card" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="rgba(255,255,255,0.3)" />
					<stop offset="1" stopColor="rgba(255,255,255,0.06)" />
				</linearGradient>
			</defs>
			{variant === 'slides' && (
				<g transform="translate(30 12)">
					<rect x="56" y="4" width="150" height="92" rx="10" fill={pale} transform="rotate(4 131 50)" />
					<rect x="38" y="15" width="156" height="96" rx="10" fill="url(#hero-card)" transform="rotate(-3 116 63)" />
					<rect x="20" y="25" width="164" height="101" rx="11" fill="rgba(8,23,44,0.72)" stroke={soft} />
					<path d="M42 103 L72 78 L96 88 L126 58 L160 70" fill="none" stroke={line} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
					<circle cx="72" cy="78" r="3" fill="#fff" />
					<circle cx="126" cy="58" r="3" fill="#fff" />
					<rect x="42" y="43" width="63" height="5" rx="2.5" fill={pale} />
					<rect x="42" y="56" width="40" height="4" rx="2" fill={pale} />
					<rect x="142" y="112" width="8" height="18" rx="3" fill={line} opacity="0.8" />
				</g>
			)}
			{variant === 'notes' && (
				<g transform="translate(35 7)">
					<rect x="62" y="12" width="132" height="118" rx="10" fill={pale} transform="rotate(5 128 71)" />
					<rect x="34" y="17" width="138" height="122" rx="10" fill="url(#hero-card)" transform="rotate(-4 103 78)" />
					<rect x="20" y="23" width="138" height="118" rx="10" fill="rgba(8,23,44,0.8)" stroke={soft} />
					<rect x="38" y="43" width="72" height="6" rx="3" fill={line} />
					{[64, 78, 92, 106, 120].map((y, i) => (
						<rect key={y} x="38" y={y} width={i === 4 ? 57 : 94} height="4" rx="2" fill={pale} />
					))}
					<path d="M170 88 L199 59 L208 68 L179 97 L166 100 Z" fill={line} opacity="0.9" />
					<path d="M166 100 L179 97 L170 88 Z" fill="#fff" opacity="0.7" />
				</g>
			)}
			{variant === 'formula' && (
				<g transform="translate(34 12)">
					<rect x="84" y="11" width="124" height="118" rx="10" fill={pale} transform="rotate(4 146 70)" />
					<rect x="54" y="16" width="148" height="121" rx="11" fill="url(#hero-card)" transform="rotate(-3 128 76)" />
					<rect x="37" y="21" width="150" height="120" rx="11" fill="rgba(8,23,44,0.82)" stroke={soft} />
					<rect x="57" y="40" width="54" height="20" rx="5" fill={pale} />
					<text x="84" y="55" fill="#fff" fontSize="13" textAnchor="middle" fontFamily="Georgia, serif">x²</text>
					<rect x="57" y="69" width="108" height="1" fill={soft} />
					<path d="M61 102 L84 84 L105 94 L136 65 L167 77" fill="none" stroke={line} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
					<circle cx="136" cy="65" r="3" fill="#fff" />
				</g>
			)}
			{variant === 'summary' && (
				<g transform="translate(38 8)">
					<rect x="76" y="11" width="130" height="120" rx="10" fill={pale} transform="rotate(5 141 71)" />
					<rect x="48" y="17" width="140" height="122" rx="10" fill="url(#hero-card)" transform="rotate(-3 118 78)" />
					<rect x="33" y="22" width="142" height="120" rx="10" fill="rgba(8,23,44,0.82)" stroke={soft} />
					{[
						[54, 45, 13, 91],
						[54, 68, 13, 95],
						[54, 91, 13, 78],
						[54, 114, 13, 86]
					].map(([x, y, size, width]) => (
						<g key={y}>
							<rect x={x} y={y - size + 2} width={size} height={size} rx="3" fill="none" stroke={line} strokeWidth="2" />
							<path d={`M${x + 3} ${y - size / 2 + 1} l3 3 l5 -6`} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
							<rect x={x + 22} y={y - 9} width={width} height="5" rx="2.5" fill={pale} />
						</g>
					))}
					<circle cx="193" cy="112" r="17" fill={line} opacity="0.9" />
					<path d="M185 112 l5 5 l11 -13" fill="none" stroke="#0b1930" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
				</g>
			)}
		</svg>
	);
}

export function LearningExplorerHero({ eyebrow, title, description, variant = 'slides' }) {
	return (
		<section className={`learning-explorer-hero learning-explorer-hero-${variant}`} aria-labelledby={`hero-${variant}`}>
			<div className="learning-hero-glow" aria-hidden="true" />
			<div className="learning-hero-copy">
				<div className="learning-hero-eyebrow">{eyebrow}</div>
				<h1 id={`hero-${variant}`}>{title}</h1>
				<p>{description}</p>
			</div>
			<HeroArtwork variant={variant} />
		</section>
	);
}

export function LearningExplorerLayout({ hero, sidebar, children }) {
	return (
		<div className="learning-explorer-page">
			{hero}
			<div className="learning-explorer-layout">
				<div className="learning-explorer-sidebar-column">{sidebar}</div>
				<main className="learning-explorer-main">{children}</main>
			</div>
		</div>
	);
}

export function LearningResourceStats({ items = [] }) {
	return (
		<div className={`learning-stats-grid learning-stats-count-${items.length}`} aria-label="Resource statistics">
			{items.map((item) => (
				<div className={`learning-stat-card learning-stat-${item.tone || 'blue'}`} key={item.label}>
					<div className="learning-stat-icon" aria-hidden="true">{item.icon}</div>
					<div className="learning-stat-copy">
						<div className="learning-stat-label">{item.label}</div>
						<div className="learning-stat-value">{Number(item.value || 0).toLocaleString('en-US')}</div>
					</div>
				</div>
			))}
		</div>
	);
}

export function LearningResourceViewToggle({ value, onChange }) {
	return (
		<div className="learning-view-toggle" role="group" aria-label="Resource view">
			<Tooltip title="Table View">
				<button
					type="button"
					className={value === 'table' ? 'is-active' : ''}
					aria-label="Table View"
					aria-pressed={value === 'table'}
					onClick={() => onChange('table')}
				>
					<TableOutlined />
				</button>
			</Tooltip>
			<Tooltip title="Grid View">
				<button
					type="button"
					className={value === 'cards' ? 'is-active' : ''}
					aria-label="Grid View"
					aria-pressed={value === 'cards'}
					onClick={() => onChange('cards')}
				>
					<AppstoreOutlined />
				</button>
			</Tooltip>
		</div>
	);
}

export function LearningResourceHeader({
	title,
	subtitle,
	icon,
	searchValue,
	onSearchChange,
	searchPlaceholder,
	viewMode,
	onViewChange,
	isMobile,
	onOpenFilters,
	extra,
	children
}) {
	return (
		<header className="learning-resource-header">
			<div className="learning-resource-heading">
				<div className="learning-resource-heading-icon" aria-hidden="true">{icon}</div>
				<div className="learning-resource-heading-copy">
					<h2>{title}</h2>
					<p>{subtitle}</p>
				</div>
			</div>
			<div className="learning-resource-controls">
				{isMobile && (
					<Button className="learning-filter-trigger" icon={<FilterOutlined />} onClick={onOpenFilters}>
						Filters
					</Button>
				)}
				<Input
					allowClear
					className="learning-resource-search"
					prefix={<SearchOutlined />}
					placeholder={searchPlaceholder}
					value={searchValue}
					onChange={(event) => onSearchChange(event.target.value)}
					aria-label={searchPlaceholder}
				/>
				{extra ? <div className="learning-resource-extra">{extra}</div> : null}
				<LearningResourceViewToggle value={viewMode} onChange={onViewChange} />
			</div>
			{children}
		</header>
	);
}

export function LearningResourceSkeleton({ viewMode = 'table', count = 6 }) {
	if (viewMode === 'cards') {
		return (
			<div className="learning-resource-grid" aria-hidden="true">
				{Array.from({ length: count }).map((_, index) => (
					<div className="learning-resource-skeleton-card" key={index}>
						<Skeleton.Node active className="learning-resource-skeleton-thumb" />
						<div className="learning-resource-skeleton-body">
							<Skeleton active title={{ width: '75%' }} paragraph={{ rows: 3 }} />
						</div>
					</div>
				))}
			</div>
		);
	}
	return (
		<div className="learning-resource-skeleton-table" aria-hidden="true">
			{Array.from({ length: Math.min(count, 8) }).map((_, index) => (
				<div className="learning-resource-skeleton-row" key={index}>
					<Skeleton.Node active className="learning-resource-skeleton-thumb compact" />
					<Skeleton active title={{ width: '58%' }} paragraph={{ rows: 1, width: '84%' }} />
				</div>
			))}
		</div>
	);
}

export function LearningResourceEmptyState({ title, description, action }) {
	return (
		<div className="learning-resource-empty">
			<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={null}>
				<div className="learning-resource-empty-title">{title}</div>
				{description && <p className="learning-resource-empty-description">{description}</p>}
				{action}
			</Empty>
		</div>
	);
}

export function LearningTypeBadge({ children, tone = 'blue' }) {
	return <span className={`learning-type-badge learning-type-${tone}`}>{children}</span>;
}

export { HeroArtwork };
