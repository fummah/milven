import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Typography, Statistic, Space } from 'antd';
import { UserOutlined, TeamOutlined, BookOutlined, DollarOutlined, ScheduleOutlined } from '@ant-design/icons';
import { Line, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend } from 'chart.js';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend);

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[(m || 1) - 1]} ${y}`;
}

export function AdminDashboard() {
  const [counts, setCounts] = useState({ users: 0, students: 0, courses: 0, subscriptions: 0 });
  const [signupsMonthly, setSignupsMonthly] = useState({ labels: [], data: [] });
  const [subscriptionStatus, setSubscriptionStatus] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [overviewRes, signupsRes, statusRes] = await Promise.all([
          api.get('/api/reports/overview'),
          api.get('/api/reports/signups-monthly', { params: { months: 12 } }),
          api.get('/api/reports/subscriptions/status')
        ]);
        const ov = overviewRes.data;
        setCounts({
          users: ov.users ?? 0,
          students: ov.students ?? 0,
          courses: ov.courses ?? 0,
          subscriptions: ov.totalSubscriptions ?? ov.activeSubs ?? 0
        });
        const sm = signupsRes.data;
        setSignupsMonthly({
          labels: (sm.labels ?? []).map(formatMonthLabel),
          data: sm.data ?? []
        });
        setSubscriptionStatus(statusRes.data?.counts ?? {});
      } catch {
        setCounts({ users: 0, students: 0, courses: 0, subscriptions: 0 });
        setSignupsMonthly({ labels: [], data: [] });
        setSubscriptionStatus({});
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const lineData = {
    labels: signupsMonthly.labels,
    datasets: [
      {
        label: 'User signups',
        data: signupsMonthly.data,
        borderColor: '#102540',
        backgroundColor: 'rgba(16,37,64,0.15)',
        tension: 0.35,
        fill: true
      }
    ]
  };

  const statusOrder = ['ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE'];
  const statusLabels = { ACTIVE: 'Active', PAST_DUE: 'Past due', CANCELED: 'Canceled', INCOMPLETE: 'Incomplete' };
  const statusColors = { ACTIVE: '#52c41a', PAST_DUE: '#fa8c16', CANCELED: '#ff4d4f', INCOMPLETE: '#94a3b8' };
  const pieLabels = statusOrder.map(s => statusLabels[s] || s);
  const pieValues = statusOrder.map(s => subscriptionStatus[s] ?? 0);
  const pieData = {
    labels: pieLabels,
    datasets: [
      {
        data: pieValues,
        backgroundColor: statusOrder.map(s => statusColors[s] || '#94a3b8')
      }
    ]
  };

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Typography.Title level={3} style={{ color: '#102540', margin: 0 }}>
          Dashboard Overview
        </Typography.Title>
        <Space>
          <Link to="/admin/users">
            <div className="px-4 py-2 rounded-full text-white flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#102540,#1b3a5b)' }}>
              <UserOutlined />
              <span>Manage Users</span>
            </div>
          </Link>
          <Link to="/admin/exams">
            <div className="px-4 py-2 rounded-full text-white flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#2f54eb,#722ed1)' }}>
              <ScheduleOutlined />
              <span>Exams</span>
            </div>
          </Link>
          <Link to="/admin/materials">
            <div className="px-4 py-2 rounded-full text-white flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#13c2c2,#52c41a)' }}>
              <BookOutlined />
              <span>Learning Materials</span>
            </div>
          </Link>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} lg={6}>
          <Card loading={loading}>
            <Statistic title="Total Users" value={counts.users} prefix={<UserOutlined style={{ color: '#102540' }} />} />
          </Card>
        </Col>
        <Col xs={24} md={12} lg={6}>
          <Card loading={loading}>
            <Statistic title="Students" value={counts.students} prefix={<TeamOutlined style={{ color: '#102540' }} />} />
          </Card>
        </Col>
        <Col xs={24} md={12} lg={6}>
          <Card loading={loading}>
            <Statistic title="Courses" value={counts.courses} prefix={<BookOutlined style={{ color: '#102540' }} />} />
          </Card>
        </Col>
        <Col xs={24} md={12} lg={6}>
          <Card loading={loading}>
            <Statistic title="Subscriptions" value={counts.subscriptions} prefix={<DollarOutlined style={{ color: '#102540' }} />} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={16}>
          <Card title="User signups (per month)" loading={loading}>
            <Line
              data={lineData}
              options={{
                responsive: true,
                plugins: { legend: { display: true } },
                scales: {
                  x: { title: { display: true, text: 'Month' } },
                  y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
              }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Subscription status" loading={loading}>
            <Pie
              data={pieData}
              options={{
                responsive: true,
                plugins: { legend: { position: 'bottom' } }
              }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

