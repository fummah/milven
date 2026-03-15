import React, { useEffect, useMemo, useState } from 'react';
import { Card, Table, Space, Button, Typography, Tag, Popconfirm, message, Tooltip, Select, Modal, Form, Input, InputNumber, Tabs, Drawer, Descriptions, Divider, List, Row, Col } from 'antd';
import { EditOutlined, DeleteOutlined, EyeOutlined, CheckCircleOutlined, StopOutlined, ScheduleOutlined, PlusOutlined, FilterOutlined, FileTextOutlined, UserOutlined, TeamOutlined, ClockCircleOutlined, QuestionCircleOutlined, FormOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { api } from '../../lib/api';
import { GradeAttemptDrawer } from '../../components/GradeAttemptDrawer.jsx';

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
  const [pendingAttempts, setPendingAttempts] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [completedAttempts, setCompletedAttempts] = useState([]);
  const [completedLoading, setCompletedLoading] = useState(false);
  const [completedFilterExamName, setCompletedFilterExamName] = useState('');
  const [attemptsModalOpen, setAttemptsModalOpen] = useState(false);
  const [attemptsModalExam, setAttemptsModalExam] = useState(null);
  const [attemptsModalLoading, setAttemptsModalLoading] = useState(false);
  const [attemptsModalList, setAttemptsModalList] = useState([]);
  const [gradeDrawerOpen, setGradeDrawerOpen] = useState(false);
  const [gradeDrawerAttemptId, setGradeDrawerAttemptId] = useState(null);
  const navigate = useNavigate();

  const loadPendingAttempts = async () => {
    setPendingLoading(true);
    try {
      const { data } = await api.get('/api/exams/attempts/pending-marking');
      setPendingAttempts(data.attempts || []);
    } catch {
      setPendingAttempts([]);
    } finally {
      setPendingLoading(false);
    }
  };

  const loadCompletedAttempts = async () => {
    setCompletedLoading(true);
    try {
      const { data } = await api.get('/api/exams/attempts/completed-marking');
      setCompletedAttempts(data.attempts || []);
    } catch {
      setCompletedAttempts([]);
    } finally {
      setCompletedLoading(false);
    }
  };

  const openAttemptsModal = async (exam) => {
    setAttemptsModalExam(exam);
    setAttemptsModalOpen(true);
    setAttemptsModalLoading(true);
    try {
      const { data } = await api.get(`/api/exams/${exam.id}/attempts`);
      setAttemptsModalList(data.attempts || []);
    } catch {
      setAttemptsModalList([]);
      message.error('Failed to load attempts');
    } finally {
      setAttemptsModalLoading(false);
    }
  };

  const closeAttemptsModal = () => {
    setAttemptsModalOpen(false);
    setAttemptsModalExam(null);
    setAttemptsModalList([]);
  };

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
    if (activeTab === 'pending') loadPendingAttempts();
    if (activeTab === 'completed') loadCompletedAttempts();
  }, [activeTab]);

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
      return exams.filter(e => e.createdBy === null || e.createdBy === undefined);
    } else {
      return exams.filter(e => e.createdBy !== null && e.createdBy !== undefined);
    }
  }, [exams, activeTab]);

  const filteredCompletedAttempts = useMemo(() => {
    if (!completedFilterExamName?.trim()) return completedAttempts;
    const q = completedFilterExamName.trim().toLowerCase();
    return completedAttempts.filter((a) => (a.examName || '').toLowerCase().includes(q));
  }, [completedAttempts, completedFilterExamName]);

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
    { 
      title: 'Exam', 
      dataIndex: 'name', 
      width: 220,
      render: (name, exam) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className={`icon-badge-sm ${exam.type === 'QUIZ' ? 'icon-badge-blue' : 'icon-badge-purple'}`}>
            <FileTextOutlined style={{ fontSize: 14 }} />
          </div>
          <div>
            <Typography.Text strong style={{ display: 'block', color: '#1e293b' }}>
              {name}
            </Typography.Text>
            <Tag size="small" color={exam.type === 'QUIZ' ? 'blue' : 'purple'} style={{ fontSize: 10 }}>
              {exam.type || 'EXAM'}
            </Tag>
          </div>
        </div>
      )
    },
    { title: 'Course', dataIndex: 'courseId', width: 150, render: v => v ? (courseMap[v]?.name || v) : <Tag>No course</Tag> },
    { 
      title: 'Creator', 
      width: 160,
      render: (_, exam) => {
        if (exam.createdBy) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="icon-badge-sm icon-badge-orange">
                <UserOutlined style={{ fontSize: 12 }} />
              </div>
              <Typography.Text style={{ fontSize: 12 }}>
                {exam.createdBy.name || exam.createdBy.email || 'Student'}
              </Typography.Text>
            </div>
          );
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="icon-badge-sm icon-badge-navy">
              <UserOutlined style={{ fontSize: 12 }} />
            </div>
            <Typography.Text style={{ fontSize: 12 }}>Admin</Typography.Text>
          </div>
        );
      }
    },
    { 
      title: 'Questions', 
      width: 100,
      dataIndex: 'questionCount',
      render: (count) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <QuestionCircleOutlined style={{ color: '#64748b' }} />
          <span>{count || 0}</span>
        </div>
      )
    },
    {
      title: 'Period',
      width: 180,
      render: (_, exam) => {
        const timeRange = getExamTimeRange(exam);
        return (
          <Space direction="vertical" size={0}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <ClockCircleOutlined style={{ fontSize: 11, color: '#22c55e' }} />
              <Typography.Text style={{ fontSize: 11, color: '#64748b' }}>{timeRange.start}</Typography.Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <ClockCircleOutlined style={{ fontSize: 11, color: '#ef4444' }} />
              <Typography.Text style={{ fontSize: 11, color: '#64748b' }}>{timeRange.end}</Typography.Text>
            </div>
          </Space>
        );
      }
    },
    {
      title: 'Status',
      width: 100,
      render: (_, exam) => {
        const statusInfo = getExamStatus(exam);
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      }
    },
    {
      title: 'Attempts',
      width: 90,
      dataIndex: 'attemptCount',
      render: (count, exam) => (
        <button
          type="button"
          onClick={() => openAttemptsModal(exam)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: '#0c4a6e'
          }}
        >
          <TeamOutlined style={{ color: '#64748b' }} />
          <span>{count || 0}</span>
        </button>
      )
    },
    { title: 'Active', dataIndex: 'active', width: 80, render: v => (
      v ? <Tag color="success">Active</Tag> : <Tag>Inactive</Tag>
    )},
    {
      title: 'Actions',
      width: 160,
      fixed: 'right',
      render: (_, r) => (
        <Space size={6}>
          <Tooltip title="Preview">
            <button className="action-btn action-btn-view" onClick={() => openPreview(r)}>
              <EyeOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Edit">
            <button className="action-btn action-btn-edit" onClick={() => navigate(`/admin/exams/${r.id}/edit`)}>
              <EditOutlined />
            </button>
          </Tooltip>
          {r.active ? (
            <Tooltip title="Deactivate">
              <button 
                className="action-btn" 
                style={{ background: 'linear-gradient(135deg, #fef3c7, #fde68a)', color: '#d97706' }}
                onClick={() => setActive(r, false)}
              >
                <StopOutlined />
              </button>
            </Tooltip>
          ) : (
            <Tooltip title="Activate">
              <button 
                className="action-btn" 
                style={{ background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)', color: '#16a34a' }}
                onClick={() => setActive(r, true)}
              >
                <CheckCircleOutlined />
              </button>
            </Tooltip>
          )}
          <Popconfirm title="Delete exam?" onConfirm={() => remove(r)}>
            <Tooltip title="Delete">
              <button className="action-btn action-btn-delete">
                <DeleteOutlined />
              </button>
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
      title: 'Candidate',
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

  const attemptColumns = [
    {
      title: 'Candidate',
      dataIndex: ['user', 'name'],
      key: 'student',
      width: 220,
      render: (_, attempt) => attempt.user ? (attempt.user.name || attempt.user.email || 'Unknown') : '—'
    },
    {
      title: 'Submitted',
      dataIndex: 'submittedAt',
      key: 'submittedAt',
      width: 160,
      render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'
    },
    {
      title: 'Score',
      dataIndex: 'scorePercent',
      key: 'scorePercent',
      width: 120,
      render: (v) => (v != null ? `${Math.round(v)}%` : '—')
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (v) => v ? <Tag color={v === 'SUBMITTED' ? 'blue' : 'default'}>{v}</Tag> : '—'
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, attempt) => (
        <Button
          type="primary"
          size="small"
          onClick={() => {
            setGradeDrawerAttemptId(attempt.id);
            setGradeDrawerOpen(true);
          }}
        >
          View
        </Button>
      )
    }
  ];

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <Typography.Title level={2} className="page-header-title">
            Exams
          </Typography.Title>
          <div className="page-header-subtitle">
            Create, manage, and monitor exam assessments
          </div>
        </div>
        <Button 
          type="primary" 
          size="large"
          icon={<PlusOutlined />}
          onClick={() => {
            setPoolOpen(true);
            poolForm.resetFields();
            poolForm.setFieldsValue({
              examType: 'COURSE',
              difficulties: ['MEDIUM'],
              questionCount: 20,
              timeLimitMinutes: 90,
              replaceExisting: true
            });
          }}
          style={{ 
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            border: 'none',
            borderRadius: 12,
            height: 44,
            paddingInline: 24,
            fontWeight: 600
          }}
        >
          Create from Pool
        </Button>
      </div>

      {/* Filters Card */}
      <Card 
        className="modern-card" 
        styles={{ body: { padding: '16px 24px' } }}
      >
        <Space wrap size={12} style={{ width: '100%' }}>
          <Select
            allowClear
            placeholder="Filter by type"
            style={{ width: 160 }}
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
            style={{ width: 220 }}
            value={filterCourseId}
            onChange={(v) => { setFilterCourseId(v); setFilterTopicId(undefined); }}
            options={(courses || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => ({ label: `${c.name}`, value: c.id }))}
            optionFilterProp="label"
          />
          <Select
            allowClear
            showSearch
            placeholder="Filter by topic"
            style={{ width: 220 }}
            value={filterTopicId}
            onChange={setFilterTopicId}
            options={topicOptions}
            optionFilterProp="label"
          />
          <Button 
            icon={<FilterOutlined />}
            style={{ borderRadius: 10 }}
          >
            Apply Filters
          </Button>
        </Space>
      </Card>

      {/* Exams Table */}
      <Card className="modern-card" styles={{ body: { padding: 0 } }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          className="modern-tabs"
          style={{ padding: '0 24px' }}
          items={[
            {
              key: 'admin',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ScheduleOutlined />
                  Admin Exams
                </span>
              ),
              children: (
                <div className="modern-table">
                  <Table 
                    rowKey="id" 
                    loading={loading} 
                    dataSource={filteredExams} 
                    columns={adminColumns}
                    scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 20, style: { padding: '16px 0' } }}
                  />
                </div>
              )
            },
            {
              key: 'student',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TeamOutlined />
                  Student Exams
                </span>
              ),
              children: (
                <div className="modern-table">
                  <Table 
                    rowKey="id" 
                    loading={loading} 
                    dataSource={filteredExams} 
                    columns={studentColumns}
                    scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 20, style: { padding: '16px 0' } }}
                  />
                </div>
              )
            },
            {
              key: 'pending',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FormOutlined />
                  Pending marking
                  {pendingAttempts.length > 0 && (
                    <Tag color="orange">{pendingAttempts.length}</Tag>
                  )}
                </span>
              ),
              children: (
                <div className="modern-table">
                  <Table
                    rowKey="id"
                    loading={pendingLoading}
                    dataSource={pendingAttempts}
                    scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 15, style: { padding: '16px 0' } }}
                    columns={[
                      { title: 'Exam', dataIndex: 'examName', key: 'examName', width: 200, render: (v) => v || '—' },
                      { title: 'Candidate', dataIndex: ['user', 'name'], key: 'user', width: 200, render: (_, r) => r?.user?.name || r?.user?.email || '—' },
                      { title: 'Submitted', dataIndex: 'submittedAt', key: 'submittedAt', width: 160, render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—' },
                      { title: 'To mark', dataIndex: 'pendingCount', key: 'pendingCount', width: 100, render: (c) => <Tag color="orange">{c ?? 0} question(s)</Tag> },
                      {
                        title: 'Actions',
                        key: 'actions',
                        width: 120,
                        render: (_, row) => (
                          <Button type="primary" size="small" icon={<FormOutlined />} onClick={() => { setGradeDrawerAttemptId(row.id); setGradeDrawerOpen(true); }}>
                            Mark
                          </Button>
                        )
                      }
                    ]}
                    locale={{ emptyText: 'No submitted exams waiting for marking. When students submit exams with constructed response questions, they will appear here.' }}
                  />
                </div>
              )
            },
            {
              key: 'completed',
              label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircleOutlined />
                  Completed marking
                </span>
              ),
              children: (
                <div className="modern-table">
                  <Space direction="vertical" size={12} style={{ width: '100%', marginBottom: 16 }}>
                    <Space wrap>
                      <Typography.Text>Filter by exam name:</Typography.Text>
                      <Input
                        placeholder="Search exam name..."
                        value={completedFilterExamName}
                        onChange={(e) => setCompletedFilterExamName(e.target.value)}
                        allowClear
                        style={{ width: 220 }}
                      />
                    </Space>
                  </Space>
                  <Table
                    rowKey="id"
                    loading={completedLoading}
                    dataSource={filteredCompletedAttempts}
                    scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 15, style: { padding: '16px 0' } }}
                    columns={[
                      { title: 'Exam', dataIndex: 'examName', key: 'examName', width: 200, render: (v) => v || '—' },
                      { title: 'Candidate', dataIndex: ['user', 'name'], key: 'user', width: 200, render: (_, r) => r?.user?.name || r?.user?.email || '—' },
                      { title: 'Submitted', dataIndex: 'submittedAt', key: 'submittedAt', width: 160, render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—' },
                      { title: 'Score', dataIndex: 'scorePercent', key: 'scorePercent', width: 100, render: (v) => (v != null ? `${Math.round(v)}%` : '—') },
                      {
                        title: 'Actions',
                        key: 'actions',
                        width: 120,
                        render: (_, row) => (
                          <Button size="small" icon={<EyeOutlined />} onClick={() => { setGradeDrawerAttemptId(row.id); setGradeDrawerOpen(true); }}>
                            View
                          </Button>
                        )
                      }
                    ]}
                    locale={{ emptyText: 'No completed marking yet. Completed attempts will appear here after all constructed response questions are marked.' }}
                  />
                </div>
              )
            }
          ]}
        />
      </Card>

			<Modal
				title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-badge-sm icon-badge-orange">
              <ScheduleOutlined />
            </div>
            <span>Create Exam from Question Pool</span>
          </div>
        }
				open={poolOpen}
				onCancel={() => {
					setPoolOpen(false);
					poolForm.resetFields();
				}}
				confirmLoading={poolLoading}
				okText="Create Exam"
				onOk={(e) => {
					e.preventDefault();
					poolForm.submit();
				}}
        className="modern-modal"
        okButtonProps={{ 
          style: { borderRadius: 10, background: 'linear-gradient(135deg, #f97316, #ea580c)', border: 'none' }
        }}
        cancelButtonProps={{ style: { borderRadius: 10 } }}
			>
				<Form
					layout="vertical"
					form={poolForm}
					initialValues={{ questionType: 'ANY' }}
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
								replaceExisting: true,
								questionType: values.questionType || 'ANY'
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
					<Row gutter={16}>
						<Col xs={24} sm={12}>
							<Form.Item name="name" label="Name" rules={[{ required: true, min: 3 }]}>
								<Input placeholder="Example: Course Exam 1" />
							</Form.Item>
						</Col>
						<Col xs={24} sm={12}>
							<Form.Item name="examType" label="Type" rules={[{ required: true }]}>
								<Select
									options={[
										{ label: 'Course Exam', value: 'COURSE' },
										{ label: 'Topic Quiz', value: 'QUIZ' }
									]}
								/>
							</Form.Item>
						</Col>
					</Row>
					<Row gutter={16}>
						<Col xs={24} sm={12}>
							<Form.Item name="courseId" label="Course" rules={[{ required: true }]}>
								<Select
									showSearch
									placeholder="Select course"
									options={(courses || [])
										.slice()
										.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
										.map(c => ({ label: c.name, value: c.id }))}
									optionFilterProp="label"
									onChange={(v) => {
										poolForm.setFieldsValue({ topicId: undefined });
										const course = (courses || []).find(c => c.id === v);
										const level = course?.level;
										// Level-based question type defaults and restrictions
										let defaultType = 'ANY';
										if (level === 'LEVEL1') defaultType = 'MCQ';
										else if (level === 'LEVEL2') defaultType = 'VIGNETTE_MCQ';
										else if (level === 'LEVEL3') defaultType = 'CONSTRUCTED_RESPONSE';
										poolForm.setFieldsValue({ questionType: defaultType });
									}}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={12}>
							<Form.Item name="questionType" label="Question Type" rules={[{ required: true }]}>
								<Select
									placeholder="Question type"
									options={(function () {
										const courseId = poolForm.getFieldValue('courseId');
										if (!courseId) {
											return [
												{ label: 'Any', value: 'ANY' },
												{ label: 'MCQ', value: 'MCQ' },
												{ label: 'Vignette MCQ', value: 'VIGNETTE_MCQ' },
												{ label: 'Constructed Response', value: 'CONSTRUCTED_RESPONSE' }
											];
										}
										const course = (courses || []).find(c => c.id === courseId);
										const level = course?.level;
										if (level === 'LEVEL1') {
											return [{ label: 'MCQ', value: 'MCQ' }];
										}
										if (level === 'LEVEL2') {
											return [{ label: 'Vignette MCQ', value: 'VIGNETTE_MCQ' }];
										}
										if (level === 'LEVEL3') {
											return [
												{ label: 'Vignette MCQ', value: 'VIGNETTE_MCQ' },
												{ label: 'Constructed Response', value: 'CONSTRUCTED_RESPONSE' }
											];
										}
										return [
											{ label: 'Any', value: 'ANY' },
											{ label: 'MCQ', value: 'MCQ' },
											{ label: 'Vignette MCQ', value: 'VIGNETTE_MCQ' },
											{ label: 'Constructed Response', value: 'CONSTRUCTED_RESPONSE' }
										];
									})()}
								/>
							</Form.Item>
						</Col>
					</Row>
					<Form.Item noStyle shouldUpdate>
						{({ getFieldValue }) => {
							const examType = getFieldValue('examType');
							const cid = getFieldValue('courseId');
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
					<Row gutter={16}>
						<Col xs={24} sm={8}>
							<Form.Item name="difficulties" label="Difficulty">
								<Select
									mode="multiple"
									allowClear
									placeholder="Select difficulties"
									options={[
										{ label: 'Easy', value: 'EASY' },
										{ label: 'Medium', value: 'MEDIUM' },
										{ label: 'Hard', value: 'HARD' }
									]}
								/>
							</Form.Item>
						</Col>
						<Col xs={24} sm={8}>
							<Form.Item name="questionCount" label="Question Count" rules={[{ required: true }]}>
								<InputNumber min={1} max={200} style={{ width: '100%' }} />
							</Form.Item>
						</Col>
						<Col xs={24} sm={8}>
							<Form.Item name="timeLimitMinutes" label="Time Limit (min)" rules={[{ required: true }]}>
								<InputNumber min={10} max={360} style={{ width: '100%' }} />
							</Form.Item>
						</Col>
					</Row>
				</Form>
			</Modal>

      {/* Exam Preview Drawer */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-badge-sm icon-badge-blue">
              <EyeOutlined />
            </div>
            <span>{previewExam ? `${previewExam.type === 'QUIZ' ? 'Quiz' : 'Exam'} Preview: ${previewExam.name}` : 'Exam Preview'}</span>
          </div>
        }
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewExam(null);
          setPreviewQuestions([]);
        }}
        width={820}
        className="modern-drawer"
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
                  <Tag color="orange">Candidate: {previewExam.createdBy.name || previewExam.createdBy.email || 'Unknown'}</Tag>
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

      <Modal
        title={attemptsModalExam ? `Attempts: ${attemptsModalExam.name}` : 'Exam Attempts'}
        open={attemptsModalOpen}
        onCancel={closeAttemptsModal}
        footer={null}
        width={900}
        destroyOnClose
      >
        <Table
          rowKey="id"
          loading={attemptsModalLoading}
          dataSource={attemptsModalList}
          columns={attemptColumns}
          pagination={{ pageSize: 10, style: { margin: 0 } }}
          locale={{ emptyText: 'No attempts yet.' }}
        />
      </Modal>

      <GradeAttemptDrawer
        attemptId={gradeDrawerAttemptId}
        open={gradeDrawerOpen}
        onClose={() => { setGradeDrawerOpen(false); setGradeDrawerAttemptId(null); }}
        onSaved={() => loadPendingAttempts()}
      />
    </Space>
  );
}

