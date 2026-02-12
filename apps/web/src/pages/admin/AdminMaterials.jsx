import React, { useEffect, useMemo, useState } from 'react';
import { Card, Table, Space, Button, Typography, Tag, Select, message } from 'antd';
import { BookOutlined, PlusOutlined, LinkOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';

export function AdminMaterials() {
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [courseId, setCourseId] = useState();
  const [topicId, setTopicId] = useState();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const [{ data: c }, { data: t }] = await Promise.all([
          api.get('/api/cms/courses'),
          api.get('/api/cms/topics')
        ]);
        const courseList = Array.isArray(c?.courses) ? c.courses : (c?.items || []);
        setCourses(courseList);
        setTopics(t?.topics || []);
      } catch {
        setCourses([]);
        setTopics([]);
      }
    })();
  }, []);

  const loadMaterials = async (tid) => {
    if (!tid) { setMaterials([]); return; }
    setLoading(true);
    try {
      const { data } = await api.get(`/api/cms/topics/${tid}/materials`);
      setMaterials(data.materials || []);
    } catch {
      setMaterials([]);
      message.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMaterials(topicId); /* eslint-disable-next-line */ }, [topicId]);

  const topicOptions = useMemo(() => {
    if (!courseId) return topics.map(t => ({ label: t.name, value: t.id }));
    return topics.filter(t => t.courseId === courseId || t.course?.id === courseId).map(t => ({ label: t.name, value: t.id }));
  }, [topics, courseId]);

  const columns = [
    { title: 'Title', dataIndex: 'title' },
    { title: 'Kind', dataIndex: 'kind', render: v => <Tag>{v}</Tag> },
    { title: 'Est. min', dataIndex: 'estimatedSeconds', render: v => v ? Math.ceil(v / 60) : '-' },
    { title: 'URL', dataIndex: 'url', render: v => v ? <a href={v} target="_blank" rel="noreferrer"><LinkOutlined /> Open</a> : '-' },
    { title: 'Updated', dataIndex: 'updatedAt', render: v => v ? new Date(v).toLocaleString() : '-' }
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>Learning Materials</Typography.Title>
      <Card>
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            allowClear
            showSearch
            placeholder="Filter by course"
            style={{ width: 260 }}
            value={courseId}
            onChange={(v) => { setCourseId(v); setTopicId(undefined); setMaterials([]); }}
            options={(courses || []).map(c => ({ label: c.name, value: c.id }))}
            optionFilterProp="label"
          />
          <Select
            allowClear
            showSearch
            placeholder="Select topic"
            style={{ width: 260 }}
            value={topicId}
            onChange={setTopicId}
            options={topicOptions}
            optionFilterProp="label"
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!topicId}
            onClick={() => navigate('/admin/topics')}
          >
            Manage in Topics
          </Button>
        </Space>
        <Table rowKey="id" loading={loading} dataSource={materials} columns={columns} />
      </Card>
    </Space>
  );
}

