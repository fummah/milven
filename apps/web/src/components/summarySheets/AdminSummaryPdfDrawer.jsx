import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Drawer, Form, Input, InputNumber, Progress, Radio, Select, Space, Typography, Upload, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { moduleBelongsTo, sameId, volumeBelongsToCourse } from '../../lib/slideUrls';
import { RESOURCE_TYPES } from '../../lib/resourceTitles';
import { useSuggestedResourceTitle } from '../../lib/useSuggestedResourceTitle';

const { Dragger } = Upload;
const { TextArea } = Input;
const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };

export default function AdminSummaryPdfDrawer({
  open,
  mode = 'upload',
  sheet = null,
  preselect = null,
  courses = [],
  volumes = [],
  onClose,
  onSaved
}) {
  const [form] = Form.useForm();
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [error, setError] = useState('');
  const [modules, setModules] = useState([]);
  const [topics, setTopics] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [moduleError, setModuleError] = useState('');
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [loadingConcepts, setLoadingConcepts] = useState(false);
  const [topicsError, setTopicsError] = useState('');
  const [conceptsError, setConceptsError] = useState('');
  const [modulesReloadKey, setModulesReloadKey] = useState(0);
  const moduleRequest = useRef(0);
  const dependencyRequest = useRef(0);

  const courseId = Form.useWatch('courseId', form);
  const volumeId = Form.useWatch('volumeId', form);
  const moduleId = Form.useWatch('moduleId', form);
  const topicIds = Form.useWatch('topicIds', form) || [];

  const volumeOptions = useMemo(
    () => volumes.filter(volume => volumeBelongsToCourse(volume, courseId)).map(volume => ({ value: volume.id, label: volume.name })),
    [volumes, courseId]
  );

  const selectedVolume = useMemo(() => volumes.find(volume => sameId(volume.id, volumeId)), [volumes, volumeId]);
  const selectedLearningModule = useMemo(() => modules.find(module => sameId(module.id, moduleId)), [modules, moduleId]);
  const { actionLabel, canRestore, handleTitleChange, restoreSuggestedTitle } = useSuggestedResourceTitle({
    form,
    open,
    mode,
    resourceType: RESOURCE_TYPES.SUMMARY_SHEET_PDF,
    volume: selectedVolume,
    learningModule: selectedLearningModule
  });

  useEffect(() => {
    if (!open) return;
    setError('');
    setFile(null);
    setUploadPercent(0);
    setModules([]);
    setTopics([]);
    setConcepts([]);
    if (mode === 'edit' && sheet) {
      form.setFieldsValue({
        courseId: sheet.courseId,
        volumeId: sheet.volumeId,
        moduleId: sheet.moduleId,
        year: sheet.year || 2026,
        title: sheet.title,
        description: sheet.description || sheet.snapshot || '',
        keywords: sheet.keywords || [],
        status: sheet.status || 'DRAFT',
        topicIds: (sheet.topics || []).map(item => item.id),
        conceptIds: (sheet.concepts || []).map(item => item.id)
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        courseId: preselect?.courseId,
        volumeId: preselect?.volumeId,
        moduleId: preselect?.moduleId,
        year: preselect?.year || 2026,
        status: 'DRAFT',
        keywords: []
      });
    }
  }, [open, mode, sheet, preselect, form]);

  useEffect(() => {
    if (!open || !courseId || !volumeId) {
      setModules([]);
      setLoadingModules(false);
      setModuleError('');
      return undefined;
    }
    let cancelled = false;
    const request = moduleRequest.current + 1;
    moduleRequest.current = request;
    setModules([]);
    setModuleError('');
    setLoadingModules(true);
    api.get('/api/cms/modules', { params: { courseId, volumeId } })
      .then(res => {
        if (cancelled || request !== moduleRequest.current) return;
        const list = (res.data?.modules || []).filter(item => moduleBelongsTo(item, { courseId, volumeId }));
        setModules(list);
        if (mode === 'upload' && preselect?.moduleId) {
          form.setFieldValue('moduleId', list.some(item => sameId(item.id, preselect.moduleId)) ? preselect.moduleId : undefined);
        }
      })
      .catch(() => {
        if (!cancelled && request === moduleRequest.current) {
          setModules([]);
          setModuleError('Unable to load learning modules. Please retry.');
        }
      })
      .finally(() => {
        if (!cancelled && request === moduleRequest.current) setLoadingModules(false);
      });
    return () => { cancelled = true; };
  }, [open, courseId, volumeId, mode, preselect?.moduleId, form, modulesReloadKey]);

  useEffect(() => {
    if (!open || !moduleId) {
      setTopics([]);
      setConcepts([]);
      setLoadingTopics(false);
      setLoadingConcepts(false);
      setTopicsError('');
      setConceptsError('');
      return undefined;
    }
    let cancelled = false;
    const request = dependencyRequest.current + 1;
    dependencyRequest.current = request;
    setTopics([]);
    setConcepts([]);
    setTopicsError('');
    setConceptsError('');
    setLoadingTopics(true);
    setLoadingConcepts(true);
    Promise.allSettled([
      api.get('/api/cms/topics', { params: { moduleId } }),
      api.get('/api/cms/concepts', { params: { moduleId } })
    ]).then(([topicResult, conceptResult]) => {
      if (cancelled || request !== dependencyRequest.current) return;
      if (topicResult.status === 'fulfilled') setTopics(topicResult.value.data?.topics || []);
      else setTopicsError('Unable to load topics.');
      if (conceptResult.status === 'fulfilled') setConcepts(conceptResult.value.data?.concepts || []);
      else setConceptsError('Unable to load concepts.');
    }).finally(() => {
      if (!cancelled && request === dependencyRequest.current) {
        setLoadingTopics(false);
        setLoadingConcepts(false);
      }
    });
    return () => { cancelled = true; };
  }, [open, moduleId]);

  const moduleStatus = !courseId || !volumeId ? '' : loadingModules ? 'Loading learning modules...' : moduleError || (modules.length === 0 ? 'No learning modules found for this volume.' : '');
  const conceptOptions = concepts
    .filter(concept => topicIds.length === 0 || topicIds.some(id => sameId(id, concept.topicId)))
    .map(concept => ({ value: concept.id, label: concept.name }));

  const submit = async () => {
    setError('');
    let values;
    try { values = await form.validateFields(); } catch { return; }
    if (mode === 'upload' && !file) { setError('Select a PDF file.'); return; }
    setSaving(true);
    setUploadPercent(0);
    try {
      if (mode === 'upload') {
        const body = new FormData();
        body.append('file', file);
        body.append('courseId', values.courseId);
        body.append('volumeId', values.volumeId);
        body.append('moduleId', values.moduleId);
        body.append('title', values.title || '');
        body.append('description', values.description || '');
        body.append('keywords', JSON.stringify(values.keywords || []));
        body.append('year', String(values.year || 2026));
        body.append('topicIds', JSON.stringify(values.topicIds || []));
        body.append('conceptIds', JSON.stringify(values.conceptIds || []));
        await api.post('/api/summary-sheets/upload-pdf', body, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: event => {
            if (event.total) setUploadPercent(Math.round((event.loaded / event.total) * 100));
          }
        });
        message.success('PDF uploaded. Text indexing has started in the background.');
      } else {
        await api.put(`/api/summary-sheets/${sheet.id}/pdf-metadata`, {
          courseId: values.courseId,
          volumeId: values.volumeId,
          moduleId: values.moduleId,
          title: values.title,
          description: values.description || '',
          keywords: values.keywords || [],
          year: values.year,
          status: values.status,
          topicIds: values.topicIds || [],
          conceptIds: values.conceptIds || []
        });
        message.success('PDF summary details updated.');
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not save PDF summary sheet.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={() => { if (!saving) onClose?.(); }}
      width={Math.min(720, typeof window !== 'undefined' ? window.innerWidth * 0.96 : 720)}
      title={mode === 'upload' ? 'Upload PDF Summary Sheet' : 'Edit PDF Summary Sheet'}
      destroyOnClose
      extra={<Space><Button disabled={saving} onClick={() => onClose?.()}>Cancel</Button><Button type="primary" loading={saving} onClick={submit}>{mode === 'upload' ? 'Upload PDF' : 'Save Changes'}</Button></Space>}
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Form form={form} layout="vertical" requiredMark="optional">
        <Typography.Title level={5} style={{ marginTop: 0 }}>Academic Mapping</Typography.Title>
        <Form.Item name="courseId" label="Level / Course" rules={[{ required: true, message: 'Select a course' }]}>
          <Select showSearch optionFilterProp="label" placeholder="Select Course" options={courses.map(course => ({ value: course.id, label: `${course.name} (${LEVEL_LABELS[course.level] || course.level})` }))} onChange={() => form.setFieldsValue({ volumeId: undefined, moduleId: undefined, topicIds: [], conceptIds: [] })} />
        </Form.Item>
        <Form.Item name="volumeId" label="Volume" rules={[{ required: true, message: 'Select a volume' }]}>
          <Select showSearch optionFilterProp="label" disabled={!courseId} placeholder={courseId ? 'Select Volume' : 'Select a course first'} options={volumeOptions} onChange={() => form.setFieldsValue({ moduleId: undefined, topicIds: [], conceptIds: [] })} />
        </Form.Item>
        <Form.Item name="moduleId" label="Learning Module" rules={[{ required: true, message: 'Select a learning module' }]} extra={moduleStatus ? <Space size={4}><Typography.Text type={moduleError ? 'danger' : 'secondary'}>{moduleStatus}</Typography.Text>{moduleError && <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setModulesReloadKey(v => v + 1)}>Retry</Button>}</Space> : undefined}>
          <Select showSearch optionFilterProp="label" disabled={!volumeId} loading={loadingModules} placeholder={volumeId ? 'Select Learning Module' : 'Select a volume first'} options={modules.map(module => ({ value: module.id, label: module.name }))} onChange={() => form.setFieldsValue({ topicIds: [], conceptIds: [] })} />
        </Form.Item>
        <Form.Item name="topicIds" label="Topics (optional)" extra={topicsError ? <Typography.Text type="danger">{topicsError}</Typography.Text> : undefined}>
          <Select mode="multiple" allowClear showSearch optionFilterProp="label" disabled={!moduleId} loading={loadingTopics} options={topics.map(topic => ({ value: topic.id, label: topic.name }))} placeholder="Select existing topics" onChange={selected => {
            const allowed = new Set(concepts.filter(concept => selected.length === 0 || selected.some(id => sameId(id, concept.topicId))).map(concept => concept.id));
            form.setFieldValue('conceptIds', (form.getFieldValue('conceptIds') || []).filter(id => allowed.has(id)));
          }} />
        </Form.Item>
        <Form.Item name="conceptIds" label="Concepts (optional)" extra={conceptsError ? <Typography.Text type="danger">{conceptsError}</Typography.Text> : undefined}>
          <Select mode="multiple" allowClear showSearch optionFilterProp="label" disabled={!moduleId} loading={loadingConcepts} options={conceptOptions} placeholder="Select existing concepts" />
        </Form.Item>
        <Form.Item name="year" label="Curriculum Year" rules={[{ required: true }]}><InputNumber min={2020} max={2040} style={{ width: '100%' }} /></Form.Item>

        <Typography.Title level={5}>Summary Details</Typography.Title>
        <Form.Item name="title" label="Summary Sheet Title" rules={[{ required: true, message: 'Enter a title' }]} extra={canRestore ? <Button type="link" size="small" style={{ padding: 0 }} onClick={restoreSuggestedTitle}>{actionLabel}</Button> : undefined}><Input maxLength={300} showCount onChange={handleTitleChange} /></Form.Item>
        <Form.Item name="description" label="Description"><TextArea rows={3} maxLength={10000} showCount /></Form.Item>
        <Form.Item name="keywords" label="Keywords / Tags"><Select mode="tags" tokenSeparators={[',', ';']} placeholder="Type a keyword and press Enter" /></Form.Item>

        {mode === 'upload' && (
          <Form.Item label="PDF File" required>
            <Dragger accept=".pdf" maxCount={1} beforeUpload={selected => {
              if (!/\.pdf$/i.test(selected.name)) { message.error('Only PDF files are accepted.'); return Upload.LIST_IGNORE; }
              if (selected.size > 250 * 1024 * 1024) { message.error('PDF must be 250 MB or smaller.'); return Upload.LIST_IGNORE; }
              setFile(selected);
              return false;
            }} onRemove={() => setFile(null)} fileList={file ? [{ uid: file.uid || 'pdf', name: file.name, status: 'done', size: file.size }] : []}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Drag & drop a PDF here, or click to browse</p>
              <p className="ant-upload-hint">The original PDF is stored unchanged. Text indexing starts after upload.</p>
            </Dragger>
            {saving && uploadPercent > 0 && uploadPercent < 100 && <Progress percent={uploadPercent} size="small" style={{ marginTop: 10 }} />}
          </Form.Item>
        )}
        <Form.Item name="status" label="Publication Status" extra="Only fully indexed PDFs become visible to students. Uploaded PDFs start as drafts.">
          <Radio.Group><Radio value="DRAFT">Draft</Radio><Radio value="PUBLISHED">Published</Radio></Radio.Group>
        </Form.Item>
      </Form>
    </Drawer>
  );
}
