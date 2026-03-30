import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, Button, Typography, Select, message, Form, Input, Space } from 'antd';
import { BranchesOutlined } from '@ant-design/icons';
import { countriesOptions } from '../constants/countries';

export function Account() {
	const [user, setUser] = useState(null);
	const [sub, setSub] = useState(null);
	const [provider, setProvider] = useState('FLUTTERWAVE');
	const [plan, setPlan] = useState('standard');
	const [saving, setSaving] = useState(false);
	const [form] = Form.useForm();
	const [pathwayVolumes, setPathwayVolumes] = useState([]);
	const [watchedLevel, setWatchedLevel] = useState('');

	useEffect(() => {
		(async () => {
			try {
				const me = await api.get('/api/users/me');
				const u = me.data.user;
				setUser(u);
				setWatchedLevel(u?.level ?? '');
				const s = await api.get('/api/payments/subscriptions/me');
				setSub(s.data.subscription);
			} catch {
				// ignore
			}
		})();
	}, []);

	useEffect(() => {
		if (watchedLevel === 'LEVEL3') {
			api.get('/api/cms/volumes/pathways').then(res => {
				setPathwayVolumes(res.data.volumes || []);
			}).catch(() => setPathwayVolumes([]));
		} else {
			setPathwayVolumes([]);
		}
	}, [watchedLevel]);

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
							level: user.level,
							pathwayVolumeId: user.pathwayVolumeId ?? undefined
						}}
						onFinish={async (vals) => {
							setSaving(true);
							try {
								const { data } = await api.put('/api/users/me', {
									...vals,
									pathwayVolumeId: vals.level === 'LEVEL3' ? (vals.pathwayVolumeId ?? null) : null
								});
								setUser(data.user);
								setWatchedLevel(data.user?.level ?? '');
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
									onChange={(v) => { setWatchedLevel(v ?? ''); form.setFieldValue('pathwayVolumeId', undefined); }}
									options={[
										{ label: 'None', value: 'NONE' },
										{ label: 'Level I', value: 'LEVEL1' },
										{ label: 'Level II', value: 'LEVEL2' },
										{ label: 'Level III', value: 'LEVEL3' }
									]}
								/>
							</Form.Item>
							{watchedLevel === 'LEVEL3' && (
								<Form.Item
									name="pathwayVolumeId"
									label={<span><BranchesOutlined style={{ color: '#722ed1', marginRight: 6 }} />Level III Pathway</span>}
									style={{ minWidth: 280 }}
								>
									<Select
										allowClear
										placeholder="Select pathway (optional)"
										showSearch
										optionFilterProp="label"
										options={pathwayVolumes.map(v => ({
											value: v.id,
											label: v.description ? `${v.name} – ${v.description}` : v.name
										}))}
										notFoundContent="No pathways configured"
									/>
								</Form.Item>
							)}
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


