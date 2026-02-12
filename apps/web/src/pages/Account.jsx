import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, Button, Typography, Select, message, Form, Input, Space } from 'antd';
import { countriesOptions } from '../constants/countries';

export function Account() {
	const [user, setUser] = useState(null);
	const [sub, setSub] = useState(null);
	const [provider, setProvider] = useState('FLUTTERWAVE');
	const [plan, setPlan] = useState('standard');
	const [saving, setSaving] = useState(false);
	const [form] = Form.useForm();

	useEffect(() => {
		(async () => {
			try {
				const me = await api.get('/api/users/me');
				setUser(me.data.user);
				const s = await api.get('/api/payments/subscriptions/me');
				setSub(s.data.subscription);
			} catch {
				// ignore
			}
		})();
	}, []);

	const subscribe = async () => {
		try {
			const res = await api.post('/api/payments/initiate', { provider, plan });
			window.location.href = res.data.url;
		} catch {
			message.error('Unable to initiate payment');
		}
	};

	return (
		<Card title="Account">
			{user && (
				<>
					<Typography.Paragraph style={{ marginBottom: 8 }}>
						<Typography.Text strong>Email:</Typography.Text> {user.email}
					</Typography.Paragraph>
					<Form
						layout="vertical"
						form={form}
						initialValues={{
							firstName: user.firstName,
							lastName: user.lastName,
							phone: user.phone,
							country: user.country,
							level: user.level
						}}
						onFinish={async (vals) => {
							setSaving(true);
							try {
								const { data } = await api.put('/api/users/me', vals);
								setUser(data.user);
								message.success('Profile updated');
							} catch {
								message.error('Failed to update profile');
							} finally {
								setSaving(false);
							}
						}}
					>
						<Space size={12} style={{ width: '100%' }} wrap>
							<Form.Item label="First name" name="firstName" style={{ minWidth: 240, flex: 1 }}>
								<Input placeholder="First name" />
							</Form.Item>
							<Form.Item label="Last name" name="lastName" style={{ minWidth: 240, flex: 1 }}>
								<Input placeholder="Last name" />
							</Form.Item>
							<Form.Item label="Phone" name="phone" style={{ minWidth: 240, flex: 1 }}>
								<Input placeholder="+27 ..." />
							</Form.Item>
							<Form.Item label="Country" name="country" style={{ minWidth: 240, flex: 1 }}>
								<Select
									showSearch
									optionFilterProp="label"
									options={countriesOptions}
									placeholder="Select country"
								/>
							</Form.Item>
							<Form.Item label="Level" name="level" style={{ minWidth: 200 }}>
								<Select
									options={[
										{ label: 'None', value: 'NONE' },
										{ label: 'Level I', value: 'LEVEL1' },
										{ label: 'Level II', value: 'LEVEL2' },
										{ label: 'Level III', value: 'LEVEL3' }
									]}
								/>
							</Form.Item>
						</Space>
						<Button type="primary" htmlType="submit" loading={saving}>
							Save changes
						</Button>
					</Form>
				</>
			)}
			<Card size="small" title="Subscription" style={{ marginTop: 12 }}>
				<Typography.Paragraph>
					Status: {sub ? sub.status : 'None'} {sub?.currency ? `(${sub.currency})` : ''}
				</Typography.Paragraph>
				<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
					<Select
						value={provider}
						onChange={setProvider}
						options={[
							{ label: 'Flutterwave (Zimbabwe/International)', value: 'FLUTTERWAVE' },
							{ label: 'PayFast (South Africa)', value: 'PAYFAST' }
						]}
						style={{ width: 320 }}
					/>
					<Select
						value={plan}
						onChange={setPlan}
						options={[
							{ label: 'Standard', value: 'standard' },
							{ label: 'Premium', value: 'premium' }
						]}
						style={{ width: 160 }}
					/>
					<Button type="primary" onClick={subscribe}>
						Subscribe
					</Button>
				</div>
			</Card>
		</Card>
	);
}


