import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, Steps, Button, Upload, Select, InputNumber, Table, Tag, Space, Alert, Typography,
  Statistic, Row, Col, Progress, Switch, Empty, message
} from 'antd';
import { InboxOutlined, ReloadOutlined, FileZipOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { levelLabel, moduleBelongsTo, volumeBelongsToCourse } from '../../lib/slideUrls';

const { Dragger } = Upload;
const { Text } = Typography;

const MATCH_LABELS = {
  TITLE: { color: 'success', label: 'Matched (title)' },
  NUMBER: { color: 'processing', label: 'Matched (number)' },
  VOLUME_REVIEW: { color: 'cyan', label: 'Whole volume review' },
  FUZZY: { color: 'warning', label: 'Review required' },
  NONE: { color: 'error', label: 'No match' }
};

const STATUS_COLORS = {
  READY: 'success',
  PROCESSING: 'processing',
  PENDING: 'default',
  FAILED: 'error'
};

export default function AdminSlidesZipWizard({ open, courses = [], allVolumes = [], onClose, onImported }) {
  const [step, setStep] = useState(0);
  const [zipFile, setZipFile] = useState(null);
  const [courseId, setCourseId] = useState(undefined);
  const [volumeId, setVolumeId] = useState(undefined);
  const [year, setYear] = useState(2027);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [batch, setBatch] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [modules, setModules] = useState([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [modulesError, setModulesError] = useState('');
  const [modulesReloadKey, setModulesReloadKey] = useState(0);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const [polling, setPolling] = useState(false);
  const pollTimer = useRef(null);
  const pollSequence = useRef(0);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setZipFile(null);
    setCourseId(undefined);
    setVolumeId(undefined);
    setYear(2027);
    setError('');
    setAnalysis(null);
    setBatch(null);
    setMappings([]);
    setResults(null);
    setUploadPercent(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setModulesLoading(true);
    setModulesError('');
    api.get('/api/cms/modules')
      .then(res => setModules(res.data?.modules || []))
      .catch(() => { setModules([]); setModulesError('Unable to load learning modules. Please retry.'); })
      .finally(() => setModulesLoading(false));
  }, [open, modulesReloadKey]);

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollSequence.current += 1;
  }, []);

  useEffect(() => {
    if (!open) {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      pollTimer.current = null;
      pollSequence.current += 1;
      setPolling(false);
    }
  }, [open]);

  const volumeOptions = useMemo(() => {
    const list = courseId
      ? allVolumes.filter(v => volumeBelongsToCourse(v, courseId))
      : allVolumes;
    return list.map(v => ({ value: v.id, label: v.name }));
  }, [allVolumes, courseId]);

  const modulesFor = (mapping) => modules.filter(m => moduleBelongsTo(m, { courseId: mapping.courseId, volumeId: mapping.volumeId }));

  const handleAnalyze = async () => {
    setError('');
    if (!zipFile) {
      setError('Select a .zip archive first.');
      return;
    }
    const fd = new FormData();
    fd.append('file', zipFile);
    if (courseId) fd.append('courseId', courseId);
    if (volumeId) fd.append('volumeId', volumeId);
    fd.append('year', String(year || 2027));

    setUploading(true);
    setUploadPercent(0);
    try {
      const { data } = await api.post('/api/slides/admin/zip/analyze', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (!event.total) return;
          setUploadPercent(Math.round((event.loaded / event.total) * 100));
        }
      });
      setAnalysis(data.analysis);
      setBatch(data.batch);
      setMappings((data.analysis?.entries || []).map(entry => ({
        ...entry,
        courseId: entry.suggestedCourseId || undefined,
        volumeId: entry.suggestedVolumeId || undefined,
        moduleId: entry.suggestedModuleId || undefined,
        scope: entry.isWholeVolume ? 'WHOLE_VOLUME' : 'LEARNING_MODULE',
        title: entry.detectedTitle || entry.fileName,
        include: !entry.duplicate && ['TITLE', 'NUMBER', 'VOLUME_REVIEW'].includes(entry.matchType)
      })));
      setStep(1);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not analyse the ZIP archive.');
    } finally {
      setUploading(false);
    }
  };

  const updateMapping = (index, patch) => {
    setMappings(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const handleImport = async () => {
    if (!batch) return;
    const selected = mappings.filter(m => m.include);
    if (!selected.length) {
      setError('Select at least one presentation to import.');
      return;
    }
    setError('');
    setImporting(true);
    try {
      const payload = {
        mappings: mappings.map(m => ({
          zipPath: m.zipPath,
          fileName: m.fileName,
          include: Boolean(m.include),
          courseId: m.courseId,
          volumeId: m.volumeId,
          moduleId: m.scope === 'WHOLE_VOLUME' ? null : m.moduleId,
          scope: m.scope,
          year: m.year,
          title: m.title,
          detectedTitle: m.detectedTitle,
          tags: m.tags || []
        }))
      };
      const { data } = await api.post(`/api/slides/admin/zip/${batch.id}/import`, payload);
      setBatch(data.batch);
      setResults(data);
      setStep(2);
      onImported?.();
      startPolling(data.batch.id);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const startPolling = (batchId) => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    const sequence = pollSequence.current + 1;
    pollSequence.current = sequence;
    setPolling(true);
    let delay = 5000;

    const schedule = () => {
      if (pollSequence.current !== sequence) return;
      pollTimer.current = setTimeout(load, delay);
    };

    const load = async () => {
      if (pollSequence.current !== sequence) return;
      try {
        const { data } = await api.get(`/api/slides/admin/batches/${batchId}`);
        if (pollSequence.current !== sequence) return;
        setBatch(data.batch);
        if (['COMPLETED', 'FAILED'].includes(data.batch?.status)) {
          setPolling(false);
          pollTimer.current = null;
          onImported?.();
          return;
        }
        delay = 5000;
      } catch (err) {
        if (pollSequence.current !== sequence) return;
        const retryAfter = Number(err?.response?.headers?.['retry-after']) || 0;
        delay = Math.min(60000, Math.max(15000, delay * 2, retryAfter * 1000));
      }
      schedule();
    };

    load();
  };

  const retryFailed = async () => {
    if (!batch) return;
    try {
      const { data } = await api.post(`/api/slides/admin/batches/${batch.id}/retry`);
      message.success(`Retrying ${data.retried || 0} failed presentation(s).`);
      startPolling(batch.id);
    } catch (err) {
      message.error(err?.response?.data?.error || 'Could not retry failed presentations.');
    }
  };

  const columns = [
    {
      title: 'File',
      dataIndex: 'fileName',
      width: 260,
      ellipsis: true,
      render: (value, row) => (
        <Space direction="vertical" size={0}>
          <Text strong ellipsis style={{ maxWidth: 240 }} title={value}>{value}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{(row.size / 1024 / 1024).toFixed(1)} MB</Text>
        </Space>
      )
    },
    {
      title: 'Level',
      width: 150,
      render: (_, row) => (
        <Select
          size="small"
          style={{ width: 130 }}
          value={row.courseId}
          placeholder={row.detectedLevel ? levelLabel(row.detectedLevel) : 'Select'}
          options={courses.map(c => ({ value: c.id, label: `${c.name} (${levelLabel(c.level)})` }))}
          onChange={(value) => updateMapping(mappings.indexOf(row), { courseId: value, volumeId: undefined, moduleId: undefined })}
          showSearch
          optionFilterProp="label"
        />
      )
    },
    {
      title: 'Volume',
      width: 190,
      render: (_, row) => {
        const list = allVolumes
          .filter(v => !row.courseId || volumeBelongsToCourse(v, row.courseId))
          .map(v => ({ value: v.id, label: v.name }));
        return (
          <Select
            size="small"
            style={{ width: 170 }}
            value={row.volumeId}
            disabled={!row.courseId}
            placeholder={row.courseId ? (row.detectedVolumeName || 'Select volume') : 'Select Level first'}
            options={list}
            onChange={(value) => updateMapping(mappings.indexOf(row), { volumeId: value, moduleId: undefined })}
            showSearch
            optionFilterProp="label"
          />
        );
      }
    },
    {
      title: 'Learning Module',
      width: 280,
      render: (_, row) => {
        const moduleOptions = modulesFor(row).map(m => ({ value: m.id, label: m.name }));
        const emptyText = modulesLoading
          ? 'Loading learning modules...'
          : modulesError
            ? 'Unable to load learning modules. Please retry.'
            : (row.volumeId ? 'No learning modules found for this volume.' : 'Select a volume first.');
        return (
          <Select
            size="small"
            style={{ width: 260 }}
            value={row.scope === 'WHOLE_VOLUME' ? '__volume_review__' : row.moduleId}
            disabled={!row.volumeId}
            placeholder={row.scope === 'WHOLE_VOLUME' ? 'Whole Volume Review' : 'Select Learning Module'}
            loading={modulesLoading}
            notFoundContent={emptyText}
            options={[
              ...(row.scope === 'WHOLE_VOLUME' ? [{ value: '__volume_review__', label: 'Whole Volume Review' }] : []),
              ...moduleOptions
            ]}
            onChange={(value) => updateMapping(mappings.indexOf(row), { moduleId: value === '__volume_review__' ? null : value })}
            showSearch
            optionFilterProp="label"
          />
        );
      }
    },
    {
      title: 'Match',
      dataIndex: 'matchType',
      width: 160,
      render: (value, row) => {
        const meta = MATCH_LABELS[value] || MATCH_LABELS.NONE;
        return (
          <Space direction="vertical" size={2}>
            <Tag color={meta.color}>{meta.label}</Tag>
            {row.duplicate && <Tag color="volcano">Duplicate</Tag>}
            {row.confidence > 0 && <Text type="secondary" style={{ fontSize: 11 }}>{Math.round(row.confidence * 100)}% confidence</Text>}
          </Space>
        );
      }
    },
    {
      title: 'Action',
      width: 110,
      fixed: 'right',
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <Switch
            checked={Boolean(row.include)}
            onChange={(checked) => updateMapping(mappings.indexOf(row), { include: checked })}
            checkedChildren="Import"
            unCheckedChildren="Skip"
          />
          {row.matchType === 'FUZZY' && !row.include && <Text type="warning" style={{ fontSize: 11 }}>Confirm mapping</Text>}
          {row.duplicate && <Text type="secondary" style={{ fontSize: 11 }}>Skipped by default</Text>}
        </Space>
      )
    }
  ];

  const resultColumns = [
    { title: 'Presentation', dataIndex: 'title', ellipsis: true },
    { title: 'Original file', dataIndex: 'originalFilename', ellipsis: true, responsive: ['md'] },
    {
      title: 'Processing',
      dataIndex: 'processingStatus',
      width: 140,
      render: (value) => <Tag color={STATUS_COLORS[value] || 'default'}>{value}</Tag>
    },
    { title: 'Slides', dataIndex: 'slideCount', width: 80 },
    {
      title: 'Error',
      dataIndex: 'processingError',
      width: 220,
      render: (value) => value ? <Text type="danger" ellipsis={{ tooltip: value }} style={{ maxWidth: 200 }}>{value}</Text> : '—'
    }
  ];

  const summary = analysis ? {
    detected: analysis.detectedFiles,
    matched: analysis.matched,
    unmatched: analysis.unmatched,
    duplicates: analysis.duplicates
  } : null;

  const includeCount = mappings.filter(m => m.include).length;
  const processing = batch?.presentations || [];
  const readyCount = processing.filter(p => p.processingStatus === 'READY').length;
  const failedCount = processing.filter(p => p.processingStatus === 'FAILED').length;
  const pendingCount = processing.filter(p => ['PENDING', 'PROCESSING'].includes(p.processingStatus)).length;

  return (
    <Modal
      open={open}
      onCancel={() => { if (!uploading && !importing) onClose?.(); }}
      footer={null}
      width={Math.min(1200, typeof window !== 'undefined' ? window.innerWidth * 0.97 : 1200)}
      title={<Space><FileZipOutlined /> Bulk Upload PowerPoint ZIP</Space>}
      destroyOnClose
      maskClosable={!uploading && !importing}
    >
      <Steps
        current={step}
        size="small"
        style={{ marginBottom: 20 }}
        items={[{ title: 'Upload ZIP' }, { title: 'Confirm Mapping' }, { title: 'Processing & Results' }]}
      />

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} closable onClose={() => setError('')} />}

      {step === 0 && (
        <div>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={8}>
              <Text strong>Course (optional)</Text>
              <Select
                style={{ width: '100%', marginTop: 6 }}
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Auto-detect from archive"
                value={courseId}
                onChange={(value) => { setCourseId(value); setVolumeId(undefined); }}
                options={courses.map(c => ({ value: c.id, label: `${c.name} (${levelLabel(c.level)})` }))}
              />
            </Col>
            <Col xs={24} md={8}>
              <Text strong>Volume (optional)</Text>
              <Select
                style={{ width: '100%', marginTop: 6 }}
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Auto-detect from archive"
                value={volumeId}
                disabled={!courseId}
                onChange={setVolumeId}
                options={volumeOptions}
              />
            </Col>
            <Col xs={24} md={8}>
              <Text strong>Curriculum Year</Text>
              <InputNumber style={{ width: '100%', marginTop: 6 }} min={2000} max={2100} value={year} onChange={setYear} />
            </Col>
          </Row>

          <Dragger
            accept=".zip"
            maxCount={1}
            fileList={zipFile ? [{ uid: zipFile.uid || 'zip', name: zipFile.name, status: 'done', size: zipFile.size }] : []}
            beforeUpload={(file) => {
              if (!/\.zip$/i.test(file.name)) {
                message.error('Only .zip archives are supported.');
                return Upload.LIST_IGNORE;
              }
              setZipFile(file);
              return false;
            }}
            onRemove={() => setZipFile(null)}
            disabled={uploading}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Drag & drop a ZIP archive containing .pptx presentations</p>
            <p className="ant-upload-hint">
              Files are inspected before import. The archive is retained so failed presentations can be retried without uploading again.
            </p>
          </Dragger>
          {uploading && (
            <Progress percent={uploadPercent} size="small" style={{ marginTop: 12 }} status="active" />
          )}
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" size="large" loading={uploading} onClick={handleAnalyze} disabled={!zipFile}>
              Analyse Archive
            </Button>
          </div>
        </div>
      )}

      {step === 1 && summary && (
        <div>
          <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
            <Col xs={12} md={6}><Statistic title="Detected files" value={summary.detected} /></Col>
            <Col xs={12} md={6}><Statistic title="Matched" value={summary.matched} valueStyle={{ color: '#16a34a' }} /></Col>
            <Col xs={12} md={6}><Statistic title="Needs review" value={summary.unmatched} valueStyle={{ color: '#dc2626' }} /></Col>
            <Col xs={12} md={6}><Statistic title="Duplicates" value={summary.duplicates} valueStyle={{ color: '#ea580c' }} /></Col>
          </Row>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 14 }}
            message={`${includeCount} of ${mappings.length} presentations will be imported. Confirm or correct every uncertain mapping before importing.`}
          />
          {modulesError && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 14 }}
              message="Unable to load learning modules. Please retry."
              action={<Button size="small" onClick={() => setModulesReloadKey(key => key + 1)}>Retry</Button>}
            />
          )}
          <Table
            rowKey="zipPath"
            dataSource={mappings}
            columns={columns}
            size="small"
            pagination={{ pageSize: 12, showSizeChanger: false }}
            scroll={{ x: 1120 }}
            locale={{ emptyText: <Empty description="No PowerPoint files were found in this archive." /> }}
          />
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <Button onClick={() => setStep(0)}>Back</Button>
            <Space>
              <Button onClick={() => setMappings(prev => prev.map(row => ({ ...row, include: !row.duplicate && row.matchType !== 'NONE' })))}>
                Confirm all matched
              </Button>
              <Button type="primary" size="large" loading={importing} onClick={handleImport} disabled={includeCount === 0}>
                Import {includeCount} Presentation{includeCount === 1 ? '' : 's'}
              </Button>
            </Space>
          </div>
        </div>
      )}

      {step === 2 && batch && (
        <div>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={4}><Statistic title="Detected" value={batch.totalFiles} /></Col>
            <Col xs={12} md={4}><Statistic title="Imported" value={batch.imported} /></Col>
            <Col xs={12} md={4}><Statistic title="Skipped" value={batch.skipped} /></Col>
            <Col xs={12} md={4}><Statistic title="Failed" value={failedCount || batch.failed} valueStyle={{ color: failedCount ? '#dc2626' : undefined }} /></Col>
            <Col xs={12} md={4}><Statistic title="Slides" value={batch.totalSlides || processing.reduce((sum, p) => sum + (p.slideCount || 0), 0)} /></Col>
            <Col xs={12} md={4}><Statistic title="Status" value={batch.status} valueStyle={{ fontSize: 18 }} /></Col>
          </Row>

          {(polling || pendingCount > 0) && (
            <Alert
              type="info"
              showIcon
              message="Processing presentations in the background"
              description={`${readyCount} ready · ${pendingCount} processing · ${failedCount} failed. You can close this window; processing continues on the server.`}
              style={{ marginBottom: 14 }}
            />
          )}
          {!polling && pendingCount === 0 && failedCount === 0 && (
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              message="Import complete"
              description={`${readyCount} presentation(s) processed successfully and indexed for slide search.`}
              style={{ marginBottom: 14 }}
            />
          )}
          {!polling && failedCount > 0 && (
            <Alert
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              message={`${failedCount} presentation(s) failed to process`}
              description="Failed presentations are not visible to students. Retry them below; the original ZIP does not need to be uploaded again."
              action={<Button size="small" icon={<ReloadOutlined />} onClick={retryFailed}>Retry failed</Button>}
              style={{ marginBottom: 14 }}
            />
          )}

          <Table
            rowKey="id"
            dataSource={processing}
            columns={resultColumns}
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 800 }}
            locale={{ emptyText: <Empty description="No presentation records yet." /> }}
          />
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <Button icon={<ReloadOutlined />} onClick={() => batch?.id && startPolling(batch.id)} loading={polling}>Refresh</Button>
            <Space>
              <Button onClick={() => { onImported?.(); onClose?.(); }}>Close</Button>
              <Button
                type="primary"
                onClick={() => {
                  if (pollTimer.current) clearTimeout(pollTimer.current);
                  pollSequence.current += 1;
                  setPolling(false);
                  setStep(0);
                  setZipFile(null);
                  setAnalysis(null);
                  setBatch(null);
                  setMappings([]);
                  setResults(null);
                }}
              >
                Import another ZIP
              </Button>
            </Space>
          </div>
        </div>
      )}
    </Modal>
  );
}
