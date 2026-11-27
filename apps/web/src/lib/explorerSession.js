import { useEffect, useRef } from 'react';

const PREFIX = 'milven.learning-explorer';

function keyFor(scope, suffix = '') {
	return `${PREFIX}.${scope}${suffix}`;
}

export function readExplorerSession(scope) {
	try {
		const raw = sessionStorage.getItem(keyFor(scope));
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

export function writeExplorerSession(scope, value) {
	try {
		sessionStorage.setItem(keyFor(scope), JSON.stringify(value));
	} catch {}
}

export function markExplorerReturn(scope) {
	try {
		sessionStorage.setItem(keyFor(scope, '.return'), '1');
		sessionStorage.setItem(keyFor(scope, '.scroll'), String(window.scrollY));
	} catch {}
}

export function useExplorerScrollMemory(scope, ready) {
	const key = useRef(keyFor(scope, '.scroll'));
	const pending = useRef(false);

	useEffect(() => {
		try {
			pending.current = sessionStorage.getItem(keyFor(scope, '.return')) === '1';
		} catch {}
	}, [scope]);

	useEffect(() => {
		let frame = null;
		const save = () => {
			if (frame) return;
			frame = window.requestAnimationFrame(() => {
				frame = null;
				try {
					if (sessionStorage.getItem(keyFor(scope, '.return')) === '1') return;
					sessionStorage.setItem(key.current, String(window.scrollY));
				} catch {}
			});
		};
		window.addEventListener('scroll', save, { passive: true });
		return () => {
			window.removeEventListener('scroll', save);
			if (frame) window.cancelAnimationFrame(frame);
		};
	}, []);

	useEffect(() => {
		if (!ready || !pending.current) return undefined;
		let y = 0;
		try { y = Number(sessionStorage.getItem(key.current) || 0); } catch {}
		if (!y) {
			pending.current = false;
			try { sessionStorage.removeItem(keyFor(scope, '.return')); } catch {}
			return undefined;
		}
		const timer = window.setTimeout(() => {
			window.scrollTo({ top: y, behavior: 'auto' });
			pending.current = false;
			try { sessionStorage.removeItem(keyFor(scope, '.return')); } catch {}
		}, 160);
		return () => window.clearTimeout(timer);
	}, [ready, scope]);
}
