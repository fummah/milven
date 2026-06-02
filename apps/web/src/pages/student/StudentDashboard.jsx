import React, { useEffect, useMemo, useState } from 'react';
import { Card, Progress, Space, Button, Typography, Empty, Row, Col, Tag, message, Spin, Divider, Tooltip } from 'antd';
import {
  ReadOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, CreditCardOutlined,
  BookOutlined, ShoppingCartOutlined, RiseOutlined, TrophyOutlined, FileTextOutlined, CalendarOutlined,
  PlayCircleOutlined, ArrowRightOutlined, LineChartOutlined, DashboardOutlined, AimOutlined,
  QuestionCircleOutlined, FunctionOutlined, ExperimentOutlined, SnippetsOutlined, StarOutlined,
  ExclamationCircleOutlined, ThunderboltOutlined, RightOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import { api } from '../../lib/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip as ChartTooltip, Legend, Filler } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, ChartTooltip, Legend, Filler);

/* ── helpers ─────────────────────────────────────────── */
function formatPrice(priceCents, interval) {
  if (!priceCents) return 'Free';
  const amount = (priceCents / 100).toFixed(2);
  const period = interval === 'MONTHLY' ? '/month' : interval === 'YEARLY' ? '/year' : '';
  return `$${amount}${period}`;
}
function formatInterval(interval) {
  if (!interval) return null;
  return { ONE_TIME: 'One-off', MONTHLY: 'Monthly', YEARLY: 'Yearly' }[interval] || interval;
}
function formatCountdown(ms) {
  if (ms <= 0) return null;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}
function formatExamDuration(minutes) {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m} min` : `${h}h`;
  }
  return `${minutes} min`;
}

/* ── Circular progress (SVG ring) ───────────────────── */
function CircularProgress({ percent, size = 100, strokeWidth = 8, color = '#1d4ed8', trailColor = '#e5e7eb', children }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;
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

/* ── Dashboard colors ───────────────────────────────── */
const NAVY = '#0f172a';
const NAVY_LIGHT = '#1e3a5f';
const BLUE = '#1d4ed8';
const GREEN = '#16a34a';
const AMBER = '#d97706';
const GOLD = '#ca8a04';
const CYAN = '#0891b2';

/* ════════════════════════════════════════════════════════ */
export function StudentDashboard() {
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState([]);
  const [subs, setSubs] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [browseCourses, setBrowseCourses] = useState([]);
  const [subscribingId, setSubscribingId] = useState(null);
  const [examsByCourse, setExamsByCourse] = useState({});
  const [now, setNow] = useState(() => Date.now());
  const [startingExamId, setStartingExamId] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Current user from localStorage
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('currentUser') || '{}'); } catch { return {}; }
  }, []);
  const userName = currentUser?.firstName || currentUser?.name?.split(' ')[0] || 'Student';
  const userLevel = currentUser?.level || 'LEVEL1';
  const levelLabel = userLevel === 'LEVEL1' ? 'CFA Level I' : userLevel === 'LEVEL2' ? 'CFA Level II' : userLevel === 'LEVEL3' ? 'CFA Level III' : userLevel;

  /* ── data loading ──────────────────────────────────── */
  const load = async () => {
    setLoading(true);
    try {
      const [c, s, p] = await Promise.all([
        api.get('/api/learning/me/courses'),
        api.get('/api/billing/subscriptions'),
        api.get('/api/billing/purchases').catch(() => ({ data: { purchases: [] } }))
      ]);
      setCourses(c.data.courses || []);
      setSubs((s.data.subscriptions || []).filter(x => x.status !== 'canceled'));
      setPurchases(p.data?.purchases || []);
    } catch {
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const { data } = await api.get('/api/exams/analytics/me');
      setAnalytics(data);
    } catch {
      setAnalytics({ hasData: false });
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const hasSubscriptionOrPurchase = useMemo(() => {
    const hasSub = (subs || []).some(s => (s.status || '').toLowerCase() === 'active' || (s.status || '').toLowerCase() === 'past_due');
    const hasPurchase = (purchases || []).length > 0;
    return hasSub || hasPurchase;
  }, [subs, purchases]);

  useEffect(() => {
    if (loading || hasSubscriptionOrPurchase) { setBrowseCourses([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/api/learning/courses/browse');
        if (!cancelled) setBrowseCourses((data.courses || []).slice(0, 5));
      } catch { if (!cancelled) setBrowseCourses([]); }
    })();
    return () => { cancelled = true; };
  }, [loading, hasSubscriptionOrPurchase]);

  useEffect(() => { load(); loadAnalytics(); }, []);

  const enrolledCourseIds = useMemo(() => (courses || []).map(c => c.courseId).filter(Boolean), [courses]);

  useEffect(() => {
    (async () => {
      const obj = {};
      try {
        const { data } = await api.get('/api/exams/public');
        const allExams = data.exams || [];
        const examsByCourseMap = {};
        const studentExams = [];
        allExams.forEach(exam => {
          if (exam.createdById) { studentExams.push(exam); }
          else if (exam.courseId && enrolledCourseIds.includes(exam.courseId)) {
            if (!examsByCourseMap[exam.courseId]) examsByCourseMap[exam.courseId] = [];
            examsByCourseMap[exam.courseId].push(exam);
          }
        });
        enrolledCourseIds.forEach(cid => { obj[cid] = examsByCourseMap[cid] || []; });
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
      } catch {}
      setExamsByCourse(obj);
    })();
  }, [enrolledCourseIds.join(',')]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);

  /* ── derived data ──────────────────────────────────── */
  const continueLearningCourses = useMemo(
    () => (courses || []).filter(c => c.enrollmentStatus !== 'COMPLETED'),
    [courses]
  );

  // Top course to resume
  const resumeCourse = useMemo(() => {
    if (!continueLearningCourses.length) return null;
    // Pick the one with most recent progress or first
    return [...continueLearningCourses].sort((a, b) => {
      const da = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
      const db = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
      return db - da;
    })[0];
  }, [continueLearningCourses]);

  const kpis = useMemo(() => {
    const totalCourses = (courses || []).length;
    const avgProgress = totalCourses
      ? Math.round(courses.reduce((a, b) => a + (b.progressPercent || 0), 0) / totalCourses)
      : 0;
    const timeSpentSec = courses.reduce((a, b) => a + (b.timeSpentSec || 0), 0);
    const hrs = (timeSpentSec / 3600).toFixed(1);
    const activeSubs = (subs || []).filter(s => s.status === 'active').length;
    return { totalCourses, avgProgress, timeSpentSec: parseFloat(hrs), activeSubs };
  }, [courses, subs]);

  // Upcoming mock exams
  const upcomingMockExam = useMemo(() => {
    const currentTime = new Date(now);
    let nearest = null;
    (courses || []).forEach(c => {
      if (!c.courseId) return;
      const courseExams = examsByCourse[c.courseId] || [];
      courseExams.forEach(exam => {
        if (!exam.type || exam.type === 'MOCK') {
          const start = exam.startAt ? new Date(exam.startAt) : null;
          if (start && start > currentTime) {
            if (!nearest || start < new Date(nearest.startAt)) nearest = { ...exam, courseName: c.name, courseLevel: c.level };
          }
        }
      });
    });
    return nearest;
  }, [courses, examsByCourse, now]);

  // Available exams count
  const examItems = useMemo(() => {
    const items = [];
    const currentTime = new Date(now);
    (courses || []).forEach(c => {
      if (!c.courseId) return;
      (examsByCourse[c.courseId] || []).forEach(exam => {
        const startDate = exam.startAt ? new Date(exam.startAt) : null;
        const endDate = exam.endAt ? new Date(exam.endAt) : null;
        const isPending = startDate && currentTime < startDate;
        const isReady = (!startDate || currentTime >= startDate) && (!endDate || currentTime <= endDate);
        if (isPending || isReady) items.push({ exam, course: c, examStatus: isPending ? 'pending' : 'ready' });
      });
    });
    return items;
  }, [courses, examsByCourse, now]);

  // Topic performance sorted
  const sortedTopics = useMemo(() => {
    if (!analytics?.topicPerformance?.length) return { weakest: [], strongest: [] };
    const sorted = [...analytics.topicPerformance].sort((a, b) => a.percent - b.percent);
    return {
      weakest: sorted.slice(0, 5),
      strongest: [...sorted].reverse().slice(0, 5)
    };
  }, [analytics]);

  const startExam = async (examId) => {
    if (!examId) return;
    setStartingExamId(examId);
    try {
      const { data } = await api.post(`/api/exams/${examId}/attempts`, {});
      const attemptId = data?.attempt?.id;
      if (attemptId) navigate(`/student/exams/take/${attemptId}`);
      else message.error('Could not start exam');
    } catch (e) { message.error(e?.response?.data?.error || 'Could not start exam'); }
    finally { setStartingExamId(null); }
  };

  const handleSubscribe = async (course) => {
    setSubscribingId(course.id);
    try {
      const res = await api.post(`/api/learning/courses/${course.id}/enroll`);
      if (res.data.enrolled) { message.success(`Enrolled in ${course.name}`); load(); setBrowseCourses(prev => prev.filter(c => c.id !== course.id)); return; }
      if (res.data.requiresPayment && res.data.productId) {
        const checkout = await api.post('/api/billing/checkout-session', {
          productId: res.data.productId,
          successUrl: `${window.location.origin}/student?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/student`
        });
        if (checkout.data?.url) { window.location.href = checkout.data.url; return; }
        message.error('Unable to start checkout');
      }
    } catch (err) { message.error(err.response?.data?.error || 'Failed to subscribe'); }
    finally { setSubscribingId(null); }
  };

  // Stripe success callback
  const stripeSessionId = searchParams.get('session_id');
  useEffect(() => {
    if (!stripeSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        await api.post('/api/billing/checkout-success', { session_id: stripeSessionId });
        if (!cancelled) { message.success('Payment recorded. You are now enrolled.'); setSearchParams({}, { replace: true }); load(); }
      } catch (err) { if (!cancelled) message.error(err.response?.data?.error || 'Failed to record payment'); setSearchParams({}, { replace: true }); }
    })();
    return () => { cancelled = true; };
  }, [stripeSessionId]);

  const [topicTab, setTopicTab] = useState('weakest');

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {loading ? (
        <Card style={{ borderRadius: 16, minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" tip="Loading your dashboard…" />
        </Card>
      ) : !hasSubscriptionOrPurchase ? (
        /* ──────────── NOT SUBSCRIBED — browse courses ──────────── */
        <Space direction="vertical" size={24} style={{ width: '100%' }}>
          <div>
            <Typography.Title level={2} style={{ margin: 0, color: NAVY }}>Welcome, {userName}!</Typography.Title>
            <Typography.Text type="secondary">Subscribe to a course to unlock your personalised dashboard.</Typography.Text>
          </div>
          <Card style={{ borderRadius: 16, background: 'linear-gradient(135deg, #f0f7ff 0%, #e6f4ff 100%)', border: '1px solid #91caff' }}>
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: `linear-gradient(135deg, ${NAVY}, ${NAVY_LIGHT})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BookOutlined style={{ fontSize: 24, color: '#fff' }} />
              </div>
              <div>
                <Typography.Title level={4} style={{ color: NAVY, margin: 0 }}>Get Started with Your Learning Journey</Typography.Title>
                <Typography.Text type="secondary">Subscribe to a course to unlock all learning materials and exams</Typography.Text>
              </div>
            </div>
            <Typography.Text strong style={{ display: 'block', marginBottom: 12, color: NAVY }}>Top courses to subscribe</Typography.Text>
            <Row gutter={[16, 16]}>
              {browseCourses.length === 0 && <Col span={24}><Empty description="No courses available to subscribe" /></Col>}
              {browseCourses.map((course) => (
                <Col xs={24} key={course.id}>
                  <Card size="small" style={{ borderRadius: 12, boxShadow: '0 2px 12px rgba(16,37,64,0.08)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                      <div style={{ flex: '1 1 200px' }}>
                        <Space align="start" size={12}>
                          <div style={{ width: 48, height: 48, borderRadius: 10, background: `linear-gradient(135deg, ${NAVY}, ${NAVY_LIGHT})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <BookOutlined style={{ fontSize: 24, color: '#fff' }} />
                          </div>
                          <div>
                            <Typography.Text strong style={{ fontSize: 16 }}>{course.name}</Typography.Text>
                            <div style={{ marginTop: 4 }}>
                              <Tag>{course.level}</Tag>
                              {course.isFree && <Tag color="green">Free</Tag>}
                              {course.product && <Tag color="blue">{formatPrice(course.product.priceCents, course.product.interval)}</Tag>}
                            </div>
                            {course.description && <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 6 }}>{String(course.description).slice(0, 120)}{String(course.description).length > 120 ? '…' : ''}</Typography.Text>}
                          </div>
                        </Space>
                      </div>
                      <Button type="primary" icon={<ShoppingCartOutlined />} loading={subscribingId === course.id} onClick={() => handleSubscribe(course)} size="large"
                        style={{ background: `linear-gradient(135deg, ${NAVY}, ${NAVY_LIGHT})`, border: 'none' }}>
                        {course.isFree ? 'Enroll for free' : 'Subscribe'}
                      </Button>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <Button type="link" onClick={() => navigate('/student/courses')}>View all courses</Button>
            </div>
          </Card>
        </Space>
      ) : (
        /* ──────────── SUBSCRIBED — full dashboard ──────────── */
        <Space direction="vertical" size={20} style={{ width: '100%' }}>

          {/* ── Header ──────────────────────────────────────── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <Typography.Title level={2} style={{ margin: 0, color: NAVY, fontWeight: 700 }}>
                Welcome back, {userName}!
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                Stay consistent. Stay focused. Pass the CFA Exam.
              </Typography.Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag color={NAVY} style={{ padding: '4px 16px', fontSize: 13, fontWeight: 600, borderRadius: 20 }}>{levelLabel}</Tag>
            </div>
          </div>

          {/* ═══════ ROW 1: Five stat cards ═══════ */}
          <Row gutter={[16, 16]}>
            {/* Exam Readiness Score */}
            <Col xs={24} sm={12} lg={5}>
              <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 20 } }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Typography.Text style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>
                    Exam Readiness Score <Tooltip title="Based on your recent exam performance"><InfoCircleOutlined style={{ fontSize: 11, color: '#9ca3af' }} /></Tooltip>
                  </Typography.Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <CircularProgress percent={analytics?.readinessScore || 0} size={80} strokeWidth={7}
                    color={analytics?.readinessScore >= 70 ? GREEN : analytics?.readinessScore >= 50 ? AMBER : BLUE}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: NAVY }}>{analytics?.readinessScore || 0}%</span>
                  </CircularProgress>
                  <div>
                    <div style={{ fontSize: 12, color: analytics?.readinessScore >= 70 ? GREEN : AMBER, fontWeight: 600 }}>
                      {analytics?.readinessScore >= 70 ? 'On Track' : analytics?.readinessScore >= 50 ? 'Getting There' : 'Keep Going'}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>Target 85%+<br />by Exam Day</div>
                  </div>
                </div>
                <a onClick={() => navigate('/student/comparison')} style={{ fontSize: 12, color: BLUE, cursor: 'pointer', display: 'block', marginTop: 8 }}>
                  View Readiness Report →
                </a>
              </Card>
            </Col>

            {/* Curriculum Progress */}
            <Col xs={24} sm={12} lg={5}>
              <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 20 } }}>
                <div style={{ marginBottom: 4 }}>
                  <Typography.Text style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>
                    Curriculum Progress <Tooltip title="Average completion across enrolled courses"><InfoCircleOutlined style={{ fontSize: 11, color: '#9ca3af' }} /></Tooltip>
                  </Typography.Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <CircularProgress percent={kpis.avgProgress} size={80} strokeWidth={7} color={BLUE}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: NAVY }}>{kpis.avgProgress}%</span>
                  </CircularProgress>
                  <div>
                    <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Courses</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{kpis.totalCourses} enrolled</div>
                  </div>
                </div>
                <a onClick={() => navigate('/student/courses')} style={{ fontSize: 12, color: BLUE, cursor: 'pointer', display: 'block', marginTop: 8 }}>
                  View Curriculum →
                </a>
              </Card>
            </Col>

            {/* Question Bank Accuracy */}
            <Col xs={24} sm={12} lg={5}>
              <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 20 } }}>
                <div style={{ marginBottom: 4 }}>
                  <Typography.Text style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>
                    Question Bank Accuracy <Tooltip title="Overall accuracy from your exam attempts"><InfoCircleOutlined style={{ fontSize: 11, color: '#9ca3af' }} /></Tooltip>
                  </Typography.Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <CircularProgress percent={analytics?.avgScore || 0} size={80} strokeWidth={7}
                    color={analytics?.avgScore >= 70 ? GREEN : analytics?.avgScore >= 50 ? AMBER : '#ef4444'}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: NAVY }}>{analytics?.avgScore || 0}%</span>
                  </CircularProgress>
                  <div>
                    <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Questions</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{analytics?.totalQuestions?.toLocaleString() || 0} attempted</div>
                  </div>
                </div>
                <a onClick={() => navigate('/student/mistakes')} style={{ fontSize: 12, color: BLUE, cursor: 'pointer', display: 'block', marginTop: 8 }}>
                  Review Weak Topics →
                </a>
              </Card>
            </Col>

            {/* Study Hours */}
            <Col xs={24} sm={12} lg={5}>
              <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 20 } }}>
                <div style={{ marginBottom: 4 }}>
                  <Typography.Text style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>
                    Study Hours <Tooltip title="Total time spent in courses"><InfoCircleOutlined style={{ fontSize: 11, color: '#9ca3af' }} /></Tooltip>
                  </Typography.Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ClockCircleOutlined style={{ fontSize: 24, color: BLUE }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: NAVY, lineHeight: 1 }}>{kpis.timeSpentSec}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>hrs Total</div>
                    {analytics?.improvement > 0 && (
                      <div style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>↑ {analytics.improvement}% improving</div>
                    )}
                  </div>
                </div>
                <a onClick={() => navigate('/student/comparison')} style={{ fontSize: 12, color: BLUE, cursor: 'pointer', display: 'block', marginTop: 8 }}>
                  Study Analytics →
                </a>
              </Card>
            </Col>

            {/* Lessons / Exams Completed */}
            <Col xs={24} sm={12} lg={4}>
              <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 20 } }}>
                <div style={{ marginBottom: 4 }}>
                  <Typography.Text style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>
                    Exams Completed <Tooltip title="Total submitted exam attempts"><InfoCircleOutlined style={{ fontSize: 11, color: '#9ca3af' }} /></Tooltip>
                  </Typography.Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircleOutlined style={{ fontSize: 24, color: GREEN }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: NAVY, lineHeight: 1 }}>{analytics?.totalAttempts || 0}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>completed</div>
                  </div>
                </div>
                <a onClick={() => navigate('/student/courses')} style={{ fontSize: 12, color: BLUE, cursor: 'pointer', display: 'block', marginTop: 8 }}>
                  Continue Learning →
                </a>
              </Card>
            </Col>
          </Row>

          {/* ═══════ ROW 2: Resume Learning / Target Practice / Milestone+Mock ═══════ */}
          <Row gutter={[16, 16]}>
            {/* Resume Learning */}
            <Col xs={24} md={8}>
              <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 20 } }}>
                <Typography.Text strong style={{ fontSize: 15, color: NAVY, display: 'block', marginBottom: 12 }}>Resume Learning</Typography.Text>
                {resumeCourse ? (
                  <>
                    <div style={{ background: `linear-gradient(135deg, ${NAVY}, ${NAVY_LIGHT})`, borderRadius: 12, padding: 16, marginBottom: 12, color: '#fff' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{resumeCourse.name}</div>
                      <Tag style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 11 }}>{resumeCourse.level}</Tag>
                      <div style={{ marginTop: 8 }}>
                        <Progress percent={resumeCourse.progressPercent || 0} strokeColor="#60a5fa" trailColor="rgba(255,255,255,0.15)" size="small"
                          format={(p) => <span style={{ color: '#fff', fontSize: 11 }}>{p}%</span>} />
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{resumeCourse.progressPercent || 0}% Complete</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button type="primary" onClick={() => navigate(`/student/learn/${resumeCourse.courseId}?back=${encodeURIComponent('/student')}`)}
                        style={{ background: NAVY, border: 'none', borderRadius: 8, fontWeight: 600, flex: 1 }}>
                        Continue Lesson
                      </Button>
                      <Button onClick={() => navigate('/student/courses')} style={{ borderRadius: 8 }}>
                        View All Lessons →
                      </Button>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <Empty description="No courses in progress" />
                    <Button type="primary" onClick={() => navigate('/student/courses')} style={{ marginTop: 12, background: NAVY, border: 'none', borderRadius: 8 }}>
                      Browse Courses
                    </Button>
                  </div>
                )}
              </Card>
            </Col>

            {/* Today's Target Practice */}
            <Col xs={24} md={8}>
              <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 20 } }}>
                <div style={{ marginBottom: 4 }}>
                  <Typography.Text strong style={{ fontSize: 15, color: NAVY }}>Today's Target Practice</Typography.Text>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>Recommended based on your performance</div>
                </div>
                <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <QuestionCircleOutlined style={{ fontSize: 16, color: NAVY }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>30</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>Practice Questions</div>
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>Mixed Topics</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileTextOutlined style={{ fontSize: 16, color: NAVY }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>2</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>Vignette Sets</div>
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{sortedTopics.weakest?.[0]?.topic || 'Various'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <SnippetsOutlined style={{ fontSize: 16, color: NAVY }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>1</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>Essay Practice</div>
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{sortedTopics.weakest?.[1]?.topic || 'Ethics'}</div>
                  </div>
                </Space>
                <Button type="primary" onClick={() => navigate('/student/exams')}
                  style={{ marginTop: 16, background: NAVY, border: 'none', borderRadius: 8, fontWeight: 600, width: '100%' }}>
                  Start Practice
                </Button>
              </Card>
            </Col>

            {/* Right column: Next Milestone + Upcoming Mock */}
            <Col xs={24} md={8}>
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {/* Next Milestone */}
                <Card style={{
                  borderRadius: 16, border: 'none',
                  background: `linear-gradient(135deg, ${GOLD}, #b45309)`, color: '#fff'
                }} styles={{ body: { padding: 20 } }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <TrophyOutlined style={{ fontSize: 18, color: '#fff' }} />
                    <Typography.Text strong style={{ color: '#fff', fontSize: 14 }}>Next Milestone</Typography.Text>
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', marginBottom: 4 }}>
                    Complete {analytics?.totalAttempts ? Math.max(0, 10 - analytics.totalAttempts) : 10} more exams
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>
                    You're making great progress!
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Progress
                      percent={Math.min(100, ((analytics?.totalAttempts || 0) / 10) * 100)}
                      strokeColor="#fff" trailColor="rgba(255,255,255,0.25)" size="small"
                      format={() => null} style={{ flex: 1, marginRight: 12 }}
                    />
                    <span style={{ fontSize: 12, color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {analytics?.totalAttempts || 0} / 10
                    </span>
                  </div>
                </Card>

                {/* Upcoming Mock Exam */}
                <Card style={{ borderRadius: 16, border: '1px solid #e5e7eb' }} styles={{ body: { padding: 20 } }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <CalendarOutlined style={{ fontSize: 16, color: NAVY }} />
                    <Typography.Text strong style={{ fontSize: 14, color: NAVY }}>Upcoming Mock Exam</Typography.Text>
                  </div>
                  {upcomingMockExam ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 52, height: 60, borderRadius: 10, background: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: BLUE, textTransform: 'uppercase' }}>
                          {new Date(upcomingMockExam.startAt).toLocaleDateString('en', { month: 'short' })}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>
                          {new Date(upcomingMockExam.startAt).getDate()}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{upcomingMockExam.name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{upcomingMockExam.courseName}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>
                          {new Date(upcomingMockExam.startAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                          {upcomingMockExam.timeLimitMinutes && ` · ${formatExamDuration(upcomingMockExam.timeLimitMinutes)}`}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: '#9ca3af' }}>No upcoming mock exams scheduled</div>
                  )}
                  <a onClick={() => navigate('/student/milven-mocks')} style={{ fontSize: 12, color: BLUE, cursor: 'pointer', display: 'block', marginTop: 8 }}>
                    Go to Mock Exams →
                  </a>
                </Card>
              </Space>
            </Col>
          </Row>

          {/* ═══════ ROW 3: Topic Performance / Performance Trends / Quick Access ═══════ */}
          <Row gutter={[16, 16]}>
            {/* Topic Performance */}
            <Col xs={24} md={8}>
              <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 20 } }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Typography.Text strong style={{ fontSize: 15, color: NAVY }}>
                    Topic Performance <Tooltip title="Based on your exam answers by topic"><InfoCircleOutlined style={{ fontSize: 11, color: '#9ca3af' }} /></Tooltip>
                  </Typography.Text>
                </div>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #f3f4f6' }}>
                  {['weakest', 'strongest'].map(tab => (
                    <button key={tab} onClick={() => setTopicTab(tab)}
                      style={{
                        flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
                        background: 'none', fontSize: 13, fontWeight: 600,
                        color: topicTab === tab ? NAVY : '#9ca3af',
                        borderBottom: topicTab === tab ? `2px solid ${NAVY}` : '2px solid transparent',
                        marginBottom: -2, transition: 'all 0.2s'
                      }}>
                      {tab === 'weakest' ? 'Weakest Topics' : 'Strongest Topics'}
                    </button>
                  ))}
                </div>
                {analytics?.hasData && (topicTab === 'weakest' ? sortedTopics.weakest : sortedTopics.strongest).length > 0 ? (
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    {(topicTab === 'weakest' ? sortedTopics.weakest : sortedTopics.strongest).map((item, idx) => {
                      const barColor = item.percent >= 70 ? GREEN : item.percent >= 50 ? AMBER : '#ef4444';
                      return (
                        <div key={idx}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: '#374151', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.topic}>{item.topic}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: barColor }}>{item.percent}%</span>
                          </div>
                          <div style={{ height: 8, borderRadius: 4, background: '#f3f4f6' }}>
                            <div style={{ height: '100%', borderRadius: 4, background: barColor, width: `${item.percent}%`, transition: 'width 0.5s ease' }} />
                          </div>
                        </div>
                      );
                    })}
                  </Space>
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>Complete exams to see topic performance</Typography.Text>
                  </div>
                )}
                <a onClick={() => navigate('/student/comparison')} style={{ fontSize: 12, color: BLUE, cursor: 'pointer', display: 'block', marginTop: 12 }}>
                  View Full Topic Analysis →
                </a>
              </Card>
            </Col>

            {/* Performance Trends (chart) */}
            <Col xs={24} md={8}>
              <Card style={{ borderRadius: 16, height: '100%', border: '1px solid #e5e7eb' }} styles={{ body: { padding: 20 } }}
                loading={analyticsLoading}>
                <Typography.Text strong style={{ fontSize: 15, color: NAVY, display: 'block', marginBottom: 12 }}>
                  Performance Trends
                  {analytics?.improvement !== undefined && analytics.improvement !== 0 && (
                    <Tag color={analytics.improvement > 0 ? 'green' : 'orange'} style={{ marginLeft: 8, fontSize: 11 }}>
                      {analytics.improvement > 0 ? '+' : ''}{analytics.improvement}%
                    </Tag>
                  )}
                </Typography.Text>
                {!analytics?.hasData ? (
                  <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Empty description={<Typography.Text type="secondary" style={{ fontSize: 12 }}>Complete exams to see trends</Typography.Text>} />
                  </div>
                ) : (
                  <div style={{ height: 200 }}>
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
                            borderColor: BLUE, backgroundColor: 'rgba(29, 78, 216, 0.08)',
                            fill: true, tension: 0.4, pointBackgroundColor: BLUE,
                            pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6
                          },
                          {
                            label: 'Target (70%)',
                            data: Array(analytics.weeklyProgress?.length || analytics.scoreTrend?.slice(-8).length || 1).fill(70),
                            borderColor: GREEN, borderDash: [5, 5], pointRadius: 0, fill: false
                          }
                        ]
                      }}
                      options={{
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12, font: { size: 11 } } },
                          tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', cornerRadius: 8, padding: 10 }
                        },
                        scales: {
                          y: { min: 0, max: 100, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => v + '%', font: { size: 10 } } },
                          x: { grid: { display: false }, ticks: { font: { size: 10 } } }
                        }
                      }}
                    />
                  </div>
                )}
                {analytics?.hasData && (
                  <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>Attempts</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>{analytics.totalAttempts}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>Questions</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>{analytics.totalQuestions}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>Avg Score</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: analytics.avgScore >= 70 ? GREEN : analytics.avgScore >= 50 ? AMBER : '#ef4444' }}>
                        {analytics.avgScore}%
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </Col>

            {/* Notifications + Quick Access */}
            <Col xs={24} md={8}>
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {/* Available Exams (notifications-like) */}
                <Card style={{ borderRadius: 16, border: '1px solid #e5e7eb' }} styles={{ body: { padding: 20 } }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Typography.Text strong style={{ fontSize: 14, color: NAVY }}>Available Exams</Typography.Text>
                    <a onClick={() => navigate('/student/exams')} style={{ fontSize: 12, color: BLUE, cursor: 'pointer' }}>View All</a>
                  </div>
                  {examItems.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#9ca3af' }}>No exams available right now</div>
                  ) : (
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      {examItems.slice(0, 3).map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: idx < 2 ? '1px solid #f3f4f6' : 'none' }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: item.examStatus === 'ready' ? '#dbeafe' : '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {item.examStatus === 'ready' ? <PlayCircleOutlined style={{ color: BLUE, fontSize: 14 }} /> : <ClockCircleOutlined style={{ color: AMBER, fontSize: 14 }} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.exam.name}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>{item.course?.name}</div>
                          </div>
                          <Tag color={item.examStatus === 'ready' ? 'blue' : 'orange'} style={{ fontSize: 10 }}>
                            {item.examStatus === 'ready' ? 'Ready' : 'Pending'}
                          </Tag>
                        </div>
                      ))}
                    </Space>
                  )}
                </Card>

                {/* Quick Access */}
                <Card style={{ borderRadius: 16, border: '1px solid #e5e7eb' }} styles={{ body: { padding: 16 } }}>
                  <Typography.Text strong style={{ fontSize: 14, color: NAVY, display: 'block', marginBottom: 12 }}>Quick Access</Typography.Text>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { icon: <QuestionCircleOutlined />, label: 'Question Bank', path: '/student/exams', color: '#3b82f6' },
                      { icon: <ExperimentOutlined />, label: 'Mock Exams', path: '/student/mock-exams', color: '#6366f1' },
                      { icon: <FunctionOutlined />, label: 'Formula Sheets', path: '/student/formula-book', color: NAVY },
                      { icon: <BookOutlined />, label: 'Curriculum', path: '/student/courses', color: '#8b5cf6' },
                      { icon: <FileTextOutlined />, label: 'Summary Sheets', path: '/student/summary-sheets', color: '#0ea5e9' },
                      { icon: <SnippetsOutlined />, label: 'Notes', path: '/student/module-notes', color: '#10b981' },
                    ].map((item) => (
                      <button key={item.path} onClick={() => navigate(item.path)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                          borderRadius: 10, border: '1px solid #e5e7eb', background: '#fafafa',
                          cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#374151',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f0f7ff'; e.currentTarget.style.borderColor = '#bfdbfe'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#fafafa'; e.currentTarget.style.borderColor = '#e5e7eb'; }}>
                        <span style={{ color: item.color, fontSize: 14 }}>{item.icon}</span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </Card>
              </Space>
            </Col>
          </Row>

        </Space>
      )}
    </div>
  );
}
