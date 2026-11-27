import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Grid, Modal, Pagination, Table, Tag, Typography } from 'antd';
import {
	BookOutlined, EyeOutlined, FilePdfOutlined, FileTextOutlined
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import MathText from '../../components/MathText';
import StudentResourceSidebar from '../../components/resources/StudentResourceSidebar';
import {
	LearningExplorerHero, LearningExplorerLayout, LearningResourceEmptyState,
	LearningResourceHeader, LearningResourceSkeleton, LearningResourceStats
} from '../../components/learning-explorer/LearningExplorer.jsx';
import LearningResourceCard, {
	LearningResourceTitleCell, ResourceTypeForVolume
} from '../../components/learning-explorer/LearningResourceCard.jsx';
import { markExplorerReturn, useExplorerScrollMemory } from '../../lib/explorerSession.js';

// Safe render: stringify objects that React can't render.
function safeRender(val) {
	if (val === null || val === undefined) return '';
	if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
	if (typeof val === 'object') {
		try { return JSON.stringify(val); } catch { return String(val); }
	}
	return String(val);
}

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };
const SESSION_SCOPE = 'summary-sheets';

export function StudentSummarySheets() {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const screens = Grid.useBreakpoint();
	const isMobile = !screens.xl;
	const initial = useRef({
		courseId: searchParams.get('courseId') || '',
		volumeId: searchParams.get('volumeId') || '',
		moduleId: searchParams.get('moduleId') || '',
		search: searchParams.get('q') || '',
		page: Number(searchParams.get('page') || 1)
	});
	const initialNavigationApplied = useRef(false);
	const requestSequence = useRef(0);

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [sheets, setSheets] = useState([]);
	const [total, setTotal] = useState(0);
	const [counts, setCounts] = useState({ ai: 0, manual: 0, uploadedPdf: 0 });
	const [courses, setCourses] = useState([]);
	const [coursesLoaded, setCoursesLoaded] = useState(false);
	const [viewMode, setViewMode] = useState(() => localStorage.getItem('milven.student-summary.view') || 'table');
	const [volumes, setVolumes] = useState([]);
	const [navigationTotal, setNavigationTotal] = useState(0);
	const [hierarchyLoading, setHierarchyLoading] = useState(false);
	const [hierarchyError, setHierarchyError] = useState('');
	const [filterCourseId, setFilterCourseId] = useState(initial.current.courseId || null);
	const [filterVolumeId, setFilterVolumeId] = useState(null);
	const [filterModuleId, setFilterModuleId] = useState(null);
	const [searchText, setSearchText] = useState(initial.current.search);
	const [searchTerm, setSearchTerm] = useState(initial.current.search);
	const [page, setPage] = useState(initial.current.page || 1);
	const [reloadKey, setReloadKey] = useState(0);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewSheet, setPreviewSheet] = useState(null);
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [expandedVolumes, setExpandedVolumes] = useState(new Set());
	const [treeSearch, setTreeSearch] = useState('');

	useExplorerScrollMemory(SESSION_SCOPE, !loading && coursesLoaded);

	useEffect(() => {
		let cancelled = false;
		api.get('/api/slides/library/courses').then(r => {
			if (cancelled) return;
			const list = r.data?.courses || [];
			setCourses(list);
			const requested = list.find(course => course.id === initial.current.courseId)?.id;
			const fallback = list[0]?.id || null;
			setFilterCourseId(previous => (previous && list.some(course => course.id === previous) ? previous : requested || fallback));
		}).catch(() => {
			if (!cancelled) {
				setCourses([]);
				setError('Could not load your enrolled courses.');
			}
		}).finally(() => {
			if (!cancelled) setCoursesLoaded(true);
		});
		return () => { cancelled = true; };
	}, []);

	useEffect(() => {
		if (!coursesLoaded) return undefined;
		if (!courses.length) {
			setVolumes([]);
			setNavigationTotal(0);
			setHierarchyLoading(false);
			return undefined;
		}
		let cancelled = false;
		setHierarchyLoading(true);
		setHierarchyError('');
		api.get('/api/summary-sheets/navigation', { params: filterCourseId ? { courseId: filterCourseId } : {} })
			.then(r => {
				if (cancelled) return;
				const list = r.data?.volumes || [];
				setVolumes(list);
				setNavigationTotal(r.data?.totalCount || 0);
				if (!initialNavigationApplied.current) {
					const volume = list.find(item => item.id === initial.current.volumeId)
						|| (initial.current.moduleId ? list.find(item => item.modules.some(module => module.id === initial.current.moduleId)) : null);
					if (volume) {
						setFilterVolumeId(volume.id);
						setExpandedVolumes(new Set([volume.id]));
						if (initial.current.moduleId && volume.modules.some(module => module.id === initial.current.moduleId)) {
							setFilterModuleId(initial.current.moduleId);
						}
					}
					initialNavigationApplied.current = true;
				}
			})
			.catch(() => {
				if (cancelled) return;
				setVolumes([]);
				setNavigationTotal(0);
				setHierarchyError('Could not load your curriculum.');
			})
			.finally(() => {
				if (!cancelled) setHierarchyLoading(false);
			});
		return () => { cancelled = true; };
	}, [coursesLoaded, courses.length, filterCourseId]);

	const hierarchyTree = useMemo(() => {
		const search = treeSearch.toLowerCase().trim();
		if (!search) return volumes;
		return volumes.filter(volume => (
			volume.name?.toLowerCase().includes(search)
			|| volume.modules.some(module => module.name?.toLowerCase().includes(search))
		));
	}, [volumes, treeSearch]);

	const selectedVolume = volumes.find(volume => volume.id === filterVolumeId);
	const selectedModule = selectedVolume?.modules.find(module => module.id === filterModuleId);

	useEffect(() => {
		const timer = setTimeout(() => { setSearchTerm(searchText.trim()); setPage(1); }, 300);
		return () => clearTimeout(timer);
	}, [searchText]);

	const fetchSheets = useCallback(async () => {
		const sequence = ++requestSequence.current;
		setLoading(true);
		try {
			const params = { page, limit: 24, status: 'PUBLISHED' };
			if (filterCourseId) params.courseId = filterCourseId;
			if (filterVolumeId) params.volumeId = filterVolumeId;
			if (filterModuleId) params.moduleId = filterModuleId;
			if (searchTerm) params.search = searchTerm;
			const res = await api.get('/api/summary-sheets/unified', { params });
			if (sequence !== requestSequence.current) return;
			setSheets(res.data?.resources || []);
			setTotal(res.data?.total || 0);
			setCounts(res.data?.counts || { ai: 0, manual: 0, uploadedPdf: 0 });
			setError('');
		} catch (err) {
			if (sequence === requestSequence.current) {
				setSheets([]);
				setTotal(0);
				setCounts({ ai: 0, manual: 0, uploadedPdf: 0 });
				setError(err?.response?.data?.error || 'Could not load summary sheets.');
			}
		} finally {
			if (sequence === requestSequence.current) setLoading(false);
		}
	}, [page, filterCourseId, filterVolumeId, filterModuleId, searchTerm]);

	useEffect(() => { fetchSheets(); }, [fetchSheets, reloadKey]);

	useEffect(() => {
		if (!filterCourseId) return;
		const next = new URLSearchParams(searchParams);
		const values = {
			courseId: filterCourseId,
			volumeId: filterVolumeId || '',
			moduleId: filterModuleId || '',
			q: searchTerm || '',
			page: page > 1 ? String(page) : ''
		};
		Object.entries(values).forEach(([key, value]) => {
			if (value) next.set(key, value);
			else next.delete(key);
		});
		if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
	}, [filterCourseId, filterVolumeId, filterModuleId, searchTerm, page, searchParams, setSearchParams]);

	const toggleVolume = volumeId => {
		setExpandedVolumes(previous => {
			const next = new Set(previous);
			if (next.has(volumeId)) next.delete(volumeId);
			else next.add(volumeId);
			return next;
		});
	};

	const selectAll = () => {
		clearTreeFilter();
		if (isMobile) setSidebarOpen(false);
	};

	const selectVolume = volume => {
		setFilterVolumeId(volume.id);
		setFilterModuleId(null);
		setPage(1);
		if (isMobile) setSidebarOpen(false);
	};

	const selectModule = (module, volume) => {
		setFilterVolumeId(volume.id);
		setFilterModuleId(module.id);
		setExpandedVolumes(previous => new Set([...previous, volume.id]));
		setPage(1);
		if (isMobile) setSidebarOpen(false);
	};

	const clearTreeFilter = () => { setFilterVolumeId(null); setFilterModuleId(null); setPage(1); };

	const clearAllFilters = () => {
		setSearchText('');
		setSearchTerm('');
		clearTreeFilter();
	};

	const changeCourse = value => {
		setFilterCourseId(value || null);
		setFilterVolumeId(null);
		setFilterModuleId(null);
		setExpandedVolumes(new Set());
		setPage(1);
		if (isMobile) setSidebarOpen(false);
	};

	const changeView = mode => {
		setViewMode(mode);
		try { localStorage.setItem('milven.student-summary.view', mode); } catch {}
	};

	const openResource = resource => {
		if (resource.type === 'PDF') {
			markExplorerReturn(SESSION_SCOPE);
			navigate(`/learning/summary-sheets/${resource.resourceId || resource.id}${resource.matchPage ? `?page=${resource.matchPage}` : ''}`);
		} else {
			setPreviewSheet(resource);
			setPreviewOpen(true);
		}
	};

	const summaryColumns = isMobile ? [
		{
			title: 'Resource', key: 'resource',
			render: (_, resource) => (
				<LearningResourceTitleCell
					resource={resource}
					variant="summary-sheet"
					onView={() => openResource(resource)}
					metaLines={[
						LEVEL_LABELS[resource.level] || resource.level,
						resource.volume?.name,
						resource.module?.name || (resource.type === 'PDF' ? 'Whole Volume' : null)
					]}
				/>
			)
		},
		{ title: 'Actions', key: 'actions', width: 82, render: (_, resource) => <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openResource(resource)}>View</Button> }
	] : [
		{
			title: 'Resource', key: 'resource', width: 330,
			render: (_, resource) => <LearningResourceTitleCell resource={resource} variant="summary-sheet" onView={() => openResource(resource)} />
		},
		{
			title: 'Level', key: 'level', width: 96,
			render: (_, resource) => <Tag color={resource.level === 'LEVEL1' ? 'blue' : resource.level === 'LEVEL2' ? 'purple' : 'gold'}>{LEVEL_LABELS[resource.level] || resource.level}</Tag>
		},
		{
			title: 'Volume', key: 'volume', width: 160,
			render: (_, resource) => (
				<div className="learning-meta-cell">
					<div>{resource.volume?.name || '-'}</div>
					<div style={{ marginTop: 4 }}><ResourceTypeForVolume resource={resource} variant="summary-sheet" /></div>
				</div>
			)
		},
		{
			title: 'Learning Module', key: 'module', width: 170,
			render: (_, resource) => <div className="learning-meta-cell">{resource.module?.name || (resource.type === 'PDF' ? 'Whole Volume' : '-')}</div>
		},
		{ title: 'Actions', key: 'actions', width: 82, fixed: 'right', render: (_, resource) => <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openResource(resource)}>View</Button> }
	];

	const activeLabel = selectedModule?.name || selectedVolume?.name || null;
	const hasActiveFilters = Boolean(searchText || filterVolumeId || filterModuleId);
	const searchMode = Boolean(searchTerm);

	const statsItems = [
		{ label: 'Available Resources', value: total, tone: 'purple', icon: <FileTextOutlined /> },
		{ label: 'Summary Sheets', value: (counts.ai || 0) + (counts.manual || 0), tone: 'blue', icon: <BookOutlined /> },
		{ label: 'PDF Summary Sheets', value: counts.uploadedPdf || 0, tone: 'gold', icon: <FilePdfOutlined /> }
	];

	const emptyState = (() => {
		if (coursesLoaded && courses.length === 0) {
			return {
				title: 'No active course access',
				description: "You don't currently have access to any learning courses.",
				action: <Button type="primary" onClick={() => navigate('/courses')}>Browse Courses</Button>
			};
		}
		if (searchMode) {
			return {
				title: 'No summary sheets matched your search',
				description: `No summary sheets or concepts match "${searchTerm}". Try another term or clear your filters.`,
				action: <Button onClick={clearAllFilters}>Clear Filters</Button>
			};
		}
		if (filterModuleId) {
			return {
				title: 'No summary sheets found for this learning module',
				description: 'Try another module or clear your filters.',
				action: <Button onClick={clearAllFilters}>Clear Filters</Button>
			};
		}
		if (filterVolumeId) {
			return {
				title: 'No summary sheets published for this volume',
				description: 'Choose another volume or view all summaries in this course.',
				action: <Button onClick={selectAll}>View All Summaries</Button>
			};
		}
		return {
			title: 'No summary sheets published for this course',
			description: 'Your course does not have any published summary sheets yet.',
			action: null
		};
	})();

	const sidebar = (
		<StudentResourceSidebar
			title="Milven Summaries"
			icon={<FileTextOutlined />}
			allLabel="All Summaries"
			courses={courses}
			courseId={filterCourseId}
			onCourseChange={changeCourse}
			volumes={hierarchyTree}
			totalCount={navigationTotal}
			selectedVolumeId={filterVolumeId}
			selectedModuleId={filterModuleId}
			expandedVolumes={expandedVolumes}
			onToggleVolume={toggleVolume}
			onSelectAll={selectAll}
			onSelectVolume={selectVolume}
			onSelectModule={selectModule}
			activeLabel={activeLabel}
			onClearFilter={clearTreeFilter}
			treeSearch={treeSearch}
			onTreeSearch={setTreeSearch}
			isMobile={isMobile}
			open={sidebarOpen}
			onClose={() => setSidebarOpen(false)}
			loading={hierarchyLoading}
			error={hierarchyError}
		/>
	);

	const openSlides = selectedModule ? () => {
		navigate(`/student/slides?courseId=${selectedModule.courseId || filterCourseId || ''}&volumeId=${filterVolumeId || selectedModule.volumeId || ''}&moduleId=${selectedModule.id}`);
	} : null;

	return (
		<LearningExplorerLayout
			hero={<LearningExplorerHero eyebrow="MILVEN SUMMARY SHEETS" title="Revision Explorer" description="Revise key concepts efficiently with concise, exam-focused summary sheets." variant="summary" />}
			sidebar={sidebar}
		>
			<LearningResourceHeader
				title="Summary Sheets"
				subtitle="Concise revision resources for exam preparation."
				icon={<FileTextOutlined />}
				searchValue={searchText}
				onSearchChange={setSearchText}
				searchPlaceholder="Search summary sheets and concepts"
				viewMode={viewMode}
				onViewChange={changeView}
				isMobile={isMobile}
				onOpenFilters={() => setSidebarOpen(true)}
				extra={(
					<>
						{hasActiveFilters && <Button size="small" onClick={clearAllFilters}>Clear</Button>}
						{openSlides && <Button size="small" icon={<BookOutlined />} onClick={openSlides}>Open Slides</Button>}
					</>
				)}
			/>

			<LearningResourceStats items={statsItems} />

			{loading ? (
				<LearningResourceSkeleton viewMode={viewMode} />
			) : error ? (
				<Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => setReloadKey(key => key + 1)}>Retry</Button>} />
			) : sheets.length === 0 ? (
				<LearningResourceEmptyState {...emptyState} />
			) : viewMode === 'table' ? (
				<div className="learning-resource-table">
					<Table
						dataSource={sheets}
						columns={summaryColumns}
						rowKey={resource => resource.resourceKey || resource.id}
						tableLayout="fixed"
						scroll={isMobile ? undefined : { x: 838 }}
						pagination={{ current: page, pageSize: 24, total, showSizeChanger: false, onChange: nextPage => setPage(nextPage), showTotal: count => `${count} resource${count === 1 ? '' : 's'}` }}
					/>
				</div>
			) : (
				<>
					<div className="learning-resource-grid">
						{sheets.map(resource => (
							<LearningResourceCard
								key={resource.resourceKey || resource.id}
								resource={resource}
								variant="summary-sheet"
								onView={() => openResource(resource)}
							/>
						))}
					</div>
					{total > 24 && (
						<div className="learning-pagination">
							<Pagination current={page} pageSize={24} total={total} onChange={setPage} showTotal={count => `${count} resources`} />
						</div>
					)}
				</>
			)}

			<Modal open={previewOpen} onCancel={() => { setPreviewOpen(false); setPreviewSheet(null); }} footer={null} width={isMobile ? '95%' : 1000} centered title={null} styles={{ body: { padding: 0 } }}>
				{previewSheet && <SummarySheetView sheet={previewSheet} />}
			</Modal>
		</LearningExplorerLayout>
	);
}

