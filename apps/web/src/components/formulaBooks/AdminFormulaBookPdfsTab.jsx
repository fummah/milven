import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Col, Empty, Input, Modal, Row, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import { DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined, FilePdfOutlined, ReloadOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { levelLabel, volumeBelongsToCourse } from '../../lib/slideUrls';
import AdminFormulaBookPdfDrawer from './AdminFormulaBookPdfDrawer';

const { Text } = Typography;

export default function AdminFormulaBookPdfsTab({ courses = [], volumes = [] }) {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState(undefined);
  const [volumeId, setVolumeId] = useState(undefined);
  const [year, setYear] = useState(undefined);
  const [status, setStatus] = useState(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [replaceTarget, setReplaceTarget] = useState(null);
  const replaceInputRef = useRef(null);

  const volumeOptions = useMemo(
    () => volumes.filter(volume => volumeBelongsToCourse(volume, courseId)).map(volume => ({ value: volume.id, label: volume.name })),
    [volumes, courseId]
  );

  const fetchBooks = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = { page, limit: pageSize };
      if (search.trim()) params.q = search.trim();
      if (courseId) params.courseId = courseId;
      if (volumeId) params.volumeId = volumeId;
      if (year) params.year = year;
      if (status) params.status = status;
      const { data } = await api.get('/api/formula-books/admin', { params });
      setBooks(data.books || []);
      setTotal(data.total || 0);
    } catch {
      if (!silent) message.error('Failed to load PDF Formula Books');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, pageSize, search, courseId, volumeId, year, status]);

  useEffect(() => { fetchBooks(); }, [fetchBooks]);

  const hasIndexing = books.some(book => ['UPLOADED', 'INDEXING'].includes(book.processingStatus));
  useEffect(() => {
    if (!hasIndexing) return undefined;
    const timer = setTimeout(() => fetchBooks(true), 6000);
    return () => clearTimeout(timer);
  }, [hasIndexing, fetchBooks, books]);

  const openUpload = () => { setEditing(null); setDrawerOpen(true); };
  const openEdit = book => { setEditing(book); setDrawerOpen(true); };

  const togglePublish = async book => {
    try {
      await api.put(`/api/formula-books/${book.id}`, {
        publicationStatus: book.publicationStatus === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'
      });
      message.success(book.publicationStatus === 'PUBLISHED' ? 'Unpublished' : 'Published');
      fetchBooks();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Could not change publication status');
    }
  };

  const deleteBook = book => {
    Modal.confirm({
      title: 'Delete Formula Book PDF?',
      content: 'The record, page index, page mappings and private PDF file will be removed.',
      okText: 'Delete', okType: 'danger',
      async onOk() {
        try {
          await api.delete(`/api/formula-books/${book.id}`);
          message.success('Formula Book PDF deleted');
          fetchBooks();
        } catch (err) { message.error(err?.response?.data?.error || 'Could not delete'); }
      }
    });
  };

  const download = async book => {
    try {
      const res = await api.get(`/api/formula-books/${book.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = book.originalFilename || 'formula-book.pdf';
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch { message.error('Could not download PDF'); }
  };

  const triggerReplace = book => { setReplaceTarget(book); setTimeout(() => replaceInputRef.current?.click(), 0); };
  const handleReplace = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !replaceTarget) return;
    if (!/\.pdf$/i.test(file.name)) { message.error('Select a PDF file.'); return; }
    const loadingKey = 'formula-book-replace';
    message.open({ key: loadingKey, type: 'loading', content: 'Uploading replacement PDF...', duration: 0 });
    try {
      const body = new FormData(); body.append('file', file);
      await api.post(`/api/formula-books/${replaceTarget.id}/replace`, body, { headers: { 'Content-Type': 'multipart/form-data' } });
      message.open({ key: loadingKey, type: 'success', content: 'Replacement uploaded. Indexing started; current PDF stays available.', duration: 5 });
      fetchBooks();
    } catch (err) {
      message.open({ key: loadingKey, type: 'error', content: err?.response?.data?.error || 'Replacement failed.', duration: 5 });
    } finally { setReplaceTarget(null); }
  };

  const columns = [
    {
      title: 'Title', dataIndex: 'title', key: 'title', width: 300,
      render: (value, record) => (
        <Space>
          <FilePdfOutlined style={{ color: '#ef4444', fontSize: 18 }} />
          <div>
            <Text strong style={{ color: '#102540' }}>{value}</Text>
            <div><Text type="secondary" style={{ fontSize: 11 }}>{record.originalFilename}</Text></div>
          </div>
        </Space>
      )
    },
    { title: 'Level', key: 'level', width: 100, render: (_, b) => <Tag color="blue">{levelLabel(b.course?.level)}</Tag> },
    { title: 'Volume', key: 'volume', width: 170, render: (_, b) => b.volume?.name || '—' },
    { title: 'Pages', dataIndex: 'pageCount', width: 80 },
    { title: 'Year', dataIndex: 'year', width: 80 },
    {
      title: 'Status', key: 'status', width: 150,
      render: (_, b) => (
        <Space size={4} wrap>
          <Tag color={b.publicationStatus === 'PUBLISHED' ? 'green' : 'default'}>{b.publicationStatus === 'PUBLISHED' ? 'Published' : 'Draft'}</Tag>
          {b.processingStatus !== 'READY' && <Tag color={b.processingStatus === 'FAILED' ? 'error' : 'processing'}>{b.processingStatus === 'FAILED' ? 'Failed' : 'Indexing'}</Tag>}
        </Space>
      )
    },
    {
      title: 'Actions', key: 'actions', width: 230, fixed: 'right',
      render: (_, b) => (
        <Space size={2}>
          <Tooltip title="Preview"><Button size="small" type="text" icon={<EyeOutlined />} onClick={() => navigate(`/learning/formula-books/${b.id}`)} /></Tooltip>
          <Tooltip title="Edit details"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(b)} /></Tooltip>
          <Tooltip title="Replace PDF"><Button size="small" type="text" icon={<UploadOutlined />} onClick={() => triggerReplace(b)} /></Tooltip>
          <Tooltip title={b.publicationStatus === 'PUBLISHED' ? 'Unpublish' : 'Publish'}><Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => togglePublish(b)} /></Tooltip>
          <Tooltip title="Download"><Button size="small" type="text" icon={<DownloadOutlined />} onClick={() => download(b)} /></Tooltip>
          <Tooltip title="Delete"><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => deleteBook(b)} /></Tooltip>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={5}>
            <Input prefix={<SearchOutlined />} placeholder="Search PDF formula books" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} allowClear />
          </Col>
          <Col xs={12} md={3}>
            <Select allowClear showSearch optionFilterProp="label" placeholder="Course" value={courseId} onChange={v => { setCourseId(v); setVolumeId(undefined); setPage(1); }} options={courses.map(c => ({ value: c.id, label: `${c.name} (${levelLabel(c.level)})` }))} style={{ width: '100%' }} />
          </Col>
          <Col xs={12} md={3}>
            <Select allowClear showSearch optionFilterProp="label" placeholder="Volume" value={volumeId} onChange={v => { setVolumeId(v); setPage(1); }} options={volumeOptions} style={{ width: '100%' }} />
          </Col>
          <Col xs={12} md={2}>
            <Select allowClear placeholder="Year" value={year} onChange={v => { setYear(v); setPage(1); }} options={[2025, 2026, 2027, 2028].map(v => ({ value: v, label: String(v) }))} style={{ width: '100%' }} />
          </Col>
          <Col xs={12} md={2}>
            <Select allowClear placeholder="Status" value={status} onChange={v => { setStatus(v); setPage(1); }} options={[{ value: 'PUBLISHED', label: 'Published' }, { value: 'DRAFT', label: 'Draft' }]} style={{ width: '100%' }} />
          </Col>
          <Col xs={24} md={4} style={{ textAlign: 'right' }}>
            <Button type="primary" icon={<UploadOutlined />} onClick={openUpload}>Upload PDF</Button>
          </Col>
        </Row>
      </Card>

      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          dataSource={books}
          columns={columns}
          loading={loading}
          scroll={{ x: 1250 }}
          pagination={{
            current: page, pageSize, total, showSizeChanger: true,
            pageSizeOptions: [10, 25, 50],
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
            showTotal: count => `${count} formula book${count === 1 ? '' : 's'}`
          }}
          locale={{ emptyText: <Empty description="No PDF Formula Books uploaded yet" /> }}
        />
      </Card>

      <AdminFormulaBookPdfDrawer
        open={drawerOpen}
        mode={editing ? 'edit' : 'upload'}
        book={editing}
        courses={courses}
        volumes={volumes}
        onClose={() => { setDrawerOpen(false); setEditing(null); }}
        onSaved={fetchBooks}
      />
      <input ref={replaceInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleReplace} />
    </div>
  );
}
