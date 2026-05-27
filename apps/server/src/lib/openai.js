/**
 * =========================================================
 * OpenAI + LaTeX Utilities
 * Enterprise-grade CFA formula generation + validation
 * =========================================================
 *
 * INSTALL:
 * npm install katex
 */

import katex from 'katex';

/**
 * =========================================================
 * OPENAI API KEY
 * =========================================================
 */

export async function getOpenAIApiKey(prisma) {

	const envKey = process.env.OPENAI_API_KEY;

	if (envKey && envKey.trim()) {
		return envKey.trim();
	}

	const row = await prisma.systemSetting.findUnique({
		where: {
			key: 'openai_api_key'
		}
	});

	const val = row?.value;

	return (
		(typeof val === 'string'
			? val
			: val?.value
		)?.trim() || null
	);
}

/**
 * =========================================================
 * GLOBAL SYSTEM RULES
 * =========================================================
 */

export const LATEX_SYSTEM_RULES = `
You are an expert CFA curriculum content generator producing STRICT KaTeX-compatible LaTeX.

═══════════════════════════════════════════════════════
CRITICAL FORMULA REPAIR RULES
═══════════════════════════════════════════════════════

1. NEVER output ANY of these corrupted/malformed patterns:
   - ext{        (missing backslash — MUST be \\text{})
   - rac{        (missing backslash — MUST be \\frac{})
   - imes        (missing backslash — MUST be \\times)
   - Plain-text equations without LaTeX notation
   - Unbalanced braces
   - Empty math delimiters

2. ALWAYS repair corrupted LaTeX commands if you detect them:
   - ext{} → \\text{}
   - rac{} → \\frac{}
   - imes  → \\times

3. ALL formulas MUST be wrapped in display-math delimiters:
\\[
...
\\]

4. ALL descriptive words inside formulas MUST use \\text{}:
   \\text{WACC}, \\text{Cost}, \\text{Debt}, \\text{Equity},
   \\text{Fixed-Income Index}, \\text{NAV}

5. NEVER use plain English as a formula. If a concept is non-mathematical,
   convert it into proper CFA mathematical notation using:
   - \\sum for summation
   - \\frac for weighted averages and fractions
   - w_i for weights
   - P_i for prices
   - Proper subscripts and superscripts

6. Variables MUST use proper LaTeX subscript notation:
   - P_i  (not Pi)
   - CF_t (not CFt)
   - r_f  (not rf)
   - \\beta_i (not betai)
   - w_i  (not wi)
   - R_{equity} (not Requity)

7. NEVER collapse words together:
   BAD:  expectedreturnofthemarket
   GOOD: expected return of the market
   BAD:  betaoftheportfolio
   GOOD: beta of the portfolio

8. Fractions: \\frac{numerator}{denominator}
   - ALWAYS two brace groups
   - NEVER rac{} or frac{}

9. Superscripts with multi-char exponents use braces:
   (1+r)^{n}  NOT  (1+r)^n  (when n is a variable)

10. Greek letters ALWAYS with backslash:
    \\alpha \\beta \\gamma \\delta \\sigma \\mu \\rho
    \\lambda \\theta \\epsilon \\tau \\phi \\omega \\nu \\pi

11. Multiplication: use \\times or \\cdot (NEVER bare *)

12. VALIDATE every formula before output:
    - Balanced braces: every { has matching }
    - Proper \\frac with two brace groups
    - Proper \\text{} (not ext{})
    - Proper superscripts/subscripts
    - Valid KaTeX syntax
    - No pseudo-math or plain text

═══════════════════════════════════════════════════════
EXAMPLE CORRECTIONS
═══════════════════════════════════════════════════════

BAD:
ext{Fixed-Income Index} = ext{Weighted Average of Bond Prices}

GOOD:
\\[
\\text{Fixed-Income Index} = \\sum_{i=1}^{N} w_i \\cdot P_i
\\]

BAD:
FV = PV imes (1+r)n

GOOD:
\\[
FV = PV \\times (1+r)^{n}
\\]

BAD:
rac{D}{E}

GOOD:
\\[
\\frac{D}{E}
\\]

═══════════════════════════════════════════════════════
CORRECT REFERENCE FORMULAS
═══════════════════════════════════════════════════════

\\[
PV = \\sum_{t=1}^{T} \\frac{CF_t}{(1+r)^{t}}
\\]

\\[
\\text{WACC} = w_d \\cdot r_d \\cdot (1-t) + w_e \\cdot r_e
\\]

\\[
r_e = r_0 + (r_0 - r_d)(1-t) \\frac{D}{E}
\\]

\\[
\\text{Sharpe Ratio} = \\frac{R_p - R_f}{\\sigma_p}
\\]

\\[
E(R_i) = R_f + \\beta_i \\left[ E(R_m) - R_f \\right]
\\]

Output ONLY production-ready KaTeX formulas.
`;

