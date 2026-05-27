/**
 * Tests for formulaSanitizer, normalizeVariableDescription, renderFormulaHtml.
 *
 * Run:  node src/lib/formatFormula.test.js
 *
 * Tests the pure-logic functions (no KaTeX/DOM dependency).
 * The full pipeline (formatFormulaHtml) needs KaTeX which requires ESM + katex import.
 */

/* ─── Inline implementations for testing (avoids ESM/katex import issues) ─ */

// ── formulaSanitizer (copy of the logic for standalone testing) ────────────
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
function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function formulaSanitizer(text) {
	if (!text || typeof text !== 'string') return text || '';
	let s = text;
	s = s.replace(/\times/g, '\\times');
	s = s.replace(/\beta/g, '\\beta');
	s = s.replace(/\bar/g, '\\bar');
	s = s.replace(/\frac/g, '\\frac');
	s = s.replace(/\nu(?=[^a-zA-Z]|$)/g, '\\nu');
	s = s.replace(/\nabla/g, '\\nabla');
	s = s.replace(/(?<![a-zA-Z\\])imes\b/g, '\\times');
	for (const cmd of LATEX_COMMANDS) {
		const re = new RegExp(`(?<!\\\\)(?<![a-zA-Z])${escapeRegex(cmd)}(?![a-zA-Z])`, 'g');
		s = s.replace(re, '\\' + cmd);
	}
	s = s.replace(/\\{3,}(times|cdot|frac|sqrt|text|alpha|beta|gamma|delta|sigma|mu|rho|lambda|pi|theta|epsilon|tau|phi|omega|Delta|Sigma|Omega|Phi|Theta|Lambda|Gamma|left|right|sum|prod|int|lim|ln|log|exp|sin|cos|tan|overline|bar|hat|tilde|vec|mathbf|mathrm|geq|leq|neq|approx|infty|pm|nu|kappa|chi|psi|zeta|eta|xi|Pi|Psi|Xi|mp|forall|exists|partial|nabla)\b/g, '\\$1');
	s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
	return s;
}

// ── normalizeVariableDescription ──────────────────────────────────────────
const FINANCE_WORDS = [
	'portfolio', 'expected', 'return', 'market', 'standard', 'deviation',
	'variance', 'covariance', 'correlation', 'coefficient', 'weighted',
	'average', 'present', 'value', 'future', 'interest', 'rate', 'risk',
	'free', 'premium', 'excess', 'total', 'annual', 'annualized',
	'holding', 'period', 'investment', 'horizon', 'maturity',
	'yield', 'coupon', 'bond', 'stock', 'equity', 'debt', 'asset',
	'liability', 'capital', 'cost', 'weight', 'proportion', 'fraction',
	'number', 'periods', 'years', 'months', 'days', 'time',
	'beta', 'alpha', 'gamma', 'delta', 'sigma', 'theta', 'lambda',
	'epsilon', 'omega', 'phi', 'rho', 'tau', 'mu', 'pi', 'nu',
	'sharpe', 'ratio', 'treynor', 'jensen', 'information',
	'tracking', 'error', 'benchmark', 'index', 'security', 'line',
	'inflation', 'nominal', 'real', 'after', 'before', 'tax',
	'gross', 'net', 'operating', 'margin', 'leverage', 'financial',
	'from', 'with', 'that', 'this', 'each', 'over', 'under',
	'the', 'for', 'and', 'not', 'but', 'per', 'all',
	'of', 'in', 'on', 'at', 'to', 'by', 'is', 'as', 'or', 'an', 'a',
].sort((a, b) => b.length - a.length);

function segmentWords(str) {
	if (!str) return '';
	const lower = str.toLowerCase();
	const words = [];
	let pos = 0;
	while (pos < lower.length) {
		let matched = false;
		for (const word of FINANCE_WORDS) {
			if (lower.startsWith(word, pos)) {
				words.push(str.slice(pos, pos + word.length));
				pos += word.length;
				matched = true;
				break;
			}
		}
		if (!matched) { words.push(str[pos]); pos++; }
	}
	const segmented = words.join(' ');
	if (words.length >= 2 && segmented !== str) return segmented;
	return str;
}

function normalizeVariableDescription(text) {
	if (!text || typeof text !== 'string') return text || '';
	const spaceRatio = (text.match(/ /g) || []).length / text.length;
	if (spaceRatio > 0.1 || text.length < 8) return text;
	let result = text;
	result = result.replace(/([a-z])([A-Z])/g, '$1 $2');
	result = result.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');
	result = result.replace(/[a-z]{8,}/gi, (match) => segmentWords(match));
	result = result.replace(/\s{2,}/g, ' ').trim();
	return result;
}

