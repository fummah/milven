import * as cheerio from 'cheerio';

const LABELS = [
	{ key: 'correctAnswerExplanation', pattern: /^correct answer$/i },
	{ key: 'incorrectOptionsExplanation', pattern: /^why (?:the )?other options are wrong$/i },
	{ key: 'commonMistake', pattern: /^common mistake$/i },
	{ key: 'conceptsTested', pattern: /^concepts tested$/i }
];

function clean(value) {
	return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanHtml(value) {
	return String(value || '')
		.replace(/\u0000/g, '')
		.replace(/<p[^>]*>\s*<\/p>/gi, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

function labelKey(value) {
	const normalized = clean(value).replace(/:\s*$/, '');
	return LABELS.find(candidate => candidate.pattern.test(normalized))?.key || null;
}

function append(parts, key, value) {
	const text = cleanHtml(value);
	if (!text) return;
	parts[key] = [parts[key], text].filter(Boolean).join('\n');
}

function splitHtml($, text) {
	const parts = {};
	const root = $('<div id="explanation-root"></div>');
	root.html(text);
	root.find('p, li').each((_, element) => {
		const node = $(element);
		const clone = node.clone();
		const strong = clone.find('strong, b').first();
		const label = strong.length ? labelKey(strong.text()) : labelKey(clean(node.text()).split(':')[0]);
		if (!label) return;
		if (strong.length) strong.remove();
		const content = clone.html() || clone.text();
		append(parts, label, content);
	});
	return parts;
}

function splitPlain(text) {
	const parts = {};
	const pattern = /(^|\n)\s*(Correct answer|Why (?:the )?other options are wrong|Common mistake|Concepts tested)\s*:/gi;
	const matches = [...text.matchAll(pattern)];
	matches.forEach((match, index) => {
		const key = labelKey(match[2]);
		if (!key) return;
		const start = match.index + match[0].length;
		const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
		append(parts, key, text.slice(start, end));
	});
	return parts;
}

export function splitExplanation(explanation) {
	const text = String(explanation || '').trim();
	if (!text) return {};
	if (/<[a-z][\s\S]*>/i.test(text)) {
		try {
			const $ = cheerio.load('');
			const htmlParts = splitHtml($, text);
			if (Object.keys(htmlParts).length) return htmlParts;
		} catch {
			// Fall through to plain-text parsing.
		}
	}
	return splitPlain(text);
}

export function splitMergedExplanation(value) {
	const text = String(value || '').trim();
	if (!text) return { workedSolution: null, explanation: null };
	const separator = '\n\n--- Worked Solution ---\n';
	const legacy = '\n\nExplanation: ';
	if (text.includes(separator)) {
		const [explanation, workedSolution] = text.split(separator);
		return { workedSolution: workedSolution?.trim() || null, explanation: explanation?.trim() || null };
	}
	if (text.includes(legacy)) {
		const index = text.indexOf(legacy);
		return {
			workedSolution: text.slice(0, index).trim() || null,
			explanation: text.slice(index + legacy.length).trim() || null
		};
	}
	if (/^Explanation:\s*/i.test(text)) {
		return { workedSolution: null, explanation: text.replace(/^Explanation:\s*/i, '').trim() || null };
	}
	return { workedSolution: text, explanation: null };
}

export function deriveExplanationFields(subject) {
	const derived = [];
	if (!subject || typeof subject !== 'object') return derived;
	const merged = splitMergedExplanation(subject.workedSolution);
	const sources = [
		['explanation', splitExplanation(subject.explanation)],
		['workedSolution', merged.explanation ? splitExplanation(merged.explanation) : {}]
	];
	let splitWorkedSolution = false;
	for (const [source, parts] of sources) {
		for (const [field, value] of Object.entries(parts)) {
			if (!subject[field] && value) {
				subject[field] = value;
				derived.push({ field, source });
			}
		}
	}
	if (merged.explanation && derived.some(entry => entry.source === 'workedSolution')) {
		subject.workedSolution = merged.workedSolution;
		splitWorkedSolution = true;
	}
	return { derived, splitWorkedSolution, mergedExplanation: merged.explanation };
}
