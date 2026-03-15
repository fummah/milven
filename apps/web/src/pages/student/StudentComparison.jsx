import React, { useEffect, useMemo, useState } from 'react';
import { Card, Empty, Row, Col, Space, Tag, Typography, Progress, Input } from 'antd';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { LineChartOutlined, DashboardOutlined, TeamOutlined, AimOutlined, BarChartOutlined, TrophyOutlined, FireOutlined, ClockCircleOutlined, RiseOutlined, BookOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

function metricDelta(value, benchmark) {
  if (value == null || benchmark == null) return null;
  return Math.round((value - benchmark) * 10) / 10;
}

export default function StudentComparison() {
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [completedFilterExamName, setCompletedFilterExamName] = useState('');

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

  const filteredCompletedAttempts = useMemo(() => {
    if (!analytics?.peerComparison || !analytics?.peerComparison?.level) return [];
    const list = analytics.completedAttempts || [];
    if (!completedFilterExamName?.trim()) return list;
    const q = completedFilterExamName.trim().toLowerCase();
    return list.filter((a) => (a.examName || '').toLowerCase().includes(q));
  }, [analytics, completedFilterExamName]);

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <div className="page-header">
        <div>
          <Typography.Title level={2} className="page-header-title">
            Compare With Other Candidates
          </Typography.Title>
          <div className="page-header-subtitle">
            See how your performance and participation compare with your peers.
          </div>
        </div>
      </div>

      {/* Performance Trends & Readiness (reused layout from dashboard for context) */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card
            className="modern-card"
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="icon-badge-sm icon-badge-purple">
                  <LineChartOutlined />
                </div>
                <span style={{ fontWeight: 600 }}>Performance Trends</span>
                {analytics?.improvement !== undefined && analytics.improvement !== 0 && (
                  <Tag color={analytics.improvement > 0 ? 'green' : 'orange'} style={{ marginLeft: 8 }}>
                    {analytics.improvement > 0 ? '+' : ''}{analytics.improvement}% improvement
                  </Tag>
                )}
              </div>
            }
            loading={analyticsLoading}
          >
            {!analytics?.hasData ? (
              <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty
                  description={
                    <Space direction="vertical" size={8}>
                      <Typography.Text type="secondary">No exam data yet</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Complete some exams to see your performance trends
                      </Typography.Text>
                    </Space>
                  }
                />
              </div>
            ) : (
              <div style={{ height: 280 }}>
                <Line
                  data={{
                    labels: analytics.weeklyProgress?.length > 0
                      ? analytics.weeklyProgress.map(w => w.week)
                      : analytics.scoreTrend?.slice(-8).map((_, i) => `Exam ${i + 1}`) || [],
                    datasets: [
                      {
                        label: 'Score %',
                        data: analytics.weeklyProgress?.length > 0
                          ? analytics.weeklyProgress.map(w => w.avgScore)
                          : analytics.scoreTrend?.slice(-8).map(s => s.score) || [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#3b82f6',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                      },
                      {
                        label: 'Target (70%)',
                        data: Array((analytics.weeklyProgress?.length || analytics.scoreTrend?.slice(-8).length || 1)).fill(70),
                        borderColor: '#22c55e',
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
                      legend: {
                        position: 'top',
                        labels: { usePointStyle: true, padding: 20 }
                      },
                      tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleColor: '#fff',
                        bodyColor: '#e2e8f0',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12
                      }
                    },
                    scales: {
                      y: {
                        min: 0,
                        max: 100,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: { callback: (v) => v + '%' }
                      },
                      x: {
                        grid: { display: false }
                      }
                    }
                  }}
                />
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            className="modern-card"
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="icon-badge-sm icon-badge-cyan">
                  <DashboardOutlined />
                </div>
                <span style={{ fontWeight: 600 }}>Readiness Score</span>
              </div>
            }
            style={{ height: '100%' }}
            loading={analyticsLoading}
          >
            {!analytics?.hasData ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Empty description="Complete exams to see your readiness score" />
              </div>
            ) : (
              <>
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{
                    width: 140,
                    height: 140,
                    margin: '0 auto 20px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}>
                    <div style={{
                      width: 110,
                      height: 110,
                      borderRadius: '50%',
                      background: analytics.readinessScore >= 70
                        ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                        : analytics.readinessScore >= 50
                          ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                          : 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column'
                    }}>
                      <Typography.Text style={{ fontSize: 36, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                        {analytics.readinessScore}
                      </Typography.Text>
                      <Typography.Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
                        / 100
                      </Typography.Text>
                    </div>
                  </div>
                  <Tag
                    color={analytics.readinessScore >= 70 ? 'green' : analytics.readinessScore >= 50 ? 'orange' : 'blue'}
                    style={{ marginBottom: 12, padding: '4px 12px', borderRadius: 12 }}
                  >
                    {analytics.readinessScore >= 70 ? (
                      <><CheckCircleOutlined /> On Track</>
                    ) : analytics.readinessScore >= 50 ? (
                      <><ClockCircleOutlined /> Getting There</>
                    ) : (
                      <><RiseOutlined /> Keep Going</>
                    )}
                  </Tag>
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
                    Estimated pass probability: <strong style={{ color: analytics.passEstimate >= 70 ? '#22c55e' : '#f59e0b' }}>{analytics.passEstimate}%</strong>
                  </Typography.Text>
                </div>
              </>
            )}
          </Card>
        </Col>
      </Row>

      {/* Peer comparison section (moved from dashboard) */}
      <Card
        className="modern-card"
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-badge-sm icon-badge-pink">
              <TeamOutlined />
            </div>
            <span style={{ fontWeight: 600 }}>Compare With Other Candidates</span>
            {analytics?.peerComparison?.level?.percentile != null && (
              <Tag color="magenta" style={{ marginLeft: 8 }}>
                Top {Math.max(1, 100 - analytics.peerComparison.level.percentile + 1)}%
              </Tag>
            )}
          </div>
        }
        loading={analyticsLoading}
      >
        {!analytics?.hasData || !analytics?.peerComparison ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Empty description="Complete exams to compare yourself with other candidates" />
          </div>
        ) : (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <div style={{
                  borderRadius: 20,
                  padding: 20,
                  background: 'linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%)',
                  border: '1px solid rgba(99, 102, 241, 0.12)',
                  height: '100%'
                }}>
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    <Tag color="blue" icon={<AimOutlined />}>Same Level</Tag>
                    <Typography.Title level={3} style={{ margin: 0 }}>
                      {analytics.peerComparison.level.percentile != null ? `${analytics.peerComparison.level.percentile}th percentile` : 'No ranking yet'}
                    </Typography.Title>
                    <Typography.Text type="secondary">
                      Based on candidates in {analytics.peerComparison.level.label || 'your level'} with submitted exams.
                    </Typography.Text>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Your Avg Score</Typography.Text>
                        <Typography.Title level={4} style={{ margin: 0 }}>{analytics.avgScore}%</Typography.Title>
                      </div>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Level Avg</Typography.Text>
                        <Typography.Title level={4} style={{ margin: 0 }}>
                          {analytics.peerComparison.level.avgScore != null ? `${analytics.peerComparison.level.avgScore}%` : '—'}
                        </Typography.Title>
                      </div>
                    </div>
                    {metricDelta(analytics.avgScore, analytics.peerComparison.level.avgScore) != null && (
                      <Tag color={metricDelta(analytics.avgScore, analytics.peerComparison.level.avgScore) >= 0 ? 'green' : 'orange'}>
                        {metricDelta(analytics.avgScore, analytics.peerComparison.level.avgScore) >= 0 ? '+' : ''}{metricDelta(analytics.avgScore, analytics.peerComparison.level.avgScore)} pts vs level average
                      </Tag>
                    )}
                  </Space>
                </div>
              </Col>
              <Col xs={24} md={8}>
                <div style={{
                  borderRadius: 20,
                  padding: 20,
                  background: 'linear-gradient(135deg, #f5f3ff 0%, #fdf2f8 100%)',
                  border: '1px solid rgba(236, 72, 153, 0.12)',
                  height: '100%'
                }}>
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    <Tag color="purple" icon={<BarChartOutlined />}>Same Courses</Tag>
                    <Typography.Title level={3} style={{ margin: 0 }}>
                      {analytics.peerComparison.course.participants || 0} peers
                    </Typography.Title>
                    <Typography.Text type="secondary">
                      Comparing candidates active in {analytics.peerComparison.course.courseNames?.join(', ') || 'your enrolled courses'}.
                    </Typography.Text>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Your Course Avg</Typography.Text>
                        <Typography.Title level={4} style={{ margin: 0, color: (analytics.peerComparison.course.yourCourseAvgScore || 0) >= 70 ? '#22c55e' : '#f59e0b' }}>
                          {analytics.peerComparison.course.yourCourseAvgScore != null ? `${analytics.peerComparison.course.yourCourseAvgScore}%` : '—'}
                        </Typography.Title>
                      </div>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Peer Avg Score</Typography.Text>
                        <Typography.Title level={4} style={{ margin: 0 }}>
                          {analytics.peerComparison.course.avgScore != null ? `${analytics.peerComparison.course.avgScore}%` : '—'}
                        </Typography.Title>
                      </div>
                    </div>
                    {metricDelta(analytics.peerComparison.course.yourCourseAvgScore, analytics.peerComparison.course.avgScore) != null && (
                      <Tag color={metricDelta(analytics.peerComparison.course.yourCourseAvgScore, analytics.peerComparison.course.avgScore) >= 0 ? 'green' : 'orange'}>
                        {metricDelta(analytics.peerComparison.course.yourCourseAvgScore, analytics.peerComparison.course.avgScore) >= 0 ? '+' : ''}{metricDelta(analytics.peerComparison.course.yourCourseAvgScore, analytics.peerComparison.course.avgScore)} pts vs course peers
                      </Tag>
                    )}
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {analytics.peerComparison.course.yourAttempts} attempts · {analytics.peerComparison.course.yourQuestions} questions answered
                    </Typography.Text>
                  </Space>
                </div>
              </Col>
              <Col xs={24} md={8}>
                <div style={{
                  borderRadius: 20,
                  padding: 20,
                  background: 'linear-gradient(135deg, #ecfeff 0%, #f0fdf4 100%)',
                  border: '1px solid rgba(34, 197, 94, 0.12)',
                  height: '100%'
                }}>
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    <Tag color="cyan" icon={<BookOutlined />}>Topic Coverage</Tag>
                    <Typography.Title level={3} style={{ margin: 0 }}>
                      {analytics.peerComparison.topics.yourTopicsCovered} topics
                    </Typography.Title>
                    <Typography.Text type="secondary">
                      Unique topics you have covered across submitted exams.
                    </Typography.Text>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Your Coverage</Typography.Text>
                        <Typography.Title level={4} style={{ margin: 0 }}>{analytics.peerComparison.topics.yourTopicsCovered}</Typography.Title>
                      </div>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Level Avg</Typography.Text>
                        <Typography.Title level={4} style={{ margin: 0 }}>{analytics.peerComparison.level.avgTopicsCovered ?? '—'}</Typography.Title>
                      </div>
                    </div>
                    {analytics.peerComparison.topics.strongestTopic && (
                      <Tag color="green">Strongest: {analytics.peerComparison.topics.strongestTopic.topic}</Tag>
                    )}
                    {analytics.peerComparison.topics.weakestTopic && (
                      <Tag color="orange">Needs work: {analytics.peerComparison.topics.weakestTopic.topic}</Tag>
                    )}
                  </Space>
                </div>
              </Col>
            </Row>

            {/* Achievements summarised here as well */}
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <div style={{ border: '1px solid #f1f5f9', borderRadius: 18, padding: 18 }}>
                  <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
                    Score Distribution (Your Level)
                  </Typography.Text>
                      {analytics.peerComparison.level.scoreDistribution ? (() => {
                    const dist = analytics.peerComparison.level.scoreDistribution;
                    const total = (dist.below40 || 0) + (dist.range40to59 || 0) + (dist.range60to79 || 0) + (dist.above80 || 0);
                    if (total === 0) return <Typography.Text type="secondary">Not enough data yet</Typography.Text>;
                    // Show highest-performing band first (80-100%) down to 0-39%
                    const bars = [
                      { label: '80-100%', count: dist.above80 || 0, color: '#22c55e' },
                      { label: '60-79%', count: dist.range60to79 || 0, color: '#3b82f6' },
                      { label: '40-59%', count: dist.range40to59 || 0, color: '#f59e0b' },
                      { label: '0-39%', count: dist.below40 || 0, color: '#ef4444' }
                    ];
                    const maxCount = Math.max(...bars.map(b => b.count), 1);
                    return (
                      <Space direction="vertical" size={10} style={{ width: '100%' }}>
                        {bars.map(bar => (
                          <div key={bar.label}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Typography.Text style={{ fontSize: 12 }}>{bar.label}</Typography.Text>
                              <Typography.Text type="secondary" style={{ fontSize: 11 }}>{bar.count} student{bar.count !== 1 ? 's' : ''}</Typography.Text>
                            </div>
                            <div style={{ height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.round((bar.count / maxCount) * 100)}%`, background: bar.color, borderRadius: 4, transition: 'width 0.5s ease' }} />
                            </div>
                          </div>
                        ))}
                        <Typography.Text type="secondary" style={{ fontSize: 11, marginTop: 4 }}>
                          Distribution of {total} candidates at your level by average score
                        </Typography.Text>
                      </Space>
                    );
                  })() : <Typography.Text type="secondary">No distribution data available</Typography.Text>}
                </div>
              </Col>
              <Col xs={24} lg={12}>
                <div style={{ border: '1px solid #f1f5f9', borderRadius: 18, padding: 18 }}>
                  <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
                    Your Achievements
                  </Typography.Text>
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    {analytics.peerComparison.bestStreak > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 14, background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                        <span style={{ fontSize: 24 }}>🔥</span>
                        <div>
                          <Typography.Text strong style={{ display: 'block', fontSize: 14 }}>Best Streak: {analytics.peerComparison.bestStreak} exam{analytics.peerComparison.bestStreak > 1 ? 's' : ''}</Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>Consecutive exams scoring 50% or above</Typography.Text>
                        </div>
                      </div>
                    )}
                    {analytics.improvement != null && analytics.improvement !== 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 14, background: analytics.improvement > 0 ? 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)' : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)', border: `1px solid ${analytics.improvement > 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                        <span style={{ fontSize: 24 }}>{analytics.improvement > 0 ? '📈' : '📉'}</span>
                        <div>
                          <Typography.Text strong style={{ display: 'block', fontSize: 14 }}>
                            {analytics.improvement > 0 ? '+' : ''}{analytics.improvement}% improvement
                          </Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>From your first exam to your latest</Typography.Text>
                        </div>
                      </div>
                    )}
                    {analytics.peerComparison.level.percentile != null && analytics.peerComparison.level.percentile >= 70 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 14, background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)', border: '1px solid rgba(139,92,246,0.2)' }}>
                        <span style={{ fontSize: 24 }}>🏆</span>
                        <div>
                          <Typography.Text strong style={{ display: 'block', fontSize: 14 }}>Top performer</Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>You are in the top {Math.max(1, 100 - analytics.peerComparison.level.percentile + 1)}% of candidates at your level</Typography.Text>
                        </div>
                      </div>
                    )}
                    {(analytics.peerComparison.bestStreak === 0 || analytics.peerComparison.bestStreak == null) && (analytics.improvement == null || analytics.improvement === 0) && (analytics.peerComparison.level.percentile == null || analytics.peerComparison.level.percentile < 70) && (
                      <Typography.Text type="secondary">Keep practicing to unlock achievements!</Typography.Text>
                    )}
                  </Space>
                </div>
              </Col>
            </Row>
          </Space>
        )}
      </Card>
    </Space>
  );
}

