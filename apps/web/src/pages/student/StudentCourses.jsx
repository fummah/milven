import React, { useEffect, useMemo, useState } from 'react';
import { Card, List, Space, Typography, Tag, Empty, Button, Input, message, Progress } from 'antd';
import { SearchOutlined, BookOutlined, TrophyOutlined, FilePdfOutlined, CheckCircleOutlined, CreditCardOutlined, ArrowRightOutlined, ShoppingCartOutlined, PlayCircleOutlined } from '@ant-design/icons';
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
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <Typography.Title level={2} className="page-header-title">
            My Courses
          </Typography.Title>
          <div className="page-header-subtitle">
            Your enrolled and subscribed courses
          </div>
        </div>
      </div>

      <Card
        className="modern-card"
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-badge-sm icon-badge-purple">
              <BookOutlined />
            </div>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Enrolled Courses</span>
          </div>
        }
        loading={loading}
        styles={{ body: { padding: 0 } }}
      >
        {!enrolled.length ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <BookOutlined />
            </div>
            <Typography.Text type="secondary">No enrollments yet</Typography.Text>
          </div>
        ) : (
          <div style={{ padding: '8px 0' }}>
            {enrolled.map((c) => {
              const inProgress = c.enrollmentStatus !== 'COMPLETED';
              return (
                <div 
                  key={c.courseId}
                  className="modern-list-item"
                  style={{
                    margin: '8px 16px',
                    ...(inProgress && {
                      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.05))',
                      borderLeft: '4px solid #8b5cf6',
                    })
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <div className={`icon-badge-sm ${c.enrollmentStatus === 'COMPLETED' ? 'icon-badge-green' : 'icon-badge-purple'}`}>
                        {c.enrollmentStatus === 'COMPLETED' ? <CheckCircleOutlined style={{ fontSize: 16 }} /> : <BookOutlined style={{ fontSize: 16 }} />}
                      </div>
                      <div>
                        <Typography.Text strong style={{ fontSize: 15, color: '#1e293b', display: 'block' }}>
                          {c.name}
                        </Typography.Text>
                        <Space size={4} wrap style={{ marginTop: 6 }}>
                          <Tag color="blue">{c.level}</Tag>
                          {inProgress && <Tag color="purple">In progress</Tag>}
                          {c.enrollmentStatus === 'COMPLETED' && <Tag color="success">Completed</Tag>}
                          {c.examResult?.passed && <Tag color="success" icon={<TrophyOutlined />}>Passed</Tag>}
                        </Space>
                      </div>
                    </div>
                    <div style={{ minWidth: 120 }} className="progress-enhanced">
                      <Progress 
                        percent={c.progressPercent || 0} 
                        size="small"
                        status={c.enrollmentStatus === 'COMPLETED' ? 'success' : 'active'}
                      />
                    </div>
                    <Space>
                      {c.examResult?.passed && (
                        <Button
                          icon={<FilePdfOutlined />}
                          loading={certLoadingId === c.courseId}
                          onClick={() => handleDownloadCertificate(c)}
                          style={{ borderRadius: 10 }}
                        >
                          Certificate
                        </Button>
                      )}
                      <Button 
                        type="primary" 
                        icon={<PlayCircleOutlined />}
                        onClick={() => navigate(`/student/learn/${c.courseId}`)}
                        style={{ 
                          background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                          border: 'none',
                          borderRadius: 10
                        }}
                      >
                        Open
                      </Button>
                    </Space>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Card
        className="modern-card"
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-badge-sm icon-badge-green">
              <CreditCardOutlined />
            </div>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Subscribed Courses</span>
          </div>
        }
        loading={loading}
        styles={{ body: { padding: 0 } }}
      >
        {!subscribedCourses.length ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <CreditCardOutlined />
            </div>
            <Typography.Text type="secondary">No subscribed courses</Typography.Text>
          </div>
        ) : (
          <div style={{ padding: '8px 0' }}>
            {subscribedCourses.map((c) => (
              <div key={c.id} className="modern-list-item" style={{ margin: '8px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    <div className="icon-badge-sm icon-badge-green">
                      <CreditCardOutlined style={{ fontSize: 16 }} />
                    </div>
                    <div>
                      <Typography.Text strong style={{ fontSize: 15, color: '#1e293b', display: 'block' }}>
                        {c.name}
                      </Typography.Text>
                      <Tag color="blue" style={{ marginTop: 4 }}>{c.level}</Tag>
                    </div>
                  </div>
                  <Button 
                    type="primary" 
                    ghost
                    icon={<ArrowRightOutlined />}
                    onClick={() => navigate(`/student/learn/${c.id}`)}
                    style={{ borderRadius: 10 }}
                  >
                    Open
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card
        className="modern-card"
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-badge-sm icon-badge-blue">
              <SearchOutlined />
            </div>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Browse & Subscribe to Other Courses</span>
          </div>
        }
        extra={
          <Input
            placeholder="Search courses..."
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            allowClear
            style={{ width: 260, borderRadius: 10 }}
            onPressEnter={(e) => {
              setSearchQuery(e.target.value);
              loadBrowseCourses(e.target.value);
            }}
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

