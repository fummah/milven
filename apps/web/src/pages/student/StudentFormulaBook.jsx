import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Grid, Modal, Pagination, Table, Tag } from 'antd';
import {
	BookOutlined, FilePdfOutlined, FunctionOutlined, PrinterOutlined
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import StudentResourceSidebar from '../../components/resources/StudentResourceSidebar';
import {
	LearningExplorerHero, LearningExplorerLayout, LearningResourceEmptyState,
	LearningResourceHeader, LearningResourceSkeleton, LearningResourceStats
} from '../../components/learning-explorer/LearningExplorer.jsx';
import LearningResourceCard, {
	LearningResourceTitleCell, LearningViewAction
} from '../../components/learning-explorer/LearningResourceCard.jsx';
import { markExplorerReturn, useExplorerScrollMemory } from '../../lib/explorerSession.js';
import { ListPreviewCard } from '../FormulaBook.jsx';

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };
const SESSION_SCOPE = 'formula-book';

export default function StudentFormulaBook() {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const screens = Grid.useBreakpoint();
	const isMobile = !screens.xl;
	const initial = useRef({
		courseId: searchParams.get('courseId') || '',
		volumeId: searchParams.get('volumeId') || '',
		search: searchParams.get('q') || '',
		page: Number(searchParams.get('page') || 1)
	});
	const initialNavigationApplied = useRef(false);
	const requestSequence = useRef(0);

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [resources, setResources] = useState([]);
	const [total, setTotal] = useState(0);
	const [counts, setCounts] = useState({ ai: 0, manual: 0, uploadedPdf: 0 });
	const [courses, setCourses] = useState([]);
	const [coursesLoaded, setCoursesLoaded] = useState(false);
	const [volumes, setVolumes] = useState([]);
	const [navigationTotal, setNavigationTotal] = useState(0);
	const [hierarchyLoading, setHierarchyLoading] = useState(false);
	const [hierarchyError, setHierarchyError] = useState('');
	const [filterCourseId, setFilterCourseId] = useState(initial.current.courseId || null);
	const [filterVolumeId, setFilterVolumeId] = useState(null);
	const [searchText, setSearchText] = useState(initial.current.search);
	const [searchTerm, setSearchTerm] = useState(initial.current.search);
	const [page, setPage] = useState(initial.current.page || 1);
	const pageSize = 24;
	const [viewMode, setViewMode] = useState(() => localStorage.getItem('milven.student-formula.view') || 'table');
	const [previewFormula, setPreviewFormula] = useState(null);
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [treeSearch, setTreeSearch] = useState('');
	const [reloadKey, setReloadKey] = useState(0);

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
		api.get('/api/formulas/navigation', { params: filterCourseId ? { courseId: filterCourseId } : {} })
			.then(r => {
				if (cancelled) return;
				const list = r.data?.volumes || [];
				setVolumes(list);
				setNavigationTotal(r.data?.totalCount || 0);
				if (!initialNavigationApplied.current) {
					const volume = list.find(item => item.id === initial.current.volumeId);
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

	useEffect(() => {
		const timer = setTimeout(() => { setSearchTerm(searchText.trim()); setPage(1); }, 300);
		return () => clearTimeout(timer);
	}, [searchText]);

	useEffect(() => {
		if (!coursesLoaded) return undefined;
		if (!courses.length) {
			setResources([]);
			setTotal(0);
			setCounts({ ai: 0, manual: 0, uploadedPdf: 0 });
			setLoading(false);
			return undefined;
		}
		const sequence = ++requestSequence.current;
		const params = { page, limit: pageSize };
		if (filterCourseId) params.courseId = filterCourseId;
		if (filterVolumeId) params.volumeId = filterVolumeId;
		if (searchTerm) params.search = searchTerm;
		setLoading(true);
		api.get('/api/formulas/unified', { params })
			.then(r => {
				if (sequence !== requestSequence.current) return;
				setResources(r.data?.resources || []);
				setTotal(r.data?.total || 0);
				setCounts(r.data?.counts || { ai: 0, manual: 0, uploadedPdf: 0 });
				setError('');
			})
			.catch(err => {
				if (sequence !== requestSequence.current) return;
				setResources([]);
				setTotal(0);
				setCounts({ ai: 0, manual: 0, uploadedPdf: 0 });
				setError(err?.response?.data?.error || 'Could not load formula resources.');
			})
			.finally(() => {
				if (sequence === requestSequence.current) setLoading(false);
			});
		return () => { requestSequence.current += 1; };
	}, [coursesLoaded, courses.length, filterCourseId, filterVolumeId, searchTerm, page, reloadKey]);

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

	const hierarchyTree = useMemo(() => {
		const search = treeSearch.toLowerCase().trim();
		if (!search) return volumes;
		return volumes.filter(volume => volume.name?.toLowerCase().includes(search));
	}, [volumes, treeSearch]);

	const selectedVolume = volumes.find(volume => volume.id === filterVolumeId);
	const activeLabel = selectedVolume?.name || null;
	const hasActiveFilters = Boolean(searchText || filterVolumeId);
	const searchMode = Boolean(searchTerm);

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
		try { localStorage.setItem('milven.student-formula.view', mode); } catch {}
	};

	const openResource = resource => {
		if (resource.type === 'PDF') {
			markExplorerReturn(SESSION_SCOPE);
			navigate(`/learning/formula-books/${resource.resourceId || resource.id}${resource.matchPage ? `?page=${resource.matchPage}` : ''}`);
		} else setPreviewFormula(resource);
	};

	const columns = isMobile ? [
		{
			title: 'Resource', key: 'resource',
			render: (_, resource) => (
				<LearningResourceTitleCell
					resource={resource}
					variant="formula-book"
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
					variant="formula-book"
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

	const statistics = [
		{ label: 'Available Resources', value: total, tone: 'purple', icon: <BookOutlined /> },
		{ label: 'Formula Cards', value: (counts.ai || 0) + (counts.manual || 0), tone: 'blue', icon: <FunctionOutlined /> },
		{ label: 'PDF Formula Books', value: counts.uploadedPdf || 0, tone: 'gold', icon: <FilePdfOutlined /> },
		{ label: 'Manual Formulas', value: counts.manual || 0, tone: 'green', icon: <FilePdfOutlined /> }
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
				title: 'No formulas matched your search',
				description: `No formulas or calculations match "${searchTerm}". Try another term or clear your filters.`,
				action: <Button onClick={clearAllFilters}>Clear Filters</Button>
			};
		}
		if (filterVolumeId) {
			return {
				title: 'No formula resources published for this volume',
				description: 'Choose another volume or view all formula resources in this course.',
				action: <Button onClick={selectAll}>View All Formula Books</Button>
			};
		}
		return {
			title: 'No formula resources published for this course',
			description: 'Your course does not have any published formulas or formula books yet.',
			action: null
		};
	})();

	const sidebar = (
		<StudentResourceSidebar
			title="Milven Formula Book"
			icon={<FunctionOutlined />}
			allLabel="All Formula Books"
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
			hero={<LearningExplorerHero eyebrow="MILVEN FORMULA BOOK" title="Formula Explorer" description="Master essential financial formulas, calculations and investment models." variant="formula" />}
			sidebar={sidebar}
		>
			<LearningResourceHeader
				title="Formula Book"
				subtitle="Essential financial formulas and calculation methods."
				icon={<FunctionOutlined />}
				searchValue={searchText}
				onSearchChange={setSearchText}
				searchPlaceholder="Search formulas and calculations"
				viewMode={viewMode}
				onViewChange={changeView}
				isMobile={isMobile}
				onOpenFilters={() => setSidebarOpen(true)}
				extra={(
					<>
						{hasActiveFilters && <Button size="small" onClick={clearAllFilters}>Clear</Button>}
						<Button size="small" icon={<PrinterOutlined />} onClick={() => window.print()}>Print</Button>
					</>
				)}
			/>

			<LearningResourceStats items={statistics} />

			{loading ? (
				<LearningResourceSkeleton viewMode={viewMode} />
			) : error ? (
				<Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => setReloadKey(key => key + 1)}>Retry</Button>} />
			) : resources.length === 0 ? (
				<LearningResourceEmptyState {...emptyState} />
			) : viewMode === 'table' ? (
				<div className="learning-resource-table">
					<Table
						dataSource={resources}
						columns={columns}
						rowKey={resource => resource.resourceKey || resource.id}
						tableLayout="fixed"
						pagination={{ current: page, pageSize, total, showSizeChanger: false, onChange: setPage, showTotal: count => `${count} resources` }}
					/>
				</div>
			) : (
				<>
					<div className="learning-resource-grid">
						{resources.map(resource => (
							<LearningResourceCard
								key={resource.resourceKey || resource.id}
								resource={resource}
								variant="formula-book"
								onView={() => openResource(resource)}
							/>
						))}
					</div>
					{total > pageSize && (
						<div className="learning-pagination">
							<Pagination current={page} pageSize={pageSize} total={total} onChange={setPage} showTotal={count => `${count} resources`} />
						</div>
					)}
				</>
			)}

			<Modal open={Boolean(previewFormula)} onCancel={() => setPreviewFormula(null)} footer={null} width={isMobile ? '95%' : 900} centered title={null} styles={{ body: { padding: 0 } }}>
				{previewFormula && <ListPreviewCard formula={previewFormula} />}
			</Modal>
		</LearningExplorerLayout>
	);
}
