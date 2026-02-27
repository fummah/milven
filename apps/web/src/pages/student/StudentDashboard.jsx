import React, { useEffect, useMemo, useState } from 'react';
import { Card, List, Progress, Space, Button, Typography, Empty, Row, Col, Statistic, Tag, message, Spin, Divider } from 'antd';
import { ReadOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, CreditCardOutlined, BookOutlined, ShoppingCartOutlined, RiseOutlined, TrophyOutlined, FileTextOutlined, CalendarOutlined, PlayCircleOutlined, ArrowRightOutlined, LineChartOutlined, DashboardOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

function formatPrice(priceCents, interval) {
  if (!priceCents) return 'Free';
  const amount = (priceCents / 100).toFixed(2);
  const period = interval === 'MONTHLY' ? '/month' : interval === 'YEARLY' ? '/year' : '';
  return `$${amount}${period}`;
}

function formatInterval(interval) {
  if (!interval) return null;
  const map = { ONE_TIME: 'One-off', MONTHLY: 'Monthly', YEARLY: 'Yearly' };
  return map[interval] || interval;
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

  // Load performance analytics
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

  const hasSubscriptionOrPurchase = useMemo(() => {
    const hasSub = (subs || []).some(s => (s.status || '').toLowerCase() === 'active' || (s.status || '').toLowerCase() === 'past_due');
    const hasPurchase = (purchases || []).length > 0;
    return hasSub || hasPurchase;
  }, [subs, purchases]);

  // Top 5 courses to subscribe — only fetch when we've confirmed user has no subscription
  useEffect(() => {
    if (loading || hasSubscriptionOrPurchase) {
      setBrowseCourses([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/api/learning/courses/browse');
        const list = data.courses || [];
        if (!cancelled) setBrowseCourses(list.slice(0, 5));
      } catch {
        if (!cancelled) setBrowseCourses([]);
      }
    })();
    return () => { cancelled = true; };
  }, [loading, hasSubscriptionOrPurchase]);

  useEffect(() => { 
    load(); 
    loadAnalytics();
  }, []);

  // Only enrolled courses for available exams (no subs)
  const enrolledCourseIds = useMemo(() => (courses || []).map(c => c.courseId).filter(Boolean), [courses]);

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

  // Refresh countdown every minute
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Continue Learning: only courses not yet completed (exclude enrollmentStatus === 'COMPLETED')
  const continueLearningCourses = useMemo(
    () => (courses || []).filter(c => c.enrollmentStatus !== 'COMPLETED'),
    [courses]
  );

  const kpis = useMemo(() => {
    const totalCourses = (courses || []).length;
    const avgProgress = totalCourses
      ? Math.round((courses.reduce((a, b) => a + (b.progressPercent || 0), 0) / totalCourses))
      : 0;
    const timeSpentSec = courses.reduce((a, b) => a + (b.timeSpentSec || 0), 0);
    const hrs = Math.floor(timeSpentSec / 3600);
    const mins = Math.floor((timeSpentSec % 3600) / 60);
    const learningTime = `${hrs}h ${mins}m`;
    const activeSubs = (subs || []).filter(s => s.status === 'active').length;
    return { totalCourses, avgProgress, learningTime, activeSubs };
  }, [courses, subs]);

  // Available exams: admin exams grouped by course + custom exams as individual items
  const examItems = useMemo(() => {
    const items = [];
    // Add admin exams grouped by course
    (courses || []).forEach(c => {
      if (!c.courseId) return;
      const courseExams = examsByCourse[c.courseId] || [];
      if (courseExams.length > 0) {
        courseExams.forEach(exam => {
          items.push({ 
            type: 'admin', 
            course: c, 
            exam,
            courseId: c.courseId 
          });
        });
      }
    });
    // Add custom exams as individual items
    const customExams = examsByCourse['_my_custom'] || [];
    customExams.forEach(exam => {
      items.push({ 
        type: 'custom', 
        exam,
        courseId: '_my_custom' 
      });
    });
    return items;
  }, [courses, examsByCourse]);

  const examCounts = examItems.length;

  const completedCourses = useMemo(
    () => (courses || []).filter(c => c.enrollmentStatus === 'COMPLETED'),
    [courses]
  );

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

  const handleSubscribe = async (course) => {
    setSubscribingId(course.id);
    try {
      const res = await api.post(`/api/learning/courses/${course.id}/enroll`);
      if (res.data.enrolled) {
        message.success(`Enrolled in ${course.name}`);
        load();
        setBrowseCourses(prev => prev.filter(c => c.id !== course.id));
        return;
      }
      if (res.data.requiresPayment && res.data.productId) {
        const checkout = await api.post('/api/billing/checkout-session', {
          productId: res.data.productId,
          successUrl: `${window.location.origin}/student?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/student`
        });
        if (checkout.data?.url) {
          window.location.href = checkout.data.url;
          return;
        }
        message.error('Unable to start checkout');
      }
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to subscribe');
    } finally {
      setSubscribingId(null);
    }
  };

  const stripeSessionId = searchParams.get('session_id');
  useEffect(() => {
    if (!stripeSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        await api.post('/api/billing/checkout-success', { session_id: stripeSessionId });
        if (!cancelled) {
          message.success('Payment recorded. You are now enrolled.');
          setSearchParams({}, { replace: true });
          load();
        }
      } catch (err) {
        if (!cancelled) message.error(err.response?.data?.error || 'Failed to record payment');
        setSearchParams({}, { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [stripeSessionId]);

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <Typography.Title level={2} className="page-header-title">
            My Dashboard
          </Typography.Title>
          <div className="page-header-subtitle">
            Track your learning progress and upcoming exams
          </div>
        </div>
      </div>

      {loading ? (
        <Card className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 280, padding: 48 }}>
            <Spin size="large" tip="Loading your dashboard…" />
          </div>
        </Card>
      ) : (
        <>
      {!hasSubscriptionOrPurchase && (
        <Card
          className="stat-card"
          style={{
            background: 'linear-gradient(135deg, #f0f7ff 0%, #e6f4ff 100%)',
            border: '1px solid #91caff'
          }}
        >
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div className="icon-badge icon-badge-blue">
                <BookOutlined style={{ fontSize: 24 }} />
              </div>
              <div>
                <Typography.Title level={4} style={{ color: '#102540', margin: 0 }}>
                  Get Started with Your Learning Journey
                </Typography.Title>
                <Typography.Text type="secondary">
                  Subscribe to a course to unlock all learning materials and exams
                </Typography.Text>
              </div>
            </div>
          </div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 12, color: '#102540' }}>
            Top courses to subscribe
          </Typography.Text>
          <Row gutter={[16, 16]}>
            {browseCourses.length === 0 && !loading && (
              <Col span={24}>
                <Empty description="No courses available to subscribe" />
              </Col>
            )}
            {browseCourses.map((course) => (
              <Col xs={24} sm={24} md={24} lg={24} xl={24} key={course.id}>
                <Card
                  size="small"
                  style={{
                    borderRadius: 10,
                    boxShadow: '0 2px 12px rgba(16,37,64,0.08)',
                    border: '1px solid #e8e8e8'
                  }}
                  styles={{ body: { padding: 20 } }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <div style={{ flex: '1 1 200px' }}>
                      <Space align="start" size={12}>
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 10,
                            background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}
                        >
                          <BookOutlined style={{ fontSize: 24, color: '#fff' }} />
                        </div>
                        <div>
                          <Typography.Text strong style={{ fontSize: 16, color: '#111827' }}>{course.name}</Typography.Text>
                          <div style={{ marginTop: 4 }}>
                            <Tag>{course.level}</Tag>
                            {course.isFree && <Tag color="green">Free</Tag>}
                            {course.product && (
                              <>
                                <Tag color="blue">
                                  {formatPrice(course.product.priceCents, course.product.interval)}
                                </Tag>
                                {formatInterval(course.product.interval) && (
                                  <Tag>{formatInterval(course.product.interval)}</Tag>
                                )}
                              </>
                            )}
                          </div>
                          {course.description && (
                            <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 6 }}>
                              {String(course.description).slice(0, 120)}{String(course.description).length > 120 ? '…' : ''}
                            </Typography.Text>
                          )}
                        </div>
                      </Space>
                    </div>
                    <Button
                      type="primary"
                      icon={<ShoppingCartOutlined />}
                      loading={subscribingId === course.id}
                      onClick={() => handleSubscribe(course)}
                      size="large"
                      style={{
                        background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)',
                        border: 'none'
                      }}
                    >
                      {course.isFree ? 'Enroll for free' : 'Subscribe'}
                    </Button>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Button type="link" onClick={() => navigate('/student/courses')}>
              View all courses
            </Button>
          </div>
        </Card>
      )}

      {/* Stats Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card stat-card-gradient stat-card-blue">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <Typography.Text style={{ color: '#64748b', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}>
                  My Courses
                </Typography.Text>
                <Typography.Title level={2} style={{ margin: 0, color: '#1e293b', fontWeight: 700 }}>
                  {kpis.totalCourses}
                </Typography.Title>
              </div>
              <div className="icon-badge" style={{ background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)' }}>
                <BookOutlined style={{ fontSize: 22, color: '#3b82f6' }} />
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card stat-card-gradient stat-card-purple">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <Typography.Text style={{ color: '#64748b', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}>
                  Average Progress
                </Typography.Text>
                <Typography.Title level={2} style={{ margin: 0, color: '#1e293b', fontWeight: 700 }}>
                  {kpis.avgProgress}%
                </Typography.Title>
              </div>
              <div className="icon-badge" style={{ background: 'linear-gradient(135deg, #ede9fe, #ddd6fe)' }}>
                <RiseOutlined style={{ fontSize: 22, color: '#8b5cf6' }} />
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card stat-card-gradient stat-card-green">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <Typography.Text style={{ color: '#64748b', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}>
                  Learning Time
                </Typography.Text>
                <Typography.Title level={2} style={{ margin: 0, color: '#1e293b', fontWeight: 700 }}>
                  {kpis.learningTime}
                </Typography.Title>
              </div>
              <div className="icon-badge" style={{ background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)' }}>
                <ClockCircleOutlined style={{ fontSize: 22, color: '#22c55e' }} />
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card stat-card-gradient stat-card-orange">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <Typography.Text style={{ color: '#64748b', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}>
                  Active Subs
                </Typography.Text>
                <Typography.Title level={2} style={{ margin: 0, color: '#1e293b', fontWeight: 700 }}>
                  {kpis.activeSubs}
                </Typography.Title>
              </div>
              <div className="icon-badge" style={{ background: 'linear-gradient(135deg, #ffedd5, #fed7aa)' }}>
                <CreditCardOutlined style={{ fontSize: 22, color: '#f97316' }} />
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Continue Learning & Available Exams */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={16}>
          <Card 
            className="modern-card"
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="icon-badge-sm icon-badge-blue">
                  <PlayCircleOutlined />
                </div>
                <span style={{ fontWeight: 600 }}>Continue Learning</span>
              </div>
            }
            loading={loading}
          >
            {continueLearningCourses.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <BookOutlined />
                </div>
                <Typography.Text type="secondary">
                  {courses.length === 0 ? 'No courses yet' : 'No courses in progress'}
                </Typography.Text>
              </div>
            ) : (
              <List
                dataSource={continueLearningCourses}
                renderItem={(c) => (
                  <div className="modern-list-item">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                        <div className="icon-badge-sm icon-badge-purple">
                          <BookOutlined style={{ fontSize: 14 }} />
                        </div>
                        <div>
                          <Typography.Text strong style={{ display: 'block', color: '#1e293b' }}>{c.name}</Typography.Text>
                          <Tag color="blue" style={{ marginTop: 4 }}>{c.level}</Tag>
                        </div>
                      </div>
                      <div style={{ minWidth: 180 }} className="progress-enhanced">
                        <Progress percent={c.progressPercent || 0} size="small" />
                      </div>
                      <Button
                        type="primary"
                        icon={<ArrowRightOutlined />}
                        onClick={() => {
                          const back = encodeURIComponent('/student');
                          navigate(`/student/learn/${c.courseId}?back=${back}`);
                        }}
                        style={{ 
                          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                          border: 'none',
                          borderRadius: 10
                        }}
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                )}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card 
            className="modern-card"
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="icon-badge-sm icon-badge-orange">
                  <FileTextOutlined />
                </div>
                <span style={{ fontWeight: 600 }}>Available Exams</span>
              </div>
            }
            loading={loading}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Text type="secondary">Exams for enrolled courses</Typography.Text>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                Total:{' '}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 28,
                    padding: '4px 10px',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    boxShadow: '0 2px 6px rgba(16, 37, 64, 0.2)'
                  }}
                >
                  {examCounts}
                </span>
              </div>
              {!examItems.length ? (
                <Empty description="No exams available at this time" />
              ) : (
                <div style={{ maxHeight: 400, overflowY: 'auto', paddingRight: 8 }}>
                  {examItems.slice(0, 8).map((item, index) => {
                    const { type, exam, course } = item;
                    const isCustom = type === 'custom';
                    const now = new Date();
                    const startDate = exam.startAt ? new Date(exam.startAt) : null;
                    const endDate = exam.endAt ? new Date(exam.endAt) : null;
                    
                    // Check if exam has been submitted
                    const submitted = isCustom ? exam.latestAttempt?.status === 'SUBMITTED' : course?.examResult?.attemptId;
                    const hasAttempts = isCustom ? exam.hasAttempts : submitted;
                    
                    // Determine exam status
                    let status = null;
                    let statusColor = 'default';
                    let statusText = '';
                    if (startDate && now < startDate) {
                      status = 'pending';
                      statusColor = 'orange';
                      statusText = 'Pending';
                    } else if (endDate && now > endDate) {
                      if (hasAttempts) {
                        status = 'completed';
                        statusColor = 'green';
                        statusText = 'Completed';
                      } else {
                        status = 'missed';
                        statusColor = 'red';
                        statusText = 'Missed';
                      }
                    } else if (startDate && now >= startDate && endDate && now <= endDate) {
                      status = 'open';
                      statusColor = 'blue';
                      statusText = 'Open';
                    } else if (!startDate && !endDate) {
                      status = 'open';
                      statusColor = 'blue';
                      statusText = 'Available';
                    } else if (startDate && now >= startDate && !endDate) {
                      status = 'open';
                      statusColor = 'blue';
                      statusText = 'Open';
                    }
                    
                    const canTake = status === 'open' && !submitted;
                    
                    const duration = exam.timeLimitMinutes != null ? formatExamDuration(exam.timeLimitMinutes) : null;
                    const countdown = startDate && now < startDate 
                      ? { text: `Starts in ${formatCountdown(startDate.getTime() - now.getTime())}`, type: 'blue' }
                      : endDate && now < endDate
                      ? { text: `Ends in ${formatCountdown(endDate.getTime() - now.getTime())}`, type: 'orange' }
                      : null;
                    
                    return (
                      <React.Fragment key={`${type}_${exam.id}_${index}`}>
                        <div style={{ padding: '12px 0' }}>
                          <Space direction="vertical" size={8} style={{ width: '100%' }}>
                            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                              <Space direction="vertical" size={4} style={{ flex: 1 }}>
                                {isCustom ? (
                                  <>
                                    <Space wrap size={6}>
                                      <Tag color="blue" icon={<FileTextOutlined />}>{exam.name}</Tag>
                                      {status && <Tag color={statusColor} icon={status === 'open' ? <PlayCircleOutlined /> : status === 'completed' ? <CheckCircleOutlined /> : status === 'missed' ? <CloseCircleOutlined /> : <ClockCircleOutlined />}>{statusText}</Tag>}
                                      {duration && <Tag icon={<ClockCircleOutlined />}>{duration}</Tag>}
                                      {countdown && <Tag color={countdown.type}>{countdown.text}</Tag>}
                                    </Space>
                                    {exam.latestAttempt && (
                                      <Space style={{ marginTop: 4 }}>
                                        <Tag color={exam.latestAttempt.status === 'SUBMITTED' ? 'green' : 'orange'} icon={exam.latestAttempt.status === 'SUBMITTED' ? <CheckCircleOutlined /> : <ClockCircleOutlined />}>
                                          {exam.latestAttempt.status === 'SUBMITTED' 
                                            ? `Score: ${Math.round(exam.latestAttempt.scorePercent || 0)}%`
                                            : 'In Progress'}
                                        </Tag>
                                      </Space>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <Space>
                                      <Typography.Text strong>{course?.name}</Typography.Text>
                                      <Tag color="purple" style={{ marginLeft: 4 }}>{course?.level}</Tag>
                                    </Space>
                                    <Space wrap size={6} style={{ marginTop: 4 }}>
                                      <Tag color="blue" icon={<FileTextOutlined />}>{exam.name}</Tag>
                                      {duration && <Tag icon={<ClockCircleOutlined />}>{duration}</Tag>}
                                      {countdown && <Tag color={countdown.type}>{countdown.text}</Tag>}
                                      {status && <Tag color={statusColor} icon={status === 'open' ? <PlayCircleOutlined /> : status === 'completed' ? <CheckCircleOutlined /> : status === 'missed' ? <CloseCircleOutlined /> : <ClockCircleOutlined />}>{statusText}</Tag>}
                                    </Space>
                                  </>
                                )}
                              </Space>
                              <Space>
                                {submitted ? (
                                  <Button
                                    size="small"
                                    type="primary"
                                    onClick={() => navigate(`/student/exams/result/${isCustom ? exam.latestAttempt.id : submitted}`)}
                                  >
                                    View results
                                  </Button>
                                ) : canTake ? (
                                  <Button
                                    size="small"
                                    type="primary"
                                    loading={startingExamId === exam.id}
                                    onClick={() => startExam(exam.id)}
                                  >
                                    Take exam
                                  </Button>
                                ) : (
                                  <Button
                                    size="small"
                                    disabled
                                  >
                                    {statusText}
                                  </Button>
                                )}
                              </Space>
                            </Space>
                          </Space>
                        </div>
                        {index < examItems.slice(0, 8).length - 1 && <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px solid #f0f0f0' }} />}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Performance Analytics Section */}
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
            {analytics?.hasData && (
              <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>Total Attempts</Typography.Text>
                  <Typography.Title level={4} style={{ margin: 0 }}>{analytics.totalAttempts}</Typography.Title>
                </div>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>Questions Answered</Typography.Text>
                  <Typography.Title level={4} style={{ margin: 0 }}>{analytics.totalQuestions}</Typography.Title>
                </div>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>Average Score</Typography.Text>
                  <Typography.Title level={4} style={{ margin: 0, color: analytics.avgScore >= 70 ? '#22c55e' : analytics.avgScore >= 50 ? '#f59e0b' : '#ef4444' }}>
                    {analytics.avgScore}%
                  </Typography.Title>
                </div>
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
                <Divider style={{ margin: '16px 0' }} />
                <div>
                  <Typography.Text strong style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
                    Topic Performance
                  </Typography.Text>
                  {analytics.topicPerformance?.length > 0 ? (
                    <Space direction="vertical" style={{ width: '100%' }} size={8}>
                      {analytics.topicPerformance.slice(0, 6).map((item, idx) => {
                        const color = item.percent >= 70 ? '#22c55e' : item.percent >= 50 ? '#f59e0b' : '#ef4444';
                        return (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Typography.Text style={{ width: 90, fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.topic}>
                              {item.topic}
                            </Typography.Text>
                            <div style={{ flex: 1 }}>
                              <Progress 
                                percent={item.percent} 
                                size="small"
                                strokeColor={color}
                                trailColor="rgba(0,0,0,0.06)"
                                format={(p) => <span style={{ color, fontSize: 11, fontWeight: 600 }}>{p}%</span>}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </Space>
                  ) : (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>No topic data available</Typography.Text>
                  )}
                </div>
              </>
            )}
          </Card>
        </Col>
      </Row>

      <Card 
        className="modern-card"
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-badge-sm icon-badge-green">
              <TrophyOutlined />
            </div>
            <span style={{ fontWeight: 600 }}>Completed Courses & Exam Results</span>
          </div>
        }
      >
        <Typography.Text type="secondary">Courses you have completed, with overall exam result.</Typography.Text>
        {completedCourses.length === 0 ? (
          <Empty description="No completed courses yet" style={{ marginTop: 16 }} />
        ) : (
          <List
            style={{ marginTop: 12 }}
            dataSource={completedCourses}
            renderItem={(c) => (
              <List.Item
                actions={[
                  <Button size="small" onClick={() => navigate(`/student/learn/${c.courseId}`)}>
                    View course
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={c.name}
                  description={
                    <Space>
                      <span>Level: {c.level}</span>
                      {c.examResult ? (
                        <>
                          <Tag color={c.examResult.passed ? 'success' : 'error'} icon={c.examResult.passed ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
                            {c.examResult.passed ? 'Passed' : 'Failed'}
                          </Tag>
                          <span>{Math.round(c.examResult.scorePercent ?? 0)}%</span>
                          {c.examResult.submittedAt && (
                            <Typography.Text type="secondary">
                              {new Date(c.examResult.submittedAt).toLocaleDateString()}
                            </Typography.Text>
                          )}
                        </>
                      ) : (
                        <Tag>No exam attempt</Tag>
                      )}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      <Card 
        className="modern-card"
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-badge-sm icon-badge-purple">
              <CreditCardOutlined />
            </div>
            <span style={{ fontWeight: 600 }}>Current Subscriptions</span>
          </div>
        }
        loading={loading}
      >
        <Typography.Text type="secondary">Your active and past-due subscriptions.</Typography.Text>
        {!subs.length ? (
          <Empty description="No subscriptions" style={{ marginTop: 16 }} />
        ) : (
          <List
            style={{ marginTop: 12 }}
            dataSource={[...subs].sort((a, b) => {
              const order = { active: 0, past_due: 1 };
              const ia = order[(a.status || '').toLowerCase()] ?? 2;
              const ib = order[(b.status || '').toLowerCase()] ?? 2;
              return ia - ib;
            })}
            renderItem={(s) => (
              <List.Item
                actions={[
                  <Button size="small" type="link" onClick={() => navigate('/student/billing')}>
                    Manage
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <CreditCardOutlined />
                      <span>{s.productName || s.plan || 'Subscription'}</span>
                      <Tag color={s.status === 'active' ? 'green' : s.status === 'past_due' ? 'orange' : 'default'}>
                        {s.status === 'active' ? 'Active' : s.status === 'past_due' ? 'Past due' : (s.status || '—')}
                      </Tag>
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={0}>
                      {(() => {
                        const end = s.current_period_end ?? s.currentPeriodEnd;
                        if (!end) return null;
                        const ms = end > 1e12 ? end : end * 1000;
                        return (
                          <Typography.Text type="secondary">
                            Current period ends: {new Date(ms).toLocaleDateString()}
                          </Typography.Text>
                        );
                      })()}
                      {(s.courses || []).length > 0 && (
                        <Typography.Text type="secondary">
                          Includes: {(s.courses || []).map(c => c.name).filter(Boolean).join(', ') || '—'}
                        </Typography.Text>
                      )}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>
        </>
      )}
    </Space>
  );
}

