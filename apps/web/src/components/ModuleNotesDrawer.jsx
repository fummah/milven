import React, { useEffect, useState } from 'react';
import { Drawer, Typography, Tag, Spin, Empty, Row, Col, Space, Divider } from 'antd';
import { BookOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { api } from '../lib/api';
import { formatFormulaHtml } from '../lib/formatFormula';

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };

// ─── Safe render: stringify objects that React can't render ──
function safeRender(val) {
	if (val === null || val === undefined) return '';
	if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
	if (typeof val === 'object') {
		try { return JSON.stringify(val); } catch { return String(val); }
	}
	return String(val);
}

/**
 * A reusable drawer that fetches and displays Module Notes for a given topicId.
 * Props:
 *   - open: boolean
 *   - onClose: () => void
 *   - topicId: string | null
 *   - topicName: string | null (for display in the title)
 */
export function ModuleNotesDrawer({ open, onClose, topicId, topicName }) {
	const [loading, setLoading] = useState(false);
	const [notes, setNotes] = useState([]);
	const [activeNote, setActiveNote] = useState(null);

	useEffect(() => {
		if (!open || !topicId) return;
		setLoading(true);
		setNotes([]);
		setActiveNote(null);
		api.get('/api/module-notes', { params: { topicId, status: 'PUBLISHED', limit: 50 } })
			.then(res => {
				const list = res.data?.notes || [];
				setNotes(list);
				if (list.length > 0) setActiveNote(list[0]);
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [open, topicId]);

	return (
		<Drawer
			title={
				<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
					<div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
						<BookOutlined style={{ fontSize: 16, color: '#fff' }} />
					</div>
					<div>
						<div style={{ fontWeight: 700, color: '#102540', fontSize: 15 }}>Module Notes</div>
						{topicName && <div style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>{topicName}</div>}
					</div>
				</div>
			}
			placement="right"
			open={open}
			onClose={onClose}
			width={Math.min(780, typeof window !== 'undefined' ? window.innerWidth * 0.92 : 780)}
			styles={{ body: { padding: 0, background: '#f8fafc' } }}
		>
			{loading ? (
				<div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>
			) : notes.length === 0 ? (
				<div style={{ padding: 40 }}>
					<Empty
						image={Empty.PRESENTED_IMAGE_SIMPLE}
						description={
							<div>
								<Typography.Text style={{ display: 'block', color: '#64748b', marginBottom: 4 }}>No module notes found for this topic</Typography.Text>
								<Typography.Text type="secondary" style={{ fontSize: 12 }}>Module notes will appear here once they are published by the admin.</Typography.Text>
							</div>
						}
					/>
				</div>
			) : (
				<div>
					{/* Note selector if multiple */}
					{notes.length > 1 && (
						<div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff', display: 'flex', gap: 8, overflowX: 'auto' }}>
							{notes.map((n, idx) => (
								<Tag
									key={n.id}
									color={activeNote?.id === n.id ? 'blue' : undefined}
									onClick={() => setActiveNote(n)}
									style={{ cursor: 'pointer', borderRadius: 8, padding: '4px 12px', fontWeight: activeNote?.id === n.id ? 600 : 400 }}
								>
									{n.title}
								</Tag>
							))}
						</div>
					)}

					{activeNote && <ModuleNoteContent note={activeNote} />}
				</div>
			)}
		</Drawer>
	);
}

function ModuleNoteContent({ note }) {
	const n = note;
	const los = Array.isArray(n.losStatements) ? n.losStatements : [];
	const concepts = Array.isArray(n.concepts) ? n.concepts : [];
	const formulas = Array.isArray(n.formulaRecap) ? n.formulaRecap : [];
	const practiceSet = Array.isArray(n.practiceSet) ? n.practiceSet : [];
	const solutions = Array.isArray(n.workedSolutions) ? n.workedSolutions : [];
	const checks = Array.isArray(n.revisionCheck) ? n.revisionCheck : [];

	return (
		<div style={{ background: '#fff' }}>
			{/* Module Divider */}
			<div style={{ background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', padding: '24px 24px' }}>
				<Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5 }}>LEARNING MODULE</Typography.Text>
				<Typography.Title level={3} style={{ margin: '4px 0 0', color: '#fff' }}>{n.title}</Typography.Title>
				<Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
					{LEVEL_LABELS[n.level] || ''} {n.volume?.name ? `| ${n.volume.name}` : ''} {n.module?.name ? `| ${n.module.name}` : ''}
				</Typography.Text>
			</div>

			{/* Identity Strip */}
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderBottom: '1px solid #e2e8f0' }}>
				{[{ label: 'Study Time', value: n.studyTime }, { label: 'Difficulty', value: n.difficulty }, { label: 'Calculator Use', value: n.calculatorUse }].map((item, i) => (
					<div key={i} style={{ padding: '10px 16px', borderRight: i < 2 ? '1px solid #e2e8f0' : 'none', textAlign: 'center' }}>
						<div style={{ fontSize: 9, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: 1 }}>{item.label}</div>
						<div style={{ fontSize: 13, fontWeight: 600, color: '#102540', marginTop: 2 }}>{item.value || '—'}</div>
					</div>
				))}
			</div>

			{/* Overview */}
			{n.overview && <div style={{ padding: '14px 24px', background: '#f0f4f8', borderBottom: '1px solid #e2e8f0' }}><div style={{ color: '#374151', fontSize: 13, lineHeight: 1.6 }}>{safeRender(n.overview)}</div></div>}

			<div style={{ padding: '20px 24px' }}>
				{/* LOS */}
				{los.length > 0 && (
					<div style={{ marginBottom: 20 }}>
						<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540', letterSpacing: 0.5 }}>Learning Outcome Statements</Typography.Text>
						<table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse' }}>
							<thead><tr style={{ borderBottom: '2px solid #cbd5e1' }}><th style={{ textAlign: 'left', padding: '5px 6px', fontSize: 10, color: '#64748b' }}>LOS</th><th style={{ textAlign: 'left', padding: '5px 6px', fontSize: 10, color: '#64748b' }}>Statement</th><th style={{ textAlign: 'left', padding: '5px 6px', fontSize: 10, color: '#64748b' }}>Command</th></tr></thead>
							<tbody>{los.map((l, i) => (<tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={{ padding: '6px', fontWeight: 600, color: '#102540', fontSize: 12 }}>{safeRender(l.ref)}</td><td style={{ padding: '6px', fontSize: 12, color: '#374151' }}>{safeRender(l.statement)}</td><td style={{ padding: '6px' }}><Tag color="blue" style={{ fontSize: 10 }}>{safeRender(l.commandWord)}</Tag></td></tr>))}</tbody>
						</table>
					</div>
				)}

				{/* Concepts */}
				{concepts.map((c, i) => (
					<div key={i} style={{ marginBottom: 16, padding: '14px 16px', background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0' }}>
						<Typography.Text strong style={{ fontSize: 14, color: '#102540' }}>{i + 1}. {safeRender(c.title)}</Typography.Text>
						<div style={{ marginTop: 6 }}>
							<div style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}><strong>Meaning:</strong> {safeRender(c.meaning)}</div>
							{c.explanation && <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>{safeRender(c.explanation)}</div>}
							{c.formula && (
								<div style={{ background: '#f0f4f8', borderRadius: 6, padding: '10px 12px', marginBottom: 6, border: '1px solid #e2e8f0' }}>
									<div style={{ fontSize: 9, textTransform: 'uppercase', color: '#64748b', letterSpacing: 1 }}>FORMULA</div>
									<div className="formula-content" style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 14, fontWeight: 600, color: '#102540', marginTop: 2 }} dangerouslySetInnerHTML={{ __html: formatFormulaHtml(c.formula) }} />
									{c.formulaVariables && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }} dangerouslySetInnerHTML={{ __html: formatFormulaHtml(safeRender(c.formulaVariables)) }} />}
								</div>
							)}
							{c.interpretation && <div style={{ fontSize: 12, color: '#374151', marginBottom: 6, padding: '6px 10px', background: '#f8fafc', borderRadius: 4, borderLeft: '3px solid #3b82f6' }}><strong>Interpretation:</strong> {safeRender(c.interpretation)}</div>}
							{c.workedExample && (
								<div style={{ marginBottom: 6, padding: '8px 12px', background: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe' }}>
									<Typography.Text strong style={{ fontSize: 11, color: '#1d4ed8' }}>Worked Example</Typography.Text>
									<div style={{ fontSize: 12, marginTop: 3 }}><strong>Given:</strong> {safeRender(c.workedExample.given)}</div>
									<div style={{ fontSize: 12 }}><strong>Required:</strong> {safeRender(c.workedExample.required)}</div>
									<div style={{ fontSize: 12 }}><strong>Solution:</strong> {safeRender(c.workedExample.solution)}</div>
									<div style={{ fontSize: 12 }}><strong>Conclusion:</strong> {safeRender(c.workedExample.conclusion)}</div>
								</div>
							)}
							<Row gutter={8}>
								{c.examTip && <Col span={12}><div style={{ padding: '6px 10px', background: '#f0fdf4', borderRadius: 4, borderLeft: '3px solid #22c55e' }}><div style={{ fontSize: 10, fontWeight: 700, color: '#166534' }}>EXAM TIP</div><div style={{ fontSize: 11, color: '#166534', marginTop: 1 }}>{safeRender(c.examTip)}</div></div></Col>}
								{c.commonMistake && <Col span={12}><div style={{ padding: '6px 10px', background: '#fef3c7', borderRadius: 4, borderLeft: '3px solid #f59e0b' }}><div style={{ fontSize: 10, fontWeight: 700, color: '#92400e' }}>COMMON MISTAKE</div><div style={{ fontSize: 11, color: '#92400e', marginTop: 1 }}>{safeRender(c.commonMistake)}</div></div></Col>}
							</Row>
						</div>
					</div>
				))}

				{/* Module Summary */}
				{n.moduleSummary && <div style={{ marginBottom: 16, padding: '14px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}><Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540' }}>Module Summary</Typography.Text><div style={{ fontSize: 12, color: '#374151', marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{safeRender(n.moduleSummary)}</div></div>}

				{/* Formula Recap */}
				{formulas.length > 0 && (
					<div style={{ marginBottom: 16, background: '#f0f4f8', borderRadius: 10, padding: '14px 16px', border: '1px solid #e2e8f0' }}>
						<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540' }}>Formula Recap</Typography.Text>
						{formulas.map((f, i) => (<div key={i} style={{ padding: '6px 0', borderBottom: i < formulas.length - 1 ? '1px solid #e2e8f0' : 'none' }}><div style={{ fontWeight: 600, color: '#102540', fontSize: 12 }}>{safeRender(f.name)}</div><div className="formula-content" style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 14, fontWeight: 600, color: '#102540', marginTop: 1 }} dangerouslySetInnerHTML={{ __html: formatFormulaHtml(safeRender(f.formula)) }} /><div style={{ fontSize: 11, color: '#64748b' }} dangerouslySetInnerHTML={{ __html: formatFormulaHtml(safeRender(f.variables)) }} /></div>))}
					</div>
				)}

				{/* Practice Set */}
				{practiceSet.length > 0 && (
					<div style={{ marginBottom: 16, padding: '12px 16px', background: '#eff6ff', borderRadius: 10, borderLeft: '4px solid #3b82f6' }}>
						<Typography.Text strong style={{ fontSize: 11, textTransform: 'uppercase', color: '#1d4ed8' }}>Practice Set</Typography.Text>
						{practiceSet.map((q, i) => (<div key={i} style={{ fontSize: 12, color: '#1e3a5a', marginTop: 4 }}><strong>{i + 1}.</strong> {safeRender(q.question)} {q.losRef && <Tag style={{ fontSize: 9 }}>{safeRender(q.losRef)}</Tag>}</div>))}
					</div>
				)}

				{/* Worked Solutions */}
				{solutions.length > 0 && (
					<div style={{ marginBottom: 16 }}>
						<Typography.Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#102540' }}>Worked Solutions</Typography.Text>
						{solutions.map((s, i) => (<div key={i} style={{ marginTop: 6, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}><div style={{ fontWeight: 600, fontSize: 12, color: '#102540' }}>{i + 1}. {safeRender(s.question)}</div><div style={{ fontSize: 12, marginTop: 2 }}><strong>Answer:</strong> {safeRender(s.answer)}</div>{s.method && <div style={{ fontSize: 11, color: '#475569' }}><strong>Method:</strong> {safeRender(s.method)}</div>}{s.interpretation && <div style={{ fontSize: 11, color: '#3b82f6' }}><strong>Interpretation:</strong> {safeRender(s.interpretation)}</div>}{s.trap && <div style={{ fontSize: 11, color: '#92400e' }}><strong>Trap:</strong> {safeRender(s.trap)}</div>}</div>))}
					</div>
				)}

				{/* Revision Checklist */}
				{checks.length > 0 && (
					<div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
						<Typography.Text strong style={{ fontSize: 11, textTransform: 'uppercase', color: '#102540' }}>Revision Checklist</Typography.Text>
						<div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>{checks.map((c, i) => (<div key={i} style={{ padding: '4px 10px', background: '#fff', borderRadius: 4, border: '1px solid #e2e8f0', fontSize: 12 }}>☐ {safeRender(c.item)}</div>))}</div>
					</div>
				)}
			</div>

			{/* Footer */}
			<div style={{ padding: '10px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', background: '#f8fafc' }}>
				<Typography.Text style={{ fontSize: 10, color: '#94a3b8' }}>Milven Finance School | Module Notes {n.year}</Typography.Text>
				<Typography.Text style={{ fontSize: 10, color: '#94a3b8' }}>Simplified. Exam-focused.</Typography.Text>
			</div>
		</div>
	);
}

export default ModuleNotesDrawer;
