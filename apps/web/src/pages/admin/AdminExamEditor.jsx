import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Card, Typography, Space, Form, Input, Select, Button, InputNumber, Table, message, DatePicker, Drawer, Tag } from 'antd';
import { ArrowLeftOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../../lib/api';


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
  const [poolOpen, setPoolOpen] = useState(false);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolQuestions, setPoolQuestions] = useState([]);
  const [poolSelectedRowKeys, setPoolSelectedRowKeys] = useState([]);
  const [poolFilters, setPoolFilters] = useState({ q: '', topicId: '', difficulty: '' });
  const [settingsForm] = Form.useForm();
  const [randomForm] = Form.useForm();
  const [savingSettings, setSavingSettings] = useState(false);

  const existingQuestionIds = useMemo(() => new Set((questions || []).map(q => q.id)), [questions]);

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

	const loadPoolQuestions = async (override = {}) => {
		if (!exam) return;
		setPoolLoading(true);
		try {
			const effective = { ...poolFilters, ...override };
			const params = {
				...(effective.q ? { q: effective.q } : {}),
				...(effective.topicId ? { topicId: effective.topicId } : {}),
				...(effective.difficulty ? { difficulty: effective.difficulty } : {}),
				...(exam.level ? { level: exam.level } : {})
			};
			const { data } = await api.get('/api/cms/questions', { params });
			setPoolQuestions(data?.questions || []);
		} catch {
			setPoolQuestions([]);
		} finally {
			setPoolLoading(false);
		}
	};

	const linkSelectedQuestions = async () => {
		if (poolSelectedRowKeys.length === 0) return;
		try {
			const toLink = poolSelectedRowKeys.filter(qid => !existingQuestionIds.has(qid));
			if (toLink.length === 0) {
				message.info('All selected questions are already in this exam');
				return;
			}
			await Promise.all(toLink.map((questionId) => api.post(`/api/exams/${id}/questions`, { questionId })));
			message.success(`Added ${toLink.length} question(s) to exam`);
			setPoolSelectedRowKeys([]);
			await loadQuestions();
		} catch (e) {
			message.error(e?.response?.data?.error || 'Failed to add questions');
		}
	};

	const randomizeFromPool = async (values) => {
		try {
			await api.post(`/api/exams/${id}/randomize`, {
				questionCount: Number(values.questionCount),
				difficulties: values.difficulties && values.difficulties.length > 0 ? values.difficulties : undefined,
				courseId: exam?.courseId || undefined,
				topicIds: values.topicIds && values.topicIds.length > 0 ? values.topicIds : (values.topicId ? [values.topicId] : (exam?.topicId ? [exam.topicId] : undefined)),
				replaceExisting: values.replaceExisting !== false
			});
			message.success('Exam randomized from pool');
			await loadQuestions();
		} catch (e) {
			message.error(e?.response?.data?.error || 'Randomize failed');
		}
	};

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
          <Button size="small" onClick={() => navigate(`/admin/questions/${row.id}/edit`)}>Edit</Button>
          <Button size="small" danger onClick={() => deleteQuestion(row.id)}>Remove</Button>
        </Space>
      )
    }
  ];

	const poolColumns = [
		{ title: 'Question', dataIndex: 'stem', ellipsis: true },
		{ title: 'Type', dataIndex: 'type', width: 120, render: (v) => <Tag color={v === 'MCQ' ? 'blue' : (v === 'VIGNETTE_MCQ' ? 'purple' : 'default')}>{v}</Tag> },
		{ title: 'Difficulty', dataIndex: 'difficulty', width: 120 },
		{ title: 'In exam', dataIndex: 'id', width: 90, render: (qid) => (existingQuestionIds.has(qid) ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>) }
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

      {exam && (
        <Card
          title={
            <Space>
              <CalendarOutlined />
              <span>Exam Schedule (when students can take it)</span>
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
          </Form>
        </Card>
      )}

      <Card loading={loading} title="Add Questions">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">Questions must be loaded from the Questions page. Use the options below to add questions to this exam.</Typography.Text>
          <Space wrap>
            <Button type="primary" onClick={() => {
              setPoolOpen(true);
              setPoolSelectedRowKeys([]);
              loadPoolQuestions();
            }}>
              Search & Select from Pool
            </Button>
          </Space>
        </Space>

        <Card size="small" title="Random from Pool" style={{ marginTop: 16 }}>
          <Form
            layout="inline"
            form={randomForm}
            onFinish={randomizeFromPool}
						initialValues={{ questionCount: 20, difficulties: [], topicIds: topicId ? [topicId] : [], replaceExisting: true }}
          >
            <Form.Item name="questionCount" label="Count" rules={[{ required: true }]}>
              <InputNumber min={1} max={200} />
            </Form.Item>
            <Form.Item name="difficulties" label="Difficulty">
              <Select
                mode="multiple"
                allowClear
                style={{ width: 200 }}
                placeholder="Select difficulties"
                options={[
                  { label: 'Easy', value: 'EASY' },
                  { label: 'Medium', value: 'MEDIUM' },
                  { label: 'Hard', value: 'HARD' }
                ]}
              />
            </Form.Item>
						{!topicId && (
							<Form.Item name="topicIds" label="Topic (optional filter)">
								<Select
									mode="multiple"
									allowClear
									showSearch
									style={{ width: 260 }}
									placeholder="Select topics (multiple)"
									options={(topics || []).map(t => ({ value: t.id, label: t.name }))}
									optionFilterProp="label"
								/>
							</Form.Item>
						)}
            <Form.Item name="replaceExisting" label="Replace" rules={[{ required: false }]}>
              <Select style={{ width: 140 }} options={[{ label: 'Yes', value: true }, { label: 'No', value: false }]} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">Randomize</Button>
            </Form.Item>
          </Form>
        </Card>
      </Card>

      <Card title="Questions">
        <Table rowKey="id" dataSource={questions} columns={columns} pagination={false} />
      </Card>

			<Drawer
				title="Question Pool"
				open={poolOpen}
				onClose={() => setPoolOpen(false)}
				width={860}
				destroyOnClose
			>
				<Space direction="vertical" size={12} style={{ width: '100%' }}>
					<Space wrap>
						<Input
							placeholder="Search question text"
							value={poolFilters.q}
							onChange={(e) => setPoolFilters((p) => ({ ...p, q: e.target.value }))}
							style={{ width: 320 }}
							allowClear
							onPressEnter={() => loadPoolQuestions()}
						/>
						<Select
							placeholder="Topic"
							allowClear
							value={poolFilters.topicId || undefined}
							onChange={(v) => setPoolFilters((p) => ({ ...p, topicId: v ?? '' }))}
							style={{ width: 280 }}
							showSearch
							optionFilterProp="label"
							options={(topics || []).map(t => ({ value: t.id, label: t.name }))}
						/>
						<Select
							placeholder="Difficulty"
							allowClear
							value={poolFilters.difficulty || undefined}
							onChange={(v) => setPoolFilters((p) => ({ ...p, difficulty: v ?? '' }))}
							style={{ width: 180 }}
							options={[
								{ label: 'Easy', value: 'EASY' },
								{ label: 'Medium', value: 'MEDIUM' },
								{ label: 'Hard', value: 'HARD' }
							]}
						/>
						<Button type="primary" onClick={() => loadPoolQuestions()}>Search</Button>
						<Button onClick={() => {
							setPoolFilters({ q: '', topicId: '', difficulty: '' });
							loadPoolQuestions({ q: '', topicId: '', difficulty: '' });
						}}>Reset</Button>
						<Button disabled={poolSelectedRowKeys.length === 0} type="primary" onClick={linkSelectedQuestions}>
							Add selected ({poolSelectedRowKeys.length})
						</Button>
					</Space>
					<Table
						rowKey="id"
						loading={poolLoading}
						dataSource={poolQuestions}
						columns={poolColumns}
						rowSelection={{
							selectedRowKeys: poolSelectedRowKeys,
							onChange: setPoolSelectedRowKeys
						}}
						pagination={{ pageSize: 10 }}
						size="small"
					/>
				</Space>
			</Drawer>
    </Space>
  );
}

