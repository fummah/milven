import React, { useEffect, useMemo, useState } from 'react';
import {
	Alert, Button, Card, Checkbox, Descriptions, Drawer, Empty, Form, Input, InputNumber,
	message, Modal, Popconfirm, Space, Spin, Table, Tabs, Tag, Typography
} from 'antd';
import {
	CheckCircleOutlined, CloseCircleOutlined, CopyOutlined, DeleteOutlined, EyeOutlined,
	ReloadOutlined, RobotOutlined, SafetyCertificateOutlined, SaveOutlined
} from '@ant-design/icons';
import { api } from '../../lib/api';

const STATUS_COLORS = {
	DRAFT: 'default',
	VALIDATED: 'blue',
	NEEDS_REVISION: 'orange',
	APPROVED: 'green',
	REJECTED: 'red',
	COMMITTED: 'green',
	PARTIAL_COMMIT: 'gold',
	CANCELLED: 'default',
	FAILED: 'red'
};

function JsonBlock({ value }) {
	return (
		<pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, maxHeight: 240, overflow: 'auto' }}>
			{JSON.stringify(value, null, 2)}
		</pre>
	);
}

function QuestionPreview({ item, onEdit }) {
	const payload = item.payload || {};
	const children = payload.subQuestions || [];
	const options = payload.options || [];
	return (
		<Card
			size="small"
			style={{ marginBottom: 14, borderRadius: 12, border: '1px solid #e2e8f0' }}
			title={<Space wrap><Tag color={item.status === 'VALIDATED' ? 'blue' : STATUS_COLORS[item.status] || 'default'}>{item.status}</Tag><Typography.Text strong>{payload.externalQuestionId || item.externalQuestionId}</Typography.Text><Tag>{payload.questionType || item.questionType}</Tag><Tag color="purple">{payload.difficulty}</Tag><Tag color="gold">{payload.marks} marks</Tag></Space>}
			extra={<Button size="small" icon={<SaveOutlined />} onClick={() => onEdit(item)}>Edit staged item</Button>}
		>
			<Descriptions size="small" column={1} bordered>
				<Descriptions.Item label="Academic IDs">
					Course {payload.courseId || '-'} / Volume {payload.volumeId || '-'} / Module {payload.moduleId || '-'} / Topic {payload.primaryTopicId || '-'}
				</Descriptions.Item>
				<Descriptions.Item label="Stem">{payload.stem || '-'}</Descriptions.Item>
				{payload.vignetteText && <Descriptions.Item label="Vignette"><div dangerouslySetInnerHTML={{ __html: payload.vignetteText }} /></Descriptions.Item>}
				<Descriptions.Item label="LOS">{payload.los || '-'}</Descriptions.Item>
				<Descriptions.Item label="Trace">{payload.traceSection || '-'} {payload.tracePage ? `| ${payload.tracePage}` : ''}</Descriptions.Item>
				<Descriptions.Item label="Key formulas">{payload.keyFormulas || '-'}</Descriptions.Item>
				<Descriptions.Item label="Worked solution">{payload.workedSolution || payload.expectedOutput || '-'}</Descriptions.Item>
				<Descriptions.Item label="Marking guidelines">{payload.markingGuidelines || '-'}</Descriptions.Item>
			</Descriptions>

			{options.length > 0 && (
				<div style={{ marginTop: 12 }}>
					<Typography.Text strong>Options</Typography.Text>
					{options.map((option, index) => (
						<div key={index} style={{ marginTop: 6, padding: 8, borderRadius: 8, background: option.isCorrect ? '#f0fdf4' : '#f8fafc', border: `1px solid ${option.isCorrect ? '#86efac' : '#e2e8f0'}` }}>
							<Typography.Text strong>{option.label || String.fromCharCode(65 + index)}.</Typography.Text> {option.text} {option.isCorrect && <Tag color="green">Correct</Tag>}
							{option.rationale && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{option.rationale}</div>}
						</div>
					))}
				</div>
			)}

			{children.length > 0 && (
				<div style={{ marginTop: 14 }}>
					<Typography.Text strong>Item-set children</Typography.Text>
					{children.map((child, index) => (
						<Card key={index} size="small" style={{ marginTop: 8, borderRadius: 10 }}>
							<Typography.Text strong>{index + 1}. {child.externalQuestionId}</Typography.Text>
							<div style={{ marginTop: 6 }}>{child.stem}</div>
							<Space wrap size={4} style={{ marginTop: 6 }}>
								<Tag color="purple">{child.difficulty}</Tag>
								<Tag color="gold">{child.marks} marks</Tag>
								{child.los && <Tag color="blue">LOS</Tag>}
								{child.keyFormulas && <Tag color="cyan">Formula</Tag>}
								{child.workedSolution && <Tag color="green">Solution</Tag>}
							</Space>
							{(child.options || []).map((option, optionIndex) => (
								<div key={optionIndex} style={{ fontSize: 12, marginTop: 4, color: option.isCorrect ? '#166534' : '#475569' }}>
									{option.label || String.fromCharCode(65 + optionIndex)}. {option.text} {option.isCorrect ? '(correct)' : ''}
								</div>
							))}
						</Card>
					))}
				</div>
			)}

			{(item.validation?.errors?.length > 0 || item.validation?.warnings?.length > 0) && (
				<div style={{ marginTop: 14 }}>
					<Typography.Text strong>Validation</Typography.Text>
					<JsonBlock value={{ errors: item.validation?.errors || [], warnings: item.validation?.warnings || [], info: item.validation?.info || [] }} />
				</div>
			)}
			{item.duplicates?.requiresReview && (
				<Alert
					style={{ marginTop: 12 }}
					type="warning"
					showIcon
					message="Possible duplicate"
					description={<JsonBlock value={{ exactMatches: item.duplicates.exactMatches, possibleMatches: item.duplicates.possibleMatches }} />}
				/>
			)}
		</Card>
	);
}

