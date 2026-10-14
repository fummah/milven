/**
 * Central AI question-difficulty specification + enforcement.
 *
 * Single source of truth for:
 *   - how each difficulty level is defined (rubrics)
 *   - how a per-question target plan is built
 *   - the mandatory prompt block injected into generation
 *   - the strict difficulty auditor prompt
 *   - the repair prompt for failed questions
 *   - the generate → validate → regenerate orchestrator
 *
 * The selected difficulty is authoritative: a question is only accepted (and
 * only stored) at the difficulty the auditor independently confirms.
 */
import { stripJsonFences } from './aiContent.js';

export const DIFFICULTY_LEVELS = ['EASY', 'MEDIUM', 'HARD'];

export const DIFFICULTY_RUBRICS = {
	EASY: `EASY — tests understanding of ONE core curriculum concept.
Requirements:
- one primary concept
- recall, recognition, or direct application
- normally zero or one calculation step
- the required method is reasonably obvious
- little irrelevant information
- straightforward interpretation
- distractors are credible but based on basic errors
- the candidate does NOT need to combine several concepts
Typical cognitive tasks: identify, define, recognise, calculate directly, state, classify using an obvious rule.
An EASY quantitative item may be: identify formula -> direct substitution -> answer. It must still be professional and non-trivial.`,
	MEDIUM: `MEDIUM — tests application rather than simple recall.
Requirements:
- normally 2-3 connected reasoning/calculation steps
- scenario interpretation may be required
- the candidate may need to CHOOSE an appropriate formula or rule
- may require an intermediate calculation
- may combine closely related concepts
- distractors represent common CFA candidate mistakes
- the solution is not immediately obvious from the wording
- the candidate must interpret before answering
Typical structure: interpret information -> select rule/formula -> calculate/analyse -> choose answer.
Typical cognitive tasks: apply, compare, interpret, analyse, distinguish, calculate and interpret.`,
	HARD: `HARD — requires genuine analysis and exam-level judgement.
A HARD question must NOT be: a definition question, direct recall, simple substitution into one obvious formula, one-step arithmetic, a MEDIUM question with longer wording, difficult merely because numbers are ugly, or difficult merely because wording is confusing.
A HARD question must satisfy AT LEAST THREE of the following whenever the curriculum supports them:
1. Requires at least 3 meaningful reasoning/calculation operations.
2. Requires integrating two or more related curriculum concepts.
3. Requires identifying which information is relevant before solving.
4. Requires deriving one or more intermediate values.
5. Requires selecting the appropriate method instead of being told which to use.
6. Requires interpreting a calculated result before choosing the answer.
7. Includes a realistic constraint, assumption, recommendation, competing alternative, or professional decision.
8. Requires distinguishing between two technically plausible conclusions.
9. Uses distractors that correspond to realistic analytical mistakes.
10. Requires applying a curriculum rule to a scenario rather than recalling it.
11. For conceptual questions: requires evaluating relationships, statements, implications, exceptions, or competing recommendations.
12. For quantitative questions: calculation 1 -> intermediate result -> calculation/analysis 2 -> interpretation -> final judgement.
Difficulty MUST come from reasoning depth — NOT from complicated arithmetic, obscure vocabulary, missing information, ambiguous wording, irrelevant tricks, or excessive unrelated reading.`,
};

export function normalizeDifficultyValue(val) {
	const s = String(val || '').toUpperCase().trim();
	return DIFFICULTY_LEVELS.includes(s) ? s : null;
}

// Distributes the requested difficulty levels across `count` questions.
// Single selection => all the same; multiple => round-robin with a random start.
export function buildTargetPlan(diffList, count) {
	const levels = (Array.isArray(diffList) && diffList.length ? diffList : ['MEDIUM'])
		.map(normalizeDifficultyValue).filter(Boolean);
	if (levels.length === 0) levels.push('MEDIUM');
	const n = Math.max(1, Number(count) || levels.length);
	const start = Math.floor(Math.random() * levels.length);
	const plan = [];
	for (let i = 0; i < n; i++) plan.push(levels[(start + i) % levels.length]);
	return plan;
}

