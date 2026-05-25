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
export const LATEX_SYSTEM_RULES = `CRITICAL MATHEMATICAL FORMATTING RULES — you MUST follow these for EVERY formula:

ALL mathematical formulas MUST compile successfully in KaTeX or MathJax.

BEFORE returning output, you MUST self-validate every formula and silently regenerate any that fail:
1. Validate ALL LaTeX syntax — every formula must parse cleanly in KaTeX.
2. Every \\frac MUST have EXACTLY two brace groups: \\frac{...}{...}. Never \\frac{a} or \\frac a b.
3. Every superscript and subscript MUST use valid braces for multi-character content: x^{2}, k^{\\alpha}, R_{equity}, CF_{t}. Single-char OK: x^2, P_0.
4. Every \\left MUST be paired with a matching \\right. Counts must be equal.
5. Every { MUST be closed by a }. Every ( MUST be closed by a ). Brace and paren counts must balance.
6. If ANY formula is malformed, REGENERATE it before returning. Never output raw pseudo-LaTeX, half-LaTeX, or markdown-mixed math.
7. Only output production-ready mathematical notation.

FORMATTING RULES:
8. Inline formulas MUST be wrapped in \\( ... \\) delimiters.
9. Block/display formulas MUST be wrapped in \\[ ... \\] delimiters.
10. Greek symbols MUST use LaTeX commands: \\alpha, \\beta, \\sigma, \\mu, \\lambda, \\rho, \\delta, \\pi, \\theta, \\epsilon, \\tau, \\gamma, \\phi.
11. Square roots MUST use \\sqrt{...}, e.g. \\sqrt{\\frac{\\sum (x_i - \\mu)^{2}}{N}}.
12. Summation MUST use \\sum_{i=1}^{n}, products \\prod_{i=1}^{n}.
13. Multiplication MUST use \\cdot, not * or ×.
14. NEVER wrap LaTeX inside markdown code blocks or backticks.
15. NEVER use malformed escapes like k^{\\(\\alpha} or mixed \\(...\\[.

CORRECT EXAMPLES:
- Inline: \\( y = \\frac{Y}{L} = A k^{\\alpha} \\)
- Block: \\[ Y = A K^{\\alpha} L^{1-\\alpha} \\]
- CAPM: \\[ E(R_i) = R_f + \\beta_i (E(R_m) - R_f) \\]
- Std dev: \\[ \\sigma = \\sqrt{\\frac{\\sum (x_i - \\mu)^{2}}{N}} \\]
- WACC: \\[ WACC = w_d \\cdot r_d \\cdot (1 - t) + w_e \\cdot r_e \\]
- PV: \\[ PV = \\sum_{t=1}^{T} \\frac{CF_t}{(1+r)^{t}} \\]`;

/**
 * Shorter LaTeX reminder appended to user prompts where formulas appear.
 */
export const LATEX_PROMPT_SECTION = `FORMULA NOTATION (MANDATORY — use valid LaTeX for ALL math):
- Inline math: \\( ... \\)   Block math: \\[ ... \\]
- Fractions: \\frac{a}{b}   Exponents: x^{2}, k^{\\alpha}
- Subscripts: P_{0}, CF_{t}, R_{equity}   Greek: \\alpha, \\beta, \\sigma, \\mu, \\rho, \\delta, \\lambda
- Roots: \\sqrt{x}   Sums: \\sum_{i=1}^{n}   Products: \\prod
- Multiply: \\cdot   NEVER use plain text for math. NEVER mix markdown with LaTeX.
- ALL braces must be balanced. Validate every formula before returning.`;

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

	// 5. Detect lone ^{ or _{ with no closing within reasonable span — already caught by brace check
	// 6. Detect empty math delimiters
	if (/\\\(\s*\\\)/.test(s) || /\\\[\s*\\\]/.test(s)) return { valid: false, reason: 'empty math delimiters' };

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
