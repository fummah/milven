import React, { useEffect, useMemo, useState } from 'react';
import { Card, Form, Select, Button, Upload, Table, Tag, Typography, message, Popconfirm, Space, Empty } from 'antd';
import { UploadOutlined, DeleteOutlined, FileTextOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

export default function AdminDocuments() {
	const [courses, setCourses] = useState([]);
	const [volumes, setVolumes] = useState([]);
	const [documents, setDocuments] = useState([]);
	const [loading, setLoading] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [form] = Form.useForm();

	const selectedCourseId = Form.useWatch('courseId', form);

	// Load courses, volumes, and existing documents
	useEffect(() => {
		(async () => {
			try {
				const [cRes, vRes, dRes] = await Promise.all([
					api.get('/api/cms/courses'),
					api.get('/api/cms/volumes'),
					api.get('/api/cms/curriculum-documents')
				]);
				setCourses(Array.isArray(cRes.data?.courses) ? cRes.data.courses : (cRes.data?.items || []));
				setVolumes(Array.isArray(vRes.data?.volumes) ? vRes.data.volumes : []);
				setDocuments(Array.isArray(dRes.data?.documents) ? dRes.data.documents : []);
			} catch {
				message.error('Failed to load data');
			}
		})();
	}, []);

	const courseOptions = useMemo(() => {
		return (courses || [])
			.slice()
			.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
			.map(c => ({ value: c.id, label: `${c.name} (${c.level})` }));
	}, [courses]);

	const volumeOptions = useMemo(() => {
		if (!selectedCourseId) return [];
		// Filter volumes that have a courseLink to the selected course
		const linked = (volumes || []).filter(v =>
			(v.courseLinks || []).some(l => l.courseId === selectedCourseId || l.course?.id === selectedCourseId)
		);
		if (linked.length > 0) {
			return linked.map(v => ({ value: v.id, label: v.description ? `${v.name} - ${v.description}` : v.name }));
		}
		// Fallback: show all volumes
		return volumes.map(v => ({ value: v.id, label: v.description ? `${v.name} - ${v.description}` : v.name }));
	}, [volumes, selectedCourseId]);

	// Check if selected course+volume already has a document
	const selectedVolumeId = Form.useWatch('volumeId', form);
	const existingDoc = useMemo(() => {
		if (!selectedCourseId || !selectedVolumeId) return null;
		return documents.find(d => d.courseId === selectedCourseId && d.volumeId === selectedVolumeId) || null;
	}, [documents, selectedCourseId, selectedVolumeId]);

	const handleUpload = async (info) => {
		const courseId = form.getFieldValue('courseId');
		const volumeId = form.getFieldValue('volumeId');
		if (!courseId || !volumeId) {
			message.error('Please select both Course and Volume first');
			return;
		}
		const file = info.file;
		if (!file.name.toLowerCase().endsWith('.pdf')) {
			message.error('Only PDF files are accepted');
			return;
		}

		setUploading(true);
		try {
			const formData = new FormData();
			formData.append('file', file);
			formData.append('courseId', courseId);
			formData.append('volumeId', volumeId);

			const { data } = await api.post('/api/cms/curriculum-documents', formData, {
				headers: { 'Content-Type': 'multipart/form-data' }
			});

			if (data.document) {
				// Replace or add to document list
				setDocuments(prev => {
					const filtered = prev.filter(d => d.id !== data.document.id && !(d.courseId === courseId && d.volumeId === volumeId));
					return [data.document, ...filtered];
				});
				const pgCount = data.document.pageCount || 0;
				message.success(`Document uploaded successfully! Extracted ${(data.document.textLength || 0).toLocaleString()} characters from ${pgCount} pages.`);
			}
		} catch (err) {
			const errMsg = err.response?.data?.error || 'Upload failed';
			message.error(errMsg);
		} finally {
			setUploading(false);
		}
	};

	const handleDelete = async (id) => {
		setLoading(true);
		try {
			await api.delete(`/api/cms/curriculum-documents/${id}`);
			setDocuments(prev => prev.filter(d => d.id !== id));
			message.success('Document deleted');
		} catch {
			message.error('Failed to delete document');
		} finally {
			setLoading(false);
		}
	};

	const columns = [
		{
			title: 'Course',
			dataIndex: 'course',
			width: 200,
			render: (course) => course ? <Tag color="blue">{course.name} ({course.level})</Tag> : '—'
		},
		{
			title: 'Volume',
			dataIndex: 'volume',
			width: 200,
			render: (volume) => volume ? <Tag color="green">{volume.name}</Tag> : '—'
		},
		{
			title: 'Filename',
			dataIndex: 'filename',
			width: 250,
			ellipsis: true,
			render: (name) => (
				<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
					<FileTextOutlined style={{ color: '#e74c3c' }} />
					{name}
				</span>
			)
		},
		{
			title: 'Text Extracted',
			dataIndex: 'textLength',
			width: 140,
			render: (len, record) => record.hasText
				? <Tag icon={<CheckCircleOutlined />} color="success">{(len || 0).toLocaleString()} chars</Tag>
				: <Tag color="warning">No text</Tag>
		},
		{
			title: 'Pages',
			dataIndex: 'pageCount',
			width: 80,
			render: (count) => count ? <Tag color="cyan">{count}</Tag> : <Tag color="default">—</Tag>
		},
		{
			title: 'Size',
			dataIndex: 'fileSize',
			width: 100,
			render: (size) => size ? `${(size / 1024 / 1024).toFixed(1)} MB` : '—'
		},
		{
			title: 'Uploaded',
			dataIndex: 'createdAt',
			width: 120,
			render: (v) => v ? new Date(v).toLocaleDateString() : '—'
		},
		{
			title: 'Actions',
			width: 100,
			render: (_, record) => (
				<Popconfirm title="Delete this document?" onConfirm={() => handleDelete(record.id)} okText="Delete" okButtonProps={{ danger: true }}>
					<Button type="text" danger icon={<DeleteOutlined />} size="small">Delete</Button>
				</Popconfirm>
			)
		}
	];

	return (
		<div style={{ padding: 24 }}>
			<Typography.Title level={3} style={{ marginBottom: 24 }}>
				<FileTextOutlined style={{ marginRight: 8 }} />
				Curriculum Documents
			</Typography.Title>
			<Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
				Upload CFA curriculum PDFs for each Course and Volume. The AI question generator will use the document content to create exam questions that closely match the actual curriculum.
			</Typography.Paragraph>

			<Card title="Upload Document" style={{ marginBottom: 24 }}>
				<Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
					<Form.Item name="courseId" label="Course" rules={[{ required: true, message: 'Select a course' }]}>
						<Select
							placeholder="Select course"
							options={courseOptions}
							showSearch
							optionFilterProp="label"
							allowClear
							onChange={() => form.setFieldsValue({ volumeId: undefined })}
						/>
					</Form.Item>
					<Form.Item name="volumeId" label="Volume" rules={[{ required: true, message: 'Select a volume' }]}>
						<Select
							placeholder={selectedCourseId ? 'Select volume' : 'Select a course first'}
							options={volumeOptions}
							showSearch
							optionFilterProp="label"
							allowClear
							disabled={!selectedCourseId || volumeOptions.length === 0}
						/>
					</Form.Item>
					{existingDoc && (
						<div style={{ marginBottom: 16, padding: '8px 12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6 }}>
							<Typography.Text type="warning" strong>
								A document already exists for this Course + Volume ({existingDoc.filename}).
								Uploading a new one will replace it.
							</Typography.Text>
						</div>
					)}
					<Form.Item label="PDF File">
						<Upload
							accept=".pdf"
							maxCount={1}
							showUploadList={false}
							customRequest={({ file, onSuccess }) => {
								handleUpload({ file });
								onSuccess('ok');
							}}
							disabled={!selectedCourseId || !selectedVolumeId || uploading}
						>
							<Button
								type="primary"
								icon={<UploadOutlined />}
								loading={uploading}
								disabled={!selectedCourseId || !selectedVolumeId}
							>
								{uploading ? 'Uploading & Extracting Text...' : 'Upload PDF'}
							</Button>
						</Upload>
						<Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
							Max 50 MB. Text-based PDFs only (not scanned images). The system will extract text content for AI question generation.
						</Typography.Text>
					</Form.Item>
				</Form>
			</Card>

			<Card title={`Uploaded Documents (${documents.length})`}>
				{documents.length === 0 ? (
					<Empty description="No curriculum documents uploaded yet" />
				) : (
					<Table
						rowKey="id"
						dataSource={documents}
						columns={columns}
						loading={loading}
						pagination={{ pageSize: 10 }}
						scroll={{ x: 1000 }}
					/>
				)}
			</Card>
		</div>
	);
}
