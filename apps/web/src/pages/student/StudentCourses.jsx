import React, { useEffect, useMemo, useState } from 'react';
import { Card, List, Space, Typography, Tag, Empty, Button, Input, message } from 'antd';
import { SearchOutlined, BookOutlined, TrophyOutlined, FilePdfOutlined, CheckCircleOutlined, CreditCardOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { downloadCertificatePdf } from '../../lib/certificatePdf';

export function StudentCourses() {
  const [loading, setLoading] = useState(false);
  const [enrolled, setEnrolled] = useState([]);
  const [subs, setSubs] = useState([]);
  const [browseCourses, setBrowseCourses] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [subscribingId, setSubscribingId] = useState(null);
  const [certLoadingId, setCertLoadingId] = useState(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const handleDownloadCertificate = async (course) => {
    if (!course?.examResult?.passed) return;
    setCertLoadingId(course.courseId);
    try {
      const me = await api.get('/api/users/me');
      const user = me.data?.user;
      const userName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || 'Student';
      downloadCertificatePdf({
        userName,
        courseName: course.name,
        completedAt: course.examResult?.submittedAt,
        scorePercent: course.examResult?.scorePercent
      });
      message.success('Certificate downloaded');
    } catch {
      message.error('Could not load your name for the certificate');
    } finally {
      setCertLoadingId(null);
    }
  };

  const loadMyCourses = async () => {
    setLoading(true);
    try {
      const [en, su] = await Promise.all([
        api.get('/api/learning/me/courses'),
        api.get('/api/billing/subscriptions')
      ]);
      setEnrolled(en.data.courses || []);
      setSubs((su.data.subscriptions || []).filter(s => (s.status === 'ACTIVE' || s.status === 'active')));
    } finally {
      setLoading(false);
    }
  };

  const loadBrowseCourses = async (q = '') => {
    setBrowseLoading(true);
    try {
      const res = await api.get('/api/learning/courses/browse', { params: q ? { q } : {} });
      setBrowseCourses(res.data.courses || []);
    } catch {
      setBrowseCourses([]);
    } finally {
      setBrowseLoading(false);
    }
  };

  useEffect(() => {
    loadMyCourses();
    loadBrowseCourses('');
  }, []);

  const stripeSessionId = searchParams.get('session_id');

  // After login: if user had clicked Start Learning while logged out, run enroll/checkout for that course
  useEffect(() => {
    const pendingCourseId = localStorage.getItem('pendingCourseId');
    if (!pendingCourseId || stripeSessionId) return; // skip if returning from Stripe
    localStorage.removeItem('pendingCourseId');
    const runPending = async () => {
      setSubscribingId(pendingCourseId);
      try {
        const res = await api.post(`/api/learning/courses/${pendingCourseId}/enroll`);
        if (res.data.enrolled) {
          message.success('You are enrolled.');
          loadMyCourses();
          loadBrowseCourses('');
          return;
        }
        if (res.data.requiresPayment && res.data.productId) {
          const checkout = await api.post('/api/billing/checkout-session', {
            productId: res.data.productId,
            successUrl: `${window.location.origin}/student/courses?session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${window.location.origin}/student/courses`
          });
          if (checkout.data?.url) {
            window.location.href = checkout.data.url;
            return;
          }
          message.error('Unable to start checkout');
        }
      } catch (err) {
        message.error(err.response?.data?.error || 'Failed to enroll');
      } finally {
        setSubscribingId(null);
      }
    };
    runPending();
  }, [stripeSessionId]);

  // When returning from Stripe: process session_id so enrollment + invoice are created
  useEffect(() => {
    if (!stripeSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        await api.post('/api/billing/checkout-success', { session_id: stripeSessionId });
        if (!cancelled) {
          message.success('Payment recorded. You are now enrolled.');
          setSearchParams({}, { replace: true });
          loadMyCourses();
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err.response?.data?.error || err.message || 'Failed to record payment';
          message.error(msg);
          setSearchParams({}, { replace: true });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [stripeSessionId]);

  const subscribedCourses = useMemo(() => {
    const map = new Map();
    (subs || []).forEach(s => (s.courses || []).forEach(c => map.set(c.id, c)));
    return Array.from(map.values());
  }, [subs]);

  const handleSubscribe = async (course) => {
    setSubscribingId(course.id);
    try {
      const res = await api.post(`/api/learning/courses/${course.id}/enroll`);
      if (res.data.enrolled) {
        message.success(`Enrolled in ${course.name}`);
        loadMyCourses();
        setBrowseCourses((prev) => prev.filter((c) => c.id !== course.id));
        return;
      }
      if (res.data.requiresPayment && res.data.productId) {
        const checkout = await api.post('/api/billing/checkout-session', {
          productId: res.data.productId,
          successUrl: `${window.location.origin}/student/courses?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/student/courses`
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

  const formatPrice = (priceCents, interval) => {
    if (!priceCents) return 'Free';
    const amount = (priceCents / 100).toFixed(2);
    const period = interval === 'MONTHLY' ? '/month' : interval === 'YEARLY' ? '/year' : '';
    return `$${amount}${period}`;
  };

  const formatInterval = (interval) => {
    if (!interval) return null;
    const map = { ONE_TIME: 'One-off', MONTHLY: 'Monthly', YEARLY: 'Yearly' };
    return map[interval] || interval;
  };

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div style={{ marginBottom: 8 }}>
        <Typography.Title level={3} style={{ margin: 0, fontWeight: 600, color: '#1f2937' }}>
          My Courses
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 14 }}>
          Your enrolled and subscribed courses
        </Typography.Text>
      </div>
      <Card
        title={
          <Space>
            <BookOutlined style={{ color: '#6366f1' }} />
            <span style={{ fontWeight: 600, fontSize: 16 }}>Enrolled Courses</span>
          </Space>
        }
        loading={loading}
        styles={{ body: { padding: 0 } }}
      >
        {!enrolled.length ? (
          <div style={{ padding: 32 }}><Empty description="No enrollments yet" /></div>
        ) : (
          <List
            dataSource={enrolled}
            split
            renderItem={(c) => {
              const inProgress = c.enrollmentStatus !== 'COMPLETED';
              return (
              <List.Item
                style={{
                  padding: '16px 24px',
                  ...(inProgress && {
                    background: 'rgba(99, 102, 241, 0.06)',
                    borderLeft: '4px solid #6366f1',
                    marginLeft: 0,
                  })
                }}
                actions={[
                  ...(c.examResult?.passed
                    ? [
                        <Button
                          key="cert"
                          type="default"
                          icon={<FilePdfOutlined />}
                          loading={certLoadingId === c.courseId}
                          onClick={() => handleDownloadCertificate(c)}
                        >
                          Download Certificate
                        </Button>
                      ]
                    : []),
                  <Button key="open" type="primary" ghost onClick={() => navigate(`/student/learn/${c.courseId}`)}>
                    Open
                  </Button>
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: '#102540',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <CheckCircleOutlined style={{ color: '#fff', fontSize: 18 }} />
                    </div>
                  }
                  title={
                    <Typography.Text strong style={{ fontSize: 14, color: '#111827' }}>
                      {c.name}
                    </Typography.Text>
                  }
                  description={
                    <Space size="small" wrap style={{ marginTop: 4 }}>
                      <Tag style={{ marginRight: 0 }}>Level: {c.level}</Tag>
                      {inProgress && <Tag color="blue">In progress</Tag>}
                      {c.enrollmentStatus === 'COMPLETED' && (
                        <Tag color="green">Completed</Tag>
                      )}
                      {c.examResult != null && (
                        c.examResult.passed ? (
                          <Tag color="success" icon={<TrophyOutlined />}>Passed</Tag>
                        ) : (
                          <Tag color="default">Exam attempted</Tag>
                        )
                      )}
                    </Space>
                  }
                />
                <div style={{ minWidth: 140, textAlign: 'right' }}>
                  <Space size="small">
                    {c.examResult != null && (
                      <>
                        <Tag color={c.examResult.passed ? 'green' : 'red'}>
                          {c.progressPercent}%
                        </Tag>
                        <Tag color={c.examResult.passed ? 'green' : 'red'}>
                          Exam: {Math.round(c.examResult.scorePercent ?? 0)}%
                        </Tag>
                      </>
                    )}
                    {c.examResult == null && (
                      c.enrollmentStatus === 'COMPLETED' ? (
                        <Tag color="green">{c.progressPercent}%</Tag>
                      ) : (
                        <Tag color="blue">{c.progressPercent}%</Tag>
                      )
                    )}
                  </Space>
                </div>
              </List.Item>
              );
            }}
          />
        )}
      </Card>
      <Card
        title={
          <Space>
            <BookOutlined style={{ color: '#6366f1' }} />
            <span style={{ fontWeight: 600, fontSize: 16 }}>Subscribed Courses</span>
          </Space>
        }
        loading={loading}
        styles={{ body: { padding: 0 } }}
      >
        {!subscribedCourses.length ? (
          <div style={{ padding: 32 }}><Empty description="No subscribed courses" /></div>
        ) : (
          <List
            dataSource={subscribedCourses}
            split
            renderItem={(c) => (
              <List.Item
                style={{ padding: '16px 24px' }}
                actions={[
                  <Button type="primary" ghost key="open" onClick={() => navigate(`/student/learn/${c.id}`)}>
                    Open
                  </Button>
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: '#102540',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <CreditCardOutlined style={{ color: '#fff', fontSize: 18 }} />
                    </div>
                  }
                  title={
                    <Typography.Text strong style={{ fontSize: 14, color: '#111827' }}>
                      {c.name}
                    </Typography.Text>
                  }
                  description={
                    <Space size="small" wrap style={{ marginTop: 4 }}>
                      <Tag style={{ marginRight: 0 }}>Level: {c.level}</Tag>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>
      <Card
        title={
          <Space>
            <SearchOutlined style={{ color: '#6366f1' }} />
            <span style={{ fontWeight: 600, fontSize: 16 }}>Browse & Subscribe to Other Courses</span>
          </Space>
        }
        extra={
          <Input.Search
            placeholder="Search courses..."
            allowClear
            style={{ width: 260 }}
            onSearch={(val) => {
              setSearchQuery(val);
              loadBrowseCourses(val);
            }}
            enterButton={<SearchOutlined />}
          />
        }
        loading={browseLoading}
        styles={{ body: { padding: 24 } }}
      >
        {(() => {
          const enrolledIds = new Set(enrolled.map((c) => c.courseId));
          const subscribedIds = new Set(subscribedCourses.map((c) => c.id));
          const available = (browseCourses || []).filter(
            (c) => !enrolledIds.has(c.id) && !subscribedIds.has(c.id)
          );
          return !available.length ? (
          <Empty
            description={
              browseLoading ? 'Loading...' : searchQuery
                ? 'No courses match your search'
                : 'No other courses available. You are enrolled in all courses!'
            }
          />
          ) : (
          <List
            dataSource={available}
            split
            renderItem={(c) => (
              <List.Item
                style={{ padding: '12px 0' }}
                actions={[
                  <Button
                    key="sub"
                    type="primary"
                    loading={subscribingId === c.id}
                    onClick={() => handleSubscribe(c)}
                  >
                    {c.isFree ? 'Enroll for Free' : 'Subscribe'}
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={
                    <Typography.Text strong style={{ fontSize: 14, color: '#111827' }}>
                      {c.name}
                    </Typography.Text>
                  }
                  description={
                    <Space wrap size="small" style={{ marginTop: 6 }}>
                      <Tag>Level: {c.level}</Tag>
                      {c.description && (
                        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                          {c.description}
                        </Typography.Text>
                      )}
                      {c.product && (
                        <>
                          <Tag color={c.isFree ? 'green' : 'blue'}>
                            {formatPrice(c.product.priceCents, c.product.interval)}
                          </Tag>
                          {formatInterval(c.product.interval) && (
                            <Tag>{formatInterval(c.product.interval)}</Tag>
                          )}
                        </>
                      )}
                      {c.isFree && !c.product && <Tag color="green">Free</Tag>}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
          );
        })()}
      </Card>
    </Space>
  );
}

