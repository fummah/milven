import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Drawer, Form, Input, InputNumber, Progress, Radio, Select, Space, Typography, Upload, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { volumeBelongsToCourse } from '../../lib/slideUrls';

const { Dragger } = Upload;
const { TextArea } = Input;
const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };

export default function AdminModuleNotePdfDrawer({ open, mode = 'upload', book = null, courses = [], volumes = [], onClose, onSaved }) {
  const [form] = Form.useForm();
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [error, setError] = useState('');
  const courseId = Form.useWatch('courseId', form);

  const volumeOptions = useMemo(
    () => volumes.filter(volume => volumeBelongsToCourse(volume, courseId)).map(volume => ({ value: volume.id, label: volume.name })),
    [volumes, courseId]
  );

  useEffect(() => {
    if (!open) return;
    setError(''); setFile(null); setUploadPercent(0);
    if (mode === 'edit' && book) {
      form.setFieldsValue({
        courseId: book.courseId,
        volumeId: book.volumeId,
        title: book.title,
        description: book.description || '',
        keywords: book.keywords || [],
        year: book.year || 2026,
        publicationStatus: book.publicationStatus || 'DRAFT'
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ year: 2026, publicationStatus: 'DRAFT' });
    }
  }, [open, mode, book, form]);

  const submit = async () => {
    setError('');
    let values;
    try { values = await form.validateFields(); } catch { return; }
    if (mode === 'upload' && !file) { setError('Select a PDF file.'); return; }
    setSaving(true); setUploadPercent(0);
    try {
      if (mode === 'upload') {
        const body = new FormData();
        body.append('file', file);
        body.append('courseId', values.courseId);
        body.append('volumeId', values.volumeId);
        body.append('title', values.title || '');
        body.append('description', values.description || '');
        body.append('keywords', JSON.stringify(values.keywords || []));
        body.append('year', String(values.year || 2026));
        await api.post('/api/module-note-pdfs/upload', body, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: event => { if (event.total) setUploadPercent(Math.round((event.loaded / event.total) * 100)); }
        });
        message.success('Module Notes PDF uploaded. Indexing has started.');
      } else {
        await api.put(`/api/module-note-pdfs/${book.id}`, {
          courseId: values.courseId,
          volumeId: values.volumeId,
          title: values.title,
          description: values.description || '',
          keywords: values.keywords || [],
          year: values.year,
          publicationStatus: values.publicationStatus
        });
        message.success('Module Notes PDF updated.');
      }
      onSaved?.(); onClose?.();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not save Module Notes PDF.');
    } finally { setSaving(false); }
  };

  return (
    <Drawer
      open={open}
      onClose={() => { if (!saving) onClose?.(); }}
      width={Math.min(680, typeof window !== 'undefined' ? window.innerWidth * 0.96 : 680)}
      title={mode === 'upload' ? 'Upload Module Notes PDF' : 'Edit Module Notes Details'}
      destroyOnClose
      extra={<Space><Button disabled={saving} onClick={() => onClose?.()}>Cancel</Button><Button type="primary" loading={saving} onClick={submit}>{mode === 'upload' ? 'Upload PDF' : 'Save Changes'}</Button></Space>}
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Form form={form} layout="vertical" requiredMark="optional">
        <Typography.Title level={5} style={{ marginTop: 0 }}>Academic Mapping</Typography.Title>
        <Form.Item name="courseId" label="Level / Course" rules={[{ required: true, message: 'Select a course' }]}>
          <Select showSearch optionFilterProp="label" placeholder="Select Course" options={courses.map(course => ({ value: course.id, label: `${course.name} (${LEVEL_LABELS[course.level] || course.level})` }))} onChange={() => form.setFieldsValue({ volumeId: undefined })} />
        </Form.Item>
        <Form.Item name="volumeId" label="Volume" rules={[{ required: true, message: 'Select a volume' }]}>
          <Select showSearch optionFilterProp="label" disabled={!courseId} placeholder={courseId ? 'Select Volume' : 'Select a course first'} options={volumeOptions} />
        </Form.Item>

        <Typography.Title level={5}>Module Notes Details</Typography.Title>
        <Form.Item name="title" label="Module Notes Title" rules={[{ required: true, message: 'Enter a title' }]}><Input maxLength={300} showCount /></Form.Item>
        <Form.Item name="description" label="Description"><TextArea rows={3} maxLength={10000} showCount /></Form.Item>
        <Form.Item name="keywords" label="Keywords / Tags"><Select mode="tags" tokenSeparators={[',', ';']} /></Form.Item>
        <Form.Item name="year" label="Curriculum Year" rules={[{ required: true }]}><InputNumber min={2020} max={2040} style={{ width: '100%' }} /></Form.Item>

        {mode === 'upload' && (
          <Form.Item label="PDF File" required>
            <Dragger accept=".pdf" maxCount={1} beforeUpload={selected => {
              if (!/\.pdf$/i.test(selected.name)) { message.error('Only PDF files are accepted.'); return Upload.LIST_IGNORE; }
              if (selected.size > 250 * 1024 * 1024) { message.error('PDF must be 250 MB or smaller.'); return Upload.LIST_IGNORE; }
              setFile(selected); return false;
            }} onRemove={() => setFile(null)} fileList={file ? [{ uid: file.uid || 'pdf', name: file.name, status: 'done', size: file.size }] : []}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Drag & drop the Module Notes PDF here, or click to browse</p>
              <p className="ant-upload-hint">The original PDF is preserved. Page text indexing runs in the background.</p>
            </Dragger>
            {saving && uploadPercent > 0 && uploadPercent < 100 && <Progress percent={uploadPercent} size="small" style={{ marginTop: 10 }} />}
          </Form.Item>
        )}

        <Form.Item name="publicationStatus" label="Publication Status" extra="Published PDFs appear only after indexing reaches READY.">
          <Radio.Group><Radio value="DRAFT">Draft</Radio><Radio value="PUBLISHED">Published</Radio></Radio.Group>
        </Form.Item>
      </Form>
    </Drawer>
  );
}
