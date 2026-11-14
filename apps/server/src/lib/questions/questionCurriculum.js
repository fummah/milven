function unique(values) {
	return [...new Set((values || []).filter(Boolean))];
}

function levelLabel(level) {
	return String(level || '').replace('LEVEL', 'Level ');
}

export async function listCourses(prisma) {
	const courses = await prisma.course.findMany({
		orderBy: [{ level: 'asc' }, { name: 'asc' }],
		select: {
			id: true,
			name: true,
			level: true,
			active: true,
			description: true,
			_count: { select: { volumes: true, modules: true, topics: true } }
		}
	});
	return courses.map(course => ({
		id: course.id,
		name: course.name,
		level: course.level,
		levelLabel: levelLabel(course.level),
		active: course.active,
		description: course.description,
		volumeLinkCount: course._count?.volumes || 0,
		moduleCount: course._count?.modules || 0,
		topicCount: course._count?.topics || 0
	}));
}

export async function listVolumes(prisma, { courseId } = {}) {
	if (courseId) {
		const links = await prisma.courseVolume.findMany({
			where: { courseId },
			orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
			include: {
				volume: {
					select: {
						id: true,
						name: true,
						description: true,
						isPathway: true,
						_count: { select: { modules: true } }
					}
				}
			}
		});
		return links.map(link => ({
			id: link.volume.id,
			name: link.volume.name,
			description: link.volume.description,
			isPathway: link.volume.isPathway,
			courseId,
			order: link.order,
			moduleCount: link.volume._count?.modules || 0
		}));
	}
	const volumes = await prisma.volume.findMany({
		orderBy: { name: 'asc' },
		select: {
			id: true,
			name: true,
			description: true,
			isPathway: true,
			courseLinks: { select: { courseId: true, order: true, course: { select: { name: true, level: true } } } },
			_count: { select: { modules: true } }
		}
	});
	return volumes.map(volume => ({
		id: volume.id,
		name: volume.name,
		description: volume.description,
		isPathway: volume.isPathway,
		moduleCount: volume._count?.modules || 0,
		courses: (volume.courseLinks || []).map(link => ({
			id: link.courseId,
			name: link.course?.name,
			level: link.course?.level,
			order: link.order
		}))
	}));
}

export async function listModules(prisma, { courseId, volumeId } = {}) {
	const where = {};
	if (courseId) where.courseId = courseId;
	if (volumeId) where.volumeId = volumeId;
	const modules = await prisma.module.findMany({
		where,
		orderBy: [{ order: 'asc' }, { name: 'asc' }],
		select: {
			id: true,
			name: true,
			level: true,
			courseId: true,
			volumeId: true,
			order: true,
			course: { select: { name: true, level: true } },
			volume: { select: { name: true } },
			_count: { select: { topics: true } }
		}
	});
	return modules.map(module => ({
		id: module.id,
		name: module.name,
		level: module.level,
		courseId: module.courseId,
		courseName: module.course?.name,
		volumeId: module.volumeId,
		volumeName: module.volume?.name,
		order: module.order,
		topicCount: module._count?.topics || 0
	}));
}

export async function listTopics(prisma, { courseId, volumeId, moduleId } = {}) {
	const where = {};
	if (courseId) where.courseId = courseId;
	if (moduleId) where.moduleId = moduleId;
	if (volumeId) where.module = { volumeId };
	const topics = await prisma.topic.findMany({
		where,
		orderBy: [{ moduleId: 'asc' }, { order: 'asc' }, { name: 'asc' }],
		select: {
			id: true,
			name: true,
			level: true,
			courseId: true,
			moduleId: true,
			moduleNumber: true,
			order: true,
			losCode: true,
			commandWord: true,
			learningOutcomeStatement: true,
			module: { select: { name: true, volumeId: true, volume: { select: { name: true } }, course: { select: { name: true } } } },
			_count: { select: { concepts: true, questions: true } }
		}
	});
	return topics.map(topic => ({
		id: topic.id,
		name: topic.name,
		level: topic.level,
		courseId: topic.courseId,
		courseName: topic.module?.course?.name,
		volumeId: topic.module?.volumeId,
		volumeName: topic.module?.volume?.name,
		moduleId: topic.moduleId,
		moduleName: topic.module?.name,
		moduleNumber: topic.moduleNumber,
		order: topic.order,
		losCode: topic.losCode,
		commandWord: topic.commandWord,
		losStatement: topic.learningOutcomeStatement,
		conceptCount: topic._count?.concepts || 0,
		questionCount: topic._count?.questions || 0
	}));
}

