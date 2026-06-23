import React from 'react';
import { Typography, Tag, Row, Col, Space } from 'antd';
import MathText, { MathVariables } from './MathText';

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };

function safeRender(val) {
	if (val === null || val === undefined) return '';
	if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
	if (typeof val === 'object') {
		try { return JSON.stringify(val); } catch { return String(val); }
	}
	return String(val);
}

function SectionHeader({ number, title, style, children }) {
	return (
		<div style={{ marginBottom: 16, ...style }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
				<div style={{ width: 32, height: 32, borderRadius: 8, background: '#102540', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
					<Typography.Text style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{number}</Typography.Text>
				</div>
				<Typography.Title level={4} style={{ margin: 0, color: '#102540' }}>{title}</Typography.Title>
			</div>
			{children}
		</div>
	);
}

function FormulaBox({ formula, variables, useCase, examTrap }) {
	if (!formula) return null;
	return (
		<div style={{ background: '#f0f4f8', borderRadius: 10, padding: '14px 18px', margin: '12px 0', border: '1px solid #e2e8f0', borderLeft: '4px solid #3b82f6' }}>
			<div style={{ fontSize: 9, textTransform: 'uppercase', color: '#3b82f6', letterSpacing: 1.5, fontWeight: 700 }}>Formula</div>
			<MathText text={formula} tag="div" style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 17, fontWeight: 700, color: '#102540', marginTop: 4 }} />
			{variables && <MathVariables text={safeRender(variables)} tag="div" style={{ fontSize: 12, color: '#64748b', marginTop: 3 }} />}
			<div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
				{useCase && (
					<div style={{ flex: 1, minWidth: 200, padding: '6px 10px', background: '#e0f2fe', borderRadius: 6, fontSize: 12, color: '#0369a1' }}>
						<strong>Use when:</strong> {useCase}
					</div>
				)}
				{examTrap && (
					<div style={{ flex: 1, minWidth: 200, padding: '6px 10px', background: '#fef3c7', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
						<strong>Exam trap:</strong> {examTrap}
					</div>
				)}
			</div>
		</div>
	);
}

export function ModuleNotePreviewCard({ note }) {
	const n = note;
	const roadmap = Array.isArray(n.studyRoadmap) ? n.studyRoadmap : [];
	const los = Array.isArray(n.losStatements) ? n.losStatements : [];
	const concepts = Array.isArray(n.concepts) ? n.concepts : [];
	const formulas = Array.isArray(n.formulaRecap) ? n.formulaRecap : [];
	const practiceSet = Array.isArray(n.practiceSet) ? n.practiceSet : [];
	const solutions = Array.isArray(n.workedSolutions) ? n.workedSolutions : [];
	const checks = Array.isArray(n.revisionCheck) ? n.revisionCheck : [];

	const tocItems = [
		...(roadmap.length ? ['Study Roadmap'] : []),
		...(los.length ? ['Learning Outcome Statements'] : []),
		...(concepts.length ? ['Topic-by-topic Notes'] : []),
		...(solutions.length ? ['Worked Examples'] : []),
		...(practiceSet.length ? ['Exam-Style Questions'] : []),
		...(formulas.length ? ['Formula Bank'] : []),
		...(checks.length ? ['Final Exam Checklist'] : []),
	];

	return (
		<div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden' }}>
			<div style={{ background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', padding: '28px 32px' }}>
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
					<div>
						<Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5 }}>MILVEN FINANCE SCHOOL</Typography.Text>
						<Typography.Title level={2} style={{ margin: '2px 0 0', color: '#fff' }}>{n.title}</Typography.Title>
						<div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
							<Typography.Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
								{LEVEL_LABELS[n.level]} {n.volume?.name ? `| ${n.volume.name}` : ''} {n.module?.name ? `| ${n.module.name}` : ''}
							</Typography.Text>
						</div>
						<div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
							<Tag style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', fontSize: 10 }}>NOTES</Tag>
							<Tag style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', fontSize: 10 }}>EXAMPLES</Tag>
							<Tag style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', fontSize: 10 }}>EXAM PRACTICE</Tag>
						</div>
					</div>
					<div style={{ textAlign: 'right', flexShrink: 0 }}>
						<Tag style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff' }}>{n.year} Edition</Tag>
						{n.status && <Tag color={n.status === 'PUBLISHED' ? 'green' : 'default'} style={{ marginLeft: 4 }}>{n.status}</Tag>}
					</div>
				</div>
			</div>

			<div style={{ padding: '10px 32px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
				Original Milven learning material | Structured for study, revision and exam practice
			</div>

			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderBottom: '1px solid #e2e8f0' }}>
				{[{ label: 'Study Time', value: n.studyTime }, { label: 'Difficulty', value: n.difficulty }, { label: 'Calculator Use', value: n.calculatorUse }].map((item, i) => (
					<div key={i} style={{ padding: '12px 20px', borderRight: i < 2 ? '1px solid #e2e8f0' : 'none', textAlign: 'center' }}>
						<div style={{ fontSize: 10, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: 1 }}>{item.label}</div>
						<div style={{ fontSize: 14, fontWeight: 600, color: '#102540', marginTop: 2 }}>{item.value || '—'}</div>
					</div>
				))}
			</div>

			{n.overview && (
				<div style={{ padding: '16px 32px', background: '#f0f4f8', borderBottom: '1px solid #e2e8f0' }}>
					<div style={{ color: '#374151', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{safeRender(n.overview)}</div>
				</div>
			)}

			<div style={{ padding: '24px 32px' }}>

				{/* Disclaimer */}
				<div style={{ padding: '10px 14px', background: '#fefce8', borderRadius: 8, border: '1px solid #fde68a', marginBottom: 24, fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
					<strong>Important:</strong> This is an original Milven study aid. It summarises and teaches the examinable ideas in Milven's own words. It is not a reproduction of the curriculum and is not copied from any tuition provider.
				</div>

				{/* Navigation Guide */}
				{tocItems.length > 0 && (
					<div style={{ marginBottom: 28, padding: '16px 20px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
						<Typography.Text strong style={{ fontSize: 13, textTransform: 'uppercase', color: '#102540', letterSpacing: 0.5 }}>Navigation Guide</Typography.Text>
						<div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
							{tocItems.map((item, i) => (
								<div key={i} style={{ fontSize: 13, color: '#2563eb', padding: '2px 0' }}>
									• {i + 1}. {item}
								</div>
							))}
						</div>
					</div>
				)}

				{/* Study Roadmap */}
				{roadmap.length > 0 && (
					<SectionHeader number="1" title="Study Roadmap">
						<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
							<thead>
								<tr style={{ borderBottom: '2px solid #cbd5e1' }}>
									<th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b', width: 60 }}>Step</th>
									<th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b' }}>Study Focus</th>
									<th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b' }}>Why It Matters</th>
									<th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b' }}>Exam Tip</th>
								</tr>
							</thead>
							<tbody>
								{roadmap.map((s, i) => (
									<tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
										<td style={{ padding: '8px', fontWeight: 700, color: '#102540' }}>{safeRender(s.step)}</td>
										<td style={{ padding: '8px', color: '#374151' }}>{safeRender(s.focus)}</td>
										<td style={{ padding: '8px', color: '#475569' }}>{safeRender(s.whyItMatters)}</td>
										<td style={{ padding: '8px', color: '#92400e', fontSize: 12 }}>{s.examTip}</td>
									</tr>
								))}
							</tbody>
						</table>
					</SectionHeader>
				)}

				{/* Learning Outcome Statements */}
				{los.length > 0 && (
					<SectionHeader number={roadmap.length > 0 ? '2' : '1'} title="Learning Outcome Statements">
						<div style={{ fontSize: 13, color: '#475569', marginBottom: 10 }}>LOS Covered</div>
						<table style={{ width: '100%', borderCollapse: 'collapse' }}>
							<thead><tr style={{ borderBottom: '2px solid #cbd5e1' }}><th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b' }}>LOS</th><th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b' }}>Statement</th><th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: '#64748b' }}>Command</th></tr></thead>
							<tbody>{los.map((l, i) => (<tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}><td style={{ padding: '8px', fontWeight: 600, color: '#102540', fontSize: 13 }}>{safeRender(l.ref)}</td><td style={{ padding: '8px', fontSize: 13, color: '#374151' }}>{safeRender(l.statement)}</td><td style={{ padding: '8px' }}><Tag color="blue" style={{ fontSize: 11 }}>{safeRender(l.commandWord)}</Tag></td></tr>))}</tbody>
						</table>
					</SectionHeader>
				)}

				{/* Topic-by-topic Notes */}
				{concepts.length > 0 && (
					<SectionHeader number={(() => { let i = 1; if (roadmap.length) i++; if (los.length) i++; return i; })()} title="Topic-by-topic Notes">
						{concepts.map((c, i) => (
							<div key={i} style={{ marginBottom: 20, padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
								<Typography.Text strong style={{ fontSize: 15, color: '#102540' }}>{safeRender(c.title)}</Typography.Text>
								<div style={{ marginTop: 8 }}>
									{c.meaning && <div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}><strong>Plain-English meaning:</strong> {safeRender(c.meaning)}</div>}
									{c.explanation && <div style={{ fontSize: 13, color: '#374151', marginBottom: 8, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{safeRender(c.explanation)}</div>}
									<FormulaBox formula={c.formula} variables={c.formulaVariables} useCase={c.formulaUseCase} examTrap={c.formulaExamTrap} />
									{c.interpretation && <div style={{ fontSize: 13, color: '#374151', marginBottom: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, borderLeft: '3px solid #3b82f6' }}><strong>Interpretation:</strong> {safeRender(c.interpretation)}</div>}
									{c.workedExample && (
										<div style={{ marginBottom: 8, padding: '10px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
											<Typography.Text strong style={{ fontSize: 12, color: '#1d4ed8' }}>Worked Example</Typography.Text>
											<div style={{ fontSize: 13, marginTop: 4 }}><strong>Given:</strong> {safeRender(c.workedExample.given)}</div>
											<div style={{ fontSize: 13 }}><strong>Required:</strong> {safeRender(c.workedExample.required)}</div>
											<div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}><strong>Solution:</strong> {safeRender(c.workedExample.solution)}</div>
											<div style={{ fontSize: 13 }}><strong>Conclusion:</strong> {safeRender(c.workedExample.conclusion)}</div>
										</div>
									)}
									<Row gutter={12}>
										{c.examTip && <Col span={12}><div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, borderLeft: '3px solid #22c55e' }}><Typography.Text strong style={{ fontSize: 11, color: '#166534' }}>EXAM TIP</Typography.Text><div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>{safeRender(c.examTip)}</div></div></Col>}
										{c.commonMistake && <Col span={12}><div style={{ padding: '8px 12px', background: '#fef3c7', borderRadius: 6, borderLeft: '3px solid #f59e0b' }}><Typography.Text strong style={{ fontSize: 11, color: '#92400e' }}>COMMON MISTAKE</Typography.Text><div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>{safeRender(c.commonMistake)}</div></div></Col>}
									</Row>
								</div>
							</div>
						))}
					</SectionHeader>
				)}

				{/* Module Summary */}
				{n.moduleSummary && (
					<SectionHeader number="9" title="Module Summary">
						<div style={{ fontSize: 13, color: '#374151', marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.6, padding: '14px 18px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
							{safeRender(n.moduleSummary)}
						</div>
					</SectionHeader>
				)}

				{/* Worked Examples */}
				{solutions.length > 0 && (
					<SectionHeader number="10" title="Worked Examples">
						{solutions.map((s, i) => (
							<div key={i} style={{ marginBottom: 16, padding: '12px 16px', background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe' }}>
								<div style={{ fontWeight: 700, fontSize: 14, color: '#1d4ed8' }}>Worked Example {s.label || String.fromCharCode(65 + i)}</div>
								<div style={{ fontSize: 13, marginTop: 6 }}><strong>Question:</strong> {safeRender(s.question)}</div>
								<div style={{ fontSize: 13, marginTop: 4, padding: '8px 12px', background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
									<strong>Answer:</strong> <span style={{ fontWeight: 600, color: '#16a34a' }}>{safeRender(s.answer)}</span>
								</div>
								{s.method && <div style={{ fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' }}><strong>Method:</strong> {safeRender(s.method)}</div>}
								{s.interpretation && <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 4 }}><strong>Interpretation:</strong> {safeRender(s.interpretation)}</div>}
								{s.trap && <div style={{ fontSize: 12, color: '#92400e', marginTop: 2, padding: '4px 8px', background: '#fef3c7', borderRadius: 4, display: 'inline-block' }}><strong>Trap:</strong> {safeRender(s.trap)}</div>}
							</div>
						))}
					</SectionHeader>
				)}

				{/* Exam-Style Questions with Answers */}
				{practiceSet.length > 0 && (
					<SectionHeader number="11" title="Exam-Style Questions with Answers">
						{practiceSet.map((q, i) => (
							<div key={i} style={{ marginBottom: 14, padding: '12px 16px', background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0' }}>
								<div style={{ fontSize: 14, fontWeight: 600, color: '#102540' }}>Question {i + 1}. {q.losRef && <Tag style={{ fontSize: 10 }}>{safeRender(q.losRef)}</Tag>}</div>
								<div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}>{safeRender(q.question)}</div>
								{q.correctAnswer && (
									<div style={{ marginTop: 8, padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, border: '1px solid #86efac' }}>
										<div style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>Correct answer: {safeRender(q.correctAnswer)}</div>
										{q.explanation && <div style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>{safeRender(q.explanation)}</div>}
									</div>
								)}
							</div>
						))}
					</SectionHeader>
				)}

				{/* Formula Bank */}
				{formulas.length > 0 && (
					<SectionHeader number="12" title="Formula Bank">
						<div style={{ overflowX: 'auto' }}>
							<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
								<thead><tr style={{ borderBottom: '2px solid #cbd5e1' }}>
									<th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontSize: 10 }}>Formula</th>
									<th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontSize: 10 }}>Expression</th>
									<th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontSize: 10 }}>Variables</th>
									<th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontSize: 10 }}>Use Case</th>
									<th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontSize: 10 }}>Exam Trap</th>
								</tr></thead>
								<tbody>{formulas.map((f, i) => (
									<tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
										<td style={{ padding: '8px', fontWeight: 600, color: '#102540' }}>{safeRender(f.name)}</td>
										<td style={{ padding: '8px' }}><MathText text={f.formula} tag="div" style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 14, fontWeight: 600, color: '#102540' }} /></td>
										<td style={{ padding: '8px', color: '#64748b' }}>{f.variables ? <MathVariables text={safeRender(f.variables)} tag="div" /> : '—'}</td>
										<td style={{ padding: '8px', color: '#0369a1', fontSize: 11 }}>{f.useCase || '—'}</td>
										<td style={{ padding: '8px', color: '#92400e', fontSize: 11 }}>{f.examTrap || '—'}</td>
									</tr>
								))}</tbody>
							</table>
						</div>
					</SectionHeader>
				)}

				{/* Final Exam Checklist */}
				{checks.length > 0 && (
					<SectionHeader number="13" title="Final Exam Checklist">
						<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
							{checks.map((c, i) => (
								<div key={i} style={{ padding: '8px 14px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, color: '#374151' }}>
									☐ {safeRender(c.item)}
								</div>
							))}
						</div>
					</SectionHeader>
				)}
			</div>

			<div style={{ padding: '12px 32px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', background: '#f8fafc' }}>
				<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>Milven Finance School | Module Notes {n.year}</Typography.Text>
				<Typography.Text style={{ fontSize: 11, color: '#94a3b8' }}>Simplified. Exam-focused. Built to help you pass.</Typography.Text>
			</div>
		</div>
	);
}

export default ModuleNotePreviewCard;
