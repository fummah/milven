import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
	listCourses,
	listVolumes,
	listModules,
	listTopics,
	listConcepts,
	getCurriculumContext,
	findAcademicCandidates
} from '../lib/questions/questionCurriculum.js';
import { buildQuestionBlueprint, QUESTION_BLUEPRINT } from '../lib/questions/questionBlueprint.js';
import { QUESTION_SCHEMA_VERSION, questionPayloadSchema } from '../lib/questions/questionSchema.js';
import { validateQuestionSet, getQuestionDuplicateReport, createReviewBatch, getReviewBatch, updateReviewItem, commitApprovedBatch } from '../lib/questions/questionReview.js';
import { serializeQuestionOptions } from '../lib/questions/questionPersistence.js';
import { hasScope, MCP_SCOPES } from '../lib/mcp/tokenAuth.js';

type AuthContext = {
	tokenId: string;
	userId: string;
	email?: string;
	role: string;
	scopes: string[];
	authType: string;
};

type McpContext = {
	prisma: any;
	auth: AuthContext;
	endpoint: string;
};

const READ_SCOPE = 'curriculum:read';
const QUESTION_READ_SCOPE = 'questions:read';
const VALIDATE_SCOPE = 'questions:validate';
const DRAFT_SCOPE = 'questions:draft';
const COMMIT_SCOPE = 'questions:commit';

function jsonResult(data: unknown, isError = false) {
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
		structuredContent: data as Record<string, unknown>,
		isError
	};
}

function toolError(code: string, message: string, details?: unknown) {
	return jsonResult({ ok: false, error: { code, message, ...(details ? { details } : {}) } }, true);
}

function requireScope(auth: AuthContext, scope: string) {
	if (!hasScope(auth, scope)) {
		return toolError('INSUFFICIENT_SCOPE', `This tool requires the ${scope} scope.`, { granted: auth.scopes, required: scope });
	}
	return null;
}

function paging(page?: number, limit?: number) {
	return {
		page: Math.max(1, Number(page) || 1),
		limit: Math.min(100, Math.max(1, Number(limit) || 20))
	};
}

function questionInclude() {
	return {
		options: { orderBy: { position: 'asc' as const } },
		topics: { select: { id: true, name: true, moduleId: true } },
		concepts: { select: { id: true, name: true, topicId: true } },
		children: {
			orderBy: [{ orderIndex: 'asc' as const }, { createdAt: 'asc' as const }],
			include: {
				options: { orderBy: { position: 'asc' as const } },
				topics: { select: { id: true, name: true, moduleId: true } },
				concepts: { select: { id: true, name: true, topicId: true } }
			}
		}
	};
}

function promptText(title: string, context: unknown, rules: string[]) {
	return [
		`MILVEN QUESTION TASK: ${title}`,
		'',
		'Use the Milven MCP curriculum tools and stable academic IDs. Do not invent or silently substitute academic records.',
		'Return candidate questions as strict question payloads. Call milven_validate_questions before milven_create_question_batch.',
		'',
		'CONTEXT:',
		JSON.stringify(context, null, 2),
		'',
		'RULES:',
		...rules.map(rule => `- ${rule}`),
		'',
		'Workflow: list curriculum -> get context -> generate -> validate -> check duplicates -> create draft/batch. Never call commit unless an administrator has approved the batch.'
	].join('\n');
}