export function AdminMcpImports() {
	const [tab, setTab] = useState('imports');
	const [loading, setLoading] = useState(false);
	const [batches, setBatches] = useState([]);
	const [tokens, setTokens] = useState([]);
	const [scopes, setScopes] = useState([]);
	const [selectedBatch, setSelectedBatch] = useState(null);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [tokenModalOpen, setTokenModalOpen] = useState(false);
	const [createdToken, setCreatedToken] = useState(null);
	const [editingItem, setEditingItem] = useState(null);
	const [editJson, setEditJson] = useState('');
	const [editSaving, setEditSaving] = useState(false);
	const [form] = Form.useForm();

	const loadImports = async () => {
		setLoading(true);
		try {
			const { data } = await api.get('/api/mcp/imports', { params: { limit: 100 } });
			setBatches(data.batches || []);
		} catch {
			message.error('Could not load MCP imports');
		} finally {
			setLoading(false);
		}
	};

	const loadTokens = async () => {
		try {
			const [{ data: tokenData }, { data: scopeData }] = await Promise.all([
				api.get('/api/mcp/tokens'),
				api.get('/api/mcp/scopes')
			]);
			setTokens(tokenData.tokens || []);
			setScopes(scopeData.scopes || []);
		} catch {
			message.error('Could not load MCP access tokens');
		}
	};

	useEffect(() => { loadImports(); loadTokens(); }, []);
	useEffect(() => { if (scopes.length) form.setFieldsValue({ scopes }); }, [scopes, form]);

	const openBatch = async batchId => {
		try {
			const { data } = await api.get(`/api/mcp/imports/${batchId}`);
			setSelectedBatch(data.batch);
			setDrawerOpen(true);
		} catch {
			message.error('Could not load import batch');
		}
	};

	const reloadSelected = async batchId => {
		const { data } = await api.get(`/api/mcp/imports/${batchId}`);
		setSelectedBatch(data.batch);
		loadImports();
	};

	const approve = async batch => {
		Modal.confirm({
			title: 'Approve this import batch?',
			content: 'Approval allows the batch to be committed to the live question bank.',
			okText: 'Approve',
			onOk: async () => {
				try {
					await api.post(`/api/mcp/imports/${batch.id}/approve`);
					message.success('Batch approved');
					await reloadSelected(batch.id);
				} catch (error) {
					message.error(error?.response?.data?.error || 'Approval failed');
				}
			}
		});
	};

	const commit = async batch => {
		Modal.confirm({
			title: 'Commit approved questions?',
			content: 'This writes the approved questions to the live Milven question bank. Item sets are committed transactionally.',
			okText: 'Commit to Question Bank',
			okButtonProps: { danger: true },
			onOk: async () => {
				try {
					const { data } = await api.post(`/api/mcp/imports/${batch.id}/commit`);
					message.success(data.partial ? 'Batch partially committed' : 'Batch committed');
					await reloadSelected(batch.id);
				} catch (error) {
					message.error(error?.response?.data?.error || 'Commit failed');
				}
			}
		});
	};

	const reject = async batch => {
		Modal.confirm({
			title: 'Reject this import batch?',
			content: 'Rejected batches cannot be approved. You can still keep the audit trail.',
			okText: 'Reject',
			okButtonProps: { danger: true },
			onOk: async () => {
				try {
					await api.post(`/api/mcp/imports/${batch.id}/reject`, { reason: 'Rejected from MCP Imports admin review' });
					message.success('Batch rejected');
					await reloadSelected(batch.id);
				} catch (error) {
					message.error(error?.response?.data?.error || 'Rejection failed');
				}
			}
		});
	};

	const cancel = async batch => {
		try {
			await api.post(`/api/mcp/imports/${batch.id}/cancel`);
			message.success('Batch cancelled');
			await reloadSelected(batch.id);
		} catch (error) {
			message.error(error?.response?.data?.error || 'Cancel failed');
		}
	};

	const createToken = async values => {
		try {
			const { data } = await api.post('/api/mcp/tokens', values);
			setCreatedToken(data);
			setTokenModalOpen(false);
			form.resetFields();
			loadTokens();
		} catch (error) {
			message.error(error?.response?.data?.error || 'Could not create token');
		}
	};

	const revokeToken = async token => {
		try {
			await api.delete(`/api/mcp/tokens/${token.id}`);
			message.success('Token revoked');
			loadTokens();
		} catch {
			message.error('Could not revoke token');
		}
	};

	const openEdit = item => {
		setEditingItem(item);
		setEditJson(JSON.stringify(item.payload, null, 2));
	};

	const saveEdit = async () => {
		let parsed;
		try {
			parsed = JSON.parse(editJson);
		} catch {
			message.error('Draft JSON is invalid');
			return;
		}
		setEditSaving(true);
		try {
			await api.put(`/api/mcp/imports/${selectedBatch.id}/items/${editingItem.id}`, { question: parsed });
			message.success('Draft updated and revalidated');
			setEditingItem(null);
			await reloadSelected(selectedBatch.id);
		} catch (error) {
			message.error(error?.response?.data?.error || 'Could not update draft');
		} finally {
			setEditSaving(false);
		}
	};

	const batchColumns = [
		{ title: 'Batch', dataIndex: 'id', width: 150, render: value => <Typography.Text copyable={{ text: value }} style={{ fontSize: 12 }}>{value.slice(0, 10)}...</Typography.Text> },
		{ title: 'Source', dataIndex: 'sourceClient', width: 150 },
		{ title: 'Items', dataIndex: 'itemCount', width: 70 },
		{ title: 'Status', dataIndex: 'status', width: 130, render: value => <Tag color={STATUS_COLORS[value] || 'default'}>{value}</Tag> },
		{ title: 'Commit', dataIndex: 'commitStatus', width: 130, render: (value, row) => <Tag color={row.status === 'COMMITTED' ? 'green' : row.status === 'PARTIAL_COMMIT' ? 'gold' : 'default'}>{value} {row.committedCount ? `(${row.committedCount})` : ''}</Tag> },
		{ title: 'Validation', key: 'validation', width: 150, render: (_, row) => <Space size={4}><Tag color={row.validationSummary?.errors ? 'red' : 'green'}>{row.validationSummary?.errors || 0} errors</Tag><Tag color={row.validationSummary?.warnings ? 'orange' : 'default'}>{row.validationSummary?.warnings || 0} warnings</Tag></Space> },
		{ title: 'Duplicates', key: 'duplicates', width: 100, render: (_, row) => row.duplicateSummary?.requiresReview ? <Tag color="orange">Review</Tag> : <Tag>None</Tag> },
		{ title: 'Created', dataIndex: 'createdAt', width: 170, render: value => new Date(value).toLocaleString() },
		{ title: 'Actions', key: 'actions', fixed: 'right', width: 100, render: (_, row) => <Button size="small" icon={<EyeOutlined />} onClick={() => openBatch(row.id)}>Review</Button> }
	];

	const tokenColumns = [
		{ title: 'Name', dataIndex: 'name' },
		{ title: 'Prefix', dataIndex: 'tokenPrefix', render: value => <Typography.Text code>{value}...</Typography.Text> },
		{ title: 'Scopes', dataIndex: 'scopes', render: value => <Space wrap size={2}>{(value || []).map(scope => <Tag key={scope}>{scope}</Tag>)}</Space> },
		{ title: 'Expires', dataIndex: 'expiresAt', render: value => value ? new Date(value).toLocaleString() : 'Never' },
		{ title: 'Last used', dataIndex: 'lastUsedAt', render: value => value ? new Date(value).toLocaleString() : 'Never' },
		{ title: 'Status', dataIndex: 'revokedAt', render: value => value ? <Tag color="red">Revoked</Tag> : <Tag color="green">Active</Tag> },
		{ title: '', key: 'actions', render: (_, row) => !row.revokedAt && <Popconfirm title="Revoke this token?" onConfirm={() => revokeToken(row)}><Button danger size="small" icon={<DeleteOutlined />}>Revoke</Button></Popconfirm> }
	];

	return (
		<div style={{ padding: 20 }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
				<div>
					<Typography.Title level={3} style={{ margin: 0 }}><RobotOutlined /> MCP Imports / External AI Questions</Typography.Title>
					<Typography.Text type="secondary">Review externally generated questions before committing them to the Milven question bank.</Typography.Text>
				</div>
				<Space>
					<Button icon={<ReloadOutlined />} onClick={() => { loadImports(); loadTokens(); }}>Refresh</Button>
					<Button type="primary" icon={<SafetyCertificateOutlined />} onClick={() => setTokenModalOpen(true)}>Create MCP Token</Button>
				</Space>
			</div>

			<Alert
				type="info"
				showIcon
				style={{ marginBottom: 16 }}
				message="External AI writes are staged"
				description="MCP clients can validate and create drafts, but only an administrator can approve and commit questions to the live question bank."
			/>

			<Tabs
				activeKey={tab}
				onChange={setTab}
				items={[
					{
						key: 'imports',
						label: 'Import Batches',
						children: (
							<Card style={{ borderRadius: 12 }}>
								<Table
									rowKey="id"
									loading={loading}
									dataSource={batches}
									columns={batchColumns}
									scroll={{ x: 1250 }}
									pagination={{ pageSize: 20 }}
									locale={{ emptyText: <Empty description="No external AI import batches yet." /> }}
								/>
							</Card>
						)
					},
					{
						key: 'tokens',
						label: 'Access Tokens',
						children: (
							<Card style={{ borderRadius: 12 }}>
								<Typography.Paragraph type="secondary">
									Use these scoped tokens for MCP clients. Tokens are hashed at rest and shown only once. For OAuth-enabled deployments, configure MCP_OAUTH_JWKS_URL, MCP_OAUTH_ISSUER and MCP_OAUTH_AUDIENCE.
								</Typography.Paragraph>
								<Table rowKey="id" dataSource={tokens} columns={tokenColumns} pagination={false} />
							</Card>
						)
					}
				]}
			/>

			<Drawer
				open={drawerOpen}
				onClose={() => setDrawerOpen(false)}
				width={1000}
				title={selectedBatch ? <Space wrap>Import {selectedBatch.id}<Tag color={STATUS_COLORS[selectedBatch.status] || 'default'}>{selectedBatch.status}</Tag><Tag>{selectedBatch.commitStatus}</Tag></Space> : 'Import batch'}
				extra={selectedBatch && (
					<Space wrap>
						{selectedBatch.status === 'VALIDATED' && <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => approve(selectedBatch)}>Approve</Button>}
						{selectedBatch.status === 'APPROVED' && <Button type="primary" danger icon={<CheckCircleOutlined />} onClick={() => commit(selectedBatch)}>Commit to Question Bank</Button>}
						{!['COMMITTED', 'REJECTED', 'CANCELLED'].includes(selectedBatch.status) && <Button danger icon={<CloseCircleOutlined />} onClick={() => reject(selectedBatch)}>Reject</Button>}
						{!['COMMITTED', 'REJECTED', 'CANCELLED'].includes(selectedBatch.status) && <Button onClick={() => cancel(selectedBatch)}>Cancel</Button>}
					</Space>
				)}
			>
				{selectedBatch ? (
					<>
						<Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
							<Descriptions.Item label="Source client">{selectedBatch.sourceClient}</Descriptions.Item>
							<Descriptions.Item label="Provider">{selectedBatch.sourceProvider || '-'}</Descriptions.Item>
							<Descriptions.Item label="External request">{selectedBatch.externalRequestId || '-'}</Descriptions.Item>
							<Descriptions.Item label="Idempotency key">{selectedBatch.idempotencyKey}</Descriptions.Item>
							<Descriptions.Item label="Items">{selectedBatch.itemCount}</Descriptions.Item>
							<Descriptions.Item label="Committed">{selectedBatch.committedCount}</Descriptions.Item>
							<Descriptions.Item label="Validation" span={2}><JsonBlock value={selectedBatch.validationSummary || {}} /></Descriptions.Item>
							{selectedBatch.duplicateSummary?.requiresReview && <Descriptions.Item label="Duplicate review" span={2}><JsonBlock value={selectedBatch.duplicateSummary} /></Descriptions.Item>}
						</Descriptions>
						{selectedBatch.items.map(item => <QuestionPreview key={item.id} item={item} onEdit={openEdit} />)}
					</>
				) : <Spin />}
			</Drawer>

			<Modal
				open={Boolean(editingItem)}
				onCancel={() => setEditingItem(null)}
				title={`Edit staged item ${editingItem?.externalQuestionId || ''}`}
				width={900}
				onOk={saveEdit}
				okText="Save and revalidate"
				confirmLoading={editSaving}
			>
				<Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Changes are saved to the staged review record only. Validation, approval and duplicate state will be recalculated." />
				<Input.TextArea value={editJson} onChange={event => setEditJson(event.target.value)} autoSize={{ minRows: 20, maxRows: 32 }} style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }} />
			</Modal>

			<Modal open={tokenModalOpen} onCancel={() => setTokenModalOpen(false)} footer={null} title="Create MCP access token">
				<Form form={form} layout="vertical" onFinish={createToken} initialValues={{ scopes, expiresInDays: 30 }}>
					<Form.Item name="name" label="Token name" rules={[{ required: true, min: 2 }]}><Input placeholder="Claude question generation" /></Form.Item>
					<Form.Item name="scopes" label="Scopes" rules={[{ required: true }]}><Checkbox.Group options={scopes} /></Form.Item>
					<Form.Item name="expiresInDays" label="Expires in days"><InputNumber min={1} max={365} style={{ width: '100%' }} /></Form.Item>
					<Button type="primary" htmlType="submit" block>Create token</Button>
				</Form>
			</Modal>

			<Modal open={Boolean(createdToken)} onCancel={() => setCreatedToken(null)} footer={null} title="Copy your MCP token now">
				<Alert type="warning" showIcon message="This secret is shown only once. Store it in the MCP client's secure authorization settings." />
				<Input.TextArea style={{ marginTop: 12, fontFamily: 'Consolas, monospace' }} value={createdToken?.secret} readOnly autoSize />
				<Button
					style={{ marginTop: 12 }}
					icon={<CopyOutlined />}
					onClick={async () => {
						try { await navigator.clipboard.writeText(createdToken.secret); message.success('Token copied'); }
						catch { message.error('Could not copy token'); }
					}}
				>
					Copy token
				</Button>
			</Modal>
		</div>
	);
}

export default AdminMcpImports;
