import React, { useEffect, useMemo, useState } from 'react';
import { Card, List, Space, Button, Typography, Tag, Empty, message, Modal, Form, InputNumber, Select, Input, DatePicker, Popconfirm, Divider, Row, Col } from 'antd';
import { FileTextOutlined, DeleteOutlined, PlusOutlined, ClockCircleOutlined, CheckCircleOutlined, PlayCircleOutlined, TrophyOutlined, CalendarOutlined, BookOutlined, CloseCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const PRACTICE_PAGE_SIZE = 6;

function getQuestionTypeOptions(level) {
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
  return [{ label: 'MCQ', value: 'MCQ' }];
}

function getDefaultQuestionType(level) {
  const options = getQuestionTypeOptions(level);
  return options[0]?.value;
}

export function StudentExams() {
  const [loading, setLoading] = useState(false);
  const [enrolled, setEnrolled] = useState([]);
  const [examsByCourse, setExamsByCourse] = useState({});
  const [startingExamId, setStartingExamId] = useState(null);
  const [practicePage, setPracticePage] = useState(1);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [practiceSubmitting, setPracticeSubmitting] = useState(false);
  const [practiceForm] = Form.useForm();
  const [customExamOpen, setCustomExamOpen] = useState(false);
  const [customExamSubmitting, setCustomExamSubmitting] = useState(false);
  const [customExamForm] = Form.useForm();
  const [topics, setTopics] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [selectedCourseLevel, setSelectedCourseLevel] = useState(null);
  const [practiceExamCount, setPracticeExamCount] = useState(0);
  const navigate = useNavigate();

  const selectedVolumeIds = Form.useWatch('volumeIds', customExamForm);
  const selectedModuleIds = Form.useWatch('moduleIds', customExamForm);
  const questionTypeOptions = useMemo(
    () => getQuestionTypeOptions(selectedCourseLevel),
    [selectedCourseLevel]
  );
  const moduleOptions = useMemo(() => {
    let filtered = topics;
    if (selectedVolumeIds?.length > 0) {
      filtered = filtered.filter((t) => selectedVolumeIds.map(String).includes(String(t.volumeId || '')));
    }
    const moduleMap = new Map();
    filtered.forEach(t => {
      if (t.moduleId && !moduleMap.has(t.moduleId)) {
        moduleMap.set(t.moduleId, { value: t.moduleId, label: t.moduleName || t.moduleId });
      }
    });
    return Array.from(moduleMap.values());
  }, [topics, selectedVolumeIds]);
  const filteredTopics = useMemo(() => {
    let filtered = topics;
    if (selectedVolumeIds?.length > 0) {
      filtered = filtered.filter((topic) => selectedVolumeIds.map(String).includes(String(topic.volumeId || '')));
    }
    if (selectedModuleIds?.length > 0) {
      filtered = filtered.filter((topic) => selectedModuleIds.map(String).includes(String(topic.moduleId || '')));
    }
    return filtered;
  }, [topics, selectedVolumeIds, selectedModuleIds]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const en = await api.get('/api/learning/me/courses');
        setEnrolled(en.data.courses || []);
        // Count student's practice exams for auto-generated name
        const { data: examsData } = await api.get('/api/exams/public');
        const studentExams = (examsData?.exams || []).filter(e => e.createdById);
        setPracticeExamCount(studentExams.length);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const enrolledCourseIds = useMemo(
    () => (enrolled || []).map(c => c.courseId).filter(Boolean),
    [enrolled]
  );

  const loadExams = React.useCallback(async () => {
    const obj = {};
    try {
      const { data } = await api.get('/api/exams/public');
      const allExams = data.exams || [];
      const examsByCourseMap = {};
      const studentExams = [];
      allExams.forEach(exam => {
        if (exam.createdById && exam.type !== 'MOCK') {
          studentExams.push(exam);
        } else if (exam.courseId && enrolledCourseIds.includes(exam.courseId) && exam.type !== 'MOCK') {
          if (!examsByCourseMap[exam.courseId]) examsByCourseMap[exam.courseId] = [];
          examsByCourseMap[exam.courseId].push(exam);
        }
      });
      enrolledCourseIds.forEach(cid => {
        obj[cid] = examsByCourseMap[cid] || [];
      });
      if (studentExams.length > 0) {
        try {
          const { data: attemptsData } = await api.get('/api/exams/attempts/me');
          const attempts = attemptsData?.attempts || [];
          const attemptsByExam = {};
          attempts.forEach(a => {
            if (studentExams.some(e => e.id === a.examId)) {
              if (!attemptsByExam[a.examId]) attemptsByExam[a.examId] = [];
              attemptsByExam[a.examId].push(a);
            }
          });
          studentExams.forEach(exam => {
            exam.attempts = attemptsByExam[exam.id] || [];
            exam.hasAttempts = (attemptsByExam[exam.id] || []).length > 0;
            exam.latestAttempt = (attemptsByExam[exam.id] || []).sort((a, b) =>
              new Date(b.startedAt || 0) - new Date(a.startedAt || 0)
            )[0];
          });
        } catch {}
        obj['_my_custom'] = studentExams;
      }
    } catch (e) {
      console.error('Failed to load exams:', e);
    }
    setExamsByCourse(obj);
  }, [enrolledCourseIds.join(',')]);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  // Separate admin exams and custom exams
  const adminExamItems = useMemo(() => {
    const map = {};
    (enrolled || []).forEach(c => {
      if (!c.courseId) return;
      const courseExams = examsByCourse[c.courseId] || [];
      if (courseExams.length > 0) {
        map[c.courseId] = { course: c, exams: courseExams };
      }
    });
    return Object.values(map);
  }, [enrolled, examsByCourse]);

  const customExamItems = useMemo(() => {
    return examsByCourse['_my_custom'] || [];
  }, [examsByCourse]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(customExamItems.length / PRACTICE_PAGE_SIZE));
    if (practicePage > totalPages) {
      setPracticePage(totalPages);
    }
  }, [customExamItems.length, practicePage]);

  // Check if there's an existing open or pending custom exam
  const hasOpenCustomExam = useMemo(() => {
    const now = new Date();
    return customExamItems.some(exam => {
      // If the latest attempt is submitted, this exam is done
      const latestAttempt = exam.attempts?.[exam.attempts.length - 1];
      if (latestAttempt?.status === 'SUBMITTED') return false;
      const startDate = exam.startAt ? new Date(exam.startAt) : null;
      const endDate = exam.endAt ? new Date(exam.endAt) : null;
      // If end date has passed, exam is expired
      if (endDate && now > endDate) return false;
      // Check if exam is pending (not started yet) or open
      if (startDate && now < startDate) return true;
      if (startDate && now >= startDate) return true;
      if (!startDate && !endDate) return true;
      return false;
    });
  }, [customExamItems]);

  const startExam = async (examId) => {
    if (!examId) return;
    setStartingExamId(examId);
    try {
      const { data } = await api.post(`/api/exams/${examId}/attempts`, {});
      const attemptId = data?.attempt?.id;
      if (attemptId) navigate(`/student/exams/take/${attemptId}`);
      else message.error('Could not start exam');
    } catch (e) {
      message.error(e?.response?.data?.error || 'Could not start exam');
    } finally {
      setStartingExamId(null);
    }
  };

  const startPracticeNow = async (examId) => {
    if (!examId) return;
    setStartingExamId(examId);
    try {
      // Backend auto-reschedules student-created practice exams on attempt creation
      const { data } = await api.post(`/api/exams/${examId}/attempts`, {});
      const attemptId = data?.attempt?.id;
      if (attemptId) navigate(`/student/exams/take/${attemptId}`);
      else message.error('Could not start exam');
    } catch (e) {
      message.error(e?.response?.data?.error || 'Could not start exam now');
    } finally {
      setStartingExamId(null);
    }
  };

  const deleteCustomExam = async (examId) => {
    try {
      await api.delete(`/api/exams/${examId}`);
      message.success('Exam deleted');
      // Refresh exams list
      const obj = {};
      try {
        const { data } = await api.get('/api/exams/public');
        const allExams = data.exams || [];
        const examsByCourseMap = {};
        const studentExams = [];
        allExams.forEach(exam => {
          if (exam.createdById) {
            studentExams.push(exam);
          } else if (exam.courseId && enrolledCourseIds.includes(exam.courseId)) {
            if (!examsByCourseMap[exam.courseId]) {
              examsByCourseMap[exam.courseId] = [];
            }
            examsByCourseMap[exam.courseId].push(exam);
          }
        });
        enrolledCourseIds.forEach(cid => {
          obj[cid] = examsByCourseMap[cid] || [];
        });
        if (studentExams.length > 0) {
          const examIds = studentExams.map(e => e.id);
          try {
            const { data: attemptsData } = await api.get('/api/exams/attempts/me');
            const attempts = attemptsData?.attempts || [];
            const attemptsByExam = {};
            attempts.forEach(a => {
              if (examIds.includes(a.examId)) {
                if (!attemptsByExam[a.examId]) attemptsByExam[a.examId] = [];
                attemptsByExam[a.examId].push(a);
              }
            });
            studentExams.forEach(exam => {
              exam.attempts = attemptsByExam[exam.id] || [];
              exam.hasAttempts = (attemptsByExam[exam.id] || []).length > 0;
              exam.latestAttempt = (attemptsByExam[exam.id] || []).sort((a, b) => 
                new Date(b.startedAt || 0) - new Date(a.startedAt || 0)
              )[0];
            });
          } catch {}
          obj['_my_custom'] = studentExams;
        }
      } catch {}
      setExamsByCourse(obj);
    } catch (e) {
      message.error(e?.response?.data?.error || 'Failed to delete exam');
    }
  };

  const generatePractice = async () => {
    try {
      const values = await practiceForm.validateFields();
      setPracticeSubmitting(true);
      const payload = {
        courseId: values.courseId || undefined,
        difficulty: values.difficulty || undefined,
        questionCount: Number(values.questionCount),
        timeLimitMinutes: values.timeLimitMinutes ? Number(values.timeLimitMinutes) : undefined,
        name: values.name || undefined
      };
      const { data } = await api.post('/api/exams/practice', payload);
      const examId = data?.examId;
      if (!examId) {
        message.error('Practice exam could not be created');
        return;
      }
      const attemptRes = await api.post(`/api/exams/${examId}/attempts`, {});
      const attemptId = attemptRes?.data?.attempt?.id;
      if (attemptId) {
        setPracticeOpen(false);
        practiceForm.resetFields();
        navigate(`/student/exams/take/${attemptId}`);
        return;
      }
      message.error('Practice exam created but could not start');
    } catch (e) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.error || 'Could not generate practice exam');
    } finally {
      setPracticeSubmitting(false);
    }
  };

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <Typography.Title level={2} className="page-header-title">
            Practice Questions
          </Typography.Title>
          <div className="page-header-subtitle">
            Generate and take practice exams to test your knowledge
          </div>
        </div>
        {!hasOpenCustomExam ? (
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => {
              setCustomExamOpen(true);
              const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
              const studentName = currentUser?.name || currentUser?.firstName || 'Student';
              const nextExamNum = practiceExamCount + 1;
              const autoName = `${studentName} Practice Exam #${nextExamNum}`;
              const firstCourse = enrolled?.[0]?.courseId;
              const firstCourseLevel = enrolled?.[0]?.level;
              const defaultType = getDefaultQuestionType(firstCourseLevel);
              customExamForm.resetFields();
              customExamForm.setFieldsValue({
                name: autoName,
                courseId: firstCourse,
                questionType: defaultType,
                topicIds: undefined,
                volumeIds: [],
                moduleIds: [],
                difficulty: undefined,
                difficulties: [],
                questionCount: 20,
                timeLimitMinutes: 60,
                startAt: undefined,
                endAt: undefined
              });
              setSelectedCourseLevel(firstCourseLevel || null);
              setTopics([]);
              // Load topics for the default course
              if (firstCourse) {
                (async () => {
                  try {
                    const { data } = await api.get(`/api/learning/courses/${firstCourse}/detail`);
                    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
                    const studentPathwayId = currentUser?.pathwayVolumeId;
                    const nextVolumes = (data?.volumes || [])
                      .filter(volume => {
                        if (!volume.isPathway) return true;
                        if (!studentPathwayId) return true;
                        return volume.id === studentPathwayId;
                      })
                      .map((volume) => ({
                        id: volume.id,
                        name: volume.name,
                        isPathway: volume.isPathway || false,
                        order: volume.order ?? volume.orderNo ?? null
                      }));
                    const allowedVolumeIds = new Set(nextVolumes.map(v => v.id));
                    const nextTopics = (data?.modules || [])
                      .filter(module => !module.volumeId || allowedVolumeIds.has(module.volumeId))
                      .flatMap((module) =>
                        (module.topics || []).map((topic) => ({
                          id: topic.id,
                          name: topic.name,
                          moduleId: module.id || topic.moduleId,
                          moduleName: module.name || null,
                          moduleNumber: topic.moduleNumber,
                          volumeId: module.volumeId || null
                        }))
                      );
                    setVolumes(nextVolumes);
                    setTopics(nextTopics);
                  } catch {
                    setVolumes([]);
                    setTopics([]);
                  }
                })();
              } else {
                setVolumes([]);
                setTopics([]);
              }
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
            Generate Practice Exam
          </Button>
        ) : (
          <Tag color="warning" style={{ padding: '8px 16px', fontSize: 13 }}>
            Complete or delete your pending exam to create a new one
          </Tag>
        )}
      </div>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* My Practice Exams Section */}
        <Card 
          className="modern-card"
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="icon-badge-sm icon-badge-orange">
                <TrophyOutlined />
              </div>
              <span style={{ fontWeight: 600 }}>My Practice Exams</span>
            </div>
          }
          loading={loading}
        >
          {customExamItems.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <TrophyOutlined />
              </div>
              <Typography.Text type="secondary">No practice exams created yet</Typography.Text>
            </div>
          ) : (
            <List
              dataSource={customExamItems}
              pagination={{
                current: practicePage,
                pageSize: PRACTICE_PAGE_SIZE,
                total: customExamItems.length,
                onChange: (page) => setPracticePage(page),
                hideOnSinglePage: true,
                showSizeChanger: false,
                size: 'small',
                align: 'end'
              }}
              renderItem={(exam) => {
                const now = new Date();
                const startDate = exam.startAt ? new Date(exam.startAt) : null;
                const endDate = exam.endAt ? new Date(exam.endAt) : null;
                // Determine exam status
                let status = null;
                let statusColor = 'default';
                if (endDate && now > endDate) {
                  // Check if student missed the exam (end date passed and no submission)
                  if (!exam.hasAttempts || exam.latestAttempt?.status !== 'SUBMITTED') {
                    status = 'Missed';
                    statusColor = 'red';
                  } else {
                    status = 'Completed';
                    statusColor = 'green';
                  }
                } else if (startDate && now < startDate) {
                  status = 'Pending';
                  statusColor = 'orange';
                } else if (startDate || endDate) {
                  status = 'Open';
                  statusColor = 'blue';
                }
                // Can delete if: not attended AND (no start time OR start time is in the future)
                const canDelete = !exam.hasAttempts && (!startDate || now < startDate);
                // In Progress should only show when exam is within time range AND attempt is not submitted
                const isWithinTimeRange = (!startDate || now >= startDate) && (!endDate || now <= endDate);
                const showInProgress = exam.latestAttempt && 
                  exam.latestAttempt.status !== 'SUBMITTED' && 
                  isWithinTimeRange;
                return (
                  <List.Item
                    actions={[
                      canDelete ? (
                        <Popconfirm
                          title="Delete this exam?"
                          description="This action cannot be undone."
                          onConfirm={() => deleteCustomExam(exam.id)}
                          okText="Yes"
                          cancelText="No"
                        >
                          <Button danger size="small" icon={<DeleteOutlined />}>
                            Delete
                          </Button>
                        </Popconfirm>
                      ) : null,
                      exam.latestAttempt?.status === 'SUBMITTED' ? (
                        <Button
                          size="small"
                          type="primary"
                          onClick={() => navigate(`/student/exams/result/${exam.latestAttempt.id}`)}
                        >
                          View Results
                        </Button>
                      ) : status === 'Pending' ? (
                        <Button
                          size="small"
                          type="primary"
                          loading={startingExamId === exam.id}
                          onClick={() => startPracticeNow(exam.id)}
                        >
                          Start now
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          type="primary"
                          loading={startingExamId === exam.id}
                          disabled={status === 'Pending' || status === 'Missed' || status === 'Completed'}
                          onClick={() => startExam(exam.id)}
                        >
                          {status === 'Pending' ? 'Pending' : status === 'Missed' ? 'Missed' : status === 'Completed' ? 'Completed' : 'Take Exam'}
                        </Button>
                      )
                    ].filter(Boolean)}
                  >
                    <List.Item.Meta
                      title={exam.name}
                      description={
                        <Space direction="vertical" size={4}>
                          <Space wrap size={6}>
                            {status && <Tag color={statusColor} icon={status === 'Open' ? <PlayCircleOutlined /> : status === 'Completed' ? <CheckCircleOutlined /> : status === 'Missed' ? <CloseCircleOutlined /> : <ClockCircleOutlined />}>{status}</Tag>}
                            {showInProgress && (
                              <Tag color="orange" icon={<ClockCircleOutlined />}>
                                In Progress
                              </Tag>
                            )}
                            {exam.latestAttempt?.status === 'SUBMITTED' && (
                              <Tag color="green" icon={<TrophyOutlined />}>
                                Score: {Math.round(exam.latestAttempt.scorePercent || 0)}%
                              </Tag>
                            )}
                          </Space>
                          {startDate && (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              Start: {startDate.toLocaleString()}
                            </Typography.Text>
                          )}
                          {endDate && (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              End: {endDate.toLocaleString()}
                            </Typography.Text>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          )}
        </Card>
      </Space>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-badge-sm icon-badge-blue">
              <FileTextOutlined />
            </div>
            <span>Generate Practice Exam</span>
          </div>
        }
        open={practiceOpen}
        onCancel={() => setPracticeOpen(false)}
        onOk={generatePractice}
        okText="Start Exam"
        confirmLoading={practiceSubmitting}
        destroyOnClose
        className="modern-modal"
        okButtonProps={{ 
          style: { borderRadius: 10, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', border: 'none' }
        }}
        cancelButtonProps={{ style: { borderRadius: 10 } }}
      >
        <Form
          layout="vertical"
          form={practiceForm}
          initialValues={{ questionCount: 20, timeLimitMinutes: 60, difficulty: undefined, courseId: undefined }}
        >
          <Form.Item name="name" label="Name">
            <Input placeholder="Optional" />
          </Form.Item>
          <Form.Item name="courseId" label="Course">
            <Select
              allowClear
              placeholder="All enrolled courses"
              options={(enrolled || []).map(c => ({ value: c.courseId, label: c.name }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="difficulty" label="Difficulty">
            <Select
              allowClear
              placeholder="Any"
              options={[
                { value: 'EASY', label: 'Easy' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HARD', label: 'Hard' }
              ]}
            />
          </Form.Item>
          <Form.Item name="questionCount" label="No of Questions" rules={[{ required: true, message: 'Enter question count' }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="timeLimitMinutes" label="Time Limit (minutes)">
            <InputNumber min={5} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-badge-sm icon-badge-orange">
              <PlusOutlined />
            </div>
            <span>Create Practice Exam</span>
          </div>
        }
        open={customExamOpen}
        onCancel={() => {
          setCustomExamOpen(false);
          customExamForm.resetFields();
          setVolumes([]);
          setTopics([]);
          setSelectedCourseLevel(null);
        }}
        onOk={() => customExamForm.submit()}
        okText="Create Exam"
        confirmLoading={customExamSubmitting}
        destroyOnClose
        width={600}
        className="modern-modal"
        okButtonProps={{ 
          style: { borderRadius: 10, background: 'linear-gradient(135deg, #f97316, #ea580c)', border: 'none' }
        }}
        cancelButtonProps={{ style: { borderRadius: 10 } }}
      >
        <Form
          layout="vertical"
          form={customExamForm}
          onFinish={async (values) => {
            try {
              // Double-check if there's an open custom exam before submitting
              if (hasOpenCustomExam) {
                message.warning('You already have an open or pending custom exam. Please complete or delete it before creating a new one.');
                return;
              }
              setCustomExamSubmitting(true);
              let topicIds;
              if (Array.isArray(values.topicIds) && values.topicIds.length > 0) {
                topicIds = values.topicIds;
              } else if (Array.isArray(values.moduleIds) && values.moduleIds.length > 0) {
                const derived = topics
                  .filter(t => values.moduleIds.map(String).includes(String(t.moduleId || '')))
                  .map(t => t.id);
                topicIds = derived.length > 0 ? derived : undefined;
              } else if (Array.isArray(values.volumeIds) && values.volumeIds.length > 0) {
                const derived = topics
                  .filter(t => values.volumeIds.map(String).includes(String(t.volumeId || '')))
                  .map(t => t.id);
                topicIds = derived.length > 0 ? derived : undefined;
              } else {
                topicIds = undefined;
              }
              // Student-created exams should always be COURSE type, topicIds are just filters
              // Auto-generate exam name from student name + exam number
              const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
              const studentName = currentUser?.name || currentUser?.firstName || 'Student';
              const examName = `${studentName} Practice Exam #${practiceExamCount + 1}`;
              // Calculate start and end times: default to now if no start time specified
              const startAt = values.startAt ? dayjs(values.startAt) : dayjs();
              const endAt = startAt.add(Number(values.timeLimitMinutes), 'minute');
              const res = await api.post('/api/exams/custom', {
                name: examName,
                timeLimitMinutes: Number(values.timeLimitMinutes),
                questionCount: Number(values.questionCount),
                examType: 'COURSE',
                courseId: values.courseId,
                topicIds: topicIds,
                difficulties: values.difficulties && values.difficulties.length > 0 ? values.difficulties : undefined,
                questionType: values.questionType || 'ANY',
                startAt: startAt.toISOString(),
                endAt: endAt.toISOString()
              });
              const examId = res?.data?.exam?.id;
              if (!examId) throw new Error('Exam not created');
              message.success('Custom exam created successfully');
              setCustomExamOpen(false);
              customExamForm.resetFields();
              setTopics([]);
              await loadExams();
            } catch (e) {
              message.error(e?.response?.data?.error || e?.message || 'Failed to create exam');
            } finally {
              setCustomExamSubmitting(false);
            }
          }}
          initialValues={{ 
            questionCount: 20, 
            timeLimitMinutes: 60, 
            difficulties: [],
            questionType: 'MCQ'
          }}
        >
          <Form.Item name="courseId" label="Course" rules={[{ required: true }]}>
            <Select
              placeholder="Select course"
              options={(enrolled || [])
                .slice()
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                .map(c => ({ value: c.courseId, label: c.name }))}
              showSearch
              optionFilterProp="label"
              onChange={async (courseId) => {
                customExamForm.setFieldsValue({ topicIds: undefined, volumeIds: [], moduleIds: [] });
                const course = (enrolled || []).find(c => c.courseId === courseId);
                const level = course?.level;
                const defaultType = getDefaultQuestionType(level);
                setSelectedCourseLevel(level || null);
                customExamForm.setFieldsValue({ questionType: defaultType });
                if (courseId) {
                  try {
                    const { data } = await api.get(`/api/learning/courses/${courseId}/detail`);
                    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
                    const studentPathwayId = currentUser?.pathwayVolumeId;
                    const nextVolumes = (data?.volumes || [])
                      .filter(volume => {
                        if (!volume.isPathway) return true;
                        if (!studentPathwayId) return true;
                        return volume.id === studentPathwayId;
                      })
                      .map((volume) => ({
                        id: volume.id,
                        name: volume.name,
                        isPathway: volume.isPathway || false,
                        order: volume.order ?? volume.orderNo ?? null
                      }));
                    const allowedVolumeIds = new Set(nextVolumes.map(v => v.id));
                    const nextTopics = (data?.modules || [])
                      .filter(module => !module.volumeId || allowedVolumeIds.has(module.volumeId))
                      .flatMap((module) =>
                        (module.topics || []).map((topic) => ({
                          id: topic.id,
                          name: topic.name,
                          moduleId: module.id || topic.moduleId,
                          moduleName: module.name || null,
                          moduleNumber: topic.moduleNumber,
                          volumeId: module.volumeId || null
                        }))
                      );
                    setVolumes(nextVolumes);
                    setTopics(nextTopics);
                  } catch {
                    setVolumes([]);
                    setTopics([]);
                  }
                } else {
                  setVolumes([]);
                  setTopics([]);
                  setSelectedCourseLevel(null);
                }
              }}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="volumeIds" label="Volume(s)">
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="Select one or more volumes"
                  options={volumes.map((volume) => ({ value: volume.id, label: volume.description ? `${volume.name} - ${volume.description}` : volume.name }))}
                  disabled={volumes.length === 0}
                  onChange={() => {
                    customExamForm.setFieldsValue({ topicIds: undefined, moduleIds: [] });
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="moduleIds" label="Learning Module(s)">
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="Select one or more modules"
                  options={moduleOptions}
                  showSearch
                  optionFilterProp="label"
                  disabled={moduleOptions.length === 0}
                  onChange={() => {
                    customExamForm.setFieldsValue({ topicIds: undefined });
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="questionType" label="Question Type" rules={[{ required: true }]}>
                <Select
                  placeholder="Question type"
                  options={questionTypeOptions}
                  disabled={!selectedCourseLevel}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="topicIds" label="Topics (optional filter)">
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="Select topics (optional)"
                  options={filteredTopics.map(t => ({ value: t.id, label: t.name }))}
                  showSearch
                  optionFilterProp="label"
                  disabled={filteredTopics.length === 0}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item name="difficulties" label="Difficulty">
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="Select difficulties (optional)"
                  options={[
                    { label: 'Easy', value: 'EASY' },
                    { label: 'Medium', value: 'MEDIUM' },
                    { label: 'Hard', value: 'HARD' }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="questionCount" label="No of Questions" rules={[{ required: true, message: 'Enter question count' }]}>
                <InputNumber min={1} max={200} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="timeLimitMinutes" label="Time Limit (min)" rules={[{ required: true, message: 'Enter time limit' }]}>
                <InputNumber min={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item 
            name="startAt" 
            label="Exam Start Time" 
            help="Optional: when you want to start taking this exam. End time will be calculated automatically based on time limit."
          >
            <DatePicker 
              showTime 
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              disabledDate={(current) => current && current < dayjs().startOf('day')}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

