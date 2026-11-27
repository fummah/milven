import React from 'react';
import { Button, Input, Select, Skeleton } from 'antd';
import {
	AppstoreOutlined, BookOutlined, CloseOutlined, DownOutlined, FilePptOutlined,
	FileTextOutlined, FolderOutlined, RightOutlined, SearchOutlined
} from '@ant-design/icons';

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };

function StopPropagation({ children }) {
	return <span onClick={event => event.stopPropagation()}>{children}</span>;
}

export default function StudentResourceSidebar({
	title,
	icon,
	allLabel,
	courses = [],
	courseId,
	onCourseChange,
	volumes = [],
	totalCount,
	selectedVolumeId,
	selectedModuleId,
	wholeVolumeSelected = false,
	expandedVolumes = new Set(),
	onToggleVolume,
	onSelectAll,
	onSelectVolume,
	onSelectModule,
	onSelectWholeVolume,
	wholeVolumeLabel = 'Whole Volume Review',
	activeLabel,
	onClearFilter,
	treeSearch,
	onTreeSearch,
	isMobile,
	open,
	onClose,
	loading,
	error,
	showModules = true
}) {
	const courseOptions = courses.map(course => ({
		value: course.id,
		label: `${course.name} (${LEVEL_LABELS[course.level] || course.level || 'Course'})`
	}));

	return (
		<>
			{isMobile && open && (
				<div className="learning-sidebar-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(2,8,23,0.44)', zIndex: 1040 }} onClick={onClose} />
			)}

			<aside
				aria-label={`${title} navigation`}
				className="learning-sidebar"
				style={isMobile ? {
					position: 'fixed',
					left: open ? 0 : '-110%',
					top: 0,
					bottom: 0,
					zIndex: 1050,
					width: 'min(340px, 88vw)',
					maxHeight: '100vh',
					borderRadius: 0,
					transition: 'left 240ms ease',
					boxShadow: open ? '18px 0 48px rgba(2,8,23,0.28)' : undefined
				} : undefined}
			>
				<div className="learning-sidebar-header">
					<span className="learning-sidebar-header-icon">{icon}</span>
					<span className="learning-sidebar-header-title">{title}</span>
					{isMobile && <Button type="text" className="learning-sidebar-mobile-close" aria-label={`Close ${title} navigation`} icon={<CloseOutlined />} size="small" onClick={onClose} />}
				</div>

				<div className="learning-sidebar-course">
					<Select
						aria-label="Select course"
						placeholder={courses.length ? 'Select Course' : 'No accessible courses'}
						value={courseId ?? undefined}
						disabled={!courses.length}
						onChange={onCourseChange}
						options={courseOptions}
						size="small"
						style={{ width: '100%' }}
						showSearch
						optionFilterProp="label"
					/>
				</div>

				<div className="learning-sidebar-search">
					<Input
						prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
						placeholder="Search curriculum..."
						value={treeSearch}
						onChange={event => onTreeSearch(event.target.value)}
						allowClear
						size="small"
					/>
				</div>

				{activeLabel && (
					<div className="learning-sidebar-active-filter">
						<span className="learning-sidebar-filter-text">{activeLabel}</span>
						<Button type="link" size="small" onClick={onClearFilter}>Clear</Button>
					</div>
				)}

				<div className="learning-sidebar-scroll">
					{loading ? (
						<div className="learning-sidebar-state"><Skeleton active paragraph={{ rows: 6 }} /></div>
					) : error ? (
						<div className="learning-sidebar-state is-error">{error}</div>
					) : (
						<>
							<div
								className={`learning-sidebar-row ${!selectedVolumeId ? 'is-active' : ''}`}
								role="button"
								tabIndex={0}
								onClick={onSelectAll}
								onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectAll(); } }}
								aria-current={!selectedVolumeId ? 'true' : undefined}
							>
								<span className="learning-sidebar-row-icon"><AppstoreOutlined /></span>
								<span className="learning-sidebar-row-content">
									<span className="learning-sidebar-row-title">{allLabel}</span>
								</span>
								<span className="learning-sidebar-count">{totalCount || 0}</span>
							</div>

							{volumes.length === 0 ? (
								<div className="learning-sidebar-empty">
									<FolderOutlined style={{ fontSize: 24, opacity: 0.35 }} />
									<div style={{ marginTop: 7 }}>No curriculum items</div>
								</div>
							) : volumes.map(volume => {
								const volumeActive = showModules
									? selectedVolumeId === volume.id && !selectedModuleId && !wholeVolumeSelected
									: selectedVolumeId === volume.id;
								const expanded = showModules && expandedVolumes?.has(volume.id);
								const wholeVolumeCount = volume.wholeVolumeCount || 0;

								if (!showModules) {
									return (
										<div
											key={volume.id}
											className={`learning-sidebar-row ${volumeActive ? 'is-active' : ''}`}
											role="button"
											tabIndex={0}
											onClick={() => onSelectVolume(volume)}
											onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectVolume(volume); } }}
											aria-current={volumeActive ? 'true' : undefined}
										>
											<span className="learning-sidebar-row-icon"><BookOutlined /></span>
											<span className="learning-sidebar-row-content">
												<span className="learning-sidebar-row-title">{volume.name}</span>
											</span>
											<span className="learning-sidebar-count">{volume.resourceCount || 0}</span>
										</div>
									);
								}

								return (
									<div key={volume.id}>
										<div
											className={`learning-sidebar-row ${volumeActive ? 'is-active' : ''}`}
											role="button"
											tabIndex={0}
											onClick={() => onToggleVolume?.(volume.id)}
											onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggleVolume?.(volume.id); } }}
											aria-expanded={expanded}
										>
											<Button
												type="text"
												className="learning-sidebar-expand"
												aria-label={expanded ? `Collapse ${volume.name}` : `Expand ${volume.name}`}
												icon={expanded ? <DownOutlined /> : <RightOutlined />}
												onClick={event => { event.stopPropagation(); onToggleVolume?.(volume.id); }}
											/>
											<span className="learning-sidebar-row-icon"><BookOutlined /></span>
											<span className="learning-sidebar-row-content">
												<span className="learning-sidebar-row-title">{volume.name}</span>
												<span className="learning-sidebar-row-meta">
													<span className="learning-sidebar-count">{volume.resourceCount || 0}</span>
													{(volume.resourceCount || 0) > 0 && (
														<StopPropagation>
															<Button
																type="text"
																className="learning-sidebar-filter-action"
																aria-label={`Filter by ${volume.name}`}
																onClick={() => onSelectVolume(volume)}
															>
																Filter
															</Button>
														</StopPropagation>
													)}
												</span>
											</span>
										</div>
										{expanded && (
											<div>
												{(volume.modules || []).map(module => {
													const moduleActive = selectedModuleId === module.id;
													return (
														<div
															key={module.id}
															className={`learning-sidebar-row learning-sidebar-module ${moduleActive ? 'is-active' : ''}`}
															role="button"
															tabIndex={0}
															onClick={() => onSelectModule?.(module, volume)}
															onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectModule?.(module, volume); } }}
															aria-current={moduleActive ? 'true' : undefined}
														>
															<span className="learning-sidebar-row-icon"><AppstoreOutlined /></span>
															<span className="learning-sidebar-row-content">
																<span className="learning-sidebar-row-title">{module.name}</span>
															</span>
															<span className="learning-sidebar-count">{module.resourceCount || 0}</span>
														</div>
													);
												})}
												{wholeVolumeCount > 0 && (
													<div
														className={`learning-sidebar-row learning-sidebar-module ${wholeVolumeSelected && selectedVolumeId === volume.id ? 'is-active' : ''}`}
														role="button"
														tabIndex={0}
														onClick={() => onSelectWholeVolume?.(volume)}
														onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectWholeVolume?.(volume); } }}
													>
														<span className="learning-sidebar-row-icon"><FileTextOutlined /></span>
														<span className="learning-sidebar-row-content">
															<span className="learning-sidebar-row-title">{wholeVolumeLabel}</span>
														</span>
														<span className="learning-sidebar-count">{wholeVolumeCount}</span>
													</div>
												)}
											</div>
										)}
									</div>
								);
							})}
						</>
					)}
				</div>
			</aside>
		</>
	);
}
