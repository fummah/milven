/**
 * Regression test for the Learning Modules table "Add Topic" row action.
 * Static source checks (no React renderer in this repo).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = new URL('../../web/src/pages/admin/AdminTopics.jsx', import.meta.url);
const src = fs.readFileSync(file, 'utf8');

test('addTopic: a row action opens the New Topic drawer for the clicked module', () => {
	assert.match(src, /const openAddTopicForModule = \(mod\) =>/, 'handler defined');
	assert.match(src, /onClick=\{\(\) => openAddTopicForModule\(record\)\}/, 'wired to the module row');
	assert.match(src, /<Tooltip title="Add Topic"><Button size="small" type="text" icon=\{<PlusOutlined \/>\}/, 'renders the +Topic icon button');
});

test('addTopic: pre-populates course, volume, module and order', () => {
	assert.match(src, /form\.setFieldsValue\(\{ courseId, volumeId, moduleId: mod\.id, order: maxOrder \+ 1 \}\)/, 'sets course/volume/module/order');
	// Derives course/volume when the module object lacks them directly.
	assert.match(src, /const courseId = mod\.courseId \|\| \(courses\.find\(c => c\.level === mod\.level\)\?\.id \?\? ''\)/, 'courseId fallback by level');
	assert.match(src, /const volumeId = mod\.volumeId \|\| undefined/, 'volumeId from module');
});

test('addTopic: resets transient state and targets the clicked module only', () => {
	const handlerBlock = src.slice(src.indexOf('const openAddTopicForModule'), src.indexOf('const openEditConceptDrawer'));
	assert.match(handlerBlock, /setEditing\(null\)/, 'clears edit mode');
	assert.match(handlerBlock, /setTopicStep\(0\)/, 'starts at details step');
	assert.match(handlerBlock, /form\.resetFields\(\)/, 'resets prior values');
	assert.match(handlerBlock, /setDrawerOpen\(true\)/, 'opens the drawer');
});

test('addTopic: global New Topic button still resets to empty selection', () => {
	assert.match(src, /form\.setFieldsValue\(\{ courseId: '', volumeId: undefined, moduleId: '' \}\)/, 'global button clears module');
});

test('addTopic: editing an existing topic still loads its own values (not overwritten)', () => {
	assert.match(src, /setEditing\(topicRow\)/, 'edit topic sets editing');
	assert.match(src, /moduleId: topicRow\.moduleId \|\| ''/, 'edit loads the topic module');
});

test('addTopic: PlusOutlined icon is imported', () => {
	assert.match(src, /import \{[^}]*PlusOutlined[^}]*\} from '@ant-design\/icons'/, 'PlusOutlined imported');
});
