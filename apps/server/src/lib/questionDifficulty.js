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

// Shared rule aliases (one authoritative definition used by the generator,
// the self-check, the independent validator and the repair prompt).
export const EASY_RULES = DIFFICULTY_RUBRICS.EASY;
export const MEDIUM_RULES = DIFFICULTY_RUBRICS.MEDIUM;

// The 7 HARD criteria. A genuinely HARD question should normally satisfy at
// least FOUR (the generator aims for >= 5 as a safety margin).
export const HARD_CRITERIA = [
	'Requires at least 3 meaningful reasoning or calculation operations.',
	'Requires the candidate to determine the appropriate method, formula, principle, or relationship rather than having it stated explicitly.',
	'Requires deriving at least one intermediate value or intermediate conclusion before reaching the final answer.',
	'Integrates two or more related curriculum concepts where the LOS/content naturally supports integration.',
	'Requires interpretation of a calculated result or analytical conclusion.',
	'Requires judgement, comparison, evaluation, recommendation, or identification of the most appropriate conclusion.',
	'Uses strong distractors based on realistic analytical errors rather than obviously incorrect alternatives.',
];

export const HARD_PROHIBITIONS = [
	'pure recall',
	'a definition question',
	'one-step arithmetic',
	'one obvious formula substitution',
	'a straightforward calculation followed immediately by the answer',
	'difficult only because the numbers are ugly',
	'difficult only because the stem is long',
	'difficult because wording is confusing',
	'outside the selected curriculum level',
];

// Authoritative HARD definition — ONE source of truth used by the generator,
// the self-check, the independent validator and the repair prompt (spec: the
// generator and validator must share the same objective definition).
export const HARD_RULES = `HARD — requires genuine analysis and exam-level judgement.
A HARD question must NOT be: ${HARD_PROHIBITIONS.join('; ')}.
A HARD question should normally satisfy AT LEAST FOUR of these seven criteria, where supported by the LOS:
${HARD_CRITERIA.map((c, i) => `${i + 1}. ${c}`).join('\n')}
The generator aims for at least FIVE (a safety margin above the validator threshold of four).
Difficulty MUST come from reasoning depth — NOT from complicated arithmetic, obscure vocabulary, missing information, ambiguous wording, irrelevant tricks, or excessive unrelated reading.`;
// Keep DIFFICULTY_RUBRICS.HARD consistent with the authoritative rule.
DIFFICULTY_RUBRICS.HARD = HARD_RULES;

export const HARD_ARCHETYPES = [
	'MULTI-STEP CALCULATION: data → method selection → intermediate calculation → second calculation → interpretation.',
	'CALCULATION + DECISION: calculate metric → interpret → apply constraint → make decision.',
	'COMPETING ALTERNATIVES: scenario → evaluate alternatives A/B/C → apply curriculum principle → determine most appropriate choice.',
	'ANALYST ERROR: analyst statement/calculation → identify principle → test reasoning → find mistake → select correct conclusion.',
	'INTEGRATED CONCEPT: concept A + concept B → apply both → resolve interaction → conclusion.',
	'CHANGE IN ASSUMPTION: base case → one assumption changes → determine consequences → recalculate/reinterpret → conclusion.',
	'CONSTRAINT PROBLEM: calculate/analyse → apply mandate/rule/constraint → determine feasible alternatives → select most appropriate action.',
];