// The mandatory difficulty block injected near the top of the generation prompt.
export function buildDifficultyMandatoryBlock(diffList, { questionType, count } = {}) {
	const levels = (Array.isArray(diffList) && diffList.length ? diffList : ['MEDIUM'])
		.map(normalizeDifficultyValue).filter(Boolean);
	if (levels.length === 0) levels.push('MEDIUM');
	const requested = levels.join(', ');
	const multi = levels.length > 1;

	const isVignette = questionType === 'VIGNETTE_MCQ' || questionType === 'CONSTRUCTED_RESPONSE';
	const scope = isVignette
		? 'Every sub-question in every item set'
		: 'Every generated question';

	let planLine = '';
	if (!multi && Number(count) > 0 && !isVignette) {
		planLine = `\nTarget plan (one entry per question): ${Array.from({ length: Number(count) }, () => levels[0]).join(', ')}`;
	} else if (multi) {
		const plan = buildTargetPlan(levels, Math.max(1, Number(count) || 4));
		planLine = `\nDistribute ONLY across these levels. Suggested target plan: ${plan.join(', ')}. Never generate a level outside: ${requested}.`;
	}

	const rubrics = levels.map(l => DIFFICULTY_RUBRICS[l]).join('\n\n');

	return `=================================================
MANDATORY TARGET DIFFICULTY: ${requested}
=================================================

The administrator explicitly selected ${requested}. ${scope} MUST be genuinely ${requested}.
Do NOT generate an easier (or harder) question and label it ${requested}.${planLine}

Apply this rubric:

${rubrics}

Before returning EACH question, internally ask:
1. Could a prepared candidate answer this by direct recall?
2. Can this be solved using only one obvious step?
3. Does the question require analysis rather than recognition?
4. Does it contain meaningful reasoning depth?
5. Are the distractors based on realistic mistakes?
6. Would simplifying one intermediate step materially reduce the difficulty?
If the answer to question 1 or 2 is YES (and the target is MEDIUM or HARD), the question is too easy — rewrite it before returning it.
If the target is EASY and the question requires advanced multi-concept analysis, simplify it.

The "difficulty" field on every question object (and every sub-question) MUST equal exactly one of: ${requested}.

Also include an internal "difficultyAssessment" object on every question (supporting metadata only — it does NOT override the requirement that the actual content must match the target):
"difficultyAssessment": { "target": "${levels[0]}", "reasoningSteps": 0, "conceptsIntegrated": ["..."], "requiresIntermediateCalculation": false, "requiresInterpretation": false, "requiresJudgement": false, "difficultyJustification": "..." }
=================================================

PROMPT PRIORITY (highest first): 1) curriculum correctness, 2) selected target difficulty, 3) answer accuracy, 4) LOS/topic/concept alignment, 5) question-type format, 6) strong distractors, 7) originality, 8) metadata completeness. No other instruction may contradict target difficulty.`;
}

// Auditor prompt — evaluates the ACTUAL difficulty of one question.
export function buildDifficultyAuditorPrompt(unit, target, level = 'LEVEL1') {
	const opts = Array.isArray(unit?.options) ? unit.options : [];
	const renderedOptions = opts.length
		? opts.map((o, i) => `${String.fromCharCode(65 + i)}. ${typeof o === 'string' ? o : (o?.text || '')}`).join('\n')
		: '(none)';
	const correct = opts.find(o => o && o.isCorrect);
	return `You are the Milven Question Difficulty Auditor.

Evaluate the ACTUAL cognitive difficulty of this CFA question.
Do NOT use the question's stored difficulty label as evidence.

Target difficulty: ${target}
Curriculum level: ${level}
Topic: ${unit?.topicName || '(n/a)'}
Concept: ${unit?.conceptName || '(n/a)'}
LOS: ${unit?.los || '(n/a)'}

Question:
${unit?.stem || ''}

Options:
${renderedOptions}

Correct answer: ${typeof correct === 'string' ? correct : (correct?.text || '(not provided)')}
Worked solution:
${unit?.workedSolution || unit?.explanation || ''}

Evaluate:
1. number of meaningful reasoning steps
2. formula/method selection required
3. number of concepts integrated
4. intermediate values required
5. interpretation required
6. judgement required
7. distractor quality
8. whether the approach is immediately obvious
9. whether difficulty comes from reasoning rather than wording/arithmetic

Classify the ACTUAL difficulty as exactly EASY, MEDIUM or HARD.

Return ONLY valid JSON:
{
  "actualDifficulty": "EASY|MEDIUM|HARD",
  "targetDifficulty": "${target}",
  "pass": true,
  "reasoningStepCount": 0,
  "conceptIntegrationCount": 0,
  "requiresInterpretation": false,
  "requiresJudgement": false,
  "issues": [],
  "reason": "short explanation"
}

Be strict. A one-step calculation is NOT HARD. A definition question is NOT HARD. A question does not become HARD because the scenario is long or the arithmetic is tedious. A genuinely HARD question must require analysis, multi-step reasoning, integrated concepts, interpretation, or professional judgement.`;
}

