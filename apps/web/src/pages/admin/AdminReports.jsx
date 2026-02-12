import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Typography } from 'antd';
import { Line, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { api } from '../../lib/api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend);

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
        borderColor: '#102540',
        backgroundColor: 'rgba(16,37,64,0.15)',
        tension: 0.2
      }
    ]
  };

  const pieData = {
    labels: Object.keys(subStatus.counts || {}),
    datasets: [
      {
        data: Object.values(subStatus.counts || {}),
        backgroundColor: ['#52c41a','#faad14','#ff4d4f','#91d5ff']
      }
    ]
  };

  return (
    <div style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>Reports Overview</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Card><Statistic title="Users" value={kpi.users} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Students" value={kpi.students} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Courses" value={kpi.courses} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="Active Subs" value={kpi.activeSubs} /></Card></Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={16}>
          <Card title="Revenue (Last 6 Months)">
            <Line data={lineData} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Subscriptions Status">
            <Pie data={pieData} />
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title="Top Courses by Enrollments">
            <ul>
              {topEnroll.map((c, idx) => (
                <li key={idx}>{c.name} ({c.level}) — {c.count}</li>
              ))}
            </ul>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Top Courses by Avg Progress">
            <ul>
              {topProgress.map((c, idx) => (
                <li key={idx}>{c.name} ({c.level}) — {Math.round(c.average)}%</li>
              ))}
            </ul>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

