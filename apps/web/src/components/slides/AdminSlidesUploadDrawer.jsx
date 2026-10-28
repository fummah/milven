import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Drawer, Form, Input, Select, Radio, Button, Upload, Progress, Space, Typography, Alert, message
} from 'antd';
import { InboxOutlined, FilePptOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { moduleBelongsTo, sameId, volumeBelongsToCourse } from '../../lib/slideUrls';

const { TextArea } = Input;
const { Dragger } = Upload;

const LEVEL_OPTIONS = [
  { value: 'LEVEL1', label: 'Level I' },
  { value: 'LEVEL2', label: 'Level II' },
  { value: 'LEVEL3', label: 'Level III' },
  { value: 'NONE', label: 'None' }
];

export default function AdminSlidesUploadDrawer({
  open,
  mode = 'upload',
  presentation = null,
  preselect = null,
  courses = [],
  allVolumes = [],
  onClose,
  onSaved
}) {
  const [form] = Form.useForm();
  const [file, setFile] = useState(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [modules, setModules] = useState([]);
  const [topics, setTopics] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [moduleError, setModuleError] = useState('');
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topicsError, setTopicsError] = useState('');
  const [loadingConcepts, setLoadingConcepts] = useState(false);
  const [conceptsError, setConceptsError] = useState('');
  const [modulesReloadKey, setModulesReloadKey] = useState(0);
  const modulesRequestRef = useRef(0);
  const dependenciesRequestRef = useRef(0);

  const courseId = Form.useWatch('courseId', form);
  const volumeId = Form.useWatch('volumeId', form);
  const moduleId = Form.useWatch('moduleId', form);
  const scope = Form.useWatch('scope', form);
  const selectedTopicIds = Form.useWatch('topicIds', form) || [];

  const volumeOptions = useMemo(() => {
    const list = courseId
      ? allVolumes.filter(v => volumeBelongsToCourse(v, courseId))
      : allVolumes;
    return list.map(v => ({ value: v.id, label: v.name }));
  }, [allVolumes, courseId]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setFile(null);
    setUploadPercent(0);
    setModules([]);
    setTopics([]);
    setConcepts([]);

    if (mode === 'edit' && presentation) {
      form.setFieldsValue({
        courseId: presentation.courseId,
        volumeId: presentation.volumeId,
        moduleId: presentation.moduleId || undefined,
        scope: presentation.scope || 'LEARNING_MODULE',
        year: presentation.year,
        title: presentation.title,
        description: presentation.description || '',
        tags: presentation.tags || [],
        status: presentation.status,
        topicIds: (presentation.topics || []).map(t => t.id),
        conceptIds: (presentation.concepts || []).map(c => c.id)
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        scope: preselect?.scope || 'LEARNING_MODULE',
        courseId: preselect?.courseId,
        volumeId: preselect?.volumeId,
        moduleId: preselect?.moduleId,
        year: preselect?.year || 2027,
        status: 'DRAFT',
        tags: []
      });
    }
  }, [open, mode, presentation, preselect, form]);

  useEffect(() => {
    if (!open || !courseId || !volumeId) {
      setModules([]);
      setLoadingModules(false);
      setModuleError('');
      return;
    }
    let cancelled = false;
    const requestId = modulesRequestRef.current + 1;
    modulesRequestRef.current = requestId;
    setModules([]);
    setModuleError('');
    setLoadingModules(true);
    api.get('/api/cms/modules', { params: { courseId, volumeId } })
      .then(res => {
        if (cancelled || requestId !== modulesRequestRef.current) return;
        // The API filters by both keys; this guard also protects against any
        // cached/misconfigured response and enforces exact ID relationships.
        const list = (res.data?.modules || []).filter(module => moduleBelongsTo(module, { courseId, volumeId }));
        setModules(list);
        if (mode === 'upload' && preselect?.moduleId) {
          const stillValid = list.some(module => sameId(module.id, preselect.moduleId));
          form.setFieldValue('moduleId', stillValid ? preselect.moduleId : undefined);
        }
      })
      .catch(() => {
        if (cancelled || requestId !== modulesRequestRef.current) return;
        setModules([]);
        setModuleError('Unable to load learning modules. Please retry.');
      })
      .finally(() => {
        if (cancelled || requestId !== modulesRequestRef.current) return;
        setLoadingModules(false);
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
      return;
    }
    let cancelled = false;
    const requestId = dependenciesRequestRef.current + 1;
    dependenciesRequestRef.current = requestId;
    setTopics([]);
    setConcepts([]);
    setTopicsError('');
    setConceptsError('');
    setLoadingTopics(true);
    setLoadingConcepts(true);
    Promise.allSettled([
      api.get('/api/cms/topics', { params: { moduleId } }),
      api.get('/api/cms/concepts', { params: { moduleId } })
    ]).then(([topicsResult, conceptsResult]) => {
      if (cancelled || requestId !== dependenciesRequestRef.current) return;
      if (topicsResult.status === 'fulfilled') {
        setTopics(topicsResult.value.data?.topics || []);
      } else {
        setTopics([]);
        setTopicsError('Unable to load topics. Please retry.');
      }
      if (conceptsResult.status === 'fulfilled') {
        setConcepts(conceptsResult.value.data?.concepts || []);
      } else {
        setConcepts([]);
        setConceptsError('Unable to load concepts. Please retry.');
      }
    }).finally(() => {
      if (cancelled || requestId !== dependenciesRequestRef.current) return;
      setLoadingTopics(false);
      setLoadingConcepts(false);
    });
    return () => { cancelled = true; };
  }, [open, moduleId]);

  const topicOptions = topics.map(t => ({ value: t.id, label: t.name }));
  const conceptOptions = concepts
    .filter(c => selectedTopicIds.length === 0 || selectedTopicIds.some(id => sameId(id, c.topicId)))
    .map(c => ({ value: c.id, label: c.name }));

  const moduleStatusText = (() => {
    if (!courseId || !volumeId) return '';
    if (loadingModules) return 'Loading learning modules...';
    if (moduleError) return moduleError;
    if (modules.length === 0) return 'No learning modules found for this volume.';
    return '';
  })();

  const retryModules = () => setModulesReloadKey(key => key + 1);

  const handleClose = () => {
    if (saving) return;
    onClose?.();
  };

  const handleSave = async () => {
    setError('');
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (mode === 'upload' && !file) {
      setError('Select a .pptx file to upload.');
      return;
    }

    setSaving(true);
    setUploadPercent(0);
    try {
      if (mode === 'upload') {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('courseId', values.courseId);
        fd.append('volumeId', values.volumeId);
        fd.append('scope', values.scope);
        if (values.moduleId) fd.append('moduleId', values.moduleId);
        fd.append('year', String(values.year || 2027));
        fd.append('title', values.title || '');
        fd.append('description', values.description || '');
        fd.append('status', values.status || 'DRAFT');
        fd.append('tags', JSON.stringify(values.tags || []));
        fd.append('topicIds', JSON.stringify(values.topicIds || []));
        fd.append('conceptIds', JSON.stringify(values.conceptIds || []));
        await api.post('/api/slides/admin/presentations', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (event) => {
            if (!event.total) return;
            setUploadPercent(Math.round((event.loaded / event.total) * 100));
          }
        });
        message.success('Presentation uploaded. Processing has started.');
      } else {
        await api.put(`/api/slides/admin/presentations/${presentation.id}`, {
          courseId: values.courseId,
          volumeId: values.volumeId,
          scope: values.scope,
          moduleId: values.scope === 'WHOLE_VOLUME' ? null : values.moduleId,
          year: values.year,
          title: values.title,
          description: values.description,
          tags: values.tags || [],
          status: values.status,
          topicIds: values.topicIds || [],
          conceptIds: values.conceptIds || []
        });
        message.success('Presentation details updated.');
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not save presentation.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      width={Math.min(720, typeof window !== 'undefined' ? window.innerWidth * 0.96 : 720)}
      title={mode === 'upload' ? 'Upload Presentation' : 'Edit Presentation Details'}
      destroyOnClose
      extra={(
        <Space>
          <Button onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>
            {mode === 'upload' ? 'Upload Presentation' : 'Save Changes'}
          </Button>
        </Space>
      )}
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      <Form form={form} layout="vertical" requiredMark="optional">
        <Typography.Title level={5} style={{ marginTop: 0 }}>Academic Mapping</Typography.Title>
        <Form.Item name="scope" label="Presentation Scope" rules={[{ required: true }]}>
          <Radio.Group optionType="button" buttonStyle="solid">
            <Radio.Button value="LEARNING_MODULE">Learning Module</Radio.Button>
            <Radio.Button value="WHOLE_VOLUME">Whole Volume Review</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item name="courseId" label="Level / Course" rules={[{ required: true, message: 'Select a course' }]}>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Select Course"
            options={courses.map(c => ({ value: c.id, label: `${c.name} (${LEVEL_OPTIONS.find(l => l.value === c.level)?.label || c.level || ''})` }))}
            onChange={() => {
              form.setFieldsValue({ volumeId: undefined, moduleId: undefined, topicIds: [], conceptIds: [] });
              setModules([]);
              setTopics([]);
              setConcepts([]);
              setModuleError('');
            }}
          />
        </Form.Item>

        <Form.Item name="volumeId" label="Volume" rules={[{ required: true, message: 'Select a volume' }]}>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={courseId ? 'Select Volume' : 'Select a course first'}
            disabled={!courseId}
            options={volumeOptions}
            onChange={() => {
              form.setFieldsValue({ moduleId: undefined, topicIds: [], conceptIds: [] });
              setModules([]);
              setTopics([]);
              setConcepts([]);
              setModuleError('');
            }}
          />
        </Form.Item>

        {scope !== 'WHOLE_VOLUME' && (
          <Form.Item
            name="moduleId"
            label="Learning Module"
            rules={[{ required: true, message: 'Select a Learning Module' }]}
            extra={moduleStatusText ? (
              <Space size={4}>
                <Typography.Text type={moduleError ? 'danger' : 'secondary'}>{moduleStatusText}</Typography.Text>
                {moduleError && <Button type="link" size="small" style={{ padding: 0 }} onClick={retryModules}>Retry</Button>}
              </Space>
            ) : undefined}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={volumeId ? 'Select Learning Module' : 'Select a volume first'}
              disabled={!volumeId}
              loading={loadingModules}
              notFoundContent={moduleStatusText || 'No learning modules found for this volume.'}
              options={modules.map(m => ({ value: m.id, label: m.name }))}
              onChange={() => {
                form.setFieldsValue({ topicIds: [], conceptIds: [] });
                setTopics([]);
                setConcepts([]);
              }}
            />
          </Form.Item>
        )}

        {scope !== 'WHOLE_VOLUME' && (
          <>
            <Form.Item name="topicIds" label="Topics (optional, multiple)" extra={topicsError ? <Typography.Text type="danger">{topicsError}</Typography.Text> : undefined}>
              <Select
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="label"
                disabled={!moduleId}
                loading={loadingTopics}
                placeholder="Select topics"
                options={topicOptions}
                notFoundContent={loadingTopics ? 'Loading topics...' : (moduleId ? 'No topics found for this module.' : 'Select a module first.')}
                onChange={(selectedTopics) => {
                  const allowedConcepts = new Set(
                    concepts
                      .filter(concept => selectedTopics.length === 0 || selectedTopics.some(id => sameId(id, concept.topicId)))
                      .map(concept => concept.id)
                  );
                  const currentConcepts = form.getFieldValue('conceptIds') || [];
                  form.setFieldValue('conceptIds', currentConcepts.filter(id => allowedConcepts.has(id)));
                }}
              />
            </Form.Item>
            <Form.Item name="conceptIds" label="Concepts (optional, multiple)" extra={conceptsError ? <Typography.Text type="danger">{conceptsError}</Typography.Text> : undefined}>
              <Select
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="label"
                disabled={!moduleId}
                loading={loadingConcepts}
                placeholder="Select concepts"
                options={conceptOptions}
                notFoundContent={loadingConcepts ? 'Loading concepts...' : (moduleId ? 'No concepts found for the selected topics.' : 'Select a module first.')}
              />
            </Form.Item>
          </>
        )}

        <Form.Item name="year" label="Curriculum Year" rules={[{ required: true, message: 'Enter a year' }]}>
          <Input type="number" min={2000} max={2100} />
        </Form.Item>

        <Typography.Title level={5}>Presentation Details</Typography.Title>
        <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Enter a title' }]}>
          <Input placeholder="e.g. Bond Valuation — Prices and Yields" maxLength={300} showCount />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <TextArea rows={3} maxLength={10000} showCount placeholder="Short description shown to students" />
        </Form.Item>
        <Form.Item name="tags" label="Tags / Keywords">
          <Select mode="tags" tokenSeparators={[',', ';']} placeholder="Type a tag and press Enter" />
        </Form.Item>

        {mode === 'upload' && (
          <Form.Item label="PowerPoint File" required>
            <Dragger
              accept=".pptx"
              maxCount={1}
              beforeUpload={(selected) => {
                if (!/\.pptx$/i.test(selected.name)) {
                  message.error('Only .pptx files are supported.');
                  return Upload.LIST_IGNORE;
                }
                if (selected.size > 500 * 1024 * 1024) {
                  message.error('The PowerPoint file must be 500 MB or smaller.');
                  return Upload.LIST_IGNORE;
                }
                setFile(selected);
                return false;
              }}
              onRemove={() => setFile(null)}
              fileList={file ? [{
                uid: file.uid || 'selected',
                name: file.name,
                status: 'done',
                size: file.size
              }] : []}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Drag & drop a .pptx file here, or click to browse</p>
              <p className="ant-upload-hint">The original PowerPoint is preserved. Slide previews and search text are generated in the background.</p>
            </Dragger>
            {saving && uploadPercent > 0 && uploadPercent < 100 && (
              <Progress percent={uploadPercent} size="small" style={{ marginTop: 10 }} />
            )}
          </Form.Item>
        )}

        <Form.Item name="status" label="Publication Status" extra="Only successfully processed presentations become visible to students.">
          <Radio.Group>
            <Radio value="DRAFT">Draft</Radio>
            <Radio value="PUBLISHED">Published</Radio>
          </Radio.Group>
        </Form.Item>

        {mode === 'edit' && (
          <Alert
            type="info"
            showIcon
            icon={<FilePptOutlined />}
            message="To replace the PowerPoint file, use Replace PowerPoint from the presentation menu. The presentation ID and academic mapping are retained."
          />
        )}
      </Form>
    </Drawer>
  );
}
