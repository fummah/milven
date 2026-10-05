import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { LATEX_SYSTEM_RULES, LATEX_PROMPT_SECTION } from '../lib/openai.js';
import { getAIApiKey, getActiveProvider, getActiveModel, getDefaultModel, chatCompletion, AI_PROVIDERS } from '../lib/aiProvider.js';
import { stripJsonFences, extractCurriculumExcerpt } from '../lib/aiContent.js';

const MAX_TARGET_TOPICS = 20;

const MILVEN_NOTES_SYSTEM = `You are the Milven Notes Generator for Milven Finance School.

Your task is to generate exam-focused study notes from the supplied curriculum extract. The notes must be generated at TOPIC LEVEL, not at full learning module level, unless instructed otherwise.

Milven style: professional, clear, technical, exam-focused, practical and concise.

Never invent curriculum content. If a concept is mentioned in the curriculum but not clearly explained in the extract, flag it under Instructor Review Required instead of inventing unsupported detail.

Return valid JSON only.`;

function buildTopicPrompt(ctx, year) {
	const levelLabel = String(ctx.level || '').replace('LEVEL', 'Level ');
	const lengthGuide = ctx.level === 'LEVEL1' ? '1-2 pages (concise)'
		: ctx.level === 'LEVEL2' ? '2-3 pages'
		: '3-4 pages';
	const losLines = ctx.los.length
		? ctx.los.map(l => `- ${l.ref ? l.ref + ': ' : ''}${l.statement}${l.commandWord ? ` [${l.commandWord}]` : ''}`).join('\n')
		: '(none supplied — flag under Instructor Review Required)';
	const conceptLines = ctx.concepts.length
		? ctx.concepts.map(c => `- ${c.name}${c.losCode ? ` (${c.losCode})` : ''}`).join('\n')
		: '(none found — infer only from supplied material)';
	const formulaContext = ctx.formulas.length
		? ctx.formulas.map(f => `- ${f.name}: ${f.formula}${f.variables ? ` | vars: ${f.variables}` : ''}${f.whenToUse ? ` | use: ${f.whenToUse}` : ''}${f.interpretation ? ` | meaning: ${f.interpretation}` : ''}`).join('\n')
		: '(no Formula Book entries for this topic)';
	const notesContext = ctx.notes.length
		? ctx.notes.map(n => `- ${n.title}${n.overview ? `: ${n.overview}` : ''}`).join('\n')
		: '(no published Milven Notes for this topic)';
	const curriculumSection = ctx.curriculumExcerpt
		? `\n\nCURRICULUM EXTRACT (control source — do NOT reproduce verbatim):\n---\n${ctx.curriculumExcerpt}\n---\n`
		: '\n\nCURRICULUM EXTRACT: (none available for this volume — flag gaps under Instructor Review Required)\n';

	return `You are the Milven Notes Generator for Milven Finance School.

Generate exam-focused study notes for the supplied TOPIC. Use the curriculum extract as the coverage control source. Do not copy curriculum wording. Do not reproduce examples from the curriculum or from third-party tuition providers. Write in original Milven teaching language.

Inputs:
- Programme: CFA
- Exam level: ${levelLabel}
- Volume: ${ctx.volumeName || 'N/A'}
- Topic area: ${ctx.course?.name || 'N/A'}
- Learning module: ${ctx.moduleName || 'N/A'}
- Topic: ${ctx.topicName}
- Candidate level: ${levelLabel}
- Required output length: ${lengthGuide}
- Milven style: professional, clear, technical, exam-focused, practical and concise.
- Year: ${year}

Learning Outcome Statements:
${losLines}

Sub-concepts to cover:
${conceptLines}

Formula Book entries:
${formulaContext}

Completed Milven Notes for reference:
${notesContext}
${curriculumSection}
Core rules:
1. Do not reproduce or copy the curriculum word-for-word.
2. Use the curriculum as the control source, but rewrite in Milven's own teaching voice.
3. Ensure every LOS relevant to the topic is covered.
4. Include all concepts necessary to pass the exam for this topic.
5. Do not over-expand into unnecessary academic detail.
6. Do not omit formulas, definitions, interpretations, assumptions, common traps or exam applications.
7. Where the curriculum contains examples, create fresh Milven examples using different numbers and wording.
8. If a concept is mentioned in the curriculum but not clearly explained in the extract, flag it under Instructor Review Required instead of inventing unsupported detail.
9. Include exam-style questions, but make them original and consistent with the exam format.
10. Output must be candidate-ready.

Required structure (map each section onto the JSON field below):
1. LOS Covered -> losStatements
2. Introduction -> overview
3. Concept Map -> conceptMap
4. Core Concepts -> concepts
5. Key Formulas and Interpretation -> formulaRecap
6. Worked Examples -> workedSolutions (plus inline concept workedExample)
7. Typical Exam Questions -> practiceSet
8. Common Mistakes -> commonMistakes
9. Milven Exam Tips -> examTips
10. Quick Revision Box -> revisionCheck
11. Coverage Quality Check -> coverageCheck

Return ONLY valid JSON:
{
  "notes": [{
    "title": "Topic title",
    "studyTime": "e.g. 1.5 hours",
    "difficulty": "Foundational|Intermediate|Advanced",
    "calculatorUse": "Minimal|Moderate|Heavy",
    "overview": "Introduction — 3-5 sentences on what this topic covers and why it matters.",
    "losStatements": [{"ref": "LOS 1.a", "statement": "full LOS text", "commandWord": "interpret"}],
    "conceptMap": [{"node": "Topic node", "connectsTo": "How it links to the topic/objective", "concepts": ["key idea"]}],
    "concepts": [{
      "sectionNumber": "4.1",
      "title": "Concept title",
      "meaning": "Plain-English explanation (3-5 sentences).",
      "explanation": "Detailed explanation (8-15 sentences) covering theory, relationships, edge cases and exam relevance.",
      "formula": "LaTeX formula or null",
      "formulaVariables": "variable definitions or null",
      "formulaUseCase": "When to use this formula or null",
      "formulaExamTrap": "Common mistake with this formula or null",
      "interpretation": "What the result means (2-4 sentences) or null",
      "workedExample": {"title": "Example title", "given": "Question with all givens", "solution": "Step 1\\nStep 2\\nStep 3", "conclusion": "Final answer and interpretation"},
      "examTip": "Specific exam strategy (2-3 sentences) or null",
      "commonMistake": "What candidates get wrong (2-3 sentences) or null"
    }],
    "formulaRecap": [{"name": "Formula area", "formula": "LaTeX formula", "useCase": "one-line when to use", "interpretation": "what the result means"}],
    "workedSolutions": [{"label": "A", "title": "Short title", "question": "Full question text", "method": "Step 1\\nStep 2\\nStep 3", "interpretation": "What the result means", "trap": "What students might do wrong"}],
    "practiceSet": [{"question": "Full question stem", "options": ["option A", "option B", "option C"], "correctAnswer": "A. answer text with explanation", "explanation": "Detailed explanation", "losRef": "LOS reference"}],
    "commonMistakes": [{"mistake": "Common candidate error", "correction": "How to avoid it"}],
    "examTips": [{"tip": "Milven exam tip"}],
    "revisionCheck": [{"item": "explain the ..."}],
    "coverageCheck": {"status": "PASS|REVISE|INSTRUCTOR REVIEW REQUIRED", "notes": ["coverage note"]}
  }]
}

FORMAT RULES:
${LATEX_PROMPT_SECTION}
- Wrap ALL formulas in \\[...\\] for display math or \\(...\\) for inline.
- Every formula must include a use case and an exam trap.
- ANSWER CONSISTENCY (CRITICAL): "correctAnswer" MUST match the explanation. Distribute correct answers across A/B/C.

QUALITY RULES:
- Cover EVERY LOS and EVERY concept.
- Include original worked examples and original exam-style questions.
- Flag unsupported or ambiguous content under Instructor Review Required.
- No curriculum text or third-party tuition notes copied.

Generate exactly 1 topic note. Return ONLY valid JSON.`;
}

