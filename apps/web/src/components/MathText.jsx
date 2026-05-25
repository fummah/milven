import React from 'react';
import { formatFormulaHtml } from '../lib/formatFormula';

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