export function createMilvenMcpServer({ prisma, auth, endpoint }: McpContext) {
	const server = new McpServer({
		name: 'milven-question-bank',
		version: '1.0.0'
	}, {
		capabilities: { logging: {} },
		maxToolInputElements: 10000
	});

	server.registerTool('milven_get_capabilities', {
		title: 'Get Milven MCP capabilities',
		description: 'Read-only. Returns the supported MCP schema version, tool/scope catalogue, transport endpoint and current authenticated identity.',
		inputSchema: {}
	}, async () => jsonResult({
		ok: true,
		server: 'milven-question-bank',
		version: '1.0.0',
		mcpSpecification: '2025-11-25',
		transport: 'Streamable HTTP',
		endpoint,
		schemaVersion: QUESTION_SCHEMA_VERSION,
		questionTypes: ['MCQ', 'VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE'],
		difficulties: ['EASY', 'MEDIUM', 'HARD'],
		scopes: MCP_SCOPES,
		authenticatedAs: { email: auth.email, userId: auth.userId, authType: auth.authType },
		grantedScopes: auth.scopes,
		writeWorkflow: QUESTION_BLUEPRINT.workflow,
		toolSideEffects: QUESTION_BLUEPRINT.sideEffects
	}));

	server.registerTool('milven_list_courses', {
		title: 'List CFA courses',
		description: 'Read-only. Lists Milven CFA courses with stable course IDs, levels, active state and hierarchy counts.',
		inputSchema: {}
	}, async () => {
		const denied = requireScope(auth, READ_SCOPE);
		if (denied) return denied;
		return jsonResult({ ok: true, courses: await listCourses(prisma) });
	});

	server.registerTool('milven_list_volumes', {
		title: 'List volumes',
		description: 'Read-only. Lists Milven volumes, optionally restricted to one course. Volume IDs are the authoritative IDs used by question payloads.',
		inputSchema: {
			courseId: z.string().optional().describe('Milven Course ID')
		}
	}, async ({ courseId }) => {
		const denied = requireScope(auth, READ_SCOPE);
		if (denied) return denied;
		return jsonResult({ ok: true, volumes: await listVolumes(prisma, { courseId }) });
	});

	server.registerTool('milven_list_modules', {
		title: 'List learning modules',
		description: 'Read-only. Lists Milven learning modules by course and/or volume.',
		inputSchema: {
			courseId: z.string().optional(),
			volumeId: z.string().optional()
		}
	}, async ({ courseId, volumeId }) => {
		const denied = requireScope(auth, READ_SCOPE);
		if (denied) return denied;
		return jsonResult({ ok: true, modules: await listModules(prisma, { courseId, volumeId }) });
	});

	server.registerTool('milven_list_topics', {
		title: 'List topics',
		description: 'Read-only. Lists Milven topics with LOS codes, LOS statements and command words. Topic IDs must belong to the selected module.',
		inputSchema: {
			courseId: z.string().optional(),
			volumeId: z.string().optional(),
			moduleId: z.string().optional()
		}
	}, async ({ courseId, volumeId, moduleId }) => {
		const denied = requireScope(auth, READ_SCOPE);
		if (denied) return denied;
		return jsonResult({ ok: true, topics: await listTopics(prisma, { courseId, volumeId, moduleId }) });
	});

	server.registerTool('milven_list_concepts', {
		title: 'List concepts',
		description: 'Read-only. Lists Milven concepts for one or more topics. Concept IDs must belong to a selected topic.',
		inputSchema: {
			topicId: z.string().optional(),
			topicIds: z.array(z.string()).optional(),
			moduleId: z.string().optional(),
			courseId: z.string().optional()
		}
	}, async ({ topicId, topicIds, moduleId, courseId }) => {
		const denied = requireScope(auth, READ_SCOPE);
		if (denied) return denied;
		return jsonResult({ ok: true, concepts: await listConcepts(prisma, { topicId, topicIds, moduleId, courseId }) });
	});

	server.registerTool('milven_get_curriculum_context', {
		title: 'Get curriculum context',
		description: 'Read-only. Validates the academic hierarchy and returns course, volume, module, topic/concept metadata, LOS, command words, formulas, published notes and available curriculum excerpt.',
		inputSchema: {
			courseId: z.string(),
			volumeId: z.string(),
			moduleId: z.string(),
			topicIds: z.array(z.string()).optional(),
			conceptIds: z.array(z.string()).optional(),
			includeExcerpt: z.boolean().optional().default(true)
		}
	}, async (args) => {
		const denied = requireScope(auth, READ_SCOPE);
		if (denied) return denied;
		const context = await getCurriculumContext(prisma, {
			courseId: args.courseId,
			volumeId: args.volumeId,
			moduleId: args.moduleId,
			topicIds: args.topicIds || [],
			conceptIds: args.conceptIds || [],
			includeExcerpt: args.includeExcerpt !== false
		});
		if (!context.ok && context.errors?.length) {
			const candidates = await findAcademicCandidates(prisma, { type: 'topic', name: args.topicIds?.[0] || '', parentId: args.moduleId });
			return jsonResult({ ok: false, ...context, candidates });
		}
		return jsonResult({ ok: true, ...context });
	});

	server.registerTool('milven_get_question_blueprint', {
		title: 'Get question-generation blueprint',
		description: 'Read-only. Returns the Milven question schema, CFA generation rules, difficulty rubric, item-set requirements and current academic context.',
		inputSchema: {
			courseId: z.string().optional(),
			volumeId: z.string().optional(),
			moduleId: z.string().optional(),
			topicId: z.string().optional(),
			difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
			questionType: z.enum(['MCQ', 'VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE']).optional()
		}
	}, async (args) => {
		const denied = requireScope(auth, QUESTION_READ_SCOPE);
		if (denied) return denied;
		let academicContext = null;
		if (args.courseId && args.volumeId && args.moduleId) {
			academicContext = await getCurriculumContext(prisma, {
				courseId: args.courseId,
				volumeId: args.volumeId,
				moduleId: args.moduleId,
				topicIds: args.topicId ? [args.topicId] : [],
				includeExcerpt: false
			});
		}
		return jsonResult({ ok: true, ...buildQuestionBlueprint({
			difficulty: args.difficulty,
			questionType: args.questionType,
			academicContext
		}) });
	});

	server.registerTool('milven_search_questions', {
		title: 'Search existing questions',
		description: 'Read-only. Searches the live Milven question bank by text, academic IDs, type and difficulty.',
		inputSchema: {
			q: z.string().optional(),
			courseId: z.string().optional(),
			volumeId: z.string().optional(),
			moduleId: z.string().optional(),
			topicId: z.string().optional(),
			conceptId: z.string().optional(),
			type: z.enum(['MCQ', 'VIGNETTE_MCQ', 'CONSTRUCTED_RESPONSE']).optional(),
			difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
			page: z.number().int().positive().optional(),
			limit: z.number().int().positive().max(100).optional()
		}
	}, async (args) => {
		const denied = requireScope(auth, QUESTION_READ_SCOPE);
		if (denied) return denied;
		const { page, limit } = paging(args.page, args.limit);
		const where: any = { parentId: null };
		if (args.courseId) where.courseId = args.courseId;
		if (args.volumeId) where.volumeId = args.volumeId;
		if (args.moduleId) where.moduleId = args.moduleId;
		if (args.topicId) where.OR = [{ topicId: args.topicId }, { topics: { some: { id: args.topicId } } }];
		if (args.conceptId) where.concepts = { some: { id: args.conceptId } };
		if (args.type) where.type = args.type;
		if (args.difficulty) where.difficulty = args.difficulty;
		if (args.q) {
			where.AND = [{
				OR: [
					{ stem: { contains: args.q, mode: 'insensitive' } },
					{ vignetteText: { contains: args.q, mode: 'insensitive' } },
					{ qid: { contains: args.q, mode: 'insensitive' } }
				]
			}];
		}
		const [total, questions] = await Promise.all([
			prisma.question.count({ where }),
			prisma.question.findMany({
				where,
				include: questionInclude(),
				orderBy: { createdAt: 'desc' },
				skip: (page - 1) * limit,
				take: limit
			})
		]);
		return jsonResult({ ok: true, total, page, limit, questions: questions.map(serializeQuestionOptions) });
	});

	server.registerTool('milven_get_question', {
		title: 'Get a question',
		description: 'Read-only. Returns one live question by Milven ID or external QID with ordered options and vignette children.',
		inputSchema: {
			id: z.string().optional(),
			qid: z.string().optional()
		}
	}, async ({ id, qid }) => {
		const denied = requireScope(auth, QUESTION_READ_SCOPE);
		if (denied) return denied;
		if (!id && !qid) return toolError('QUESTION_KEY_REQUIRED', 'Provide either id or qid.');
		const question = await prisma.question.findFirst({
			where: id ? { id } : { qid },
			include: questionInclude()
		});
		if (!question) return toolError('QUESTION_NOT_FOUND', 'Question not found.');
		return jsonResult({ ok: true, question: serializeQuestionOptions(question) });
	});

	server.registerTool('milven_validate_questions', {
		title: 'Validate question payloads',
		description: 'Read-only. Strictly validates one or more complete question payloads for schema, academic mapping, options, marks, HTML, Unicode, LaTeX, difficulty and internal consistency. Automatic validation is not human academic approval.',
		inputSchema: {
			questions: z.array(questionPayloadSchema).min(1).max(50)
		}
	}, async ({ questions }) => {
		const denied = requireScope(auth, VALIDATE_SCOPE);
		if (denied) return denied;
		const result = await validateQuestionSet(prisma, questions);
		return jsonResult({ ok: result.ok, ...result });
	});

	server.registerTool('milven_check_question_duplicates', {
		title: 'Check duplicate questions',
		description: 'Read-only. Checks external QIDs, normalized stems, vignettes, options and item-set child stems against the live question bank. Semantic-style similarity is a review signal, not proof.',
		inputSchema: {
			questions: z.array(questionPayloadSchema).min(1).max(50)
		}
	}, async ({ questions }) => {
		const denied = requireScope(auth, VALIDATE_SCOPE);
		if (denied) return denied;
		return jsonResult({ ok: true, ...(await getQuestionDuplicateReport(prisma, questions)) });
	});

	server.registerTool('milven_create_question_draft', {
		title: 'Create a staged question draft',
		description: 'WRITE (staged review store only). Validates one question and creates an administrator-review batch. It does not write to the live Question bank.',
		inputSchema: {
			question: questionPayloadSchema,
			idempotencyKey: z.string().min(8).optional(),
			sourceClient: z.string().optional().default('mcp-client'),
			sourceProvider: z.string().optional(),
			externalRequestId: z.string().optional()
		}
	}, async (args) => {
		const denied = requireScope(auth, DRAFT_SCOPE);
		if (denied) return denied;
		const result = await createReviewBatch(prisma, {
			idempotencyKey: args.idempotencyKey || `draft:${args.question.externalQuestionId}`,
			externalRequestId: args.externalRequestId,
			sourceClient: args.sourceClient || 'mcp-client',
			sourceProvider: args.sourceProvider,
			academicScope: {
				courseId: args.question.courseId,
				volumeId: args.question.volumeId,
				moduleId: args.question.moduleId,
				topicIds: [args.question.primaryTopicId, ...(args.question.additionalTopicIds || [])]
			},
			questions: [args.question]
		}, { actorId: auth.userId, tokenId: auth.tokenId });
		return result.ok ? jsonResult({ ok: true, ...result }) : jsonResult(result, true);
	});

	server.registerTool('milven_create_question_batch', {
		title: 'Create a staged question batch',
		description: 'WRITE (staged review store only). Validates up to 50 questions and creates an idempotent administrator-review batch. It does not write to the live Question bank.',
		inputSchema: {
			idempotencyKey: z.string().min(8),
			externalRequestId: z.string().optional(),
			sourceClient: z.string().min(1),
			sourceProvider: z.string().optional(),
			academicScope: z.object({
				courseId: z.string().optional(),
				volumeId: z.string().optional(),
				moduleId: z.string().optional(),
				topicIds: z.array(z.string()).optional()
			}).optional(),
			questions: z.array(questionPayloadSchema).min(1).max(50)
		}
	}, async (args) => {
		const denied = requireScope(auth, DRAFT_SCOPE);
		if (denied) return denied;
		const result = await createReviewBatch(prisma, args, { actorId: auth.userId, tokenId: auth.tokenId });
		return result.ok ? jsonResult({ ok: true, ...result }) : jsonResult(result, true);
	});

	server.registerTool('milven_get_import_status', {
		title: 'Get import batch status',
		description: 'Read-only. Returns validation, duplicate, approval and commit status for a staged batch.',
		inputSchema: { batchId: z.string() }
	}, async ({ batchId }) => {
		const denied = requireScope(auth, DRAFT_SCOPE);
		if (denied) return denied;
		const batch = await getReviewBatch(prisma, batchId);
		if (!batch) return toolError('BATCH_NOT_FOUND', 'Import batch not found.');
		return jsonResult({ ok: true, batch });
	});

	server.registerTool('milven_get_question_preview', {
		title: 'Preview staged questions',
		description: 'Read-only. Returns the full staged payload, vignette, children, options, answers, worked solutions, academic mappings, warnings and duplicate signals.',
		inputSchema: { batchId: z.string() }
	}, async ({ batchId }) => {
		const denied = requireScope(auth, DRAFT_SCOPE);
		if (denied) return denied;
		const batch = await getReviewBatch(prisma, batchId);
		if (!batch) return toolError('BATCH_NOT_FOUND', 'Import batch not found.');
		return jsonResult({
			ok: true,
			batchId: batch.id,
			status: batch.status,
			commitStatus: batch.commitStatus,
			validationSummary: batch.validationSummary,
			duplicateSummary: batch.duplicateSummary,
			items: batch.items.map(item => ({
				id: item.id,
				externalQuestionId: item.externalQuestionId,
				questionType: item.questionType,
				status: item.status,
				payload: item.payload,
				validation: item.validation,
				duplicates: item.duplicates
			}))
		});
	});

	server.registerTool('milven_update_question_draft', {
		title: 'Update a staged question draft',
		description: 'WRITE (staged review store only). Replaces one staged item payload and reruns validation. Approval and commit status are reset.',
		inputSchema: {
			batchId: z.string(),
			itemId: z.string(),
			question: questionPayloadSchema
		}
	}, async (args) => {
		const denied = requireScope(auth, DRAFT_SCOPE);
		if (denied) return denied;
		const result = await updateReviewItem(prisma, args.batchId, args.itemId, args.question, {
			actorId: auth.userId,
			tokenId: auth.tokenId
		});
		return result.ok ? jsonResult({ ok: true, ...result }) : jsonResult(result, true);
	});

	server.registerTool('milven_commit_approved_questions', {
		title: 'Commit approved questions',
		description: 'WRITE (live question bank). Requires questions:commit and an administrator-approved batch. Commits each item-set transactionally, is idempotent for committed items, and returns persisted Milven Question IDs.',
		inputSchema: { batchId: z.string() },
		annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false }
	}, async ({ batchId }) => {
		const denied = requireScope(auth, COMMIT_SCOPE);
		if (denied) return denied;
		const result = await commitApprovedBatch(prisma, batchId, { actorId: auth.userId, tokenId: auth.tokenId });
		return result.ok || result.partial ? jsonResult(result, !result.ok) : jsonResult(result, true);
	});

	server.registerResource('curriculum-hierarchy', 'milven://curriculum/hierarchy', {
		title: 'Milven curriculum hierarchy',
		description: 'Read-only course, volume, module and topic discovery guidance.',
		mimeType: 'application/json'
	}, async () => {
		if (!hasScope(auth, READ_SCOPE)) throw new Error('Missing curriculum:read scope.');
		return {
			contents: [{
				uri: 'milven://curriculum/hierarchy',
				mimeType: 'application/json',
				text: JSON.stringify({ hierarchy: 'Course -> Volume -> Module -> Topic -> Concept', tools: ['milven_list_courses', 'milven_list_volumes', 'milven_list_modules', 'milven_list_topics', 'milven_list_concepts', 'milven_get_curriculum_context'] }, null, 2)
			}]
		};
	});

	server.registerResource('question-schema', 'milven://schema/question-v1', {
		title: 'Milven question schema',
		description: 'Versioned strict question payload schema and required fields.',
		mimeType: 'application/json'
	}, async () => {
		if (!hasScope(auth, QUESTION_READ_SCOPE)) throw new Error('Missing questions:read scope.');
		return {
			contents: [{
				uri: 'milven://schema/question-v1',
				mimeType: 'application/json',
				text: JSON.stringify({
					version: QUESTION_SCHEMA_VERSION,
					requiredFields: QUESTION_BLUEPRINT.payloadShape,
					rules: QUESTION_BLUEPRINT.rules
				}, null, 2)
			}]
		};
	});

	server.registerResource('question-blueprint', 'milven://blueprint/questions', {
		title: 'CFA question-generation blueprint',
		description: 'Question types, item-set structure, worked-solution requirements and write workflow.',
		mimeType: 'application/json'
	}, async () => {
		if (!hasScope(auth, QUESTION_READ_SCOPE)) throw new Error('Missing questions:read scope.');
		return { contents: [{ uri: 'milven://blueprint/questions', mimeType: 'application/json', text: JSON.stringify(QUESTION_BLUEPRINT, null, 2) }] };
	});

	server.registerResource('difficulty-rubric', 'milven://blueprint/difficulty', {
		title: 'CFA difficulty rubric',
		description: 'Authoritative EASY, MEDIUM and HARD criteria including HARD prohibitions.',
		mimeType: 'application/json'
	}, async () => {
		if (!hasScope(auth, QUESTION_READ_SCOPE)) throw new Error('Missing questions:read scope.');
		return { contents: [{ uri: 'milven://blueprint/difficulty', mimeType: 'application/json', text: JSON.stringify(QUESTION_BLUEPRINT.difficultyRubrics, null, 2) }] };
	});

	server.registerResource('validation-rules', 'milven://validation/rules', {
		title: 'Question import validation rules',
		description: 'Schema, academic, HTML, Unicode, option, marks, difficulty and duplicate validation rules.',
		mimeType: 'application/json'
	}, async () => {
		if (!hasScope(auth, VALIDATE_SCOPE)) throw new Error('Missing questions:validate scope.');
		return {
			contents: [{
				uri: 'milven://validation/rules',
				mimeType: 'application/json',
				text: JSON.stringify({ rules: QUESTION_BLUEPRINT.rules, workflow: QUESTION_BLUEPRINT.workflow, automaticValidationOnly: true, humanReviewRequired: true }, null, 2)
			}]
		};
	});

	const promptConfigs = [
		{
			name: 'generate-standalone-cfa-mcq',
			title: 'Generate standalone CFA MCQs',
			description: 'Generate one or more standalone three-option CFA MCQs from validated Milven curriculum context.',
			intro: 'Generate standalone CFA MCQs with exactly three options A/B/C, one correct answer, distractors, full worked solutions and LOS/trace metadata.'
		},
		{
			name: 'generate-level-2-vignette-item-set',
			title: 'Generate a Level II vignette item set',
			description: 'Generate a CFA Level II case study with independently complete child MCQs.',
			intro: 'Generate a Level II vignette item set with a substantial case study and four child MCQs. Every child needs its own difficulty, marks, LOS, trace references, formulas, worked solution and concept mapping.'
		},
		{
			name: 'generate-level-3-vignette-item-set',
			title: 'Generate a Level III vignette item set',
			description: 'Generate a CFA Level III constructed-response or vignette item set with professional judgement.',
			intro: 'Generate a Level III item set focused on professional judgement, multi-step analysis and integrated curriculum concepts. Preserve every child field independently.'
		},
		{
			name: 'generate-constructed-response',
			title: 'Generate a constructed-response question',
			description: 'Generate a CFA constructed-response question with mark allocation, expected output and worked steps.',
			intro: 'Generate a constructed-response question with detailed mark allocation, expected model answer, ordered calculation steps and full academic mapping.'
		},
		{
			name: 'validate-existing-question',
			title: 'Validate an existing question',
			description: 'Inspect and validate an existing or proposed question without modifying the database.',
			intro: 'Validate the supplied full question payload. Distinguish automatic validation warnings from human academic review.'
		},
		{
			name: 'improve-distractor-quality',
			title: 'Improve distractor quality',
			description: 'Strengthen distractors while preserving the correct answer and curriculum mapping.',
			intro: 'Improve distractors using realistic candidate mistakes. Do not change the correct answer silently; revalidate the completed question.'
		},
		{
			name: 'verify-numerical-worked-solution',
			title: 'Verify a numerical worked solution',
			description: 'Recompute and align a numerical answer with the marked option and worked solution.',
			intro: 'Recompute the numerical answer independently, verify units/rounding, and flag any mismatch between the marked answer, options and worked solution.'
		},
		{
			name: 'prepare-milven-import',
			title: 'Prepare questions for Milven import',
			description: 'Convert completed questions into the strict Milven payload and validate before staging.',
			intro: 'Prepare the completed output as strict Milven question payloads. Validate, check duplicates, then create a staged batch. Do not commit without administrator approval.'
		}
	];

	for (const config of promptConfigs) {
		server.registerPrompt(config.name, {
			title: config.title,
			description: config.description,
			argsSchema: {
				courseId: z.string().describe('Milven Course ID'),
				volumeId: z.string().describe('Milven Volume ID'),
				moduleId: z.string().describe('Milven Module ID'),
				topicId: z.string().describe('Milven primary Topic ID'),
				difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
				count: z.coerce.number().int().positive().max(50).optional(),
				question: z.string().optional().describe('Optional existing question JSON or text to validate/improve')
			}
		}, async (args) => {
			const context = await getCurriculumContext(prisma, {
				courseId: args.courseId,
				volumeId: args.volumeId,
				moduleId: args.moduleId,
				topicIds: [args.topicId],
				includeExcerpt: true
			});
			return {
				messages: [{
					role: 'user',
					content: {
						type: 'text',
						text: promptText(config.title, {
							intent: config.intro,
							request: args,
							curriculum: context,
							schemaVersion: QUESTION_SCHEMA_VERSION
						}, QUESTION_BLUEPRINT.rules)
					}
				}]
			};
		});
	}

	return server;
}
