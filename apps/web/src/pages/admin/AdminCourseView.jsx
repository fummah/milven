import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Card, Descriptions, Typography, Space, Button, Tabs, Table, Tag, Select, Form, Input, Modal, Upload, Drawer, message, Steps, Radio, Divider, List, Layout, Grid, Pagination } from 'antd';
import { ArrowLeftOutlined, UploadOutlined, EditOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, CheckCircleOutlined, StopOutlined, InfoCircleOutlined, TeamOutlined, ReadOutlined, FileTextOutlined, ExperimentOutlined, DollarOutlined, FolderOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

export function AdminCourseView() {
  const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
  const asUrl = (u) => {
    if (!u) return u;
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    if (u.startsWith('/uploads')) return `${API_URL}${u}`;
    return u;
  };
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [materialsByTopic, setMaterialsByTopic] = useState({});
  const [lmTopicId, setLmTopicId] = useState();
  const [lmLoading, setLmLoading] = useState(false);
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [topicForm] = Form.useForm();
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [materialForm] = Form.useForm();
  const [savingTopic, setSavingTopic] = useState(false);
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [topicDrawerOpen, setTopicDrawerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewTopicId, setPreviewTopicId] = useState(null);
  const [previewQuiz, setPreviewQuiz] = useState(null);
  const [previewQuestions, setPreviewQuestions] = useState([]);
  const [topicStep, setTopicStep] = useState(0); // 0 = details, 1 = materials
  const [materialEditing, setMaterialEditing] = useState(null);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [activeTabKey, setActiveTabKey] = useState('general');
  const [examViewOpen, setExamViewOpen] = useState(false);
  const [examViewLoading, setExamViewLoading] = useState(false);
  const [examViewExam, setExamViewExam] = useState(null);
  const [examViewQuestions, setExamViewQuestions] = useState([]);
  const [learningPreviewOpen, setLearningPreviewOpen] = useState(false);
  const [moduleDrawerOpen, setModuleDrawerOpen] = useState(false);
  const [moduleForm] = Form.useForm();
  const [savingModule, setSavingModule] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionDrawerOpen, setQuestionDrawerOpen] = useState(false);
  const [questionForm] = Form.useForm();
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [currentVolumePage, setCurrentVolumePage] = useState(1);

  const addQuiz = (topic) => {
    // Navigate to exam builder; could pass query params in the future
    const back = encodeURIComponent(`/admin/courses/${id}?tab=topics`);
    const params = new URLSearchParams({
      mode: 'quiz',
      back,
      courseId: String(id),
      topicId: topic?.id || ''
    }).toString();
    navigate(`/admin/exams/builder?${params}`);
  };

  const deleteTopic = async (topic) => {
    try {
      await api.delete(`/api/cms/topics/${topic.id}`);
      message.success('Topic deleted');
      await fetchDetail();
    } catch {
      message.error('Delete failed');
    }
  };

  const openModuleDrawer = async () => {
    const modulesList = detail?.modules ?? [];
    const maxOrder = modulesList.length ? Math.max(...modulesList.map(m => m.order ?? 0), 0) : 0;
    moduleForm.resetFields();
    moduleForm.setFieldsValue({ name: '', level: course?.level ?? 'LEVEL1', order: maxOrder + 1, volumeId: undefined });
    // Ensure volumes are loaded for this course
    if (id && detail?.volumes?.length === 0) {
      try {
        const { data } = await api.get(`/api/cms/courses/${id}`);
        if (data?.volumes) {
          setDetail(prev => ({ ...prev, volumes: data.volumes }));
        }
      } catch {
        // Silently fail, volumes might be empty
      }
    }
    setModuleDrawerOpen(true);
  };

  const saveNewModule = async (values) => {
    try {
      setSavingModule(true);
      await api.post('/api/cms/modules', {
        name: values.name,
        courseId: String(id),
        volumeId: values.volumeId,
        level: values.level || course?.level,
        order: values.order != null ? Number(values.order) : undefined
      });
      message.success('Module created');
      await fetchDetail();
      setModuleDrawerOpen(false);
      moduleForm.resetFields();
    } catch {
      message.error('Failed to create module');
    } finally {
      setSavingModule(false);
    }
  };

  const openPreview = async (topicId) => {
    const back = encodeURIComponent(`/admin/courses/${id}?tab=topics`);
    navigate(`/admin/courses/${id}/preview?topicId=${topicId}&back=${back}`);
  };
  const fetchDetail = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/cms/courses/${id}`);
      setDetail(data);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchQuestions = async () => {
    setQuestionsLoading(true);
    try {
      const { data } = await api.get('/api/cms/questions', { params: { courseId: id } });
      setQuestions(data.questions || []);
    } catch {
      setQuestions([]);
    } finally {
      setQuestionsLoading(false);
    }
  };

  const loadTopicsForCourse = async () => {
    try {
      const { data } = await api.get('/api/cms/topics', { params: { courseId: id } });
      return data?.topics || [];
    } catch {
      return [];
    }
  };

  const submitQuestion = async (values) => {
    try {
      setSubmittingQuestion(true);
      const chosenTopicId = values.topicId;
      const topicsList = await loadTopicsForCourse();
      const t = topicsList.find(x => x.id === chosenTopicId);
      await api.post('/api/cms/questions', {
        stem: values.stem,
        type: values.type,
        level: t?.level ?? course?.level ?? 'LEVEL1',
        difficulty: values.difficulty,
        topicId: chosenTopicId,
        marks: values.marks ? Number(values.marks) : undefined,
        vignetteText: values.type === 'VIGNETTE_MCQ' ? (values.vignetteText || undefined) : undefined,
        options: values.type !== 'CONSTRUCTED_RESPONSE'
          ? (values.options || []).map(o => ({ text: o.text, isCorrect: !!o.isCorrect }))
          : []
      });
      message.success('Question created');
      questionForm.resetFields();
      questionForm.setFieldsValue({ courseId: id });
      setQuestionDrawerOpen(false);
      fetchQuestions();
    } catch (e) {
      message.error(e?.response?.data?.error || 'Failed to create question');
    } finally {
      setSubmittingQuestion(false);
    }
  };

  const openExamView = async (examRow) => {
    try {
      setExamViewLoading(true);
      const { data: ed } = await api.get(`/api/exams/${examRow.id}`);
      const exam = ed.exam;
      setExamViewExam(exam);
      // Use questions linked to this exam only (not all questions by level/topic)
      const { data: ql } = await api.get(`/api/exams/${examRow.id}/questions`);
      setExamViewQuestions(ql.questions || []);
      setExamViewOpen(true);
    } catch (e) {
      message.error('Failed to load exam');
    } finally {
      setExamViewLoading(false);
    }
  };

  useEffect(() => { fetchDetail(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const tab = p.get('tab');
    if (tab) setActiveTabKey(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
  useEffect(() => {
    if (activeTabKey === 'questions') {
      fetchQuestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabKey, id]);

  const course = detail?.course;
  // Topics sorted by module order then topic order (for preview sidebar and learning list)
  const sortedTopicsForDisplay = React.useMemo(() => {
    const list = (detail?.topics || []).slice();
    return list.sort((a, b) => {
      const moA = a.module?.order ?? 999, moB = b.module?.order ?? 999;
      if (moA !== moB) return moA - moB;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }, [detail?.topics]);

  const loadMaterialsFor = async (topicId) => {
    if (!topicId || materialsByTopic[topicId]) return;
    try {
      setMaterialsLoading(true);
      const { data } = await api.get(`/api/cms/topics/${topicId}/materials`);
      setMaterialsByTopic(prev => ({ ...prev, [topicId]: data.materials || [] }));
    } catch {
      setMaterialsByTopic(prev => ({ ...prev, [topicId]: [] }));
    } finally {
      setMaterialsLoading(false);
    }
  };

  const openEditTopicDrawer = async (topic) => {
    setSelectedTopic(topic);
    topicForm.setFieldsValue({
      name: topic.name,
      moduleId: topic.moduleId ?? ''
    });
    await loadMaterialsFor(topic.id);
    setTopicStep(0);
    setActiveTabKey('topics');
    setTopicDrawerOpen(true);
  };

  const saveNewTopic = async (values) => {
    try {
      setSavingTopic(true);
      const { data } = await api.post('/api/cms/topics', {
        name: values.name,
        courseId: String(id),
        moduleId: values.moduleId || undefined,
        level: course.level
      });
      const created = data?.topic;
      if (created?.id) {
        // move to materials stage for the newly created topic
        setSelectedTopic(created);
        await fetchDetail();
        await loadMaterialsFor(created.id);
        setTopicStep(1);
        message.success('Topic created');
      }
    } catch {
      // surface in UI if needed
    } finally {
      setSavingTopic(false);
    }
  };

  const saveMaterial = async (values) => {
    if (!selectedTopic) return;
    try {
      setSavingMaterial(true);
      if (materialEditing?.id) {
        await api.put(`/api/cms/materials/${materialEditing.id}`, values);
      } else {
        await api.post(`/api/cms/topics/${selectedTopic.id}/materials`, values);
      }
      materialForm.resetFields();
      setMaterialEditing(null);
      // refresh this topic's materials
      setMaterialsLoading(true);
      const { data } = await api.get(`/api/cms/topics/${selectedTopic.id}/materials`);
      setMaterialsByTopic(prev => ({ ...prev, [selectedTopic.id]: data.materials || [] }));
      message.success(materialEditing ? 'Material updated' : 'Material added');
    } finally {
      setMaterialsLoading(false);
      setSavingMaterial(false);
    }
  };

  const removeMaterial = async (row, topicId) => {
    try {
      await api.delete(`/api/cms/materials/${row.id}`);
      const tId = topicId || row.topicId || selectedTopic?.id;
      if (tId) {
        const { data } = await api.get(`/api/cms/topics/${tId}/materials`);
        setMaterialsByTopic(prev => ({ ...prev, [tId]: data.materials || [] }));
      }
      message.success('Material deleted');
    } catch {
      message.error('Delete failed');
    }
  };

  const materialsColumns = [
    { title: 'Title', dataIndex: 'title' },
    { title: 'Kind', dataIndex: 'kind' },
    { title: 'URL', dataIndex: 'url', render: (v) => v ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : '-' },
    { title: 'Updated', dataIndex: 'updatedAt', render: v => v ? new Date(v).toLocaleString() : '-' },
    {
      title: 'Actions',
      render: (_, row) => (
        <Button
          size="small"
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeMaterial(row, row.topicId || selectedTopic?.id)}
        />
      )
    }
  ];
  // For the expandable table under Topics tab, hide the URL column
  const materialsColumnsNoUrl = materialsColumns.filter(c => c.dataIndex !== 'url');

  const general = (
    <Descriptions column={1} bordered size="middle">
      <Descriptions.Item label="Name">{course?.name}</Descriptions.Item>
      <Descriptions.Item label="Level">{course?.level}</Descriptions.Item>
      <Descriptions.Item label="Active">{course?.active ? 'Yes' : 'No'}</Descriptions.Item>
      <Descriptions.Item label="Duration (hrs)">{course?.durationHours ?? '-'}</Descriptions.Item>
      <Descriptions.Item label="Description">{course?.description || '-'}</Descriptions.Item>
      <Descriptions.Item label="Created">{course?.createdAt ? new Date(course.createdAt).toLocaleString() : '-'}</Descriptions.Item>
      <Descriptions.Item label="Updated">{course?.updatedAt ? new Date(course.updatedAt).toLocaleString() : '-'}</Descriptions.Item>
    </Descriptions>
  );

  const studentsColumns = [
    { title: 'First Name', dataIndex: ['user','firstName'] },
    { title: 'Last Name', dataIndex: ['user','lastName'] },
    { title: 'Email', dataIndex: ['user','email'] },
    { title: 'Phone', dataIndex: ['user','phone'] },
    { title: 'Country', dataIndex: ['user','country'] },
    { title: 'Enrolled At', dataIndex: 'createdAt', render: v => v ? new Date(v).toLocaleString() : '-' },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space size={4}>
          <Button
            size="small"
            type="link"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/admin/students/${r.user?.id}`)}
          >
            View
          </Button>
        </Space>
      )
    }
  ];

  const topicsColumns = [
    { title: 'Module', dataIndex: ['module', 'name'], width: 160, render: v => v ? <Tag color="default">{v}</Tag> : '—' },
    { title: 'Topic ID', dataIndex: 'id', width: 220, render: v => <Typography.Text type="secondary" style={{ fontSize: 12 }}>{v}</Typography.Text> },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Level', dataIndex: 'level' },
    { title: 'Created', dataIndex: 'createdAt', render: v => v ? new Date(v).toLocaleString() : '-' },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEditTopicDrawer(r)} />
          <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => openPreview(r.id)} />
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => deleteTopic(r)} />
        </Space>
      )
    }
  ];

  const revColumns = [
    { title: 'Title', dataIndex: 'title' },
    { title: 'Level', dataIndex: 'level' },
    { title: 'URL', dataIndex: 'contentUrl', render: (v) => v ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : '-' },
    { title: 'Created', dataIndex: 'createdAt', render: v => v ? new Date(v).toLocaleString() : '-' }
  ];

  const examsColumns = [
    { title: 'Name', dataIndex: 'name' },
    { title: 'Type', key: 'type', render: (_, r) => {
      const isQuiz = (r.type === 'QUIZ') || (typeof r.name === 'string' && r.name.toLowerCase().includes('quiz'));
      return <Tag color={isQuiz ? 'orange' : 'blue'}>{isQuiz ? 'Topic Quiz' : 'Course Exam'}</Tag>;
    }},
    { title: 'Active', dataIndex: 'active', render: (v) => v ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag> },
    { title: 'Level', dataIndex: 'level' },
    { title: 'Time Limit (min)', dataIndex: 'timeLimitMinutes' },
    { title: 'Start', dataIndex: 'startAt', render: v => v ? new Date(v).toLocaleString() : '—' },
    { title: 'End', dataIndex: 'endAt', render: v => v ? new Date(v).toLocaleString() : '—' },
    { title: 'Created', dataIndex: 'createdAt', render: v => v ? new Date(v).toLocaleString() : '-' },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => openExamView(r)} />
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() => {
              const backUrl =
                (r.type === 'QUIZ' || (r.name || '').toLowerCase().includes('quiz'))
                  ? `/admin/courses/${id}?tab=topics`
                  : `/admin/courses/${id}?tab=exams`;
              navigate(`/admin/exams/${r.id}/edit?back=${encodeURIComponent(backUrl)}`);
            }}
          />
          <Button
            size="small"
            type="text"
            icon={r.active ? <StopOutlined /> : <CheckCircleOutlined />}
            onClick={async () => {
              try {
                await api.put(`/api/exams/${r.id}`, { active: !r.active });
                message.success(r.active ? 'Deactivated' : 'Activated');
                await fetchDetail();
              } catch {
                message.error('Update failed');
              }
            }}
          />
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={async () => {
              try {
                await api.delete(`/api/exams/${r.id}`);
                message.success('Deleted');
                await fetchDetail();
              } catch {
                message.error('Delete failed');
              }
            }}
          />
        </Space>
      )
    }
  ];

  const prodColumns = [
    { title: 'Name', dataIndex: 'name' },
    { title: 'Price', dataIndex: 'priceCents', render: v => `$${(v/100).toFixed(2)}` },
    { title: 'Interval', dataIndex: 'interval', render: i => i === 'MONTHLY' ? 'Monthly' : i === 'YEARLY' ? 'Yearly' : 'One‑time' },
    { title: 'Active', dataIndex: 'active', render: v => v ? 'Yes' : 'No' }
  ];

  const subsColumns = [
    { title: 'User', dataIndex: 'userId' },
    { title: 'Provider', dataIndex: 'provider' },
    { title: 'Status', dataIndex: 'status', render: s => <Tag color={s === 'ACTIVE' ? 'green' : s === 'PAST_DUE' ? 'orange' : s === 'CANCELED' ? 'red' : 'blue'}>{s}</Tag> },
    { title: 'Plan', dataIndex: 'plan', render: v => v || '-' },
    { title: 'Currency', dataIndex: 'currency', render: v => v || '-' },
    { title: 'Current Period End', dataIndex: 'currentPeriodEnd', render: v => v ? new Date(v).toLocaleString() : '-' },
    { title: 'Updated', dataIndex: 'updatedAt', render: v => v ? new Date(v).toLocaleString() : '-' }
  ];

  const questionsColumns = [
    { title: 'Question', dataIndex: 'stem', render: (text) => text.length > 100 ? `${text.substring(0, 100)}...` : text },
    { title: 'Type', dataIndex: 'type', render: (type) => <Tag>{type}</Tag> },
    { title: 'Difficulty', dataIndex: 'difficulty', render: (difficulty) => <Tag color={difficulty === 'EASY' ? 'green' : difficulty === 'MEDIUM' ? 'orange' : 'red'}>{difficulty}</Tag> },
    { title: 'Level', dataIndex: 'level' },
    { title: 'Topic', dataIndex: ['topic', 'name'], render: (_, record) => {
      const topic = detail?.topics?.find(t => t.id === record.topicId);
      return topic ? `${topic.module?.name ?? '—'} · ${topic.name}` : '—';
    }},
    { title: 'Created', dataIndex: 'createdAt', render: v => v ? new Date(v).toLocaleString() : '-' },
    {
      title: 'Actions',
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => navigate(`/admin/questions/${record.id}/edit`)} />
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={async () => {
            try {
              await api.delete(`/api/cms/questions/${record.id}`);
              message.success('Question deleted');
              fetchQuestions();
            } catch {
              message.error('Delete failed');
            }
          }} />
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/courses')}>Back</Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {course ? `${course.name} · ${course.level}` : 'Course Details'}
          </Typography.Title>
        </Space>
      </Space>

      <Card loading={loading}>
        {course && (
          <Tabs
            activeKey={activeTabKey}
            onChange={setActiveTabKey}
            items={[
              {
                key: 'general',
                label: (
                  <Space size={6}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#e6f4ff', color: '#102540', border: '1px solid rgba(0,0,0,0.08)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)', fontSize: 14 }}>
                      <InfoCircleOutlined />
                    </span>
                    <span>General</span>
                  </Space>
                ),
                children: general
              },
              {
                key: 'students',
                label: (
                  <Space size={6}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#e6fffb', color: '#13c2c2', border: '1px solid rgba(0,0,0,0.08)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)', fontSize: 14 }}>
                      <TeamOutlined />
                    </span>
                    <span>Enrolled Students</span>
                  </Space>
                ),
                children: (
                  <Table
                    rowKey="id"
                    size="small"
                    dataSource={course.enrollments || []}
                    columns={studentsColumns}
                    scroll={isMobile ? { x: 'max-content' } : undefined}
                    pagination={false}
                  />
                )
              },
              {
                key: 'topics',
                label: (
                  <Space size={6}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#f9f0ff', color: '#722ed1', border: '1px solid rgba(0,0,0,0.08)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)', fontSize: 14 }}>
                      <ReadOutlined />
                    </span>
                    <span>Modules and Topics</span>
                  </Space>
                ),
                children: (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Space wrap>
                      <Button
                        icon={<FolderOutlined />}
                        onClick={openModuleDrawer}
                      >
                        Add Module
                      </Button>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                          setSelectedTopic(null);
                          topicForm.resetFields();
                          topicForm.setFieldsValue({ moduleId: '' });
                          setTopicStep(0);
                          setActiveTabKey('topics');
                          setTopicDrawerOpen(true);
                        }}
                      >
                        New Topic
                      </Button>
                      <Button
                        type="primary"
                        icon={<EyeOutlined />}
                        onClick={() => navigate(`/admin/courses/${id}/preview`)}
                        style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                      >
                        Preview Learning
                      </Button>
                    </Space>
                    {(() => {
                      const topicTableColumns = [
                        ...topicsColumns.slice(0, topicsColumns.length - 1),
                        {
                          title: 'Quiz',
                          render: (_, rec) => {
                            const quiz = (detail.exams || []).find(e =>
                              e.topicId === rec.id &&
                              (e.type === 'QUIZ' || (typeof e.name === 'string' && e.name.toLowerCase().includes('quiz')))
                            );
                            if (quiz) {
                              return (
                                <Button
                                  size="small"
                                  style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', color: '#fff' }}
                                  icon={<EyeOutlined />}
                                  onClick={() => openExamView(quiz)}
                                >
                                  View Quiz
                                </Button>
                              );
                            }
                            return (
                              <Button size="small" danger icon={<PlusOutlined />} onClick={() => addQuiz(rec)}>
                                Add Quiz
                              </Button>
                            );
                          }
                        },
                        topicsColumns[topicsColumns.length - 1]
                      ];
                      const expandable = {
                        expandedRowRender: (record) => (
                          <Table
                            rowKey="id"
                            size="small"
                            loading={materialsLoading || savingMaterial}
                            dataSource={materialsByTopic[record.id] || []}
                            columns={materialsColumnsNoUrl}
                            pagination={false}
                          />
                        ),
                        onExpand: async (expanded, record) => {
                          if (expanded) await loadMaterialsFor(record.id);
                        }
                      };
                      const modulesList = detail?.modules ?? [];
                      const volumesList = (detail?.volumes ?? []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
                      const standaloneTopics = (detail?.topics ?? []).filter(t => !t.moduleId);
                      
                      // Volume pagination - one volume per page
                      const volumesPerPage = 1; // Show 1 volume per page
                      const totalVolumePages = Math.ceil(volumesList.length / volumesPerPage);
                      const startVolumeIndex = (currentVolumePage - 1) * volumesPerPage;
                      const endVolumeIndex = startVolumeIndex + volumesPerPage;
                      const currentVolumes = volumesList.slice(startVolumeIndex, endVolumeIndex);
                      
                      // Group modules by volume for current page
                      const modulesByVolume = {};
                      modulesList.forEach(mod => {
                        const volId = mod.volumeId;
                        if (currentVolumes.some(v => v.id === volId)) {
                          if (!modulesByVolume[volId]) {
                            modulesByVolume[volId] = [];
                          }
                          modulesByVolume[volId].push(mod);
                        }
                      });
                      
                      // Get volume info for each volumeId
                      const getVolumeInfo = (volId) => {
                        return volumesList.find(v => v.id === volId) || { name: 'Unknown Volume', description: '' };
                      };
                      
                      // Calculate module numbers per volume
                      const getModuleNumber = (mod, volumeId) => {
                        const volumeModules = modulesByVolume[volumeId] || [];
                        const sortedModules = [...volumeModules].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                        return sortedModules.indexOf(mod) + 1;
                      };
                      
                      return (
                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                          {/* Volume Pagination at Top */}
                          {volumesList.length > volumesPerPage && (
                            <Card size="small" style={{ marginBottom: 8 }}>
                              <Space style={{ width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
                                <Pagination
                                  current={currentVolumePage}
                                  total={volumesList.length}
                                  pageSize={volumesPerPage}
                                  size="small"
                                  showSizeChanger={false}
                                  onChange={(page) => setCurrentVolumePage(page)}
                                  showTotal={(total, range) => `Page ${range[0]} of ${total}`}
                                />
                              </Space>
                            </Card>
                          )}
                          
                          {Object.entries(modulesByVolume).map(([volId, mods]) => {
                            const volume = getVolumeInfo(volId);
                            const sortedMods = [...mods].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                            return (
                              <Card 
                                key={volId} 
                                size="small" 
                                title={
                                  <Space direction="vertical" size={0} align="flex-start" style={{ width: '100%' }}>
                                    <Space>
                                      <FolderOutlined style={{ color: '#1890ff' }} />
                                      <Typography.Text strong style={{ color: '#1890ff', fontSize: 16 }}>
                                        Volume {volume.name}
                                      </Typography.Text>
                                    </Space>
                                    {volume.description && (
                                      <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 24 }}>
                                        {volume.description}
                                      </Typography.Text>
                                    )}
                                  </Space>
                                }
                                style={{ borderLeft: '4px solid #1890ff' }}
                              >
                                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                  {sortedMods.map((mod) => {
                                    const moduleNumber = getModuleNumber(mod, volId);
                                    return (
                                      <Card 
                                        key={mod.id} 
                                        size="small" 
                                        style={{ marginLeft: 16, borderLeft: '3px solid #52c41a' }}
                                        title={
                                          <Space>
                                            <ReadOutlined style={{ color: '#52c41a' }} />
                                            <span>Learning Module {moduleNumber}: {mod.name}</span>
                                          </Space>
                                        }
                                      >
                                        <Table
                                          rowKey="id"
                                          size="small"
                                          dataSource={mod.topics || []}
                                          columns={topicTableColumns}
                                          scroll={isMobile ? { x: 'max-content' } : undefined}
                                          pagination={false}
                                          expandable={expandable}
                                        />
                                      </Card>
                                    );
                                  })}
                                </Space>
                              </Card>
                            );
                          })}
                          {standaloneTopics.length > 0 && (
                            <Card size="small" title="Standalone topics">
                              <Table
                                rowKey="id"
                                size="small"
                                dataSource={standaloneTopics}
                                columns={topicTableColumns}
                                scroll={isMobile ? { x: 'max-content' } : undefined}
                                pagination={false}
                                expandable={expandable}
                              />
                            </Card>
                          )}
                          {modulesList.length === 0 && standaloneTopics.length === 0 && (
                            <Typography.Text type="secondary">No topics yet. Add a topic or create modules in Modules & Topics.</Typography.Text>
                          )}
                        </Space>
                      );
                    })()}
                  </Space>
                )
              },
              {
                key: 'materials',
                label: (
                  <Space size={6}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#fff0f6', color: '#eb2f96', border: '1px solid rgba(0,0,0,0.08)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)', fontSize: 14 }}>
                      <FileTextOutlined />
                    </span>
                    <span>Learning Materials</span>
                  </Space>
                ),
                children: (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Space>
                      <Typography.Text>Select topic:</Typography.Text>
                      <Select
                        style={{ minWidth: 260 }}
                        placeholder="Choose topic"
                        value={lmTopicId}
                        onChange={async (v) => {
                          setLmTopicId(v);
                          setLmLoading(true);
                          await loadMaterialsFor(v);
                          setLmLoading(false);
                        }}
                        options={(detail.topics || []).map(t => ({ value: t.id, label: `${t.module?.name ?? '—'} · ${t.name}` }))}
                      />
                    </Space>
                    <Table
                      rowKey="id"
                      size="small"
                      loading={lmLoading}
                      dataSource={lmTopicId ? (materialsByTopic[lmTopicId] || []) : []}
                      columns={materialsColumns}
                      scroll={isMobile ? { x: 'max-content' } : undefined}
                      pagination={false}
                    />
                  </Space>
                )
              },
              {
                key: 'exams',
                label: (
                  <Space size={6}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#fff7e6', color: '#fa8c16', border: '1px solid rgba(0,0,0,0.08)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)', fontSize: 14 }}>
                      <ExperimentOutlined />
                    </span>
                    <span>Exams</span>
                  </Space>
                ),
                children: (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Space align="center">
                      <Button
                        type="primary"
                        onClick={() => {
                          const back = encodeURIComponent(`/admin/courses/${id}?tab=exams`);
                          navigate(`/admin/exams/builder?courseId=${id}&back=${back}`);
                        }}
                      >
                        New Course Exam
                      </Button>
                      <Space size={8}>
                        <Space size={6} align="center">
                          <Tag color="blue" style={{ marginRight: 0 }}>Course Exam</Tag>
                          <Typography.Text type="secondary">Overall course</Typography.Text>
                        </Space>
                        <Space size={6} align="center">
                          <Tag color="orange" style={{ marginRight: 0 }}>Topic Quiz</Tag>
                          <Typography.Text type="secondary">Linked to a topic</Typography.Text>
                        </Space>
                      </Space>
                    </Space>
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={detail.exams || []}
                      columns={examsColumns}
                      scroll={isMobile ? { x: 'max-content' } : undefined}
                      pagination={false}
                    />
                  </Space>
                )
              },
              {
                key: 'questions',
                label: (
                  <Space size={6}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#fff1f0', color: '#f5222d', border: '1px solid rgba(0,0,0,0.08)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)', fontSize: 14 }}>
                      <FileTextOutlined />
                    </span>
                    <span>Questions</span>
                  </Space>
                ),
                children: (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Space align="center">
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={async () => {
                          const topicsList = await loadTopicsForCourse();
                          questionForm.resetFields();
                          questionForm.setFieldsValue({ 
                            courseId: id,
                            type: 'MCQ',
                            difficulty: 'MEDIUM',
                            marks: 1,
                            options: [{ text: '', isCorrect: false }]
                          });
                          setQuestionDrawerOpen(true);
                        }}
                      >
                        Add Question
                      </Button>
                      <Typography.Text type="secondary">
                        Showing questions for this course ({questions.length} total)
                      </Typography.Text>
                    </Space>
                    <Table
                      rowKey="id"
                      size="small"
                      loading={questionsLoading}
                      dataSource={questions}
                      columns={questionsColumns}
                      scroll={isMobile ? { x: 'max-content' } : undefined}
                      pagination={false}
                    />
                  </Space>
                )
              },
              {
                key: 'billing',
                label: (
                  <Space size={6}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#f6ffed', color: '#52c41a', border: '1px solid rgba(0,0,0,0.08)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)', fontSize: 14 }}>
                      <DollarOutlined />
                    </span>
                    <span>Products & Subscriptions</span>
                  </Space>
                ),
                children: (
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Typography.Title level={5} style={{ margin: 0 }}>Linked Products</Typography.Title>
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={course.products || []}
                      columns={prodColumns}
                      scroll={isMobile ? { x: 'max-content' } : undefined}
                      pagination={false}
                    />
                    <Typography.Title level={5} style={{ margin: 0 }}>Subscriptions (enrolled users)</Typography.Title>
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={detail.subscriptions || []}
                      columns={subsColumns}
                      scroll={isMobile ? { x: 'max-content' } : undefined}
                      pagination={false}
                    />
                  </Space>
                )
              }
            ]}
          />
        )}
      </Card>

      {/* Exam / Quiz View Drawer */}
      <Drawer
        title={examViewExam ? (examViewExam.type === 'QUIZ' ? 'Quiz Preview' : 'Exam Preview') : 'Exam Preview'}
        open={examViewOpen}
        width={820}
        onClose={() => setExamViewOpen(false)}
      >
        {examViewLoading ? (
          <Typography.Text>Loading...</Typography.Text>
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {examViewExam && (
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="Name" span={2}>{examViewExam.name}</Descriptions.Item>
                <Descriptions.Item label="Type">{examViewExam.type || (examViewExam.name?.toLowerCase().includes('quiz') ? 'QUIZ' : 'COURSE')}</Descriptions.Item>
                <Descriptions.Item label="Level">{examViewExam.level}</Descriptions.Item>
                <Descriptions.Item label="Time Limit (min)">{examViewExam.timeLimitMinutes}</Descriptions.Item>
                <Descriptions.Item label="Active">{examViewExam.active ? 'Yes' : 'No'}</Descriptions.Item>
              </Descriptions>
            )}
            <Divider />
            {(examViewQuestions || []).map((q, idx) => (
              <Card key={q.id} size="small" bordered>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Typography.Text strong>{`Q${idx + 1}. ${q.stem}`}</Typography.Text>
                  {q.type === 'MCQ' || q.type === 'VIGNETTE_MCQ' ? (
                    <Radio.Group
                      value={(q.options || []).find(o => o.isCorrect)?.id}
                      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                      disabled
                    >
                      {(q.options || []).map(o => (
                        <Radio key={o.id} value={o.id}>{o.text}</Radio>
                      ))}
                    </Radio.Group>
                  ) : (
                    <Typography.Text type="secondary">Constructed Response (no choices)</Typography.Text>
                  )}
                </Space>
              </Card>
            ))}
          </Space>
        )}
      </Drawer>

      {/* Learning Journey Preview */}
      <Drawer
        title="Preview Learning"
        open={learningPreviewOpen}
        onClose={() => setLearningPreviewOpen(false)}
        width={980}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            A quick look at modules and topics as students would browse.
          </Typography.Text>
          <List
            itemLayout="horizontal"
            dataSource={sortedTopicsForDisplay}
            renderItem={(t) => {
              const quiz = (detail?.exams || []).find(e => e.type === 'QUIZ' && e.topicId === t.id);
              return (
                <List.Item
                  actions={[
                    <Button size="small" onClick={() => openPreview(t.id)}>Preview</Button>,
                    quiz
                      ? <Button key="v" size="small" type="primary" onClick={() => openExamView(quiz)}>View Quiz</Button>
                      : <Button key="a" size="small" danger onClick={() => addQuiz(t)}>Add Quiz</Button>
                  ]}
                >
                  <List.Item.Meta
                    title={`${t.module?.name ?? '—'} · ${t.name}`}
                    description={<span>Level: <Tag>{t.level}</Tag></span>}
                  />
                </List.Item>
              );
            }}
          />
        </Space>
      </Drawer>

      {/* Topic Drawer: staged details + materials on one screen */}
      <Drawer
        title={selectedTopic ? `Edit Topic · ${selectedTopic.name}` : 'New Topic'}
        open={topicDrawerOpen}
        onClose={() => setTopicDrawerOpen(false)}
        width={860}
        extra={null}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Steps
            size="small"
            current={topicStep}
            items={[
              { title: 'Details' },
              { title: 'Learning Materials' }
            ]}
          />
          <Form
            layout="vertical"
            form={topicForm}
            onFinish={async (values) => {
              const saveEditTopic = async (values) => {
                if (!selectedTopic) return;
                // update
                try {
                  setSavingTopic(true);
                  await api.put(`/api/cms/topics/${selectedTopic.id}`, {
                    name: values.name,
                    courseId: String(id),
                    moduleId: values.moduleId || undefined,
                    level: course.level
                  });
                  message.success('Topic updated');
                  await fetchDetail();
                  await loadMaterialsFor(selectedTopic.id);
                  setTopicStep(1);
                } catch {
                  message.error('Update failed');
                } finally {
                  setSavingTopic(false);
                }
              };
              if (selectedTopic) {
                await saveEditTopic(values);
              } else {
                await saveNewTopic(values);
              }
            }}
          >
            {topicStep === 0 && (
              <>
                <Form.Item name="moduleId" label="Module">
                  <Select
                    allowClear
                    placeholder="Select a module (optional)"
                    options={[
                      { value: '', label: '— No module —' },
                      ...((detail?.modules ?? []).filter(m => m.level === course?.level).map(m => ({ value: m.id, label: `${m.name} (${m.level})` })))
                    ]}
                  />
                </Form.Item>
                <Form.Item name="name" label="Topic Name" rules={[{ required: true }]}>
                  <Input placeholder="Enter topic name" />
                </Form.Item>
                <Space>
                  <Button onClick={() => setTopicDrawerOpen(false)}>Cancel</Button>
                  <Button type="primary" loading={savingTopic} onClick={() => topicForm.submit()}>
                    {selectedTopic ? 'Save & Continue' : 'Create & Continue'}
                  </Button>
                </Space>
              </>
            )}
          </Form>

          {/* Materials inline section */}
          {topicStep === 1 && selectedTopic && (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Title level={5} style={{ margin: 0 }}>Learning Materials</Typography.Title>
              <Form
                layout="vertical"
                form={materialForm}
                onFinish={saveMaterial}
              >
                <Form.Item name="kind" label="Type" rules={[{ required: true }]}>
                  <Select
                    options={[
                      { value: 'LINK', label: 'Link' },
                      { value: 'PDF', label: 'PDF' },
                      { value: 'VIDEO', label: 'Video' },
                      { value: 'IMAGE', label: 'Image' },
                      { value: 'HTML', label: 'HTML Content' }
                    ]}
                  />
                </Form.Item>
                <Form.Item name="title" label="Title" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item noStyle shouldUpdate>
                  {({ getFieldValue, setFieldsValue }) => {
                    const kind = getFieldValue('kind');
                    const doUpload = async ({ file, onSuccess, onError }) => {
                      try {
                        const fd = new FormData();
                        fd.append('file', file);
                        const { data } = await api.post('/api/cms/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                        setFieldsValue({ url: data.url });
                        onSuccess?.(data, file);
                      } catch (e) {
                        onError?.(e);
                      }
                    };
                    return (
                      <>
                        {(kind === 'LINK' || kind === 'PDF' || kind === 'VIDEO' || kind === 'IMAGE') && (
                          <>
                            <Form.Item name="url" label="URL" rules={[{ required: true }]}>
                              <Input placeholder="https://..." />
                            </Form.Item>
                            <Upload customRequest={doUpload} showUploadList={false}>
                              <Button icon={<UploadOutlined />}>Upload File</Button>
                            </Upload>
                          </>
                        )}
                        {kind === 'HTML' && (
                          <Form.Item name="contentHtml" label="TEXT Content" rules={[{ required: true }]}>
                            <ReactQuill
                              theme="snow"
                              value={materialForm.getFieldValue('contentHtml') || ''}
                              onChange={(v) => materialForm.setFieldsValue({ contentHtml: v })}
                            />
                          </Form.Item>
                        )}
                      </>
                    );
                  }}
                </Form.Item>
                <Space>
                  <Button onClick={() => { setMaterialEditing(null); materialForm.resetFields(); }}>Reset</Button>
                  <Button type="primary" loading={savingMaterial} htmlType="submit">
                    {materialEditing ? 'Save Material' : 'Add Material'}
                  </Button>
                </Space>
              </Form>
              <Table
                rowKey="id"
                size="small"
                loading={materialsLoading || savingMaterial}
                dataSource={materialsByTopic[selectedTopic.id] || []}
                columns={materialsColumns}
                pagination={false}
              />
              <Space>
                <Button onClick={() => setTopicStep(0)}>Back</Button>
                <Button type="primary" onClick={() => setTopicDrawerOpen(false)}>Done</Button>
              </Space>
            </Space>
          )}
        </Space>
      </Drawer>

      {/* New Module drawer (for this course's level) */}
      <Drawer
        title="Add Module"
        open={moduleDrawerOpen}
        onClose={() => { setModuleDrawerOpen(false); moduleForm.resetFields(); }}
        width={400}
      >
        <Form layout="vertical" form={moduleForm} onFinish={saveNewModule}>
          <Form.Item name="name" label="Module Name" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="e.g. Module 1: Ethics" />
          </Form.Item>
          <Form.Item name="volumeId" label="Volume" rules={[{ required: true, message: 'Select a volume' }]}>
            <Select
              placeholder="Select a volume"
              options={(detail?.volumes || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })).map(v => ({ 
                value: v.id, 
                label: v.description ? `${v.name} - ${v.description}` : v.name,
                title: v.description || v.name
              }))}
              showSearch
              optionFilterProp="label"
              notFoundContent={detail?.volumes?.length === 0 ? "No volumes linked to this course" : "Loading volumes..."}
            />
          </Form.Item>
          <Form.Item name="level" label="Level" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="order" label="Order">
            <Input type="number" min={0} placeholder="Display order" />
          </Form.Item>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Module will be created for this course&apos;s level: <Tag>{course?.level ?? '—'}</Tag>
          </Typography.Text>
          <Space>
            <Button onClick={() => { setModuleDrawerOpen(false); moduleForm.resetFields(); }}>Cancel</Button>
            <Button type="primary" loading={savingModule} htmlType="submit">Create Module</Button>
          </Space>
        </Form>
      </Drawer>

      {/* Removed separate Manage and Material modals; handled inside topic drawer */}

      {/* Question Builder Drawer for Course View */}
      <Drawer
        title="Add Question"
        open={questionDrawerOpen}
        onClose={() => {
          setQuestionDrawerOpen(false);
          questionForm.resetFields();
        }}
        width={720}
      >
        <Form layout="vertical" form={questionForm} onFinish={submitQuestion} initialValues={{ type: 'MCQ', difficulty: 'MEDIUM', marks: 1, options: [{ text: '', isCorrect: false }], courseId: id }}>
          <Form.Item name="courseId" label="Course" hidden>
            <Input />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.courseId !== curr.courseId}>
            {({ getFieldValue }) => {
              const selectedCourseId = getFieldValue('courseId') || id;
              return (
                <Form.Item name="topicId" label="Topic" rules={[{ required: true }]}>
                  <Select
                    placeholder="Select topic"
                    showSearch
                    optionFilterProp="label"
                    loading={questionsLoading}
                    options={(() => {
                      const courseTopics = (detail?.topics || []).filter(t => !selectedCourseId || t.courseId === selectedCourseId);
                      return courseTopics.map(t => ({ value: t.id, label: t.name }));
                    })()}
                  />
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item name="stem" label="Question Text" rules={[{ required: true, min: 5 }]}>
            <Input.TextArea rows={3} placeholder="Enter question stem..." />
          </Form.Item>
          <Space size="large" wrap>
            <Form.Item name="type" label="Type" rules={[{ required: true }]}>
              <Select style={{ minWidth: 180 }} options={[
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
            <Form.Item name="marks" label="Marks" rules={[{ required: true }]}>
              <Input type="number" min={1} style={{ width: 120 }} />
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
                          <Space key={field.key} align="baseline" style={{ display: 'flex', width: '100%' }}>
                            <Form.Item {...field} name={[field.name, 'text']} rules={[{ required: true }]} style={{ flex: 1 }}>
                              <Input placeholder="Option text" />
                            </Form.Item>
                            <Form.Item {...field} name={[field.name, 'isCorrect']}>
                              <Select
                                style={{ width: 140 }}
                                options={[{ value: true, label: 'Correct' }, { value: false, label: 'Incorrect' }]}
                              />
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
          <Space style={{ marginTop: 12, width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => {
              setQuestionDrawerOpen(false);
              questionForm.resetFields();
            }}>Cancel</Button>
            <Button type="primary" loading={submittingQuestion} htmlType="submit">Create Question</Button>
          </Space>
        </Form>
      </Drawer>

      {/* Preview Drawer */}
      <Drawer
        title={previewData ? `${previewData.topic.module?.name ?? previewData.topic.moduleNumber ?? ''} ${previewData.topic.name}`.trim() || 'Topic Preview' : 'Topic Preview'}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        width="100vw"
        styles={{ body: { padding: 0 } }}
      >
        {previewData && (
          <Layout style={{ background: 'transparent' }}>
            <Layout.Sider width={320} style={{ background: '#0f2746', color: '#fff', padding: 12, borderRadius: 8 }}>
              <Typography.Title level={5} style={{ color: '#fff', marginTop: 0 }}>Course Modules</Typography.Title>
              <List
                dataSource={sortedTopicsForDisplay}
                renderItem={(t) => (
                  <List.Item
                    style={{
                      background: (t.id === previewTopicId) ? '#173352' : 'transparent',
                      borderRadius: 6,
                      cursor: 'pointer',
                      padding: '8px 10px'
                    }}
                    onClick={async () => {
                      setPreviewTopicId(t.id);
                      await loadMaterialsFor(t.id);
                      // refresh quiz for this topic
                      try {
                        const [examsRes, qsRes] = await Promise.all([
                          api.get('/api/exams', { params: { topicId: t.id, type: 'QUIZ' } }),
                          api.get('/api/cms/questions', { params: { topicId: t.id } })
                        ]);
                        setPreviewQuiz((examsRes?.data?.exams || [])[0] || null);
                        setPreviewQuestions((qsRes?.data?.questions || []).slice(0, 5));
                      } catch {}
                    }}
                  >
                    <List.Item.Meta
                      title={<span style={{ color: '#fff' }}>{`${t.module?.name ?? '—'} · ${t.name}`}</span>}
                      description={<span style={{ color: '#cfd8e3' }}>Level: {t.level}</span>}
                    />
                  </List.Item>
                )}
              />
            </Layout.Sider>
            <Layout.Content style={{ padding: '0 16px' }}>
              {(() => {
                const tId = previewTopicId || previewData?.topic?.id;
                const mats = tId ? (materialsByTopic[tId] || []) : [];
                const video = mats.find(m => m.kind === 'VIDEO' && m.url);
                const htmls = mats.filter(m => m.kind === 'HTML' && m.contentHtml);
                const docs = mats.filter(m => m.kind !== 'VIDEO' && m.kind !== 'HTML' && m.url);
                return (
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    {/* Header and actions */}
                    <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
                      <Typography.Title level={4} style={{ margin: 0 }}>
                        {detail?.topics?.find(x => x.id === tId)?.name || previewData.topic.name}
                      </Typography.Title>
                      <Space>
                        {previewQuiz ? (
                          <Button type="primary" icon={<EyeOutlined />} onClick={() => openExamView(previewQuiz)}>View Quiz</Button>
                        ) : (
                          <Button danger icon={<PlusOutlined />} onClick={() => addQuiz(detail?.topics?.find(x => x.id === tId) || previewData.topic)}>Add Quiz</Button>
                        )}
                      </Space>
                    </Space>
                    {/* Video on top */}
                    {video && (
                      <Card size="small" bodyStyle={{ padding: 0, overflow: 'hidden' }}>
                        {toYouTubeEmbed(video.url)
                          ? (
                            <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                              <iframe
                                src={toYouTubeEmbed(video.url)}
                                title="Video"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                              />
                            </div>
                          )
                          : <video src={asUrl(video.url)} controls style={{ width: '100%' }} />}
                      </Card>
                    )}
                    {/* HTML content next */}
                    {htmls.map(h => (
                      <Card key={h.id} size="small" title={h.title || 'Content'}>
                        <div dangerouslySetInnerHTML={{ __html: h.contentHtml }} />
                      </Card>
                    ))}
                    {/* Attachments */}
                    {docs.length > 0 && (
                      <Card size="small" title="Attachments">
                        <List
                          dataSource={docs}
                          renderItem={(d) => (
                            <List.Item>
                              <a href={asUrl(d.url)} target="_blank" rel="noreferrer">{d.title || d.url}</a>
                              <Tag style={{ marginLeft: 8 }}>{d.kind}</Tag>
                            </List.Item>
                          )}
                        />
                      </Card>
                    )}
                  </Space>
                );
              })()}
            </Layout.Content>
          </Layout>
        )}
      </Drawer>
    </Space>
  );
}

// Helpers
function toYouTubeEmbed(url) {
  try {
    if (!url) return null;
    const u = new URL(url, window.location.origin);
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      return v ? `https://www.youtube.com/embed/${v}` : null;
    }
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

