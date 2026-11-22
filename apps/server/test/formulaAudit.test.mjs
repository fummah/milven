import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFormulaText } from '../src/lib/questions/formulaAudit.js';

test('formula audit flags control characters and missing backslashes without rewriting source', () => {
	assert.ok(auditFormulaText(String.raw`$EV = 10 	imes EBITDA$`).some(issue => issue.code === 'SUSPICIOUS_CONTROL_CHARACTER'));
	assert.ok(auditFormulaText(String.raw`$EV = 10 imes EBITDA$`).some(issue => issue.code === 'MISSING_TEX_BACKSLASH'));
	assert.ok(auditFormulaText(String.raw`$EV = 10 \times EBITDA$`).length === 0);
});
