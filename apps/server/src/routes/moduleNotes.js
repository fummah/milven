import { Router } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getOpenAIApiKey, LATEX_SYSTEM_RULES, LATEX_PROMPT_SECTION } from '../lib/openai.js';

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

		const apiKey = await getOpenAIApiKey(prisma);
		if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured.' });

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

		const prompt = `You are the Milven Notes Generator for Milven Finance School. Generate one comprehensive CFA Learning Module Note in the Milven Notes format below.

This is a PREMIUM study document — 10 to 15 printed pages. Do NOT summarize. Write FULL explanations. Do NOT copy curriculum wording or tuition-provider examples. Write in original Milven teaching language.

${hierarchyContext}
Year: ${year}${topicContext}
${curriculumSection}

--- OUTPUT STRUCTURE ---

Return a JSON object with a "notes" array containing ONE note object with these fields:

{
  "notes": [
    {
      "title": "Learning Module title",
      "studyTime": "string (e.g. 3 hours)",
      "difficulty": "Foundational|Intermediate|Advanced",
      "calculatorUse": "Minimal|Moderate|Heavy",
      "overview": "Module Overview and Learning Outcomes (see below)",
      "studyRoadmap": [ ... Study Roadmap array (see below) ... ],
      "losStatements": [ ... LOS array (see below) ... ],
      "concepts": [ ... Topic-by-topic notes array (see below) ... ],
      "moduleSummary": "Module Summary paragraph",
      "formulaRecap": [ ... Formula Bank array (see below) ... ],
      "practiceSet": [ ... Exam-Style Questions array (see below) ... ],
      "workedSolutions": [ ... Worked Examples array (see below) ... ],
      "revisionCheck": [ ... Final Exam Checklist array (see below) ... ]
    }
  ]
}

--- FIELD SPECIFICATIONS ---

1. "overview": Comprehensive string covering:
   - What this learning module is about (2-3 sentences)
   - What the candidate must be able to do after studying (list the key skills)
   - How this module connects to other topics in the curriculum (1-2 sentences)
   - Include a sub-section "LOS Covered" listing every LOS reference and statement

2. "studyRoadmap": Array of objects, each with:
   { "step": "number or short title", "focus": "what to study", "whyItMatters": "why this is important in the exam", "examTip": "specific exam advice for this step" }
   Generate 5-8 steps that form a logical study sequence through the module.
   Include a "Simple decision logic" section as the last item that shows when to use each formula/method.

3. "losStatements": Array of ALL Learning Outcome Statements:
   { "ref": "LOS 1", "statement": "full LOS text", "commandWord": "calculate|interpret|compare|etc" }

4. "concepts": Array of topic-by-topic notes — THIS IS THE MAIN BODY (10-20 items).
   EVERY topic and sub-topic in the module gets its own entry.
   Each concept object:
   {
     "title": "Topic heading (e.g. 3. Interest Rates and Time Value of Money)",
     "meaning": "3-5 sentences plain-English explanation of what this is and why it matters",
     "explanation": "VERY DETAILED — 8-15 sentences minimum. Cover the full theory, relationships, edge cases, exam relevance, and practical application.",
     "formula": "exact LaTeX formula or null",
     "formulaVariables": "define EVERY variable in the formula or null",
     "formulaUseCase": "When to use this formula (1-2 sentences) or null",
     "formulaExamTrap": "Common mistake students make with this formula (1-2 sentences) or null",
     "interpretation": "What the result means and why it matters (2-4 sentences) or null",
     "workedExample": {
       "given": "detailed givens",
       "required": "what the question asks for",
       "solution": "FULL step-by-step solution with all calculations shown",
       "conclusion": "interpretation of the result"
     } OR null,
     "examTip": "2-3 sentences of specific exam strategy",
     "commonMistake": "2-3 sentences about what candidates get wrong"
   }

   For each concept, include a FORMULA BOX with:
   - The formula itself (rendered in LaTeX)
   - "Use when" use case
   - "Exam trap" warning

5. "formulaRecap": Formula Bank array — EVERY formula from the module (8-20 items):
   { "name": "formula name", "formula": "LaTeX formula", "variables": "variable definitions", "useCase": "when to use this formula", "examTrap": "common mistake" }

6. "practiceSet": Array of 10 exam-style questions:
   { "question": "full question text with answer options A, B, C", "correctAnswer": "A|B|C", "explanation": "detailed explanation of why this answer is correct and why the others are wrong", "losRef": "LOS reference" }

7. "workedSolutions": Array of 4-6 detailed Worked Examples:
   { "question": "full question", "answer": "final numeric answer", "method": "DETAILED step-by-step solution method", "interpretation": "what the result means", "trap": "what students might do wrong" }

8. "revisionCheck": Array of 10-15 Final Exam Checklist items:
   { "item": "Can I... [specific capability]?" }

--- FORMAT REQUIREMENTS ---
${LATEX_PROMPT_SECTION}
- Wrap ALL formulas in \[...\] for display math or \\(...\\) for inline.
- Every formula must include a "Use when" use case and an "Exam trap" warning.
- PRESERVE exact notation from the curriculum but convert to valid LaTeX.

--- QUALITY RULES ---
- Cover EVERY LOS.
- Cover EVERY topic and concept in the learning module.
- Include original examples and original exam-style questions (do NOT copy from curriculum or tuition providers).
- Every formula must have: formula itself, variable definitions, use case, and exam trap.
- Worked examples must have step-by-step solutions with all calculations shown.
- Exam-style questions must have correct answer + full explanation for right AND wrong answers.
- Output must be suitable for premium study material — thorough, clear, and exam-focused.
- ANSWER CONSISTENCY (CRITICAL): The "correctAnswer" field MUST match the worked solution and explanation. If the math shows Portfolio B has higher utility, the correctAnswer MUST be "B", NOT "A". Double-check every question: calculate the answer yourself and verify correctAnswer matches. Never default to "A".

Generate exactly 1 module note. Return ONLY valid JSON. Use ALL available tokens for maximum detail.`;

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
			const openai = new OpenAI({ apiKey, timeout: 120_000 });

			// Generate exactly 1 note per preview request to avoid timeout
			const completion = await openai.chat.completions.create({
				model: 'gpt-4o-mini',
				messages: [
					{ role: 'system', content: `You are the Milven Notes Generator for Milven Finance School. You produce premium, exam-ready study notes in the Milven Notes format. Return valid JSON only. Generate extremely detailed, comprehensive content — each note must be 10-15 printed pages worth of material. Every text field must be multiple sentences. The concepts array must have 10-20 items covering every topic and sub-topic. Write full original content — do NOT copy curriculum wording or third-party tuition materials.\n\n${LATEX_SYSTEM_RULES}` },
					{ role: 'user', content: prompt }
				],
				temperature: 0.7,
				max_tokens: 16384,
				response_format: { type: 'json_object' }
			});

			const raw = completion.choices?.[0]?.message?.content?.trim() || '{}';
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
