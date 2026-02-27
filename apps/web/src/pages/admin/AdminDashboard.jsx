import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Typography, Statistic, Space, Skeleton } from 'antd';
import { 
  UserOutlined, 
  TeamOutlined, 
  BookOutlined, 
  DollarOutlined, 
  ScheduleOutlined,
  RiseOutlined,
  ArrowRightOutlined,
  FileTextOutlined,
  BarChartOutlined
} from '@ant-design/icons';
import { Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[(m || 1) - 1]} ${y}`;
}

const StatCard = ({ title, value, icon, iconBg, loading, trend }) => (
  <Card 
    className="stat-card stat-card-gradient"
    loading={loading}
    styles={{ body: { padding: '24px' } }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div>
        <Typography.Text style={{ color: '#64748b', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}>
          {title}
        </Typography.Text>
        <Typography.Title level={2} style={{ margin: 0, color: '#1e293b', fontWeight: 700 }}>
          {value?.toLocaleString() ?? 0}
        </Typography.Title>
        {trend && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <RiseOutlined style={{ color: '#22c55e', fontSize: 12 }} />
            <Typography.Text style={{ color: '#22c55e', fontSize: 12, fontWeight: 500 }}>
              {trend}
            </Typography.Text>
          </div>
        )}
      </div>
      <div 
        className="icon-badge"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
    </div>
  </Card>
);

const QuickActionCard = ({ to, icon, title, subtitle, gradient }) => (
  <Link to={to} style={{ textDecoration: 'none' }}>
    <div 
      style={{ 
        background: gradient,
        borderRadius: 16,
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'all 0.3s ease',
        cursor: 'pointer'
      }}
      className="quick-action-card"
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.15)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ 
          width: 48, 
          height: 48, 
          borderRadius: 12, 
          background: 'rgba(255,255,255,0.2)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}>
          {React.cloneElement(icon, { style: { fontSize: 24, color: '#fff' } })}
        </div>
        <div>
          <Typography.Text style={{ color: '#fff', fontSize: 16, fontWeight: 600, display: 'block' }}>
            {title}
          </Typography.Text>
          <Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
            {subtitle}
          </Typography.Text>
        </div>
      </div>
      <ArrowRightOutlined style={{ color: '#fff', fontSize: 18 }} />
    </div>
  </Link>
);

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
        borderColor: '#3b82f6',
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
          gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
          return gradient;
        },
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }
    ]
  };

  const statusOrder = ['ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE'];
  const statusLabels = { ACTIVE: 'Active', PAST_DUE: 'Past due', CANCELED: 'Canceled', INCOMPLETE: 'Incomplete' };
  const statusColors = { ACTIVE: '#22c55e', PAST_DUE: '#f97316', CANCELED: '#ef4444', INCOMPLETE: '#94a3b8' };
  const pieLabels = statusOrder.map(s => statusLabels[s] || s);
  const pieValues = statusOrder.map(s => subscriptionStatus[s] ?? 0);
  const doughnutData = {
    labels: pieLabels,
    datasets: [
      {
        data: pieValues,
        backgroundColor: statusOrder.map(s => statusColors[s] || '#94a3b8'),
        borderWidth: 0,
        hoverOffset: 4
      }
    ]
  };

  return (
    <div className="max-w-screen-2xl mx-auto">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <Typography.Title level={2} className="page-header-title">
            Dashboard
          </Typography.Title>
          <div className="page-header-subtitle">
            Welcome back! Here's what's happening with your platform.
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={8}>
          <QuickActionCard 
            to="/admin/users"
            icon={<UserOutlined />}
            title="Manage Users"
            subtitle="View and manage all users"
            gradient="linear-gradient(135deg, #102540 0%, #1e3a5f 100%)"
          />
        </Col>
        <Col xs={24} md={8}>
          <QuickActionCard 
            to="/admin/exams"
            icon={<ScheduleOutlined />}
            title="Exams"
            subtitle="Create and manage exams"
            gradient="linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)"
          />
        </Col>
        <Col xs={24} md={8}>
          <QuickActionCard 
            to="/admin/materials"
            icon={<FileTextOutlined />}
            title="Learning Materials"
            subtitle="Upload and organize content"
            gradient="linear-gradient(135deg, #0891b2 0%, #0e7490 100%)"
          />
        </Col>
      </Row>

      {/* Stats Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard 
            title="Total Users"
            value={counts.users}
            icon={<UserOutlined style={{ fontSize: 22, color: '#3b82f6' }} />}
            iconBg="linear-gradient(135deg, #dbeafe, #bfdbfe)"
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard 
            title="Students"
            value={counts.students}
            icon={<TeamOutlined style={{ fontSize: 22, color: '#8b5cf6' }} />}
            iconBg="linear-gradient(135deg, #ede9fe, #ddd6fe)"
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard 
            title="Courses"
            value={counts.courses}
            icon={<BookOutlined style={{ fontSize: 22, color: '#22c55e' }} />}
            iconBg="linear-gradient(135deg, #dcfce7, #bbf7d0)"
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard 
            title="Subscriptions"
            value={counts.subscriptions}
            icon={<DollarOutlined style={{ fontSize: 22, color: '#f97316' }} />}
            iconBg="linear-gradient(135deg, #ffedd5, #fed7aa)"
            loading={loading}
          />
        </Col>
      </Row>

      {/* Charts */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card 
            className="modern-card"
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="icon-badge-sm icon-badge-blue">
                  <BarChartOutlined />
                </div>
                <span>User Signups</span>
              </div>
            }
            loading={loading}
          >
            <div style={{ height: 320 }}>
              <Line
                data={lineData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { 
                    legend: { display: false }
                  },
                  scales: {
                    x: { 
                      grid: { display: false },
                      ticks: { color: '#64748b', font: { size: 12 } }
                    },
                    y: { 
                      beginAtZero: true, 
                      ticks: { stepSize: 1, color: '#64748b', font: { size: 12 } },
                      grid: { color: '#f1f5f9' }
                    }
                  }
                }}
              />
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card 
            className="modern-card"
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="icon-badge-sm icon-badge-green">
                  <DollarOutlined />
                </div>
                <span>Subscription Status</span>
              </div>
            }
            loading={loading}
          >
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Doughnut
                data={doughnutData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: '65%',
                  plugins: { 
                    legend: { 
                      position: 'bottom',
                      labels: {
                        padding: 16,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: { size: 12 }
                      }
                    }
                  }
                }}
              />
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

