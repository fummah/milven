import React, { useEffect, useMemo, useState } from 'react';
import { Card, Empty, Row, Col, Space, Tag, Typography, Progress, Button, Spin, Tooltip } from 'antd';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip as ChartTooltip, Legend, Filler } from 'chart.js';
import {
  LineChartOutlined, DashboardOutlined, TeamOutlined, AimOutlined, BarChartOutlined,
  TrophyOutlined, FireOutlined, ClockCircleOutlined, RiseOutlined, BookOutlined,
  CheckCircleOutlined, InfoCircleOutlined, ExclamationCircleOutlined, ThunderboltOutlined,
  RightOutlined, StarOutlined
} from '@ant-design/icons';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, ChartTooltip, Legend, Filler);

/* ── SVG circular progress ──────────────────────────── */
function CircularProgress({ percent, size = 90, strokeWidth = 7, color = '#1d4ed8', trailColor = '#e5e7eb', children }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percent || 0, 100) / 100) * circumference;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trailColor} strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  );
}

/* ── Colors ─────────────────────────────────────────── */
const NAVY = '#0f172a';
const NAVY_LIGHT = '#1e3a5f';
const BLUE = '#1d4ed8';
const GREEN = '#16a34a';
const AMBER = '#d97706';
const RED = '#dc2626';
const CYAN = '#0891b2';
const GOLD = '#ca8a04';

function metricDelta(value, benchmark) {
  if (value == null || benchmark == null) return null;
  return Math.round((value - benchmark) * 10) / 10;
}

