export const SLIDES_API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export function assetUrl(pathOrUrl) {
	if (!pathOrUrl) return null;
	if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
	return `${SLIDES_API_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

export const LEVEL_LABELS = {
	LEVEL1: 'Level I',
	LEVEL2: 'Level II',
	LEVEL3: 'Level III',
	NONE: 'None'
};

export function levelLabel(level) {
	return LEVEL_LABELS[level] || level || '';
}

export function presentationViewerPath(presentationId, slideNumber) {
	const base = `/learning/slides/${presentationId}`;
	return slideNumber ? `${base}?slide=${slideNumber}` : base;
}

export function highlightParts(text, query) {
	const source = String(text || '');
	const term = String(query || '').trim();
	if (!term) return [{ text: source, match: false }];
	const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const regex = new RegExp(`(${escaped})`, 'ig');
	return source.split(regex).filter(Boolean).map(part => ({
		text: part,
		match: part.toLowerCase() === term.toLowerCase()
	}));
}
