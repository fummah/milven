import React from 'react';
import { Button, Input, Select, Skeleton, Tag } from 'antd';
import {
	AppstoreOutlined,
	BookOutlined,
	CloseOutlined,
	DownOutlined,
	FolderOutlined,
	RightOutlined,
	SearchOutlined
} from '@ant-design/icons';

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };

export default function StudentResourceSidebar({
	title,
	icon,
	allLabel,
	courses,
	courseId,
	onCourseChange,
	volumes,
	totalCount,
	selectedVolumeId,
	selectedModuleId,
	expandedVolumes,
	onToggleVolume,
	onSelectAll,
	onSelectVolume,
	onSelectModule,
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
	const courseOptions = [
		...(courses.length > 1 ? [{ value: null, label: 'All My Courses' }] : []),
		...courses.map(course => ({
			value: course.id,
			label: `${course.name} (${LEVEL_LABELS[course.level] || course.level || 'Course'})`
		}))
	];

	return (
		<>
			{isMobile && open && (
				<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }} onClick={onClose} />
			)}

			<aside
				aria-label={`${title} navigation`}
				style={{
					width: isMobile ? '85vw' : 290,
					minWidth: isMobile ? undefined : 260,
					maxWidth: isMobile ? 360 : 310,
					borderRight: '1px solid #e2e8f0',
					background: '#fff',
					display: 'flex',
					flexDirection: 'column',
					overflow: 'hidden',
					...(isMobile ? {
						position: 'fixed',
						left: open ? 0 : '-100%',
						top: 0,
						bottom: 0,
						zIndex: 50,
						transition: 'left 0.3s ease',
						boxShadow: open ? '4px 0 16px rgba(0,0,0,0.12)' : undefined
					} : {})
				}}
			>
				<div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', display: 'flex', alignItems: 'center', gap: 10 }}>
					{icon}
					<span style={{ fontWeight: 700, fontSize: 15, color: '#fff', flex: 1 }}>{title}</span>
					{isMobile && <Button type="text" aria-label={`Close ${title} navigation`} icon={<CloseOutlined style={{ color: '#fff' }} />} size="small" onClick={onClose} />}
				</div>

				<div style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', background: '#f8fafc' }}>
					<Select
						aria-label="Select course"
						placeholder={courses.length ? 'Select Course' : 'No accessible courses'}
						value={courseId ?? null}
						disabled={!courses.length}
						onChange={onCourseChange}
						options={courseOptions}
						size="small"
						style={{ width: '100%' }}
						showSearch
						optionFilterProp="label"
					/>
				</div>

				<div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
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
					<div style={{ padding: '6px 12px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 6 }}>
						<Tag color="blue" style={{ margin: 0, fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeLabel}</Tag>
						<Button type="link" size="small" style={{ fontSize: 11, padding: 0 }} onClick={onClearFilter}>Clear</Button>
					</div>
				)}

				<div style={{ flex: 1, overflowY: 'auto' }}>
					{loading ? (
						<div style={{ padding: 20 }}><Skeleton active paragraph={{ rows: 6 }} /></div>
					) : error ? (
						<div style={{ padding: 24, textAlign: 'center', color: '#b91c1c', fontSize: 13 }}>{error}</div>
					) : (
						<>
							<div
								onClick={onSelectAll}
								aria-current={!selectedVolumeId ? 'true' : undefined}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 8,
									padding: '9px 14px',
									cursor: 'pointer',
									background: !selectedVolumeId ? '#eff6ff' : 'transparent',
									borderLeft: !selectedVolumeId ? '3px solid #2563eb' : '3px solid transparent'
								}}
							>
								<AppstoreOutlined style={{ fontSize: 13, color: '#2563eb' }} />
								<span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', flex: 1 }}>{allLabel}</span>
								<Tag style={{ margin: 0, fontSize: 10 }}>{totalCount || 0}</Tag>
							</div>

							{volumes.length === 0 ? (
								<div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
									<FolderOutlined style={{ fontSize: 28, opacity: 0.4 }} />
									<div style={{ fontSize: 13, marginTop: 8 }}>No curriculum items</div>
								</div>
							) : volumes.map(volume => {
								const active = showModules
									? selectedVolumeId === volume.id && !selectedModuleId
									: selectedVolumeId === volume.id;
								const expanded = showModules && expandedVolumes.has(volume.id);
								if (!showModules) {
									return (
										<div
											key={volume.id}
											onClick={() => onSelectVolume(volume)}
											aria-current={active ? 'true' : undefined}
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 8,
												padding: '9px 14px',
												cursor: 'pointer',
												background: active ? '#eff6ff' : 'transparent',
												borderLeft: active ? '3px solid #2563eb' : '3px solid transparent'
											}}
										>
											<BookOutlined style={{ fontSize: 13, color: '#2563eb' }} />
											<span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{volume.name}</span>
											<Tag style={{ margin: 0, fontSize: 10 }}>{volume.resourceCount || 0}</Tag>
										</div>
									);
								}
								return (
									<div key={volume.id}>
										<div
											onClick={() => onToggleVolume(volume.id)}
											aria-expanded={expanded}
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 8,
												padding: '9px 14px',
												cursor: 'pointer',
												background: active ? '#eff6ff' : 'transparent',
												borderLeft: active ? '3px solid #2563eb' : '3px solid transparent'
											}}
										>
											{expanded ? <DownOutlined style={{ fontSize: 10, color: '#2563eb' }} /> : <RightOutlined style={{ fontSize: 10, color: '#94a3b8' }} />}
											<span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{volume.name}</span>
											<Tag style={{ margin: 0, fontSize: 10 }}>{volume.resourceCount || 0}</Tag>
											<Button
												type="text"
												size="small"
												aria-label={`Filter by ${volume.name}`}
												style={{ fontSize: 10, padding: '0 4px', height: 20, color: '#2563eb' }}
												onClick={event => {
													event.stopPropagation();
													onSelectVolume(volume);
												}}
											>
												Filter
											</Button>
										</div>
										{expanded && (
											<div style={{ marginLeft: 12, borderLeft: '1px solid #e2e8f0' }}>
												{volume.modules.map(module => {
													const moduleActive = selectedModuleId === module.id;
													return (
														<div
															key={module.id}
															onClick={() => onSelectModule(module, volume)}
															aria-current={moduleActive ? 'true' : undefined}
															style={{
																display: 'flex',
																alignItems: 'center',
																gap: 6,
																padding: '7px 10px 7px 16px',
																cursor: 'pointer',
																background: moduleActive ? '#f0fdf4' : 'transparent',
																borderLeft: moduleActive ? '3px solid #16a34a' : '3px solid transparent'
															}}
														>
															<AppstoreOutlined style={{ fontSize: 12, color: module.resourceCount ? '#16a34a' : '#cbd5e1' }} />
															<span style={{ fontSize: 12, color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{module.name}</span>
															<span style={{ fontSize: 10, color: module.resourceCount ? '#16a34a' : '#cbd5e1' }}>{module.resourceCount || 0}</span>
														</div>
													);
												})}
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
