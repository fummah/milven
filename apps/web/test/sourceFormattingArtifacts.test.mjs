import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function files(directory) {
	const entries = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const full = path.join(directory, entry.name);
		if (entry.isDirectory()) entries.push(...files(full));
		else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) entries.push(full);
	}
	return entries;
}

test('frontend source contains no literal PowerShell escape artifacts', () => {
	const root = path.resolve(process.cwd(), 'src');
	const failures = files(root)
		.map(file => ({ file, matches: fs.readFileSync(file, 'utf8').match(/(?:`[rnt]){2,}/g) || [] }))
		.filter(entry => entry.matches.length > 0);
	assert.deepEqual(failures, []);
});
