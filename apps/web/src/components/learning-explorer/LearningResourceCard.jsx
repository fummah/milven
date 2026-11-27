import React, { useEffect, useState } from 'react';
import { Button } from 'antd';
import {
	BookOutlined, EyeOutlined, FilePdfOutlined, FileTextOutlined, FunctionOutlined,
	StarFilled
} from '@ant-design/icons';
import MathText from '../MathText';
import { assetUrl, levelLabel } from '../../lib/slideUrls';
import { LearningTypeBadge } from './LearningExplorer.jsx';

const TYPE_LABELS = {
	'slide': 'Presentation',
	'module-note': 'Note',
	'formula-book': 'Formula',
	'summary-sheet': 'Summary'
};

function ResourcePreview({ resource, variant }) {
	const [status, setStatus] = useState('loading');
	const src = resource.thumbnailUrl ? assetUrl(resource.thumbnailUrl) : null;
	const isPdf = resource.type === 'PDF';
	const isSlide = variant === 'slide';
	const isFormula = variant === 'formula-book' && !isPdf;

	useEffect(() => {
		setStatus(src ? 'loading' : 'fallback');
	}, [src]);

	if (isFormula) {
		return (
			<div className="learning-card-preview learning-card-formula-preview">
				<div className="learning-formula-grid" aria-hidden="true" />
				<div className="learning-formula-content">
					<MathText text={resource.formula || resource.title} tag="div" />
				</div>
				<span className="learning-preview-label">Formula</span>
			</div>
		);
	}

	if (src && status !== 'error') {
		return (
			<div className={`learning-card-preview ${isSlide ? 'is-slide' : 'is-document'}`}>
				{status === 'loading' && <span className="learning-preview-loading" aria-hidden="true" />}
				<img
					src={src}
					alt={`${resource.title} preview`}
					loading="lazy"
					decoding="async"
					onLoad={() => setStatus('ready')}
					onError={() => setStatus('error')}
					className={status === 'ready' ? 'is-ready' : ''}
				/>
			</div>
		);
	}

	const isSummary = variant === 'summary-sheet';
	const icon = isSlide ? <BookOutlined /> : isFormula ? <FunctionOutlined /> : isPdf ? <FilePdfOutlined /> : isSummary ? <FileTextOutlined /> : <BookOutlined />;
	return (
		<div className={`learning-card-preview learning-card-preview-fallback ${isSlide ? 'is-slide' : 'is-document'}`}>
			<div className="learning-preview-lines" aria-hidden="true"><i /><i /><i /></div>
			<span className="learning-preview-icon">{icon}</span>
			<span className="learning-preview-label">{isPdf ? 'PDF document' : TYPE_LABELS[variant]}</span>
		</div>
	);
}

function metaFor(resource, variant) {
	const rows = [];
	if (resource.volume?.name) rows.push(resource.volume.name);
	if (variant === 'slide') {
		rows.push(resource.scope === 'WHOLE_VOLUME' ? 'Whole Volume Review' : resource.module?.name);
		if (resource.slideCount) rows.push(`${resource.slideCount} slides`);
	} else if (variant === 'summary-sheet') {
		rows.push(resource.module?.name || (resource.type === 'PDF' ? 'Whole Volume' : null));
		if (resource.pageCount) rows.push(`${resource.pageCount} pages`);
	} else {
		if (resource.type === 'PDF' && resource.pageCount) rows.push(`${resource.pageCount} pages`);
	}
	return rows.filter(Boolean);
}

export default function LearningResourceCard({ resource, variant, onView }) {
	const level = resource.level || resource.course?.level;
	const isPdf = resource.type === 'PDF';
	const typeLabel = isPdf ? 'PDF' : TYPE_LABELS[variant];
	const meta = metaFor(resource, variant);
	const kicker = [
		level ? `CFA ${levelLabel(level)}` : null,
		typeLabel
	].filter(Boolean).join(' / ');

	return (
		<article className="learning-resource-card">
			<button type="button" className="learning-card-preview-button" onClick={onView} aria-label={`View ${resource.title}`}>
				<ResourcePreview resource={resource} variant={variant} />
			</button>
			<div className="learning-resource-card-body">
				<div className="learning-card-kicker">
					<span>{kicker}</span>
					{resource.highYield && <StarFilled className="learning-high-yield" aria-label="High yield" />}
				</div>
				<h3 className="learning-card-title">
					<button type="button" onClick={onView}>{resource.title}</button>
				</h3>
				{meta.length > 0 && (
					<div className="learning-card-meta">
						{meta.map((row, index) => <span key={`${row}-${index}`}>{row}</span>)}
					</div>
				)}
				<div className="learning-card-actions">
					<Button type="primary" icon={<EyeOutlined />} onClick={onView}>View</Button>
				</div>
			</div>
		</article>
	);
}

export function LearningResourceTitleCell({ resource, variant, onView, metaLines = [] }) {
	const isPdf = resource.type === 'PDF';
	const isSlide = variant === 'slide';
	const detail = isSlide
		? [resource.slideCount ? `${resource.slideCount} slides` : null, resource.year].filter(Boolean).join(' / ')
		: [isPdf ? 'PDF' : TYPE_LABELS[variant], resource.pageCount ? `${resource.pageCount} pages` : null].filter(Boolean).join(' / ');

	return (
		<div className="learning-title-cell">
			<button type="button" className="learning-title-thumb" onClick={onView} aria-label={`View ${resource.title}`}>
				<span className="learning-title-thumb-inner">
					<ResourcePreview resource={resource} variant={variant} />
				</span>
			</button>
			<div className="learning-title-content">
				<button type="button" className="learning-resource-title" onClick={onView}>{resource.title}</button>
				{detail && <span className="learning-title-detail">{detail}</span>}
				{metaLines.filter(Boolean).map((line, index) => <span className="learning-title-meta-line" key={`${line}-${index}`}>{line}</span>)}
			</div>
		</div>
	);
}

export function ResourceTypeForVolume({ resource, variant }) {
	const isPdf = resource.type === 'PDF';
	if (isPdf) return <LearningTypeBadge tone="red">PDF</LearningTypeBadge>;
	if (variant === 'module-note') return <LearningTypeBadge tone="blue">Note</LearningTypeBadge>;
	if (variant === 'formula-book') return <LearningTypeBadge tone="gold">Formula</LearningTypeBadge>;
	if (variant === 'summary-sheet') return <LearningTypeBadge tone="purple">Summary</LearningTypeBadge>;
	return null;
}