// ── renderFormulaHtml ─────────────────────────────────────────────────────
function renderFormulaHtml(text) {
	if (!text) return '';
	let html = text
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/\(([^)]+)\)\s*\/\s*\(([^)]+)\)/g, '<span class="formula-frac"><span class="formula-frac-num">$1</span><span class="formula-frac-den">$2</span></span>')
		.replace(/_(\{[^}]+\}|[A-Za-z0-9]+)/g, (_, m) => { const inner = m.startsWith('{') ? m.slice(1, -1) : m; return `<sub>${inner}</sub>`; })
		.replace(/\^(\{[^}]+\}|[A-Za-z0-9]+)/g, (_, m) => { const inner = m.startsWith('{') ? m.slice(1, -1) : m; return `<sup>${inner}</sup>`; })
		.replace(/sqrt\(([^)]+)\)/gi, '√($1)')
		.replace(/\bsum\b/gi, 'Σ')
		.replace(/\balpha\b/gi, 'α').replace(/\bbeta\b/gi, 'β').replace(/\bgamma\b/gi, 'γ')
		.replace(/\bdelta\b/gi, 'δ').replace(/\bsigma\b/gi, 'σ').replace(/\bmu\b/gi, 'μ')
		.replace(/\brho\b/gi, 'ρ').replace(/\blambda\b/gi, 'λ').replace(/\bpi\b/gi, 'π')
		.replace(/\btheta\b/gi, 'θ').replace(/\bepsilon\b/gi, 'ε').replace(/\btau\b/gi, 'τ')
		.replace(/\binfinity\b/gi, '∞')
		.replace(/\bDelta\b/g, 'Δ').replace(/\bSigma\b/g, 'Σ').replace(/\bOmega\b/g, 'Ω').replace(/\bPhi\b/g, 'Φ')
		.replace(/\s\*\s/g, ' × ')
		.replace(/\bimes\b/g, '×')
		.replace(/\btimes\b/g, '×')
		.replace(/\+\/-/g, '±').replace(/\+-/g, '±');
	return html;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Test runner
   ═══════════════════════════════════════════════════════════════════════════ */

let passed = 0, failed = 0;
function assert(condition, name) {
	if (condition) { passed++; console.log(`  ✓ ${name}`); }
	else { failed++; console.error(`  ✗ ${name}`); }
}

console.log('\n─── formulaSanitizer ───');

assert(formulaSanitizer('FV = PV \times (1+r)^n').includes('\\times'), 'repairs tab+imes → \\times');
assert(!formulaSanitizer('FV = PV \times (1+r)^n').includes('\t'), 'removes tab char');
assert(formulaSanitizer('FV = PV imes (1+r)^n').includes('\\times'), 'repairs standalone "imes"');
assert(formulaSanitizer('\beta_p').includes('\\beta'), 'repairs backspace+eta → \\beta');
assert(formulaSanitizer('\frac{a}{b}').includes('\\frac'), 'repairs formfeed+rac → \\frac');
assert(!formulaSanitizer('\\times \\beta').match(/\\{3,}times/), 'no triple-backslash on valid input');
assert(formulaSanitizer('\\times').includes('\\times'), 'preserves valid \\times');
assert(formulaSanitizer('\\beta').includes('\\beta'), 'preserves valid \\beta');
assert(!formulaSanitizer('hello\x08world\x0Ctest').match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/), 'strips control chars');
assert(formulaSanitizer(null) === '', 'null → empty');
assert(formulaSanitizer(undefined) === '', 'undefined → empty');
assert(formulaSanitizer('') === '', 'empty → empty');

console.log('\n─── normalizeVariableDescription ───');

const r1 = normalizeVariableDescription('expectedreturnofthemarket');
assert(r1.includes('expected') && r1.includes('return') && r1.includes('market'), 'segments "expectedreturnofthemarket"');

const r2 = normalizeVariableDescription('alphaoftheportfolio');
assert(r2.includes('alpha') && r2.includes('portfolio'), 'segments "alphaoftheportfolio"');

assert(normalizeVariableDescription('expected return of the market') === 'expected return of the market', 'preserves spaced text');

const r3 = normalizeVariableDescription('expectedReturn');
assert(r3.includes('expected') && r3.includes('Return'), 'splits camelCase');

assert(normalizeVariableDescription('risk\u2212freerate').includes('-'), 'normalizes unicode dashes');
assert(normalizeVariableDescription('rate') === 'rate', 'short string unchanged');
assert(normalizeVariableDescription('FV') === 'FV', 'short symbol unchanged');
assert(normalizeVariableDescription(null) === '', 'null → empty');

console.log('\n─── renderFormulaHtml ───');

assert(renderFormulaHtml('X_0').includes('<sub>0</sub>'), 'subscript X_0');
assert(renderFormulaHtml('X_{equity}').includes('<sub>equity</sub>'), 'braced subscript');
assert(renderFormulaHtml('X^2').includes('<sup>2</sup>'), 'superscript X^2');
assert(renderFormulaHtml('X^{n-1}').includes('<sup>n-1</sup>'), 'braced superscript');
assert(renderFormulaHtml('alpha + beta').includes('α') && renderFormulaHtml('alpha + beta').includes('β'), 'Greek letters');
assert(renderFormulaHtml('a * b').includes('×'), 'asterisk → ×');
assert(renderFormulaHtml('a times b').includes('×'), '"times" → ×');
assert(renderFormulaHtml('a imes b').includes('×'), '"imes" → ×');
assert(renderFormulaHtml('+/-').includes('±'), 'plus-minus');
assert(renderFormulaHtml('(a+b) / (c+d)').includes('formula-frac'), 'stacked fraction');
assert(renderFormulaHtml('sqrt(x)').includes('√'), 'sqrt');
assert(renderFormulaHtml('<script>alert(1)</script>').includes('&lt;'), 'HTML escaping');

console.log('\n─── Sanitizer + Renderer integration ───');

// Simulate the full pipeline: sanitize then render
function pipeline(text) {
	return renderFormulaHtml(formulaSanitizer(text));
}

const p1 = pipeline('E(R_p) = w_1 * E(R_1)');
assert(p1.includes('<sub>') && p1.includes('×'), 'portfolio formula subscripts + multiply');

const p2 = pipeline('FV = PV \times (1+r)^n');
assert(!p2.match(/\bimes\b/) && (p2.includes('×') || p2.includes('\\times')), 'corrupted \\times repaired');

const p3 = pipeline('\beta_{p}: betaoftheportfolio');
assert(p3.includes('<sub>'), 'subscript after sanitized beta');

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed > 0 ? 1 : 0);
