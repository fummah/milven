import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Pagination, Table, Tag, Typography, Grid } from 'antd';
import {
	AppstoreOutlined, ArrowLeftOutlined, ArrowRightOutlined, BookOutlined,
	FilePptOutlined, FileTextOutlined, FolderOutlined, FunctionOutlined,
	MenuOutlined, SearchOutlined, SnippetsOutlined
} from '@ant-design/icons';
import { api } from '../../lib/api';
import { assetUrl, highlightParts, levelLabel, presentationViewerPath } from '../../lib/slideUrls';
import StudentResourceSidebar from '../../components/resources/StudentResourceSidebar';
import {
	LearningExplorerHero, LearningExplorerLayout, LearningResourceEmptyState,
	LearningResourceHeader, LearningResourceSkeleton, LearningResourceStats
} from '../../components/learning-explorer/LearningExplorer.jsx';
import LearningResourceCard, { LearningResourceTitleCell, LearningViewAction } from '../../components/learning-explorer/LearningResourceCard.jsx';
import { markExplorerReturn, useExplorerScrollMemory } from '../../lib/explorerSession.js';

const { Text } = Typography;
const { useBreakpoint } = Grid;

const SESSION_SCOPE = 'slides';

export default function StudentSlides() {
	const navigate = useNavigate();
	const screens = useBreakpoint();
	const isMobile = !screens.xl;
	const [searchParams, setSearchParams] = useSearchParams();
	const initial = useRef({
		courseId: searchParams.get('courseId') || '',
		volumeId: searchParams.get('volumeId') || '',
		moduleId: searchParams.get('moduleId') || '',
		scope: searchParams.get('scope') || '',
		q: searchParams.get('q') || '',
		page: Number(searchParams.get('page') || 1)
	});

	const [courses, setCourses] = useState([]);
	const [coursesLoaded, setCoursesLoaded] = useState(false);
	const [courseId, setCourseId] = useState(undefined);
	const [volumes, setVolumes] = useState([]);
	const [hierarchyLoading, setHierarchyLoading] = useState(false);
	const [selectedVolumeId, setSelectedVolumeId] = useState(undefined);
	const [selectedModuleId, setSelectedModuleId] = useState(undefined);
	const [wholeVolumeOnly, setWholeVolumeOnly] = useState(false);
	const [expandedVolumes, setExpandedVolumes] = useState(new Set());
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [treeSearch, setTreeSearch] = useState('');

	const [presentations, setPresentations] = useState([]);
	const [total, setTotal] = useState(0);
	const [stats, setStats] = useState(null);
	const [viewMode, setViewMode] = useState(() => localStorage.getItem('milven.student-slides.view') || 'table');
	const [page, setPage] = useState(initial.current.page || 1);
	const [pageSize, setPageSize] = useState(24);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [reloadKey, setReloadKey] = useState(0);

	const [searchInput, setSearchInput] = useState(initial.current.q);
	const [searchTerm, setSearchTerm] = useState(initial.current.q);
	const [searchResults, setSearchResults] = useState([]);
	const [searchTotal, setSearchTotal] = useState(0);
	const [searching, setSearching] = useState(false);
	const [searchError, setSearchError] = useState('');

	const initialNavigationApplied = useRef(false);
	const hierarchySequence = useRef(0);
	const listSequence = useRef(0);
	const statsSequence = useRef(0);

	useExplorerScrollMemory(SESSION_SCOPE, !loading && !searching && coursesLoaded);

	useEffect(() => {
		api.get('/api/slides/library/courses')
			.then(res => {
				const list = res.data?.courses || [];
				setCourses(list);
				const requested = initial.current.courseId;
				const chosen = list.find(c => c.id === requested)?.id || list[0]?.id;
				setCourseId(chosen);
			})
			.catch(() => setError('Could not load your enrolled courses.'))
			.finally(() => setCoursesLoaded(true));
	}, []);

	useEffect(() => {
		if (!courseId) {
			setVolumes([]);
			setStats(null);
			setHierarchyLoading(false);
			return undefined;
		}
		const sequence = ++hierarchySequence.current;
		setHierarchyLoading(true);
		setPresentations([]);
		api.get('/api/slides/library/hierarchy', { params: { courseId } })
			.then(res => {
				if (sequence !== hierarchySequence.current) return;
				const list = res.data?.volumes || [];
				setVolumes(list);
				if (!initialNavigationApplied.current) {
					const requestedVolume = initial.current.volumeId;
					const requestedModule = initial.current.moduleId;
					const volume = list.find(v => v.id === requestedVolume);
					if (volume) {
						setSelectedVolumeId(volume.id);
						setExpandedVolumes(new Set([volume.id]));
						if (requestedModule && volume.modules.some(m => m.id === requestedModule)) {
							setSelectedModuleId(requestedModule);
						} else if (initial.current.scope === 'WHOLE_VOLUME') {
							setWholeVolumeOnly(true);
						}
					} else {
						setSelectedVolumeId(undefined);
						setSelectedModuleId(undefined);
						setWholeVolumeOnly(false);
					}
					initialNavigationApplied.current = true;
				}
			})
			.catch(() => {
				if (sequence !== hierarchySequence.current) return;
				setVolumes([]);
				setError('Could not load the slides hierarchy for this course.');
			})
			.finally(() => {
				if (sequence === hierarchySequence.current) setHierarchyLoading(false);
			});
		return () => { hierarchySequence.current += 1; };
	}, [courseId]);

	useEffect(() => {
		if (!courseId) return undefined;
		const sequence = ++statsSequence.current;
		const params = { courseId };
		if (selectedVolumeId) params.volumeId = selectedVolumeId;
		if (selectedModuleId) params.moduleId = selectedModuleId;
		if (wholeVolumeOnly) params.scope = 'WHOLE_VOLUME';
		api.get('/api/slides/library/stats', { params })
			.then(res => {
				if (sequence === statsSequence.current) setStats(res.data || null);
			})
			.catch(() => {
				if (sequence === statsSequence.current) setStats(null);
			});
		return () => { statsSequence.current += 1; };
	}, [courseId, selectedVolumeId, selectedModuleId, wholeVolumeOnly]);

	useEffect(() => {
		const timer = setTimeout(() => {
			setSearchTerm(searchInput.trim());
			setPage(1);
		}, 350);
		return () => clearTimeout(timer);
	}, [searchInput]);

	useEffect(() => {
		if (!courseId) {
			setLoading(false);
			setPresentations([]);
			setTotal(0);
			setSearchResults([]);
			setSearchTotal(0);
			return undefined;
		}
		const sequence = ++listSequence.current;
		const term = searchTerm.trim();
		if (term.length >= 2) {
			setSearching(true);
			setSearchError('');
			const params = { q: term, page, limit: pageSize, courseId };
			if (selectedVolumeId) params.volumeId = selectedVolumeId;
			if (selectedModuleId) params.moduleId = selectedModuleId;
			api.get('/api/slides/search', { params })
				.then(res => {
					if (sequence !== listSequence.current) return;
					setSearchResults(res.data?.results || []);
					setSearchTotal(res.data?.total || 0);
				})
				.catch(err => {
					if (sequence !== listSequence.current) return;
					setSearchResults([]);
					setSearchTotal(0);
					setSearchError(err?.response?.data?.error || 'Search is temporarily unavailable.');
				})
				.finally(() => {
					if (sequence === listSequence.current) setSearching(false);
				});
			return () => { listSequence.current += 1; };
		}

		setLoading(true);
		setError('');
		const params = { courseId, page, limit: pageSize };
		if (selectedVolumeId) params.volumeId = selectedVolumeId;
		if (selectedModuleId) params.moduleId = selectedModuleId;
		if (wholeVolumeOnly) params.scope = 'WHOLE_VOLUME';
		api.get('/api/slides/library/presentations', { params })
			.then(res => {
				if (sequence !== listSequence.current) return;
				setPresentations(res.data?.presentations || []);
				setTotal(res.data?.total || 0);
			})
			.catch(err => {
				if (sequence !== listSequence.current) return;
				setPresentations([]);
				setTotal(0);
				setError(err?.response?.data?.error || 'Could not load presentations.');
			})
			.finally(() => {
				if (sequence === listSequence.current) setLoading(false);
			});
		return () => { listSequence.current += 1; };
	}, [courseId, selectedVolumeId, selectedModuleId, wholeVolumeOnly, page, pageSize, searchTerm, reloadKey]);

	useEffect(() => {
		if (!courseId) return;
		const next = new URLSearchParams(searchParams);
		const values = {
			courseId,
			volumeId: selectedVolumeId || '',
			moduleId: selectedModuleId || '',
			scope: wholeVolumeOnly ? 'WHOLE_VOLUME' : '',
			q: searchTerm || '',
			page: page > 1 ? String(page) : ''
		};
		Object.entries(values).forEach(([key, value]) => {
			if (value) next.set(key, value);
			else next.delete(key);
		});
		if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
	}, [courseId, selectedVolumeId, selectedModuleId, wholeVolumeOnly, searchTerm, page, searchParams, setSearchParams]);

	const course = courses.find(c => c.id === courseId);
	const selectedVolume = volumes.find(v => v.id === selectedVolumeId);
	const selectedModule = selectedVolume?.modules?.find(m => m.id === selectedModuleId);

	const flatModules = useMemo(() => {
		const rows = [];
		volumes
			.slice()
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
			.forEach(volume => {
				(volume.modules || []).forEach(module => {
					if ((module.presentationCount || 0) > 0) rows.push({ ...module, volumeId: volume.id, volumeName: volume.name });
				});
			});
		return rows;
	}, [volumes]);

	const sidebarVolumes = useMemo(() => {
		const term = treeSearch.toLowerCase().trim();
		const rows = volumes.map(volume => ({
			...volume,
			resourceCount: volume.presentationCount ?? volume.resourceCount ?? 0,
			modules: (volume.modules || []).map(module => ({
				...module,
				resourceCount: module.presentationCount ?? module.resourceCount ?? 0
			}))
		}));
		if (!term) return rows;
		return rows.filter(volume => (
			volume.name?.toLowerCase().includes(term)
			|| volume.modules.some(module => module.name?.toLowerCase().includes(term))
		));
	}, [volumes, treeSearch]);

	const moduleIndex = selectedModuleId ? flatModules.findIndex(m => m.id === selectedModuleId) : -1;
	const previousModule = moduleIndex > 0 ? flatModules[moduleIndex - 1] : null;
	const nextModule = moduleIndex >= 0 && moduleIndex < flatModules.length - 1 ? flatModules[moduleIndex + 1] : null;

	const selectAll = () => {
		setSelectedVolumeId(undefined);
		setSelectedModuleId(undefined);
		setWholeVolumeOnly(false);
		setPage(1);
		if (isMobile) setSidebarOpen(false);
	};

	const selectVolume = (volume, whole = false) => {
		setSelectedVolumeId(volume.id);
		setSelectedModuleId(undefined);
		setWholeVolumeOnly(whole);
		setPage(1);
		if (isMobile) setSidebarOpen(false);
	};

	const selectModule = (module, volume) => {
		setSelectedVolumeId(volume.id);
		setSelectedModuleId(module.id);
		setWholeVolumeOnly(false);
		setPage(1);
		if (isMobile) setSidebarOpen(false);
	};

	const goToModule = (module) => {
		const volume = volumes.find(v => v.id === module.volumeId);
		if (volume) selectModule(module, volume);
		setExpandedVolumes(prev => new Set([...prev, module.volumeId]));
	};

	const openPresentation = (presentation, slideNumber) => {
		markExplorerReturn(SESSION_SCOPE);
		navigate(presentationViewerPath(presentation.id, slideNumber));
	};

	const changeCourse = (value) => {
		setCourseId(value);
		setSelectedVolumeId(undefined);
		setSelectedModuleId(undefined);
		setWholeVolumeOnly(false);
		setPage(1);
		if (isMobile) setSidebarOpen(false);
	};

	const changeView = mode => {
		setViewMode(mode);
		try { localStorage.setItem('milven.student-slides.view', mode); } catch {}
	};

	const clearFilters = () => {
		setSearchInput('');
		selectAll();
	};

	const activeLabel = wholeVolumeOnly
		? `${selectedVolume?.name || 'Volume'} - Whole Volume Review`
		: selectedModule
			? selectedModule.name
			: selectedVolume
				? `${selectedVolume.name} - all presentations`
				: 'All presentations';

	const searchMode = searchTerm.trim().length >= 2;
	const hasActiveFilters = Boolean(searchInput || selectedVolumeId || selectedModuleId || wholeVolumeOnly);

	const presentationColumns = isMobile ? [
		{
			title: 'Presentation', key: 'presentation',
			render: (_, presentation) => (
				<LearningResourceTitleCell
					resource={{
						...presentation,
						level: presentation.course?.level,
						volume: presentation.volume,
						module: presentation.module,
						slideCount: presentation.slideCount
					}}
					variant="slide"
					onView={() => openPresentation(presentation)}
					metaLines={[
						presentation.course?.level ? `CFA ${levelLabel(presentation.course.level)}` : null,
						presentation.volume?.name,
						presentation.scope === 'WHOLE_VOLUME'
							? 'Whole Volume Review'
							: (presentation.module?.name && presentation.module.name.trim() !== String(presentation.title || '').trim() ? presentation.module.name : null)
					]}
				/>
			)
		},
		{ title: 'Actions', key: 'actions', width: 96, className: 'learning-actions-cell', render: (_, presentation) => <LearningViewAction onClick={() => openPresentation(presentation)} /> }
	] : [
		{
			title: 'Presentation', key: 'presentation',
			render: (_, presentation) => (
				<LearningResourceTitleCell
					resource={{
						...presentation,
						level: presentation.course?.level,
						volume: presentation.volume,
						module: presentation.module,
						slideCount: presentation.slideCount
					}}
					variant="slide"
					onView={() => openPresentation(presentation)}
					metaLines={[presentation.volume?.name]}
				/>
			)
		},
		{
			title: 'Level', key: 'level', width: 100, className: 'learning-level-cell',
			render: (_, presentation) => <Tag color={presentation.course?.level === 'LEVEL1' ? 'blue' : presentation.course?.level === 'LEVEL2' ? 'purple' : 'gold'}>{levelLabel(presentation.course?.level)}</Tag>
		},
		{
			title: 'Learning Module', key: 'module', width: 180, className: 'learning-module-cell',
			render: (_, presentation) => presentation.scope === 'WHOLE_VOLUME'
				? <Tag color="gold" style={{ whiteSpace: 'normal' }}>Whole Volume Review</Tag>
				: <div className="learning-meta-cell">{presentation.module?.name || '-'}</div>
		},
		{ title: 'Actions', key: 'actions', width: 110, className: 'learning-actions-cell', render: (_, presentation) => <LearningViewAction onClick={() => openPresentation(presentation)} /> }
	];

	const statsItems = [
		{ label: 'Presentations', value: stats?.presentations, tone: 'purple', icon: <FilePptOutlined /> },
		{ label: 'Total Slides', value: stats?.slides, tone: 'blue', icon: <FileTextOutlined /> },
		{ label: 'Learning Modules', value: stats?.modules, tone: 'gold', icon: <AppstoreOutlined /> },
		{ label: 'Whole Volume Reviews', value: stats?.wholeVolume, tone: 'green', icon: <FolderOutlined /> }
	];

	const moduleContext = selectedModule && !searchMode ? (
		<div className="learning-module-context">
			<div className="learning-module-context-copy">
				<strong>{selectedModule.name}</strong>
				{selectedVolume?.name ? ` / ${selectedVolume.name}` : ''}
			</div>
			<div className="learning-module-context-actions">
				<Button size="small" icon={<SnippetsOutlined />} onClick={() => navigate(`/student/module-notes?courseId=${courseId}&volumeId=${selectedVolumeId}&moduleId=${selectedModule.id}`)}>Module Notes</Button>
				<Button size="small" icon={<FileTextOutlined />} onClick={() => navigate(`/student/summary-sheets?courseId=${courseId}&volumeId=${selectedVolumeId}&moduleId=${selectedModule.id}`)}>Summary Sheets</Button>
				<Button size="small" icon={<FunctionOutlined />} onClick={() => navigate(`/student/formula-book?courseId=${courseId}`)}>Formula Book</Button>
				<Button size="small" icon={<BookOutlined />} onClick={() => navigate('/student/exams')}>Practice Questions</Button>
			</div>
		</div>
	) : null;

	const emptyState = (() => {
		if (searchMode) {
			return {
				title: 'No slide content matched your search',
				description: `No published slides match "${searchTerm}". Try a different concept, phrase or clear your filters.`,
				action: <Button onClick={() => setSearchInput('')}>Clear Search</Button>
			};
		}
		if (selectedModule) {
			return {
				title: 'No presentations found for this learning module',
				description: 'Try another module or clear your filters.',
				action: <Button onClick={clearFilters}>Clear Filters</Button>
			};
		}
		if (selectedVolume) {
			return {
				title: 'No presentations published for this volume',
				description: 'Choose another volume or view all presentations in this course.',
				action: <Button onClick={selectAll}>View All Presentations</Button>
			};
		}
		if (coursesLoaded && courses.length === 0) {
			return {
				title: 'No active course access',
				description: 'You do not currently have access to any learning courses.',
				action: <Button type="primary" onClick={() => navigate('/courses')}>Browse Courses</Button>
			};
		}
		return {
			title: 'No presentations published for this course',
			description: 'Your course does not have any published presentations yet.',
			action: null
		};
	})();

	const sidebar = (
		<StudentResourceSidebar
			title="Course & Modules"
			icon={<FilePptOutlined />}
			allLabel="All Presentations"
			courses={courses}
			courseId={courseId}
			onCourseChange={changeCourse}
			volumes={sidebarVolumes}
			totalCount={stats?.presentations || 0}
			selectedVolumeId={selectedVolumeId}
			selectedModuleId={selectedModuleId}
			wholeVolumeSelected={wholeVolumeOnly}
			expandedVolumes={expandedVolumes}
			onToggleVolume={volumeId => setExpandedVolumes(prev => {
				const next = new Set(prev);
				if (next.has(volumeId)) next.delete(volumeId);
				else next.add(volumeId);
				return next;
			})}
			onSelectAll={selectAll}
			onSelectVolume={volume => selectVolume(volume)}
			onSelectModule={selectModule}
			onSelectWholeVolume={volume => selectVolume(volume, true)}
			activeLabel={selectedVolumeId || selectedModuleId ? activeLabel : null}
			onClearFilter={selectAll}
			treeSearch={treeSearch}
			onTreeSearch={setTreeSearch}
			isMobile={isMobile}
			open={sidebarOpen}
			onClose={() => setSidebarOpen(false)}
			loading={hierarchyLoading}
			error=""
			showModules
		/>
	);

	return (
		<LearningExplorerLayout
			hero={<LearningExplorerHero eyebrow="MILVEN SLIDES" title="Learning Explorer" description="Browse, preview, and study slide presentations by learning module." variant="slides" />}
			sidebar={sidebar}
		>
			<LearningResourceHeader
				title="Slides"
				subtitle="All presentations in your selected course."
				icon={<FilePptOutlined />}
				searchValue={searchInput}
				onSearchChange={setSearchInput}
				searchPlaceholder="Search slide content, e.g. convexity"
				viewMode={viewMode}
				onViewChange={changeView}
				isMobile={isMobile}
				onOpenFilters={() => setSidebarOpen(true)}
				extra={hasActiveFilters ? <Button size="small" onClick={clearFilters}>Clear</Button> : null}
			/>

			<LearningResourceStats items={statsItems} />
			{moduleContext}

			{selectedModule && !searchMode && (
				<div className="learning-main-actions" style={{ marginBottom: 14 }}>
					<Button icon={<ArrowLeftOutlined />} disabled={!previousModule} onClick={() => previousModule && goToModule(previousModule)}>
						{previousModule ? previousModule.name.split(':')[0] : 'Previous module'}
					</Button>
					<Button icon={<ArrowRightOutlined />} iconPosition="end" disabled={!nextModule} onClick={() => nextModule && goToModule(nextModule)}>
						{nextModule ? nextModule.name.split(':')[0] : 'Next module'}
					</Button>
				</div>
			)}

			{searchMode ? (
				<SearchPanel
					q={searchTerm}
					loading={searching}
					error={searchError}
					results={searchResults}
					total={searchTotal}
					page={page}
					pageSize={pageSize}
					course={course}
					onPageChange={(nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize || pageSize); }}
					onOpen={openPresentation}
				/>
			) : loading ? (
				<LearningResourceSkeleton viewMode={viewMode} />
			) : error ? (
				<Alert
					type="error"
					showIcon
					message={error}
					action={<Button size="small" onClick={() => setReloadKey(key => key + 1)}>Retry</Button>}
				/>
			) : coursesLoaded && courses.length === 0 ? (
				<LearningResourceEmptyState {...emptyState} />
			) : presentations.length === 0 ? (
				<LearningResourceEmptyState {...emptyState} />
			) : viewMode === 'table' ? (
				<div className="learning-resource-table">
					<Table
						dataSource={presentations}
						columns={presentationColumns}
						rowKey="id"
						tableLayout="fixed"
						pagination={{
							current: page,
							pageSize,
							total,
							showSizeChanger: true,
							pageSizeOptions: [12, 24, 48],
							onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize || pageSize); },
							showTotal: count => `${count} presentations`
						}}
					/>
				</div>
			) : (
				<>
					<div className="learning-resource-grid">
						{presentations.map(presentation => (
							<LearningResourceCard
								key={presentation.id}
								resource={{
									...presentation,
									level: presentation.course?.level,
									volume: presentation.volume,
									module: presentation.module
								}}
								variant="slide"
								onView={() => openPresentation(presentation)}
							/>
						))}
					</div>
					{total > pageSize && (
						<div className="learning-pagination">
							<Pagination current={page} pageSize={pageSize} total={total} showSizeChanger pageSizeOptions={[12, 24, 48]} onChange={(nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize || pageSize); }} showTotal={count => `${count} presentations`} />
						</div>
					)}
				</>
			)}
		</LearningExplorerLayout>
	);
}

