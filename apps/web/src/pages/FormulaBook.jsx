import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Typography, Select, Input, Tag, Space, Spin, Empty, Button, Tooltip, Collapse, Anchor, Grid, Tabs, Switch, Divider, Modal } from 'antd';
import { BookOutlined, SearchOutlined, StarFilled, PrinterOutlined, FilterOutlined, UnorderedListOutlined, AppstoreOutlined, DownloadOutlined, EyeOutlined } from '@ant-design/icons';
import { api } from '../lib/api';
import { formatFormulaHtml } from '../lib/formatFormula';

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };
const LEVEL_COLORS = { LEVEL1: '#3b82f6', LEVEL2: '#8b5cf6', LEVEL3: '#f59e0b' };

export function FormulaBook() {
	const screens = Grid.useBreakpoint();
	const isMobile = !screens.md;
	const bookRef = useRef(null);

	const [loading, setLoading] = useState(false);
	const [formulas, setFormulas] = useState([]);
	const [total, setTotal] = useState(0);
	const [courses, setCourses] = useState([]);
	const [volumes, setVolumes] = useState([]);
	const [modules, setModules] = useState([]);
	const [topics, setTopics] = useState([]);

	// Filters
	const [courseId, setCourseId] = useState(null);
	const [volumeId, setVolumeId] = useState(null);
	const [moduleId, setModuleId] = useState(null);
	const [topicId, setTopicId] = useState(null);
	const [search, setSearch] = useState('');
	const [highYieldOnly, setHighYieldOnly] = useState(false);
	const [viewMode, setViewMode] = useState('book'); // 'book' | 'list'

	// Load courses + lookup data
	useEffect(() => {
		api.get('/api/formulas/book/stats').catch(() => {});
		api.get('/api/learning/me/courses').then(r => {
			const enrollments = r.data?.courses || [];
			setCourses(enrollments.map(e => ({ id: e.courseId, name: e.name, level: e.level })).filter(e => e.id));
		}).catch(() => {});
		api.get('/api/learning/volumes/public').then(r => setVolumes(r.data?.volumes || [])).catch(() => {});
		api.get('/api/learning/modules/public').then(r => setModules(r.data?.modules || [])).catch(() => {});
		api.get('/api/learning/topics/public').then(r => setTopics(r.data?.topics || [])).catch(() => {});
	}, []);

	// Load formulas
	useEffect(() => {
		setLoading(true);
		const params = { limit: 200 };
		if (courseId) params.courseId = courseId;
		if (volumeId) params.volumeId = volumeId;
		if (moduleId) params.moduleId = moduleId;
		if (topicId) params.topicId = topicId;
		if (search) params.search = search;
		if (highYieldOnly) params.highYield = 'true';
		api.get('/api/formulas', { params })
			.then(r => {
				setFormulas(r.data?.formulas || []);
				setTotal(r.data?.total || 0);
			})
			.catch(() => setFormulas([]))
			.finally(() => setLoading(false));
	}, [courseId, volumeId, moduleId, topicId, search, highYieldOnly]);

	// Cascading filter options
	const filteredVolumes = useMemo(() => {
		if (!courseId) return volumes;
		return volumes.filter(v => v.courseLinks?.some(cl => cl.courseId === courseId));
	}, [courseId, volumes]);

	const filteredModules = useMemo(() => {
		let list = modules;
		if (courseId) list = list.filter(m => m.courseId === courseId);
		if (volumeId) list = list.filter(m => m.volumeId === volumeId);
		return list;
	}, [courseId, volumeId, modules]);

	const filteredTopics = useMemo(() => {
		let list = topics;
		if (courseId) list = list.filter(t => t.courseId === courseId);
		if (moduleId) list = list.filter(t => t.moduleId === moduleId);
		return list;
	}, [courseId, moduleId, topics]);

	// Group formulas by volume → module → topic
	const grouped = useMemo(() => {
		const map = {};
		for (const f of formulas) {
			const vKey = f.volumeId || '_none';
			const vName = f.volume?.name || 'General';
			const mKey = f.moduleId || '_none';
			const mName = f.module?.name || 'General';
			const tKey = f.topicId || '_none';
			const tName = f.topic?.name || 'General';

			if (!map[vKey]) map[vKey] = { id: vKey, name: vName, modules: {} };
			if (!map[vKey].modules[mKey]) map[vKey].modules[mKey] = { id: mKey, name: mName, topics: {} };
			if (!map[vKey].modules[mKey].topics[tKey]) map[vKey].modules[mKey].topics[tKey] = { id: tKey, name: tName, formulas: [] };
			map[vKey].modules[mKey].topics[tKey].formulas.push(f);
		}
		return Object.values(map).map(v => ({
			...v,
			modules: Object.values(v.modules).map(m => ({
				...m,
				topics: Object.values(m.topics),
			})),
		}));
	}, [formulas]);

	const handlePrint = () => {
		window.print();
	};

	const highYieldFormulas = useMemo(() => formulas.filter(f => f.highYield), [formulas]);

	return (
		<div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? 8 : 0 }}>
			{/* ── Cover / Header ───────────────────────────── */}
			<div style={{
				background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 60%, #274a74 100%)',
				borderRadius: 20, padding: isMobile ? '28px 20px' : '40px 48px',
				marginBottom: 28, position: 'relative', overflow: 'hidden',
			}}>
				<div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />
				<div style={{ position: 'absolute', bottom: -20, left: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.02)' }} />
				<div style={{ position: 'relative', zIndex: 1 }}>
					<Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 2, fontWeight: 600 }}>
						Milven Finance School
					</Typography.Text>
					<Typography.Title level={isMobile ? 3 : 2} style={{ color: '#fff', margin: '8px 0 4px', fontWeight: 700 }}>
						CFA Formula Book
					</Typography.Title>
					<Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15 }}>
						Simplified. Exam-focused. Built to help you pass.
					</Typography.Text>
					<div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
						<div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
							<strong style={{ color: '#fff' }}>{total}</strong> formulas
						</div>
						<div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
							<StarFilled style={{ color: '#f59e0b', marginRight: 4 }} />
							<strong style={{ color: '#fff' }}>{highYieldFormulas.length}</strong> high-yield
						</div>
						<div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
							<strong style={{ color: '#fff' }}>{grouped.length}</strong> volumes
						</div>
					</div>
				</div>
			</div>

			{/* ── Toolbar ──────────────────────────────────── */}
			<div style={{
				display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20,
				alignItems: 'center', justifyContent: 'space-between',
			}}>
				<Space wrap size={8}>
					<Input
						prefix={<SearchOutlined />}
						placeholder="Search formulas…"
						value={search}
						onChange={e => setSearch(e.target.value)}
						allowClear
						style={{ width: 200 }}
					/>
					<Select
						placeholder="Course"
						value={courseId}
						onChange={v => { setCourseId(v); setVolumeId(null); setModuleId(null); setTopicId(null); }}
						options={[{ value: null, label: 'All Courses' }, ...courses.map(c => ({ value: c.id, label: c.name }))]}
						style={{ width: 170 }}
						allowClear
						showSearch
						optionFilterProp="label"
					/>
					<Select
						placeholder="Volume"
						value={volumeId}
						onChange={v => { setVolumeId(v); setModuleId(null); setTopicId(null); }}
						options={[{ value: null, label: 'All Volumes' }, ...filteredVolumes.map(v => ({ value: v.id, label: v.name }))]}
						style={{ width: 160 }}
						allowClear
						showSearch
						optionFilterProp="label"
					/>
					<Select
						placeholder="Learning Module"
						value={moduleId}
						onChange={v => { setModuleId(v); setTopicId(null); }}
						options={[{ value: null, label: 'All Modules' }, ...filteredModules.map(m => ({ value: m.id, label: m.name }))]}
						style={{ width: 180 }}
						allowClear
						showSearch
						optionFilterProp="label"
					/>
					<Select
						placeholder="Topic"
						value={topicId}
						onChange={setTopicId}
						options={[{ value: null, label: 'All Topics' }, ...filteredTopics.map(t => ({ value: t.id, label: t.name }))]}
						style={{ width: 170 }}
						allowClear
						showSearch
						optionFilterProp="label"
					/>
					<Button
						type={highYieldOnly ? 'primary' : 'default'}
						icon={<StarFilled />}
						onClick={() => setHighYieldOnly(!highYieldOnly)}
						style={highYieldOnly ? { background: '#f59e0b', borderColor: '#f59e0b' } : {}}
					>
						High-Yield
					</Button>
				</Space>
				<Space>
					<Tooltip title="Print / Export PDF">
						<Button icon={<PrinterOutlined />} onClick={handlePrint}>Print</Button>
					</Tooltip>
					<Button.Group>
						<Tooltip title="Book View">
							<Button type={viewMode === 'book' ? 'primary' : 'default'} icon={<AppstoreOutlined />} onClick={() => setViewMode('book')}
								style={viewMode === 'book' ? { background: '#102540', borderColor: '#102540' } : {}} />
						</Tooltip>
						<Tooltip title="List View">
							<Button type={viewMode === 'list' ? 'primary' : 'default'} icon={<UnorderedListOutlined />} onClick={() => setViewMode('list')}
								style={viewMode === 'list' ? { background: '#102540', borderColor: '#102540' } : {}} />
						</Tooltip>
					</Button.Group>
				</Space>
			</div>

			{/* ── Content ──────────────────────────────────── */}
			{loading ? (
				<div style={{ textAlign: 'center', padding: 80 }}>
					<Spin size="large" />
					<div style={{ marginTop: 16, color: '#64748b' }}>Loading formula book…</div>
				</div>
			) : formulas.length === 0 ? (
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={
						<span style={{ color: '#64748b' }}>
							No formulas found.{search ? ` Search: "${search}"` : ''}
						</span>
					}
				/>
			) : viewMode === 'list' ? (
				<div id="formula-book-print">
					<FormulaListView formulas={formulas} />
				</div>
			) : (
				<div ref={bookRef} id="formula-book-print">
					{grouped.map((vol, vi) => (
						<VolumeSection key={vol.id} volume={vol} volumeIndex={vi} isMobile={isMobile} />
					))}

					{/* ── High-Yield Recap ──────────────── */}
					{highYieldFormulas.length > 0 && (
						<div style={{ marginTop: 32 }}>
							<div style={{
								background: 'linear-gradient(135deg, #fef3c7, #fff7ed)',
								borderRadius: 16, padding: '24px 28px',
								border: '1px solid #fde68a',
							}}>
								<Typography.Title level={4} style={{ margin: '0 0 16px', color: '#92400e' }}>
									<StarFilled style={{ color: '#f59e0b', marginRight: 8 }} />
									High-Yield Formula Recap
								</Typography.Title>
								<div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
									{highYieldFormulas.map(f => (
										<div key={f.id} style={{
											background: '#fff', borderRadius: 10, padding: '12px 16px',
											border: '1px solid #fde68a', display: 'flex', flexDirection: 'column', gap: 4,
										}}>
											<div style={{ fontWeight: 600, color: '#102540', fontSize: 13 }}>{f.name}</div>
											<div style={{
												fontFamily: "'Cambria Math', Georgia, serif",
												fontSize: 14, color: '#1e3a5f',
											}}>
												<span dangerouslySetInnerHTML={{ __html: formatFormulaHtml(f.formula) }} />
											</div>
											<div style={{ fontSize: 11, color: '#64748b' }}>{f.whenToUse}</div>
										</div>
									))}
								</div>
							</div>
						</div>
					)}

					{/* ── Footer ───────────────────────── */}
					<div style={{
						marginTop: 36, textAlign: 'center', padding: '20px 0',
						borderTop: '1px solid #e2e8f0',
					}}>
						<Typography.Text style={{ color: '#94a3b8', fontSize: 12 }}>
							Milven Finance School | CFA Formula Book {new Date().getFullYear()}
						</Typography.Text>
						<br />
						<Typography.Text style={{ color: '#cbd5e1', fontSize: 11 }}>
							Precise. Calm. Premium. Exam-focused.
						</Typography.Text>
					</div>
				</div>
			)}

			{/* Print styles */}
			<style>{`
				@media print {
					/* Hide everything outside the formula content */
					body * { visibility: hidden !important; }
					#formula-book-print,
					#formula-book-print * { visibility: visible !important; }
					#formula-book-print {
						position: absolute !important;
						left: 0 !important;
						top: 0 !important;
						width: 100% !important;
						padding: 20px 20px 60px 20px !important;
					}
					/* Hide interactive controls */
					.ant-layout-header,
					.ant-layout-sider,
					.ant-layout-footer,
					.ant-btn,
					.ant-select,
					.ant-input-affix-wrapper,
					.ant-drawer,
					.ant-modal-root { display: none !important; }
					/* Page-break helpers */
					.formula-card-hover { break-inside: avoid; page-break-inside: avoid; }
					/* Force backgrounds to print */
					#formula-book-print * {
						-webkit-print-color-adjust: exact !important;
						print-color-adjust: exact !important;
						color-adjust: exact !important;
					}
					/* Fixed footer on every printed page */
					.print-page-footer {
						visibility: visible !important;
						position: fixed !important;
						bottom: 0 !important;
						left: 0 !important;
						right: 0 !important;
						text-align: center !important;
						padding: 8px 0 !important;
						border-top: 1px solid #cbd5e1 !important;
						background: #fff !important;
						font-size: 10px !important;
						color: #64748b !important;
						z-index: 99999 !important;
					}
					.print-page-footer * { visibility: visible !important; }
					/* Hide footer on screen */
				}
				.print-page-footer { display: none; }
				@media print { .print-page-footer { display: block; } }
			`}</style>

			{/* Fixed footer on every printed page */}
			<div className="print-page-footer">
				<div>Milven Finance School | CFA Formula Book {new Date().getFullYear()}</div>
				<div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>Precise. Calm. Premium. Exam-focused.</div>
			</div>
		</div>
	);
}

