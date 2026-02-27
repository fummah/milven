import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Typography, List, Progress, Tag, Space } from 'antd';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { api } from '../../lib/api';
import { TeamOutlined, BookOutlined, CreditCardOutlined, DollarOutlined, BarChartOutlined, TrophyOutlined, RiseOutlined, UserOutlined } from '@ant-design/icons';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

export function AdminReports() {
  const [kpi, setKpi] = useState({ users: 0, students: 0, courses: 0, activeSubs: 0, revenue30: 0 });
  const [rev, setRev] = useState({ labels: [], values: [] });
  const [subStatus, setSubStatus] = useState({ counts: {} });
  const [topEnroll, setTopEnroll] = useState([]);
  const [topProgress, setTopProgress] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: o }, { data: r }, { data: s }, { data: e }, { data: p }] = await Promise.all([
          api.get('/api/reports/overview'),
          api.get('/api/reports/revenue-monthly', { params: { months: 6 } }),
          api.get('/api/reports/subscriptions/status'),
          api.get('/api/reports/enrollments/courses'),
          api.get('/api/reports/progress/courses')
        ]);
        setKpi(o);
        setRev(r);
        setSubStatus(s);
        setTopEnroll(e.top || []);
        setTopProgress(p.results || []);
      } catch {}
    })();
  }, []);

  const lineData = {
    labels: rev.labels,
    datasets: [
      {
        label: 'Revenue (USD)',
        data: rev.values.map(v => (v/100).toFixed(2)),
        borderColor: '#3b82f6',
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 200);
          gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
          gradient.addColorStop(1, 'rgba(59, 130, 246, 0.02)');
          return gradient;
        },
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
      }
    ]
  };

  const doughnutData = {
    labels: Object.keys(subStatus.counts || {}),
    datasets: [
      {
        data: Object.values(subStatus.counts || {}),
        backgroundColor: ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6'],
        borderWidth: 0,
        cutout: '70%',
      }
    ]
  };

  const StatCard = ({ icon, title, value, gradient }) => (
    <Card className="stat-card" style={{ background: gradient, border: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ 
          width: 48, 
          height: 48, 
          borderRadius: 12, 
          background: 'rgba(255,255,255,0.2)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: 'white',
          fontSize: 22
        }}>
          {icon}
        </div>
        <div>
          <Typography.Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>{title}</Typography.Text>
          <Typography.Title level={3} style={{ margin: 0, color: '#fff' }}>{value}</Typography.Title>
        </div>
      </div>
    </Card>
  );

  return (
    <div style={{ width: '100%' }}>
      <div className="page-header">
        <div>
          <Typography.Title level={3} className="page-header-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-badge icon-badge-orange">
              <BarChartOutlined style={{ fontSize: 20 }} />
            </div>
            Reports Overview
          </Typography.Title>
          <Typography.Text type="secondary" className="page-header-subtitle">
            Analytics and performance insights
          </Typography.Text>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <StatCard 
            icon={<TeamOutlined />} 
            title="Total Users" 
            value={kpi.users} 
            gradient="linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)" 
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard 
            icon={<UserOutlined />} 
            title="Students" 
            value={kpi.students} 
            gradient="linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)" 
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard 
            icon={<BookOutlined />} 
            title="Courses" 
            value={kpi.courses} 
            gradient="linear-gradient(135deg, #22c55e 0%, #16a34a 100%)" 
          />
        </Col>
        <Col xs={12} md={6}>
          <StatCard 
            icon={<CreditCardOutlined />} 
            title="Active Subs" 
            value={kpi.activeSubs} 
            gradient="linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" 
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
        <Col xs={24} md={16}>
          <Card 
            className="modern-card"
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="icon-badge-sm icon-badge-blue">
                  <RiseOutlined style={{ fontSize: 14 }} />
                </div>
                Revenue (Last 6 Months)
              </span>
            }
          >
            <Line 
              data={lineData} 
              options={{
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                  x: { grid: { display: false } }
                }
              }}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card 
            className="modern-card"
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="icon-badge-sm icon-badge-purple">
                  <CreditCardOutlined style={{ fontSize: 14 }} />
                </div>
                Subscription Status
              </span>
            }
          >
            <Doughnut 
              data={doughnutData}
              options={{
                responsive: true,
                plugins: { legend: { position: 'bottom' } }
              }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
        <Col xs={24} md={12}>
          <Card 
            className="modern-card"
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="icon-badge-sm icon-badge-green">
                  <TrophyOutlined style={{ fontSize: 14 }} />
                </div>
                Top Courses by Enrollments
              </span>
            }
          >
            <List
              dataSource={topEnroll}
              renderItem={(c, idx) => (
                <List.Item className="modern-list-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                    <div style={{ 
                      width: 28, 
                      height: 28, 
                      borderRadius: 8, 
                      background: idx === 0 ? '#fef3c7' : idx === 1 ? '#f3f4f6' : idx === 2 ? '#fef3c7' : '#f1f5f9',
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      fontWeight: 600,
                      color: idx === 0 ? '#d97706' : '#64748b',
                      fontSize: 12
                    }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <Typography.Text strong>{c.name}</Typography.Text>
                      <Tag style={{ marginLeft: 8 }} color="blue">{c.level}</Tag>
                    </div>
                    <Typography.Text strong style={{ color: '#3b82f6' }}>{c.count}</Typography.Text>
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card 
            className="modern-card"
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="icon-badge-sm icon-badge-orange">
                  <BarChartOutlined style={{ fontSize: 14 }} />
                </div>
                Top Courses by Avg Progress
              </span>
            }
          >
            <List
              dataSource={topProgress}
              renderItem={(c, idx) => (
                <List.Item className="modern-list-item">
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div>
                        <Typography.Text strong>{c.name}</Typography.Text>
                        <Tag style={{ marginLeft: 8 }} color="blue">{c.level}</Tag>
                      </div>
                      <Typography.Text strong style={{ color: '#22c55e' }}>{Math.round(c.average)}%</Typography.Text>
                    </div>
                    <Progress 
                      percent={Math.round(c.average)} 
                      showInfo={false}
                      strokeColor={{ from: '#22c55e', to: '#16a34a' }}
                      trailColor="#f1f5f9"
                      size="small"
                    />
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