function SearchPanel({ q, loading, error, results, total, page, pageSize, course, onPageChange, onOpen }) {
	if (loading) return <LearningResourceSkeleton viewMode="table" count={4} />;
	if (error) return <Alert type="error" showIcon message={error} />;
	if (!results.length) {
		return (
			<LearningResourceEmptyState
				title="No slide content matched your search"
				description={`No published slides match "${q}". Try a different concept or phrase.`}
				action={<Button onClick={() => onPageChange(1, pageSize)}>Try Again</Button>}
			/>
		);
	}
	return (
		<div>
			<div className="learning-search-summary">{total} matching result{total === 1 ? '' : 's'} for "{q}"</div>
			{results.map((result, index) => {
				const presentation = result.presentation || {};
				return (
					<div
						key={`${result.presentationId}-${result.slideNumber}-${index}`}
						className="learning-search-result"
						role="button"
						tabIndex={0}
						onClick={() => onOpen(presentation, result.slideNumber)}
						onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(presentation, result.slideNumber); } }}
					>
						<div className="learning-search-result-card">
							<div className="learning-search-thumb">
								{result.thumbnailUrl && (
									<img
										src={assetUrl(result.thumbnailUrl)}
										alt=""
										loading="lazy"
										onError={event => { event.currentTarget.style.display = 'none'; }}
									/>
								)}
							</div>
							<div className="learning-search-result-body">
								<div className="learning-search-result-title">{presentation.title}</div>
								<div className="learning-search-result-meta">
									{levelLabel(presentation.course?.level || course?.level)} / {presentation.volume?.name || '-'}{presentation.module?.name ? ` / ${presentation.module.name}` : ''}
								</div>
								<p className="learning-search-excerpt">
									{highlightParts(result.excerpt, q).map((part, i) => (
										part.match
											? <mark key={i} style={{ background: '#fde68a', padding: 0 }}>{part.text}</mark>
											: <React.Fragment key={i}>{part.text}</React.Fragment>
									))}
								</p>
							</div>
							<div className="learning-search-result-actions">
								<Tag color="blue" style={{ marginBottom: 8 }}>Slide {result.slideNumber}</Tag>
								<Button type="link" icon={<SearchOutlined />}>Open Slide</Button>
							</div>
						</div>
					</div>
				);
			})}
			{total > pageSize && (
				<div className="learning-pagination">
					<Pagination current={page} pageSize={pageSize} total={total} onChange={onPageChange} showTotal={count => `${count} results`} />
				</div>
			)}
		</div>
	);
}
