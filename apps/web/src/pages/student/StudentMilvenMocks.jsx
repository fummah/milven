import React, { useEffect, useState } from 'react';
import { Card, Typography, Tag, Button, Empty, Steps, Spin, message, Modal } from 'antd';
import { SolutionOutlined, PlayCircleOutlined, RightOutlined, TrophyOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, PauseCircleOutlined, StopOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { motion, AnimatePresence } from 'framer-motion';

const STATUS_CONFIG = {
  PENDING: { label: 'Not Started', color: '#6366f1', bg: '#eef2ff', icon: <ClockCircleOutlined /> },
  SESSION1: { label: 'Session 1 In Progress', color: '#2563eb', bg: '#eff6ff', icon: <PlayCircleOutlined /> },
  BREAK: { label: 'On Break', color: '#f59e0b', bg: '#fffbeb', icon: <PauseCircleOutlined /> },
  SESSION2: { label: 'Session 2 In Progress', color: '#8b5cf6', bg: '#f5f3ff', icon: <PlayCircleOutlined /> },
  COMPLETED: { label: 'Completed', color: '#16a34a', bg: '#f0fdf4', icon: <CheckCircleOutlined /> },
  CANCELLED: { label: 'Cancelled', color: '#dc2626', bg: '#fef2f2', icon: <StopOutlined /> },
};

export default function StudentMilvenMocks() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [mockExams, setMockExams] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/exams/mock/me/scheduled');
      setMockExams(data.mockExams || []);
    } catch (err) {
      console.error('Failed to load Milven mock exams:', err);
      message.error(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to load Milven mock exams');
    }
    setLoading(false);
  };

  const startSession = async (mockExamId, session) => {
    try {
      const { data } = await api.post(`/api/exams/mock/${mockExamId}/start-session`, { session });
      navigate(`/student/exam/${data.attempt.id}?mode=mock&mockExamId=${mockExamId}&session=${session}`);
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to start session');
    }
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
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
              <SolutionOutlined className="text-white text-lg" />
            </span>
            Milven Mock Exams
          </Typography.Title>
          <Typography.Text className="text-slate-500">
            Mock exams assigned by your course administrator
          </Typography.Text>
        </div>
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
                <Typography.Text className="text-slate-500 block text-base">No Milven mock exams yet</Typography.Text>
                <Typography.Text className="text-slate-400 block text-sm">
                  Your administrator will assign mock exams here when they are available
                </Typography.Text>
              </div>
            }
          />
        </Card>
      ) : (
        <AnimatePresence>
          <div className="grid grid-cols-1 gap-5">
            {mockExams.map((mock, idx) => {
              const sc = STATUS_CONFIG[mock.status] || STATUS_CONFIG.PENDING;
              const lvl = mock.course?.level;
              const isVignetteExam = lvl === 'LEVEL2' || lvl === 'LEVEL3';
              const countItemSets = (eqs) => {
                if (!eqs) return 0;
                const parentIds = new Set();
                const standaloneIds = [];
                for (const eq of eqs) {
                  const pid = eq.question?.parentId;
                  if (pid) {
                    parentIds.add(pid);
                  } else {
                    standaloneIds.push(eq.questionId);
                  }
                }
                const trueStandalone = standaloneIds.filter(id => !parentIds.has(id)).length;
                return parentIds.size + trueStandalone;
              };
              const s1Count = isVignetteExam
                ? countItemSets(mock.session1Exam?.examQuestions)
                : (mock.session1Exam?.examQuestions?.length || 0);
              const s2Count = isVignetteExam
                ? countItemSets(mock.session2Exam?.examQuestions)
                : (mock.session2Exam?.examQuestions?.length || 0);
              const countLabel = lvl === 'LEVEL3' ? 'Case Studies' : (isVignetteExam ? 'Item Sets' : 'Qs');
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
                          <Typography.Text strong className="text-base block">{mock.title || mock.course?.name || 'Milven Mock Exam'}</Typography.Text>
                          <Typography.Text className="text-xs text-slate-500">
                            {mock.course?.level} · Assigned {new Date(mock.createdAt).toLocaleDateString()}
                            {mock.scheduledBy?.name ? ` by ${mock.scheduledBy.name}` : ''}
                          </Typography.Text>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Tag style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: 20, fontWeight: 600 }}>
                          Milven Mock
                        </Tag>
                        <Tag style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.color}40`, borderRadius: 20, fontWeight: 600 }}>
                          {sc.label}
                        </Tag>
                      </div>
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
                          { title: 'Session 1', description: `${s1Count} ${countLabel} · ${mock.session1Minutes} min` },
                          { title: 'Break', description: `${mock.breakMinutes} min` },
                          { title: 'Session 2', description: `${s2Count} ${countLabel} · ${mock.session2Minutes} min` },
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

                      {/* Availability window notice */}
                      {(mock.availableFrom || mock.availableUntil) && mock.status === 'PENDING' && (() => {
                        const now = new Date();
                        const from = mock.availableFrom ? new Date(mock.availableFrom) : null;
                        const until = mock.availableUntil ? new Date(mock.availableUntil) : null;
                        const notYet = from && now < from;
                        const expired = until && now > until;
                        if (notYet) return <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">Available from <strong>{from.toLocaleString()}</strong></div>;
                        if (expired) return <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">This exam expired on <strong>{until.toLocaleString()}</strong></div>;
                        if (until) return <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm">Available until <strong>{until.toLocaleString()}</strong></div>;
                        return null;
                      })()}

                      {/* Action buttons */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {mock.status === 'PENDING' && (() => {
                          const now = new Date();
                          const from = mock.availableFrom ? new Date(mock.availableFrom) : null;
                          const until = mock.availableUntil ? new Date(mock.availableUntil) : null;
                          const locked = (from && now < from) || (until && now > until);
                          return (
                            <Button
                              type="primary"
                              size="large"
                              icon={<PlayCircleOutlined />}
                              onClick={() => startSession(mock.id, 1)}
                              className="rounded-xl"
                              style={{ background: locked ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
                              disabled={locked}
                            >
                              Start Session 1
                            </Button>
                          );
                        })()}
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
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
