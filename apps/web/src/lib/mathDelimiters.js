function isEscaped(text, index) {
	let slashes = 0;
	for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) slashes += 1;
	return slashes % 2 === 1;
}

export function isLikelyDollarMath(value) {
	const text = String(value || '').trim();
	if (!text) return false;
	if (/^\d[\d,.]*\s*[-\u2013]\s*\$?\d[\d,.]*$/.test(text)) return false;
	if (/^[\d\s.,%]+$/.test(text)) return false;
	if (/\\[a-zA-Z]+/.test(text)) return true;
	if (/[\^_{}=<>]/.test(text)) return true;
	if (/^[A-Za-z][A-Za-z0-9]*$/.test(text)) return true;
	if (/^[A-Za-z0-9]+(?:\s*[+\-*/]\s*[A-Za-z0-9]+)+$/.test(text)) return true;
	if (/^[\d\s.,]+\s*[+*/]\s*[\d\s.,]+$/.test(text)) return true;
	if (/[A-Za-z]/.test(text) && /[+\-*/]/.test(text)) return true;
	return false;
}

export function findMathSpans(input) {
	const text = String(input || '');
	const spans = [];
	let index = 0;
	while (index < text.length) {
		if (text.startsWith('$$', index) && !isEscaped(text, index)) {
			const end = text.indexOf('$$', index + 2);
			if (end > index + 2) {
				spans.push({ start: index, end: end + 2, inner: text.slice(index + 2, end), display: true, delimiter: '$$' });
				index = end + 2;
				continue;
			}
			index += 2;
			continue;
		}
		if (text.startsWith('\\[', index) && !isEscaped(text, index)) {
			const end = text.indexOf('\\]', index + 2);
			if (end > index + 2) {
				spans.push({ start: index, end: end + 2, inner: text.slice(index + 2, end), display: true, delimiter: '\\[' });
				index = end + 2;
				continue;
			}
		}
		if (text.startsWith('\\(', index) && !isEscaped(text, index)) {
			const end = text.indexOf('\\)', index + 2);
			if (end > index + 2) {
				spans.push({ start: index, end: end + 2, inner: text.slice(index + 2, end), display: false, delimiter: '\\(' });
				index = end + 2;
				continue;
			}
		}
		if (text[index] === '$' && !isEscaped(text, index)) {
			let end = index + 1;
			while (end < text.length) {
				if (text[end] === '$' && !isEscaped(text, end)) break;
				end += 1;
			}
			if (end < text.length) {
				const inner = text.slice(index + 1, end);
				if (isLikelyDollarMath(inner)) {
					spans.push({ start: index, end: end + 1, inner, display: false, delimiter: '$' });
					index = end + 1;
					continue;
				}
			}
		}
		index += 1;
	}
	return spans;
}

export function hasMathDelimiters(value) {
	return findMathSpans(value).length > 0;
}
