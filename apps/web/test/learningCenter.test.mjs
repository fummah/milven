import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');
const layout = read('src/pages/student/StudentLayout.jsx');
const page = read('src/pages/student/StudentLearning.jsx');
const cards = read('src/components/learning-center/LearningCenter.jsx');
const css = read('src/components/learning-center/learning-center.css');
const globalCss = read('src/index.css');

test('student navigation consolidates all learning resources under Learning', () => {
	assert.match(layout, /key: 'learning'[\s\S]*Learning Center[\s\S]*Milven Module Notes[\s\S]*Milven Summary Sheets[\s\S]*Milven Formula Book[\s\S]*Milven Slides/);
	assert.doesNotMatch(layout, /Study Tools/);
	assert.match(layout, /key: 'student-courses'[\s\S]*My Courses/);
});

test('revision list is under Exams & Practice and auto-expands its parent', () => {
	assert.match(layout, /key: 'exams-group'[\s\S]*Revision List/);
	assert.match(layout, /'student-revision': 'exams-group'/);
	assert.doesNotMatch(layout, /'student-revision': 'study-tools'/);
});

test('learning resources keep their existing routes', () => {
	for (const route of ['/student/learning', '/student/module-notes', '/student/summary-sheets', '/student/formula-book', '/student/slides']) {
		assert.match(layout, new RegExp(route.replaceAll('/', '\\/')));
	}
	assert.match(layout, /\/student\/revision/);
});

test('Learning Center is a four-category resource hub with selected-course links', () => {
	for (const route of ['/student/module-notes', '/student/summary-sheets', '/student/formula-book', '/student/slides']) {
		assert.match(page, new RegExp(route.replaceAll('/', '\\/')));
	}
	assert.match(page, /tone: 'notes'/);
	assert.match(page, /tone: 'summaries'/);
	assert.match(page, /tone: 'formulas'/);
	assert.match(page, /tone: 'slides'/);
	assert.match(cards, /courseId \? `\$\{card\.to\}\?courseId=/);
	assert.match(page, /Explore Notes/);
	assert.match(page, /Explore Summaries/);
	assert.match(page, /Explore Formulas/);
	assert.match(page, /Explore Slides/);
});

test('resource counts use existing authorized aggregate APIs only', () => {
	assert.match(page, /\/api\/slides\/library\/courses/);
	assert.match(page, /\/api\/module-notes\/unified/);
	assert.match(page, /\/api\/summary-sheets\/unified/);
	assert.match(page, /\/api\/formulas\/unified/);
	assert.match(page, /\/api\/slides\/library\/stats/);
	assert.match(page, /AbortController/);
	assert.doesNotMatch(page, /3762|3,762|40 presentations/);
});

test('Continue Learning uses real course progress endpoints and preserves the route', () => {
	assert.match(page, /\/api\/learning\/me\/courses/);
	assert.match(page, /progressPercent/);
	assert.match(page, /Continue Curriculum/);
	assert.match(page, /\/student\/learn\/\$\{courseId\}/);
	assert.match(page, /No saved curriculum progress yet/);
});

test('Learning Center cards are responsive and use a single navigation target', () => {
	assert.match(cards, /<Link className=\{`learning-category-card/);
	assert.doesNotMatch(cards, /<button[^>]*learning-category-card/);
	assert.doesNotMatch(cards, /<Button[^>]*Explore/);
	assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
	assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
	assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
	assert.match(css, /overflow-wrap: anywhere/);
});

test('Learning Center does not fabricate recent-resource activity', () => {
	assert.doesNotMatch(page, /Recently Accessed/);
	assert.doesNotMatch(page, /fabricat/i);
});

test('collapsed parent navigation uses controlled floating submenus', () => {
	assert.match(layout, /collapsedOpenKeys/);
	assert.match(layout, /openKeys=\{collapsed \? collapsedOpenKeys : openKeys\}/);
	assert.match(layout, /popupClassName: 'student-submenu-popup/);
	assert.match(layout, /onTitleClick: \(\) => onParentTitleClick/);
	assert.doesNotMatch(layout, /openKeys=\{collapsed \? \[\] : openKeys\}/);
});

test('collapsed floating menus support escape, outside click and keyboard activation', () => {
	assert.match(layout, /event\.key === 'Escape'/);
	assert.match(layout, /document\.addEventListener\('pointerdown', closeOutside, true\)/);
	assert.match(layout, /event\.key !== ' ' && event\.key !== 'Spacebar'/);
	assert.match(layout, /onKeyDown=\{handleCollapsedMenuKeyDown\}/);
});

test('floating submenu styling is premium, layered and viewport-safe', () => {
	assert.match(globalCss, /\.student-submenu-popup[\s\S]*z-index: 1050/);
	assert.match(globalCss, /\.student-submenu-popup \.ant-menu[\s\S]*width: 278px/);
	assert.match(globalCss, /max-height: min\(70vh, 520px\)/);
	assert.match(globalCss, /\.student-submenu-popup\.student-submenu-exams \.ant-menu::before/);
	assert.match(globalCss, /\.modern-sider\.ant-layout-sider-collapsed \.ant-menu-submenu-selected/);
	assert.match(globalCss, /\.student-submenu-popup \.ant-menu-item:focus-within/);
});