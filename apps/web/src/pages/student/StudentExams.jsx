import React, { useEffect, useMemo, useState } from 'react';
import { Card, List, Space, Button, Typography, Tag, Empty, message, Modal, Form, InputNumber, Select, Input, DatePicker, Popconfirm, Divider } from 'antd';
import { FileTextOutlined, DeleteOutlined, PlusOutlined, ClockCircleOutlined, CheckCircleOutlined, PlayCircleOutlined, TrophyOutlined, CalendarOutlined, BookOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

export function StudentExams() {
  const [loading, setLoading] = useState(false);
  const [enrolled, setEnrolled] = useState([]);
  const [examsByCourse, setExamsByCourse] = useState({});
  const [startingExamId, setStartingExamId] = useState(null);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [practiceSubmitting, setPracticeSubmitting] = useState(false);
  const [practiceForm] = Form.useForm();
  const [customExamOpen, setCustomExamOpen] = useState(false);
  const [customExamSubmitting, setCustomExamSubmitting] = useState(false);
  const [customExamForm] = Form.useForm();
  const [topics, setTopics] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const en = await api.get('/api/learning/me/courses');
        setEnrolled(en.data.courses || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const enrolledCourseIds = useMemo(
    () => (enrolled || []).map(c => c.courseId).filter(Boolean),
    [enrolled]
  );

  useEffect(() => {
    (async () => {
      const obj = {};
      // Load all exams (admin-created for enrolled courses + student's own exams)
      try {
        // Load all public exams (includes admin-created for enrolled courses and student's own)
        const { data } = await api.get('/api/exams/public');
        const allExams = data.exams || [];
        
        // Separate exams by course and student-created
        const examsByCourseMap = {};
        const studentExams = [];
        
        allExams.forEach(exam => {
          if (exam.createdById) {
            // Student-created exam
            studentExams.push(exam);
          } else if (exam.courseId && enrolledCourseIds.includes(exam.courseId)) {
            // Admin-created exam for enrolled course
            if (!examsByCourseMap[exam.courseId]) {
              examsByCourseMap[exam.courseId] = [];
            }
            examsByCourseMap[exam.courseId].push(exam);
          }
        });
        
        // Add exams to obj by course
        enrolledCourseIds.forEach(cid => {
          obj[cid] = examsByCourseMap[cid] || [];
        });
        
        // Load attempt info for student's own exams
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
            // Add attempt info to each exam
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
    })();
  }, [enrolledCourseIds.join(',')]);

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

  // Check if there's an existing open or pending custom exam
  const hasOpenCustomExam = useMemo(() => {
    const now = new Date();
    return customExamItems.some(exam => {
      const startDate = exam.startAt ? new Date(exam.startAt) : null;
      const endDate = exam.endAt ? new Date(exam.endAt) : null;
      // Check if exam is pending (not started yet) or open (between start and end)
      if (startDate && now < startDate) {
        return true; // Pending
      }
      if (startDate && now >= startDate && endDate && now <= endDate) {
        return true; // Open
      }
      if (!startDate && !endDate) {
        return true; // Always available
      }
      if (startDate && now >= startDate && !endDate) {
        return true; // Started but no end date
      }
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
            My Exams
          </Typography.Title>
          <div className="page-header-subtitle">
            Take exams and track your progress
          </div>
        </div>
        {!hasOpenCustomExam ? (
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => {
              setCustomExamOpen(true);
              customExamForm.resetFields();
              customExamForm.setFieldsValue({ 
                name: '', 
                courseId: undefined, 
                topicIds: undefined,
                difficulty: undefined, 
                difficulties: [],
                questionCount: 20, 
                timeLimitMinutes: 60,
                startAt: dayjs().add(1, 'hour'),
                endAt: dayjs().add(2, 'hours')
              });
              setTopics([]);
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
        {/* Admin Exams Section */}
        <Card 
          className="modern-card"
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="icon-badge-sm icon-badge-blue">
                <FileTextOutlined />
              </div>
              <span style={{ fontWeight: 600 }}>Official Exams</span>
            </div>
          }
          loading={loading}
        >
          {adminExamItems.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <FileTextOutlined />
              </div>
              <Typography.Text type="secondary">No official exams available</Typography.Text>
            </div>
          ) : (
            <List
              dataSource={adminExamItems}
              renderItem={(row) => {
                const firstExam = (row.exams || [])[0];
                const submitted = row.course?.examResult?.attemptId;
                return (
                  <List.Item>
                    <List.Item.Meta
                      title={row.course?.name}
                      description={<span>Level: {row.course?.level}</span>}
                    />
                    <Space direction="vertical" align="end">
                      <Space wrap>
                        {(row.exams || []).map(ex => {
                          const now = new Date();
                          const startDate = ex.startAt ? new Date(ex.startAt) : null;
                          const endDate = ex.endAt ? new Date(ex.endAt) : null;
                          // Determine exam status
                          let status = null;
                          let statusColor = 'default';
                          if (endDate && now > endDate) {
                            // Check if student missed the exam (end date passed and no submission)
                            if (!submitted) {
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
                          return (
                            <Space key={ex.id} direction="vertical" align="end" size={4}>
                              <Tag color="green">{ex.name}</Tag>
                              {status && <Tag color={statusColor}>{status}</Tag>}
                            </Space>
                          );
                        })}
                      </Space>
                      {submitted ? (
                        <Space>
                          <Tag color="green">Complete</Tag>
                          <Button
                            type="primary"
                            onClick={() => navigate(`/student/exams/result/${submitted}`)}
                          >
                            View results
                          </Button>
                        </Space>
                      ) : (
                        <Button
                          type="primary"
                          loading={firstExam && startingExamId === firstExam.id}
                          disabled={!firstExam || (firstExam.startAt && new Date() < new Date(firstExam.startAt)) || (firstExam.endAt && new Date() > new Date(firstExam.endAt))}
                          onClick={() => firstExam && startExam(firstExam.id)}
                        >
                          Take exam
                        </Button>
                      )}
                    </Space>
                  </List.Item>
                );
              }}
            />
          )}
        </Card>

        {/* My Custom Exams Section */}
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
                          <Space>
                            {status && <Tag color={statusColor}>{status}</Tag>}
                            {showInProgress && (
                              <Tag color="orange">
                                In Progress
                              </Tag>
                            )}
                            {exam.latestAttempt?.status === 'SUBMITTED' && (
                              <Tag color="green">
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
          <Form.Item name="questionCount" label="Number of Questions" rules={[{ required: true, message: 'Enter question count' }]}>
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
          setTopics([]);
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
              const topicIds = Array.isArray(values.topicIds) && values.topicIds.length > 0 ? values.topicIds : undefined;
              // Student-created exams should always be COURSE type, topicIds are just filters
              const res = await api.post('/api/exams/custom', {
                name: values.name,
                timeLimitMinutes: Number(values.timeLimitMinutes),
                questionCount: Number(values.questionCount),
                examType: 'COURSE',
                courseId: values.courseId,
                topicIds: topicIds,
                startAt: values.startAt ? values.startAt.toISOString() : undefined,
                endAt: values.endAt ? values.endAt.toISOString() : undefined
              });
              const examId = res?.data?.exam?.id;
              if (!examId) throw new Error('Exam not created');
              await api.post(`/api/exams/${examId}/randomize`, {
                questionCount: Number(values.questionCount),
                difficulties: values.difficulties && values.difficulties.length > 0 ? values.difficulties : undefined,
                courseId: values.courseId,
                topicIds: topicIds,
                replaceExisting: true
              });
              message.success('Custom exam created successfully');
              setCustomExamOpen(false);
              customExamForm.resetFields();
              setTopics([]);
              // Refresh exams list
              const obj = {};
              for (const cid of enrolledCourseIds) {
                try {
                  const { data } = await api.get('/api/exams/public', { params: { courseId: cid, type: 'COURSE' } });
                  obj[cid] = data.exams || [];
                } catch {
                  obj[cid] = [];
                }
              }
              setExamsByCourse(obj);
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
            startAt: dayjs().add(1, 'hour'),
            endAt: dayjs().add(2, 'hours')
          }}
        >
          <Form.Item name="name" label="Exam Name" rules={[{ required: true, min: 3 }]}>
            <Input placeholder="Enter exam name" />
          </Form.Item>
          <Form.Item name="courseId" label="Course" rules={[{ required: true }]}>
            <Select
              placeholder="Select course"
              options={(enrolled || []).map(c => ({ value: c.courseId, label: c.name }))}
              showSearch
              optionFilterProp="label"
              onChange={async (courseId) => {
                customExamForm.setFieldsValue({ topicIds: undefined });
                if (courseId) {
                  try {
                    const { data } = await api.get(`/api/learning/courses/${courseId}/topics`);
                    setTopics(data?.topics || []);
                  } catch {
                    setTopics([]);
                  }
                } else {
                  setTopics([]);
                }
              }}
            />
          </Form.Item>
          <Form.Item name="topicIds" label="Topics (optional filter)">
            <Select
              mode="multiple"
              allowClear
              placeholder="Select topics (optional)"
              options={topics.map(t => ({ value: t.id, label: t.name }))}
              showSearch
              optionFilterProp="label"
              disabled={topics.length === 0}
            />
          </Form.Item>
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
          <Form.Item name="questionCount" label="Number of Questions" rules={[{ required: true, message: 'Enter question count' }]}>
            <InputNumber min={1} max={200} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="timeLimitMinutes" label="Time Limit (minutes)" rules={[{ required: true, message: 'Enter time limit' }]}>
            <InputNumber min={5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item 
            name="startAt" 
            label="Exam Start Time" 
            rules={[{ required: true, message: 'Select exam start time' }]}
            help="When you want to start taking this exam"
          >
            <DatePicker 
              showTime 
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              disabledDate={(current) => current && current < dayjs().startOf('day')}
            />
          </Form.Item>
          <Form.Item 
            name="endAt" 
            label="Exam End Time" 
            rules={[
              { required: true, message: 'Select exam end time' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const startAt = getFieldValue('startAt');
                  if (!value || !startAt) return Promise.resolve();
                  if (value.isBefore(startAt) || value.isSame(startAt)) {
                    return Promise.reject(new Error('End time must be after start time'));
                  }
                  return Promise.resolve();
                }
              })
            ]}
            help="When this exam will expire (you must complete it before this time)"
          >
            <DatePicker 
              showTime 
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              disabledDate={(current) => {
                const startAt = customExamForm.getFieldValue('startAt');
                if (!startAt) return current && current < dayjs().startOf('day');
                return current && current < startAt.startOf('day');
              }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

