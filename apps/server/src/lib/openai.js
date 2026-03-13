/**
 * Shared OpenAI API key and helpers.
 * Key: OPENAI_API_KEY env or SystemSetting key "openai_api_key".
 */
export async function getOpenAIApiKey(prisma) {
	const envKey = process.env.OPENAI_API_KEY;
	if (envKey && envKey.trim()) return envKey.trim();
	const row = await prisma.systemSetting.findUnique({ where: { key: 'openai_api_key' } });
	const val = row?.value;
	return (typeof val === 'string' ? val : val?.value)?.trim() || null;
}
