/**
 * Shared formula / math rendering utilities.
 *
 * formulaSanitizer           – repair corrupted LaTeX (missing backslashes, tab corruption)
 * normalizeVariableDescription – fix merged words in variable descriptions
 * safeHtml                   – unescape HTML entities that may have been stored escaped
 * renderFormulaHtml          – convert plain-text math notation (^, _, Greek letters …)
 *                              into rich HTML with <sup>, <sub>, fractions, etc.
 * renderLatex                – detect LaTeX delimiters \( … \) and \[ … \] and render
 *                              them to HTML via KaTeX, leaving surrounding text intact.
 * formatFormulaHtml          – main pipeline: sanitize → detect format → render
 */

import katex from 'katex';
import 'katex/dist/katex.min.css';

/* ═══════════════════════════════════════════════════════════════════════════
   §1  FORMULA SANITIZER — repair corrupted/malformed LaTeX
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Known LaTeX commands that may lose their backslash during JSON parsing or
 * storage. When OpenAI returns JSON with `\times`, JSON.parse interprets `\t`
 * as a tab character, leaving `<TAB>imes`. Similarly `\beta` → `\b` = backspace + "eta".
 */
const LATEX_COMMANDS = [
	'times', 'cdot', 'frac', 'sqrt', 'text', 'left', 'right',
	'sum', 'prod', 'int', 'lim', 'ln', 'log', 'exp',
	'sin', 'cos', 'tan',
	'alpha', 'beta', 'gamma', 'delta', 'sigma', 'mu', 'rho',
	'lambda', 'pi', 'theta', 'epsilon', 'tau', 'phi', 'omega',
	'nu', 'kappa', 'chi', 'psi', 'zeta', 'eta', 'xi',
	'Delta', 'Sigma', 'Omega', 'Phi', 'Theta', 'Lambda', 'Gamma',
	'Pi', 'Psi', 'Xi',
	'overline', 'bar', 'hat', 'tilde', 'vec', 'mathbf', 'mathrm',
	'geq', 'leq', 'neq', 'approx', 'infty', 'pm', 'mp',
	'forall', 'exists', 'partial', 'nabla',
];

/**
 * Repair common LaTeX corruption patterns.
 *
 * Root causes:
 *  - JSON.parse interprets \t as tab, \b as backspace, \n as newline, \f as formfeed
 *  - Backslash stripping by sanitisation layers
 *  - Partial escape sequences
 *
 * This function MUST run before any rendering.
 */