export async function listConcepts(prisma, { topicId, topicIds, moduleId, courseId } = {}) {
	const where = {};
	const ids = unique([...(Array.isArray(topicIds) ? topicIds : []), topicId]);
	if (ids.length) where.topicId = { in: ids };
	if (moduleId) where.topic = { moduleId };
	if (courseId) where.topic = { ...(where.topic || {}), courseId };
	const concepts = await prisma.concept.findMany({
		where,
		orderBy: [{ topicId: 'asc' }, { order: 'asc' }, { name: 'asc' }],
		select: {
			id: true,
			name: true,
			topicId: true,
			order: true,
			losCode: true,
			commandWord: true,
			learningOutcomeStatement: true,
			topic: {
				select: {
					name: true,
					moduleId: true,
					module: { select: { name: true, volumeId: true, courseId: true } }
				}
			},
			_count: { select: { questions: true } }
		}
	});
	return concepts.map(concept => ({
		id: concept.id,
		name: concept.name,
		topicId: concept.topicId,
		topicName: concept.topic?.name,
		moduleId: concept.topic?.moduleId,
		moduleName: concept.topic?.module?.name,
		volumeId: concept.topic?.module?.volumeId,
		courseId: concept.topic?.module?.courseId,
		order: concept.order,
		losCode: concept.losCode,
		commandWord: concept.commandWord,
		losStatement: concept.learningOutcomeStatement,
		questionCount: concept._count?.questions || 0
	}));
}

export async function findAcademicCandidates(prisma, { type, name, parentId } = {}) {
	const term = String(name || '').trim();
	if (!term) return [];
	if (type === 'course') {
		return prisma.course.findMany({
			where: { name: { contains: term, mode: 'insensitive' } },
			take: 10,
			select: { id: true, name: true, level: true }
		});
	}
	if (type === 'volume') {
		return prisma.volume.findMany({
			where: {
				name: { contains: term, mode: 'insensitive' },
				...(parentId ? { courseLinks: { some: { courseId: parentId } } } : {})
			},
			take: 10,
			select: { id: true, name: true, courseLinks: { select: { courseId: true } } }
		});
	}
	if (type === 'module') {
		return prisma.module.findMany({
			where: { name: { contains: term, mode: 'insensitive' }, ...(parentId ? { volumeId: parentId } : {}) },
			take: 10,
			select: { id: true, name: true, courseId: true, volumeId: true }
		});
	}
	if (type === 'topic') {
		return prisma.topic.findMany({
			where: { name: { contains: term, mode: 'insensitive' }, ...(parentId ? { moduleId: parentId } : {}) },
			take: 10,
			select: { id: true, name: true, moduleId: true, courseId: true }
		});
	}
	if (type === 'concept') {
		return prisma.concept.findMany({
			where: { name: { contains: term, mode: 'insensitive' }, ...(parentId ? { topicId: parentId } : {}) },
			take: 10,
			select: { id: true, name: true, topicId: true }
		});
	}
	return [];
}

