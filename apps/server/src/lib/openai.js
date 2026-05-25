/**
 * Shared OpenAI API key and helpers.
 * Key: OPENAI_API_KEY env or SystemSetting key "openai_api_key".
 */
export async function getOpenAIApiKey(prisma) {
	const envKey = process.env.OPENAI_API_KEY;
	if (envKey && envKey.trim()) return envKey.trim();
	const row = await prisma.systemSetting.findUnique({ where: { key: 'openai_api_key' } });
	const val = row?.value;
	return (typeof val === 'string' ? val : val?.value)?.trim() || null;
}

/**
 * Shared LaTeX formatting rules injected into every AI generation system prompt.
 * Ensures all formulas render correctly in KaTeX / MathJax / React Markdown.
 */
export const LATEX_SYSTEM_RULES = `MATHEMATICAL OUTPUT RULES (MANDATORY):

ALL formulas MUST be valid KaTeX-compatible LaTeX. NEVER output plain-text math.

NEVER write formulas like these (ALL ARE WRONG):
- Weightingdebt (WRONG — must be w_{\\text{debt}} or w_d)
- Costt (WRONG — must be \\text{Cost}_t)
- rt (WRONG — must be r_t)
- Σt=1T (WRONG — must be \\sum_{t=1}^{T})
- (1+r)t (WRONG — must be (1+r)^t)
- PV = CF1/(1+r)1 + CF2/(1+r)2 (WRONG — must use \\frac and ^)
- Expected return (WRONG — must be E(R) or \\text{Expected return})

ALWAYS USE:
1. \\sum_{t=1}^{T} for summations — NEVER write Σt=1T or sum
2. x_t, r_d, V_L for subscripts — NEVER concatenate letters like "rt" or "Vl"
3. x^{2}, (1+r)^{t}, e^{-rT} for superscripts — NEVER write (1+r)t or x2
4. \\frac{a}{b} for fractions — NEVER write a/b in formula fields
5. \\text{...} for ALL multi-letter words inside formulas: \\text{WACC}, \\text{Cost}, \\text{Debt}, \\text{Equity}
6. \\cdot for multiplication — NEVER use * or ×
7. Greek letters: \\alpha, \\beta, \\sigma, \\mu, \\lambda, \\rho, \\delta, \\pi, \\theta, \\epsilon, \\tau, \\gamma, \\phi
8. \\sqrt{...} for roots
9. \\left( and \\right) for auto-sized parentheses around tall expressions

ALL formulas MUST be wrapped in \\[ ... \\] (block display mode).

VALIDATION — BEFORE returning output you MUST check EVERY formula for:
- Balanced braces: every { has a matching }
- Valid subscripts: multi-char uses braces x_{eq} not xeq
- Valid superscripts: multi-char uses braces x^{2n} not x2n
- Valid fractions: \\frac{...}{...} with exactly two brace groups
- Valid summations: \\sum_{...}^{...} not Σ or sum
- No concatenated words without \\text{}: if you see 3+ consecutive lowercase letters not part of a LaTeX command, wrap them in \\text{}
- \\left/\\right pairs balanced
- KaTeX compilation compatibility

IF ANY formula fails validation: REGENERATE it silently before returning.
NEVER return pseudo-LaTeX or plain-text math under any circumstances.

CORRECT EXAMPLES:
- WACC: \\[ \\text{WACC} = w_d \\cdot r_d \\cdot (1 - t) + w_e \\cdot r_e \\]
- PV: \\[ PV = \\sum_{t=1}^{T} \\frac{CF_t}{(1+r)^{t}} \\]
- CAPM: \\[ E(R_i) = R_f + \\beta_i \\left( E(R_m) - R_f \\right) \\]
- Std dev: \\[ \\sigma = \\sqrt{\\frac{\\sum_{i=1}^{n} (x_i - \\bar{x})^{2}}{n-1}} \\]
- Gordon DDM: \\[ P_0 = \\frac{D_1}{r - g} \\]
- Cost of debt: \\[ r_d = \\frac{\\text{Interest Expense}}{\\text{Total Debt}} \\]`;

/**
 * Shorter LaTeX reminder appended to user prompts where formulas appear.
 */
export const LATEX_PROMPT_SECTION = `FORMULA NOTATION (MANDATORY — valid KaTeX LaTeX ONLY):
- ALL formulas wrapped in \\[ ... \\]
- Fractions: \\frac{a}{b} — NEVER use a/b
- Subscripts: x_t, CF_{t}, r_{\\text{debt}} — NEVER concatenate like "rt" or "CFt"
- Superscripts: x^{2}, (1+r)^{t} — NEVER write (1+r)t or x2
- Summation: \\sum_{t=1}^{T} — NEVER write Σt=1T
- Words in math: \\text{WACC}, \\text{Cost} — NEVER bare words like "Cost" or "Weight"
- Greek: \\alpha, \\beta, \\sigma, \\mu, \\rho, \\delta, \\lambda
- Roots: \\sqrt{x}   Multiply: \\cdot   Products: \\prod
- ALL braces balanced. Validate every formula before returning.
- NEVER output plain-text math or pseudo-LaTeX.`;

