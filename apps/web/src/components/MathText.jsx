import React from 'react';
import { formatFormulaHtml, formatVariablesHtml, formatProseWithMath } from '../lib/formatFormula';

/**
 * Renders text that may contain LaTeX formulas (\( … \), \[ … \])
 * or legacy plain-text math notation (^, _, Greek words).
 *
 * Drop-in replacement for {someText} in JSX — just use:
 *   <MathText text={someText} />
 *
 * Accepts an optional `tag` prop (default "span") and passes
 * through any extra props (style, className, etc.) to the wrapper.
 */
export default function MathText({ text, tag: Tag = 'span', ...rest }) {
	if (!text) return null;
	const str = typeof text === 'object' ? JSON.stringify(text) : String(text);
	return <Tag {...rest} dangerouslySetInnerHTML={{ __html: formatFormulaHtml(str) }} />;
}

/**
 * Renders formula variables as a clean HTML list.
 * Symbol rendered via KaTeX inline; description kept as plain text.
 * Fixes merged words like "expectedreturnofthemarket" → "expected return of the market".
 */
export function MathVariables({ text, tag: Tag = 'div', ...rest }) {
	if (!text) return null;
	const str = typeof text === 'object' ? JSON.stringify(text) : String(text);
	return <Tag {...rest} dangerouslySetInnerHTML={{ __html: formatVariablesHtml(str) }} />;
}

/**
 * Renders prose fields that contain INCIDENTAL math (calculator cues,
 * worked example steps, interpretation, watch-outs).
 * Only \( … \) and \[ … \] blocks are rendered via KaTeX.
 * All surrounding prose stays as readable plain text with spaces preserved.
 * Raw LaTeX commands (\beta, \times …) outside delimiters → Unicode symbols.
 */
export function MathProse({ text, tag: Tag = 'span', ...rest }) {
	if (!text) return null;
	const str = typeof text === 'object' ? JSON.stringify(text) : String(text);
	return <Tag {...rest} dangerouslySetInnerHTML={{ __html: formatProseWithMath(str) }} />;
}
