import React, { useEffect, useMemo, useState } from 'react';
import { Card, List, Progress, Space, Button, Typography, Empty, Row, Col, Statistic, Tag, message, Spin, Divider } from 'antd';
import { ReadOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, CreditCardOutlined, BookOutlined, ShoppingCartOutlined, RiseOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { useNavigate, useSearchParams } from 'react-router-dom';

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

  useEffect(() => { load(); }, []);

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
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>My Dashboard</Typography.Title>

      {loading ? (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 280, padding: 48 }}>
            <Spin size="large" tip="Loading your dashboard…" />
          </div>
        </Card>
      ) : (
        <>
      {!hasSubscriptionOrPurchase && (
        <Card
          style={{
            background: 'linear-gradient(135deg, #f0f7ff 0%, #e6f4ff 100%)',
            border: '1px solid #91caff',
            borderRadius: 12
          }}
        >
          <div style={{ marginBottom: 20 }}>
            <Typography.Title level={5} style={{ color: '#102540', margin: '0 0 8px' }}>
              You have not yet purchased any subscription
            </Typography.Title>
            <Typography.Text type="secondary">
              Please select any course below to subscribe (monthly, yearly, or one-time purchase) and start learning.
            </Typography.Text>
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

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="My Courses" value={kpis.totalCourses} prefix={<BookOutlined style={{ color: '#102540' }} />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Average Progress" value={kpis.avgProgress} suffix="%" prefix={<RiseOutlined style={{ color: '#102540' }} />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Learning Time" value={kpis.learningTime} prefix={<ClockCircleOutlined style={{ color: '#102540' }} />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Active Subs" value={kpis.activeSubs} prefix={<CreditCardOutlined style={{ color: '#102540' }} />} />
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={16}>
          <Card title="Continue Learning" loading={loading}>
            {continueLearningCourses.length === 0 ? (
              <Empty description={courses.length === 0 ? 'No courses yet' : 'No courses in progress'} />
            ) : (
              <List
                dataSource={continueLearningCourses}
                renderItem={(c) => (
                  <List.Item
                    actions={[
                      <Button
                        type="primary"
                        icon={<ReadOutlined />}
                        onClick={() => {
                          const back = encodeURIComponent('/student');
                          navigate(`/student/learn/${c.courseId}?back=${back}`);
                        }}
                      >
                        Continue
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      title={c.name}
                      description={<span>Level: {c.level}</span>}
                    />
                    <div style={{ minWidth: 220 }}>
                      <Progress percent={c.progressPercent || 0} />
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Available Exams" loading={loading}>
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
                                    <Space wrap size={4}>
                                      <Tag color="green">{exam.name}</Tag>
                                      {status && <Tag color={statusColor}>{statusText}</Tag>}
                                      {duration && <Tag icon={<ClockCircleOutlined />}>{duration}</Tag>}
                                      {countdown && <Tag color={countdown.type}>{countdown.text}</Tag>}
                                    </Space>
                                    {exam.latestAttempt && (
                                      <Space>
                                        <Tag color={exam.latestAttempt.status === 'SUBMITTED' ? 'green' : 'orange'}>
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
                                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                        Level: {course?.level}
                                      </Typography.Text>
                                    </Space>
                                    <Space wrap size={4}>
                                      <Tag color="green">{exam.name}</Tag>
                                      {duration && <Tag icon={<ClockCircleOutlined />}>{duration}</Tag>}
                                      {countdown && <Tag color={countdown.type}>{countdown.text}</Tag>}
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

      <Card title="Completed Courses & Exam Results">
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

      <Card title="Current Subscriptions" loading={loading}>
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

