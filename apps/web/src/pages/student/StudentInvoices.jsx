import React, { useEffect, useState } from 'react';
import { Card, Table, Space, Typography, Button, Tag } from 'antd';
import { FileTextOutlined, EyeOutlined, DownloadOutlined, DollarOutlined, CalendarOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

export function StudentInvoices() {
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/billing/invoices');
      setInvoices(data.invoices || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const columns = [
    { 
      title: 'Invoice', 
      dataIndex: 'number',
      render: (number) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="icon-badge-sm icon-badge-blue">
            <FileTextOutlined style={{ fontSize: 14 }} />
          </div>
          <Typography.Text strong style={{ color: '#1e293b' }}>
            {number || '—'}
          </Typography.Text>
        </div>
      )
    },
    { 
      title: 'Amount', 
      render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <DollarOutlined style={{ color: '#22c55e' }} />
          <Typography.Text strong style={{ color: '#22c55e' }}>
            {r.total ? `$${(r.total/100).toFixed(2)}` : '—'}
          </Typography.Text>
        </div>
      )
    },
    { 
      title: 'Status', 
      render: (_, r) => {
        const statusMap = {
          Paid: { color: 'success', icon: '✓' },
          Pending: { color: 'warning', icon: '○' },
          Unpaid: { color: 'error', icon: '!' },
          Cancelled: { color: 'default', icon: '×' }
        };
        const status = statusMap[r.displayStatus] || { color: 'processing', icon: '•' };
        return <Tag color={status.color}>{r.displayStatus}</Tag>;
      }
    },
    { 
      title: 'Date', 
      render: (_, r) => (
        r.created ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarOutlined style={{ color: '#64748b' }} />
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {new Date(r.created).toLocaleDateString()}
            </Typography.Text>
          </div>
        ) : '—'
      )
    },
    { 
      title: 'Actions', 
      render: (_, r) => (
        <Space size={8}>
          {r.hostedInvoiceUrl && (
            <Button 
              icon={<EyeOutlined />}
              onClick={() => window.open(r.hostedInvoiceUrl, '_blank', 'noopener')}
              style={{ borderRadius: 10 }}
            >
              View
            </Button>
          )}
          {r.invoicePdf && (
            <Button 
              icon={<DownloadOutlined />}
              onClick={() => window.open(r.invoicePdf, '_blank', 'noopener')}
              style={{ borderRadius: 10 }}
            >
              Download
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <Typography.Title level={2} className="page-header-title">
            My Invoices
          </Typography.Title>
          <div className="page-header-subtitle">
            View and download your billing invoices
          </div>
        </div>
      </div>

      <Card className="modern-card" styles={{ body: { padding: 0 } }}>
        <div className="modern-table">
          <Table 
            rowKey="id" 
            loading={loading} 
            dataSource={invoices} 
            columns={columns}
            pagination={{
              style: { padding: '16px 24px', margin: 0 }
            }}
          />
        </div>
      </Card>
    </Space>
  );
}

