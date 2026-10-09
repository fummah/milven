/**
 * Pure field-mapping helpers for the shared AI question editor.
 * Kept framework-free so the mapping can be unit-tested in Node.
 *
 * Field names MUST match the question schema / backend accept payload:
 *   stem, options[{ text, isCorrect }], explanation, workedSolution, keyFormulas,
 *   los, difficulty, traceSection, tracePage.
 */

export function questionToFormValues(question) {
	const opts = Array.isArray(question?.options) ? question.options : [];
	let correct = opts.findIndex(o => o?.isCorrect === true);
	if (correct < 0) correct = 0;
	return {
		stem: question?.stem || '',
		optionA: opts[0]?.text || '',
		optionB: opts[1]?.text || '',
		optionC: opts[2]?.text || '',
		correct,
		explanation: question?.explanation || '',
		workedSolution: question?.workedSolution || '',
		keyFormulas: question?.keyFormulas || '',
		los: question?.los || '',
		difficulty: question?.difficulty || 'MEDIUM',
		traceSection: question?.traceSection || '',
		tracePage: question?.tracePage || '',
	};
}

export function formValuesToQuestion(question, values) {
	const texts = [values.optionA, values.optionB, values.optionC];
	const options = texts.map((t, i) => ({ text: String(t || '').trim(), isCorrect: i === Number(values.correct) }));
	// Never let the correct answer point at an empty/removed option.
	const chosenIndex = Number(values.correct);
	if (!options[chosenIndex] || !options[chosenIndex].text) {
		const firstFilled = options.findIndex(o => o.text);
		options.forEach(o => { o.isCorrect = false; });
		options[firstFilled >= 0 ? firstFilled : 0].isCorrect = true;
	}
	return {
		...question,
		stem: values.stem,
		options,
		explanation: values.explanation,
		// Each field maps to exactly its own schema field — they never cross.
		workedSolution: values.workedSolution,
		keyFormulas: values.keyFormulas,
		los: values.los,
		difficulty: values.difficulty,
		traceSection: values.traceSection,
		tracePage: values.tracePage,
	};
}