/**
 * =========================================================
 * USER PROMPT APPENDIX
 * =========================================================
 */

export const LATEX_PROMPT_SECTION = `
FORMULA RULES (STRICTLY ENFORCED):
- ALL formulas MUST use valid KaTeX LaTeX wrapped in \\[ ... \\]
- NEVER output: ext{}, rac{}, imes, plain-text equations, collapsed words
- ALWAYS use: \\frac{}{}, \\text{}, \\times, \\cdot, \\sum_{}, ^{}, _{}
- Variables: P_i, CF_t, r_f, \\beta_i, w_i, R_{equity} (NEVER Pi, CFt, rf, betai)
- Greek letters: \\alpha, \\beta, \\sigma, \\mu (ALWAYS with backslash)
- Multiplication: \\times or \\cdot (NEVER bare asterisk *)
- Words in formulas: \\text{WACC}, \\text{Sharpe Ratio}
- Non-mathematical concepts MUST be converted to proper notation (summation, fractions, subscripts)
- Variable descriptions: NEVER collapse words (use "expected return of the market" NOT "expectedreturnofthemarket")
- VALIDATE: balanced braces, proper \\frac with 2 brace groups, no malformed commands
`;

/**
 * =========================================================
 * EXTRACT LATEX BLOCKS
 * =========================================================
 */

export function extractLatexBlocks(text) {

	if (!text) {
		return [];
	}

	const matches = [

		...text.matchAll(
			/\\\[(.*?)\\\]/gs
		),

		...text.matchAll(
			/\\\((.*?)\\\)/gs
		)
	];

	return matches.map(m => m[0]);
}

/**
 * =========================================================
 * AUTO-REPAIR CORRUPTED LATEX
 * =========================================================
 * Fixes common corruption from JSON parsing or AI output
 * before validation. This runs server-side on formula text.
 */