// Repair prompt — rewrite a failed question to meet the target difficulty.
export function buildDifficultyRepairPrompt(target, verdict, unit, level = 'LEVEL1') {
	const issues = Array.isArray(verdict?.issues) ? verdict.issues : [];
	const issuesText = issues.length ? issues.map(i => `- ${typeof i === 'string' ? i : JSON.stringify(i)}`).join('\n') : '(none supplied)';
	const opts = Array.isArray(unit?.options) ? unit.options : [];
	const renderedOptions = opts.map((o, i) => `${String.fromCharCode(65 + i)}. ${typeof o === 'string' ? o : (o?.text || '')}`).join('\n');
	return `The previous question failed difficulty validation.

TARGET: ${target}
VALIDATOR CLASSIFIED IT: ${verdict?.actualDifficulty || 'UNKNOWN'}
REASONS:
${issuesText}

Curriculum level: ${level}
Topic: ${unit?.topicName || '(n/a)'}
Concept: ${unit?.conceptName || '(n/a)'}
LOS: ${unit?.los || '(n/a)'}

Original question:
${unit?.stem || ''}

Original options:
${renderedOptions}

Rewrite the question while preserving curriculum alignment, LOS, topic, concept and question type.
Increase reasoning depth WITHOUT introducing unsupported curriculum content, confusing wording, merely larger numbers, or irrelevant information.
${target === 'HARD' ? `For HARD specifically: require additional meaningful reasoning; include intermediate derivation where appropriate; add interpretation/judgement; strengthen distractors; make the solving approach less obvious; integrate a second related concept when supported by the curriculum.` : ''}
${target === 'MEDIUM' ? `For MEDIUM specifically: require interpretation plus 2-3 connected steps (choose the right method before calculating).` : ''}
${target === 'EASY' ? `For EASY specifically: test ONE core concept with at most one calculation step; remove multi-concept analysis.` : ''}

Independently solve the rewritten question before returning it.

Return ONLY valid JSON for the rewritten question with this shape:
{
  "stem": "...",
  "options": [{"text": "...", "isCorrect": true}, {"text": "...", "isCorrect": false}, {"text": "...", "isCorrect": false}],
  "workedSolution": "...",
  "keyFormulas": "...",
  "explanation": "...",
  "los": "..."
}`;
}

function toOptions(raw) {
	const arr = Array.isArray(raw) ? raw : [];
	const opts = arr.map(o => ({
		text: typeof o === 'string' ? o : (o?.text || o?.label || o?.answer || ''),
		isCorrect: !!(o && (o.isCorrect === true || o.correct === true || o.is_correct === true)),
	}));
	if (opts.length && !opts.some(o => o.isCorrect)) opts[0].isCorrect = true;
	return opts;
}

// Strongly normalise a repaired question into the unit shape.
export function normalizeRepairedQuestion(raw, fallbackUnit) {
	if (!raw || typeof raw !== 'object') return null;
	const stem = String(raw.stem || raw.question || '').trim();
	if (!stem) return null;
	const options = toOptions(raw.options || raw.choices || raw.answers);
	return {
		...fallbackUnit,
		stem,
		options: options.length >= 2 ? options : (fallbackUnit?.options || []),
		workedSolution: String(raw.workedSolution || raw.worked_solution || ''),
		explanation: String(raw.explanation || ''),
		keyFormulas: String(raw.keyFormulas || raw.keyFormula || fallbackUnit?.keyFormulas || ''),
		los: raw.los || fallbackUnit?.los || '',
	};
}

