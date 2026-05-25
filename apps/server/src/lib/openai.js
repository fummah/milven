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
1. ALL mathematical formulas MUST use valid LaTeX syntax.
2. Inline formulas MUST be wrapped in \\( ... \\) delimiters.
3. Block/display formulas MUST be wrapped in \\[ ... \\] delimiters.
4. Fractions MUST use \\frac{numerator}{denominator}, e.g. \\frac{CF_1}{(1+r)^t}.
5. Exponents/superscripts MUST use ^{...} with curly braces for multi-char: x^{2}, k^{\\alpha}, L^{1-\\alpha}.
6. Subscripts MUST use _{...} with curly braces for multi-char: R_{equity}, CF_{t}, \\sigma_{p}.
7. Greek symbols MUST use LaTeX commands: \\alpha, \\beta, \\sigma, \\mu, \\lambda, \\rho, \\delta, \\pi, \\theta, \\epsilon, \\tau, \\gamma, \\phi.
8. Square roots MUST use \\sqrt{...}, e.g. \\sqrt{\\frac{\\sum (x_i - \\mu)^{2}}{N}}.
9. Summation MUST use \\sum_{i=1}^{n}, products \\prod_{i=1}^{n}.
10. NEVER output broken LaTeX: no mixed markdown+latex, no unclosed braces, no malformed escapes like k^{\\(\\alpha}.
11. ALWAYS close every { with }, every ( with ), every \\left( with \\right).
12. NEVER wrap LaTeX inside markdown code blocks or backticks.
13. Output clean, render-ready notation suitable for KaTeX and MathJax.
14. Validate every formula for balanced braces, valid superscripts, valid fractions, proper Greek notation, and no malformed escape characters before including it.

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
