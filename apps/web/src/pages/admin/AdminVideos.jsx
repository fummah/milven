import { Card, Form, Input, Button, Select, message } from 'antd';
import { api } from '../../lib/api';

export function AdminVideos() {
	const [form] = Form.useForm();
	const submit = async (values) => {
		try {
			await api.post('/api/content/videos', values);
			message.success('Video created');
			form.resetFields();
		} catch {
			message.error('Failed (admin only)');
		}
	};
	return (
		<Card title="Admin · Videos">
			<Form layout="vertical" form={form} onFinish={submit} initialValues={{ level: 'LEVEL1' }}>
				<Form.Item name="title" label="Title" rules={[{ required: true }]}>
					<Input />
				</Form.Item>
				<Form.Item name="url" label="Video URL" rules={[{ required: true }]}>
					<Input placeholder="https://..." />
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
				<Button type="primary" htmlType="submit">
					Create
				</Button>
			</Form>
		</Card>
	);
}


