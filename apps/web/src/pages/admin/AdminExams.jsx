import React, { useEffect, useMemo, useState } from 'react';
import { Card, Table, Space, Button, Typography, Tag, Popconfirm, message, Tooltip, Select } from 'antd';
import { EditOutlined, DeleteOutlined, EyeOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';

export function AdminExams() {
  const [loading, setLoading] = useState(false);
  const [exams, setExams] = useState([]);
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [filterCourseId, setFilterCourseId] = useState();
  const [filterTopicId, setFilterTopicId] = useState();
  const [filterType, setFilterType] = useState();
  const [filterActive, setFilterActive] = useState();
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterCourseId) params.courseId = filterCourseId;
      if (filterTopicId) params.topicId = filterTopicId;
      if (filterType) params.type = filterType;
      const { data } = await api.get('/api/exams', { params });
      setExams(data.exams || data.list || []);
    } catch {
      setExams([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterCourseId, filterTopicId, filterType]);

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

  const setActive = async (record, active) => {
    try {
      await api.put(`/api/exams/${record.id}`, { active });
      message.success(active ? 'Activated' : 'Deactivated');
      await load();
    } catch {
      message.error('Update failed');
    }
  };

  const remove = async (record) => {
    try {
      await api.delete(`/api/exams/${record.id}`);
      message.success('Deleted');
      await load();
    } catch {
      message.error('Delete failed');
    }
  };

  const courseMap = useMemo(() => Object.fromEntries((courses || []).map(c => [c.id, c])), [courses]);
  const topicMap = useMemo(() => Object.fromEntries((topics || []).map(t => [t.id, t])), [topics]);
  const topicOptions = useMemo(() => {
    if (!filterCourseId) return topics.map(t => ({ label: `${t.name}`, value: t.id }));
    return topics.filter(t => t.courseId === filterCourseId || t.course?.id === filterCourseId).map(t => ({ label: `${t.name}`, value: t.id }));
  }, [topics, filterCourseId]);

  const columns = [
    { title: 'Name', dataIndex: 'name' },
    { title: 'Type', dataIndex: 'type', render: v => <Tag color={v === 'QUIZ' ? 'blue' : 'purple'}>{v || '-'}</Tag> },
    { title: 'Course', dataIndex: 'courseId', render: v => v ? (courseMap[v]?.name || v) : '-' },
    { title: 'Topic', dataIndex: 'topicId', render: v => v ? (topicMap[v]?.name || v) : '-' },
    { title: 'Active', dataIndex: 'active', render: v => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> },
    { title: 'Created', dataIndex: 'createdAt', render: v => v ? new Date(v).toLocaleString() : '-' },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space>
          <Tooltip title="Edit">
            <Button shape="circle" icon={<EditOutlined />} onClick={() => navigate(`/admin/exams/${r.id}/edit`)} />
          </Tooltip>
          {r.active ? (
            <Tooltip title="Deactivate">
              <Button shape="circle" icon={<StopOutlined />} onClick={() => setActive(r, false)} />
            </Tooltip>
          ) : (
            <Tooltip title="Activate">
              <Button shape="circle" type="primary" icon={<CheckCircleOutlined />} onClick={() => setActive(r, true)} />
            </Tooltip>
          )}
          <Popconfirm title="Delete exam?" onConfirm={() => remove(r)}>
            <Tooltip title="Delete">
              <Button danger shape="circle" icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>Exams</Typography.Title>
      <Card>
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            allowClear
            placeholder="Filter by type"
            style={{ width: 180 }}
            value={filterType}
            onChange={setFilterType}
            options={[
              { label: 'Course Exams', value: 'COURSE' },
              { label: 'Topic Quizzes', value: 'QUIZ' }
            ]}
          />
          <Select
            allowClear
            showSearch
            placeholder="Filter by course"
            style={{ width: 260 }}
            value={filterCourseId}
            onChange={(v) => { setFilterCourseId(v); setFilterTopicId(undefined); }}
            options={(courses || []).map(c => ({ label: `${c.name}`, value: c.id }))}
            optionFilterProp="label"
          />
          <Select
            allowClear
            showSearch
            placeholder="Filter by topic"
            style={{ width: 260 }}
            value={filterTopicId}
            onChange={setFilterTopicId}
            options={topicOptions}
            optionFilterProp="label"
          />
        </Space>
        <Table rowKey="id" loading={loading} dataSource={exams} columns={columns} />
      </Card>
    </Space>
  );
}