// Programmatic coverage / quality-control validator (always runs).
function coverageValidation(note, ctx) {
	const findings = [];
	const checks = {};
	const norm = (s) => String(s || '').toLowerCase().trim();

	const losRefs = ctx.los.map(l => norm(l.ref)).filter(Boolean);
	const noteLos = Array.isArray(note.losStatements) ? note.losStatements.map(l => norm(l.ref)).filter(Boolean) : [];
	const covered = losRefs.filter(r => noteLos.some(x => x === r || x.includes(r) || r.includes(x)));
	checks.losCoverage = losRefs.length ? Math.round((covered.length / losRefs.length) * 100) : (noteLos.length ? 100 : 0);
	if (!ctx.los.length) findings.push('No Learning Outcome Statements were found for this topic. Generation requires instructor review.');
	else if (covered.length < losRefs.length) findings.push(`LOS coverage incomplete: ${covered.length}/${losRefs.length} LOS appear in the notes.`);

	checks.formulaCount = Array.isArray(note.formulaRecap) ? note.formulaRecap.length : 0;
	if (ctx.formulas.length && checks.formulaCount === 0) findings.push('No formulas captured even though the Formula Book has entries for this topic.');

	checks.conceptCount = Array.isArray(note.concepts) ? note.concepts.length : 0;
	if (checks.conceptCount < 3) findings.push('Fewer than 3 core concepts were generated.');

	const inlineExamples = Array.isArray(note.concepts) ? note.concepts.filter(c => c && c.workedExample).length : 0;
	checks.exampleCount = (Array.isArray(note.workedSolutions) ? note.workedSolutions.length : 0) + inlineExamples;
	if (checks.exampleCount < 1) findings.push('No worked examples were generated.');

	checks.questionCount = Array.isArray(note.practiceSet) ? note.practiceSet.length : 0;
	if (checks.questionCount < 5) findings.push('Fewer than 5 exam-style questions were generated.');

	checks.mistakeCount = Array.isArray(note.commonMistakes) ? note.commonMistakes.length : 0;
	if (checks.mistakeCount < 2) findings.push('Fewer than 2 common mistakes were generated.');

	checks.tipCount = Array.isArray(note.examTips) ? note.examTips.length : 0;
	if (checks.tipCount < 2) findings.push('Fewer than 2 Milven exam tips were generated.');

	// Compression + verbatim-copy detection
	const longStrings = [];
	const strings = [];
	const walk = (v) => {
		if (typeof v === 'string') {
			if (v.length > 800) longStrings.push(v);
			if (v.length > 120) strings.push(v);
		} else if (Array.isArray(v)) v.forEach(walk);
		else if (v && typeof v === 'object') Object.values(v).forEach(walk);
	};
	walk(note);
	checks.overlongBlocks = longStrings.length;
	if (longStrings.length) findings.push(`${longStrings.length} block(s) exceed 800 characters — consider tightening.`);

	if (ctx.curriculumExcerpt) {
		const excerptLower = ctx.curriculumExcerpt.toLowerCase();
		let copied = 0;
		for (const s of strings) {
			if (excerptLower.includes(s.toLowerCase().slice(0, 120))) copied++;
		}
		checks.copiedBlocks = copied;
		if (copied > 0) findings.push(`${copied} block(s) appear to be copied verbatim from the curriculum — paraphrase required.`);
	}

	let status = findings.length ? 'REVISE' : 'PASS';
	if (!ctx.los.length) status = 'INSTRUCTOR REVIEW REQUIRED';
	if (!ctx.curriculumExcerpt && !ctx.notes.length) status = 'INSTRUCTOR REVIEW REQUIRED';
	return { status, findings, checks };
}

