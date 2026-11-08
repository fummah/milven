import { getAccessibleCourseIds } from './entitlements.js';

function compareOrder(a, b) {
	const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
	const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
	if (orderA !== orderB) return orderA - orderB;
	return String(a.name || '').localeCompare(String(b.name || ''));
}

function scopedCourseWhere(courseId, allowedIds) {
	if (courseId) return { courseId };
	if (allowedIds) return { courseId: { in: allowedIds } };
	return {};
}

async function loadVolumeTree(prisma, { courseId, allowedIds }) {
	const links = await prisma.courseVolume.findMany({
		where: scopedCourseWhere(courseId, allowedIds),
		orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
		include: {
			volume: {
				include: {
					modules: {
						where: scopedCourseWhere(courseId, allowedIds),
						orderBy: [{ order: 'asc' }, { name: 'asc' }],
						select: { id: true, name: true, order: true, courseId: true, volumeId: true }
					}
				}
			}
		}
	});

	const byVolume = new Map();
	for (const link of links) {
		const volume = link.volume;
		if (!volume) continue;
		let entry = byVolume.get(volume.id);
		if (!entry) {
			entry = {
				id: volume.id,
				name: volume.name,
				description: volume.description,
				order: link.order ?? null,
				modules: new Map()
			};
			byVolume.set(volume.id, entry);
		} else if (link.order != null && (entry.order == null || link.order < entry.order)) {
			entry.order = link.order;
		}
		for (const module of volume.modules || []) entry.modules.set(module.id, module);
	}

	return [...byVolume.values()]
		.map(volume => ({
			...volume,
			modules: [...volume.modules.values()]
		}))
		.sort(compareOrder);
}

async function noteCounts(prisma, where) {
	const [notes, pdfs] = await Promise.all([
		prisma.moduleNote.findMany({
			where: { ...where, status: 'PUBLISHED' },
			select: { volumeId: true, moduleId: true }
		}),
		prisma.moduleNotePdf.findMany({
			where: { ...where, publicationStatus: 'PUBLISHED' },
			select: {
				id: true,
				volumeId: true,
				pageMaps: { where: { moduleId: { not: null } }, select: { moduleId: true } }
			}
		})
	]);

	const volumeCounts = new Map();
	const moduleCounts = new Map();
	const addVolume = volumeId => {
		if (volumeId) volumeCounts.set(volumeId, (volumeCounts.get(volumeId) || 0) + 1);
	};
	const addModule = moduleId => {
		if (moduleId) moduleCounts.set(moduleId, (moduleCounts.get(moduleId) || 0) + 1);
	};

	for (const note of notes) {
		addVolume(note.volumeId);
		addModule(note.moduleId);
	}
	for (const pdf of pdfs) {
		addVolume(pdf.volumeId);
		const moduleIds = new Set((pdf.pageMaps || []).map(map => map.moduleId).filter(Boolean));
		for (const moduleId of moduleIds) addModule(moduleId);
	}

	return {
		totalCount: notes.length + pdfs.length,
		volumeCounts,
		moduleCounts
	};
}

async function formulaCounts(prisma, where) {
	const [formulas, pdfs] = await Promise.all([
		prisma.formula.findMany({
			where,
			select: { volumeId: true, moduleId: true }
		}),
		prisma.formulaBookPdf.findMany({
			where: { ...where, publicationStatus: 'PUBLISHED' },
			select: {
				volumeId: true,
				pageMaps: { where: { moduleId: { not: null } }, select: { moduleId: true } }
			}
		})
	]);

	const volumeCounts = new Map();
	const moduleCounts = new Map();
	const addVolume = volumeId => {
		if (volumeId) volumeCounts.set(volumeId, (volumeCounts.get(volumeId) || 0) + 1);
	};
	const addModule = moduleId => {
		if (moduleId) moduleCounts.set(moduleId, (moduleCounts.get(moduleId) || 0) + 1);
	};

	for (const formula of formulas) {
		addVolume(formula.volumeId);
		addModule(formula.moduleId);
	}
	for (const pdf of pdfs) {
		addVolume(pdf.volumeId);
		const moduleIds = new Set((pdf.pageMaps || []).map(map => map.moduleId).filter(Boolean));
		for (const moduleId of moduleIds) addModule(moduleId);
	}

	return {
		totalCount: formulas.length + pdfs.length,
		volumeCounts,
		moduleCounts
	};
}

async function summaryCounts(prisma, where) {
	const sheets = await prisma.summarySheet.findMany({
		where: { ...where, status: 'PUBLISHED' },
		select: { volumeId: true, moduleId: true }
	});

	const volumeCounts = new Map();
	const moduleCounts = new Map();
	for (const sheet of sheets) {
		const volumeId = sheet.volumeId;
		if (volumeId) volumeCounts.set(volumeId, (volumeCounts.get(volumeId) || 0) + 1);
		if (sheet.moduleId) moduleCounts.set(sheet.moduleId, (moduleCounts.get(sheet.moduleId) || 0) + 1);
	}

	return {
		totalCount: sheets.length,
		volumeCounts,
		moduleCounts
	};
}

export async function loadResourceNavigation(prisma, user, { kind, courseId }) {
	const allowedIds = await getAccessibleCourseIds(prisma, user);
	const requestedCourseId = String(courseId || '').trim();
	if (requestedCourseId && allowedIds && !allowedIds.includes(requestedCourseId)) {
		const error = new Error('You do not have access to this course.');
		error.status = 403;
		throw error;
	}
	if (allowedIds && allowedIds.length === 0) {
		return { courseId: requestedCourseId || null, totalCount: 0, volumes: [] };
	}

	const volumes = await loadVolumeTree(prisma, {
		courseId: requestedCourseId || null,
		allowedIds
	});
	const where = scopedCourseWhere(requestedCourseId || null, allowedIds);
	const counts = kind === 'SUMMARIES'
		? await summaryCounts(prisma, where)
		: kind === 'FORMULAS'
			? await formulaCounts(prisma, where)
			: await noteCounts(prisma, where);

	return {
		courseId: requestedCourseId || null,
		totalCount: counts.totalCount,
		volumes: volumes.map(volume => ({
			id: volume.id,
			name: volume.name,
			description: volume.description,
			order: volume.order,
			resourceCount: counts.volumeCounts.get(volume.id) || 0,
			modules: volume.modules.map(module => ({
				id: module.id,
				name: module.name,
				order: module.order,
				courseId: module.courseId,
				volumeId: module.volumeId,
				resourceCount: counts.moduleCounts.get(module.id) || 0
			}))
		}))
	};
}