/**
 * Validate a single LaTeX formula string.
 * Returns { valid: boolean, reason?: string }.
 * Checks: balanced braces, balanced parentheses, \frac has 2 brace groups,
 * \left/\right counts match, no malformed escape sequences.
 */
export function validateLatexFormula(input) {
	if (input === null || input === undefined) return { valid: false, reason: 'empty' };
	const s = String(input);
	if (!s.trim()) return { valid: false, reason: 'empty' };

	// 1. Balanced braces — track ignoring escaped \{ and \}
	let brace = 0;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		const prev = i > 0 ? s[i - 1] : '';
		if (ch === '{' && prev !== '\\') brace++;
		else if (ch === '}' && prev !== '\\') {
			brace--;
			if (brace < 0) return { valid: false, reason: 'unbalanced closing brace' };
		}
	}
	if (brace !== 0) return { valid: false, reason: `unbalanced braces (${brace} unclosed)` };

	// 2. \frac must be followed by two brace groups
	const fracMatches = [...s.matchAll(/\\frac\b/g)];
	for (const m of fracMatches) {
		const after = s.substring(m.index + m[0].length);
		const trimmed = after.replace(/^\s+/, '');
		if (!trimmed.startsWith('{')) return { valid: false, reason: '\\frac missing first brace group' };
		// find matching close
		let d = 0, idx = 0;
		for (; idx < trimmed.length; idx++) {
			const c = trimmed[idx];
			const p = idx > 0 ? trimmed[idx - 1] : '';
			if (c === '{' && p !== '\\') d++;
			else if (c === '}' && p !== '\\') { d--; if (d === 0) { idx++; break; } }
		}
		if (d !== 0) return { valid: false, reason: '\\frac first group not closed' };
		const rest = trimmed.substring(idx).replace(/^\s+/, '');
		if (!rest.startsWith('{')) return { valid: false, reason: '\\frac missing second brace group' };
	}

	// 3. \left and \right counts must match
	const lefts = (s.match(/\\left\b/g) || []).length;
	const rights = (s.match(/\\right\b/g) || []).length;
	if (lefts !== rights) return { valid: false, reason: `\\left/\\right unbalanced (${lefts} vs ${rights})` };

	// 4. No malformed escape sequences like \(\alpha inside a sub/superscript group
	if (/\^\{\\\(/.test(s) || /_\{\\\(/.test(s)) return { valid: false, reason: 'malformed escape inside sub/superscript' };

	// 5. Detect empty math delimiters
	if (/\\\(\s*\\\)/.test(s) || /\\\[\s*\\\]/.test(s)) return { valid: false, reason: 'empty math delimiters' };

	// 6. Detect plain-text pseudo-math (no LaTeX at all)
	// If formula has no LaTeX commands (\frac, \sum, _, ^, \text, etc.) and is longer than 10 chars, likely plain text
	const hasLatex = /[\\{}_^]/.test(s);
	if (!hasLatex && s.length > 10) return { valid: false, reason: 'plain-text formula without any LaTeX syntax' };

	// 7. Detect concatenated words that should use \text{} — e.g. "Weightingdebt", "Costt"
	// Strip known LaTeX commands first for this check
	const stripped = s.replace(/\\[a-zA-Z]+(\{[^}]*\})?/g, ' ').replace(/[{}\\^_]/g, ' ');
	// Look for 6+ consecutive lowercase letters (likely a word not wrapped in \text{})
	const longWords = stripped.match(/[a-z]{6,}/gi);
	if (longWords) {
		// Allow common LaTeX-safe names
		const allowed = new Set(['sqrt', 'frac', 'left', 'right', 'text', 'cdot', 'times', 'alpha', 'beta', 'sigma', 'delta', 'theta', 'gamma', 'lambda', 'epsilon', 'infty', 'partial', 'nabla', 'mathbb', 'mathcal', 'mathrm', 'overline', 'underline']);
		const bad = longWords.filter(w => !allowed.has(w.toLowerCase()));
		if (bad.length > 0) return { valid: false, reason: `plain-text word(s) not wrapped in \\text{}: "${bad.slice(0, 3).join('", "')}"` };
	}

	// 8. Detect Unicode Σ (should be \sum)
	if (/Σ/.test(s)) return { valid: false, reason: 'Unicode Σ used instead of \\sum' };

	// 9. Detect pattern like ")t" or ")T" — likely missing ^ for exponent
	if (/\)[a-zA-Z0-9]/.test(s) && !hasLatex) return { valid: false, reason: 'likely missing ^ for exponent after closing paren' };

	return { valid: true };
}

/**
 * Validate an array of formula items (each with .formula field).
 * Returns an array of { index, reason } for any invalid entries.
 */
export function validateFormulaItems(items) {
	const invalid = [];
	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		const v = validateLatexFormula(it?.formula);
		if (!v.valid) invalid.push({ index: i, name: it?.name, reason: v.reason });
	}
	return invalid;
}
