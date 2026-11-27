import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');
const pages = {
	slides: read('src/pages/student/StudentSlides.jsx'),
	notes: read('src/pages/student/StudentModuleNotes.jsx'),
	formula: read('src/pages/student/StudentFormulaBook.jsx'),
	summaries: read('src/pages/student/StudentSummarySheets.jsx')
};

test('auto-collapse covers every learning resource explorer route', () => {
	const layout = read('src/pages/student/StudentLayout.jsx');
	assert.match(layout, /isResourceExplorerPath/);
	assert.match(layout, /slides\|module-notes\|formula-book\|summary-sheets/);
	assert.match(layout, /manualOverridePath/);
	assert.match(layout, /onCollapse=\{handleSidebarCollapse\}/);
});

test('all four resource pages use the shared explorer shell', () => {
	for (const source of Object.values(pages)) {
		assert.match(source, /LearningExplorerLayout/);
		assert.match(source, /LearningExplorerHero/);
		assert.match(source, /LearningResourceHeader/);
		assert.match(source, /LearningResourceStats/);
		assert.match(source, /LearningResourceSkeleton/);
		assert.match(source, /LearningResourceEmptyState/);
		assert.match(source, /LearningResourceCard/);
	}
});

test('table remains the default and grid is available on every page', () => {
	for (const source of Object.values(pages)) {
		assert.match(source, /\|\| 'table'/);
		assert.match(source, /LearningResourceCard/);
		assert.match(source, /learning-resource-table/);
		assert.match(source, /learning-resource-grid/);
	}
});

test('module notes and formula book keep concise academic columns', () => {
	assert.doesNotMatch(pages.notes, /title: 'Learning Module'/);
	assert.doesNotMatch(pages.notes, /title: 'Status'/);
	assert.doesNotMatch(pages.formula, /title: 'Learning Module'/);
	assert.doesNotMatch(pages.formula, /title: 'Status'/);
	assert.match(pages.notes, /ResourceTypeForVolume/);
	assert.match(pages.formula, /ResourceTypeForVolume/);
});

test('summary explorer does not reintroduce the redundant source filter', () => {
	assert.doesNotMatch(pages.summaries, /All Sources/);
	assert.doesNotMatch(pages.summaries, /filterSource/);
});

test('long resource titles and sidebar labels can wrap without overlap', () => {
	const css = read('src/components/learning-explorer/learning-explorer.css');
	assert.match(css, /\.learning-resource-title[\s\S]*overflow-wrap: anywhere/);
	assert.match(css, /\.learning-card-title button[\s\S]*overflow-wrap: anywhere/);
	assert.match(css, /\.learning-sidebar-row-title[\s\S]*overflow-wrap: anywhere/);
	assert.match(css, /grid-template-columns: minmax\(240px, 290px\) minmax\(0, 1fr\)/);
});

test('resource pages restore filters in the URL before opening viewers', () => {
	for (const source of Object.values(pages)) {
		assert.match(source, /useSearchParams/);
		assert.match(source, /setSearchParams\(next, \{ replace: true \}\)/);
		assert.match(source, /markExplorerReturn/);
		assert.match(source, /useExplorerScrollMemory/);
	}
});