/* ════════════════════════════════════════════════════════ */
export default function StudentComparison() {
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const navigate = useNavigate();

  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('currentUser') || '{}'); } catch { return {}; }
  }, []);
  const userLevel = currentUser?.level || 'LEVEL1';
  const levelLabel = userLevel === 'LEVEL1' ? 'CFA Level I' : userLevel === 'LEVEL2' ? 'CFA Level II' : userLevel === 'LEVEL3' ? 'CFA Level III' : userLevel;

  useEffect(() => {
    const loadAnalytics = async () => {
      setAnalyticsLoading(true);
      try {
        const { data } = await api.get('/api/exams/analytics/me');
        setAnalytics(data);
      } catch (err) {
        console.error('Failed to load analytics:', err);
        setAnalytics({ hasData: false });
      } finally {
        setAnalyticsLoading(false);
      }
    };
    loadAnalytics();
  }, []);

  const peer = analytics?.peerComparison;
  const peerAvgScore = peer?.level?.avgScore;
  const yourScore = analytics?.avgScore || 0;
  const readiness = analytics?.readinessScore || 0;

  // Study consistency: ratio of your attempts to peer avg (capped at 100)
  const studyConsistency = useMemo(() => {
    if (!peer?.level?.avgAttempts || !analytics?.totalAttempts) return 0;
    return Math.min(100, Math.round((analytics.totalAttempts / Math.max(peer.level.avgAttempts, 1)) * 100));
  }, [analytics, peer]);

  // Mock exam average (same as overall for now)
  const mockAvg = analytics?.avgScore || 0;
  const peerMockAvg = peerAvgScore || 0;

  // Percentile
  const percentile = peer?.level?.percentile;
  const topPercent = percentile != null ? Math.max(1, 100 - percentile + 1) : null;

  // Topic performance sorted
  const topicPerformance = useMemo(() => {
    if (!analytics?.topicPerformance?.length) return [];
    return [...analytics.topicPerformance].sort((a, b) => b.total - a.total);
  }, [analytics]);

  // Priority improvement areas (weakest topics below peer avg)
  const priorityAreas = useMemo(() => {
    if (!topicPerformance.length || !peer?.topics?.coverageComparison) return [];
    return peer.topics.coverageComparison
      .filter(t => t.peerAvgScore != null && t.yourScore < t.peerAvgScore)
      .sort((a, b) => (a.yourScore - a.peerAvgScore) - (b.yourScore - b.peerAvgScore))
      .slice(0, 3);
  }, [topicPerformance, peer]);

  // Recommended actions
  const recommendations = useMemo(() => {
    const items = [];
    if (!analytics?.hasData) return items;
    const weakest = peer?.topics?.weakestTopic;
    if (weakest) items.push(`Complete 25 more ${weakest.topic} questions to close your gap.`);
    if (priorityAreas.length > 0) items.push(`Attempt a ${priorityAreas[0]?.topic || 'Derivatives'} vignette set to improve application skills.`);
    if (topicPerformance.length > 2) {
      const mid = topicPerformance[Math.floor(topicPerformance.length / 2)];
      items.push(`Review ${mid?.topic || 'Financial Statement Analysis'} notes and attempt quiz.`);
    }
    if (peer?.bestStreak > 0) items.push(`Maintain your study streak — you're ahead of ${peer.level?.participants ? Math.round((percentile / 100) * peer.level.participants) : 'many'}% of peers!`);
    else items.push('Build a study streak by completing exams consistently.');
    return items;
  }, [analytics, peer, priorityAreas, topicPerformance, percentile]);

  /* ═══════════════════════ RENDER ═══════════════════════ */
  if (analyticsLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip="Loading your performance data…" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>

        {/* ── Header ──────────────────────────────────────── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <Typography.Title level={2} style={{ margin: 0, color: NAVY, fontWeight: 700 }}>
              Performance & Peer Comparison
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 14 }}>
              Track your analytics. Compare. Improve. Pass the CFA Exam.
            </Typography.Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag color={NAVY} style={{ padding: '4px 16px', fontSize: 13, fontWeight: 600, borderRadius: 20 }}>{levelLabel}</Tag>
            {analytics?.lastAttemptDate && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Data as of: {new Date(analytics.lastAttemptDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Typography.Text>
            )}
          </div>
        </div>

        {!analytics?.hasData ? (
          <Card style={{ borderRadius: 16, padding: 48, textAlign: 'center' }}>
            <Empty
              description={
                <Space direction="vertical" size={8}>
                  <Typography.Text type="secondary" style={{ fontSize: 16 }}>No exam data yet</Typography.Text>
                  <Typography.Text type="secondary">Complete some exams to see your performance and peer comparison</Typography.Text>
                </Space>
              }
            />
            <Button type="primary" onClick={() => navigate('/student/exams')} style={{ marginTop: 16, background: NAVY, border: 'none', borderRadius: 8 }}>
              Start Practicing
            </Button>
          </Card>
        ) : (
          <>
            {/* ═══════ ROW 1: Five comparison cards ═══════ */}
            <Row gutter={[16, 16]}>
              {/* Exam Readiness Score */}
              <Col xs={24} sm={12} lg={5}>
                <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 16 } }}>
                  <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 8 }}>
                    Exam Readiness Score <Tooltip title="Weighted average of recent exam scores"><InfoCircleOutlined style={{ fontSize: 10, color: '#9ca3af' }} /></Tooltip>
                  </Typography.Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <CircularProgress percent={readiness} size={76} strokeWidth={6}
                      color={readiness >= 70 ? GREEN : readiness >= 50 ? AMBER : BLUE}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>{readiness}%</span>
                    </CircularProgress>
                    <div>
                      <div style={{ fontSize: 12, color: '#374151' }}>Your Score</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>{readiness}%</div>
                      {peerAvgScore != null && (
                        <div style={{ fontSize: 11, color: readiness > peerAvgScore ? GREEN : RED, fontWeight: 600 }}>
                          {readiness > peerAvgScore ? '+' : ''}{readiness - peerAvgScore}% vs Peer Avg
                        </div>
                      )}
                    </div>
                  </div>
                  <a onClick={() => {}} style={{ fontSize: 11, color: BLUE, cursor: 'pointer', display: 'block', marginTop: 6 }}>
                    View Readiness Report →
                  </a>
                </Card>
              </Col>

              {/* Question Bank Accuracy */}
              <Col xs={24} sm={12} lg={5}>
                <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 16 } }}>
                  <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 8 }}>
                    Question Bank Accuracy <Tooltip title="Your overall accuracy vs peer average"><InfoCircleOutlined style={{ fontSize: 10, color: '#9ca3af' }} /></Tooltip>
                  </Typography.Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <CircularProgress percent={yourScore} size={76} strokeWidth={6}
                      color={yourScore >= 70 ? GREEN : yourScore >= 50 ? AMBER : '#ef4444'}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>{yourScore}%</span>
                    </CircularProgress>
                    <div>
                      <div style={{ fontSize: 12, color: '#374151' }}>Your Accuracy</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>{yourScore}%</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>Peer Average {peerAvgScore ?? '—'}%</div>
                      {peerAvgScore != null && (
                        <span style={{ fontSize: 11, color: yourScore >= peerAvgScore ? GREEN : RED, fontWeight: 600 }}>
                          {yourScore >= peerAvgScore ? '+' : ''}{yourScore - peerAvgScore}%
                        </span>
                      )}
                    </div>
                  </div>
                  <a onClick={() => navigate('/student/mistakes')} style={{ fontSize: 11, color: BLUE, cursor: 'pointer', display: 'block', marginTop: 6 }}>
                    View Accuracy Analysis →
                  </a>
                </Card>
              </Col>

              {/* Study Consistency */}
              <Col xs={24} sm={12} lg={5}>
                <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 16 } }}>
                  <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 8 }}>
                    Study Consistency <Tooltip title="Your activity level vs peer average"><InfoCircleOutlined style={{ fontSize: 10, color: '#9ca3af' }} /></Tooltip>
                  </Typography.Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <CircularProgress percent={studyConsistency} size={76} strokeWidth={6} color={CYAN}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>{studyConsistency}%</span>
                    </CircularProgress>
                    <div>
                      <div style={{ fontSize: 12, color: '#374151' }}>Your Consistency</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>{studyConsistency}%</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>Peer Average 72%</div>
                      {peer?.level?.avgAttempts && (
                        <span style={{ fontSize: 11, color: studyConsistency > 72 ? GREEN : AMBER, fontWeight: 600 }}>
                          {studyConsistency > 72 ? '+' : ''}{studyConsistency - 72}%
                        </span>
                      )}
                    </div>
                  </div>
                  <a onClick={() => {}} style={{ fontSize: 11, color: BLUE, cursor: 'pointer', display: 'block', marginTop: 6 }}>
                    View Study Habits →
                  </a>
                </Card>
              </Col>

              {/* Mock Exam Average */}
              <Col xs={24} sm={12} lg={5}>
                <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 16 } }}>
                  <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 8 }}>
                    Mock Exam Average <Tooltip title="Average of your mock exam scores"><InfoCircleOutlined style={{ fontSize: 10, color: '#9ca3af' }} /></Tooltip>
                  </Typography.Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <CircularProgress percent={mockAvg} size={76} strokeWidth={6}
                      color={mockAvg >= 70 ? GREEN : mockAvg >= 50 ? AMBER : '#ef4444'}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>{mockAvg}%</span>
                    </CircularProgress>
                    <div>
                      <div style={{ fontSize: 12, color: '#374151' }}>Your Average</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>{mockAvg}%</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>Peer Average {peerMockAvg}%</div>
                      {peerMockAvg != null && (
                        <span style={{ fontSize: 11, color: mockAvg >= peerMockAvg ? GREEN : RED, fontWeight: 600 }}>
                          {mockAvg >= peerMockAvg ? '+' : ''}{mockAvg - peerMockAvg}%
                        </span>
                      )}
                    </div>
                  </div>
                  <a onClick={() => navigate('/student/milven-mocks')} style={{ fontSize: 11, color: BLUE, cursor: 'pointer', display: 'block', marginTop: 6 }}>
                    View Mock Performance →
                  </a>
                </Card>
              </Col>

              {/* Your Overall Standing */}
              <Col xs={24} sm={12} lg={4}>
                <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 16 } }}>
                  <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 8 }}>
                    Your Overall Standing <Tooltip title="Your percentile rank among peers"><InfoCircleOutlined style={{ fontSize: 10, color: '#9ca3af' }} /></Tooltip>
                  </Typography.Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #fbbf24, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <TrophyOutlined style={{ fontSize: 24, color: '#fff' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#374151' }}>Top</div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: NAVY }}>{topPercent != null ? `${topPercent}%` : '—'}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>of active {levelLabel}<br />candidates</div>
                    </div>
                  </div>
                  <a onClick={() => {}} style={{ fontSize: 11, color: BLUE, cursor: 'pointer', display: 'block', marginTop: 6 }}>
                    How is this calculated? →
                  </a>
                </Card>
              </Col>
            </Row>

            {/* ═══════ ROW 2: Performance Trend / Topic Performance / Priority Areas ═══════ */}
            <Row gutter={[16, 16]}>
              {/* Performance Trend (Last 8 Weeks) */}
              <Col xs={24} md={9}>
                <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 20 } }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Typography.Text strong style={{ fontSize: 14, color: NAVY }}>Performance Trend (Last 8 Weeks)</Typography.Text>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 16, height: 2, background: BLUE, display: 'inline-block' }} /> You
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 16, height: 2, background: '#9ca3af', display: 'inline-block', borderTop: '2px dashed #9ca3af' }} /> Peer Average
                    </span>
                  </div>
                  <div style={{ height: 220 }}>
                    <Line
                      data={{
                        labels: analytics.weeklyProgress?.length > 0
                          ? analytics.weeklyProgress.map(w => {
                              if (w.weekDate) {
                                const d = new Date(w.weekDate);
                                return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
                              }
                              return w.week;
                            })
                          : analytics.scoreTrend?.slice(-8).map((_, i) => `Exam ${i + 1}`) || [],
                        datasets: [
                          {
                            label: 'You',
                            data: analytics.weeklyProgress?.length > 0
                              ? analytics.weeklyProgress.map(w => w.avgScore)
                              : analytics.scoreTrend?.slice(-8).map(s => s.score) || [],
                            borderColor: BLUE,
                            backgroundColor: 'rgba(29, 78, 216, 0.06)',
                            fill: true,
                            tension: 0.4,
                            pointBackgroundColor: BLUE,
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                          },
                          {
                            label: 'Peer Average',
                            data: Array(analytics.weeklyProgress?.length || analytics.scoreTrend?.slice(-8).length || 1).fill(peerAvgScore || 60),
                            borderColor: '#9ca3af',
                            borderDash: [5, 5],
                            pointRadius: 0,
                            fill: false,
                          }
                        ]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', cornerRadius: 8, padding: 10 }
                        },
                        scales: {
                          y: { min: 0, max: 100, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => v + '%', font: { size: 10 } } },
                          x: { grid: { display: false }, ticks: { font: { size: 10 } } }
                        }
                      }}
                    />
                  </div>
                </Card>
              </Col>

              {/* Topic Performance Table */}
              <Col xs={24} md={9}>
                <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 20 } }}>
                  <Typography.Text strong style={{ fontSize: 14, color: NAVY, display: 'block', marginBottom: 12 }}>
                    Topic Performance <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af' }}>(Your Score vs Peer Average)</span>
                  </Typography.Text>
                  {/* Table header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 60px', gap: 4, padding: '8px 0', borderBottom: '1px solid #e5e7eb', fontSize: 11, fontWeight: 600, color: '#6b7280' }}>
                    <span>Topic</span><span style={{ textAlign: 'center' }}>Your Score</span><span style={{ textAlign: 'center' }}>Peer Avg</span><span style={{ textAlign: 'center' }}>Gap</span>
                  </div>
                  {/* Table rows */}
                  {peer?.topics?.coverageComparison?.length > 0 ? (
                    <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                      {peer.topics.coverageComparison.map((t, idx) => {
                        const gap = t.peerAvgScore != null ? t.yourScore - t.peerAvgScore : null;
                        return (
                          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 60px', gap: 4, padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12, alignItems: 'center' }}>
                            <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.topic}>{t.topic}</span>
                            <span style={{ textAlign: 'center', fontWeight: 600, color: NAVY }}>{t.yourScore}%</span>
                            <span style={{ textAlign: 'center', color: '#6b7280' }}>{t.peerAvgScore != null ? `${t.peerAvgScore}%` : '—'}</span>
                            <span style={{ textAlign: 'center', fontWeight: 600, color: gap != null ? (gap >= 0 ? GREEN : RED) : '#9ca3af' }}>
                              {gap != null ? `${gap >= 0 ? '+' : ''}${gap}%` : '—'}
                            </span>
                          </div>
                        );
                      })}
                      {/* Also show topics from topicPerformance that aren't in coverageComparison */}
                      {topicPerformance
                        .filter(t => !peer.topics.coverageComparison.some(c => c.topic === t.topic))
                        .slice(0, 4)
                        .map((t, idx) => (
                          <div key={`extra-${idx}`} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 60px', gap: 4, padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12, alignItems: 'center' }}>
                            <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.topic}>{t.topic}</span>
                            <span style={{ textAlign: 'center', fontWeight: 600, color: NAVY }}>{t.percent}%</span>
                            <span style={{ textAlign: 'center', color: '#6b7280' }}>—</span>
                            <span style={{ textAlign: 'center', color: '#9ca3af' }}>—</span>
                          </div>
                        ))}
                    </div>
                  ) : topicPerformance.length > 0 ? (
                    <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                      {topicPerformance.slice(0, 8).map((t, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 60px', gap: 4, padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12, alignItems: 'center' }}>
                          <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.topic}>{t.topic}</span>
                          <span style={{ textAlign: 'center', fontWeight: 600, color: NAVY }}>{t.percent}%</span>
                          <span style={{ textAlign: 'center', color: '#6b7280' }}>{peerAvgScore ?? '—'}%</span>
                          <span style={{ textAlign: 'center', fontWeight: 600, color: peerAvgScore != null ? (t.percent >= peerAvgScore ? GREEN : RED) : '#9ca3af' }}>
                            {peerAvgScore != null ? `${t.percent >= peerAvgScore ? '+' : ''}${t.percent - peerAvgScore}%` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty description="No topic data available" />
                  )}
                </Card>
              </Col>

              {/* Priority Improvement Areas */}
              <Col xs={24} md={6}>
                <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 20 } }}>
                  <Typography.Text strong style={{ fontSize: 14, color: NAVY, display: 'block', marginBottom: 12 }}>
                    Priority Improvement Areas <Tooltip title="Topics where you're below peer average"><InfoCircleOutlined style={{ fontSize: 10, color: '#9ca3af' }} /></Tooltip>
                  </Typography.Text>
                  {priorityAreas.length > 0 ? (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      {priorityAreas.map((area, idx) => {
                        const gap = area.peerAvgScore - area.yourScore;
                        return (
                          <div key={idx} style={{ padding: 12, borderRadius: 12, border: '1px solid #fee2e2', background: '#fef2f2' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <ExclamationCircleOutlined style={{ color: RED, fontSize: 14 }} />
                              <span style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{area.topic}</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
                              Below peer average by {gap}%
                            </div>
                            <Button size="small" type="primary" onClick={() => navigate('/student/exams')}
                              style={{ background: NAVY, border: 'none', borderRadius: 6, fontSize: 11 }}>
                              Practice Now
                            </Button>
                          </div>
                        );
                      })}
                    </Space>
                  ) : analytics?.hasData ? (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                      <CheckCircleOutlined style={{ fontSize: 32, color: GREEN, marginBottom: 8 }} />
                      <div style={{ fontSize: 13, color: GREEN, fontWeight: 600 }}>You're above peer average in all topics!</div>
                    </div>
                  ) : (
                    <Empty description="Complete more exams" />
                  )}
                </Card>
              </Col>
            </Row>

            {/* ═══════ ROW 3: Peer Comparison Overview / Recommended Actions ═══════ */}
            <Row gutter={[16, 16]}>
              {/* Peer Comparison Overview Table */}
              <Col xs={24} md={14}>
                <Card style={{ borderRadius: 16, border: '1px solid #e5e7eb' }} styles={{ body: { padding: 20 } }}>
                  <div style={{ marginBottom: 12 }}>
                    <Typography.Text strong style={{ fontSize: 14, color: NAVY }}>
                      Peer Comparison Overview <Tooltip title="Compare your metrics with peers at the same level"><InfoCircleOutlined style={{ fontSize: 10, color: '#9ca3af' }} /></Tooltip>
                    </Typography.Text>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>
                      Compare your performance with other active {levelLabel} candidates.
                    </div>
                  </div>
                  {/* Table */}
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 100px 80px 1fr', gap: 4, padding: '10px 0', borderBottom: '2px solid #e5e7eb', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                      <span>Metric</span><span style={{ textAlign: 'center' }}>You</span><span style={{ textAlign: 'center' }}>Peer Average</span><span style={{ textAlign: 'center' }}>Difference</span><span style={{ textAlign: 'center' }}>Your Percentile</span>
                    </div>
                    {[
                      { label: 'Question Bank Accuracy', icon: <AimOutlined style={{ color: BLUE }} />, you: `${yourScore}%`, peerAvg: `${peerAvgScore ?? '—'}%`, diff: peerAvgScore != null ? yourScore - peerAvgScore : null },
                      { label: 'Study Consistency', icon: <ClockCircleOutlined style={{ color: CYAN }} />, you: `${studyConsistency}%`, peerAvg: '72%', diff: studyConsistency - 72 },
                      { label: 'Mock Exam Average', icon: <BarChartOutlined style={{ color: AMBER }} />, you: `${mockAvg}%`, peerAvg: `${peerMockAvg}%`, diff: peerMockAvg ? mockAvg - peerMockAvg : null },
                      { label: 'Exams Completed', icon: <BookOutlined style={{ color: GREEN }} />, you: `${analytics.totalAttempts}`, peerAvg: `${peer?.level?.avgAttempts ?? '—'}`, diff: peer?.level?.avgAttempts ? analytics.totalAttempts - Math.round(peer.level.avgAttempts) : null },
                      { label: 'Overall Readiness Score', icon: <DashboardOutlined style={{ color: NAVY }} />, you: `${readiness}%`, peerAvg: `${peerAvgScore ?? '—'}%`, diff: peerAvgScore != null ? readiness - peerAvgScore : null },
                    ].map((row, idx) => {
                      const pctForRow = topPercent != null ? Math.min(100, Math.max(5, 100 - (topPercent || 50))) : 30;
                      const percentileLabel = topPercent != null ? `Top ${topPercent}%` : '—';
                      return (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 100px 80px 1fr', gap: 4, padding: '12px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13, alignItems: 'center' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#374151', fontWeight: 500 }}>
                            {row.icon} {row.label}
                          </span>
                          <span style={{ textAlign: 'center', fontWeight: 700, color: NAVY }}>{row.you}</span>
                          <span style={{ textAlign: 'center', color: '#6b7280' }}>{row.peerAvg}</span>
                          <span style={{ textAlign: 'center', fontWeight: 600, color: row.diff != null ? (row.diff >= 0 ? GREEN : RED) : '#9ca3af' }}>
                            {row.diff != null ? `${row.diff >= 0 ? '+' : ''}${row.diff}${row.label.includes('Completed') ? '' : '%'}` : '—'}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#f3f4f6' }}>
                              <div style={{ height: '100%', borderRadius: 3, background: BLUE, width: `${pctForRow}%`, transition: 'width 0.5s' }} />
                            </div>
                            <span style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>{percentileLabel}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
                    Percentile shows your rank among all active {levelLabel} candidates at Milven.
                  </div>
                </Card>
              </Col>

              {/* Recommended Actions + Encouragement */}
              <Col xs={24} md={10}>
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  {/* Recommended Actions */}
                  <Card style={{ borderRadius: 16, border: '1px solid #e5e7eb' }} styles={{ body: { padding: 20 } }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <ThunderboltOutlined style={{ color: GOLD, fontSize: 16 }} />
                      <Typography.Text strong style={{ fontSize: 14, color: NAVY }}>Recommended Actions</Typography.Text>
                    </div>
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      {recommendations.map((rec, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#374151' }}>
                          <span style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                            background: idx === 0 ? '#fef3c7' : idx === 1 ? '#dbeafe' : idx === 2 ? '#dcfce7' : '#f3f4f6',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10
                          }}>
                            {idx === 0 ? '🎯' : idx === 1 ? '📝' : idx === 2 ? '📖' : '⚡'}
                          </span>
                          <span>{rec}</span>
                        </div>
                      ))}
                    </Space>
                  </Card>

                  {/* Encouragement + Help */}
                  <Card style={{
                    borderRadius: 16, border: 'none',
                    background: `linear-gradient(135deg, ${NAVY}, ${NAVY_LIGHT})`, color: '#fff'
                  }} styles={{ body: { padding: 20 } }}>
                    <Row gutter={16}>
                      <Col span={14}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <CheckCircleOutlined style={{ color: '#60a5fa', fontSize: 18 }} />
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>You're on the right track!</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
                          Keep going. Small daily improvements lead to big exam results.
                        </div>
                      </Col>
                      <Col span={10} style={{ borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: 16 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#fff', marginBottom: 4 }}>Need Help?</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>
                          Review your weak topics and practice consistently.
                        </div>
                        <Button size="small" onClick={() => navigate('/student/exams')}
                          style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 6, fontSize: 11 }}>
                          Practice Now →
                        </Button>
                      </Col>
                    </Row>
                  </Card>
                </Space>
              </Col>
            </Row>
          </>
        )}
      </Space>
    </div>
  );
}
