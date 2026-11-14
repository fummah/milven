import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { checkQuestionDuplicates } from './questionDuplicates.js';
import { normalizeQuestionPayload } from './questionSchema.js';
import { validateQuestionPayload } from './questionValidation.js';
import { validateAcademicMapping } from './questionCurriculum.js';

function clean(value) {
	return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function localField($, node, label) {
	const pattern = new RegExp(`${label}\\s*[:\\-]\\s*`, 'i');
	let value = null;
	$(node).find('*').filter((_, element) => $(element).children().length === 0).each((_, element) => {
		if (value) return;
		const text = clean($(element).text());
		if (pattern.test(text)) value = text.replace(pattern, '').trim();
	});
	return value;
}

function fieldFromText($, label) {
	const pattern = new RegExp(`${label}\\s*[:\\-]\\s*`, 'i');
	const nodes = $('body *').filter((_, element) => $(element).children().length === 0);
	let value = '';
	nodes.each((_, element) => {
		if (value) return;
		const text = clean($(element).text());
		if (pattern.test(text)) value = text.replace(pattern, '').trim();
	});
	return value || null;
}

function sectionAfterHeading($, headingPattern) {
	let value = '';
	$('body *').each((_, element) => {
		if (value) return;
		const node = $(element);
		if (!/^H[1-6]$/.test(element.tagName || '')) return;
		if (!headingPattern.test(clean(node.text()))) return;
		const chunks = [];
		let next = node.next();
		while (next.length && !/^H[1-6]$/.test(next[0].tagName || '')) {
			const text = clean(next.text());
			if (text) chunks.push(text);
			next = next.next();
		}
		value = chunks.join('\n').trim();
	});
	return value || null;
}

function answerLetter(value) {
	const match = String(value || '').match(/\b([A-F])\b/i);
	return match ? match[1].toUpperCase() : null;
}

function parseOptionsFromNode($, node) {
	const options = [];
	const direct = $(node).find('.option, .answer-option, [data-option]');
	if (direct.length) {
		direct.each((_, optionNode) => {
			const option = $(optionNode);
			const label = String(option.attr('data-label') || option.find('.label, .option-label').text() || option.text()).match(/\b([A-F])\b/)?.[1]?.toUpperCase();
			const text = clean(option.find('.text, .option-text').text() || option.text()).replace(/^[A-F][).:\-]\s*/i, '');
			const isCorrect = option.hasClass('correct') || option.attr('data-correct') === 'true' || /correct/i.test(option.attr('class') || '');
			if (text) options.push({ label: label || String.fromCharCode(65 + options.length), text, isCorrect });
		});
		return options;
	}
	$(node).find('li').each((_, li) => {
		const text = clean($(li).text());
		const match = text.match(/^([A-F])[).:\-]\s*(.+)$/i);
		if (!match) return;
		options.push({ label: match[1].toUpperCase(), text: match[2].trim(), isCorrect: false });
	});
	return options;
}

function questionNodes($) {
	const explicit = $('[data-question], .question, .mcq-question, .item');
	if (explicit.length) return explicit.toArray();
	const headings = $('h2, h3, h4').filter((_, element) => /^question\s+\d+/i.test(clean($(element).text()))).toArray();
	return headings.map(heading => $(heading).parent().get(0)).filter(Boolean);
}

export function parseSampleBankIndex(html, { sourceFile = 'index.html' } = {}) {
	const $ = cheerio.load(html);
	const sets = [];
	$('a[href]').each((_, element) => {
		const href = $(element).attr('href');
		const match = String(href || '').match(/SET-(\d{3})\.html/i);
		if (!match) return;
		sets.push({
			setId: `SET-${match[1]}`,
			filename: path.basename(href),
			title: clean($(element).text()) || `SET-${match[1]}`,
			sourceFile
		});
	});
	return [...new Map(sets.map(set => [set.setId, set])).values()].sort((a, b) => a.setId.localeCompare(b.setId));
}

