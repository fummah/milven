import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Typography, Select, Input, Tag, Space, Spin, Empty, Button, Tooltip, Collapse, Anchor, Grid, Switch, Divider, Modal, Card, Row, Col, Table, Pagination } from 'antd';
import { BookOutlined, SearchOutlined, StarFilled, PrinterOutlined, FilterOutlined, UnorderedListOutlined, AppstoreOutlined, DownloadOutlined, EyeOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatFormulaHtml, formatVariablesHtml, formatProseWithMath } from '../lib/formatFormula';
import FormulaResourceCard from '../components/resources/FormulaResourceCard';
import { PdfThumbnail, ResourceSourceTag, ResourceTypeTag } from '../components/resources/ResourceVisuals';

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };
const LEVEL_COLORS = { LEVEL1: '#3b82f6', LEVEL2: '#8b5cf6', LEVEL3: '#f59e0b' };

export function FormulaBook() {
	const navigate = useNavigate();
	const screens = Grid.useBreakpoint();
	const isMobile = !screens.md;

	const [loading, setLoading] = useState(false);
	const [formulas, setFormulas] = useState([]);
	const [pdfResources, setPdfResources] = useState([]);
	const [resourceRows, setResourceRows] = useState([]);
	const [total, setTotal] = useState(0);
	const [counts, setCounts] = useState({ ai: 0, manual: 0, uploadedPdf: 0 });
	const [page, setPage] = useState(1);
	const pageSize = 24;
	const [searchTerm, setSearchTerm] = useState('');
	const [courses, setCourses] = useState([]);
	const [volumes, setVolumes] = useState([]);
	const [modules, setModules] = useState([]);
	const [topics, setTopics] = useState([]);
	const [courseId, setCourseId] = useState(null);
	const [volumeId, setVolumeId] = useState(null);
	const [moduleId, setModuleId] = useState(null);
	const [topicId, setTopicId] = useState(null);
	const [search, setSearch] = useState('');
	const [highYieldOnly, setHighYieldOnly] = useState(false);
	const [filterSource, setFilterSource] = useState(null);
	const [refreshTick, setRefreshTick] = useState(0);
	const [viewMode, setViewMode] = useState(() => localStorage.getItem('milven.student-formula.view') || 'table');
	const [previewFormula, setPreviewFormula] = useState(null);

	useEffect(() => {
		api.get('/api/learning/me/courses').then(r => {
			const enrollments = r.data?.courses || [];
			setCourses(enrollments.map(e => ({ id: e.courseId, name: e.name, level: e.level })).filter(e => e.id));
		}).catch(() => {});
		api.get('/api/learning/volumes/public').then(r => setVolumes(r.data?.volumes || [])).catch(() => {});
		api.get('/api/learning/modules/public').then(r => setModules(r.data?.modules || [])).catch(() => {});
		api.get('/api/learning/topics/public').then(r => setTopics(r.data?.topics || [])).catch(() => {});
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => { setSearchTerm(search.trim()); setPage(1); }, 300);
		return () => clearTimeout(timer);
	}, [search]);

	useEffect(() => {
		setLoading(true);
		const params = { page, limit: pageSize };
		if (courseId) params.courseId = courseId;
		if (volumeId) params.volumeId = volumeId;
		if (moduleId) params.moduleId = moduleId;
		if (topicId) params.topicId = topicId;
		if (searchTerm) params.search = searchTerm;
		if (highYieldOnly) params.highYield = 'true';
		if (filterSource) params.source = filterSource;
		api.get('/api/formulas/unified', { params })
			.then(r => {
				const resources = r.data?.resources || [];
				setResourceRows(resources);
				setFormulas(resources.filter(item => item.type === 'FORMULA'));
				setPdfResources(resources.filter(item => item.type === 'PDF'));
				setTotal(r.data?.total || 0);
				setCounts(r.data?.counts || { ai: 0, manual: 0, uploadedPdf: 0 });
			})
			.catch(() => { setResourceRows([]); setFormulas([]); setPdfResources([]); })
			.finally(() => setLoading(false));
	}, [courseId, volumeId, moduleId, topicId, searchTerm, highYieldOnly, filterSource, refreshTick, page]);

	useEffect(() => {
		const processing = pdfResources.some(item => ['UPLOADED', 'INDEXING'].includes(item.processingStatus));
		if (!processing) return undefined;
		const timer = setTimeout(() => setRefreshTick(value => value + 1), 6000);
		return () => clearTimeout(timer);
	}, [pdfResources]);

	const accessibleCourseIds = useMemo(() => new Set(courses.map(course => course.id)), [courses]);
	const filteredVolumes = useMemo(() => (courseId ? volumes.filter(v => v.courseLinks?.some(cl => cl.courseId === courseId)) : volumes.filter(v => v.courseLinks?.some(cl => accessibleCourseIds.has(cl.courseId)))), [courseId, volumes, accessibleCourseIds]);
	const filteredModules = useMemo(() => modules.filter(m => (courseId ? m.courseId === courseId : accessibleCourseIds.has(m.courseId)) && (!volumeId || m.volumeId === volumeId)), [modules, courseId, volumeId, accessibleCourseIds]);
	const filteredTopics = useMemo(() => topics.filter(t => (courseId ? t.courseId === courseId : accessibleCourseIds.has(t.courseId)) && (!moduleId || t.moduleId === moduleId)), [topics, courseId, moduleId, accessibleCourseIds]);
	const highYieldCount = useMemo(() => formulas.filter(f => f.highYield).length, [formulas]);
	const resources = resourceRows;

	const changeView = mode => {
		setViewMode(mode);
		try { localStorage.setItem('milven.student-formula.view', mode); } catch {}
	};

	const openResource = resource => {
		if (resource.type === 'PDF') navigate(`/learning/formula-books/${resource.resourceId || resource.id}${resource.matchPage ? `?page=${resource.matchPage}` : ''}`);
		else setPreviewFormula(resource);
	};

	const columns = [
		{ title: 'Resource', key: 'resource', width: 340, render: (_, resource) => (
			<Space align="start">
				{resource.type === 'PDF' ? <button type="button" onClick={() => openResource(resource)} aria-label={`View ${resource.title}`} style={{ width: 76, height: 44, overflow: 'hidden', borderRadius: 4, flexShrink: 0, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}><PdfThumbnail url={resource.thumbnailUrl} title={resource.title} height={44} /></button> : <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><BookOutlined style={{ color: '#2563eb', fontSize: 20 }} /></div>}
				<div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, color: '#102540' }}>{resource.title}</div>{resource.type === 'PDF' && resource.originalFilename && <Typography.Text type="secondary" style={{ fontSize: 11 }} ellipsis>{resource.originalFilename}</Typography.Text>}</div>
			</Space>
		) },
		{ title: 'Type', key: 'type', width: 190, render: (_, resource) => <Space size={4} wrap><ResourceTypeTag type={resource.type === 'PDF' ? 'PDF' : 'FORMULA'} /><ResourceSourceTag type={resource.type === 'PDF' ? 'PDF' : 'FORMULA'} source={resource.source} /></Space> },
		{ title: 'Level', key: 'level', width: 95, render: (_, resource) => <Tag color={resource.level === 'LEVEL1' ? 'blue' : resource.level === 'LEVEL2' ? 'purple' : 'gold'}>{LEVEL_LABELS[resource.level] || resource.level}</Tag> },
		{ title: 'Volume', key: 'volume', width: 150, render: (_, resource) => resource.volume?.name || <Typography.Text type="secondary">-</Typography.Text> },
		{ title: 'Learning Module', key: 'module', width: 190, render: (_, resource) => resource.type === 'PDF' ? <Tag>Whole Volume</Tag> : resource.module?.name || <Typography.Text type="secondary">-</Typography.Text> },
		{ title: 'Status', key: 'status', width: 100, render: (_, resource) => <Tag color={resource.status === 'PUBLISHED' ? 'green' : 'default'}>{resource.status === 'PUBLISHED' ? 'Published' : 'Draft'}</Tag> },
		{ title: 'Actions', key: 'actions', width: 150, fixed: 'right', render: (_, resource) => <Space size={2}><Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openResource(resource)}>{resource.type === 'PDF' ? 'View PDF' : 'View Formula'}</Button>{resource.type === 'FORMULA' && resource.highYield && <StarFilled style={{ color: '#f59e0b' }} />}</Space> }
	];

	return (
		<div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 8 : 0 }}>
			<div style={{ background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 60%, #274a74 100%)', borderRadius: 20, padding: isMobile ? '28px 20px' : '34px 42px', marginBottom: 20 }}>
				<Typography.Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 2, fontWeight: 600 }}>Milven Finance School</Typography.Text>
				<Typography.Title level={isMobile ? 3 : 2} style={{ color: '#fff', margin: '8px 0 4px' }}>CFA Formula Book</Typography.Title>
				<Typography.Text style={{ color: 'rgba(255,255,255,0.75)' }}>Formula cards and Volume-level PDF formula books.</Typography.Text>
			</div>
			<Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
				{[{ label: 'Available resources', value: total }, { label: 'Formula cards', value: (counts.ai || 0) + (counts.manual || 0) }, { label: 'PDF formula books', value: counts.uploadedPdf || 0 }, { label: 'Manual formulas', value: counts.manual || 0 }].map(item => (
					<Col xs={12} sm={12} lg={6} key={item.label}><Card size="small" style={{ borderRadius: 12, border: '1px solid #e2e8f0' }} styles={{ body: { padding: '12px 14px' } }}><Typography.Text type="secondary" style={{ fontSize: 11 }}>{item.label}</Typography.Text><div style={{ fontSize: 24, fontWeight: 700, color: '#102540', fontVariantNumeric: 'tabular-nums' }}>{Number(item.value || 0).toLocaleString('en-US')}</div></Card></Col>
				))}
			</Row>
			<Card size="small" style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #e2e8f0' }} styles={{ body: { padding: 12 } }}>
				<Row gutter={[10, 10]} align="middle">
					<Col xs={24} lg={17}><Space wrap size={8}>
						<Input prefix={<SearchOutlined />} placeholder="Search formulas and PDFs..." value={search} onChange={e => setSearch(e.target.value)} allowClear style={{ width: 210 }} />
						<Select placeholder="Course" value={courseId} onChange={v => { setCourseId(v); setVolumeId(null); setModuleId(null); setTopicId(null); setPage(1); }} options={[{ value: null, label: 'All My Courses' }, ...courses.map(c => ({ value: c.id, label: c.name }))]} style={{ width: 160 }} allowClear showSearch optionFilterProp="label" />
						<Select placeholder="Volume" value={volumeId} onChange={v => { setVolumeId(v); setModuleId(null); setTopicId(null); setPage(1); }} options={[{ value: null, label: 'All Volumes' }, ...filteredVolumes.map(v => ({ value: v.id, label: v.name }))]} style={{ width: 150 }} allowClear showSearch optionFilterProp="label" />
						<Select placeholder="Learning Module" value={moduleId} onChange={v => { setModuleId(v); setTopicId(null); setPage(1); }} options={[{ value: null, label: 'All Modules' }, ...filteredModules.map(m => ({ value: m.id, label: m.name }))]} style={{ width: 180 }} allowClear showSearch optionFilterProp="label" />
						<Select placeholder="Topic" value={topicId} onChange={v => { setTopicId(v); setPage(1); }} options={[{ value: null, label: 'All Topics' }, ...filteredTopics.map(t => ({ value: t.id, label: t.name }))]} style={{ width: 165 }} allowClear showSearch optionFilterProp="label" />
						<Select placeholder="Source" value={filterSource} onChange={v => { setFilterSource(v); setPage(1); }} options={[{ value: null, label: 'All Sources' }, { value: 'AI', label: 'AI Generated' }, { value: 'MANUAL', label: 'Manual' }, { value: 'UPLOADED_PDF', label: 'Uploaded PDF' }]} style={{ width: 155 }} allowClear />
						<Button type={highYieldOnly ? 'primary' : 'default'} icon={<StarFilled />} onClick={() => { setHighYieldOnly(!highYieldOnly); setPage(1); }} style={highYieldOnly ? { background: '#f59e0b', borderColor: '#f59e0b' } : {}}>High-Yield</Button>
					</Space></Col>
					<Col xs={24} lg={7} style={{ textAlign: 'right' }}><Space wrap><Button icon={<PrinterOutlined />} onClick={() => window.print()}>Print</Button><Button.Group><Button type={viewMode === 'cards' ? 'primary' : 'default'} icon={<AppstoreOutlined />} onClick={() => changeView('cards')} aria-label="Card view" /><Button type={viewMode === 'table' ? 'primary' : 'default'} icon={<UnorderedListOutlined />} onClick={() => changeView('table')} aria-label="Table view" /></Button.Group></Space></Col>
				</Row>
			</Card>
			{loading ? <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div> : resources.length === 0 ? <Card style={{ borderRadius: 12, textAlign: 'center', padding: 30 }}><Empty description={courses.length === 0 ? "You don't currently have access to any learning courses." : 'No formula resources are available for your enrolled course yet.'}>{courses.length === 0 && <Button type="primary" onClick={() => navigate('/courses')}>Browse Courses</Button>}</Empty></Card> : viewMode === 'table' ? (
				<Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }} styles={{ body: { padding: 0 } }}><Table dataSource={resources} columns={columns} rowKey={resource => resource.resourceKey || resource.id} scroll={{ x: 1250 }} pagination={{ current: page, pageSize, total, showSizeChanger: false, onChange: setPage, showTotal: count => `${count} resources` }} /></Card>
			) : (
				<div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16 }}>
					{resources.map(resource => <FormulaResourceCard key={resource.resourceKey || resource.id} resource={resource} onOpenPdf={() => openResource(resource)} onPreview={() => openResource(resource)} />)}
				</div>
			)}
			{viewMode === 'cards' && total > pageSize && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}><Pagination current={page} pageSize={pageSize} total={total} onChange={setPage} showTotal={count => `${count} resources`} /></div>}
			<Modal open={Boolean(previewFormula)} onCancel={() => setPreviewFormula(null)} footer={null} width={900} centered title={null} styles={{ body: { padding: 0 } }}>{previewFormula && <FormulaCard formula={previewFormula} />}</Modal>
		</div>
	);
}
function FormulaListView({ formulas }) {
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewFormula, setPreviewFormula] = useState(null);

	const openPreview = (f) => { setPreviewFormula(f); setPreviewOpen(true); };

	return (
		<>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
				{/* Header row */}
				<div style={{
					display: 'grid', gridTemplateColumns: '2fr 2.5fr 1fr 1fr 1fr 60px',
					gap: 12, padding: '10px 16px', background: '#f8fafc',
					borderRadius: 10, fontWeight: 600, color: '#102540', fontSize: 12,
					textTransform: 'uppercase', letterSpacing: 0.5,
				}}>
					<div>Name</div>
					<div>Formula</div>
					<div>Volume</div>
					<div>Module</div>
					<div>Tags</div>
					<div style={{ textAlign: 'center' }}>View</div>
				</div>
				{formulas.map(f => (
					<div key={f.id} style={{
						display: 'grid', gridTemplateColumns: '2fr 2.5fr 1fr 1fr 1fr 60px',
						gap: 12, padding: '10px 16px', background: '#fff',
						borderRadius: 10, border: '1px solid #e2e8f0',
						alignItems: 'center', fontSize: 13,
					}}>
						<div>
							<Space size={4}>
								{f.highYield && <StarFilled style={{ color: '#f59e0b', fontSize: 11 }} />}
								<span style={{ fontWeight: 600, color: '#102540' }}>{f.name}</span>
							</Space>
						</div>
						<div style={{ fontFamily: "'Cambria Math', Georgia, serif", color: '#1e3a5f' }}>
							<span dangerouslySetInnerHTML={{ __html: formatFormulaHtml(f.formula?.length > 50 ? f.formula.slice(0, 50) + '…' : f.formula) }} />
						</div>
						<div style={{ color: '#64748b', fontSize: 12 }}>{f.volume?.name || '—'}</div>
						<div style={{ color: '#64748b', fontSize: 12 }}>{f.module?.name || '—'}</div>
						<div>
							<Tag color={LEVEL_COLORS[f.level] === '#3b82f6' ? 'blue' : LEVEL_COLORS[f.level] === '#8b5cf6' ? 'purple' : 'gold'} style={{ fontSize: 10 }}>
								{LEVEL_LABELS[f.level]}
							</Tag>
							{f.highYield && <Tag color="orange" style={{ fontSize: 10 }}>HY</Tag>}
						</div>
						<div style={{ textAlign: 'center' }}>
							<Tooltip title="View Formula">
								<Button size="small" type="primary" ghost icon={<EyeOutlined />} onClick={() => openPreview(f)}
									style={{ borderColor: '#102540', color: '#102540' }} />
							</Tooltip>
						</div>
					</div>
				))}
			</div>

			{/* Preview Modal */}
			<Modal
				open={previewOpen}
				onCancel={() => { setPreviewOpen(false); setPreviewFormula(null); }}
				footer={null}
				width="80%"
				centered
				title={null}
				styles={{ body: { padding: 0 } }}
			>
				{previewFormula && <ListPreviewCard formula={previewFormula} />}
			</Modal>
		</>
	);
}

