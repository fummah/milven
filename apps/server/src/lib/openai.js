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
You are an expert CFA curriculum content generator.

CRITICAL:
ALL mathematical notation MUST be valid KaTeX-compatible LaTeX.

NEVER generate pseudo-math or plain-text equations.

MANDATORY RULES:

1. ALL formulas wrapped in:
\\[
...
\\]

2. Fractions:
\\frac{a}{b}

3. Subscripts:
x_t
CF_t
r_d
V_L

4. Superscripts:
x^{2}
(1+r)^{t}

5. Summation:
\\sum_{t=1}^{T}

6. Multiplication:
\\cdot

7. Greek letters:
\\alpha
\\beta
\\sigma
\\mu
\\lambda
\\rho
\\delta
\\theta
\\gamma

8. Words inside formulas:
\\text{WACC}
\\text{Cost}
\\text{Debt}
\\text{Equity}

9. Parentheses:
\\left(
\\right)

10. NEVER output:
- Σt=1T
- Costt
- Weightingdebt
- (1+r)t
- rac{D}{E}
- malformed braces
- malformed \\frac
- malformed superscripts

11. Validate formulas before responding.

12. Output ONLY production-ready KaTeX formulas.

CORRECT EXAMPLES:

\\[
PV
=
\\sum_{t=1}^{T}
\\frac{CF_t}{(1+r)^t}
\\]

\\[
\\text{WACC}
=
w_d \\cdot r_d \\cdot (1-t)
+
w_e \\cdot r_e
\\]

\\[
r_e
=
r_0
+
(r_0-r_d)(1-t)
\\frac{D}{E}
\\]
`;

/**
 * =========================================================
 * USER PROMPT APPENDIX
 * =========================================================
 */

export const LATEX_PROMPT_SECTION = `
FORMULA RULES:
- ALL formulas MUST use valid KaTeX LaTeX
- NEVER use plain-text equations
- ALWAYS use \\frac for fractions
- ALWAYS use ^ for exponents
- ALWAYS use _ for subscripts
- ALWAYS use \\sum for summations
- Wrap formulas in \\[ ... \\]
- Use \\text{} for words inside formulas
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
 * EXTRA REGEX SAFETY CHECKS
 * =========================================================
 */

function regexValidation(input) {

	// malformed \frac
	if (/\brac\{/.test(input)) {

		return {
			valid: false,
			reason:
				'Malformed fraction command (missing \\ in \\frac)'
		};
	}

	// malformed superscript
	if (/\^\{\\\(/.test(input)) {

		return {
			valid: false,
			reason:
				'Malformed superscript syntax'
		};
	}

	// malformed subscript
	if (/_\{\\\(/.test(input)) {

		return {
			valid: false,
			reason:
				'Malformed subscript syntax'
		};
	}

	// unicode sigma
	if (/Σ/.test(input)) {

		return {
			valid: false,
			reason:
				'Use \\sum instead of Unicode Σ'
		};
	}

	// pseudo math variables
	if (
		/Weightingdebt|Costt|CFt|rt/.test(input)
	) {

		return {
			valid: false,
			reason:
				'Detected pseudo-math variable naming'
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

	try {

		katex.renderToString(s, {

			throwOnError: true,

			strict: 'error',

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

		const formula =
			items[i]?.formula;

		const validation =
			validateLatexFormula(formula);

		if (!validation.valid) {

			invalid.push({

				index: i,

				name:
					items[i]?.name || '',

				formula,

				reason:
					validation.reason
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