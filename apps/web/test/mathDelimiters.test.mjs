import test from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import { findMathSpans, hasMathDelimiters, isLikelyDollarMath } from '../src/lib/mathDelimiters.js';

test('detects inline and display dollar math without treating currency as math', () => {
	assert.equal(isLikelyDollarMath(String.raw`\text{EV} = \text{EV/EBITDA} \times \text{EBITDA}`), true);
	assert.equal(isLikelyDollarMath('100 and '), false);
	assert.equal(isLikelyDollarMath('100'), false);
	assert.equal(isLikelyDollarMath('100-200'), false);
	assert.equal(isLikelyDollarMath('c_0 = S_0 + p_0'), true);

	const inline = findMathSpans(String.raw`Step 1: $PV(X)=\frac{X}{1+rT}$ done.`);
	assert.equal(inline.length, 1);
	assert.equal(inline[0].display, false);
	assert.equal(inline[0].inner, String.raw`PV(X)=\frac{X}{1+rT}`);
	assert.equal(String.raw`PV(X)=\frac{X}{1+rT}`.includes('\\frac'), true);

	const display = findMathSpans(String.raw`Value: $$\text{EV} = \text{EV/EBITDA} \times \text{EBITDA}$$`);
	assert.equal(display.length, 1);
	assert.equal(display[0].display, true);
	assert.equal(display[0].inner, String.raw`\text{EV} = \text{EV/EBITDA} \times \text{EBITDA}`);

	assert.equal(hasMathDelimiters('Cost is $100 and revenue is $200.'), false);
	assert.equal(hasMathDelimiters('Cost is $100$.'), false);
	assert.equal(hasMathDelimiters('The variable is $x$.'), true);
});

test('supports backslash delimiters alongside dollar delimiters', () => {
	const spans = findMathSpans(String.raw`Inline \(x_1\) and display \[y = \frac{1}{2}\]`);
	assert.equal(spans.length, 2);
	assert.equal(spans[0].delimiter, '\\(');
	assert.equal(spans[1].delimiter, '\\[');
	assert.equal(spans[1].display, true);
});

test('extracted formulas are valid KaTeX inputs', () => {
	const samples = [
		String.raw`$\text{EV} = \text{EV/EBITDA} \times \text{EBITDA}$`,
		String.raw`$\text{Equity value} = \text{EV} - \text{Net debt}$`,
		String.raw`$c_0 = S_0 + p_0 - \frac{X}{1+rT}$`,
		String.raw`$$PV(X)=\frac{X}{1+rT}$$`
	];
	for (const sample of samples) {
		const spans = findMathSpans(sample);
		assert.equal(spans.length, 1, sample);
		assert.doesNotThrow(() => katex.renderToString(spans[0].inner, { throwOnError: true, strict: 'ignore' }));
	}
});
