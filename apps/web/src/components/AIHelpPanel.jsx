import { useState } from 'react';
import { Button, Typography, Alert, Spin } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { api } from '../lib/api';

function getErrorMessage(error) {
	const raw = error?.response?.data?.error;
	if (typeof raw === 'string' && raw.trim()) return raw;
	if (raw && typeof raw === 'object') {
		const formErrors = Array.isArray(raw.formErrors) ? raw.formErrors.filter(Boolean) : [];
		const fieldErrors = raw.fieldErrors && typeof raw.fieldErrors === 'object'
			? Object.values(raw.fieldErrors).flat().filter(Boolean)
			: [];
		const combined = [...formErrors, ...fieldErrors].filter(Boolean);
		if (combined.length > 0) return combined.join(', ');
	}
	return 'Failed to load AI help';
}

export function AIHelpPanel({ questionId, selectedOptionId, selectedOptionText, textAnswer, mode = 'study_help', buttonLabel = 'AI Help' }) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [content, setContent] = useState('');
	const [error, setError] = useState('');

	if (!questionId) return null;

	const loadHelp = async () => {
		setLoading(true);
		setError('');
		try {
			const { data } = await api.post(`/api/exams/questions/${questionId}/ai-help`, {
				selectedOptionId: selectedOptionId || undefined,
				selectedOptionText: selectedOptionText || undefined,
				textAnswer: textAnswer || undefined,
				mode
			});
			setContent(data?.help || '');
			setOpen(true);
		} catch (e) {
			setError(getErrorMessage(e));
			setOpen(true);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="mt-3">
			<Button
				size="small"
				icon={<RobotOutlined />}
				onClick={() => {
					if (!open || (!content && !error)) {
						loadHelp();
						return;
					}
					setOpen((prev) => !prev);
				}}
				loading={loading}
				className="rounded-lg"
			>
				{buttonLabel}
			</Button>

			{open && (
				<div className="mt-3 p-4 rounded-xl border border-violet-200 bg-violet-50/80">
					<div className="flex items-center gap-2 mb-2">
						<RobotOutlined className="text-violet-600" />
						<Typography.Text strong className="text-violet-800">AI Help</Typography.Text>
					</div>
					{loading ? (
						<div className="py-3 flex items-center gap-2 text-slate-600">
							<Spin size="small" />
							<span>Loading help...</span>
						</div>
					) : error ? (
						<Alert type="warning" showIcon message={error} />
					) : (
						<Typography.Paragraph className="!mb-0 text-slate-800 whitespace-pre-wrap text-sm">
							{content}
						</Typography.Paragraph>
					)}
				</div>
			)}
		</div>
	);
}