export function formulaSanitizer(text) {
	if (!text || typeof text !== 'string') return text || '';

	let s = text;

	// ── Fix JSON escape corruption ──────────────────────────────────────
	// \t + "imes"  →  \times   (tab char before "imes")
	s = s.replace(/\times/g, '\\times');
	// \b + "eta"   →  \beta    (backspace char before "eta")
	s = s.replace(/\beta/g, '\\beta');
	// \b + "ar"    →  \bar     (backspace char before "ar")
	// Only fix when followed by '{' or non-letter (avoid corrupting words like "are", "barn")
	s = s.replace(/\bar(?=[{^_ ]|$)/g, '\\bar');
	// \f + "rac"   →  \frac    (formfeed char before "rac")
	s = s.replace(/\frac/g, '\\frac');
	// \n + "u"     →  \nu      (newline before "u", only in formula context)
	// \n + "abla"  →  \nabla
	// These are tricky because \n could be legitimate newlines.
	// Only repair if followed by known command suffixes without space.
	s = s.replace(/\nu(?=[^a-zA-Z]|$)/g, '\\nu');
	s = s.replace(/\nabla/g, '\\nabla');

	// ── Fix standalone "imes" (leftover from corruption) ────────────────
	s = s.replace(/(?<![a-zA-Z\\])imes\b/g, '\\times');

	// ── Fix missing backslashes before known commands ────────────────────
	// Only add backslash if the command is NOT already preceded by one.
	// Use negative lookbehind for backslash.
	for (const cmd of LATEX_COMMANDS) {
		// Match the command at a word boundary, not preceded by a backslash or letter
		// Example: "times" → "\times" but not "sometimes" or "\\times"
		const re = new RegExp(`(?<!\\\\)(?<![a-zA-Z])${escapeRegex(cmd)}(?![a-zA-Z])`, 'g');
		s = s.replace(re, '\\' + cmd);
	}

	// ── Remove double backslashes that crept in from over-correction ────
	// e.g., \\\\times → \\times
	s = s.replace(/\\{3,}(times|cdot|frac|sqrt|text|alpha|beta|gamma|delta|sigma|mu|rho|lambda|pi|theta|epsilon|tau|phi|omega|Delta|Sigma|Omega|Phi|Theta|Lambda|Gamma|left|right|sum|prod|int|lim|ln|log|exp|sin|cos|tan|overline|bar|hat|tilde|vec|mathbf|mathrm|geq|leq|neq|approx|infty|pm|nu|kappa|chi|psi|zeta|eta|xi|Pi|Psi|Xi|mp|forall|exists|partial|nabla)\b/g, '\\$1');

	// ── Fix double-escaped LaTeX delimiters ─────────────────────────────
	// JSON escaping often produces \\( instead of \(, \\[ instead of \[
	s = s.replace(/\\\\\(/g, '\\(');  // \\( → \(
	s = s.replace(/\\\\\)/g, '\\)');  // \\) → \)
	s = s.replace(/\\\\\[/g, '\\[');  // \\[ → \[
	s = s.replace(/\\\\\]/g, '\\]');  // \\] → \]

	// ── Clean up stray control characters ───────────────────────────────
	// Remove any remaining literal tab/backspace/formfeed that shouldn't be there
	s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

	return s;
}

function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ═══════════════════════════════════════════════════════════════════════════
   §2  VARIABLE DESCRIPTION NORMALIZER — fix merged/concatenated words
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Common finance/CFA vocabulary for dictionary-based word segmentation.
 * Ordered from longest to shortest to prefer longer matches.
 */
const FINANCE_WORDS = [
	'portfolio', 'expected', 'return', 'market', 'standard', 'deviation',
	'variance', 'covariance', 'correlation', 'coefficient', 'weighted',
	'average', 'present', 'value', 'future', 'interest', 'rate', 'risk',
	'free', 'premium', 'excess', 'total', 'annual', 'annualized',
	'compound', 'compounding', 'continuous', 'continuously', 'discrete',
	'holding', 'period', 'investment', 'horizon', 'maturity',
	'yield', 'coupon', 'bond', 'stock', 'equity', 'debt', 'asset',
	'liability', 'capital', 'cost', 'weight', 'proportion', 'fraction',
	'number', 'periods', 'years', 'months', 'days', 'time',
	'initial', 'final', 'beginning', 'ending', 'current', 'spot',
	'forward', 'futures', 'option', 'strike', 'exercise', 'price',
	'dividend', 'growth', 'earnings', 'income', 'cash', 'flow',
	'payment', 'annuity', 'perpetuity', 'discount', 'factor',
	'probability', 'distribution', 'normal', 'log', 'mean', 'median',
	'mode', 'skewness', 'kurtosis', 'percentile', 'quartile',
	'beta', 'alpha', 'gamma', 'delta', 'sigma', 'theta', 'lambda',
	'epsilon', 'omega', 'phi', 'rho', 'tau', 'mu', 'pi', 'nu',
	'systematic', 'unsystematic', 'diversifiable', 'idiosyncratic',
	'sharpe', 'ratio', 'treynor', 'jensen', 'information',
	'tracking', 'error', 'benchmark', 'index', 'security', 'line',
	'frontier', 'efficient', 'optimal', 'minimum', 'maximum',
	'inflation', 'nominal', 'real', 'after', 'before', 'tax',
	'gross', 'net', 'operating', 'margin', 'leverage', 'financial',
	'from', 'with', 'that', 'this', 'each', 'over', 'under',
	'above', 'below', 'between', 'among', 'into', 'onto',
	'the', 'for', 'and', 'not', 'but', 'per', 'all',
	'of', 'in', 'on', 'at', 'to', 'by', 'is', 'as', 'or', 'an', 'a',
].sort((a, b) => b.length - a.length);

/**
 * Normalize variable descriptions that may have merged/concatenated words.
 *
 * Examples:
 *   "expectedreturnofthemarket" → "expected return of the market"
 *   "alphaoftheportfolio"       → "alpha of the portfolio"
 *   "risk−freerate"             → "risk-free rate"
 *
 * Strategy:
 *   1. Split camelCase → words
 *   2. For runs of lowercase chars without spaces, do greedy dictionary segmentation
 *   3. Normalize dashes and whitespace
 */
export function normalizeVariableDescription(text) {
	if (!text || typeof text !== 'string') return text || '';

	// Don't process strings that are short or already have reasonable spacing
	// (more than 40% spaces relative to length)
	const spaceRatio = (text.match(/ /g) || []).length / text.length;
	if (spaceRatio > 0.1 || text.length < 8) return text;

	let result = text;

	// Step 1: Split camelCase (e.g., "expectedReturn" → "expected Return")
	result = result.replace(/([a-z])([A-Z])/g, '$1 $2');

	// Step 2: Normalize unicode dashes to regular hyphens
	result = result.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');

	// Step 3: Dictionary-based word segmentation for merged lowercase runs
	result = result.replace(/[a-z]{8,}/gi, (match) => segmentWords(match));

	// Step 4: Clean up extra whitespace
	result = result.replace(/\s{2,}/g, ' ').trim();

	return result;
}

/**
 * Greedy dictionary-based word segmentation.
 * Finds the longest matching word from the front, then recurses.
 */
function segmentWords(str) {
	if (!str) return '';
	const lower = str.toLowerCase();
	const words = [];
	let pos = 0;

	while (pos < lower.length) {
		let matched = false;
		// Try longest word first
		for (const word of FINANCE_WORDS) {
			if (lower.startsWith(word, pos)) {
				words.push(str.slice(pos, pos + word.length));
				pos += word.length;
				matched = true;
				break;
			}
		}
		if (!matched) {
			// No dictionary match — consume one character
			words.push(str[pos]);
			pos++;
		}
	}

	// Only return segmented version if we found at least 2 words
	const segmented = words.join(' ');
	if (words.length >= 2 && segmented !== str) return segmented;
	return str;
}

/* ═══════════════════════════════════════════════════════════════════════════
   §3  HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

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

/**
 * Return true when the string contains raw LaTeX commands WITHOUT delimiters.
 * Detects: \text{}, \frac{}, \sqrt{}, \cdot, \times, and backslash-prefixed Greek letters.
 */
function containsLatexCommands(text) {
	if (!text) return false;
	return /\\(text|frac|sqrt|cdot|times|left|right|sum|prod|int|lim|ln|log|overline|bar|hat|tilde|vec|mathbf|mathrm|alpha|beta|gamma|delta|sigma|mu|rho|lambda|pi|theta|epsilon|tau|phi|omega|nu|kappa|chi|psi|zeta|eta|xi|Delta|Sigma|Omega|Phi|Theta|Lambda|Gamma|Pi|Psi|Xi)\b/.test(text);
}

/**
 * Strip LaTeX commands to plain text for fallback rendering.
 */
function stripLatexCommands(text) {
	if (!text) return '';
	return text
		.replace(/\\text\{([^}]*)\}/g, '$1')
		.replace(/\\overline\{([^}]*)\}/g, '$1')
		.replace(/\\bar\{([^}]*)\}/g, '$1')
		.replace(/\\hat\{([^}]*)\}/g, '$1')
		.replace(/\\mathbf\{([^}]*)\}/g, '$1')
		.replace(/\\mathrm\{([^}]*)\}/g, '$1')
		.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
		.replace(/\\sqrt\{([^}]*)\}/g, 'sqrt($1)')
		.replace(/\\cdot/g, ' · ')
		.replace(/\\times/g, ' × ')
		.replace(/\\left/g, '')
		.replace(/\\right/g, '')
		.replace(/\\geq/g, '≥')
		.replace(/\\leq/g, '≤')
		.replace(/\\neq/g, '≠')
		.replace(/\\approx/g, '≈')
		.replace(/\\infty/g, '∞')
		.replace(/\\pm/g, '±')
		.replace(/\\alpha/g, 'alpha')
		.replace(/\\beta/g, 'beta')
		.replace(/\\gamma/g, 'gamma')
		.replace(/\\delta/g, 'delta')
		.replace(/\\sigma/g, 'sigma')
		.replace(/\\mu/g, 'mu')
		.replace(/\\rho/g, 'rho')
		.replace(/\\lambda/g, 'lambda')
		.replace(/\\pi/g, 'pi')
		.replace(/\\theta/g, 'theta')
		.replace(/\\epsilon/g, 'epsilon')
		.replace(/\\tau/g, 'tau')
		.replace(/\\phi/g, 'phi')
		.replace(/\\omega/g, 'omega')
		.replace(/\\Delta/g, 'Delta')
		.replace(/\\Sigma/g, 'Sigma')
		.replace(/\\Omega/g, 'Omega')
		.replace(/\\Phi/g, 'Phi')
		.replace(/\\Theta/g, 'Theta')
		.replace(/\\Lambda/g, 'Lambda')
		.replace(/\\Gamma/g, 'Gamma')
		.replace(/\\\\/g, '');
}

