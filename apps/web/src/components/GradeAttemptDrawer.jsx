import React, { useEffect, useState } from 'react';
import { Drawer, Card, Typography, Space, Button, Tag, InputNumber, message, Modal } from 'antd';
import { BulbOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../lib/api';

function getCandidateLabel(user) {
  if (!user) return '—';
  if (user.name) return user.name;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.email || user.id || '—';
}

export function GradeAttemptDrawer({ attemptId, open, onClose, onSaved }) {
  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [markModalOpen, setMarkModalOpen] = useState(false);
  const [markModalAnswerId, setMarkModalAnswerId] = useState(null);
  const [markModalValue, setMarkModalValue] = useState(null);
  const [markModalMax, setMarkModalMax] = useState(1);

  useEffect(() => {
    if (!open || !attemptId) {
      setAttempt(null);
      return;
    }
    let mounted = true;
    setLoading(true);
    api.get(`/api/exams/attempts/${attemptId}`)
      .then(({ data }) => {
        if (!mounted) return;
        setAttempt(data.attempt);
      })
      .catch(() => {
        if (mounted) message.error('Failed to load attempt');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [open, attemptId]);

  const saveMarksAwarded = async (answerId, marksAwarded) => {
    if (!attempt?.id) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/api/exams/attempts/${attempt.id}/answers/${answerId}`, { marksAwarded });
      if (data.attempt) setAttempt(data.attempt);
      message.success('Marks saved; score updated.');
      onSaved?.();
    } catch (e) {
      message.error(e?.response?.data?.error || 'Failed to save marks');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setAttempt(null);
    setMarkModalOpen(false);
    setMarkModalAnswerId(null);
    onClose?.();
  };

  const openMarkModal = (answerId, maxMarks) => {
    setMarkModalAnswerId(answerId);
    setMarkModalMax(maxMarks ?? 1);
    setMarkModalValue(maxMarks ?? 1);
    setMarkModalOpen(true);
  };

  const submitMarkFromModal = () => {
    if (markModalAnswerId == null) return;
    const value = Math.min(markModalMax, Math.max(0, Number(markModalValue) || 0));
    saveMarksAwarded(markModalAnswerId, value);
    setMarkModalOpen(false);
    setMarkModalAnswerId(null);
  };

  const constructedAnswers = attempt ? (attempt.answers || []).filter((a) => a?.question?.type === 'CONSTRUCTED_RESPONSE') : [];
  const total = constructedAnswers.length;
  const remaining = constructedAnswers.filter((a) => a.marksAwarded == null).length;

  return (
    <Drawer
      title="Grade attempt (constructed response)"
      open={open}
      onClose={handleClose}
      width={920}
      destroyOnClose
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' } }}
    >
      {loading ? (
        <div className="py-8 text-center text-slate-500">Loading…</div>
      ) : !attempt ? (
        <div className="py-8 text-center text-slate-500">No attempt selected.</div>
      ) : (
        <>
          {/* Fixed header: always visible at top of drawer */}
          <div
            className="flex flex-wrap items-center gap-3 px-4 py-3 shrink-0"
            style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', border: 'none' }}
          >
            <div className="flex items-center gap-2 text-white">
              <Typography.Text strong className="!text-white">Candidate:</Typography.Text>
              <Typography.Text className="!text-slate-200">{getCandidateLabel(attempt.user)}</Typography.Text>
            </div>
            <Tag color="blue" className="!m-0">Score: {attempt.scorePercent != null ? `${Math.round(attempt.scorePercent)}%` : '—'}</Tag>
            <Typography.Text className="!text-slate-300 text-sm">
              Questions: {remaining} remaining / {total} total
            </Typography.Text>
            {attempt.submittedAt && (
              <Typography.Text className="!text-slate-400 text-sm">
                Submitted {dayjs(attempt.submittedAt).format('YYYY-MM-DD HH:mm')}
              </Typography.Text>
            )}
          </div>
          {/* Scrollable body */}
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {(() => {
            const allAnswers = attempt.answers || [];
            const grouped = new Map();
            allAnswers.forEach((a, idx) => {
              const parentId = a?.question?.parent?.id || null;
              const vignetteText = a?.question?.parent?.vignetteText || null;
              if (parentId && vignetteText) {
                if (!grouped.has(parentId)) grouped.set(parentId, { vignetteText, answers: [] });
                grouped.get(parentId).answers.push({ ...a, originalIdx: idx });
              } else {
                grouped.set(`single-${a.id}`, { vignetteText: null, answers: [{ ...a, originalIdx: idx }] });
              }
            });
            return Array.from(grouped.values()).map((group, groupIdx) => (
              <div key={groupIdx}>
                {group.vignetteText && (
                  <Card size="small" style={{ marginBottom: 12, background: '#f0f9ff', borderColor: '#bae6fd' }} title={<Typography.Text strong style={{ color: '#0369a1' }}>Case Study</Typography.Text>}>
                    <div className="prose max-w-none text-sm" dangerouslySetInnerHTML={{ __html: group.vignetteText }} />
                  </Card>
                )}
                {group.answers.map((a) => {
            const idx = a.originalIdx;
            const isConstructed = a?.question?.type === 'CONSTRUCTED_RESPONSE';
            const maxMarks = a?.question?.marks ?? 1;
            if (!isConstructed) {
              return (
                <Card size="small" key={a.id} title={`Question ${idx + 1} (MCQ)`}>
                  <Typography.Paragraph className="!mb-2 text-slate-600" ellipsis={{ rows: 2 }}>{a?.question?.stem?.replace(/<[^>]+>/g, '')}</Typography.Paragraph>
                  <Tag color={a.isCorrect ? 'green' : 'red'}>{a.isCorrect ? 'Correct' : 'Incorrect'}</Tag>
                </Card>
              );
            }
            return (
              <Card
                size="small"
                key={a.id}
                title={
                  <Space wrap>
                    {a?.question?.qid && (
                      <Typography.Text strong style={{ fontSize: 18, color: '#1e293b' }}>{a.question.qid}</Typography.Text>
                    )}
                    <span>Question {idx + 1} (Essay)</span>
                    {a.marksAwarded != null && <Tag color="blue">Mark: {a.marksAwarded} / {maxMarks}</Tag>}
                  </Space>
                }
              >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                    <Typography.Text strong className="text-slate-700 block mb-2">Question</Typography.Text>
                    <div className="text-slate-700 text-sm prose max-w-none question-preview-content" dangerouslySetInnerHTML={{ __html: a?.question?.stem || '' }} />
                  </div>
                  
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <Typography.Text strong className="text-slate-700 block mb-2">Candidate response</Typography.Text>
                    {a?.textAnswer ? (
                      <div className="text-slate-800 text-sm prose max-w-none question-preview-content" dangerouslySetInnerHTML={{ __html: a.textAnswer }} />
                    ) : (
                      <Typography.Text type="secondary">(No response provided)</Typography.Text>
                    )}
                  </div>
                  
                  {(a?.question?.questionGuidelines || a?.question?.output) && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 p-3">
                      <Typography.Text strong className="text-indigo-800 text-xs block mb-2">
                        <BulbOutlined className="mr-1" /> Marking Guidelines & Expected Output
                      </Typography.Text>
                      <div className="text-slate-700 text-xs space-y-2">
                        {a?.question?.questionGuidelines && (
                          <div>
                            <Typography.Text strong className="text-xs text-indigo-700 block mb-1">Guidelines:</Typography.Text>
                            <div className="question-preview-content" dangerouslySetInnerHTML={{ __html: a.question.questionGuidelines }} />
                          </div>
                        )}
                        {a?.question?.output && (
                          <div>
                            <Typography.Text strong className="text-xs text-indigo-700 block mb-1">Expected Output:</Typography.Text>
                            <div className="question-preview-content" dangerouslySetInnerHTML={{ __html: a.question.output }} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                    <Typography.Text strong className="text-amber-800 text-xs block mb-2">
                      <BulbOutlined className="mr-1" /> Key Formula(s) & Worked Solution
                    </Typography.Text>
                    <div className="text-slate-700 text-xs space-y-2">
                      {a?.question?.keyFormulas && (
                        <div className="question-preview-content" dangerouslySetInnerHTML={{ __html: a.question.keyFormulas }} />
                      )}
                      {a?.question?.workedSolution && (
                        <div className="question-preview-content" dangerouslySetInnerHTML={{ __html: a.question.workedSolution }} />
                      )}
                      {!a?.question?.keyFormulas && !a?.question?.workedSolution && (
                        <Typography.Text type="secondary">No key formulas or worked solution set.</Typography.Text>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
                    <Typography.Text strong className="text-slate-600">Award:</Typography.Text>
                    <Button
                      type="primary"
                      size="middle"
                      onClick={() => openMarkModal(a.id, maxMarks)}
                      loading={saving}
                      className="min-w-[52px]"
                      style={{ background: '#0d9488', borderColor: '#0d9488' }}
                    >
                      Y
                    </Button>
                    <Typography.Text type="secondary" className="text-xs">(max marks)</Typography.Text>
                    <Button
                      type="default"
                      danger
                      size="middle"
                      onClick={() => saveMarksAwarded(a.id, 0)}
                      loading={saving}
                      className="min-w-[52px]"
                    >
                      N
                    </Button>
                    <Typography.Text type="secondary" className="text-xs">(zero marks)</Typography.Text>
                  </div>
                </Space>
              </Card>
            );
          })}
              </div>
            ));
          })()}
            </Space>
          </div>
        </>
      )}

      {/* Popup when admin presses Y: set mark (default max) */}
      <Modal
        title="Award marks"
        open={markModalOpen}
        onCancel={() => { setMarkModalOpen(false); setMarkModalAnswerId(null); }}
        onOk={submitMarkFromModal}
        okText="Save mark"
        destroyOnClose
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">Maximum for this question is {markModalMax}. You can award up to that value (default is max).</Typography.Text>
          <div className="flex items-center gap-2">
            <Typography.Text>Marks:</Typography.Text>
            <InputNumber
              min={0}
              max={markModalMax}
              value={markModalValue}
              onChange={(v) => setMarkModalValue(v)}
              style={{ width: 100 }}
            />
            <Typography.Text type="secondary">/ {markModalMax}</Typography.Text>
          </div>
        </Space>
      </Modal>
    </Drawer>
  );
}
