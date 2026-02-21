import React, { useEffect, useMemo, useState } from 'react';
import { Card, Table, Space, Button, Typography, Tag, Popconfirm, message, Tooltip, Select, Modal, Form, Input, InputNumber, Tabs, Drawer, Descriptions, Divider, List } from 'antd';
import { EditOutlined, DeleteOutlined, EyeOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';

const { Option } = Select;

export function AdminExams() {
  const [loading, setLoading] = useState(false);
  const [exams, setExams] = useState([]);
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [filterCourseId, setFilterCourseId] = useState();
  const [filterTopicId, setFilterTopicId] = useState();
  const [filterType, setFilterType] = useState();
  const [filterActive, setFilterActive] = useState();
  const [activeTab, setActiveTab] = useState('admin');
  const [poolOpen, setPoolOpen] = useState(false);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolForm] = Form.useForm();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewExam, setPreviewExam] = useState(null);
  const [previewQuestions, setPreviewQuestions] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
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

  const openPreview = async (exam) => {
    setPreviewLoading(true);
    setPreviewOpen(true);
    setPreviewExam(exam);
    try {
      const { data } = await api.get(`/api/exams/${exam.id}/questions`);
      setPreviewQuestions(data.questions || []);
    } catch {
      setPreviewQuestions([]);
      message.error('Failed to load exam questions');
    } finally {
      setPreviewLoading(false);
    }
  };

  const courseMap = useMemo(() => Object.fromEntries((courses || []).map(c => [c.id, c])), [courses]);
  const topicMap = useMemo(() => Object.fromEntries((topics || []).map(t => [t.id, t])), [topics]);
  const topicOptions = useMemo(() => {
    if (!filterCourseId) return topics.map(t => ({ label: `${t.name}`, value: t.id }));
    return topics.filter(t => t.courseId === filterCourseId || t.course?.id === filterCourseId).map(t => ({ label: `${t.name}`, value: t.id }));
  }, [topics, filterCourseId]);

  const getExamStatus = (exam) => {
    if (!exam.endAt) return { status: 'open', color: 'blue', text: 'Open' };
    const now = new Date();
    const endDate = new Date(exam.endAt);
    if (now > endDate) return { status: 'completed', color: 'green', text: 'Completed' };
    return { status: 'open', color: 'blue', text: 'Open' };
  };

  const getTopicInfo = (exam) => {
    if (!exam.topicId) return { name: '—', isAdmin: exam.createdBy === null };
    const topic = topicMap[exam.topicId];
    const isAdmin = exam.createdBy === null || exam.createdBy === undefined;
    return { 
      name: topic?.name || exam.topicId, 
      isAdmin 
    };
  };

  const filteredExams = useMemo(() => {
    if (activeTab === 'admin') {
      // Admin exams: createdBy is null or undefined (admin-created exams don't have a createdBy user)
      return exams.filter(e => e.createdBy === null || e.createdBy === undefined);
    } else {
      // Student exams: createdBy exists and is not null/undefined
      return exams.filter(e => e.createdBy !== null && e.createdBy !== undefined);
    }
  }, [exams, activeTab]);

  const getExamTimeRange = (exam) => {
    if (exam.startAt && exam.endAt) {
      return {
        start: new Date(exam.startAt).toLocaleString(),
        end: new Date(exam.endAt).toLocaleString()
      };
    }
    return { start: exam.startAt ? new Date(exam.startAt).toLocaleString() : '—', end: exam.endAt ? new Date(exam.endAt).toLocaleString() : '—' };
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', width: 200 },
    { title: 'Type', dataIndex: 'type', width: 100, render: v => <Tag color={v === 'QUIZ' ? 'blue' : 'purple'}>{v || '-'}</Tag> },
    { title: 'Course', dataIndex: 'courseId', width: 150, render: v => v ? (courseMap[v]?.name || v) : '—' },
    { 
      title: 'Creator', 
      width: 180,
      render: (_, exam) => {
        if (exam.createdBy) {
          return <Tag color="orange" icon={<span>👤</span>}>Student: {exam.createdBy.name || exam.createdBy.email || 'Unknown'}</Tag>;
        }
        return <Tag color="blue" icon={<span>👨‍💼</span>}>Admin</Tag>;
      }
    },
    { 
      title: 'Questions', 
      width: 100,
      dataIndex: 'questionCount',
      render: (count) => count || 0
    },
    {
      title: 'Exam Period',
      width: 200,
      render: (_, exam) => {
        const timeRange = getExamTimeRange(exam);
        return (
          <Space direction="vertical" size={0}>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>Start: {timeRange.start}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>End: {timeRange.end}</Typography.Text>
          </Space>
        );
      }
    },
    {
      title: 'Status',
      width: 120,
      render: (_, exam) => {
        const statusInfo = getExamStatus(exam);
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      }
    },
    {
      title: 'Students',
      width: 100,
      dataIndex: 'attemptCount',
      render: (count) => count || 0
    },
    { title: 'Active', dataIndex: 'active', width: 80, render: v => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> },
    { title: 'Created', dataIndex: 'createdAt', width: 150, render: v => v ? new Date(v).toLocaleString() : '—' },
    {
      title: 'Actions',
      width: 150,
      fixed: 'right',
      render: (_, r) => (
        <Space>
          <Tooltip title="Preview">
            <Button shape="circle" icon={<EyeOutlined />} onClick={() => openPreview(r)} />
          </Tooltip>
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

  const adminColumns = columns;
  const studentColumns = [
    ...columns.filter(c => c.title !== 'Creator'),
    {
      title: 'Student',
      width: 180,
      render: (_, exam) => exam.createdBy ? (exam.createdBy.name || exam.createdBy.email || 'Unknown') : '—'
    },
    {
      title: 'Attended',
      width: 100,
      render: (_, exam) => {
        const hasAttempts = (exam.attemptCount || 0) > 0;
        return <Tag color={hasAttempts ? 'green' : 'default'}>{hasAttempts ? 'Yes' : 'No'}</Tag>;
      }
    }
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>Exams</Typography.Title>
      <Card>
        <Space wrap style={{ marginBottom: 12, justifyContent: 'space-between', width: '100%' }}>
          <Space wrap>
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
          <Button type="primary" onClick={() => {
            setPoolOpen(true);
            poolForm.resetFields();
            poolForm.setFieldsValue({
              examType: 'COURSE',
              difficulties: ['MEDIUM'],
              questionCount: 20,
              timeLimitMinutes: 90,
              replaceExisting: true
            });
          }}>
            Create from Pool
          </Button>
        </Space>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'admin',
              label: 'Admin Exams',
              children: (
                <Table 
                  rowKey="id" 
                  loading={loading} 
                  dataSource={filteredExams} 
                  columns={adminColumns}
                  scroll={{ x: 'max-content' }}
                  pagination={{ pageSize: 20 }}
                />
              )
            },
            {
              key: 'student',
              label: 'Student Exams',
              children: (
                <Table 
                  rowKey="id" 
                  loading={loading} 
                  dataSource={filteredExams} 
                  columns={studentColumns}
                  scroll={{ x: 'max-content' }}
                  pagination={{ pageSize: 20 }}
                />
              )
            }
          ]}
        />
      </Card>

			<Modal
				title="Create Exam from Question Pool"
				open={poolOpen}
				onCancel={() => {
					setPoolOpen(false);
					poolForm.resetFields();
				}}
				confirmLoading={poolLoading}
				okText="Create"
				onOk={(e) => {
					e.preventDefault();
					poolForm.submit();
				}}
			>
				<Form
					layout="vertical"
					form={poolForm}
					onFinish={async (values) => {
						if (poolLoading) return; // Prevent double submission
						setPoolLoading(true);
						try {
							const examType = values.examType;
							const topicIds = Array.isArray(values.topicId) && values.topicId.length > 0 ? values.topicId : undefined;
							const res = await api.post('/api/exams/custom', {
								name: values.name,
								timeLimitMinutes: Number(values.timeLimitMinutes),
								questionCount: Number(values.questionCount),
								examType,
								courseId: values.courseId,
								topicIds: topicIds
							});
							const examId = res?.data?.exam?.id;
							if (!examId) throw new Error('Exam not created');
							await api.post(`/api/exams/${examId}/randomize`, {
								questionCount: Number(values.questionCount),
								difficulties: values.difficulties || [],
								courseId: values.courseId,
								topicIds: topicIds,
								replaceExisting: true
							});
							message.success('Exam created from pool');
							setPoolOpen(false);
							poolForm.resetFields();
							await load(); // Refresh the exam list
							navigate(`/admin/exams/${examId}/edit`);
						} catch (e) {
							message.error(e?.response?.data?.error || e?.message || 'Failed to create from pool');
						} finally {
							setPoolLoading(false);
						}
					}}
				>
					<Form.Item name="name" label="Name" rules={[{ required: true, min: 3 }]}>
						<Input placeholder="Example: Course Exam 1" />
					</Form.Item>
					<Form.Item name="examType" label="Type" rules={[{ required: true }]}>
						<Select
							options={[
								{ label: 'Course Exam', value: 'COURSE' },
								{ label: 'Topic Quiz', value: 'QUIZ' }
							]}
						/>
					</Form.Item>
					<Form.Item name="courseId" label="Course" rules={[{ required: true }]}>
						<Select
							showSearch
							placeholder="Select course"
							options={(courses || []).map(c => ({ label: c.name, value: c.id }))}
							optionFilterProp="label"
							onChange={(v) => {
								poolForm.setFieldsValue({ topicId: undefined });
							}}
						/>
					</Form.Item>
					<Form.Item noStyle shouldUpdate>
						{({ getFieldValue }) => {
							const examType = getFieldValue('examType');
							const cid = getFieldValue('courseId');
							// Filter topics by selected course
							const opts = cid 
								? topics.filter(t => t.courseId === cid || t.course?.id === cid).map(t => ({ label: t.name, value: t.id }))
								: topics.map(t => ({ label: t.name, value: t.id }));
							return (
								<Form.Item
									name="topicId"
									label={examType === 'QUIZ' ? 'Topics' : 'Topics (optional filter)'}
									rules={examType === 'QUIZ' ? [{ required: true, message: 'Please select at least one topic' }] : []}
								>
									<Select 
										mode="multiple"
										allowClear 
										showSearch 
										options={opts} 
										optionFilterProp="label" 
										placeholder={examType === 'QUIZ' ? 'Select topics' : 'Select topics (multiple)'}
									/>
								</Form.Item>
							);
						}}
					</Form.Item>
					<Space wrap size="large">
						<Form.Item name="difficulties" label="Difficulty">
							<Select
								mode="multiple"
								allowClear
								style={{ width: 180 }}
								placeholder="Select difficulties"
								options={[
									{ label: 'Easy', value: 'EASY' },
									{ label: 'Medium', value: 'MEDIUM' },
									{ label: 'Hard', value: 'HARD' }
								]}
							/>
						</Form.Item>
						<Form.Item name="questionCount" label="Question Count" rules={[{ required: true }]}>
							<InputNumber min={1} max={200} />
						</Form.Item>
						<Form.Item name="timeLimitMinutes" label="Time Limit (minutes)" rules={[{ required: true }]}>
							<InputNumber min={10} max={360} />
						</Form.Item>
					</Space>
				</Form>
			</Modal>

      {/* Exam Preview Drawer */}
      <Drawer
        title={previewExam ? `${previewExam.type === 'QUIZ' ? 'Quiz' : 'Exam'} Preview: ${previewExam.name}` : 'Exam Preview'}
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewExam(null);
          setPreviewQuestions([]);
        }}
        width={820}
      >
        {previewLoading ? (
          <Typography.Text>Loading...</Typography.Text>
        ) : previewExam ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Name" span={2}>{previewExam.name}</Descriptions.Item>
              <Descriptions.Item label="Type">
                <Tag color={previewExam.type === 'QUIZ' ? 'blue' : 'purple'}>{previewExam.type}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Level">{previewExam.level}</Descriptions.Item>
              <Descriptions.Item label="Time Limit">{previewExam.timeLimitMinutes} minutes</Descriptions.Item>
              <Descriptions.Item label="Questions">{previewExam.questionCount || previewQuestions.length}</Descriptions.Item>
              <Descriptions.Item label="Active">{previewExam.active ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>}</Descriptions.Item>
              <Descriptions.Item label="Created By" span={2}>
                {previewExam.createdBy ? (
                  <Tag color="orange">Student: {previewExam.createdBy.name || previewExam.createdBy.email || 'Unknown'}</Tag>
                ) : (
                  <Tag color="blue">Admin</Tag>
                )}
              </Descriptions.Item>
              {previewExam.startAt && (
                <Descriptions.Item label="Start At">{new Date(previewExam.startAt).toLocaleString()}</Descriptions.Item>
              )}
              {previewExam.endAt && (
                <Descriptions.Item label="End At">{new Date(previewExam.endAt).toLocaleString()}</Descriptions.Item>
              )}
              <Descriptions.Item label="Created">{new Date(previewExam.createdAt).toLocaleString()}</Descriptions.Item>
            </Descriptions>
            <Divider />
            <Typography.Title level={5}>Questions ({previewQuestions.length})</Typography.Title>
            {previewQuestions.length === 0 ? (
              <Typography.Text type="secondary">No questions added yet.</Typography.Text>
            ) : (
              <List
                dataSource={previewQuestions}
                renderItem={(q, idx) => (
                  <List.Item>
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Space>
                        <Typography.Text strong>Q{idx + 1}:</Typography.Text>
                        <Tag color={q.type === 'MCQ' ? 'blue' : q.type === 'VIGNETTE_MCQ' ? 'purple' : 'default'}>{q.type}</Tag>
                        <Tag color={q.difficulty === 'EASY' ? 'green' : q.difficulty === 'MEDIUM' ? 'orange' : 'red'}>{q.difficulty}</Tag>
                      </Space>
                      {q.vignette?.text && (
                        <Typography.Paragraph style={{ margin: 0, padding: '8px', background: '#f5f5f5', borderRadius: 4 }}>
                          <Typography.Text strong>Vignette: </Typography.Text>
                          {q.vignette.text}
                        </Typography.Paragraph>
                      )}
                      <Typography.Paragraph style={{ margin: 0 }}>{q.stem}</Typography.Paragraph>
                      {q.options && q.options.length > 0 && (
                        <List
                          size="small"
                          dataSource={q.options}
                          renderItem={(opt, optIdx) => (
                            <List.Item style={{ padding: '4px 0' }}>
                              <Space>
                                <Typography.Text>{String.fromCharCode(65 + optIdx)}.</Typography.Text>
                                <Typography.Text style={{ color: opt.isCorrect ? '#52c41a' : 'inherit' }}>
                                  {opt.text} {opt.isCorrect && <Tag color="green" size="small">Correct</Tag>}
                                </Typography.Text>
                              </Space>
                            </List.Item>
                          )}
                        />
                      )}
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </Space>
        ) : (
          <Typography.Text>No exam selected</Typography.Text>
        )}
      </Drawer>
    </Space>
  );
}

