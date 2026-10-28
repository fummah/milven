import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Col, Empty, Input, Row, Select, Space, Spin, Tag, Typography } from 'antd';
import { FilePdfOutlined, SearchOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { levelLabel, volumeBelongsToCourse } from '../../lib/slideUrls';

const { Text } = Typography;

export default function StudentModuleNotePdfsTab({ courses = [], volumes = [], modules = [], topics = [] }) {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [courseId, setCourseId] = useState(undefined);
  const [volumeId, setVolumeId] = useState(undefined);
  const [moduleId, setModuleId] = useState(undefined);
  const [topicId, setTopicId] = useState(undefined);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const volumeOptions = useMemo(
    () => volumes.filter(volume => volumeBelongsToCourse(volume, courseId)).map(volume => ({ value: volume.id, label: volume.name })),
    [volumes, courseId]
  );
  const moduleOptions = useMemo(() => modules.filter(module => (!courseId || module.courseId === courseId) && (!volumeId || module.volumeId === volumeId)).map(module => ({ value: module.id, label: module.name })), [modules, courseId, volumeId]);
  const topicOptions = useMemo(() => topics.filter(topic => !moduleId || topic.moduleId === moduleId).map(topic => ({ value: topic.id, label: topic.name })), [topics, moduleId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { limit: 60 };
    if (courseId) params.courseId = courseId;
    if (volumeId) params.volumeId = volumeId;
    if (moduleId) params.moduleId = moduleId;
    if (topicId) params.topicId = topicId;
    api.get('/api/module-note-pdfs', { params })
      .then(res => { if (!cancelled) setBooks(res.data?.books || []); })
      .catch(() => { if (!cancelled) setBooks([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [courseId, volumeId, moduleId, topicId]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) { setResults([]); setSearching(false); return undefined; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = { q: term, limit: 24 };
        if (courseId) params.courseId = courseId;
        if (volumeId) params.volumeId = volumeId;
        if (moduleId) params.moduleId = moduleId;
        if (topicId) params.topicId = topicId;
        const bookRes = await api.get('/api/module-note-pdfs/search', { params });
        if (!cancelled) {
          setResults(bookRes.data.results || []);
        }
      } catch { if (!cancelled) setResults([]); }
      finally { if (!cancelled) setSearching(false); }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, courseId, volumeId, moduleId, topicId]);

  const openBook = (book, page) => navigate(`/learning/module-notes-pdf/${book.id}${page ? `?page=${page}` : ''}`);

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Input prefix={<SearchOutlined />} placeholder="Search PDF module notes" value={search} onChange={e => setSearch(e.target.value)} allowClear style={{ width: 320 }} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Course" value={courseId} onChange={v => { setCourseId(v); setVolumeId(undefined); }} options={courses.map(c => ({ value: c.id, label: `${c.name} (${levelLabel(c.level)})` }))} style={{ width: 190 }} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Volume" value={volumeId} onChange={v => { setVolumeId(v); setModuleId(undefined); setTopicId(undefined); }} options={volumeOptions} style={{ width: 190 }} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Learning Module" value={moduleId} onChange={v => { setModuleId(v); setTopicId(undefined); }} options={moduleOptions} style={{ width: 210 }} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Topic" value={topicId} onChange={setTopicId} options={topicOptions} style={{ width: 180 }} />
      </Space>

      {search.trim().length >= 2 && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Text strong style={{ color: '#102540' }}>Matching PDF pages</Text>
          {searching ? <div style={{ marginTop: 10 }}><Spin size="small" /></div> : results.length === 0 ? (
            <div style={{ marginTop: 8 }}><Text type="secondary">No matching PDF module notes.</Text></div>
          ) : (
            <Space direction="vertical" style={{ width: '100%', marginTop: 10 }}>
              {results.map((result, index) => (
                <Card key={`${result.moduleNotePdfId}-${result.pageNumber}-${index}`} size="small" hoverable onClick={() => openBook({ id: result.moduleNotePdfId }, result.pageNumber)}>
                  <Space wrap>
                    <FilePdfOutlined style={{ color: '#ef4444' }} />
                    <Text strong>{result.book?.title}</Text>
                    <Tag color="blue">Page {result.pageNumber}</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>{levelLabel(result.book?.course?.level)} - {result.book?.volume?.name}</Text>
                  </Space>
                  <div style={{ marginTop: 5, fontSize: 12, color: '#475569' }}>{result.excerpt}</div>
                </Card>
              ))}
            </Space>
          )}
        </Card>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : books.length === 0 ? (
        <Card><Empty description="No published PDF Module Notes for this selection." /></Card>
      ) : (
        <Row gutter={[16, 16]}>
          {books.map(book => (
            <Col xs={24} sm={12} lg={8} key={book.id}>
              <Card hoverable onClick={() => openBook(book)} style={{ borderRadius: 14, border: '1px solid #e2e8f0', height: '100%' }}>
                <Space direction="vertical" size={7} style={{ width: '100%' }}>
                  <Space>
                    <FilePdfOutlined style={{ color: '#ef4444', fontSize: 22 }} />
                    <Text strong style={{ color: '#102540', fontSize: 15 }}>{book.title}</Text>
                  </Space>
                  {book.description && <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ rows: 2 }}>{book.description}</Text>}
                  <Space size={[4, 4]} wrap>
                    <Tag color="blue">{levelLabel(book.course?.level)}</Tag>
                    <Tag>{book.volume?.name}</Tag>
                    <Tag>{book.pageCount} pages</Tag>
                    <Tag>{book.year}</Tag>
                  </Space>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
