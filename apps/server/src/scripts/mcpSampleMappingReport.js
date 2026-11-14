import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { loadSampleBank } from '../lib/questions/sampleBank.js';

function arg(name, fallback = null) {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? process.argv[index + 1] : fallback;
}

const folder = arg('folder');
if (!folder) {
	console.error('Usage: node src/scripts/mcpSampleMappingReport.js --folder <bank-folder>');
	process.exit(1);
}

const prisma = new PrismaClient();
try {
	const bank = await loadSampleBank(folder);
	const course = await prisma.course.findFirst({ where: { name: 'CFA III' } });
	const courseId = arg('courseId', course?.id);
	const volumes = await prisma.courseVolume.findMany({
		where: { courseId },
		include: { volume: { select: { id: true, name: true } } }
	});
	const volumeByName = new Map(volumes.map(link => [link.volume.name.toLowerCase(), link.volume]));
	const modules = await prisma.module.findMany({
		where: { courseId },
		select: { id: true, name: true, volumeId: true }
	});
	const topics = await prisma.topic.findMany({
		where: { courseId },
		select: { id: true, name: true, moduleId: true }
	});
	const moduleByVolumeName = new Map(modules.map(module => [`${module.volumeId}|${module.name.toLowerCase()}`, module]));
	const topicsByModule = new Map();
	for (const topic of topics) {
		if (!topicsByModule.has(topic.moduleId)) topicsByModule.set(topic.moduleId, []);
		topicsByModule.get(topic.moduleId).push(topic);
	}
	const missingVolumes = new Map();
	const missingModules = new Map();
	const missingTopics = new Map();
	let exactSets = 0;
	let exactQuestions = 0;
	for (const set of bank.parsed) {
		const volume = volumeByName.get(String(set.volume || '').toLowerCase());
		if (!volume) {
			missingVolumes.set(set.volume || '(blank)', (missingVolumes.get(set.volume || '(blank)') || 0) + 1);
			continue;
		}
		const module = moduleByVolumeName.get(`${volume.id}|${String(set.learningModule || '').toLowerCase()}`);
		if (!module) {
			const key = `${set.volume}|${set.learningModule}`;
			missingModules.set(key, (missingModules.get(key) || 0) + 1);
			continue;
		}
		const available = topicsByModule.get(module.id) || [];
		const exactTopicIds = new Map(available.map(topic => [topic.name.toLowerCase(), topic.id]));
		let setExact = true;
		for (const question of set.questions) {
			if (exactTopicIds.has(String(question.topicName || '').toLowerCase())) exactQuestions += 1;
			else {
				setExact = false;
				const key = `${module.id}|${question.topicName}`;
				missingTopics.set(key, (missingTopics.get(key) || 0) + 1);
			}
		}
		if (setExact) exactSets += 1;
	}
	console.log(JSON.stringify({
		folder,
		courseId,
		sets: bank.parsed.length,
		questions: bank.parsed.reduce((sum, set) => sum + set.questions.length, 0),
		exactSets,
		exactQuestions,
		missingVolumes: [...missingVolumes.entries()].map(([name, count]) => ({ name, count })),
		missingModules: [...missingModules.entries()].map(([name, count]) => ({ source: name, count })),
		missingTopics: [...missingTopics.entries()].map(([name, count]) => ({ source: name, count }))
	}, null, 2));
} finally {
	await prisma.$disconnect();
}