export function autoRepairLatex(text) {
	if (!text || typeof text !== 'string') return text || '';
	let s = text;

	// Fix JSON escape corruption: \t → tab+imes, \b → backspace+eta, \f → formfeed+rac
	s = s.replace(/\times/g, '\\times');
	s = s.replace(/\beta/g, '\\beta');
	s = s.replace(/\bar(?=[{\s(])/g, '\\bar');
	s = s.replace(/\frac/g, '\\frac');
	s = s.replace(/\nu(?=[^a-zA-Z]|$)/g, '\\nu');
	s = s.replace(/\nabla/g, '\\nabla');

	// Fix standalone corrupted commands (missing backslash)
	s = s.replace(/(?<![\\a-zA-Z])imes\b/g, '\\times');
	s = s.replace(/(?<![\\a-zA-Z])ext\{/g, '\\text{');
	s = s.replace(/(?<![\\a-zA-Z])rac\{/g, '\\frac{');
	s = s.replace(/(?<![\\a-zA-Z])qrt\{/g, '\\sqrt{');
	s = s.replace(/(?<![\\a-zA-Z])cdot\b/g, '\\cdot');

	// Fix missing backslash on common LaTeX commands
	const cmds = [
		'frac', 'text', 'sqrt', 'sum', 'prod', 'int', 'lim',
		'left', 'right', 'times', 'cdot', 'ln', 'log', 'exp',
		'sin', 'cos', 'tan',
		'alpha', 'beta', 'gamma', 'delta', 'sigma', 'mu', 'rho',
		'lambda', 'pi', 'theta', 'epsilon', 'tau', 'phi', 'omega',
		'nu', 'kappa', 'chi', 'psi', 'zeta', 'eta', 'xi',
		'Delta', 'Sigma', 'Omega', 'Phi', 'Theta', 'Lambda', 'Gamma',
		'overline', 'bar', 'hat', 'tilde', 'vec', 'mathbf', 'mathrm',
		'geq', 'leq', 'neq', 'approx', 'infty', 'pm',
	];
	for (const cmd of cmds) {
		// Only add backslash if not already preceded by one
		const re = new RegExp(`(?<!\\\\)\\b${cmd}(?=\\{|[_^\\s(\\[])`, 'g');
		s = s.replace(re, '\\' + cmd);
	}

	// Collapse triple+ backslashes to single
	s = s.replace(/\\{3,}([a-zA-Z])/g, '\\$1');
	// Collapse double backslashes before commands (but not \\[ or \\])
	s = s.replace(/\\\\(?=(?:frac|text|sqrt|sum|left|right|times|cdot|alpha|beta|gamma|delta|sigma|mu|rho|lambda|pi|theta|epsilon|tau|phi|omega|Delta|Sigma|Omega|Phi|Theta|Lambda|Gamma|overline|bar|hat|tilde|vec|mathbf|mathrm|geq|leq|neq|approx|infty|pm)\b)/g, '\\');

	// Strip stray control characters
	s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

	return s;
}

/**
 * =========================================================
 * EXTRA REGEX SAFETY CHECKS
 * =========================================================
 */

function regexValidation(input) {

	// malformed \frac — "rac{" without backslash
	if (/(?<!\\)rac\{/.test(input)) {
		return {
			valid: false,
			reason: 'Malformed \\frac (found "rac{" — missing backslash)'
		};
	}

	// malformed \text — "ext{" without backslash
	if (/(?<!\\)ext\{/.test(input)) {
		return {
			valid: false,
			reason: 'Malformed \\text (found "ext{" — missing backslash)'
		};
	}

	// standalone "imes" (corrupted \times)
	if (/(?<![a-zA-Z\\])imes\b/.test(input)) {
		return {
			valid: false,
			reason: 'Corrupted \\times (found "imes" — missing backslash)'
		};
	}

	// malformed superscript
	if (/\^\{\\\(/.test(input)) {
		return {
			valid: false,
			reason: 'Malformed superscript syntax'
		};
	}

	// malformed subscript
	if (/_\{\\\(/.test(input)) {
		return {
			valid: false,
			reason: 'Malformed subscript syntax'
		};
	}

	// unicode sigma (should use \sum)
	if (/Σ/.test(input)) {
		return {
			valid: false,
			reason: 'Use \\sum instead of Unicode Σ'
		};
	}

	// unicode multiplication (should use \times or \cdot)
	if (/×/.test(input)) {
		return {
			valid: false,
			reason: 'Use \\times or \\cdot instead of Unicode ×'
		};
	}

	// pseudo-math collapsed variable names
	if (
		/Weightingdebt|Costt(?!\\)|(?<![\\a-zA-Z])CFt(?![_{}])|(?<![\\a-zA-Z])rt(?![_{}\\a-zA-Z])/.test(input)
	) {
		return {
			valid: false,
			reason: 'Detected pseudo-math variable naming (use subscripts: CF_t, r_t)'
		};
	}

	// collapsed words in descriptions (8+ lowercase chars without spaces)
	if (/[a-z]{20,}/.test(input)) {
		return {
			valid: false,
			reason: 'Detected collapsed words without spaces in description'
		};
	}

	// bare asterisk as multiplication (should be \times or \cdot)
	if (/[a-zA-Z0-9)}\]]\s*\*\s*[a-zA-Z0-9({\\]/.test(input)) {
		return {
			valid: false,
			reason: 'Use \\times or \\cdot instead of bare * for multiplication'
		};
	}

	// plain-text detection: if no LaTeX syntax chars and formula is non-trivial
	const hasLatexSyntax = /[\\{}_^]/.test(input);
	if (!hasLatexSyntax && input.length > 12) {
		return {
			valid: false,
			reason: 'Plain-text formula without any LaTeX syntax'
		};
	}

	return {
		valid: true
	};
}

/**
 * =========================================================
 * MAIN VALIDATOR
 * =========================================================
 */

export function validateLatexFormula(input) {

	if (
		input === null ||
		input === undefined
	) {

		return {
			valid: false,
			reason: 'Empty formula'
		};
	}

	const s = String(input);

	if (!s.trim()) {

		return {
			valid: false,
			reason: 'Empty formula'
		};
	}

	/**
	 * -----------------------------------------
	 * REGEX VALIDATION
	 * -----------------------------------------
	 */

	const regexCheck =
		regexValidation(s);

	if (!regexCheck.valid) {
		return regexCheck;
	}

	/**
	 * -----------------------------------------
	 * BALANCED BRACES
	 * -----------------------------------------
	 */

	let brace = 0;

	for (let i = 0; i < s.length; i++) {

		const ch = s[i];

		const prev =
			i > 0
				? s[i - 1]
				: '';

		if (
			ch === '{' &&
			prev !== '\\'
		) {

			brace++;
		}

		else if (
			ch === '}' &&
			prev !== '\\'
		) {

			brace--;

			if (brace < 0) {

				return {
					valid: false,
					reason:
						'Unbalanced closing brace'
				};
			}
		}
	}

	if (brace !== 0) {

		return {
			valid: false,
			reason:
				`Unbalanced braces (${brace} unclosed)`
		};
	}

	/**
	 * -----------------------------------------
	 * \left and \right
	 * -----------------------------------------
	 */

	const lefts =
		(s.match(/\\left\b/g) || []).length;

	const rights =
		(s.match(/\\right\b/g) || []).length;

	if (lefts !== rights) {

		return {
			valid: false,
			reason:
				`\\left/\\right mismatch (${lefts} vs ${rights})`
		};
	}

	/**
	 * -----------------------------------------
	 * EMPTY DELIMITERS
	 * -----------------------------------------
	 */

	if (
		/\\\(\s*\\\)/.test(s) ||
		/\\\[\s*\\\]/.test(s)
	) {

		return {
			valid: false,
			reason:
				'Empty math delimiters'
		};
	}

	/**
	 * -----------------------------------------
	 * KATEX VALIDATION
	 * -----------------------------------------
	 */

	// Strip math delimiters before passing to KaTeX
	// KaTeX expects bare math content, not \[...\] or \(...\) wrappers
	let mathContent = s.trim();
	if (mathContent.startsWith('\\[') && mathContent.endsWith('\\]')) {
		mathContent = mathContent.slice(2, -2).trim();
	} else if (mathContent.startsWith('\\(') && mathContent.endsWith('\\)')) {
		mathContent = mathContent.slice(2, -2).trim();
	}

	// If after stripping delimiters there's no content, skip KaTeX check
	if (!mathContent) {
		return { valid: false, reason: 'Empty formula after stripping delimiters' };
	}

	try {

		katex.renderToString(mathContent, {

			throwOnError: true,

			strict: 'warn',

			displayMode: true
		});

		return {
			valid: true
		};

	} catch (err) {

		return {
			valid: false,
			reason:
				err?.message ||
				'KaTeX validation failed'
		};
	}
}

/**
 * =========================================================
 * VALIDATE ARRAY OF FORMULAS
 * =========================================================
 */

export function validateFormulaItems(items = []) {

	const invalid = [];

	for (let i = 0; i < items.length; i++) {

		const rawFormula = items[i]?.formula;

		// Step 1: Try auto-repair before validation
		const repairedFormula = autoRepairLatex(rawFormula);
		if (repairedFormula !== rawFormula) {
			items[i].formula = repairedFormula;
			console.log(`[formula-repair] Auto-repaired formula ${i} ("${items[i]?.name || 'unnamed'}")`);
		}

		// Step 2: Validate the (possibly repaired) formula
		const validation = validateLatexFormula(repairedFormula);

		if (!validation.valid) {
			invalid.push({
				index: i,
				name: items[i]?.name || '',
				formula: repairedFormula,
				reason: validation.reason
			});
		}
	}

	return invalid;
}

/**
 * =========================================================
 * OPENAI GENERATION + RETRY LOOP
 * =========================================================
 */

export async function generateValidLatex({

	openai,

	model = 'gpt-4o-mini',

	systemPrompt = '',

	userPrompt = '',

	maxRetries = 4,

	temperature = 0.2

}) {

	let currentPrompt =
		userPrompt;

	for (
		let attempt = 1;
		attempt <= maxRetries;
		attempt++
	) {

		console.log(
			`LaTeX generation attempt ${attempt}`
		);

		const response =
			await openai.chat.completions.create({

				model,

				temperature,

				messages: [

					{
						role: 'system',

						content:
							LATEX_SYSTEM_RULES +
							'\n\n' +
							systemPrompt
					},

					{
						role: 'user',

						content:
							currentPrompt +
							'\n\n' +
							LATEX_PROMPT_SECTION
					}
				]
			});

		const text =
			response?.choices?.[0]
				?.message?.content || '';

		const formulas =
			extractLatexBlocks(text);

		/**
		 * -----------------------------------------
		 * NO FORMULAS FOUND
		 * -----------------------------------------
		 */

		if (!formulas.length) {

			currentPrompt = `
No valid LaTeX formulas were found.

You MUST output formulas wrapped in:

\\[
...
\\]

Regenerate correctly.
`;

			continue;
		}

		/**
		 * -----------------------------------------
		 * VALIDATE FORMULAS
		 * -----------------------------------------
		 */

		const invalid = [];

		for (const formula of formulas) {

			const validation =
				validateLatexFormula(formula);

			if (!validation.valid) {

				invalid.push({

					formula,

					reason:
						validation.reason
				});
			}
		}

		/**
		 * -----------------------------------------
		 * SUCCESS
		 * -----------------------------------------
		 */

		if (!invalid.length) {

			console.log(
				'All formulas valid'
			);

			return {

				success: true,

				text,

				formulas
			};
		}

		/**
		 * -----------------------------------------
		 * REPAIR PROMPT
		 * -----------------------------------------
		 */

		console.log(
			'Invalid formulas detected'
		);

		currentPrompt = `
Your previous response contained INVALID KaTeX formulas.

ERRORS:

${invalid.map(x => `
FORMULA:
${x.formula}

ERROR:
${x.reason}
`).join('\n')}

REGENERATE ALL formulas correctly.

STRICT REQUIREMENTS:
- Valid KaTeX ONLY
- Proper \\frac syntax
- Proper subscripts
- Proper superscripts
- Proper \\sum syntax
- Proper \\text{} usage
- Balanced braces
- No pseudo-math
- ALL formulas inside \\[ ... \\]

DO NOT repeat malformed formulas.
`;
	}

	/**
	 * -----------------------------------------
	 * FAILURE
	 * -----------------------------------------
	 */

	throw new Error(
		'Failed to generate valid LaTeX after maximum retries.'
	);
}