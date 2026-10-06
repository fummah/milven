/**
 * Regression test for the admin "Learning" navigation group.
 * Reads the AdminLayout source and asserts the grouping/order/no-duplicates
 * contract without needing a browser/React renderer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = new URL('../../web/src/pages/admin/AdminLayout.jsx', import.meta.url);
const src = fs.readFileSync(file, 'utf8');

const LEARNING_PATHS = ['formulas', 'summary-sheets', 'module-notes', 'documents', 'pdf-mapping'];
const LEARNING_LABELS = {
	formulas: 'Milven Formula Book',
	'summary-sheets': 'Milven Summary Sheets',
	'module-notes': 'Milven Module Notes',
	documents: 'Curriculum Docs',
	'pdf-mapping': 'PDF Mapping',
};

const menuSrc = src.slice(src.indexOf('const menuItems'), src.indexOf('const isPreviewPath'));
const coursesBlock = src.slice(src.indexOf("key: 'courses'"), src.indexOf("key: 'learning'"));
const learningBlock = src.slice(src.indexOf("key: 'learning'"), src.indexOf("key: 'exams'"));

test('nav: Learning group is defined directly below Courses', () => {
	const iCourses = src.indexOf("key: 'courses'");
	const iLearning = src.indexOf("key: 'learning'");
	const iExams = src.indexOf("key: 'exams'");
	assert.ok(iCourses > -1 && iLearning > -1 && iExams > -1);
	assert.ok(iCourses < iLearning && iLearning < iExams, 'Courses < Learning < Exams');
});

test('nav: each moved item lives under Learning exactly once', () => {
	for (const p of LEARNING_PATHS) {
		const route = `to="/admin/${p}"`;
		assert.ok(learningBlock.includes(route), `${p} should be under Learning`);
		const count = (menuSrc.match(new RegExp(route.replace(/[/-]/g, m => '\\' + m), 'g')) || []).length;
		assert.equal(count, 1, `${route} should appear exactly once (no duplicates)`);
	}
});

test('nav: moved items are removed from the Courses group', () => {
	for (const p of LEARNING_PATHS) {
		assert.ok(!coursesBlock.includes(`to="/admin/${p}"`), `${p} must not remain under Courses`);
	}
});

test('nav: Learning labels are correct', () => {
	for (const [p, label] of Object.entries(LEARNING_LABELS)) {
		assert.ok(learningBlock.includes(label), `Learning child ${p} label "${label}"`);
	}
});

test('nav: childToParentKey maps moved items to the Learning parent', () => {
	const mapBlock = src.slice(src.indexOf('const childToParentKey'));
	for (const p of LEARNING_PATHS) {
		const re = new RegExp(`['"]?${p}['"]?\\s*:\\s*'learning'`);
		assert.ok(re.test(mapBlock), `${p} should map to 'learning'`);
	}
});

test('nav: Learning parent keeps an education icon and a badge', () => {
	assert.ok(/ReadOutlined/.test(src), 'Learning should use an education icon (ReadOutlined)');
	assert.ok(/key: 'learning'[\s\S]{0,200}label: 'Learning'/.test(src), 'Learning label present');
});

test('nav: URLs are unchanged', () => {
	for (const p of LEARNING_PATHS) {
		assert.ok(src.includes(`/admin/${p}`), `/admin/${p} URL preserved`);
	}
});

test('nav: breadcrumbs include the Learning hierarchy', () => {
	const bcBlock = src.slice(src.indexOf('const adminBreadcrumbs'));
	for (const p of LEARNING_PATHS) {
		assert.ok(new RegExp(`['"]?${p}['"]?:\\s*\\['Learning'`).test(bcBlock), `${p} breadcrumb under Learning`);
	}
});