/**
 * Render a string that contains raw LaTeX commands (without \( \) or \[ \] delimiters).
 * Splits by newlines/semicolons, renders each variable segment via KaTeX,
 * falls back to stripping LaTeX + HTML rendering on failure.
 */
function renderRawLatex(text) {
	if (!text) return '';

	// Pre-balance braces: strip trailing unmatched closing braces
	const balanceBraces = (s) => {
		let depth = 0;
		for (const ch of s) {
			if (ch === '{') depth++;
			else if (ch === '}') { if (depth > 0) depth--; else return s; }
		}
		// Remove excess trailing } chars that would cause KaTeX parse errors
		let result = s;
		let extra = depth < 0 ? -depth : 0;
		while (extra > 0 && result.endsWith('}')) { result = result.slice(0, -1).trimEnd(); extra--; }
		return result;
	};

	// Split by newlines first; each line may contain semicolons separating variables
	const lines = text.split('\n').filter(l => l.trim());
	const renderedLines = lines.map(line => {
		const balanced = balanceBraces(line.trim());

		// Try rendering the whole line as KaTeX first (most efficient)
		try {
			return katex.renderToString(balanced, {
				displayMode: false,
				throwOnError: false,
				trust: true,
				strict: false,
			});
		} catch {
			// Whole line failed — split by semicolons (brace-aware) and try each segment
		}

		const segments = splitOutsideBraces(balanced, ';');
		const renderedSegments = segments.map(segment => {
			const trimmed = segment.trim();
			if (!trimmed) return '';
			try {
				return katex.renderToString(trimmed, {
					displayMode: false,
					throwOnError: false,
					trust: true,
					strict: false,
				});
			} catch {
				// KaTeX failed — fall back to stripping commands + HTML rendering
				return renderFormulaHtml(stripLatexCommands(trimmed));
			}
		});
		return renderedSegments.join('; ');
	});

	return renderedLines.join('<br>');
}

