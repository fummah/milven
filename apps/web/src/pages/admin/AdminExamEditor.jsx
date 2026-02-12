import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Card, Typography, Space, Form, Input, Select, Button, InputNumber, Table, message, DatePicker } from 'antd';
import { ArrowLeftOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../../lib/api';

const FORM_INITIAL_VALUES = {
  type: 'MCQ',
  difficulty: 'MEDIUM',
  options: [{ text: '', isCorrect: false }]
};

export function AdminExamEditor() {
  const { id } = useParams(); // exam id
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const topicId = params.get('topicId') || '';
  const mode = params.get('mode') || ''; // 'quiz' when from topic
  const back = params.get('back') || '';

  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [topics, setTopics] = useState([]);
  const [form] = Form.useForm();
  const [settingsForm] = Form.useForm();
  const [savingSettings, setSavingSettings] = useState(false);
  const formInitialValues = useMemo(() => ({ ...FORM_INITIAL_VALUES }), []);

  const loadExam = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/exams/${id}`);
      setExam(data.exam);
    } finally {
      setLoading(false);
    }
  };

  const loadQuestions = async () => {
    try {
      const { data } = await api.get(`/api/exams/${id}/questions`);
      setQuestions(data.questions || []);
    } catch {
      setQuestions([]);
    }
  };

  // When editing a course exam (no topicId in URL), fetch topics for this level so we can attach new questions
  const loadTopicsForLevel = async (level) => {
    try {
      const { data } = await api.get('/api/cms/topics', { params: { level } });
      const list = data.topics || [];
      setTopics(list);
      if (list.length) {
        form.setFieldsValue({ topicId: list[0].id });
      }
    } catch {
      setTopics([]);
    }
  };

  useEffect(() => { loadExam(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => {
    if (exam) {
      loadQuestions();
      if (!topicId && exam.level) {
        loadTopicsForLevel(exam.level);
      }
      if (exam.type === 'COURSE') {
        settingsForm.setFieldsValue({
          startAt: exam.startAt ? dayjs(exam.startAt) : null,
          endAt: exam.endAt ? dayjs(exam.endAt) : null
        });
      }
    }
    // eslint-disable-next-line
  }, [exam?.id]);

  const onSaveSettings = async (values) => {
    setSavingSettings(true);
    try {
      await api.put(`/api/exams/${id}`, {
        startAt: values.startAt ? values.startAt.toISOString() : null,
        endAt: values.endAt ? values.endAt.toISOString() : null
      });
      message.success('Exam schedule saved');
      loadExam();
    } catch {
      message.error('Failed to save');
    } finally {
      setSavingSettings(false);
    }
  };

  const onAddQuestion = async (values) => {
    try {
      const chosenTopicId = topicId || values.topicId;
      if (!chosenTopicId) {
        message.error('Please select a topic for this question.');
        return;
      }
      const payload = {
        stem: values.stem,
        type: values.type,
        level: exam.level,
        difficulty: values.difficulty,
        topicId: chosenTopicId,
        vignetteText: values.type === 'VIGNETTE_MCQ' ? (values.vignetteText || undefined) : undefined,
        options: values.type !== 'CONSTRUCTED_RESPONSE' ? (values.options || []).map(o => ({ text: o.text, isCorrect: !!o.isCorrect })) : undefined
      };
      const created = await api.post('/api/cms/questions', payload);
      const qid = created?.data?.question?.id;
      if (qid) {
        await api.post(`/api/exams/${id}/questions`, { questionId: qid });
      }
      message.success('Question added');
      form.resetFields();
      loadQuestions();
    } catch {
      message.error('Failed to add question');
    }
  };

  const loadQuestionDetailToForm = async (qid) => {
    try {
      const { data } = await api.get(`/api/cms/questions/${qid}`);
      const q = data.question;
      form.setFieldsValue({
        stem: q.stem,
        type: q.type,
        difficulty: q.difficulty,
        vignetteText: q.vignette?.text || undefined,
        options: (q.options || []).map(o => ({ text: o.text, isCorrect: o.isCorrect }))
      });
    } catch {
      message.error('Failed to load question');
    }
  };

  const deleteQuestion = async (qid) => {
    try {
      await api.delete(`/api/exams/${id}/questions/${qid}`);
      message.success('Removed from exam');
      loadQuestions();
    } catch {
      message.error('Remove failed');
    }
  };

  const columns = [
    { title: 'Stem', dataIndex: 'stem', ellipsis: true },
    { title: 'Type', dataIndex: 'type' },
    { title: 'Difficulty', dataIndex: 'difficulty' },
    { title: 'Created', dataIndex: 'createdAt', render: v => v ? new Date(v).toLocaleString() : '-' },
    {
      title: 'Actions',
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => loadQuestionDetailToForm(row.id)}>Edit</Button>
          <Button size="small" danger onClick={() => deleteQuestion(row.id)}>Remove</Button>
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => {
              if (back) {
                navigate(decodeURIComponent(back));
              } else {
                navigate(-1);
              }
            }}
          >
            Back
          </Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {mode === 'quiz' ? 'Quiz Builder' : 'Exam Builder'} · {exam ? exam.name : '—'}
          </Typography.Title>
        </Space>
      </Space>

      {exam?.type === 'COURSE' && (
        <Card
          title={
            <Space>
              <CalendarOutlined />
              <span>Exam schedule (when students can take it)</span>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          <Form form={settingsForm} layout="vertical" onFinish={onSaveSettings}>
            <Space size="large" wrap align="flex-end">
              <Form.Item name="startAt" label="Start at (optional)">
                <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ minWidth: 200 }} placeholder="No start limit" allowClear />
              </Form.Item>
              <Form.Item name="endAt" label="End at (optional)">
                <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ minWidth: 200 }} placeholder="No end limit" allowClear />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={savingSettings}>Save schedule</Button>
              </Form.Item>
            </Space>
            <Typography.Text type="secondary">Students will only see and be able to take this exam between start and end. Leave both empty for always available.</Typography.Text>
          </Form>
        </Card>
      )}

      <Card loading={loading} title="Add Question">
        <Form
          key={id}
          layout="vertical"
          form={form}
          onFinish={onAddQuestion}
          initialValues={formInitialValues}
        >
          {!topicId && (
            <Form.Item name="topicId" label="Topic" rules={[{ required: true, message: 'Select a topic for this question' }]}>
              <Select
                style={{ minWidth: 260 }}
                options={(topics || []).map(t => ({
                  value: t.id,
                  label: `${t.moduleNumber ?? ''} ${t.name}`.trim()
                }))}
                placeholder="Select a topic"
              />
            </Form.Item>
          )}
          <Form.Item name="stem" label="Question Text" rules={[{ required: true, min: 5 }]}>
            <Input.TextArea rows={3} placeholder="Enter question stem..." />
          </Form.Item>
          <Space size="large" wrap>
            <Form.Item name="type" label="Type" rules={[{ required: true }]}>
              <Select style={{ minWidth: 160 }} options={[
                { value: 'MCQ', label: 'MCQ' },
                { value: 'VIGNETTE_MCQ', label: 'Vignette MCQ' },
                { value: 'CONSTRUCTED_RESPONSE', label: 'Constructed Response' }
              ]} />
            </Form.Item>
            <Form.Item name="difficulty" label="Difficulty" rules={[{ required: true }]}>
              <Select style={{ minWidth: 160 }} options={[
                { value: 'EASY', label: 'Easy' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HARD', label: 'Hard' }
              ]} />
            </Form.Item>
          </Space>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => {
              const type = getFieldValue('type');
              if (type === 'VIGNETTE_MCQ') {
                return (
                  <Form.Item name="vignetteText" label="Vignette Text">
                    <Input.TextArea rows={4} placeholder="Enter vignette passage..." />
                  </Form.Item>
                );
              }
              return null;
            }}
          </Form.Item>
          <Form.List name="options">
            {(fields, { add, remove }) => (
              <>
                <Form.Item noStyle shouldUpdate>
                  {({ getFieldValue }) => {
                    const type = getFieldValue('type');
                    if (type === 'CONSTRUCTED_RESPONSE') return null;
                    return (
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Typography.Text strong>Options</Typography.Text>
                        {fields.map(field => (
                          <Space key={field.key} align="baseline" style={{ display: 'flex' }}>
                            <Form.Item {...field} name={[field.name, 'text']} rules={[{ required: true }]} style={{ width: 420 }}>
                              <Input placeholder="Option text" />
                            </Form.Item>
                            <Form.Item {...field} name={[field.name, 'isCorrect']} valuePropName="checked">
                              <Select style={{ width: 140 }} options={[{ value: true, label: 'Correct' }, { value: false, label: 'Incorrect' }]} />
                            </Form.Item>
                            <Button onClick={() => remove(field.name)}>Remove</Button>
                          </Space>
                        ))}
                        <Button onClick={() => add({ text: '', isCorrect: false })}>Add Option</Button>
                      </Space>
                    );
                  }}
                </Form.Item>
              </>
            )}
          </Form.List>
          <div style={{ marginTop: 16 }} />
          <Button type="primary" htmlType="submit">Add Question</Button>
        </Form>
      </Card>

      <Card title="Questions">
        <Table rowKey="id" dataSource={questions} columns={columns} pagination={false} />
      </Card>
    </Space>
  );
}