function SummarySheetView({ sheet }) {
	const s = sheet;
	const losItems = Array.isArray(s.coreDefinitions) ? s.coreDefinitions : [];
	const conceptMap = Array.isArray(s.diagrams) ? s.diagrams : [];
	const topicMap = Array.isArray(s.memoryHooks) ? s.memoryHooks : [];
	const formulas = Array.isArray(s.formulas) ? s.formulas : [];
	const rules = Array.isArray(s.distinctions) ? s.distinctions : [];
	const traps = Array.isArray(s.examTraps) ? s.examTraps : [];
	const checks = Array.isArray(s.revisionCheck) ? s.revisionCheck : [];
	const instructorReview = Array.isArray(s.quickDrills) ? s.quickDrills : [];
	const coverageStatus = s.useCase || '';

	return (
		<div style={{ background: '#f8f9fa', borderRadius: 16, overflow: 'hidden' }}>
			{/* ═══════════ PAGE 1: Concept Overview ═══════════ */}
			<div style={{ background: '#fff', marginBottom: 4 }}>
				{/* Header Bar — LM name inside navy band */}
				<div style={{ background: '#102540', padding: '14px 28px 12px' }}>
					<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
						<div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
							<Typography.Text style={{ color: '#fff', fontSize: 18, fontWeight: 800, letterSpacing: 1 }}>MILVEN</Typography.Text>
							<Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>FINANCE SCHOOL</Typography.Text>
						</div>
						<Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
							{LEVEL_LABELS[s.level]} | {s.course?.name || s.volume?.name || ''}
						</Typography.Text>
					</div>
					<Typography.Text style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>
						Learning Module: {safeRender(s.module?.name || s.title)}
					</Typography.Text>
				</div>

				{/* Module Objective - gold bordered box */}
				{s.snapshot && (
					<div style={{ margin: '12px 28px 16px', padding: '14px 18px', border: '2px solid #c9a227', borderRadius: 8, background: '#fffef5' }}>
						<Typography.Text style={{ fontSize: 13, color: '#102540', lineHeight: 1.7 }}>
							<strong>Learning Module Objective:</strong> {safeRender(s.snapshot)}
						</Typography.Text>
					</div>
				)}

				{/* LOS SNAPSHOT - horizontal pills */}
				{losItems.length > 0 && (
					<div style={{ padding: '0 28px 20px' }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 1 }}>LOS SNAPSHOT</Typography.Text>
						<div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
							{losItems.map((d, i) => (
								<div key={i} style={{ flex: '1 1 160px', maxWidth: 220, padding: '10px 14px', background: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: 8, textAlign: 'center' }}>
									<div style={{ fontSize: 12, color: '#374151', lineHeight: 1.4 }}>{safeRender(d.statement || d.definition)}</div>
								</div>
							))}
						</div>
					</div>
				)}

				{/* TOPIC-TO-OBJECTIVE CONCEPT MAP - visual diagram */}
				{conceptMap.length > 0 && (
					<div style={{ padding: '0 28px 24px' }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 1 }}>TOPIC-TO-OBJECTIVE CONCEPT MAP</Typography.Text>
						<div style={{ marginTop: 14, position: 'relative', padding: '20px 0' }}>
							{/* Central module node */}
							<div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
								<div style={{ background: '#102540', color: '#fff', padding: '16px 24px', borderRadius: 10, textAlign: 'center', maxWidth: 380 }}>
									<div style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase' }}>{safeRender(s.module?.name || s.title)}</div>
									{s.snapshot && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{s.snapshot.length > 80 ? s.snapshot.substring(0, 80) + '...' : safeRender(s.snapshot)}</div>}
								</div>
							</div>
							{/* Arrow connector */}
							<div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
								<div style={{ width: 2, height: 24, background: '#102540' }} />
							</div>
							{/* Topic boxes grid */}
							<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
								{conceptMap.map((node, i) => (
									<div key={i} style={{ border: '2px solid #102540', borderRadius: 10, padding: '14px 16px', background: '#fff' }}>
										<div style={{ fontSize: 12, fontWeight: 800, color: '#102540', textTransform: 'uppercase', marginBottom: 4 }}>
											{i + 1}. {safeRender(node.topic)}
										</div>
										{Array.isArray(node.subtopics) && (
											<div style={{ fontSize: 12, color: '#102540', fontWeight: 600 }}>
												{node.subtopics.map(st => safeRender(st)).join(' | ')}
											</div>
										)}
										{node.connectionTo && (
											<div style={{ fontSize: 11, color: '#64748b', marginTop: 6, fontStyle: 'italic' }}>
												{safeRender(node.connectionTo)}
											</div>
										)}
									</div>
								))}
							</div>
						</div>
					</div>
				)}
			</div>

			{/* ═══════════ PAGE 2: Exam Decision Map + Formula Strip ═══════════ */}
			<div style={{ background: '#fff' }}>
				{/* Page 2 Header — LM title inside navy band */}
				<div style={{ background: '#102540', padding: '14px 28px 12px' }}>
					<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
						<div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
							<Typography.Text style={{ color: '#fff', fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>MILVEN</Typography.Text>
							<Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>FINANCE SCHOOL</Typography.Text>
						</div>
						<Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Diagrammatic Revision Page</Typography.Text>
					</div>
					<Typography.Text style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>
						{safeRender(s.module?.name || s.title)} | Exam Decision Map + Formula Strip
					</Typography.Text>
				</div>

				<div style={{ padding: '16px 28px 24px', display: 'grid', gridTemplateColumns: topicMap.length > 0 ? '1fr 1fr' : '1fr', gap: 24 }}>
					{/* Left: EXAM LOGIC DECISION MAP (vertical flowchart) */}
					{topicMap.length > 0 && (
						<div>
							<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 1 }}>EXAM LOGIC DECISION MAP</Typography.Text>
							<div style={{ marginTop: 12 }}>
								{topicMap.map((t, i) => (
									<div key={i}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
											<div style={{ flex: '0 0 160px', padding: '10px 14px', border: '2px solid #102540', borderRadius: 20, background: '#fff', fontSize: 12, fontWeight: 600, color: '#102540', textAlign: 'center' }}>
												{safeRender(t.topic || t.hook)}
											</div>
											<div style={{ flex: '0 0 30px', textAlign: 'center', color: '#c9a227', fontSize: 16, fontWeight: 700 }}>→</div>
											<div style={{ flex: 1, padding: '10px 14px', border: '2px solid #c9a227', borderRadius: 20, background: '#fffef5', fontSize: 12, color: '#374151' }}>
												{Array.isArray(t.concepts) ? t.concepts.join(' | ') : safeRender(t.concepts || '')}
											</div>
										</div>
										{i < topicMap.length - 1 && (
											<div style={{ marginLeft: 80, width: 2, height: 16, background: '#102540', marginBottom: 4 }} />
										)}
									</div>
								))}
							</div>
						</div>
					)}

					{/* Right column: Formula Strip + Decision Rules + Exam Traps */}
					<div>
						{formulas.length > 0 && (
							<div style={{ marginBottom: 20 }}>
								<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 1 }}>FORMULA STRIP</Typography.Text>
								<div style={{ marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
									{formulas.map((f, i) => (
										<div key={i} style={{ display: 'flex', padding: '8px 14px', borderBottom: i < formulas.length - 1 ? '1px solid #e2e8f0' : 'none', background: i % 2 === 0 ? '#fff' : '#f8f9fa' }}>
											<div style={{ flex: '0 0 45%', fontSize: 13, fontWeight: 600, color: '#102540' }}>{safeRender(f.useCase || f.whenToUse || '')}</div>
											<div style={{ flex: 1, fontFamily: "'Cambria Math', Georgia, serif", fontSize: 14, color: '#102540' }}><MathText text={f.formula} /></div>
										</div>
									))}
								</div>
							</div>
						)}

						{rules.length > 0 && (
							<div style={{ marginBottom: 20 }}>
								<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 1 }}>DECISION RULES</Typography.Text>
								<div style={{ marginTop: 8, padding: '12px 16px', background: '#f8f9fa', borderRadius: 8, border: '1px solid #e2e8f0' }}>
									{rules.map((d, i) => (
										<div key={i} style={{ fontSize: 12, color: '#374151', marginTop: i > 0 ? 6 : 0, lineHeight: 1.5 }}>
											• <strong>{safeRender(d.scenario || d.left)}:</strong> {safeRender(d.rule || d.right)}
										</div>
									))}
								</div>
							</div>
						)}

						{traps.length > 0 && (
							<div style={{ marginBottom: 20 }}>
								<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 1 }}>EXAM TRAPS</Typography.Text>
								<div style={{ marginTop: 8, padding: '12px 16px', background: '#fef3c7', borderRadius: 8, border: '1px solid #f59e0b' }}>
									{traps.map((t, i) => (
										<div key={i} style={{ fontSize: 12, color: '#92400e', marginTop: i > 0 ? 6 : 0, lineHeight: 1.5 }}>
											• {safeRender(t.trap)}
										</div>
									))}
								</div>
							</div>
						)}
					</div>
				</div>

				{/* FINAL CHECKLIST BEFORE QUESTIONS */}
				{checks.length > 0 && (
					<div style={{ margin: '0 28px 24px', padding: '16px 20px', background: '#f0f4f8', borderRadius: 10, border: '2px solid #102540' }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 1 }}>FINAL CHECKLIST BEFORE QUESTIONS</Typography.Text>
						<div style={{ marginTop: 10, fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
							Can you: {checks.map(c => safeRender(c.item)).join('; ')}?
						</div>
					</div>
				)}

				{/* INSTRUCTOR REVIEW REQUIRED */}
				{instructorReview.length > 0 && (
					<div style={{ margin: '0 28px 24px' }}>
						{instructorReview[0]?.issue === 'None identified' ? (
							<div style={{ padding: '12px 18px', background: '#f0fdf4', borderRadius: 10, borderLeft: '4px solid #22c55e', fontSize: 13, color: '#166534' }}>
								<strong style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Instructor Review:</strong> All content verified — ready for publication.
							</div>
						) : (
							<div style={{ padding: '14px 18px', background: '#fef2f2', borderRadius: 10, borderLeft: '4px solid #ef4444' }}>
								<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#991b1b', letterSpacing: 1 }}>INSTRUCTOR REVIEW REQUIRED</Typography.Text>
								{instructorReview.map((d, i) => (
									<div key={i} style={{ marginTop: 6 }}>
										<div style={{ fontSize: 12, fontWeight: 600, color: '#991b1b' }}>{safeRender(d.issue || d.question)}</div>
										{d.recommendation && <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 2 }}>→ {safeRender(d.recommendation)}</div>}
									</div>
								))}
							</div>
						)}
					</div>
				)}

				{/* COVERAGE QUALITY CHECK */}
				{coverageStatus && (
					<div style={{ margin: '0 28px 20px' }}>
						<div style={{
							padding: '14px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700, textAlign: 'center',
							background: coverageStatus === 'PASS' ? '#f0fdf4' : coverageStatus === 'REVISE' ? '#fffbeb' : '#fef2f2',
							color: coverageStatus === 'PASS' ? '#166534' : coverageStatus === 'REVISE' ? '#92400e' : '#991b1b',
							border: `2px solid ${coverageStatus === 'PASS' ? '#22c55e' : coverageStatus === 'REVISE' ? '#f59e0b' : '#ef4444'}`,
						}}>
							{coverageStatus === 'PASS' ? '✓ PASS — ALL TOPICS, LOS, FORMULAS, DECISION RULES & TRAPS COVERED' :
							 coverageStatus === 'REVISE' ? '⚠ REVISE — SOME AREAS INCOMPLETE' :
							 '✗ INSTRUCTOR REVIEW REQUIRED'}
						</div>
					</div>
				)}

				{/* Footer */}
				<div style={{ padding: '12px 28px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', background: '#f8fafc' }}>
					<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>Milven Finance School | Diagrammatic Revision Dashboard {s.year}</Typography.Text>
					<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>Simplified. Exam-focused. Built to help you pass.</Typography.Text>
				</div>
			</div>
		</div>
	);
}

export default StudentSummarySheets;