/**
 * Split a string by a delimiter, but only when the delimiter is NOT inside curly braces.
 */
function splitOutsideBraces(str, delimiter) {
	const result = [];
	let current = '';
	let depth = 0;
	for (let i = 0; i < str.length; i++) {
		const ch = str[i];
		if (ch === '{') { depth++; current += ch; }
		else if (ch === '}') { depth = Math.max(0, depth - 1); current += ch; }
		else if (ch === delimiter && depth === 0) {
			result.push(current);
			current = '';
		} else {
			current += ch;
		}
	}
	if (current) result.push(current);
	return result.filter(s => s.trim());
}

/* ═══════════════════════════════════════════════════════════════════════════
   §4  KaTeX RENDERER
   ═══════════════════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════════════════
   §5  LEGACY PLAIN-TEXT RENDERER
   ═══════════════════════════════════════════════════════════════════════════ */

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

		// Multiplication symbol — catch all variants
		.replace(/\s\*\s/g, ' × ')
		.replace(/\bimes\b/g, '×')    // leftover corruption
		.replace(/\btimes\b/g, '×')   // unescaped times command

		// Plus-minus
		.replace(/\+\/-/g, '±')
		.replace(/\+-/g, '±');

	return html;
}

/* ═══════════════════════════════════════════════════════════════════════════
   §6  MAIN PUBLIC API
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Convert bare LaTeX commands in plain prose to Unicode.
 * Used so calculator cues / descriptions with \beta stay readable
 * without passing the whole sentence through KaTeX (which collapses spaces).
 */