export function moduleNotesRouter(prisma, deps = {}) {
	const router = Router();

	// Injectable AI dependencies (defaults preserve production behaviour; tests can override).
	const ai = {
		getAIApiKey: deps.getAIApiKey || getAIApiKey,
		getActiveProvider: deps.getActiveProvider || getActiveProvider,
		getActiveModel: deps.getActiveModel || getActiveModel,
		getDefaultModel: deps.getDefaultModel || getDefaultModel,
		chatCompletion: deps.chatCompletion || chatCompletion,
	};

	const defaultInclude = {
		course: { select: { id: true, name: true, level: true } },
		volume: { select: { id: true, name: true } },
		module: { select: { id: true, name: true } },
		topic: { select: { id: true, name: true } },
	};

	const noteSchema = z.object({
		title: z.string().min(1),
		level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']),
		courseId: z.string().optional().nullable(),
		volumeId: z.string().optional().nullable(),
		moduleId: z.string().optional().nullable(),
		topicId: z.string().optional().nullable(),
		year: z.number().int().optional().default(2026),
		studyTime: z.string().optional().nullable(),
		difficulty: z.string().optional().nullable(),
		calculatorUse: z.string().optional().nullable(),
		overview: z.string().optional().nullable(),
		studyRoadmap: z.any().optional().nullable(),
		losStatements: z.any().optional().nullable(),
		conceptMap: z.any().optional().nullable(),
		concepts: z.any().optional().nullable(),
		moduleSummary: z.string().optional().nullable(),
		formulaRecap: z.any().optional().nullable(),
		practiceSet: z.any().optional().nullable(),
		workedSolutions: z.any().optional().nullable(),
		commonMistakes: z.any().optional().nullable(),
		examTips: z.any().optional().nullable(),
		coverageCheck: z.any().optional().nullable(),
		revisionCheck: z.any().optional().nullable(),
		order: z.number().int().optional().default(0),
		status: z.enum(['DRAFT', 'PUBLISHED']).optional().default('DRAFT'),
	});

	// ─── LIST ─────────────────────────────────────────────────
	router.get('/', async (req, res) => {
		try {
			const { courseId, volumeId, moduleId, topicId, level, status, year, search, page, limit } = req.query;
			const where = {};
			if (courseId) where.courseId = courseId;
			if (volumeId) where.volumeId = volumeId;
			if (moduleId) where.moduleId = moduleId;
			if (topicId) where.topicId = topicId;
			if (level) where.level = level;
			if (status) where.status = status;
			if (year) where.year = Number(year);
			if (search) {
				where.OR = [
					{ title: { contains: search, mode: 'insensitive' } },
					{ overview: { contains: search, mode: 'insensitive' } },
				];
			}

			const pageNum = Math.max(1, Number(page) || 1);
			const pageSize = Math.min(200, Math.max(1, Number(limit) || 25));
			const skip = (pageNum - 1) * pageSize;

			const [notes, total] = await Promise.all([
				prisma.moduleNote.findMany({
					where,
					include: defaultInclude,
					orderBy: [{ createdAt: 'desc' }, { order: 'asc' }],
					skip,
					take: pageSize,
				}),
				prisma.moduleNote.count({ where }),
			]);

			return res.json({ notes, total, page: pageNum, limit: pageSize });
		} catch (err) {
			console.error('[moduleNotes.list]', err);
			return res.status(500).json({ error: 'Failed to list module notes' });
		}
	});

	// ─── GET ONE ──────────────────────────────────────────────
	router.get('/:id', async (req, res) => {
		try {
			const note = await prisma.moduleNote.findUnique({
				where: { id: req.params.id },
				include: defaultInclude,
			});
			if (!note) return res.status(404).json({ error: 'Module note not found' });
			return res.json({ note });
		} catch (err) {
			console.error('[moduleNotes.get]', err);
			return res.status(500).json({ error: 'Failed to fetch module note' });
		}
	});

	// ─── CREATE (Admin only) ─────────────────────────────────
	router.post('/', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const data = noteSchema.parse(req.body);
			const note = await prisma.moduleNote.create({ data, include: defaultInclude });
			return res.status(201).json({ note });
		} catch (err) {
			if (err?.name === 'ZodError') return res.status(400).json({ error: 'Validation failed', details: err.errors });
			console.error('[moduleNotes.create]', err);
			return res.status(500).json({ error: 'Failed to create module note' });
		}
	});

	// ─── UPDATE (Admin only) ─────────────────────────────────
	router.put('/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const data = noteSchema.partial().parse(req.body);
			const note = await prisma.moduleNote.update({ where: { id: req.params.id }, data, include: defaultInclude });
			return res.json({ note });
		} catch (err) {
			if (err?.name === 'ZodError') return res.status(400).json({ error: 'Validation failed', details: err.errors });
			if (err?.code === 'P2025') return res.status(404).json({ error: 'Module note not found' });
			console.error('[moduleNotes.update]', err);
			return res.status(500).json({ error: 'Failed to update module note' });
		}
	});

	// ─── DELETE (Admin only) ─────────────────────────────────
	router.delete('/:id', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			await prisma.moduleNote.delete({ where: { id: req.params.id } });
			return res.json({ success: true });
		} catch (err) {
			if (err?.code === 'P2025') return res.status(404).json({ error: 'Module note not found' });
			console.error('[moduleNotes.delete]', err);
			return res.status(500).json({ error: 'Failed to delete module note' });
		}
	});

	// ─── AI GENERATE PREVIEW (Admin only, topic-level, SSE) ──
	router.post('/generate-ai/preview', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			courseId: z.string(),
			volumeId: z.string().optional().nullable(),
			moduleId: z.string().optional().nullable(),
			topicId: z.string().optional().nullable(),
			level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']),
			year: z.coerce.number().int().optional().default(2026),
			count: z.coerce.number().int().min(1).max(20).optional().nullable(),
			provider: z.string().optional().nullable(),
			model: z.string().optional().nullable(),
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });

		const { courseId, volumeId, moduleId, topicId, level, year } = parse.data;
		const requestedProvider = parse.data.provider || null;
		const requestedModel = parse.data.model || null;
		const count = parse.data.count || null;

		// Provider: requested (if valid) → otherwise active provider.
		const activeProvider = await ai.getActiveProvider(prisma);
		const aiProvider = (requestedProvider && AI_PROVIDERS[requestedProvider]) ? requestedProvider : activeProvider;
		// Model: requested → active model → provider default.
		const aiModel = requestedModel || await ai.getActiveModel(prisma) || ai.getDefaultModel(aiProvider);
		const apiKey = await ai.getAIApiKey(prisma, aiProvider);
		if (!apiKey) {
			const label = AI_PROVIDERS[aiProvider]?.label || aiProvider;
			return res.status(400).json({ error: `No API key configured for ${label}. Set it in .env or in Admin settings.` });
		}

		// Build the source-of-truth context for a single Topic.
		async function buildTopicContext(topic, course) {
			const [concepts, formulas, notes] = await Promise.all([
				prisma.concept.findMany({
					where: { topicId: topic.id },
					select: { name: true, losCode: true, commandWord: true, learningOutcomeStatement: true },
					orderBy: [{ order: 'asc' }, { name: 'asc' }],
				}),
				prisma.formula.findMany({
					where: { OR: [{ topicId: topic.id }, { moduleId: topic.moduleId }] },
					select: { name: true, formula: true, variables: true, interpretation: true, whenToUse: true, watchOut: true, losTag: true },
					orderBy: [{ order: 'asc' }],
					take: 40,
				}),
				prisma.moduleNote.findMany({
					where: { topicId: topic.id, status: 'PUBLISHED' },
					select: { title: true, overview: true, moduleSummary: true },
					take: 10,
				}),
			]);

			// Curriculum (control source) scoped to the topic's volume.
			let curriculumExcerpt = '';
			try {
				const currDoc = await prisma.curriculumDocument.findUnique({
					where: { courseId_volumeId: { courseId: topic.courseId || course.id, volumeId: topic.module.volumeId } },
					select: { extractedText: true },
				});
				if (currDoc?.extractedText) {
					curriculumExcerpt = extractCurriculumExcerpt(currDoc.extractedText, [topic.name, topic.module.name, ...concepts.map(c => c.name)]);
				}
			} catch { /* no curriculum document for this volume */ }

			// LOS: topic fields + concept fields + published note LOS.
			const los = [];
			const seen = new Set();
			const pushLos = (ref, statement, commandWord) => {
				if (!statement) return;
				const key = `${ref || ''}|${statement}`;
				if (seen.has(key)) return;
				seen.add(key);
				los.push({ ref: ref || '', statement, commandWord: commandWord || '' });
			};
			pushLos(topic.losCode, topic.learningOutcomeStatement, topic.commandWord);
			for (const c of concepts) pushLos(c.losCode, c.learningOutcomeStatement, c.commandWord);
			for (const n of notes) {
				if (Array.isArray(n.losStatements)) {
					for (const l of n.losStatements) pushLos(l?.ref || l?.losCode, l?.statement || l?.learningOutcomeStatement, l?.commandWord);
				}
			}

			return {
				topic,
				course,
				level,
				year,
				topicName: topic.name,
				moduleName: topic.module.name,
				volumeName: topic.module.volume?.name || null,
				concepts,
				formulas,
				notes,
				curriculumExcerpt,
				los,
			};
		}

		// ── SSE: switch to streaming before the long AI calls ────────────────
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'X-Accel-Buffering': 'no',
			'Connection': 'keep-alive',
		});
		const sseHeartbeat = setInterval(() => { try { res.write(':heartbeat\n\n'); } catch {} }, 15000);
		const sseSend = (event, payload) => { try { res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); } catch {} };
		const sseEnd = () => { clearInterval(sseHeartbeat); try { res.end(); } catch {} };

		try {
			const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, level: true } });
			if (!course) { sseSend('error', { error: 'Course not found' }); return sseEnd(); }

			// Resolve target topics (topic-level generation).
			let targetTopics = [];
			const topicSelect = {
				id: true, name: true, losCode: true, commandWord: true, learningOutcomeStatement: true,
				courseId: true, moduleId: true,
				module: { select: { id: true, name: true, volumeId: true, volume: { select: { id: true, name: true } } } },
			};
			if (topicId) {
				const t = await prisma.topic.findUnique({ where: { id: topicId }, select: topicSelect });
				if (!t) { sseSend('error', { error: 'Topic not found' }); return sseEnd(); }
				targetTopics = [t];
			} else {
				const where = { courseId };
				if (moduleId) where.moduleId = moduleId;
				else if (volumeId) where.module = { volumeId };
				targetTopics = await prisma.topic.findMany({ where, select: topicSelect, orderBy: [{ order: 'asc' }, { name: 'asc' }], take: MAX_TARGET_TOPICS });
				if (!targetTopics.length) {
					sseSend('error', { error: volumeId ? 'No topics found in the selected volume.' : (moduleId ? 'No topics found in the selected module.' : 'No topics found for the selected course.') });
					return sseEnd();
				}
				if (count) targetTopics = targetTopics.slice(0, Math.min(count, MAX_TARGET_TOPICS));
			}

			const items = [];
			const validationSummaries = [];

			for (const topic of targetTopics) {
				const ctx = await buildTopicContext(topic, course);
				const prompt = buildTopicPrompt(ctx, year);

				let item = null;
				try {
					const aiResult = await ai.chatCompletion({
						apiKey, provider: aiProvider, model: aiModel,
						messages: [
							{ role: 'system', content: `${MILVEN_NOTES_SYSTEM}\n\n${LATEX_SYSTEM_RULES}` },
							{ role: 'user', content: prompt },
						],
						temperature: 0.7,
						maxTokens: 16384,
						jsonMode: true,
						timeout: 180_000,
					});
					const parsed = JSON.parse(stripJsonFences(aiResult.content || '{}'));
					const noteItems = Array.isArray(parsed.notes) ? parsed.notes
						: (Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed) ? parsed : [parsed]));
					item = noteItems.find(Boolean) || null;
				} catch (genErr) {
					const msg = genErr?.error?.message || genErr?.message || 'AI generation failed';
					console.error(`[moduleNotes.generate-ai.preview] topic ${topic.id} failed:`, msg);
					items.push({
						title: topic.name, topicId: topic.id, moduleId: topic.moduleId, volumeId: topic.module.volumeId, courseId: topic.courseId || courseId, level, year,
						topicName: topic.name, moduleName: topic.module.name, volumeName: topic.module.volume?.name || null, courseName: course.name,
						_error: msg,
						coverageCheck: { status: 'INSTRUCTOR REVIEW REQUIRED', findings: [msg], checks: {} },
					});
					validationSummaries.push({ topicId: topic.id, topicName: topic.name, status: 'INSTRUCTOR REVIEW REQUIRED', findings: [msg] });
					continue;
				}

				if (!item) {
					const msg = 'AI returned no note for this topic.';
					items.push({
						title: topic.name, topicId: topic.id, moduleId: topic.moduleId, volumeId: topic.module.volumeId, courseId: topic.courseId || courseId, level, year,
						topicName: topic.name, moduleName: topic.module.name, volumeName: topic.module.volume?.name || null, courseName: course.name,
						_error: msg,
						coverageCheck: { status: 'INSTRUCTOR REVIEW REQUIRED', findings: [msg], checks: {} },
					});
					validationSummaries.push({ topicId: topic.id, topicName: topic.name, status: 'INSTRUCTOR REVIEW REQUIRED', findings: [msg] });
					continue;
				}

				// Attach per-topic linkage so bulk generation maps each note to its own topic.
				item.topicId = topic.id;
				item.moduleId = topic.moduleId;
				item.volumeId = topic.module.volumeId;
				item.courseId = topic.courseId || courseId;
				item.level = level;
				item.year = year;
				item.topicName = topic.name;
				item.moduleName = topic.module.name;
				item.volumeName = topic.module.volume?.name || null;
				item.courseName = course.name;
				if (!item.title) item.title = topic.name;

				// Answer-consistency auto-correction for MCQ practice questions.
				const ps = Array.isArray(item.practiceSet) ? item.practiceSet : [];
				for (const q of ps) {
					if (!q.correctAnswer || !q.explanation) continue;
					const ca = String(q.correctAnswer).toUpperCase().trim();
					const exp = String(q.explanation);
					const letters = ['A', 'B', 'C'];
					const found = [];
					const patterns = [
						new RegExp('correct\\s+answer\\s+is\\s+([A-C])', 'i'),
						new RegExp('option\\s+([A-C])\\s+is\\s+(correct|right|preferred)', 'i'),
						new RegExp('([A-C])\\s+is\\s+(correct|right|preferred)', 'i'),
						new RegExp('([A-C])\\s+has\\s+higher', 'i'),
						new RegExp('therefore,?\\s+([A-C])', 'i'),
						new RegExp('([A-C])\\s+should\\s+be\\s+(chosen|selected|preferred)', 'i'),
						new RegExp('choose\\s+([A-C])', 'i'),
						new RegExp('select\\s+([A-C])', 'i'),
					];
					for (const pat of patterns) {
						const m = exp.match(pat);
						if (m) found.push(m[1].toUpperCase());
					}
					if (found.length > 0) {
						const counts = {};
						for (const l of found) counts[l] = (counts[l] || 0) + 1;
						let best = ca;
						let bestCount = counts[ca] || 0;
						for (const l of letters) {
							if ((counts[l] || 0) > bestCount) { best = l; bestCount = counts[l]; }
						}
						if (best !== ca) q.correctAnswer = best;
					}
				}

				// Coverage validation (programmatic).
				const coverage = coverageValidation(item, ctx);
				item.coverageCheck = { status: coverage.status, findings: coverage.findings, checks: coverage.checks };

				items.push(item);
				validationSummaries.push({ topicId: topic.id, topicName: topic.name, status: coverage.status, findings: coverage.findings });
			}

			if (!items.length) { sseSend('error', { error: 'AI returned no topic notes' }); return sseEnd(); }

			sseSend('result', {
				generated: { items },
				meta: { courseId, volumeId, moduleId, topicId, level, year, provider: aiProvider, model: aiModel, validation: validationSummaries },
			});
			return sseEnd();
		} catch (err) {
			const msg = err?.error?.message || err?.message || 'AI request failed';
			console.error('[moduleNotes.generate-ai.preview]', msg);
			sseSend('error', { error: msg });
			return sseEnd();
		}
	});

	// ─── AI GENERATE ACCEPT (Admin only) ─────────────────────
	router.post('/generate-ai/accept', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		try {
			const { generated, meta, selectedIndices } = req.body;
			if (!generated?.items || !Array.isArray(generated.items)) return res.status(400).json({ error: 'Missing generated items' });
			if (!Array.isArray(selectedIndices) || selectedIndices.length === 0) return res.status(400).json({ error: 'No notes selected' });
			const { courseId, volumeId, moduleId, topicId, level, year } = meta || {};

			const created = [];
			const errors = [];
			const skipped = [];
			for (const idx of selectedIndices) {
				const item = generated.items[idx];
				if (!item) { errors.push(`Index ${idx}: item not found`); continue; }
				if (item._error && !item.overview && !item.concepts && !item.formulaRecap) {
					skipped.push({ index: idx, reason: item._error });
					continue;
				}
				const itemCourseId = item.courseId || courseId;
				const itemLevel = item.level || level;
				if (!itemCourseId || !itemLevel) { errors.push(`Index ${idx}: missing course/level`); continue; }
				try {
					const note = await prisma.moduleNote.create({
						data: {
							title: String(item.title || `Topic Note ${idx + 1}`).slice(0, 255),
							level: itemLevel,
							courseId: itemCourseId,
							volumeId: item.volumeId || volumeId || null,
							moduleId: item.moduleId || moduleId || null,
							topicId: item.topicId || topicId || null,
							year: item.year || year || 2026,
							studyTime: item.studyTime || null,
							difficulty: item.difficulty || null,
							calculatorUse: item.calculatorUse || null,
							overview: item.overview || null,
							studyRoadmap: item.studyRoadmap || null,
							losStatements: item.losStatements || null,
							conceptMap: item.conceptMap || null,
							concepts: item.concepts || null,
							moduleSummary: item.moduleSummary || null,
							formulaRecap: item.formulaRecap || null,
							practiceSet: item.practiceSet || null,
							workedSolutions: item.workedSolutions || null,
							commonMistakes: item.commonMistakes || null,
							examTips: item.examTips || null,
							coverageCheck: item.coverageCheck || null,
							revisionCheck: item.revisionCheck || null,
							order: idx + 1,
							status: 'DRAFT',
						},
						include: defaultInclude,
					});
					created.push(note);
				} catch (saveErr) {
					const msg = saveErr?.message || String(saveErr);
					console.error(`[moduleNotes.generate-ai.accept] Failed to save note ${idx}:`, msg);
					errors.push(`Index ${idx}: ${msg}`);
				}
			}
			if (created.length === 0 && errors.length > 0) {
				return res.status(500).json({ created: 0, error: `Failed to save notes: ${errors[0]}`, errors });
			}
			return res.status(201).json({ created: created.length, skipped, notes: created, errors });
		} catch (err) {
			console.error('[moduleNotes.generate-ai.accept]', err);
			return res.status(500).json({ error: 'Failed to accept module notes' });
		}
	});

	return router;
}
