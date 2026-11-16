import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { checkQuestionDuplicates } from './questionDuplicates.js';
import { normalizeQuestionPayload } from './questionSchema.js';
import { validateQuestionPayload } from './questionValidation.js';
import { validateAcademicMapping } from './questionCurriculum.js';

function clean(value) {
	return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanHtml(value) {
	return String(value || '')
		.replace(/\u0000/g, '')
		.replace(/<p[^>]*>\s*<\/p>/gi, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

function splitMetadata(text) {
	return String(text || '').split(/\s*[·•�]\s*/).map(clean).filter(Boolean);
}

function extractTex($, node) {
	const annotations = $(node).find('annotation[encoding="application/x-tex"]').map((_, element) => clean($(element).text())).get().filter(Boolean);
	if (annotations.length) return annotations.map(annotation => `\\[ ${annotation} \\]`).join('\n');
	return clean($(node).text());
}

function extractPage(section) {
	const text = clean(section);
	const match = text.match(/\((?:p\.?|page)\s*([^)]+)\)/i);
	return match ? `p. ${match[1].trim()}` : null;
}

function sectionContent($, sol, heading) {
	const headingNode = $(sol).find('h4').filter((_, element) => clean($(element).text()).toLowerCase() === heading.toLowerCase()).first();
	if (!headingNode.length) return null;
	const chunks = [];
	let next = headingNode.next();
	while (next.length && !/^H[1-6]$/i.test(next[0].tagName || '') && next[0].tagName !== 'dl') {
		chunks.push($.html(next));
		next = next.next();
	}
	return chunks.join('\n').trim() || null;
}

function optionText($, option) {
	const clone = $(option).clone();
	clone.find('.ltr').remove();
	return clean(clone.text());
}

export function splitExplanation(explanation) {
	const parts = {
		correctAnswerExplanation: null,
		incorrectOptionsExplanation: null,
		commonMistake: null,
		conceptsTested: null,
		other: []
	};
	if (!explanation) return parts;
	const $ = cheerio.load(`<div id="explanation-root">${explanation}</div>`);
	const root = $('#explanation-root');
	root.find('p').each((_, element) => {
		const clone = $(element).clone();
		const labelNode = clone.find('strong').first();
		const label = clean(labelNode.text()).toLowerCase().replace(/:\s*$/, '');
		let key = null;
		if (label === 'correct answer') key = 'correctAnswerExplanation';
		else if (/^why (the )?other options are wrong$/.test(label)) key = 'incorrectOptionsExplanation';
		else if (label === 'common mistake') key = 'commonMistake';
		else if (label === 'concepts tested') key = 'conceptsTested';
		if (!key) {
			const html = cleanHtml($.html(element));
			if (html) parts.other.push(html);
			return;
		}
		labelNode.remove();
		const html = cleanHtml(clone.html()) || clean(clone.text());
		if (!html) return;
		parts[key] = [parts[key], html].filter(Boolean).join('\n');
	});
	return parts;
}

function parseHeader($) {
	const headerText = clean($('header p').first().text());
	const parts = splitMetadata(headerText);
	const setIndex = parts.findIndex(part => /^SET-\d{3}$/i.test(part));
	const setId = setIndex >= 0 ? parts[setIndex].toUpperCase() : (headerText.match(/SET-\d{3}/i)?.[0]?.toUpperCase() || null);
	const volume = parts.find((part, index) => index > setIndex && !/^Learning Module/i.test(part) && !/points?$/i.test(part) && !/^review:/i.test(part)) || null;
	const modulePart = parts.find(part => /^Learning Module\s+\d+/i.test(part)) || null;
	const learningModule = modulePart ? modulePart.replace(/^Learning Module\s+\d+\s*:\s*/i, '').trim() : null;
	const pointsPart = parts.find(part => /points?$/i.test(part)) || headerText.match(/(\d+)\s*points?/i)?.[0] || null;
	const totalMarks = Number(String(pointsPart || '').match(/\d+/)?.[0] || 0);
	const caseStudyTitle = clean($('header h1').first().text()) || null;
	return { setId, volume, learningModule, learningModuleFull: modulePart, totalMarks, caseStudyTitle };
}

function parseVignette($, volume) {
	const node = $('.vig').first();
	if (!node.length) return null;
	const clone = node.clone();
	clone.find('p').each((_, element) => {
		const text = clean($(element).text());
		if (!text) $(element).remove();
		else if (volume && text === volume) $(element).remove();
		else if (/TOTAL POINT VALUE OF THIS QUESTION SET/i.test(text)) $(element).remove();
	});
	return cleanHtml(clone.html());
}

export function parseSampleBankIndex(html, { sourceFile = 'index.html' } = {}) {
	const $ = cheerio.load(html);
	const sets = [];
	$('a[href]').each((_, element) => {
		const href = $(element).attr('href');
		const match = String(href || '').match(/SET-(\d{3})\.html/i);
		if (!match) return;
		const row = $(element).closest('tr');
		const cells = row.find('td').map((__, cell) => clean($(cell).text())).get();
		sets.push({
			setId: `SET-${match[1]}`,
			filename: path.basename(href),
			title: cells[3] || clean($(element).text()) || `SET-${match[1]}`,
			volume: cells[1] || null,
			learningModuleFull: cells[2] || null,
			learningModule: cells[2] ? cells[2].replace(/^Learning Module\s+\d+\s*:\s*/i, '').trim() : null,
			reviewStatus: cells[4] || null,
			sourceFile
		});
	});
	return [...new Map(sets.map(set => [set.setId, set])).values()].sort((a, b) => a.setId.localeCompare(b.setId));
}

export function parseSampleSetHtml(html, { setId = null, sourceFile = null } = {}) {
	const $ = cheerio.load(html);
	const header = parseHeader($);
	const derivedSetId = setId || header.setId || clean($('title').text()).match(/SET-\d{3}/i)?.[0]?.toUpperCase() || null;
	const vignette = parseVignette($, header.volume);
	const questions = [];
	$('section.q').each((index, sectionNode) => {
		const section = $(sectionNode);
		const qhead = section.find('.qhead').first();
		const qn = clean(qhead.find('.qn').first().text());
		const metaText = clean(qhead.find('.meta').first().text());
		const qid = metaText.match(/(Q-[A-Z0-9-]+)\s*$/i)?.[1] || null;
		const topicName = clean(metaText.replace(/\s*[·•�]\s*Q-[A-Z0-9-]+\s*$/i, '')) || null;
		const stemParts = [];
		section.children().each((_, child) => {
			const node = $(child);
			const className = String(child.attribs?.class || '');
			if (className.includes('qhead')) return;
			if (className.includes('opts') || child.tagName === 'ol') return false;
			if (className.includes('sol') || className.includes('reveal') || child.tagName === 'button') return;
			stemParts.push($.html(node));
		});
		const options = [];
		section.find('ol.opts li.opt').each((_, optionNode) => {
			const option = $(optionNode);
			options.push({
				label: clean(option.find('.ltr').first().text()) || String.fromCharCode(65 + options.length),
				text: optionText($, optionNode),
				isCorrect: option.hasClass('ok')
			});
		});
		const sol = section.find('.sol').first();
		const answerText = clean(sol.find('.key').first().text());
		const correctAnswer = answerText.match(/Answer\s*:\s*([A-F])/i)?.[1]?.toUpperCase() || options.find(option => option.isCorrect)?.label || null;
		if (correctAnswer) for (const option of options) option.isCorrect = option.label === correctAnswer;
		const workedSolution = sectionContent($, sol, 'Worked solution');
		const explanation = sectionContent($, sol, 'Explanation');
		const explanationParts = splitExplanation(explanation);
		const keyFormulasNode = sol.find('h4').filter((_, element) => /^Key formulas?$/i.test(clean($(element).text()))).first();
		const keyFormulas = keyFormulasNode.length
			? (() => {
				const formulaNode = keyFormulasNode.nextAll('p, div').first();
				const value = formulaNode.length ? extractTex($, formulaNode) : null;
				return value && !/^none\b/i.test(value) ? value : null;
			})()
			: null;
		const trace = {};
		sol.find('dl.trace dt').each((_, dt) => {
			const key = clean($(dt).text());
			const value = clean($(dt).next('dd').text());
			if (key && value) trace[key.toLowerCase()] = value;
		});
		const sectionText = trace.section || null;
		const commonMistake = explanationParts.commonMistake || null;
		const conceptsTested = explanationParts.conceptsTested || trace.concept || null;
		questions.push({
			number: Number(qn.match(/\d+/)?.[0] || index + 1),
			externalQuestionId: qid,
			topicName,
			stem: cleanHtml(stemParts.join('\n')),
			options,
			correctAnswer,
			workedSolution,
			explanation,
			sourceExplanation: explanation,
			correctAnswerExplanation: explanationParts.correctAnswerExplanation,
			incorrectOptionsExplanation: explanationParts.incorrectOptionsExplanation,
			commonMistake,
			conceptsTested,
			los: trace.los || null,
			traceSection: sectionText ? sectionText.replace(/\s*\([^)]*\)\s*$/, '').trim() : null,
			tracePage: extractPage(sectionText || ''),
			keyFormulas,
			marks: null
		});
	});
	const totalMarks = header.totalMarks || 0;
	return {
		setId: derivedSetId,
		sourceFile,
		volume: header.volume,
		learningModule: header.learningModule,
		learningModuleFull: header.learningModuleFull,
		caseStudyTitle: header.caseStudyTitle,
		vignette,
		questions,
		totalMarks,
		rawFieldAvailability: {
			caseStudyTitle: Boolean(header.caseStudyTitle),
			sourceSetId: Boolean(derivedSetId),
			vignette: Boolean(vignette),
			options: questions.some(question => question.options.length > 0),
			correctAnswers: questions.some(question => question.correctAnswer),
			workedSolutions: questions.some(question => question.workedSolution),
			explanations: questions.some(question => question.explanation),
			correctAnswerExplanations: questions.every(question => question.correctAnswerExplanation),
			incorrectOptionsExplanations: questions.every(question => question.incorrectOptionsExplanation),
			commonMistakes: questions.every(question => question.commonMistake),
			conceptsTested: questions.every(question => question.conceptsTested),
			los: questions.some(question => question.los),
			trace: questions.some(question => question.traceSection || question.tracePage),
			concepts: questions.some(question => question.conceptsTested),
			formulas: questions.some(question => question.keyFormulas && !/none/i.test(question.keyFormulas)),
			marks: questions.some(question => question.marks),
			difficulty: questions.some(question => question.difficulty)
		}
	};
}

export async function loadSampleBank(folder) {
	const indexPath = path.join(folder, 'index.html');
	if (!fs.existsSync(indexPath)) throw new Error('Sample bank index.html was not found.');
	const sets = parseSampleBankIndex(fs.readFileSync(indexPath, 'utf8'), { sourceFile: 'index.html' });
	const parsed = [];
	const missing = [];
	for (const set of sets) {
		const filePath = path.join(folder, set.filename);
		if (!fs.existsSync(filePath)) {
			missing.push(set.filename);
			continue;
		}
		parsed.push(parseSampleSetHtml(fs.readFileSync(filePath, 'utf8'), {
			setId: set.setId,
			sourceFile: set.filename
		}));
	}
	return { sets, parsed, missing };
}

async function resolveAcademic(prisma, sample, { courseId, volumeId, moduleId, volumeMap = {}, moduleMap = {} } = {}) {
	const errors = [];
	const warnings = [];
	let resolvedCourseId = courseId || null;
	let resolvedVolumeId = volumeId || volumeMap[sample.volume] || null;
	let resolvedModuleId = moduleId || moduleMap[`${sample.volume}|${sample.learningModule}`] || null;
	if (!resolvedVolumeId && sample.volume) {
		const candidates = await prisma.volume.findMany({
			where: {
				name: { equals: sample.volume, mode: 'insensitive' },
				...(resolvedCourseId ? { courseLinks: { some: { courseId: resolvedCourseId } } } : {})
			},
			select: { id: true, name: true, courseLinks: { select: { courseId: true } } }
		});
		if (candidates.length === 1 && candidates[0].courseLinks.length === 1) {
			resolvedVolumeId = candidates[0].id;
			resolvedCourseId = candidates[0].courseLinks[0].courseId;
		} else {
			errors.push({ code: 'VOLUME_MAPPING_REQUIRED', message: `Volume "${sample.volume}" requires administrator mapping.`, candidates });
		}
	}
	if (resolvedModuleId) {
		const mapped = await prisma.module.findUnique({ where: { id: resolvedModuleId }, select: { id: true, name: true, volumeId: true, courseId: true } });
		if (mapped) {
			resolvedVolumeId = mapped.volumeId;
			resolvedCourseId = mapped.courseId;
			warnings.push({ code: 'MODULE_MAPPING_APPLIED', message: `Source module "${sample.volume}|${sample.learningModule}" maps to Milven module "${mapped.name}" (${mapped.id}).` });
		} else {
			errors.push({ code: 'MODULE_MAPPING_NOT_FOUND', message: `Mapped module ${resolvedModuleId} was not found.` });
		}
	} else if (!resolvedModuleId && sample.learningModule && resolvedVolumeId) {
		const candidates = await prisma.module.findMany({
			where: { volumeId: resolvedVolumeId, name: { equals: sample.learningModule, mode: 'insensitive' } },
			select: { id: true, name: true }
		});
		if (candidates.length === 1) resolvedModuleId = candidates[0].id;
		else errors.push({ code: 'MODULE_MAPPING_REQUIRED', message: `Learning Module "${sample.learningModule}" requires administrator mapping.`, candidates });
	}
	if (sample.totalMarks && sample.questions.length && sample.totalMarks % sample.questions.length !== 0) {
		warnings.push({ code: 'MARKS_NOT_EQUALLY_DIVISIBLE', message: `Set total ${sample.totalMarks} does not divide evenly across ${sample.questions.length} questions.` });
	}
	return { courseId: resolvedCourseId, volumeId: resolvedVolumeId, moduleId: resolvedModuleId, errors, warnings };
}

export async function transformSampleSetToQuestion(prisma, sample, {
	courseId,
	volumeId,
	moduleId,
	volumeMap = {},
	moduleMap = {},
	primaryTopicId,
	topicMap = {},
	conceptMap = {},
	difficulty = 'HARD',
	deriveEqualMarks = true
} = {}) {
	const academic = await resolveAcademic(prisma, sample, { courseId, volumeId, moduleId, volumeMap, moduleMap });
	const warnings = [...academic.warnings];
	if (!primaryTopicId && !Object.keys(topicMap).length) academic.errors.push({ code: 'TOPIC_MAPPING_REQUIRED', message: 'A primary Milven Topic ID or explicit topicMap is required for this sample set.' });
	let availableTopics = [];
	if (academic.moduleId) {
		availableTopics = await prisma.topic.findMany({
			where: { moduleId: academic.moduleId },
			select: { id: true, name: true },
			orderBy: [{ order: 'asc' }, { name: 'asc' }]
		});
	}
	const exactTopics = new Map(availableTopics.map(topic => [topic.name.toLowerCase(), topic.id]));
	const sourceTopicMap = new Map();
	for (const question of sample.questions) {
		const sourceName = String(question.topicName || '').trim();
		if (!sourceName) continue;
		const mappedId = topicMap[`${academic.moduleId}|${sourceName}`] || topicMap[sourceName] || exactTopics.get(sourceName.toLowerCase()) || null;
		if (mappedId) sourceTopicMap.set(sourceName, mappedId);
		else if (primaryTopicId) {
			sourceTopicMap.set(sourceName, primaryTopicId);
			warnings.push({ code: 'TOPIC_FALLBACK_PRIMARY', message: `Source topic "${sourceName}" is using the explicitly supplied primary topic fallback. Review this mapping.`, sourceTopic: sourceName });
		} else {
			const candidates = availableTopics.filter(topic => topic.name.toLowerCase().includes(sourceName.toLowerCase()) || sourceName.toLowerCase().includes(topic.name.toLowerCase())).slice(0, 5);
			academic.errors.push({ code: 'TOPIC_MAPPING_REQUIRED', message: `Source topic "${sourceName}" requires explicit mapping to a Milven topic.`, sourceTopic: sourceName, candidates });
		}
	}
	if (!sample.questions.some(question => question.difficulty)) {
		warnings.push({ code: 'DIFFICULTY_PROVISIONAL', message: `Source set has no difficulty field; dry-run uses ${difficulty} provisionally.` });
	}
	const equalMarks = deriveEqualMarks && sample.totalMarks && sample.questions.length && sample.totalMarks % sample.questions.length === 0
		? sample.totalMarks / sample.questions.length
		: null;
	if (!equalMarks) warnings.push({ code: 'PER_QUESTION_MARKS_REQUIRED', message: 'Source set does not provide per-question marks; administrator mapping is required.' });
	const subQuestions = sample.questions.map((question, index) => {
		const missingRequired = [];
		const missingOptional = [];
		const mappedTopicId = sourceTopicMap.get(question.topicName) || exactTopics.get(String(question.topicName || '').toLowerCase()) || primaryTopicId || null;
		const mappedConceptIds = Array.isArray(question.conceptIds) ? question.conceptIds.filter(Boolean) : [];
		if (!question.stem) missingRequired.push('stem');
		if (!question.options.length) missingRequired.push('options');
		if (!question.correctAnswer) missingRequired.push('correctAnswer');
		if (question.options.filter(option => option.isCorrect).length !== 1) missingRequired.push('singleCorrectOption');
		if (!question.workedSolution) missingRequired.push('workedSolution');
		if (!question.correctAnswerExplanation) missingRequired.push('correctAnswerExplanation');
		if (!question.incorrectOptionsExplanation) missingRequired.push('incorrectOptionsExplanation');
		if (!question.los) missingOptional.push('los');
		if (!question.traceSection) missingOptional.push('traceSection');
		if (!question.tracePage) missingOptional.push('tracePage');
		if (!question.keyFormulas) missingOptional.push('keyFormulas');
		if (!question.commonMistake) missingOptional.push('commonMistake');
		if (!question.conceptsTested) missingOptional.push('conceptsTested');
		const sourceFieldPresence = {
			stem: Boolean(question.stem),
			options: question.options.length > 0,
			correctAnswer: Boolean(question.correctAnswer),
			workedSolution: Boolean(question.workedSolution),
			correctAnswerExplanation: Boolean(question.correctAnswerExplanation),
			incorrectOptionsExplanation: Boolean(question.incorrectOptionsExplanation),
			commonMistake: Boolean(question.commonMistake),
			conceptsTested: Boolean(question.conceptsTested),
			los: Boolean(question.los),
			traceSection: Boolean(question.traceSection),
			tracePage: Boolean(question.tracePage),
			keyFormulas: Boolean(question.keyFormulas)
		};
		const sourceFields = Object.entries(sourceFieldPresence).filter(([, present]) => present).map(([field]) => field);
		const mappedFields = [...sourceFields];
		const child = {
			externalQuestionId: question.externalQuestionId || `${sample.setId}-Q${String(question.number || index + 1).padStart(3, '0')}`,
			stem: question.stem,
			difficulty,
			marks: question.marks || equalMarks || null,
			primaryTopicId: mappedTopicId,
			additionalTopicIds: [],
			conceptIds: mappedConceptIds.length ? mappedConceptIds : (Array.isArray(conceptMap[question.conceptsTested]) ? conceptMap[question.conceptsTested] : []),
			sourceSetId: sample.setId,
			los: question.los,
			traceSection: question.traceSection,
			tracePage: question.tracePage,
			keyFormulas: question.keyFormulas,
			workedSolution: question.workedSolution || null,
			explanation: question.explanation || null,
			correctAnswerExplanation: question.correctAnswerExplanation || null,
			incorrectOptionsExplanation: question.incorrectOptionsExplanation || null,
			commonMistake: question.commonMistake || null,
			conceptsTested: question.conceptsTested || null,
			answerVerificationStatus: 'SOURCE_PROVIDED',
			options: question.options.map((option, optionIndex) => ({
				label: option.label || String.fromCharCode(65 + optionIndex),
				text: option.text,
				isCorrect: option.isCorrect,
				rationale: null
			})),
			reviewMetadata: {
				sourceSetId: sample.setId,
				sourceQuestionId: question.externalQuestionId,
				sourceTopicName: question.topicName,
				missingSourceFields: [...missingRequired, ...missingOptional],
				missingRequiredSourceFields: missingRequired,
				missingOptionalSourceFields: missingOptional,
				fieldMapping: {
					sourceFields,
					mappedFields,
					unmappedFields: sourceFields.filter(field => !mappedFields.includes(field)),
					missingRequiredSourceFields: missingRequired,
					missingOptionalSourceFields: missingOptional
				}
			}
		};
		return child;
	});
	const childFieldMappings = subQuestions.map(question => question.reviewMetadata.fieldMapping);
	const payload = {
		schemaVersion: 'sample-bank-dry-run',
		externalQuestionId: sample.setId,
		questionType: 'VIGNETTE_MCQ',
		courseId: academic.courseId,
		volumeId: academic.volumeId,
		moduleId: academic.moduleId,
		primaryTopicId: primaryTopicId || sourceTopicMap.values().next().value || null,
		difficulty,
		marks: sample.totalMarks || subQuestions.reduce((sum, question) => sum + (question.marks || 0), 0),
		stem: sample.caseStudyTitle || sample.setId,
		caseStudyTitle: sample.caseStudyTitle || null,
		sourceSetId: sample.setId,
		vignetteText: sample.vignette,
		subQuestions,
		generation: {
			source: 'SAMPLE_BANK_DRY_RUN',
			client: 'milven-sample-bank',
			generatedAt: null
		},
		reviewMetadata: {
			sourceSetId: sample.setId,
			sourceFile: sample.sourceFile,
			sourceVolume: sample.volume,
			sourceLearningModule: sample.learningModuleFull || sample.learningModule,
			sourceTotalMarks: sample.totalMarks,
			derivedEqualMarks: equalMarks,
			provisionalDifficulty: difficulty,
			fieldMapping: {
				caseStudyTitle: Boolean(sample.caseStudyTitle),
				sourceSetId: Boolean(sample.setId),
				vignette: Boolean(sample.vignette),
				children: childFieldMappings
			},
			warnings
		}
	};
	return { academic: { ...academic, warnings }, payload };
}

export async function dryRunSampleImport(prisma, sample, mapping = {}) {
	const { academic, payload } = await transformSampleSetToQuestion(prisma, sample, mapping);
	if (academic.errors.length) {
		return { ok: false, setId: sample.setId, mappingErrors: academic.errors, warnings: academic.warnings, parsed: sample, mappedPayload: payload };
	}
	let normalized;
	try {
		normalized = normalizeQuestionPayload(payload);
	} catch (error) {
		return { ok: false, setId: sample.setId, schemaErrors: error.issues || error.errors || [], parsed: sample };
	}
	const validation = await validateQuestionPayload(prisma, normalized);
	const duplicates = await checkQuestionDuplicates(prisma, normalized);
	return {
		ok: validation.ok,
		setId: sample.setId,
		parsed: sample,
		mappedPayload: normalized,
		validation,
		duplicates,
		fieldMapping: normalized.reviewMetadata?.fieldMapping || null,
		warnings: academic.warnings,
		automaticValidationOnly: true,
		humanReviewRequired: true
	};
}