const HARD_BLUEPRINT = `HARD DESIGN PROCESS — perform this INTERNALLY before writing the final question. DO NOT WRITE THE QUESTION IMMEDIATELY.

STEP 1 — Identify the test target: course level, learning module, LOS, topic, concept(s). Do not introduce content outside these sources.
STEP 2 — Classify the LOS as (A) Quantitative, (B) Conceptual, or (C) Mixed and use the matching blueprint.

QUANTITATIVE BLUEPRINT:
Scenario → identify relevant information → choose the appropriate method/formula (not stated) → calculate intermediate value 1 → apply a second relationship/calculation → interpret the result → select the conclusion/recommendation.
AVOID: "formula explicitly named → substitute numbers → answer" (that is normally EASY/MEDIUM).

CONCEPTUAL BLUEPRINT:
Professional scenario → identify the relevant principle → evaluate two or more plausible statements/actions → identify the subtle distinction or consequence → apply the curriculum rule → choose the MOST appropriate conclusion.
A difficult conceptual question does NOT need calculations if the LOS does not require them (competing statements, policy choices, recommendations, exceptions, implications, interactions, spotting an error in reasoning, consequences of changing an assumption).

MIXED BLUEPRINT:
Scenario → calculation → interpretation → second concept/constraint → professional judgement.

SELECT ONE ARCHETYPE (vary it across questions so HARD items do not look repetitive):
${HARD_ARCHETYPES.map((a, i) => `${i + 1}. ${a}`).join('\n')}

BUILD THE DISTRACTORS FROM THE SOLUTION:
First solve the question correctly, THEN create each incorrect option from a SPECIFIC realistic candidate mistake (wrong denominator; arithmetic mean instead of geometric mean; ignoring tax or one cash flow; wrong sign/timing/formula/intermediate value; reversed relationship; nominal vs real; ignored stated constraint; correlation vs covariance; ending value instead of average value). Both wrong options must look plausible to a candidate who only partially understands the material.

DO NOT GIVE AWAY THE METHOD:
Avoid stems that name the method (e.g. "Using the Gordon growth model…") when identifying the right approach is legitimately part of the difficulty. Never create ambiguity — if several methods could be correct, give enough information to establish exactly one clearly correct approach. Do NOT put the formula in the student-facing stem; keep it in the keyFormulas/workedSolution metadata.

PRE-GENERATION CHECK (answer internally before writing):
A) How many meaningful reasoning steps will the candidate need?
B) Does the candidate need to choose a method/formula/principle?
C) Is there an intermediate value or conclusion?
D) Are multiple concepts integrated?
E) Is interpretation required?
F) Is judgement required?
G) Are the distractors based on realistic mistakes?
If fewer than FOUR applicable HARD criteria are present, DO NOT GENERATE THAT DESIGN — redesign it first.

POST-GENERATION CHECK (before returning the question):
- Solvable by direct recall? → REWRITE.
- Solvable by one obvious substitution? → REWRITE.
- Difficulty mostly from long wording? → REWRITE.
- Fewer than 3 meaningful reasoning steps in a quantitative question (and no genuinely difficult judgement/integration)? → REWRITE.
- Distractors obviously wrong? → REWRITE.
- Outside the selected CFA level / supplied curriculum? → REWRITE.
Only return the question once this HARD check passes.

QUALITY PRIORITY: 1) curriculum correctness, 2) clear single correct answer, 3) HARD cognitive depth, 4) realistic CFA-style scenario, 5) strong distractors, 6) originality. Do NOT overfit by adding random calculations, unnecessary concepts, or irrelevant constraints — every reasoning step must support the LOS.`;

function buildDifficultyDesignMetadata(levels) {
	const example = levels[0] || 'HARD';
	return `Include an internal "difficultyDesign" object on every question (supporting metadata for quality checking only — it does NOT override the requirement that the actual content must match the target, and the independent validator still makes its own decision):
"difficultyDesign": { "target": "${example}", "archetype": "MULTI_STEP_CALCULATION|CALCULATION_PLUS_DECISION|COMPETING_ALTERNATIVES|ANALYST_ERROR|INTEGRATED_CONCEPT|CHANGE_IN_ASSUMPTION|CONSTRAINT_PROBLEM", "reasoningStepCount": 0, "methodSelectionRequired": false, "intermediateResultRequired": false, "conceptsIntegrated": 0, "interpretationRequired": false, "judgementRequired": false, "hardCriteriaSatisfied": 0 }
For HARD, aim for "hardCriteriaSatisfied" >= 5 (a safety margin above the validator's minimum of 4).`;
}

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
	const hardGate = levels.includes('HARD') ? `\n\n${HARD_BLUEPRINT}` : '';

	return `=================================================
MANDATORY TARGET DIFFICULTY: ${requested}
=================================================

The administrator explicitly requested ${requested}. ${scope} MUST be genuinely ${requested}.
A question that is EASY or MEDIUM but labelled ${requested} is a generation failure.
Do NOT generate an easier (or harder) question and label it ${requested}.${planLine}

Apply this rubric (the SAME objective definition the independent validator uses):

${rubrics}${hardGate}

Internal check BEFORE returning EACH question:
1. Could a prepared candidate answer this by direct recall?
2. Can this be solved using only one obvious step / one obvious substitution?
3. Does the question require analysis rather than recognition?
4. Does it contain meaningful reasoning depth?
5. Are the distractors based on realistic mistakes?
6. Would simplifying one intermediate step materially reduce the difficulty?
If the answer to question 1 or 2 is YES (and the target is MEDIUM or HARD), the question is too easy — redesign and rewrite it before returning it.
If the target is EASY and the question requires advanced multi-concept analysis, simplify it.

The "difficulty" field on every question object (and every sub-question) MUST equal exactly one of: ${requested}.

${buildDifficultyDesignMetadata(levels)}

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

Apply this SAME objective level definition the generator used (do not use your own private scale):
${DIFFICULTY_RUBRICS[normalizeDifficultyValue(target) || 'MEDIUM']}

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

Apply this SAME objective level definition the generator and validator use:
${DIFFICULTY_RUBRICS[normalizeDifficultyValue(target) || 'MEDIUM']}
${target === 'HARD' ? `\n${HARD_BLUEPRINT}` : ''}

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
