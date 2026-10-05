/**
 * Shared helpers for AI content generation (Summary Sheets + Milven Notes).
 * Pure functions only — no Prisma / network dependencies.
 */

export const MAX_CURRICULUM_CHARS = 15000;
export const STATUS_RANK = { PASS: 0, REVISE: 1, 'INSTRUCTOR REVIEW REQUIRED': 2 };

// Strip markdown fences / surrounding prose so JSON.parse always has a chance.
export function stripJsonFences(input) {
	if (!input) return '{}';
	let t = String(input).trim();
	t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
	const firstBrace = t.indexOf('{');
	const firstBracket = t.indexOf('[');
	if (firstBrace === -1 && firstBracket === -1) return '{}';
	const start = firstBrace === -1 ? firstBracket : (firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket));
	const lastBrace = t.lastIndexOf('}');
	const lastBracket = t.lastIndexOf(']');
	const end = Math.max(lastBrace, lastBracket);
	if (start >= 0 && end > start) return t.slice(start, end + 1);
	return t;
}

export function worstStatus(...statuses) {
	let worst = 'PASS';
	for (const s of statuses) {
		const key = String(s || '').toUpperCase();
		if ((STATUS_RANK[key] ?? 0) > (STATUS_RANK[worst] ?? 0)) worst = key;
	}
	return worst;
}

// Intelligent curriculum extraction: keep the most relevant windows around the
// supplied keywords, capped at MAX_CURRICULUM_CHARS. Control source = curriculum.
export function extractCurriculumExcerpt(text, keywords) {
	if (!text) return '';
	if (text.length <= MAX_CURRICULUM_CHARS) return text;
	const kws = [...new Set((keywords || [])
		.flatMap(n => String(n || '').split(/[\s,;:()\-\/]+/))
		.map(w => w.toLowerCase().trim())
		.filter(w => w.length > 3))];
	if (!kws.length) return text.substring(0, MAX_CURRICULUM_CHARS) + '\n... [truncated]';

	const WINDOW = 2500, STEP = 500;
	const windows = [];
	for (let i = 0; i < text.length; i += STEP) {
		const chunk = text.substring(i, i + WINDOW).toLowerCase();
		let score = kws.reduce((s, kw) => {
			let c = 0, idx = 0;
			while ((idx = chunk.indexOf(kw, idx)) !== -1) { c++; idx += kw.length; }
			return s + c;
		}, 0);
		windows.push({ start: i, score });
	}
	windows.sort((a, b) => b.score - a.score);

	const ranges = [];
	let total = 0;
	for (const w of windows) {
		if (total >= MAX_CURRICULUM_CHARS || w.score === 0) break;
		const end = Math.min(w.start + WINDOW, text.length);
		const budget = Math.min(end - w.start, MAX_CURRICULUM_CHARS - total);
		ranges.push({ start: w.start, end: w.start + budget });
		total += budget;
	}
	if (!ranges.length) return text.substring(0, MAX_CURRICULUM_CHARS) + '\n... [truncated]';

	ranges.sort((a, b) => a.start - b.start);
	const merged = [];
	for (const r of ranges) {
		if (merged.length > 0 && r.start <= merged[merged.length - 1].end + 300) {
			merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
		} else {
			merged.push({ ...r });
		}
	}
	return merged.map((r, i) => {
		const t = text.substring(r.start, r.end).trim();
		const pm = text.substring(0, r.start).match(/\[PAGE (\d+)\]/g);
		const pg = pm ? parseInt(pm[pm.length - 1].match(/\d+/)[0], 10) : null;
		const prefix = pg ? `[... content from page ${pg} ...]\n` : (r.start > 0 ? '[...]\n' : '');
		return prefix + t + (i < merged.length - 1 ? '\n[...]\n' : '');
	}).join('\n') + (merged[merged.length - 1]?.end < text.length ? '\n... [additional content omitted]' : '');
}