// ─── Volume Section ─────────────────────────────────────────
function VolumeSection({ volume, volumeIndex, isMobile }) {
	return (
		<div style={{ marginBottom: 32 }}>
			{/* Volume Divider */}
			<div style={{
				background: 'linear-gradient(135deg, #102540, #1b3a5b)',
				borderRadius: 14, padding: isMobile ? '14px 18px' : '16px 24px',
				marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
			}}>
				<div>
					<Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5 }}>
						CFA Formula Book
					</Typography.Text>
					<Typography.Title level={4} style={{ color: '#fff', margin: '2px 0 0' }}>
						{volume.name}
					</Typography.Title>
				</div>
				<Tag style={{
					background: 'rgba(255,255,255,0.1)', border: 'none',
					color: 'rgba(255,255,255,0.8)', fontWeight: 600,
				}}>
					Formula Book {new Date().getFullYear()}
				</Tag>
			</div>

			{volume.modules.map((mod, mi) => (
				<div key={mod.id} style={{ marginBottom: 24 }}>
					{/* Module header */}
					<div style={{
						padding: '10px 18px', marginBottom: 12,
						background: '#f8fafc', borderRadius: 10,
						borderLeft: `3px solid ${LEVEL_COLORS[mod.topics?.[0]?.formulas?.[0]?.level] || '#3b82f6'}`,
					}}>
						<Typography.Text strong style={{ color: '#102540', fontSize: 14 }}>
							Learning Module: {mod.name}
						</Typography.Text>
					</div>

					{mod.topics.map((topic) => (
						<div key={topic.id} style={{ marginBottom: 20, paddingLeft: 12 }}>
							{/* Topic label */}
							<Typography.Text style={{ color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 8, display: 'block' }}>
								Topic: {topic.name}
							</Typography.Text>

							{/* Formula cards grid */}
							<div style={{
								display: 'grid',
								gridTemplateColumns: isMobile ? '1fr' : topic.formulas.length === 1 ? '1fr' : '1fr 1fr',
								gap: 14,
							}}>
								{topic.formulas.map(f => (
									<FormulaCard key={f.id} formula={f} />
								))}
							</div>
						</div>
					))}
				</div>
			))}
		</div>
	);
}