function latexCommandsToUnicode(text) {
	if (!text) return '';
	return text
		.replace(/\\times\b/g, '×')
		.replace(/\\cdot\b/g, '·')
		.replace(/\\pm\b/g, '±')
		.replace(/\\leq\b/g, '≤')
		.replace(/\\geq\b/g, '≥')
		.replace(/\\neq\b/g, '≠')
		.replace(/\\approx\b/g, '≈')
		.replace(/\\infty\b/g, '∞')
		.replace(/\\alpha\b/g, 'α')
		.replace(/\\beta\b/g, 'β')
		.replace(/\\gamma\b/g, 'γ')
		.replace(/\\delta\b/g, 'δ')
		.replace(/\\sigma\b/g, 'σ')
		.replace(/\\mu\b/g, 'μ')
		.replace(/\\rho\b/g, 'ρ')
		.replace(/\\lambda\b/g, 'λ')
		.replace(/\\pi\b/g, 'π')
		.replace(/\\theta\b/g, 'θ')
		.replace(/\\epsilon\b/g, 'ε')
		.replace(/\\tau\b/g, 'τ')
		.replace(/\\phi\b/g, 'φ')
		.replace(/\\omega\b/g, 'ω')
		.replace(/\\nu\b/g, 'ν')
		.replace(/\\eta\b/g, 'η')
		.replace(/\\kappa\b/g, 'κ')
		.replace(/\\chi\b/g, 'χ')
		.replace(/\\psi\b/g, 'ψ')
		.replace(/\\zeta\b/g, 'ζ')
		.replace(/\\xi\b/g, 'ξ')
		.replace(/\\Delta\b/g, 'Δ')
		.replace(/\\Sigma\b/g, 'Σ')
		.replace(/\\Omega\b/g, 'Ω')
		.replace(/\\Phi\b/g, 'Φ')
		.replace(/\\Theta\b/g, 'Θ')
		.replace(/\\Lambda\b/g, 'Λ')
		.replace(/\\Gamma\b/g, 'Γ')
		.replace(/\\Pi\b/g, 'Π')
		.replace(/\\text\{([^}]*)\}/g, '$1')
		.replace(/\\mathrm\{([^}]*)\}/g, '$1')
		.replace(/\\mathbf\{([^}]*)\}/g, '$1')
		.replace(/\\left\b/g, '')
		.replace(/\\right\b/g, '')
		// subscripts/superscripts outside KaTeX — render as HTML
		.replace(/_\{([^}]+)\}/g, '<sub>$1</sub>')
		.replace(/_([A-Za-z0-9])/g, '<sub>$1</sub>')
		.replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>')
		.replace(/\^([A-Za-z0-9])/g, '<sup>$1</sup>');
}

/**
 * Render symbol part of a variable definition via KaTeX inline.
 * The symbol may be bare LaTeX (E(R_i), \beta_i) or delimited (\(E(R_i)\)).
 */
