const TRAILING_ARTIFACT = /(?:\s*(?:`[rnt]|\\[rnt])){2,}\s*$/;
const INTERNAL_ARTIFACT = /(?:`[rnt]|\\[rnt]){2,}/;

function codepoints(value) {
	return [...String(value || '')].map(char => char.codePointAt(0));
}

export function inspectOptionText(value) {
	const original = value === undefined || value === null ? '' : String(value);
	const artifacts = [];
	if (original.includes('\u0000')) artifacts.push({ code: 'NULL_BYTE', confidence: 'SAFE' });
	if (TRAILING_ARTIFACT.test(original)) artifacts.push({ code: 'TRAILING_ESCAPE_ARTIFACT', confidence: 'SAFE' });
	const withoutTrailing = original.replace(TRAILING_ARTIFACT, '').replace(/[\r\n\t]+$/, '');
	if (/[\r\n\t]+$/.test(original)) artifacts.push({ code: 'TRAILING_CONTROL_WHITESPACE', confidence: 'SAFE' });
	if (/\t/.test(withoutTrailing)) artifacts.push({ code: 'INTERNAL_TAB', confidence: 'REVIEW' });
	if (INTERNAL_ARTIFACT.test(withoutTrailing)) artifacts.push({ code: 'INTERNAL_ESCAPE_ARTIFACT', confidence: 'REVIEW' });
	return {
		original,
		codepoints: codepoints(original).slice(0, 200),
		artifacts,
		safeToClean: artifacts.length > 0 && artifacts.every(artifact => artifact.confidence === 'SAFE')
	};
}

export function normalizeOptionText(value) {
	const inspection = inspectOptionText(value);
	let text = inspection.original.replace(/\u0000/g, '');
	text = text.replace(TRAILING_ARTIFACT, '').replace(/[ \t]+$/g, '');
	text = text.replace(/\r\n?/g, '\n');
	text = text.replace(/\t/g, ' ');
	text = text.split('\n').map(line => line.replace(/[\u00a0 ]+/g, ' ').trim()).join('\n');
	text = text.replace(/\n{3,}/g, '\n\n').trim();
	return {
		text,
		changed: text !== inspection.original,
		inspection,
		artifacts: inspection.artifacts
	};
}
