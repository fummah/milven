import React, { useEffect, useState } from 'react';
import { Card, Table, Space, Typography, Button, Tag } from 'antd';
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
    { title: 'Invoice #', dataIndex: 'number' },
    { title: 'Total', render: (_, r) => r.total ? `$${(r.total/100).toFixed(2)}` : '-' },
    { title: 'Status', render: (_, r) => {
      const map = { Paid: 'green', Pending: 'orange', Unpaid: 'red', Cancelled: 'default' };
      return <Tag color={map[r.displayStatus] || 'blue'}>{r.displayStatus}</Tag>;
    }},
    { title: 'Created', render: (_, r) => r.created ? new Date(r.created).toLocaleString() : '-' },
    { title: 'Actions', render: (_, r) => (
      <Space>
        {r.hostedInvoiceUrl ? <Button onClick={() => window.open(r.hostedInvoiceUrl, '_blank', 'noopener')}>View</Button> : null}
        {r.invoicePdf ? <Button onClick={() => window.open(r.invoicePdf, '_blank', 'noopener')}>Download</Button> : null}
      </Space>
    ) }
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>My Invoices</Typography.Title>
      <Card>
        <Table rowKey="id" loading={loading} dataSource={invoices} columns={columns} />
      </Card>
    </Space>
  );
}

