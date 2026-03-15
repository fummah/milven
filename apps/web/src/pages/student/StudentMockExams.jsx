import { useEffect, useState } from 'react';
import { Card, Typography, Button, Space, Tag, Empty, Spin, Modal, Select, message, Progress, Steps } from 'antd';
import {
  ExperimentOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  TrophyOutlined,
  PauseCircleOutlined,
  StopOutlined,
  PlusOutlined,
  RightOutlined
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';

const STATUS_CONFIG = {
  PENDING: { color: '#3b82f6', bg: '#eff6ff', label: 'Ready to Start', icon: <PlayCircleOutlined /> },
  SESSION1: { color: '#f59e0b', bg: '#fffbeb', label: 'Session 1 In Progress', icon: <ClockCircleOutlined /> },
  BREAK: { color: '#8b5cf6', bg: '#f5f3ff', label: 'Break Time', icon: <PauseCircleOutlined /> },
  SESSION2: { color: '#f59e0b', bg: '#fffbeb', label: 'Session 2 In Progress', icon: <ClockCircleOutlined /> },
  COMPLETED: { color: '#10b981', bg: '#ecfdf5', label: 'Completed', icon: <CheckCircleOutlined /> },
  CANCELLED: { color: '#6b7280', bg: '#f9fafb', label: 'Cancelled', icon: <StopOutlined /> }
};

export default function StudentMockExams() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [mockExams, setMockExams] = useState([]);
  const [eligibleCourses, setEligibleCourses] = useState([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [creating, setCreating] = useState(false);

  const formatEnrollmentStatus = (status) => {
    if (status === 'COMPLETED') return 'Completed';
    if (status === 'IN_PROGRESS') return 'In Progress';
    return status || 'Unknown';
  };

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [mocks, courses] = await Promise.all([
        api.get('/api/exams/mock/me'),
        api.get('/api/exams/mock/eligible-courses')
      ]);
      setMockExams(mocks.data.mockExams || []);
      setEligibleCourses(courses.data.courses || []);
    } catch {
      message.error('Failed to load mock exams');
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!selectedCourseId) { message.warning('Select a course'); return; }
    setCreating(true);
    try {
      const { data } = await api.post('/api/exams/mock/create', { courseId: selectedCourseId });
      message.success('Mock exam created!');
      setCreateModalOpen(false);
      setSelectedCourseId(null);
      loadData();
    } catch (err) {
      if (err.response?.data?.mockExamId) {
        message.info('You already have an active mock exam for this course');
      } else {
        message.error(err.response?.data?.error || 'Failed to create mock exam');
      }
    }
    setCreating(false);
  };

  const startSession = async (mockExamId, session) => {
    try {
      const { data } = await api.post(`/api/exams/mock/${mockExamId}/start-session`, { session });
      navigate(`/student/exam/${data.attempt.id}?mode=mock&mockExamId=${mockExamId}&session=${session}`);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to start session');
    }
  };

  const cancelMock = async (mockExamId) => {
    Modal.confirm({
      title: 'Cancel Mock Exam?',
      content: 'This will permanently cancel this mock exam. You can create a new one later.',
      okText: 'Cancel Exam',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.post(`/api/exams/mock/${mockExamId}/cancel`);
          message.success('Mock exam cancelled');
          loadData();
        } catch {
          message.error('Failed to cancel');
        }
      }
    });
  };

  const getSessionStep = (status) => {
    if (status === 'PENDING') return 0;
    if (status === 'SESSION1') return 0;
    if (status === 'BREAK') return 1;
    if (status === 'SESSION2') return 2;
    if (status === 'COMPLETED') return 3;
    return 0;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Typography.Title level={2} className="!mb-1 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
              <ExperimentOutlined className="text-white text-lg" />
            </span>
            Mock Exams
          </Typography.Title>
          <Typography.Text className="text-slate-500">
            Full-length CFA-style mock exams with timed sessions and breaks
          </Typography.Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => { setCreateModalOpen(true); setSelectedCourseId(null); }}
          className="rounded-xl"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
          size="large"
        >
          New Mock Exam
        </Button>
      </div>

      {/* Mock Exams List */}
      {loading ? (
        <div className="flex justify-center py-16"><Spin size="large" /></div>
      ) : mockExams.length === 0 ? (
        <Card className="border-0 shadow-md text-center py-16" style={{ borderRadius: 20 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="space-y-3">
                <Typography.Text className="text-slate-500 block text-base">No mock exams yet</Typography.Text>
                <Typography.Text className="text-slate-400 block text-sm">
                  Create a mock exam to practice under real CFA exam conditions
                </Typography.Text>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setCreateModalOpen(true)}
                  className="rounded-xl mt-4"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
                >
                  Create Your First Mock Exam
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <AnimatePresence>
          <div className="grid grid-cols-1 gap-5">
            {mockExams.map((mock, idx) => {
              const sc = STATUS_CONFIG[mock.status] || STATUS_CONFIG.PENDING;
              const s1Count = mock.session1Exam?.examQuestions?.length || 0;
              const s2Count = mock.session2Exam?.examQuestions?.length || 0;
              const currentStep = getSessionStep(mock.status);

              return (
                <motion.div
                  key={mock.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Card
                    className="border-0 shadow-lg overflow-hidden"
                    style={{ borderRadius: 20 }}
                    styles={{ body: { padding: 0 } }}
                  >
                    {/* Header bar */}
                    <div
                      className="px-6 py-4 flex items-center justify-between"
                      style={{ background: `linear-gradient(135deg, ${sc.color}15, ${sc.color}08)`, borderBottom: `2px solid ${sc.color}20` }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg" style={{ color: sc.color }}>{sc.icon}</span>
                        <div>
                          <Typography.Text strong className="text-base block">{mock.course?.name || 'Mock Exam'}</Typography.Text>
                          <Typography.Text className="text-xs text-slate-500">
                            {mock.course?.level} · Created {new Date(mock.createdAt).toLocaleDateString()}
                          </Typography.Text>
                        </div>
                      </div>
                      <Tag style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.color}40`, borderRadius: 20, fontWeight: 600 }}>
                        {sc.label}
                      </Tag>
                    </div>

                    {/* Body */}
                    <div className="p-6">
                      {/* Session progress stepper */}
                      <Steps
                        size="small"
                        current={currentStep}
                        status={mock.status === 'CANCELLED' ? 'error' : 'process'}
                        className="mb-6"
                        items={[
                          { title: 'Session 1', description: `${s1Count} Qs · ${mock.session1Minutes} min` },
                          { title: 'Break', description: `${mock.breakMinutes} min` },
                          { title: 'Session 2', description: `${s2Count} Qs · ${mock.session2Minutes} min` },
                          { title: 'Results' }
                        ]}
                      />

                      {/* Scores (if completed) */}
                      {mock.status === 'COMPLETED' && (
                        <div className="grid grid-cols-3 gap-4 mb-6">
                          <Card size="small" className="text-center" style={{ borderRadius: 12, background: '#f0fdf4', borderColor: '#86efac' }}>
                            <Typography.Text className="text-xs text-slate-500 block">Session 1</Typography.Text>
                            <Typography.Title level={4} className="!m-0" style={{ color: '#16a34a' }}>
                              {mock.session1Score != null ? `${mock.session1Score}%` : '—'}
                            </Typography.Title>
                          </Card>
                          <Card size="small" className="text-center" style={{ borderRadius: 12, background: '#eff6ff', borderColor: '#93c5fd' }}>
                            <Typography.Text className="text-xs text-slate-500 block">Session 2</Typography.Text>
                            <Typography.Title level={4} className="!m-0" style={{ color: '#2563eb' }}>
                              {mock.session2Score != null ? `${mock.session2Score}%` : '—'}
                            </Typography.Title>
                          </Card>
                          <Card size="small" className="text-center" style={{ borderRadius: 12, background: '#fefce8', borderColor: '#fde047' }}>
                            <Typography.Text className="text-xs text-slate-500 block">Overall</Typography.Text>
                            <Typography.Title level={4} className="!m-0" style={{ color: '#ca8a04' }}>
                              <TrophyOutlined className="mr-1" />
                              {mock.totalScore != null ? `${mock.totalScore}%` : '—'}
                            </Typography.Title>
                          </Card>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {mock.status === 'PENDING' && (
                          <Button
                            type="primary"
                            size="large"
                            icon={<PlayCircleOutlined />}
                            onClick={() => startSession(mock.id, 1)}
                            className="rounded-xl"
                            style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
                          >
                            Start Session 1
                          </Button>
                        )}
                        {mock.status === 'BREAK' && (
                          <Button
                            type="primary"
                            size="large"
                            icon={<PlayCircleOutlined />}
                            onClick={() => startSession(mock.id, 2)}
                            className="rounded-xl"
                            style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}
                          >
                            Start Session 2
                          </Button>
                        )}
                        {mock.status === 'COMPLETED' && mock.session1Exam?.attempts?.[0]?.id && (
                          <Button
                            icon={<RightOutlined />}
                            onClick={() => navigate(`/student/exams/result/${mock.session1Exam.attempts[0].id}`)}
                            className="rounded-xl"
                          >
                            Session 1 Results
                          </Button>
                        )}
                        {mock.status === 'COMPLETED' && mock.session2Exam?.attempts?.[0]?.id && (
                          <Button
                            icon={<RightOutlined />}
                            onClick={() => navigate(`/student/exams/result/${mock.session2Exam.attempts[0].id}`)}
                            className="rounded-xl"
                          >
                            Session 2 Results
                          </Button>
                        )}
                        {!['COMPLETED', 'CANCELLED'].includes(mock.status) && (
                          <Button
                            danger
                            size="small"
                            onClick={() => cancelMock(mock.id)}
                            className="rounded-xl ml-auto"
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>
      )}

      {/* Create Mock Exam Modal */}
      <Modal
        title={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <ExperimentOutlined className="text-white text-lg" />
            </div>
            <div>
              <Typography.Text className="text-slate-500 text-xs block">Create</Typography.Text>
              <Typography.Text className="font-semibold text-lg">Mock Exam</Typography.Text>
            </div>
          </div>
        }
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={null}
        width={480}
        styles={{ body: { paddingTop: 16 } }}
      >
        <div className="space-y-6">
          <Card size="small" style={{ borderRadius: 12, background: '#f0f5ff', borderColor: '#d6e4ff' }}>
            <Typography.Text className="text-xs text-slate-600">
              <strong>Exam Conditions:</strong> Two timed sessions with a mandatory break. Questions are weighted by topic as configured by your course administrator. Simulates real CFA exam conditions.
            </Typography.Text>
          </Card>

          <div>
            <Typography.Text className="text-slate-600 block mb-2">Select Course</Typography.Text>
            {eligibleCourses.length === 0 ? (
              <Typography.Text type="secondary">No eligible courses. Courses must have mock exam weights configured by an administrator.</Typography.Text>
            ) : (
              <Select
                value={selectedCourseId}
                onChange={setSelectedCourseId}
                placeholder="Choose a course"
                style={{ width: '100%' }}
                size="large"
                options={eligibleCourses.map(c => ({
                  value: c.id,
                  label: `${c.name} (${c.level}) - ${formatEnrollmentStatus(c.enrollmentStatus)}`
                }))}
              />
            )}
          </div>

          <Button
            type="primary"
            block
            size="large"
            loading={creating}
            disabled={!selectedCourseId || eligibleCourses.length === 0}
            onClick={handleCreate}
            className="rounded-xl"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', height: 48 }}
          >
            Generate Mock Exam
          </Button>
        </div>
      </Modal>
    </div>
  );
}