// ─── Formula Card (Book View) ───────────────────────────────
function FormulaCard({ formula }) {
	const level = formula.level;
	return (
		<div style={{
			background: '#fff', borderRadius: 14, overflow: 'hidden',
			border: '1px solid #e2e8f0',
			boxShadow: '0 1px 4px rgba(16,37,64,0.06)',
			transition: 'box-shadow 0.2s, transform 0.2s',
		}}
			className="formula-card-hover"
		>
			{/* Card header */}
			<div style={{
				padding: '12px 16px',
				background: `linear-gradient(135deg, ${(LEVEL_COLORS[level] || '#3b82f6')}15, ${(LEVEL_COLORS[level] || '#3b82f6')}08)`,
				borderBottom: '1px solid #e2e8f0',
				display: 'flex', justifyContent: 'space-between', alignItems: 'center',
			}}>
				<Space size={6}>
					{formula.highYield && <StarFilled style={{ color: '#f59e0b', fontSize: 12 }} />}
					<Typography.Text strong style={{ color: '#102540', fontSize: 13 }}>
						{formula.name}
					</Typography.Text>
				</Space>
			</div>

			{/* Formula display */}
			<div style={{
				padding: '14px 16px', background: '#f8fafc',
				borderBottom: '1px solid #f1f5f9',
			}}>
				<div style={{
					fontFamily: "'Cambria Math', 'Latin Modern Math', Georgia, serif",
					fontSize: 16, fontWeight: 600, color: '#102540',
					lineHeight: 1.5, whiteSpace: 'pre-wrap',
				}}>
					<span dangerouslySetInnerHTML={{ __html: formatFormulaHtml(formula.formula) }} />
				</div>
			</div>

			{/* Fields */}
			<div style={{ padding: '12px 16px', fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
				<div style={{ marginBottom: 8 }}>
					<span style={{ fontWeight: 600, color: '#102540', textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Variables: </span>
					<span dangerouslySetInnerHTML={{ __html: formatFormulaHtml(formula.variables) }} />
				</div>
				<div style={{
					marginBottom: 8, padding: '6px 10px',
					background: '#f0f7ff', borderRadius: 6,
					borderLeft: '2px solid #3b82f6',
				}}>
					<span style={{ fontWeight: 600, color: '#102540', textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Interpretation: </span>
					{formula.interpretation}
				</div>
				<div style={{ marginBottom: 8 }}>
					<Tag color="blue" style={{ fontSize: 10, lineHeight: '18px' }}>WHEN TO USE</Tag>
					<span style={{ marginLeft: 4 }}>{formula.whenToUse}</span>
				</div>
				<div style={{
					padding: '6px 10px', background: '#fef3c7',
					borderRadius: 6, borderLeft: '2px solid #f59e0b',
				}}>
					<span style={{ fontWeight: 600, color: '#92400e', textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Watch-Out: </span>
					<span style={{ color: '#92400e' }}>{formula.watchOut}</span>
				</div>
				{formula.calculatorCue && (
					<div style={{
						marginTop: 8, padding: '6px 10px', background: '#f0fdf4',
						borderRadius: 6, borderLeft: '2px solid #22c55e',
					}}>
						<span style={{ fontWeight: 600, color: '#166534', textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>Calculator: </span>
						<span style={{ color: '#166534' }}>{formula.calculatorCue}</span>
					</div>
				)}
			</div>

			{/* LOS footer */}
			{formula.losTag && (
				<div style={{
					padding: '6px 16px 10px', borderTop: '1px solid #f1f5f9',
				}}>
					<Typography.Text style={{ fontSize: 10, color: '#94a3b8' }}>
						LOS: {formula.losTag}
					</Typography.Text>
				</div>
			)}

			{/* Hover style */}
			<style>{`
				.formula-card-hover:hover {
					box-shadow: 0 4px 16px rgba(16,37,64,0.12) !important;
					transform: translateY(-1px);
				}
			`}</style>
		</div>
	);
}

// ─── List View ──────────────────────────────────────────────
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
					<div style={{ color: '#374151', fontSize: 13, marginTop: 4, lineHeight: 1.6, whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: formatFormulaHtml(formula.variables) }} />
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
						<div style={{ color: '#166534', fontSize: 13, marginTop: 2 }}>{formula.calculatorCue}</div>
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