export function parseSampleSetHtml(html, { setId = null, sourceFile = null } = {}) {
	const $ = cheerio.load(html);
	const derivedSetId = setId || clean($('[data-set-id]').first().attr('data-set-id')) || clean($('title').text()).match(/SET-\d{3}/i)?.[0] || null;
	const volume = fieldFromText($, 'Volume');
	const learningModule = fieldFromText($, 'Learning Module');
	const caseStudyTitle = fieldFromText($, 'Case Study') || clean($('h1').first().text()) || null;
	const vignette = $('.vignette, #vignette, [data-vignette]').first().text()
		|| sectionAfterHeading($, /case study|vignette/i)
		|| null;
	const questions = [];
	for (const node of questionNodes($)) {
		const wrapper = $(node);
		const rawQuestion = clean(wrapper.find('.stem, .question-stem, .question-text').first().text() || wrapper.clone().children('h2,h3,h4,p').first().text() || wrapper.text());
		const number = rawQuestion.match(/^question\s+(\d+)/i)?.[1] || String(questions.length + 1);
		const options = parseOptionsFromNode($, node);
		const correctAnswer = answerLetter(localField($, node, 'Correct Answer') || localField($, node, 'Answer') || fieldFromText($, 'Correct Answer') || fieldFromText($, 'Answer') || wrapper.find('.correct-answer, [data-correct-answer]').first().text());
		if (correctAnswer && options.length) {
			for (const option of options) option.isCorrect = option.label === correctAnswer;
		}
		questions.push({
			number: Number(number),
			stem: rawQuestion.replace(/^question\s+\d+\s*[:.\-]?\s*/i, '').trim(),
			options,
			correctAnswer,
			workedSolution: clean(wrapper.find('.worked-solution, .solution').first().text()) || sectionAfterHeading($, /worked solution/i) || null,
			explanation: clean(wrapper.find('.explanation').first().text()) || null,
			commonMistakes: clean(wrapper.find('.common-mistakes').first().text()) || sectionAfterHeading($, /common mistakes?/i),
			los: localField($, node, 'LOS') || fieldFromText($, 'LOS') || wrapper.find('[data-los]').first().attr('data-los') || null,
			traceSection: localField($, node, 'Trace Section') || localField($, node, 'Section') || fieldFromText($, 'Section') || fieldFromText($, 'Trace Section'),
			tracePage: localField($, node, 'Trace Page') || localField($, node, 'Page') || fieldFromText($, 'Page') || fieldFromText($, 'Trace Page'),
			conceptsTested: localField($, node, 'Concepts Tested') || localField($, node, 'Concept') || fieldFromText($, 'Concepts Tested') || fieldFromText($, 'Concept'),
			keyFormulas: localField($, node, 'Key Formulas?') || localField($, node, 'Formulas?') || fieldFromText($, 'Key Formulas?') || fieldFromText($, 'Formulas?'),
			marks: Number(localField($, node, 'Marks') || fieldFromText($, 'Marks') || 3)
		});
	}
	const totalMarks = questions.reduce((sum, question) => sum + (Number(question.marks) || 0), 0);
	return {
		setId: derivedSetId,
		sourceFile,
		volume,
		learningModule,
		caseStudyTitle,
		vignette: clean(vignette),
		questions,
		totalMarks: Number(fieldFromText($, 'Total Marks') || totalMarks),
		rawFieldAvailability: {
			vignette: Boolean(vignette),
			options: questions.some(question => question.options.length > 0),
			correctAnswers: questions.some(question => question.correctAnswer),
			workedSolutions: questions.some(question => question.workedSolution),
			los: questions.some(question => question.los),
			trace: questions.some(question => question.traceSection || question.tracePage),
			concepts: questions.some(question => question.conceptsTested),
			formulas: questions.some(question => question.keyFormulas)
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

async function resolveAcademic(prisma, sample, { courseId, volumeId, moduleId } = {}) {
	const errors = [];
	let resolvedCourseId = courseId || null;
	let resolvedVolumeId = volumeId || null;
	let resolvedModuleId = moduleId || null;
	if (!resolvedCourseId && sample.volume) {
		const links = await prisma.volume.findMany({
			where: { name: { equals: sample.volume, mode: 'insensitive' } },
			select: { id: true, name: true, courseLinks: { select: { courseId: true } } }
		});
		if (links.length === 1 && links[0].courseLinks.length === 1) {
			resolvedVolumeId = links[0].id;
			resolvedCourseId = links[0].courseLinks[0].courseId;
		} else {
			errors.push({ code: 'VOLUME_MAPPING_REQUIRED', message: `Volume "${sample.volume}" requires administrator mapping.`, candidates: links });
		}
	}
	if (!resolvedModuleId && sample.learningModule && resolvedVolumeId) {
		const modules = await prisma.module.findMany({
			where: { volumeId: resolvedVolumeId, name: { equals: sample.learningModule, mode: 'insensitive' } },
			select: { id: true, name: true }
		});
		if (modules.length === 1) resolvedModuleId = modules[0].id;
		else errors.push({ code: 'MODULE_MAPPING_REQUIRED', message: `Learning Module "${sample.learningModule}" requires administrator mapping.`, candidates: modules });
	}
	return { courseId: resolvedCourseId, volumeId: resolvedVolumeId, moduleId: resolvedModuleId, errors };
}

export async function transformSampleSetToQuestion(prisma, sample, { courseId, volumeId, moduleId, primaryTopicId } = {}) {
	const academic = await resolveAcademic(prisma, sample, { courseId, volumeId, moduleId });
	if (!primaryTopicId) {
		academic.errors.push({ code: 'TOPIC_MAPPING_REQUIRED', message: 'A primary Milven Topic ID is required for this sample set.' });
	}
	const questions = sample.questions.map((question, index) => ({
		externalQuestionId: `${sample.setId}-Q${String(question.number || index + 1).padStart(3, '0')}`,
		stem: question.stem,
		difficulty: 'HARD',
		marks: question.marks,
		primaryTopicId,
		additionalTopicIds: [],
		conceptIds: [],
		los: question.los,
		traceSection: question.traceSection,
		tracePage: question.tracePage,
		keyFormulas: question.keyFormulas,
		workedSolution: question.workedSolution,
		explanation: question.explanation,
		options: question.options.map((option, optionIndex) => ({
			label: option.label || String.fromCharCode(65 + optionIndex),
			text: option.text,
			isCorrect: option.isCorrect,
			rationale: null
		})),
		reviewMetadata: {
			sampleBank: sample.sourceFile,
			commonMistakes: question.commonMistakes,
			conceptsTested: question.conceptsTested
		}
	}));
	const payload = {
		schemaVersion: 'sample-bank-dry-run',
		externalQuestionId: sample.setId,
		questionType: 'VIGNETTE_MCQ',
		courseId: academic.courseId,
		volumeId: academic.volumeId,
		moduleId: academic.moduleId,
		primaryTopicId,
		difficulty: 'HARD',
		marks: questions.reduce((sum, question) => sum + question.marks, 0),
		stem: sample.caseStudyTitle || sample.setId,
		vignetteText: sample.vignette,
		subQuestions: questions,
		generation: {
			source: 'SAMPLE_BANK_IMPORT',
			client: 'milven-sample-bank',
			generatedAt: null
		}
	};
	return { academic, payload };
}

export async function dryRunSampleImport(prisma, sample, mapping = {}) {
	const { academic, payload } = await transformSampleSetToQuestion(prisma, sample, mapping);
	if (academic.errors.length) {
		return { ok: false, setId: sample.setId, mappingErrors: academic.errors, parsed: sample, mappedPayload: payload };
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
		automaticValidationOnly: true,
		humanReviewRequired: true
	};
}
