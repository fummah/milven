import { Card, Form, Input, Button, Select, message } from 'antd';
import { api } from '../../lib/api';

export function AdminQuestions() {
	const [form] = Form.useForm();
	const submit = async (values) => {
		try {
			await api.post('/api/cms/questions', {
				stem: values.stem,
				type: values.type,
				level: values.level,
				difficulty: values.difficulty,
				topicId: values.topicId || 'topic-placeholder',
				vignetteText: values.vignetteText,
				options: values.type !== 'CONSTRUCTED_RESPONSE' ? [
					{ text: values.optionA, isCorrect: values.correct === 'A' },
					{ text: values.optionB, isCorrect: values.correct === 'B' },
					{ text: values.optionC, isCorrect: values.correct === 'C' },
					{ text: values.optionD, isCorrect: values.correct === 'D' }
				] : []
			});
			message.success('Question created');
			form.resetFields();
		} catch {
			message.error('Failed (admin only)');
		}
	};
	return (
		<Card title="Admin · Questions">
			<Form layout="vertical" form={form} onFinish={submit} initialValues={{ type: 'MCQ', level: 'LEVEL1', difficulty: 'MEDIUM' }}>
				<Form.Item name="stem" label="Stem" rules={[{ required: true }]}>
					<Input.TextArea rows={4} />
				</Form.Item>
				<Form.Item name="type" label="Type" rules={[{ required: true }]}>
					<Select
						options={[
							{ label: 'MCQ', value: 'MCQ' },
							{ label: 'Vignette MCQ', value: 'VIGNETTE_MCQ' },
							{ label: 'Constructed Response', value: 'CONSTRUCTED_RESPONSE' }
						]}
					/>
				</Form.Item>
				<Form.Item name="level" label="Level" rules={[{ required: true }]}>
					<Select
						options={[
							{ label: 'Level I', value: 'LEVEL1' },
							{ label: 'Level II', value: 'LEVEL2' },
							{ label: 'Level III', value: 'LEVEL3' }
						]}
					/>
				</Form.Item>
				<Form.Item name="difficulty" label="Difficulty" rules={[{ required: true }]}>
					<Select
						options={[
							{ label: 'Easy', value: 'EASY' },
							{ label: 'Medium', value: 'MEDIUM' },
							{ label: 'Hard', value: 'HARD' }
						]}
					/>
				</Form.Item>
				<Form.Item name="vignetteText" label="Vignette (if applicable)">
					<Input.TextArea rows={3} />
				</Form.Item>
				<Card size="small" title="MCQ Options">
					<Form.Item name="optionA" label="Option A">
						<Input />
					</Form.Item>
					<Form.Item name="optionB" label="Option B">
						<Input />
					</Form.Item>
					<Form.Item name="optionC" label="Option C">
						<Input />
					</Form.Item>
					<Form.Item name="optionD" label="Option D">
						<Input />
					</Form.Item>
					<Form.Item name="correct" label="Correct" rules={[{ required: true }]}>
						<Select options={['A','B','C','D'].map(v => ({ label: v, value: v }))} />
					</Form.Item>
				</Card>
				<Button type="primary" htmlType="submit" style={{ marginTop: 12 }}>
					Create Question
				</Button>
			</Form>
		</Card>
	);
}