// ─── List View Preview Card ─────────────────────────────────
function ListPreviewCard({ formula }) {
	return (
		<div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden' }}>
			{/* Header */}
			<div style={{
				background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)',
				padding: '16px 24px',
				display: 'flex', justifyContent: 'space-between', alignItems: 'center',
			}}>
				<div>
					<Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
						{LEVEL_LABELS[formula.level]} {formula.volume?.name ? `| ${formula.volume.name}` : ''}
					</Typography.Text>
					<Typography.Title level={4} style={{ margin: 0, color: '#fff' }}>
						{formula.name}
					</Typography.Title>
				</div>
				{formula.highYield && <Tag color="gold" style={{ fontWeight: 600, fontSize: 11 }}>HIGH-YIELD</Tag>}
			</div>

			{/* Volume & Module */}
			{(formula.volume?.name || formula.module?.name) && (
				<div style={{ padding: '8px 24px', display: 'flex', gap: 20, flexWrap: 'wrap', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
					{formula.volume?.name && (
						<Typography.Text style={{ fontSize: 12, color: '#64748b' }}>
							<strong style={{ color: '#102540' }}>Volume:</strong> {formula.volume.name}
						</Typography.Text>
					)}
					{formula.module?.name && (
						<Typography.Text style={{ fontSize: 12, color: '#64748b' }}>
							<strong style={{ color: '#102540' }}>Learning Module:</strong> {formula.module.name}
						</Typography.Text>
					)}
				</div>
			)}

			{/* Body */}
			<div style={{ padding: '20px 24px' }}>
				{/* Formula */}
				<div style={{ background: '#f0f4f8', borderRadius: 10, padding: '14px 18px', marginBottom: 16, border: '1px solid #e2e8f0' }}>
					<Typography.Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>FORMULA</Typography.Text>
					<div style={{ fontFamily: "'Cambria Math', 'Latin Modern Math', Georgia, serif", fontSize: 18, fontWeight: 600, color: '#102540', marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
						<span dangerouslySetInnerHTML={{ __html: formatFormulaHtml(formula.formula) }} />
					</div>
				</div>
				{/* Variables */}
				<div style={{ marginBottom: 14 }}>
					<Typography.Text strong style={{ color: '#102540', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Variables</Typography.Text>
					<div style={{ color: '#374151', fontSize: 13, marginTop: 4, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: formatVariablesHtml(formula.variables) }} />
				</div>
				{/* Interpretation */}
				<div style={{ marginBottom: 14, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, borderLeft: '3px solid #3b82f6' }}>
					<Typography.Text strong style={{ color: '#102540', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Interpretation</Typography.Text>
					<div style={{ color: '#374151', fontSize: 13, marginTop: 2 }}>{formula.interpretation}</div>
				</div>
				{/* When to Use */}
				<div style={{ marginBottom: 14 }}>
					<Tag color="blue" style={{ fontWeight: 600, fontSize: 11 }}>WHEN TO USE</Tag>
					<div style={{ color: '#374151', fontSize: 13, marginTop: 4 }}>{formula.whenToUse}</div>
				</div>
				{/* Watch-Out */}
				<div style={{ marginBottom: 14, padding: '10px 14px', background: '#fef3c7', borderRadius: 8, borderLeft: '3px solid #f59e0b' }}>
					<Typography.Text strong style={{ color: '#92400e', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Watch-Out</Typography.Text>
					<div style={{ color: '#92400e', fontSize: 13, marginTop: 2 }}>{formula.watchOut}</div>
				</div>
				{/* Calculator Cue */}
				{formula.calculatorCue && (
					<div style={{ marginBottom: 14, padding: '10px 14px', background: '#f0fdf4', borderRadius: 8, borderLeft: '3px solid #22c55e' }}>
						<Typography.Text strong style={{ color: '#166534', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Calculator Cue</Typography.Text>
						<div style={{ color: '#166534', fontSize: 13, marginTop: 2 }} dangerouslySetInnerHTML={{ __html: formatProseWithMath(formula.calculatorCue) }} />
					</div>
				)}
				{/* Worked Example */}
				{formula.workedExample && (
					<div style={{ marginBottom: 14 }}>
						<Collapse
							size="small"
							items={[{
								key: 'worked-example',
								label: <span style={{ fontWeight: 600, color: '#102540', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Worked Example</span>,
								children: (
									<div style={{ fontSize: 13, lineHeight: 1.7 }}>
										{formula.workedExample.given && (
											<div style={{ marginBottom: 10 }}>
												<div style={{ fontWeight: 600, color: '#102540', fontSize: 11, textTransform: 'uppercase', marginBottom: 2 }}>Given</div>
												<div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: formatProseWithMath(formula.workedExample.given) }} />
											</div>
										)}
										{formula.workedExample.formula && (
											<div style={{ marginBottom: 10 }}>
												<div style={{ fontWeight: 600, color: '#102540', fontSize: 11, textTransform: 'uppercase', marginBottom: 2 }}>Formula</div>
												<div style={{ padding: '8px 12px', background: '#f0f4f8', borderRadius: 6, border: '1px solid #e2e8f0', fontFamily: "'Cambria Math', Georgia, serif", fontWeight: 600 }} dangerouslySetInnerHTML={{ __html: formatFormulaHtml(formula.workedExample.formula) }} />
											</div>
										)}
										{formula.workedExample.steps && formula.workedExample.steps.length > 0 && (
											<div style={{ marginBottom: 10 }}>
												<div style={{ fontWeight: 600, color: '#102540', fontSize: 11, textTransform: 'uppercase', marginBottom: 2 }}>Steps</div>
												<div style={{ padding: '8px 12px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
													{formula.workedExample.steps.map((step, si) => (
														<div key={si} style={{ marginBottom: 4, paddingLeft: 4 }}>
															<span style={{ fontWeight: 600, color: '#3b82f6', marginRight: 6 }}>Step {si + 1}:</span>
															<span dangerouslySetInnerHTML={{ __html: formatProseWithMath(step) }} />
														</div>
													))}
												</div>
											</div>
										)}
										{formula.workedExample.answer && (
											<div style={{ marginBottom: 10, padding: '10px 14px', background: '#ecfdf5', borderRadius: 8, borderLeft: '3px solid #10b981' }}>
												<div style={{ fontWeight: 600, color: '#065f46', fontSize: 11, textTransform: 'uppercase', marginBottom: 2 }}>Final Answer</div>
												<div style={{ fontWeight: 700, color: '#065f46', fontSize: 15 }} dangerouslySetInnerHTML={{ __html: formatFormulaHtml(formula.workedExample.answer) }} />
											</div>
										)}
										{formula.workedExample.interpretation && (
											<div style={{ padding: '8px 12px', background: '#f0f7ff', borderRadius: 6, borderLeft: '3px solid #3b82f6' }}>
												<div style={{ fontWeight: 600, color: '#1e40af', fontSize: 11, textTransform: 'uppercase', marginBottom: 2 }}>Interpretation</div>
												<div style={{ color: '#1e3a5a', fontSize: 13 }}>{formula.workedExample.interpretation}</div>
											</div>
										)}
									</div>
								),
							}]}
							style={{ background: '#fefce8', borderRadius: 8, border: '1px solid #fde68a' }}
						/>
					</div>
				)}
				{/* LOS */}
				{formula.losTag && (
					<div style={{ marginTop: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px dashed #cbd5e1' }}>
						<Typography.Text style={{ fontSize: 11, color: '#64748b' }}><strong>LOS:</strong> {formula.losTag}</Typography.Text>
					</div>
				)}
			</div>

			{/* Footer */}
			<div style={{ padding: '10px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', background: '#f8fafc' }}>
				<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>Milven Finance School | Formula Book {formula.year}</Typography.Text>
				<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>{formula.topic?.name || ''} {formula.module?.name ? `• ${formula.module.name}` : ''}</Typography.Text>
			</div>
		</div>
	);
}

export default FormulaBook;
