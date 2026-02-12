import React, { useEffect, useMemo, useState } from 'react';
import { Card, List, Space, Typography, Tag, Button, Empty } from 'antd';
import { api } from '../../lib/api';

export function StudentBilling() {
  const [loading, setLoading] = useState(false);
  const [subs, setSubs] = useState([]);
  const [purchases, setPurchases] = useState([]);

  const subsSorted = useMemo(() => {
    const list = [...(subs || [])];
    return list.sort((a, b) => {
      const aActive = a.status === 'active' || a.status === 'ACTIVE';
      const bActive = b.status === 'active' || b.status === 'ACTIVE';
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return 0;
    });
  }, [subs]);

  const load = async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        api.get('/api/billing/subscriptions'),
        api.get('/api/billing/purchases')
      ]);
      setSubs(s.data.subscriptions || []);
      setPurchases(p.data.purchases || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>Billing</Typography.Title>
      <Typography.Text type="secondary">Your subscriptions and one-time purchases only.</Typography.Text>

      <Card title="My Subscriptions" loading={loading}>
        {!subs.length ? (
          <Empty description="No subscriptions" />
        ) : (
          <List
            dataSource={subsSorted}
            renderItem={(s) => {
              const isActive = s.status === 'active' || s.status === 'ACTIVE';
              return (
                <List.Item
                  style={{
                    background: isActive ? 'rgba(82, 196, 26, 0.08)' : undefined,
                    borderLeft: isActive ? '4px solid #52c41a' : undefined,
                    borderRadius: 4,
                    marginBottom: 8,
                    padding: '12px 16px'
                  }}
                >
                  <List.Item.Meta
                    title={s.productName || 'Subscription'}
                    description={
                      <Space wrap>
                        <span>Status: <Tag color={isActive ? 'green' : s.status === 'canceled' || s.status === 'CANCELED' ? 'default' : 'orange'}>{s.status}</Tag></span>
                        <span>Interval: {s.items?.data?.[0]?.price?.recurring?.interval || '-'}</span>
                      </Space>
                    }
                  />
                  <Space direction="vertical" align="end">
                    <Space wrap>
                      {(s.courses || []).map(c => (
                        <Tag key={c.id} color="blue">{c.name}</Tag>
                      ))}
                    </Space>
                  </Space>
                </List.Item>
              );
            }}
          />
        )}
      </Card>

      <Card title="My One-time Purchases" loading={loading}>
        {!purchases.length ? (
          <Empty description="No one-time purchases" />
        ) : (
          <List
            dataSource={purchases}
            renderItem={(p) => (
              <List.Item
                actions={[
                  p.url ? <Button key="v" onClick={() => window.open(p.url, '_blank', 'noopener')}>View</Button> : null
                ]}
              >
                <List.Item.Meta
                  title={p.productName || 'Purchase'}
                  description={
                    <Space wrap>
                      <span>Status: <Tag color={p.payment_status === 'paid' ? 'green' : 'orange'}>{p.payment_status}</Tag></span>
                      <span>Amount: {typeof p.amount_total === 'number' ? `$${(p.amount_total/100).toFixed(2)}` : '-'}</span>
                      <span>Created: {p.created ? new Date(p.created * 1000).toLocaleString() : '-'}</span>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </Space>
  );
}

