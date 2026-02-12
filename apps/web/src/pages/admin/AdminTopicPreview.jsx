import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Tabs, Typography, Space, Button, List } from 'antd';
import { ArrowLeftOutlined, PlayCircleOutlined, FilePdfOutlined, LinkOutlined, FileImageOutlined, VideoCameraOutlined, ReadOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

const kindIcon = (k) => {
  switch (k) {
    case 'PDF': return <FilePdfOutlined />;
    case 'LINK': return <LinkOutlined />;
    case 'VIDEO': return <VideoCameraOutlined />;
    case 'IMAGE': return <FileImageOutlined />;
    case 'HTML': return <ReadOutlined />;
    default: return <LinkOutlined />;
  }
};

export function AdminTopicPreview() {
  const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
  const asUrl = (u) => {
    if (!u) return u;
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    if (u.startsWith('/uploads')) return `${API_URL}${u}`;
    return u;
  };
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState(null);
  const [questionCount, setQuestionCount] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/api/cms/topics/${id}`);
        setTopic(data.topic);
        setQuestionCount(data.questionCount || 0);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const lessons = (
    <List
      itemLayout="horizontal"
      dataSource={topic?.materials || []}
      renderItem={(m) => (
        <List.Item actions={m.url ? [<a href={asUrl(m.url)} target="_blank" rel="noreferrer">Open</a>] : []}>
          <List.Item.Meta
            avatar={kindIcon(m.kind)}
            title={m.title}
            description={m.url || (m.contentHtml ? 'Embedded HTML content' : '')}
          />
        </List.Item>
      )}
    />
  );

  const revision = (
    <List
      header={`${(topic?.revisionSummaries || []).length} summary item(s)`}
      itemLayout="horizontal"
      dataSource={topic?.revisionSummaries || []}
      renderItem={(r) => (
        <List.Item actions={r.contentUrl ? [<a href={asUrl(r.contentUrl)} target="_blank" rel="noreferrer">Open</a>] : []}>
          <List.Item.Meta title={r.title} description={r.contentUrl || (r.contentHtml ? 'Inline HTML' : '')} />
        </List.Item>
      )}
    />
  );

  const practice = (
    <Space direction="vertical" size={12}>
      <Typography.Text>{questionCount} practice questions available for this topic.</Typography.Text>
      <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => navigate('/admin/exams/builder')}>
        Start Practice (Admin builder)
      </Button>
    </Space>
  );

  const quiz = (
    <Space direction="vertical" size={12}>
      <Typography.Text>Build a topic quiz using the Exam Builder.</Typography.Text>
      <Button icon={<PlayCircleOutlined />} onClick={() => navigate('/admin/exams/builder')}>Open Exam Builder</Button>
    </Space>
  );

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Space align="center">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>Back</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>{topic ? `${topic.moduleNumber ?? ''} ${topic.name}` : 'Topic Preview'}</Typography.Title>
      </Space>
      <Card loading={loading}>
        {topic && (
          <Tabs
            defaultActiveKey="lessons"
            items={[
              { key: 'lessons', label: 'Lessons (videos/readings)', children: lessons },
              { key: 'practice', label: 'Practice questions', children: practice },
              { key: 'revision', label: 'Revision Summary', children: revision },
              { key: 'quiz', label: 'Topic quiz', children: quiz }
            ]}
          />
        )}
      </Card>
    </Space>
  );
}

