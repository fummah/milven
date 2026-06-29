import React from 'react';
import { Typography, Tag, Row, Col, Space } from 'antd';
import MathText, { MathVariables, MathProse } from './MathText';

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };

function prose(val) {
	if (val === null || val === undefined) return null;
	const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
	if (!str) return null;
	return <MathProse text={str} />;
}

/* ─── Document-style formula box matching the images ─── */
function FormulaBox({ formula, variables, useCase, examTrap }) {
	if (!formula) return null;
	const rows = [
		{ label: 'Formula', content: <MathText text={formula} tag="span" style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 14, color: '#000' }} /> },
		...(variables ? [{ label: 'Where', content: <MathVariables text={variables} /> }] : []),
		...(useCase ? [{ label: 'Use when', content: prose(useCase) }] : []),
		...(examTrap ? [{ label: 'Exam trap', content: prose(examTrap) }] : []),
	];
	return (
		<table style={{ width: '100%', borderCollapse: 'collapse', margin: '12px 0', border: '1px solid #cbd5e1' }}>
			<tbody>
				{rows.map((r, i) => (
					<tr key={i} style={{ borderBottom: i < rows.length - 1 ? '1px solid #cbd5e1' : 'none' }}>
						<td style={{ background: '#102540', color: '#fff', fontWeight: 700, fontSize: 12, padding: '8px 14px', width: 100, verticalAlign: 'top' }}>{r.label}</td>
						<td style={{ padding: '8px 14px', fontSize: 13, color: '#1e293b', verticalAlign: 'top' }}>{r.content}</td>
					</tr>
				))}
			</tbody>
		</table>
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
		'Module Overview and Learning Outcomes',
		...(roadmap.length ? ['Study Roadmap'] : []),
		...concepts.map(c => typeof c.title === 'string' ? c.title : 'Topic Notes'),
		...(solutions.length ? ['Worked Examples'] : []),
		...(practiceSet.length ? ['Exam-Style Questions with Answers'] : []),
		...(formulas.length ? ['Formula Bank'] : []),
		...(checks.length ? ['Final Exam Checklist'] : []),
	];

	return (
		<div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden' }}>
			{/* Cover page header matching Milven branding */}
			<div style={{ background: '#fff', padding: '24px 32px 0' }}>
				{/* Top-right branding */}
				<div style={{ textAlign: 'right', marginBottom: 40 }}>
					<div style={{ fontWeight: 700, fontSize: 14, color: '#102540' }}>MILVEN FINANCE SCHOOL</div>
					<div style={{ fontSize: 12, color: '#475569' }}>
						CFA {LEVEL_LABELS[n.level]}{n.volume?.name ? ` | ${n.volume.name}` : ''}{n.module?.name ? ` | ${n.module.name}` : ''}
					</div>
				</div>

				{/* Centered title block */}
				<div style={{ textAlign: 'center', paddingBottom: 24 }}>
					<Typography.Title level={1} style={{ margin: 0, color: '#102540', fontSize: 32, fontWeight: 800, letterSpacing: -0.5 }}>
						MILVEN FINANCE SCHOOL
					</Typography.Title>
					<div style={{ fontSize: 22, color: '#c9a227', fontStyle: 'italic', fontWeight: 600, marginTop: 8 }}>
						Exam-Ready Notes
					</div>
					<div style={{ marginTop: 28 }}>
						<div style={{ fontSize: 18, fontWeight: 700, color: '#102540' }}>
							CFA Program {LEVEL_LABELS[n.level]}
						</div>
						{n.volume?.name && (
							<div style={{ fontSize: 18, fontWeight: 700, color: '#102540', marginTop: 4 }}>
								{n.volume.name}
							</div>
						)}
						<div style={{ fontSize: 18, fontWeight: 700, color: '#102540', marginTop: 4 }}>
							{n.module?.name ? `${n.module.name}: ` : ''}{n.title}
						</div>
					</div>

					<div style={{ marginTop: 32, fontSize: 13, color: '#c9a227', fontStyle: 'italic' }}>
						Original Milven learning material | Structured for study, revision and exam practice
					</div>
				</div>

				{/* Navy bar with NOTES | EXAMPLES | EXAM PRACTICE */}
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginTop: 8 }}>
					<div style={{ background: '#102540', padding: '10px 0', textAlign: 'center' }}>
						<span style={{ color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' }}>NOTES</span>
					</div>
					<div style={{ background: '#c9a227', padding: '10px 0', textAlign: 'center' }}>
						<span style={{ color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' }}>EXAMPLES</span>
					</div>
					<div style={{ background: '#102540', padding: '10px 0', textAlign: 'center' }}>
						<span style={{ color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' }}>EXAM PRACTICE</span>
					</div>
				</div>
			</div>

			{/* Disclaimer */}
			<div style={{ padding: '14px 32px', background: '#fff', borderBottom: '1px solid #e2e8f0', fontSize: 12, color: '#64748b', fontStyle: 'italic', textAlign: 'center', lineHeight: 1.6 }}>
				<strong style={{ fontStyle: 'italic' }}>Important:</strong> This is an original Milven study aid. It summarises and teaches the examinable ideas in Milven's own words. It is not a reproduction of the curriculum and is not copied from any tuition provider.
			</div>

			{/* ═══ CONTENT BODY ═══ */}
			<div style={{ padding: '28px 40px' }}>

				{/* ─── Navigation Guide ─── */}
				{tocItems.length > 0 && (
					<div style={{ marginBottom: 32 }}>
						<h2 style={{ fontSize: 24, fontWeight: 800, color: '#102540', margin: '0 0 8px', fontStyle: 'italic' }}>Navigation Guide</h2>
						<p style={{ fontSize: 13, color: '#374151', margin: '0 0 12px', lineHeight: 1.6 }}>
							Use the headings in this document to open the Microsoft Word Navigation Pane: View &gt; Navigation Pane. The headings below are also the study sequence for this Learning Module.
						</p>
						<ul style={{ listStyle: 'disc', paddingLeft: 24, margin: 0 }}>
							{tocItems.map((item, i) => (
								<li key={i} style={{ fontSize: 13, color: '#1e293b', padding: '2px 0' }}>{i + 1}. {item}</li>
							))}
						</ul>
					</div>
				)}

				{/* ─── 1. Module Overview and Learning Outcomes ─── */}
				{(n.overview || los.length > 0) && (
					<div style={{ marginBottom: 32 }}>
						<h2 style={{ fontSize: 24, fontWeight: 800, color: '#102540', margin: '0 0 12px' }}>1. Module Overview and Learning Outcomes</h2>
						{n.overview && <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: '0 0 16px' }}>{prose(n.overview)}</p>}

						{/* What this module must help you do box */}
						{n.moduleSummary && (
							<div style={{ border: '2px solid #102540', padding: '12px 16px', marginBottom: 16 }}>
								<div style={{ fontWeight: 700, fontSize: 13, color: '#102540', marginBottom: 6 }}>What this module must help you do</div>
								<div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{prose(n.moduleSummary)}</div>
							</div>
						)}

						{/* 1.1 LOS Covered */}
						{los.length > 0 && (
							<div style={{ marginTop: 16 }}>
								<h3 style={{ fontSize: 16, fontWeight: 700, color: '#102540', margin: '0 0 10px' }}>1.1 LOS Covered</h3>
								<ul style={{ listStyle: 'disc', paddingLeft: 24, margin: 0 }}>
									{los.map((l, i) => (
										<li key={i} style={{ fontSize: 13, color: '#374151', padding: '3px 0', lineHeight: 1.5 }}>
											{l.ref && <strong style={{ color: '#102540' }}>{l.ref}: </strong>}
											{prose(l.statement || l)}
											{l.commandWord && <span style={{ marginLeft: 6, fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>({l.commandWord})</span>}
										</li>
									))}
								</ul>
							</div>
						)}
					</div>
				)}

				{/* ─── 2. Study Roadmap ─── */}
				{roadmap.length > 0 && (
					<div style={{ marginBottom: 32 }}>
						<h2 style={{ fontSize: 24, fontWeight: 800, color: '#102540', margin: '0 0 12px' }}>2. Study Roadmap</h2>
						<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, border: '1px solid #cbd5e1' }}>
							<thead>
								<tr>
									<th style={{ background: '#102540', color: '#fff', fontWeight: 700, fontSize: 12, padding: '8px 12px', textAlign: 'left', borderRight: '1px solid #1b3a5b' }}>Step</th>
									<th style={{ background: '#102540', color: '#fff', fontWeight: 700, fontSize: 12, padding: '8px 12px', textAlign: 'left', borderRight: '1px solid #1b3a5b' }}>Study Focus</th>
									<th style={{ background: '#102540', color: '#fff', fontWeight: 700, fontSize: 12, padding: '8px 12px', textAlign: 'left' }}>Why it matters in the exam</th>
								</tr>
							</thead>
							<tbody>
								{roadmap.map((s, i) => (
									<tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
										<td style={{ padding: '8px 12px', fontWeight: 600, color: '#102540', borderRight: '1px solid #e2e8f0' }}>{prose(s.step)}</td>
										<td style={{ padding: '8px 12px', color: '#374151', borderRight: '1px solid #e2e8f0' }}>{prose(s.focus)}</td>
										<td style={{ padding: '8px 12px', color: '#475569' }}>{prose(s.whyItMatters || s.examTip)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				{/* ─── 3+ Topic-by-topic Notes ─── */}
				{concepts.length > 0 && concepts.map((c, i) => {
					const sectionNum = 3 + i;
					return (
						<div key={i} style={{ marginBottom: 32 }}>
							<h2 style={{ fontSize: 22, fontWeight: 800, color: '#102540', margin: '0 0 10px' }}>
								{c.sectionNumber || `${sectionNum}.`} {prose(c.title)}
							</h2>

							{c.meaning && (
								<p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: '0 0 12px' }}>
									{prose(c.meaning)}
								</p>
							)}

							{c.explanation && (
								<div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 12 }}>
									{prose(c.explanation)}
								</div>
							)}

							<FormulaBox formula={c.formula} variables={c.formulaVariables} useCase={c.formulaUseCase} examTrap={c.formulaExamTrap} />

							{c.interpretation && (
								<p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: '8px 0' }}>
									<strong>Interpretation:</strong> {prose(c.interpretation)}
								</p>
							)}

							{/* Inline worked example */}
							{c.workedExample && (
								<div style={{ marginTop: 16, marginBottom: 12 }}>
									<h4 style={{ fontSize: 14, fontWeight: 700, color: '#102540', margin: '0 0 4px' }}>
										Example {i + 1}: {prose(c.workedExample.title || c.title)}
									</h4>
									<p style={{ fontSize: 13, color: '#374151', margin: '0 0 6px' }}>
										<strong>Question:</strong> {prose(c.workedExample.given || c.workedExample.question)}
									</p>
									<p style={{ fontSize: 13, fontWeight: 600, color: '#102540', margin: '0 0 4px' }}>Solution:</p>
									<ul style={{ listStyle: 'disc', paddingLeft: 24, margin: '0 0 8px' }}>
										{(c.workedExample.solution || c.workedExample.steps || '').split('\n').filter(Boolean).map((step, si) => (
											<li key={si} style={{ fontSize: 13, color: '#374151', padding: '2px 0' }}>{prose(step)}</li>
										))}
									</ul>
									{c.workedExample.conclusion && (
										<p style={{ fontSize: 13, color: '#374151', margin: 0 }}>
											<strong>Conclusion:</strong> {prose(c.workedExample.conclusion)}
										</p>
									)}
								</div>
							)}

							{/* Decision logic / tips box */}
							{(c.examTip || c.commonMistake) && (
								<div style={{ border: '2px solid #102540', padding: '12px 16px', marginTop: 12 }}>
									{c.examTip && (
										<div style={{ fontSize: 13, color: '#374151', marginBottom: c.commonMistake ? 6 : 0 }}>
											<strong>Exam tip:</strong> {prose(c.examTip)}
										</div>
									)}
									{c.commonMistake && (
										<div style={{ fontSize: 13, color: '#374151' }}>
											<strong>Common mistake:</strong> {prose(c.commonMistake)}
										</div>
									)}
								</div>
							)}
						</div>
					);
				})}

				{/* ─── Worked Examples (standalone section) ─── */}
				{solutions.length > 0 && (
					<div style={{ marginBottom: 32 }}>
						<h2 style={{ fontSize: 24, fontWeight: 800, color: '#102540', margin: '0 0 16px' }}>
							{concepts.length + 3}. Worked Examples
						</h2>
						{solutions.map((s, i) => (
							<div key={i} style={{ marginBottom: 20 }}>
								<h4 style={{ fontSize: 14, fontWeight: 700, color: '#102540', margin: '0 0 4px' }}>
									Worked Example {s.label || String.fromCharCode(65 + i)}: {prose(s.title || s.topic || '')}
								</h4>
								<p style={{ fontSize: 13, color: '#374151', margin: '0 0 6px' }}>
									<strong>Question:</strong> {prose(s.question)}
								</p>
								<p style={{ fontSize: 13, fontWeight: 600, color: '#102540', margin: '0 0 4px' }}>Solution:</p>
								<ul style={{ listStyle: 'disc', paddingLeft: 24, margin: '0 0 8px' }}>
									{(s.method || s.answer || '').split('\n').filter(Boolean).map((step, si) => (
										<li key={si} style={{ fontSize: 13, color: '#374141', padding: '2px 0' }}>{prose(step)}</li>
									))}
								</ul>
								{s.interpretation && (
									<p style={{ fontSize: 13, color: '#374151', margin: 0 }}>• {prose(s.interpretation)}</p>
								)}
								{s.trap && (
									<p style={{ fontSize: 13, color: '#374151', margin: '4px 0 0' }}>• <strong>Trap:</strong> {prose(s.trap)}</p>
								)}
							</div>
						))}
					</div>
				)}

				{/* ─── Exam-Style Questions with Answers ─── */}
				{practiceSet.length > 0 && (
					<div style={{ marginBottom: 32 }}>
						<h2 style={{ fontSize: 24, fontWeight: 800, color: '#102540', margin: '0 0 16px' }}>
							{concepts.length + (solutions.length > 0 ? 4 : 3)}. Exam-Style Questions with Answers
						</h2>
						{practiceSet.map((q, i) => (
							<div key={i} style={{ marginBottom: 16 }}>
								<p style={{ fontSize: 13, color: '#102540', margin: '0 0 6px' }}>
									<strong>Question {i + 1}.</strong> {prose(q.question)}
								</p>
								{Array.isArray(q.options) && q.options.length > 0 && (
									<ul style={{ listStyle: 'disc', paddingLeft: 24, margin: '0 0 6px' }}>
										{q.options.map((opt, oi) => (
											<li key={oi} style={{ fontSize: 13, color: '#374151', padding: '1px 0' }}>
												{String.fromCharCode(65 + oi)}. {prose(typeof opt === 'string' ? opt : opt.text || opt)}
											</li>
										))}
									</ul>
								)}
								{q.correctAnswer && (
									<p style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, margin: '0 0 4px' }}>
										Correct answer: {prose(q.correctAnswer)}
									</p>
								)}
								{q.explanation && (
									<p style={{ fontSize: 12, color: '#475569', margin: 0 }}>{prose(q.explanation)}</p>
								)}
							</div>
						))}
					</div>
				)}

				{/* ─── Formula Bank ─── */}
				{formulas.length > 0 && (
					<div style={{ marginBottom: 32 }}>
						<h2 style={{ fontSize: 24, fontWeight: 800, color: '#102540', margin: '0 0 16px' }}>
							{concepts.length + (solutions.length > 0 ? 1 : 0) + (practiceSet.length > 0 ? 1 : 0) + 3}. Formula Bank
						</h2>
						<div style={{ overflowX: 'auto' }}>
							<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, border: '1px solid #cbd5e1' }}>
								<thead>
									<tr>
										<th style={{ background: '#102540', color: '#fff', fontWeight: 700, fontSize: 11, padding: '8px 10px', textAlign: 'left', borderRight: '1px solid #1b3a5b' }}>Formula area</th>
										<th style={{ background: '#102540', color: '#fff', fontWeight: 700, fontSize: 11, padding: '8px 10px', textAlign: 'left', borderRight: '1px solid #1b3a5b' }}>Formula</th>
										<th style={{ background: '#102540', color: '#fff', fontWeight: 700, fontSize: 11, padding: '8px 10px', textAlign: 'left' }}>Use</th>
									</tr>
								</thead>
								<tbody>
									{formulas.map((f, i) => (
										<tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
											<td style={{ padding: '6px 10px', fontWeight: 600, color: '#102540', fontSize: 12, borderRight: '1px solid #e2e8f0' }}>{prose(f.name)}</td>
											<td style={{ padding: '6px 10px', borderRight: '1px solid #e2e8f0' }}>
												<MathText text={f.formula} tag="span" style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 13, color: '#102540' }} />
											</td>
											<td style={{ padding: '6px 10px', color: '#475569', fontSize: 12 }}>{prose(f.useCase) || '—'}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}

				{/* ─── Final Exam Checklist ─── */}
				{checks.length > 0 && (
					<div style={{ marginBottom: 32 }}>
						<h2 style={{ fontSize: 24, fontWeight: 800, color: '#102540', margin: '0 0 12px' }}>
							{concepts.length + (solutions.length > 0 ? 1 : 0) + (practiceSet.length > 0 ? 1 : 0) + (formulas.length > 0 ? 1 : 0) + 3}. Final Exam Checklist
						</h2>
						<ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
							{checks.map((c, i) => (
								<li key={i} style={{ fontSize: 13, color: '#374151', padding: '3px 0' }}>
									• Can I {prose(c.item || c)}
								</li>
							))}
						</ul>
					</div>
				)}
			</div>

			{/* Footer */}
			<div style={{ padding: '12px 40px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
				<span style={{ fontSize: 12, color: '#c9a227', fontWeight: 600 }}>Milven</span>
				<span style={{ fontSize: 12, color: '#64748b' }}> Finance School | Exam-Ready Notes</span>
			</div>
		</div>
	);
}

export default ModuleNotePreviewCard;
