import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { LATEX_SYSTEM_RULES, LATEX_PROMPT_SECTION } from '../lib/openai.js';
import { getAIApiKey, getActiveProvider, getActiveModel, getDefaultModel, chatCompletion } from '../lib/aiProvider.js';

export function moduleNotesRouter(prisma) {
	const router = Router();

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
		concepts: z.any().optional().nullable(),
		moduleSummary: z.string().optional().nullable(),
		formulaRecap: z.any().optional().nullable(),
		practiceSet: z.any().optional().nullable(),
		workedSolutions: z.any().optional().nullable(),
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

	// ─── AI GENERATE PREVIEW (Admin only) ────────────────────
	router.post('/generate-ai/preview', requireAuth(), requireRole('ADMIN'), async (req, res) => {
		const schema = z.object({
			courseId: z.string(),
			volumeId: z.string().optional().nullable(),
			moduleId: z.string().optional().nullable(),
			topicId: z.string().optional().nullable(),
			level: z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3']),
			year: z.coerce.number().int().optional().default(2026),
			count: z.coerce.number().int().min(1).max(20).optional().nullable(),
		});
		const parse = schema.safeParse(req.body);
		if (!parse.success) return res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });

		const { courseId, volumeId, moduleId, topicId, level, year } = parse.data;
		let count = parse.data.count || null;

		const aiProvider = await getActiveProvider(prisma);
		const aiModel = await getActiveModel(prisma) || getDefaultModel(aiProvider);
		const apiKey = await getAIApiKey(prisma, aiProvider);
		if (!apiKey) return res.status(400).json({ error: `AI API key not configured for ${aiProvider}.` });

		const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true } });
		if (!course) return res.status(400).json({ error: 'Course not found' });

		let volumeName = null, moduleName = null, topicName = null;
		let topicNames = [];
		if (volumeId) { const v = await prisma.volume.findUnique({ where: { id: volumeId }, select: { name: true } }); if (v) volumeName = v.name; }
		if (moduleId) { const m = await prisma.module.findUnique({ where: { id: moduleId }, select: { name: true } }); if (m) moduleName = m.name; }
		if (topicId) { const t = await prisma.topic.findUnique({ where: { id: topicId }, select: { name: true } }); if (t) topicName = t.name; topicNames = [topicName]; }
		else {
			const topicWhere = { courseId };
			if (moduleId) topicWhere.moduleId = moduleId;
			else if (volumeId) topicWhere.module = { volumeId };
			const resolvedTopics = await prisma.topic.findMany({ where: topicWhere, select: { name: true }, orderBy: { order: 'asc' }, take: 50 });
			topicNames = resolvedTopics.map(t => t.name);
		}

		// Auto-detect count: if moduleId given, 1 note for that module; if volumeId, count modules in volume; else count modules in course
		if (!count) {
			if (moduleId) {
				count = 1;
			} else {
				const modWhere = { courseId };
				if (volumeId) modWhere.volumeId = volumeId;
				const modCount = await prisma.module.count({ where: modWhere });
				count = Math.max(1, Math.min(20, modCount));
			}
		}

		let curriculumExcerpt = '';
		if (volumeId) {
			const currDoc = await prisma.curriculumDocument.findUnique({
				where: { courseId_volumeId: { courseId, volumeId } },
				select: { extractedText: true }
			});
			if (currDoc?.extractedText) {
				const text = currDoc.extractedText;
				if (text.length <= 15000) {
					curriculumExcerpt = text;
				} else {
					// Topic-aware extraction: find windows mentioning the topic/module
					const keywords = [topicName, moduleName].filter(Boolean)
						.flatMap(n => n.split(/[\s,;:()\-\/]+/).filter(w => w.length > 3))
						.map(w => w.toLowerCase());
					if (keywords.length === 0) {
						curriculumExcerpt = text.substring(0, 15000) + '\n... [truncated]';
					} else {
						const WINDOW = 2500, STEP = 500;
						const windows = [];
						for (let i = 0; i < text.length; i += STEP) {
							const chunk = text.substring(i, i + WINDOW).toLowerCase();
							let score = keywords.reduce((s, kw) => { let c = 0, idx = 0; while ((idx = chunk.indexOf(kw, idx)) !== -1) { c++; idx += kw.length; } return s + c; }, 0);
							windows.push({ start: i, score });
						}
						windows.sort((a, b) => b.score - a.score);
						const ranges = [];
						let total = 0;
						for (const w of windows) {
							if (total >= 15000 || w.score === 0) break;
							const end = Math.min(w.start + WINDOW, text.length);
							const budget = Math.min(end - w.start, 15000 - total);
							ranges.push({ start: w.start, end: w.start + budget });
							total += budget;
						}
						ranges.sort((a, b) => a.start - b.start);
						const merged = [];
						for (const r of ranges) {
							if (merged.length > 0 && r.start <= merged[merged.length - 1].end + 300) merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
							else merged.push({ ...r });
						}
						curriculumExcerpt = merged.map((r, i) => {
							const t = text.substring(r.start, r.end).trim();
							const pm = text.substring(0, r.start).match(/\[PAGE (\d+)\]/g);
							const pg = pm ? parseInt(pm[pm.length - 1].match(/\d+/)[0], 10) : null;
							const prefix = pg ? `[... content from page ${pg} ...]\n` : (r.start > 0 ? '[...]\n' : '');
							return prefix + t + (i < merged.length - 1 ? '\n[...]\n' : '');
						}).join('\n') + (merged[merged.length - 1]?.end < text.length ? '\n... [additional content omitted]' : '');
					}
				}
			}
		}

		const levelLabel = level.replace('LEVEL', 'Level ');
		const hierarchyContext = [
			`Course: ${course.name}`, `CFA Level: ${levelLabel}`,
			volumeName ? `Volume: ${volumeName}` : null,
			moduleName ? `Learning Module: ${moduleName}` : null,
			topicName ? `Topic: ${topicName}` : null,
		].filter(Boolean).join('\n');

		const curriculumSection = curriculumExcerpt
			? `\n\nCURRICULUM REFERENCE MATERIAL (use this as the primary source — reference exact LOS, formulas, and page numbers from the document):\n---\n${curriculumExcerpt}\n---\n`
			: '';

		const topicContext = topicNames.length > 0 ? `\nTopics to cover: ${topicNames.join(', ')}` : '';

		const prompt = `You are the Milven Notes Generator for Milven Finance School.

Generate exam-ready study notes for the supplied learning module. Use the official curriculum extract only as the coverage control source. Do not copy the curriculum wording. Do not reproduce examples from the curriculum or from tuition providers. Write in original Milven teaching language.

Inputs:
- Programme: CFA
- Exam level: ${levelLabel}
- Topic area: ${course.name}
- Volume: ${volumeName || 'N/A'}
- Learning module: ${moduleName || 'N/A'}
- Learning Outcome Statements: ${topicNames.join(', ') || 'All in module'}
- Year: ${year}
${curriculumSection}

--- OUTPUT STRUCTURE ---

Return a JSON object: { "notes": [ ONE note object ] }

{
  "notes": [{
    "title": "Learning Module title (e.g. Rates and Returns)",
    "studyTime": "e.g. 3 hours",
    "difficulty": "Foundational|Intermediate|Advanced",
    "calculatorUse": "Minimal|Moderate|Heavy",
    "overview": "string — 3-5 sentences on what this module covers and why it matters",
    "moduleSummary": "string — bullet-point list of what this module must help you do (skills)",
    "studyRoadmap": [array],
    "losStatements": [array],
    "concepts": [array — 10-20 items, THIS IS THE MAIN BODY],
    "formulaRecap": [array — Formula Bank],
    "practiceSet": [array — 10 Exam-Style Questions],
    "workedSolutions": [array — 4-6 Worked Examples],
    "revisionCheck": [array — Final Exam Checklist]
  }]
}

--- FIELD SPECIFICATIONS ---

1. "overview": 3-5 sentences explaining what this module is about, why it matters for the exam, and how it connects to other topics.

2. "moduleSummary": A bullet-point list (newline-separated) of what this module must help the candidate do. Example:
   "• Interpret an interest rate as a required return, a discount rate and an opportunity cost.\\n• Break down an interest rate into the real risk-free rate and risk premiums.\\n• Calculate and interpret holding period returns and average returns."

3. "studyRoadmap": 5-8 objects forming a logical study sequence:
   { "step": "1", "focus": "Interest rate meaning", "whyItMatters": "Explains the economic role of discount rates and required returns." }
   The last item should be a "Simple decision logic" entry listing when to use each formula/method.

4. "losStatements": ALL Learning Outcome Statements:
   { "ref": "LOS 1", "statement": "full LOS text", "commandWord": "calculate|interpret|compare|etc" }

5. "concepts": 10-20 topic-by-topic notes — THIS IS THE MAIN BODY.
   EVERY topic and sub-topic in the module gets its own entry with numbered section titles.
   Each object:
   {
     "sectionNumber": "3.1",
     "title": "What an Interest Rate Means",
     "meaning": "Plain-English explanation (3-5 sentences) of the concept.",
     "explanation": "DETAILED explanation (8-15 sentences). Cover theory, relationships, edge cases, exam relevance, practical application. Use bold key terms inline.",
     "formula": "LaTeX formula string or null",
     "formulaVariables": "variable definitions (semicolons or newlines) or null",
     "formulaUseCase": "When to use this formula (1-2 sentences) or null",
     "formulaExamTrap": "Common mistake with this formula (1-2 sentences) or null",
     "interpretation": "What the result means (2-4 sentences) or null",
     "workedExample": { "title": "Example title", "given": "Question text with all givens", "solution": "Step 1\\nStep 2\\nStep 3 (each step on new line)", "conclusion": "Final answer and interpretation" } OR null,
     "examTip": "Specific exam strategy (2-3 sentences) or null",
     "commonMistake": "What candidates get wrong (2-3 sentences) or null"
   }

   IMPORTANT: For EVERY formula in a concept, fill formulaUseCase and formulaExamTrap. These render as a table:
   | Formula | [the formula] |
   | Use when | [formulaUseCase] |
   | Exam trap | [formulaExamTrap] |

6. "formulaRecap": Formula Bank — EVERY formula from the module (8-20 items):
   { "name": "formula area name", "formula": "LaTeX formula", "useCase": "one-line description of when to use" }

7. "practiceSet": 10 exam-style MCQ questions. MUST include "options" array:
   {
     "question": "Full question stem text",
     "options": ["option A text", "option B text", "option C text"],
     "correctAnswer": "A. [answer text with explanation]",
     "explanation": "Detailed explanation of why this is correct",
     "losRef": "LOS reference"
   }

8. "workedSolutions": 4-6 detailed Worked Examples (lettered A-F):
   { "label": "A", "title": "Short title (e.g. Interest Rate Premiums)", "question": "Full question text", "method": "Step 1\\nStep 2\\nStep 3 (newline-separated steps)", "interpretation": "What the result means", "trap": "What students might do wrong" }

9. "revisionCheck": 10-15 Final Exam Checklist items:
   { "item": "explain the three meanings of an interest rate" }
   (Each item completes the sentence "Can I ___?")

--- FORMAT REQUIREMENTS ---
${LATEX_PROMPT_SECTION}
- Wrap ALL formulas in \\[...\\] for display math or \\(...\\) for inline.
- Every formula must include a "Use when" and "Exam trap".
- PRESERVE exact notation from the curriculum but convert to valid LaTeX.

--- QUALITY RULES ---
- Cover EVERY LOS.
- Cover EVERY topic and concept in the learning module.
- Keep the structure easy to follow.
- Include original examples and original exam-style questions.
- Explain formulas, variables, use cases and traps.
- Flag gaps as "Instructor Review Required" if the source extract is incomplete.
- No curriculum text or third-party tuition notes copied.
- The notes must be sufficient for a candidate to study, practise and revise the learning module.
- ANSWER CONSISTENCY (CRITICAL): The "correctAnswer" MUST match the explanation. If your solution calculates Portfolio B is better, correctAnswer MUST reference B, NOT A. Double-check every question. Never default to "A".
- Make sure content is optimised so generation completes within token limits without timeout.

Generate exactly 1 module note. Return ONLY valid JSON.`;

		// ── SSE: switch to streaming before the long OpenAI call ─────────────────
		// Nginx / DigitalOcean / cloud proxies kill idle TCP connections after ~60 s.
		// SSE heartbeats every 15 s keep the pipe alive.
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
			// Generate exactly 1 note per preview request to avoid timeout
			const aiResult = await chatCompletion({
				apiKey, provider: aiProvider, model: aiModel,
				messages: [
					{ role: 'system', content: `You are the Milven Notes Generator for Milven Finance School. You produce premium, exam-ready study notes in the Milven Notes format. Return valid JSON only. Generate extremely detailed, comprehensive content — each note must be 10-15 printed pages worth of material. Every text field must be multiple sentences. The concepts array must have 10-20 items covering every topic and sub-topic. Write full original content — do NOT copy curriculum wording or third-party tuition materials.\n\n${LATEX_SYSTEM_RULES}` },
					{ role: 'user', content: prompt }
				],
				temperature: 0.7,
				maxTokens: 16384,
				jsonMode: true,
				timeout: 180_000,
			});

			const raw = aiResult.content || '{}';
			let items = [];
			try {
				const parsed = JSON.parse(raw);
				items = Array.isArray(parsed.notes) ? parsed.notes : (Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed) ? parsed : [parsed]));
			} catch {
				sseSend('error', { error: 'AI returned invalid JSON' });
				return sseEnd();
			}
			if (!items.length) {
				sseSend('error', { error: 'AI returned no module notes' });
				return sseEnd();
			}

			// ── Answer consistency validation for exam-style questions ─────────
			for (const note of items) {
				const ps = Array.isArray(note.practiceSet) ? note.practiceSet : [];
				for (const q of ps) {
					if (!q.correctAnswer || !q.explanation) continue;
					const ca = String(q.correctAnswer).toUpperCase().trim();
					const exp = String(q.explanation);
					const found = [];
					const letters = ['A', 'B', 'C'];
					// Scan explanation for which letter is explicitly called correct
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
						// Pick the most common letter mentioned as correct
						const counts = {};
						for (const l of found) { counts[l] = (counts[l] || 0) + 1; }
						let best = ca;
						let bestCount = counts[ca] || 0;
						for (const l of letters) {
							if ((counts[l] || 0) > bestCount) { best = l; bestCount = counts[l]; }
						}
						if (best !== ca) {
							console.warn(`[moduleNotes.ai.preview] Auto-corrected answer: ${ca} → ${best} for: ${(q.question || '').slice(0, 80)}...`);
							q.correctAnswer = best;
						}
					}
					// Numeric cross-check: extract numbers from explanation and option text
					const optNums = {};
					for (const l of letters) {
						const optRegex = new RegExp(`${l}\\.\\s*[^\\n]*?(\\d+\\.?\\d*%?)`, 'i');
						const m = q.question ? q.question.match(optRegex) : null;
						if (m) optNums[l] = parseFloat(m[1].replace(/%/g, ''));
					}
					if (Object.keys(optNums).length >= 2) {
						const expNums = [...exp.matchAll(/-?\d+\.?\d*/g)].map(m => parseFloat(m[0])).filter(n => !isNaN(n));
						const numCorrect = optNums[ca];
						if (numCorrect != null && expNums.length > 0) {
							const foundNum = expNums.some(n => Math.abs(n - numCorrect) < 0.01);
							if (!foundNum) {
								for (const l of letters) {
									if (l === ca) continue;
									const n2 = optNums[l];
									if (n2 != null && expNums.some(n => Math.abs(n - n2) < 0.01)) {
										console.warn(`[moduleNotes.ai.preview] Numeric auto-correct: ${ca} → ${l} for: ${(q.question || '').slice(0, 80)}...`);
										q.correctAnswer = l;
										break;
									}
								}
							}
						}
					}
				}
			}

			sseSend('result', {
				generated: { items },
				meta: { courseId, volumeId, moduleId, topicId, level, year }
			});
			return sseEnd();
		} catch (err) {
			const msg = err?.error?.message || err?.message || 'OpenAI request failed';
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
			if (!courseId || !level) return res.status(400).json({ error: 'Missing meta (courseId, level)' });

			const created = [];
			const errors = [];
			for (const idx of selectedIndices) {
				const item = generated.items[idx];
				if (!item) { errors.push(`Index ${idx}: item not found in generated.items`); continue; }
				try {
					const note = await prisma.moduleNote.create({
						data: {
							title: String(item.title || `Module Note ${idx + 1}`).slice(0, 255),
							level, courseId, volumeId: volumeId || null, moduleId: moduleId || null, topicId: topicId || null,
							year: year || 2026,
							studyTime: item.studyTime || null,
							difficulty: item.difficulty || null,
							calculatorUse: item.calculatorUse || null,
							overview: item.overview || null,
							studyRoadmap: item.studyRoadmap || null,
							losStatements: item.losStatements || null,
							concepts: item.concepts || null,
							moduleSummary: item.moduleSummary || null,
							formulaRecap: item.formulaRecap || null,
							practiceSet: item.practiceSet || null,
							workedSolutions: item.workedSolutions || null,
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
			return res.status(201).json({ created: created.length, notes: created });
		} catch (err) {
			console.error('[moduleNotes.generate-ai.accept]', err);
			return res.status(500).json({ error: 'Failed to accept module notes' });
		}
	});

	return router;
}
