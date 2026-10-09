import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, Radio, Row, Col, Typography, Divider, Tag } from 'antd';
import { questionToFormValues, formValuesToQuestion } from '../lib/questionEdit';

const DIFFICULTY_OPTIONS = [
	{ value: 'EASY', label: 'Easy' },
	{ value: 'MEDIUM', label: 'Medium' },
	{ value: 'HARD', label: 'Hard' },
];

/**
 * Shared full-question editor for AI-generated questions.
 *
 * Used for BOTH Level 1 MCQ preview items and Level 2/3 vignette/case-study
 * sub-questions so the edit experience and field mapping stay identical.
 *
 * Field mapping (matches the question schema / backend accept payload):
 *   stem          -> question.stem
 *   options A/B/C -> question.options[{ text, isCorrect }]
 *   correct       -> which option has isCorrect: true
 *   explanation   -> question.explanation
 *   workedSolution-> question.workedSolution   (NEVER the key formula)
 *   keyFormulas   -> question.keyFormulas      (NEVER the worked solution)
 *   los, difficulty, traceSection, tracePage -> same-named question fields
 *
 * Editing only updates preview state via onSave(); nothing is persisted until
 * the admin clicks Add / Add selected.
 */
export default function AIQuestionEditModal({ open, question, onCancel, onSave }) {
	const [form] = Form.useForm();

	useEffect(() => {
		if (!open) return;
		form.resetFields();
		form.setFieldsValue(questionToFormValues(question));
	}, [open, question, form]);

	const handleOk = async () => {
		const v = await form.validateFields();
		onSave(formValuesToQuestion(question, v));
	};

	return (
		<Modal
			title="Edit Question"
			open={open}
			onCancel={onCancel}
			onOk={handleOk}
			okText="Save changes"
			width={760}
			maskClosable={false}
		>
			<Form form={form} layout="vertical">
				{(question?.topicName || question?.topicId || question?.qid) && (
					<div style={{ marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
						{(question?.topicName || question?.topicId) && <Tag color="blue">Topic: {question.topicName || question.topicId}</Tag>}
						{question?.qid && <Tag color="cyan">{question.qid}</Tag>}
					</div>
				)}

				<Form.Item name="stem" label="Question stem / scenario" rules={[{ required: true, message: 'Question stem is required' }]}>
					<Input.TextArea rows={3} autoSize={{ minRows: 2, maxRows: 6 }} />
				</Form.Item>

				<Divider orientation="left" style={{ margin: '8px 0 12px' }}>Answer options</Divider>
				<Row gutter={12}>
					<Col span={8}>
						<Form.Item name="optionA" label="Option A" rules={[{ required: true, message: 'Option A is required' }]}>
							<Input />
						</Form.Item>
					</Col>
					<Col span={8}>
						<Form.Item name="optionB" label="Option B" rules={[{ required: true, message: 'Option B is required' }]}>
							<Input />
						</Form.Item>
					</Col>
					<Col span={8}>
						<Form.Item name="optionC" label="Option C" rules={[{ required: true, message: 'Option C is required' }]}>
							<Input />
						</Form.Item>
					</Col>
				</Row>
				<Form.Item name="correct" label="Correct answer" rules={[{ required: true }]}>
					<Radio.Group>
						<Radio value={0}>A</Radio>
						<Radio value={1}>B</Radio>
						<Radio value={2}>C</Radio>
					</Radio.Group>
				</Form.Item>

				<Form.Item name="explanation" label="Explanation">
					<Input.TextArea rows={3} autoSize={{ minRows: 2, maxRows: 6 }} />
				</Form.Item>

				<Form.Item name="workedSolution" label="Worked solution">
					<Input.TextArea rows={4} autoSize={{ minRows: 3, maxRows: 10 }} />
				</Form.Item>

				<Form.Item name="keyFormulas" label="Key formula">
					<Input.TextArea rows={2} autoSize={{ minRows: 1, maxRows: 6 }} />
				</Form.Item>

				<Row gutter={12}>
					<Col span={12}>
						<Form.Item name="los" label="Learning Outcome Statement (LOS)">
							<Input />
						</Form.Item>
					</Col>
					<Col span={12}>
						<Form.Item name="difficulty" label="Difficulty">
							<Select options={DIFFICULTY_OPTIONS} />
						</Form.Item>
					</Col>
				</Row>
				<Row gutter={12}>
					<Col span={12}>
						<Form.Item name="traceSection" label="Trace (section)">
							<Input />
						</Form.Item>
					</Col>
					<Col span={12}>
						<Form.Item name="tracePage" label="Trace (page)">
							<Input />
						</Form.Item>
					</Col>
				</Row>

				<Typography.Text type="secondary" style={{ fontSize: 12 }}>
					Changes update the preview only. Use "Add" / "Add selected" to save the question permanently.
				</Typography.Text>
			</Form>
		</Modal>
	);
}
