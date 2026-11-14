import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { loadSampleBank, dryRunSampleImport } from '../lib/questions/sampleBank.js';

function arg(name, fallback = null) {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? process.argv[index + 1] : fallback;
}

const folder = arg('folder');
const courseId = arg('courseId');
const volumeId = arg('volumeId');
const moduleId = arg('moduleId');
const topicId = arg('topicId');
const limit = Number(arg('limit', '25'));

if (!folder) {
	console.error('Usage: node src/scripts/mcpSampleDryRun.js --folder <bank-folder> --courseId <id> --volumeId <id> --moduleId <id> --topicId <id> [--limit 25]');
	process.exit(1);
}

const prisma = new PrismaClient();
try {
	const bank = await loadSampleBank(folder);
	const results = [];
	for (const set of bank.parsed.slice(0, limit)) {
		results.push(await dryRunSampleImport(prisma, set, { courseId, volumeId, moduleId, primaryTopicId: topicId }));
	}
	console.log(JSON.stringify({
		folder,
		setsFound: bank.sets.length,
		setsParsed: bank.parsed.length,
		missingFiles: bank.missing,
		dryRun: results.map(result => ({
			setId: result.setId,
			ok: result.ok,
			mappingErrors: result.mappingErrors || [],
			schemaErrors: result.schemaErrors || [],
			validation: result.validation?.summary || null,
			duplicates: result.duplicates ? {
				exactDuplicate: result.duplicates.exactDuplicate,
				possibleMatches: result.duplicates.possibleMatches?.length || 0
			} : null,
			rawFieldAvailability: result.parsed?.rawFieldAvailability
		}))
	}, null, 2));
} finally {
	await prisma.$disconnect();
}
