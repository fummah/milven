import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { applyOptionTextRepairs, scanOptionTextRepairs } from '../lib/questions/optionRepair.js';
import { inspectOptionText } from '../lib/questions/optionText.js';

const apply = process.argv.includes('--apply');
const limitArg = process.argv.find(argument => argument.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 100000;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.resolve(process.cwd(), 'backups');
fs.mkdirSync(backupDir, { recursive: true });

function writeReport(name, value) {
	const file = path.join(backupDir, `option-text-${name}-${stamp}.json`);
	fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
	return file;
}

function databaseBackup() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('DATABASE_URL is required.');
	const url = new URL(databaseUrl);
	const executable = process.env.PG_DUMP_PATH || 'pg_dump';
	const output = path.join(backupDir, `milven-before-option-repair-${stamp}.dump`);
	const result = spawnSync(executable, [
		'--host', url.hostname,
		'--port', url.port || '5432',
		'--username', decodeURIComponent(url.username),
		'--dbname', url.pathname.replace(/^\//, ''),
		'--format', 'custom',
		'--no-owner',
		'--no-privileges',
		'--file', output
	], {
		env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
		encoding: 'utf8'
	});
	if (result.error) throw new Error(`pg_dump could not start: ${result.error.message}. Set PG_DUMP_PATH if it is not on PATH.`);
	if (result.status !== 0) throw new Error(`pg_dump failed: ${result.stderr || result.stdout || `exit ${result.status}`}`);
	return output;
}

const prisma = new PrismaClient();
try {
	const report = await scanOptionTextRepairs(prisma, { limit });
	const reportFile = writeReport('audit', report);
	console.log(JSON.stringify({
		mode: apply ? 'apply' : 'dry-run',
		scanned: report.scanned,
		candidateCount: report.candidateCount,
		autoCleanableCount: report.autoCleanableCount,
		reportFile,
		candidates: report.candidates.map(candidate => ({
			qid: candidate.qid,
			questionId: candidate.questionId,
			optionId: candidate.optionId,
			position: candidate.position,
			isCorrect: candidate.isCorrect,
			field: candidate.field,
			originalText: candidate.originalText,
			proposedText: candidate.proposedText,
			confidence: candidate.safeToAutoClean ? 'SAFE' : 'MANUAL_REVIEW',
			artifacts: candidate.artifacts.map(artifact => artifact.code)
		}))
	}, null, 2));

	if (!apply) {
		console.log('Dry run only. Re-run with --apply after administrator review.');
		process.exitCode = 0;
	} else {
		if (!report.autoCleanableCount) {
			console.log('No unambiguous repairs available.');
			process.exitCode = 0;
		} else {
			const dbBackup = databaseBackup();
			const rollbackFile = writeReport('rollback', report.candidates.map(candidate => ({
				optionId: candidate.optionId,
				questionId: candidate.questionId,
				qid: candidate.qid,
				field: candidate.field,
				originalText: candidate.originalText
			})));
			const safe = report.candidates.filter(candidate => candidate.safeToAutoClean);
			const applied = await applyOptionTextRepairs(prisma, safe.map(candidate => ({
				id: candidate.optionId,
				field: candidate.field,
				expectedText: candidate.originalText
			})), { actorId: null });
			const questionIds = [...new Set(safe.map(candidate => candidate.questionId).filter(Boolean))];
			const savedOptions = await prisma.mcqOption.findMany({
				where: { id: { in: safe.map(candidate => candidate.optionId) } },
				orderBy: { position: 'asc' }
			});
			const artifactFailures = savedOptions.filter(option => inspectOptionText(option.text).artifacts.length || inspectOptionText(option.rationale).artifacts.length);
			const questionOptions = await prisma.mcqOption.findMany({
				where: { questionId: { in: questionIds } },
				orderBy: [{ questionId: 'asc' }, { position: 'asc' }]
			});
			const correctnessFailures = questionIds.filter(questionId => {
				const options = questionOptions.filter(option => option.questionId === questionId);
				return options.filter(option => option.isCorrect).length !== 1;
			});
			const resultFile = writeReport('result', {
				databaseBackup: dbBackup,
				rollbackFile,
				applied,
				artifactFailures,
				correctnessFailures
			});
			console.log(JSON.stringify({ databaseBackup: dbBackup, rollbackFile, resultFile, repairedCount: applied.repairedCount, artifactFailures: artifactFailures.length, correctnessFailures }, null, 2));
			process.exitCode = applied.ok && artifactFailures.length === 0 && correctnessFailures.length === 0 ? 0 : 1;
		}
	}
} finally {
	await prisma.$disconnect();
}