export async function validateAcademicMapping(prisma, mapping) {
	const errors = [];
	const warnings = [];
	const courseId = String(mapping.courseId || '').trim();
	const volumeId = String(mapping.volumeId || '').trim();
	const moduleId = String(mapping.moduleId || '').trim();
	const primaryTopicId = String(mapping.primaryTopicId || '').trim();
	const additionalTopicIds = unique(mapping.additionalTopicIds || []);
	const conceptIds = unique(mapping.conceptIds || []);

	if (!courseId) errors.push({ code: 'COURSE_REQUIRED', path: 'courseId', message: 'courseId is required.' });
	if (!volumeId) errors.push({ code: 'VOLUME_REQUIRED', path: 'volumeId', message: 'volumeId is required.' });
	if (!moduleId) errors.push({ code: 'MODULE_REQUIRED', path: 'moduleId', message: 'moduleId is required.' });
	if (!primaryTopicId) errors.push({ code: 'TOPIC_REQUIRED', path: 'primaryTopicId', message: 'primaryTopicId is required.' });

	const course = courseId
		? await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, level: true, active: true } })
		: null;
	if (courseId && !course) errors.push({ code: 'COURSE_NOT_FOUND', path: 'courseId', message: 'Course not found.' });

	const volume = volumeId
		? await prisma.volume.findUnique({ where: { id: volumeId }, select: { id: true, name: true } })
		: null;
	if (volumeId && !volume) errors.push({ code: 'VOLUME_NOT_FOUND', path: 'volumeId', message: 'Volume not found.' });

	const courseVolume = courseId && volumeId
		? await prisma.courseVolume.findUnique({ where: { courseId_volumeId: { courseId, volumeId } }, select: { courseId: true } })
		: null;
	if (courseId && volumeId && !courseVolume) {
		errors.push({ code: 'VOLUME_NOT_IN_COURSE', path: 'volumeId', message: 'Volume does not belong to the selected course.' });
	}

	const module = moduleId
		? await prisma.module.findUnique({
			where: { id: moduleId },
			select: { id: true, name: true, courseId: true, volumeId: true, level: true }
		})
		: null;
	if (moduleId && !module) errors.push({ code: 'MODULE_NOT_FOUND', path: 'moduleId', message: 'Module not found.' });
	if (module && courseId && module.courseId !== courseId) {
		errors.push({ code: 'MODULE_NOT_IN_COURSE', path: 'moduleId', message: 'Module does not belong to the selected course.' });
	}
	if (module && volumeId && module.volumeId !== volumeId) {
		errors.push({ code: 'MODULE_NOT_IN_VOLUME', path: 'moduleId', message: 'Module does not belong to the selected volume.' });
	}

	const topicIds = unique([primaryTopicId, ...additionalTopicIds]);
	const topics = topicIds.length
		? await prisma.topic.findMany({
			where: { id: { in: topicIds } },
			select: {
				id: true,
				name: true,
				courseId: true,
				moduleId: true,
				level: true,
				losCode: true,
				commandWord: true,
				learningOutcomeStatement: true
			}
		})
		: [];
	const topicById = new Map(topics.map(topic => [topic.id, topic]));
	for (const topicId of topicIds) {
		const topic = topicById.get(topicId);
		if (!topic) errors.push({ code: 'TOPIC_NOT_FOUND', path: 'primaryTopicId', message: `Topic not found: ${topicId}` });
		else if (moduleId && topic.moduleId !== moduleId) {
			errors.push({ code: 'TOPIC_NOT_IN_MODULE', path: 'primaryTopicId', message: `Topic ${topic.name} does not belong to the selected module.` });
		}
	}

	const concepts = conceptIds.length
		? await prisma.concept.findMany({
			where: { id: { in: conceptIds } },
			select: { id: true, name: true, topicId: true, losCode: true, commandWord: true, learningOutcomeStatement: true }
		})
		: [];
	const conceptById = new Map(concepts.map(concept => [concept.id, concept]));
	const topicSet = new Set(topicIds);
	for (const conceptId of conceptIds) {
		const concept = conceptById.get(conceptId);
		if (!concept) errors.push({ code: 'CONCEPT_NOT_FOUND', path: 'conceptIds', message: `Concept not found: ${conceptId}` });
		else if (!topicSet.has(concept.topicId)) {
			errors.push({ code: 'CONCEPT_NOT_IN_TOPIC', path: 'conceptIds', message: `Concept ${concept.name} does not belong to the selected topic(s).` });
		}
	}

	if (course && module && module.level !== course.level) {
		warnings.push({ code: 'LEVEL_MISMATCH', message: 'Course and module levels differ; course level will be used.' });
	}

	return {
		ok: errors.length === 0,
		errors,
		warnings,
		course,
		volume,
		module,
		topics,
		concepts,
		topicIds,
		conceptIds,
		level: course?.level || module?.level || null
	};
}

export async function getCurriculumContext(prisma, { courseId, volumeId, moduleId, topicIds, conceptIds, includeExcerpt = true } = {}) {
	const ids = unique(topicIds || []);
	const primaryTopicId = ids[0] || null;
	const mapping = await validateAcademicMapping(prisma, {
		courseId,
		volumeId,
		moduleId,
		primaryTopicId,
		additionalTopicIds: ids.slice(1),
		conceptIds
	});
	if (!mapping.ok && ids.length) return { ...mapping, curriculum: null };

	const [documents, formulas, notes] = await Promise.all([
		includeExcerpt && courseId && volumeId
			? prisma.curriculumDocument.findUnique({
				where: { courseId_volumeId: { courseId, volumeId } },
				select: { filename: true, extractedText: true, updatedAt: true }
			})
			: null,
		ids.length
			? prisma.formula.findMany({
				where: { topicId: { in: ids } },
				orderBy: [{ name: 'asc' }],
				take: 40,
				select: { id: true, name: true, formula: true, variables: true, whenToUse: true, topicId: true }
			})
			: [],
		ids.length
			? prisma.moduleNote.findMany({
				where: { topicId: { in: ids }, status: 'PUBLISHED' },
				orderBy: { updatedAt: 'desc' },
				take: 10,
				select: { id: true, title: true, topicId: true, overview: true }
			})
			: []
	]);

	const excerpt = documents?.extractedText
		? String(documents.extractedText).replace(/\u0000/g, '').slice(0, 12000)
		: null;

	return {
		ok: mapping.ok,
		errors: mapping.errors,
		warnings: mapping.warnings,
		course: mapping.course,
		volume: mapping.volume,
		module: mapping.module,
		topics: mapping.topics,
		concepts: mapping.concepts,
		curriculum: {
			document: documents ? { filename: documents.filename, updatedAt: documents.updatedAt } : null,
			excerpt,
			excerptTruncated: Boolean(documents?.extractedText && documents.extractedText.length > 12000),
			formulas,
			publishedNotes: notes
		}
	};
}
