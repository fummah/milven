import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Grid, Modal, Pagination, Table, Tag } from 'antd';
import {
	BookOutlined, FilePdfOutlined, FileTextOutlined
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { ModuleNotePreviewCard } from '../../components/ModuleNotePreviewCard';
import StudentResourceSidebar from '../../components/resources/StudentResourceSidebar';
import {
	LearningExplorerHero, LearningExplorerLayout, LearningResourceEmptyState,
	LearningResourceHeader, LearningResourceSkeleton, LearningResourceStats
} from '../../components/learning-explorer/LearningExplorer.jsx';
import LearningResourceCard, {
	LearningResourceTitleCell, LearningViewAction
} from '../../components/learning-explorer/LearningResourceCard.jsx';
import { markExplorerReturn, useExplorerScrollMemory } from '../../lib/explorerSession.js';

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };
const SESSION_SCOPE = 'module-notes';

export function StudentModuleNotes() {
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
	const [notes, setNotes] = useState([]);
	const [total, setTotal] = useState(0);
	const [counts, setCounts] = useState({ ai: 0, manual: 0, uploadedPdf: 0 });
	const [courses, setCourses] = useState([]);
	const [coursesLoaded, setCoursesLoaded] = useState(false);
	const [viewMode, setViewMode] = useState(() => localStorage.getItem('milven.student-module-notes.view') || 'table');
	const [volumes, setVolumes] = useState([]);
	const [navigationTotal, setNavigationTotal] = useState(0);
	const [hierarchyLoading, setHierarchyLoading] = useState(false);
	const [hierarchyError, setHierarchyError] = useState('');
	const [filterCourseId, setFilterCourseId] = useState(initial.current.courseId || null);
	const [filterVolumeId, setFilterVolumeId] = useState(null);
	const [searchText, setSearchText] = useState(initial.current.search);
	const [searchTerm, setSearchTerm] = useState(initial.current.search);
	const [page, setPage] = useState(initial.current.page || 1);
	const [reloadKey, setReloadKey] = useState(0);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewNote, setPreviewNote] = useState(null);
	const [sidebarOpen, setSidebarOpen] = useState(false);
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
		api.get('/api/module-notes/navigation', { params: filterCourseId ? { courseId: filterCourseId } : {} })
			.then(r => {
				if (cancelled) return;
				const list = r.data?.volumes || [];
				setVolumes(list);
				setNavigationTotal(r.data?.totalCount || 0);
				if (!initialNavigationApplied.current) {
					const volume = list.find(item => item.id === initial.current.volumeId)
						|| (initial.current.moduleId ? list.find(item => item.modules.some(module => module.id === initial.current.moduleId)) : null);
					if (volume) setFilterVolumeId(volume.id);
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

	useEffect(() => {
		const timer = setTimeout(() => { setSearchTerm(searchText.trim()); setPage(1); }, 300);
		return () => clearTimeout(timer);
	}, [searchText]);

	const fetchNotes = useCallback(async (silent = false) => {
		const sequence = ++requestSequence.current;
		if (!silent) setLoading(true);
		try {
			const params = { page, limit: 24, status: 'PUBLISHED' };
			if (filterCourseId) params.courseId = filterCourseId;
			if (filterVolumeId) params.volumeId = filterVolumeId;
			if (searchTerm) params.search = searchTerm;
			const res = await api.get('/api/module-notes/unified', { params });
			if (sequence !== requestSequence.current) return;
			setNotes(res.data?.resources || []);
			setTotal(res.data?.total || 0);
			setCounts(res.data?.counts || { ai: 0, manual: 0, uploadedPdf: 0 });
			setError('');
		} catch (err) {
			if (sequence === requestSequence.current) {
				setNotes([]);
				setTotal(0);
				setCounts({ ai: 0, manual: 0, uploadedPdf: 0 });
				setError(err?.response?.data?.error || 'Could not load module notes.');
			}
		} finally {
			if (!silent && sequence === requestSequence.current) setLoading(false);
		}
	}, [page, filterCourseId, filterVolumeId, searchTerm]);

	useEffect(() => { fetchNotes(); }, [fetchNotes, reloadKey]);

	const hasProcessingPdf = useMemo(() => notes.some(item => item.type === 'PDF' && ['UPLOADED', 'INDEXING'].includes(item.processingStatus)), [notes]);
	useEffect(() => {
		if (!hasProcessingPdf) return undefined;
		let cancelled = false;
		let timer = null;
		const poll = async () => {
			if (cancelled) return;
			try { await fetchNotes(true); } catch {}
			if (!cancelled) timer = setTimeout(poll, 6000);
		};
		timer = setTimeout(poll, 6000);
		return () => { cancelled = true; if (timer) clearTimeout(timer); };
	}, [hasProcessingPdf, fetchNotes]);

	useEffect(() => {
		if (!filterCourseId) return;
		const next = new URLSearchParams(searchParams);
		const values = {
			courseId: filterCourseId,
			volumeId: filterVolumeId || '',
			q: searchTerm || '',
			page: page > 1 ? String(page) : ''
		};
		Object.entries(values).forEach(([key, value]) => {
			if (value) next.set(key, value);
			else next.delete(key);
		});
		if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
	}, [filterCourseId, filterVolumeId, searchTerm, page, searchParams, setSearchParams]);

	const selectAll = () => {
		clearTreeFilter();
		if (isMobile) setSidebarOpen(false);
	};

	const selectVolume = volume => {
		setFilterVolumeId(volume.id);
		setPage(1);
		if (isMobile) setSidebarOpen(false);
	};

	const clearTreeFilter = () => { setFilterVolumeId(null); setPage(1); };

	const clearAllFilters = () => {
		setSearchText('');
		setSearchTerm('');
		clearTreeFilter();
	};

	const changeCourse = value => {
		setFilterCourseId(value || null);
		setFilterVolumeId(null);
		setPage(1);
		if (isMobile) setSidebarOpen(false);
	};

	const changeView = mode => {
		setViewMode(mode);
		try { localStorage.setItem('milven.student-module-notes.view', mode); } catch {}
	};

	const openPdfResource = resource => {
		markExplorerReturn(SESSION_SCOPE);
		navigate(`/learning/module-notes-pdf/${resource.resourceId || resource.id}${resource.matchPage ? `?page=${resource.matchPage}` : ''}`);
	};

	const openResource = resource => {
		if (resource.type === 'PDF') openPdfResource(resource);
		else {
			setPreviewNote(resource);
			setPreviewOpen(true);
		}
	};

	const activeLabel = selectedVolume?.name || null;
	const hasActiveFilters = Boolean(searchText || filterVolumeId);
	const searchMode = Boolean(searchTerm);

	const columns = isMobile ? [
		{
			title: 'Resource', key: 'resource',
			render: (_, resource) => (
				<LearningResourceTitleCell
					resource={resource}
					variant="module-note"
					onView={() => openResource(resource)}
					metaLines={[
						LEVEL_LABELS[resource.level] || resource.level,
						resource.type === 'PDF' ? null : resource.volume?.name
					]}
				/>
			)
		},
		{ title: 'Actions', key: 'actions', width: 96, className: 'learning-actions-cell', render: (_, resource) => <LearningViewAction onClick={() => openResource(resource)} /> }
	] : [
		{
			title: 'Resource', key: 'resource',
			render: (_, resource) => (
				<LearningResourceTitleCell
					resource={resource}
					variant="module-note"
					onView={() => openResource(resource)}
					metaLines={[resource.type === 'PDF' ? null : resource.volume?.name]}
				/>
			)
		},
		{
			title: 'Level', key: 'level', width: 100, className: 'learning-level-cell',
			render: (_, resource) => <Tag color={resource.level === 'LEVEL1' ? 'blue' : resource.level === 'LEVEL2' ? 'purple' : 'gold'}>{LEVEL_LABELS[resource.level] || resource.level}</Tag>
		},
		{ title: 'Actions', key: 'actions', width: 110, className: 'learning-actions-cell', render: (_, resource) => <LearningViewAction onClick={() => openResource(resource)} /> }
	];

	const statsItems = [
		{ label: 'Available Resources', value: total, tone: 'purple', icon: <FileTextOutlined /> },
		{ label: 'Learning Notes', value: (counts.ai || 0) + (counts.manual || 0), tone: 'blue', icon: <BookOutlined /> },
		{ label: 'PDF Module Notes', value: counts.uploadedPdf || 0, tone: 'gold', icon: <FilePdfOutlined /> }
	];

	const emptyState = (() => {
		if (coursesLoaded && courses.length === 0) {
			return {
				title: 'No active course access',
				description: 'You do not currently have access to any learning courses.',
				action: <Button type="primary" onClick={() => navigate('/courses')}>Browse Courses</Button>
			};
		}
		if (searchMode) {
			return {
				title: 'No notes matched your search',
				description: `No notes, topics or concepts match "${searchTerm}". Try another term or clear your filters.`,
				action: <Button onClick={clearAllFilters}>Clear Filters</Button>
			};
		}
		if (filterVolumeId) {
			return {
				title: 'No module notes published for this volume',
				description: 'Choose another volume or view all notes in this course.',
				action: <Button onClick={selectAll}>View All Notes</Button>
			};
		}
		return {
			title: 'No module notes published for this course',
			description: 'Your course does not have any published module notes yet.',
			action: null
		};
	})();

	const sidebar = (
		<StudentResourceSidebar
			title="Milven Notes"
			icon={<BookOutlined />}
			allLabel="All Notes"
			courses={courses}
			courseId={filterCourseId}
			onCourseChange={changeCourse}
			volumes={hierarchyTree}
			totalCount={navigationTotal}
			selectedVolumeId={filterVolumeId}
			onSelectAll={selectAll}
			onSelectVolume={selectVolume}
			activeLabel={activeLabel}
			onClearFilter={clearTreeFilter}
			treeSearch={treeSearch}
			onTreeSearch={setTreeSearch}
			isMobile={isMobile}
			open={sidebarOpen}
			onClose={() => setSidebarOpen(false)}
			loading={hierarchyLoading}
			error={hierarchyError}
			showModules={false}
		/>
	);

	return (
		<LearningExplorerLayout
			hero={<LearningExplorerHero eyebrow="MILVEN MODULE NOTES" title="Learning Explorer" description="Explore comprehensive, exam-focused notes across your CFA curriculum." variant="notes" />}
			sidebar={sidebar}
		>
			<LearningResourceHeader
				title="Module Notes"
				subtitle="Comprehensive exam-focused learning notes."
				icon={<BookOutlined />}
				searchValue={searchText}
				onSearchChange={setSearchText}
				searchPlaceholder="Search notes, topics and concepts"
				viewMode={viewMode}
				onViewChange={changeView}
				isMobile={isMobile}
				onOpenFilters={() => setSidebarOpen(true)}
				extra={hasActiveFilters ? <Button size="small" onClick={clearAllFilters}>Clear</Button> : null}
			/>

			<LearningResourceStats items={statsItems} />

			{loading ? (
				<LearningResourceSkeleton viewMode={viewMode} />
			) : error ? (
				<Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => setReloadKey(key => key + 1)}>Retry</Button>} />
			) : notes.length === 0 ? (
				<LearningResourceEmptyState {...emptyState} />
			) : viewMode === 'table' ? (
				<div className="learning-resource-table">
					<Table
						dataSource={notes}
						columns={columns}
						rowKey={resource => resource.resourceKey || resource.id}
						tableLayout="fixed"
						pagination={{ current: page, pageSize: 24, total, showSizeChanger: false, onChange: setPage, showTotal: count => `${count} resources` }}
					/>
				</div>
			) : (
				<>
					<div className="learning-resource-grid">
						{notes.map(resource => (
							<LearningResourceCard
								key={resource.resourceKey || resource.id}
								resource={resource}
								variant="module-note"
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

			<Modal open={previewOpen} onCancel={() => { setPreviewOpen(false); setPreviewNote(null); }} footer={null} width={isMobile ? '95%' : 1100} centered title={null} styles={{ body: { padding: 0 } }}>
				{previewNote && <ModuleNotePreviewCard note={previewNote} />}
			</Modal>
		</LearningExplorerLayout>
	);
}

export default StudentModuleNotes;