function renderVariableSymbol(symbol) {
	if (!symbol) return '';
	// Already wrapped in \( ... \)
	if (/^\\\([\s\S]*\\\)$/.test(symbol.trim())) {
		return katexToHtml(symbol.trim().slice(2, -2), false);
	}
	// Try rendering as inline KaTeX
	try {
		return katex.renderToString(symbol.trim(), {
			displayMode: false,
			throwOnError: true,
			trust: true,
			strict: false,
		});
	} catch {
		// Fall back to Unicode conversion + HTML subscripts
		return latexCommandsToUnicode(symbol
			.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
	}
}

/**
 * Parse a variables string into individual entries.
 * Handles multiple formats:
 *   - Semicolon-separated:  "E(R_i): desc; R_f: desc"
 *   - Newline-separated:    "E(R_i): desc\nR_f: desc"
 *   - Bullet list:          "- E(R_i): desc\n- R_f: desc"
 *   - \( \) delimited:      "\(E(R_i)\): desc; \(R_f\): desc"
 */
function parseVariableEntries(text) {
	// Normalise: replace bullet markers, split by newline or semicolon (outside braces)
	const cleaned = text.replace(/^[\s\-\*•]+/gm, '');
	const byNewline = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

	// If each line already looks like a complete entry, use newline split
	const entries = [];
	for (const line of byNewline) {
		// A line may still have multiple semicolon-separated entries
		const parts = splitOutsideBraces(line, ';');
		for (const p of parts) {
			if (p.trim()) entries.push(p.trim());
		}
	}
	return entries;
}

/**
 * Format a single variable entry "symbol: description" as an HTML list item.
 */
function formatVariableEntry(entry) {
	// Find the first colon that is NOT inside braces or \( \)
	// Strategy: find the outermost colon not inside math or braces
	let depth = 0;
	let inInlineMath = false;
	let colonIdx = -1;

	for (let i = 0; i < entry.length; i++) {
		const ch = entry[i];
		const prev = i > 0 ? entry[i - 1] : '';

		if (ch === '(' && prev === '\\') { inInlineMath = true; continue; }
		if (ch === ')' && prev === '\\') { inInlineMath = false; continue; }
		if (inInlineMath) continue;
		if (ch === '{') { depth++; continue; }
		if (ch === '}') { depth = Math.max(0, depth - 1); continue; }
		if (ch === ':' && depth === 0) { colonIdx = i; break; }
	}

	if (colonIdx > 0) {
		const symbol = entry.slice(0, colonIdx).trim();
		let description = entry.slice(colonIdx + 1).trim();
		// Normalize merged description words
		description = normalizeVariableDescription(description);
		// Escape any remaining HTML in description
		description = description
			.replace(/&(?!amp;|lt;|gt;|quot;|#)/g, '&amp;')
			.replace(/(?<!&lt;)(?<!&gt;)</g, '&lt;')
			.replace(/(?<!&lt;)(?<!&gt;)>/g, '&gt;');
		const renderedSymbol = renderVariableSymbol(symbol);
		return `<li><strong>${renderedSymbol}</strong> — ${description}</li>`;
	}

	// No colon — just render as a plain item
	return `<li>${latexCommandsToUnicode(entry.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))}</li>`;
}

/**
 * Main rendering pipeline for formula/math content (pure math fields: formula).
 *
 * Pipeline:
 *   1. Sanitize (repair corrupted LaTeX, restore backslashes)
 *   2. Unescape HTML entities
 *   3. Detect format → render via appropriate engine
 *      a. LaTeX with delimiters → KaTeX
 *      b. Raw LaTeX commands → KaTeX per-segment
 *      c. Legacy plain-text notation → HTML renderer
 */
export function formatFormulaHtml(html) {
	if (!html) return '';

	const sanitized = formulaSanitizer(String(html));
	const unescaped = safeHtml(sanitized);

	if (containsLatex(unescaped)) {
		return renderLatex(unescaped);
	}

	if (containsLatexCommands(unescaped)) {
		return renderRawLatex(unescaped);
	}

	if (/<su[bp]>/i.test(unescaped)) {
		return unescaped.replace(/(>)([^<]+)(<)/g, (_, open, text, close) => {
			return open + renderFormulaHtml(text) + close;
		});
	}

	return renderFormulaHtml(unescaped);
}

/**
 * Render prose fields that may contain INCIDENTAL math (calculator cues,
 * interpretation, worked example steps, watch-outs).
 *
 * Rules:
 *   - Only renders \( … \) and \[ … \] blocks via KaTeX
 *   - ALL surrounding prose stays as readable plain text with spaces preserved
 *   - Raw LaTeX commands (\beta, \times …) outside delimiters → Unicode symbols
 *   - NEVER passes the whole string through KaTeX (no space collapsing)
 */
export function formatProseWithMath(text) {
	if (!text) return '';

	let s = formulaSanitizer(String(text));
	s = safeHtml(s);

	// Convert bare LaTeX commands in prose to Unicode (before KaTeX rendering)
	// We do this ONLY on the parts that are NOT inside \( … \) or \[ … \]
	const parts = [];
	let lastIndex = 0;
	const mathPattern = /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;
	let match;

	while ((match = mathPattern.exec(s)) !== null) {
		// Prose before this math block — render inline LaTeX expressions + convert bare commands
		const prose = s.slice(lastIndex, match.index);
		if (prose) parts.push(renderProseSegment(prose));

		// Math block — render via KaTeX
		const block = match[1];
		const isDisplay = block.startsWith('\\[');
		const inner = isDisplay ? block.slice(2, -2).trim() : block.slice(2, -2).trim();
		parts.push(katexToHtml(inner, isDisplay));
		lastIndex = match.index + match[0].length;
	}

	// Remaining prose after the last math block
	const tail = s.slice(lastIndex);
	if (tail) parts.push(renderProseSegment(tail));

	return parts.join('');
}

/**
 * Render a prose segment that may contain inline raw LaTeX expressions.
 * Detects patterns like \frac{...}{...}, \sqrt{...}, and other complex
 * LaTeX expressions, renders them via KaTeX inline, and converts the
 * remaining bare commands to Unicode.
 */
function renderProseSegment(prose) {
	if (!prose) return '';

	// Pattern to find inline LaTeX expressions that should be rendered via KaTeX:
	// - \frac{...}{...} (with optional trailing = number)
	// - \sqrt{...} (with optional trailing = number)
	// Does NOT capture leading prose — only the math command and its arguments.
	const inlineLatexPattern = /\\(?:frac|dfrac|tfrac|cfrac)\{[^}]*\}\{[^}]*\}(?:\s*=\s*[0-9.,]+)?|\\sqrt\{[^}]*\}(?:\s*=\s*[0-9.,]+)?/g;

	let result = '';
	let idx = 0;
	let m;

	while ((m = inlineLatexPattern.exec(prose)) !== null) {
		// Text before this math expression
		const before = prose.slice(idx, m.index);
		if (before) result += latexCommandsToUnicode(before);

		// Render the matched expression via KaTeX
		const expr = m[0].trim();
		try {
			result += katex.renderToString(expr, {
				displayMode: false,
				throwOnError: true,
				trust: true,
				strict: false,
			});
		} catch {
			// If KaTeX fails on the full match, try just the \frac/\sqrt part
			const cmdMatch = expr.match(/\\(?:frac|sqrt|dfrac|tfrac|cfrac)\{[^}]*\}(?:\{[^}]*\})?/);
			if (cmdMatch) {
				const beforeCmd = expr.slice(0, expr.indexOf(cmdMatch[0]));
				const afterCmd = expr.slice(expr.indexOf(cmdMatch[0]) + cmdMatch[0].length);
				result += latexCommandsToUnicode(beforeCmd);
				try {
					result += katex.renderToString(cmdMatch[0], {
						displayMode: false,
						throwOnError: true,
						trust: true,
						strict: false,
					});
				} catch {
					result += latexCommandsToUnicode(cmdMatch[0]);
				}
				result += latexCommandsToUnicode(afterCmd);
			} else {
				result += latexCommandsToUnicode(expr);
			}
		}
		idx = m.index + m[0].length;
	}

	// Remaining text after last inline expression
	const remaining = prose.slice(idx);
	if (remaining) result += latexCommandsToUnicode(remaining);

	return result;
}

/**
 * Render the variables field as a clean HTML list.
 * - Symbol part rendered via KaTeX inline
 * - Description part kept as plain normalized text
 * - Output is an HTML <ul> list
 */
export function formatVariablesHtml(html) {
	if (!html) return '';

	let text = formulaSanitizer(String(html));
	text = safeHtml(text);

	// If already a proper HTML list, pass through sanitized
	if (/^<[uo]l/i.test(text.trim())) return text;

	const entries = parseVariableEntries(text);
	if (!entries.length) return text;

	const items = entries.map(formatVariableEntry);
	return `<ul class="formula-variables-list">${items.join('')}</ul>`;
}
