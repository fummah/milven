/**
 * Shared formula / math rendering utilities.
 *
 * safeHtml          – unescape HTML entities that may have been stored escaped
 * renderFormulaHtml – convert plain-text math notation (^, _, Greek letters …)
 *                     into rich HTML with <sup>, <sub>, fractions, etc.
 * renderLatex       – detect LaTeX delimiters \( … \) and \[ … \] and render
 *                     them to HTML via KaTeX, leaving surrounding text intact.
 * formatFormulaHtml – convenience combo: detects LaTeX first; falls back to
 *                     legacy plain-text rendering for older content.
 */

import katex from 'katex';
import 'katex/dist/katex.min.css';

/* ─── helpers ────────────────────────────────────────────────────────────── */

/**
 * Unescape HTML entities that may have been double-escaped when stored in the DB.
 */
export function safeHtml(html) {
	if (html == null || typeof html !== 'string') return '';
	return html
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

/**
 * Return true when the string contains LaTeX delimiters \( … \) or \[ … \].
 */
export function containsLatex(text) {
	if (!text) return false;
	return /\\\([\s\S]*?\\\)/.test(text) || /\\\[[\s\S]*?\\\]/.test(text);
}

/* ─── KaTeX renderer ─────────────────────────────────────────────────────── */

/**
 * Render a single LaTeX expression to HTML via KaTeX.
 * Returns the original string on failure so the page never breaks.
 */
function katexToHtml(latex, displayMode = false) {
	try {
		return katex.renderToString(latex, {
			displayMode,
			throwOnError: false,
			trust: true,
			strict: false,
		});
	} catch {
		return latex;
	}
}

/**
 * Find every \( … \) (inline) and \[ … \] (block) in *text* and replace
 * them with KaTeX-rendered HTML.  Non-LaTeX text passes through unchanged.
 */
export function renderLatex(text) {
	if (!text) return '';

	// Process block math first  \[ … \]
	let result = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, expr) =>
		katexToHtml(expr.trim(), true)
	);

	// Then inline math  \( … \)
	result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, expr) =>
		katexToHtml(expr.trim(), false)
	);

	return result;
}

/* ─── legacy plain-text renderer (for old content without LaTeX) ─────────── */

/**
 * Convert plain-text formula notation into rich HTML with subscripts,
 * superscripts, fraction bars, Greek letters, and other financial math
 * formatting.
 *
 * Notation recognised
 * ───────────────────
 *   X_0  X_{equity}       → X<sub>0</sub>  X<sub>equity</sub>
 *   X^2  X^{n-1}          → X<sup>2</sup>  X<sup>n-1</sup>
 *   (a+b) / (c+d)         → stacked fraction
 *   sqrt(x)               → √(x)
 *   sigma, beta, alpha …  → σ, β, α …
 *   *                      → ×
 */
export function renderFormulaHtml(text) {
	if (!text) return '';
	let html = text
		// Escape HTML entities first so raw user text is safe
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

		// Fractions: (numerator) / (denominator) → stacked
		.replace(
			/\(([^)]+)\)\s*\/\s*\(([^)]+)\)/g,
			'<span class="formula-frac"><span class="formula-frac-num">$1</span><span class="formula-frac-den">$2</span></span>'
		)

		// Subscripts: X_0, X_{abc}
		.replace(/_(\{[^}]+\}|[A-Za-z0-9]+)/g, (_, m) => {
			const inner = m.startsWith('{') ? m.slice(1, -1) : m;
			return `<sub>${inner}</sub>`;
		})

		// Superscripts: X^2, X^{n-1}
		.replace(/\^(\{[^}]+\}|[A-Za-z0-9]+)/g, (_, m) => {
			const inner = m.startsWith('{') ? m.slice(1, -1) : m;
			return `<sup>${inner}</sup>`;
		})

		// Square root
		.replace(/sqrt\(([^)]+)\)/gi, '√($1)')

		// Summation
		.replace(/\bsum\b/gi, 'Σ')

		// Greek letters commonly used in finance
		.replace(/\balpha\b/gi, 'α')
		.replace(/\bbeta\b/gi, 'β')
		.replace(/\bgamma\b/gi, 'γ')
		.replace(/\bdelta\b/gi, 'δ')
		.replace(/\bsigma\b/gi, 'σ')
		.replace(/\bmu\b/gi, 'μ')
		.replace(/\brho\b/gi, 'ρ')
		.replace(/\blambda\b/gi, 'λ')
		.replace(/\bpi\b/gi, 'π')
		.replace(/\btheta\b/gi, 'θ')
		.replace(/\bepsilon\b/gi, 'ε')
		.replace(/\btau\b/gi, 'τ')
		.replace(/\binfinity\b/gi, '∞')
		.replace(/\bDelta\b/g, 'Δ')   // capital Delta (case-sensitive)
		.replace(/\bSigma\b/g, 'Σ')   // capital Sigma
		.replace(/\bOmega\b/g, 'Ω')
		.replace(/\bPhi\b/g, 'Φ')

		// Multiply sign
		.replace(/\s\*\s/g, ' × ')

		// Plus-minus
		.replace(/\+\/-/g, '±')
		.replace(/\+-/g, '±');

	return html;
}

/* ─── main public API ────────────────────────────────────────────────────── */

/**
 * Convenience: unescape stored HTML entities, then render formula notation.
 * Use this for fields like keyFormulas, workedSolution, explanation, etc.
 * that may contain a mix of HTML and plain-text formula notation.
 *
 * Automatically detects LaTeX (\( … \), \[ … \]) and renders via KaTeX.
 * Falls back to the legacy renderFormulaHtml for older plain-text content.
 */
export function formatFormulaHtml(html) {
	if (!html) return '';
	const unescaped = safeHtml(html);

	// ── New path: KaTeX rendering for content with LaTeX delimiters ──
	if (containsLatex(unescaped)) {
		return renderLatex(unescaped);
	}

	// ── Legacy path: plain-text notation (for old content) ──
	if (/<su[bp]>/i.test(unescaped)) {
		// Process only text outside of HTML tags
		return unescaped.replace(/(>)([^<]+)(<)/g, (_, open, text, close) => {
			return open + renderFormulaHtml(text) + close;
		});
	}

	return renderFormulaHtml(unescaped);
}