async function auditUnit(unit, target, ctx) {
	const { chatCompletion, apiKey, provider, model, level, timeout } = ctx;
	try {
		const res = await chatCompletion({
			apiKey, provider, model,
			messages: [
				{ role: 'system', content: 'You are the Milven Question Difficulty Auditor. Return valid JSON only.' },
				{ role: 'user', content: buildDifficultyAuditorPrompt(unit, target, level) },
			],
			temperature: 0.1,
			maxTokens: 800,
			jsonMode: true,
			timeout,
		});
		const parsed = JSON.parse(stripJsonFences(res?.text ?? res?.content ?? '{}'));
		const actual = normalizeDifficultyValue(parsed.actualDifficulty) || 'MEDIUM';
		return {
			actualDifficulty: actual,
			pass: actual === target,
			reason: parsed.reason || '',
			issues: Array.isArray(parsed.issues) ? parsed.issues : [],
			reasoningStepCount: parsed.reasoningStepCount,
			conceptIntegrationCount: parsed.conceptIntegrationCount,
			audited: true,
		};
	} catch (err) {
		// Never let a validator/infrastructure failure wipe out valid generation.
		return {
			actualDifficulty: target,
			pass: true,
			audited: false,
			reason: `validator unavailable: ${err?.message || err}`,
			issues: [],
		};
	}
}

async function repairUnit(unit, target, verdict, ctx) {
	const { chatCompletion, apiKey, provider, model, level, timeout, maxTokens } = ctx;
	const res = await chatCompletion({
		apiKey, provider, model,
		messages: [
			{ role: 'system', content: 'You are a senior CFA exam writer. Return valid JSON only.' },
			{ role: 'user', content: buildDifficultyRepairPrompt(target, verdict, unit, level) },
		],
		temperature: 0.4,
		maxTokens: maxTokens || 2000,
		jsonMode: true,
		timeout,
	});
	const parsed = JSON.parse(stripJsonFences(res?.text ?? res?.content ?? '{}'));
	const q = parsed?.question || (Array.isArray(parsed?.items) ? parsed.items[0] : (Array.isArray(parsed) ? parsed[0] : parsed));
	return normalizeRepairedQuestion(q, unit);
}

/**
 * Generate → validate → regenerate (per question).
 *
 * units:   [{ loc, stem, options:[{text,isCorrect}], workedSolution, explanation, keyFormulas, los, topicName, conceptName, qid }]
 * targets: parallel array of target difficulty levels.
 * Returns: [{ loc, target, pass, attempts, unit, verdict }]
 */
export async function enforceDifficulty({
	units,
	targets,
	chatCompletion,
	apiKey,
	provider,
	model,
	level = 'LEVEL1',
	maxAttempts = 2,
	maxTokens = 2000,
	timeout = 120000,
	logger = console,
} = {}) {
	const results = [];
	const ctx = { chatCompletion, apiKey, provider, model, level, timeout, maxTokens };
	for (let i = 0; i < units.length; i++) {
		const target = normalizeDifficultyValue(targets?.[i]) || 'MEDIUM';
		let unit = units[i];
		let verdict = await auditUnit(unit, target, ctx);
		logger?.log?.(`[Difficulty Validator] QID: ${unit.qid || `#${i + 1}`} Target: ${target} Actual: ${verdict.actualDifficulty} Pass: ${verdict.pass}${verdict.reason ? ' Reason: ' + verdict.reason : ''}`);

		let attempts = 0;
		while (!verdict.pass && attempts < maxAttempts) {
			attempts++;
			logger?.log?.(`[Difficulty Regeneration] QID: ${unit.qid || `#${i + 1}`} Attempt: ${attempts + 1}/${maxAttempts + 1}`);
			try {
				const repaired = await repairUnit(unit, target, verdict, ctx);
				if (!repaired) {
					logger?.warn?.(`[Difficulty Regeneration] QID: ${unit.qid || `#${i + 1}`} produced no usable rewrite.`);
					break;
				}
				unit = repaired;
				verdict = await auditUnit(unit, target, ctx);
				logger?.log?.(`[Difficulty Validator] QID: ${unit.qid || `#${i + 1}`} Target: ${target} Actual: ${verdict.actualDifficulty} Pass: ${verdict.pass}${verdict.reason ? ' Reason: ' + verdict.reason : ''}`);
			} catch (err) {
				logger?.warn?.(`[Difficulty Regeneration] QID: ${unit.qid || `#${i + 1}`} failed: ${err?.message || err}`);
				break;
			}
		}
		results.push({ loc: unit.loc, target, pass: verdict.pass, attempts, unit, verdict });
	}
	return results;
}
