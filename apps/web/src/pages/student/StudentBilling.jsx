import React, { useEffect, useMemo, useState } from 'react';
import { Card, List, Space, Typography, Tag, Button, Empty } from 'antd';
import { CreditCardOutlined, ShoppingCartOutlined, CheckCircleOutlined, BookOutlined, CalendarOutlined, DollarOutlined, EyeOutlined } from '@ant-design/icons';
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
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <Typography.Title level={2} className="page-header-title">
            Billing
          </Typography.Title>
          <div className="page-header-subtitle">
            Manage your subscriptions and view purchase history
          </div>
        </div>
      </div>

      <Card 
        className="modern-card"
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-badge-sm icon-badge-green">
              <CreditCardOutlined />
            </div>
            <span style={{ fontWeight: 600 }}>My Subscriptions</span>
          </div>
        }
        loading={loading}
      >
        {!subs.length ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <CreditCardOutlined />
            </div>
            <Typography.Text type="secondary">No subscriptions</Typography.Text>
          </div>
        ) : (
          <div style={{ padding: '8px 0' }}>
            {subsSorted.map((s) => {
              const isActive = s.status === 'active' || s.status === 'ACTIVE';
              return (
                <div
                  key={s.id}
                  className="modern-list-item"
                  style={{
                    margin: '8px 0',
                    ...(isActive && {
                      background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.05), rgba(22, 163, 74, 0.05))',
                      borderLeft: '4px solid #22c55e',
                    })
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <div className={`icon-badge-sm ${isActive ? 'icon-badge-green' : 'icon-badge-orange'}`}>
                        {isActive ? <CheckCircleOutlined style={{ fontSize: 16 }} /> : <CreditCardOutlined style={{ fontSize: 16 }} />}
                      </div>
                      <div>
                        <Typography.Text strong style={{ fontSize: 15, color: '#1e293b', display: 'block' }}>
                          {s.productName || 'Subscription'}
                        </Typography.Text>
                        <Space size={8} wrap style={{ marginTop: 6 }}>
                          <Tag color={isActive ? 'success' : s.status === 'canceled' || s.status === 'CANCELED' ? 'default' : 'warning'}>
                            {s.status}
                          </Tag>
                          {s.items?.data?.[0]?.price?.recurring?.interval && (
                            <Tag>{s.items.data[0].price.recurring.interval}</Tag>
                          )}
                        </Space>
                      </div>
                    </div>
                    <Space wrap>
                      {(s.courses || []).map(c => (
                        <Tag key={c.id} color="blue" icon={<BookOutlined />}>{c.name}</Tag>
                      ))}
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
            <div className="icon-badge-sm icon-badge-purple">
              <ShoppingCartOutlined />
            </div>
            <span style={{ fontWeight: 600 }}>One-time Purchases</span>
          </div>
        }
        loading={loading}
      >
        {!purchases.length ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <ShoppingCartOutlined />
            </div>
            <Typography.Text type="secondary">No one-time purchases</Typography.Text>
          </div>
        ) : (
          <div style={{ padding: '8px 0' }}>
            {purchases.map((p) => (
              <div key={p.id || p.created} className="modern-list-item" style={{ margin: '8px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    <div className={`icon-badge-sm ${p.payment_status === 'paid' ? 'icon-badge-green' : 'icon-badge-orange'}`}>
                      <DollarOutlined style={{ fontSize: 16 }} />
                    </div>
                    <div>
                      <Typography.Text strong style={{ fontSize: 15, color: '#1e293b', display: 'block' }}>
                        {p.productName || 'Purchase'}
                      </Typography.Text>
                      <Space size={8} wrap style={{ marginTop: 6 }}>
                        <Tag color={p.payment_status === 'paid' ? 'success' : 'warning'}>
                          {p.payment_status}
                        </Tag>
                        {typeof p.amount_total === 'number' && (
                          <Tag icon={<DollarOutlined />} color="blue">
                            ${(p.amount_total/100).toFixed(2)}
                          </Tag>
                        )}
                        {p.created && (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            <CalendarOutlined style={{ marginRight: 4 }} />
                            {new Date(p.created * 1000).toLocaleDateString()}
                          </Typography.Text>
                        )}
                      </Space>
                    </div>
                  </div>
                  {p.url && (
                    <Button 
                      icon={<EyeOutlined />}
                      onClick={() => window.open(p.url, '_blank', 'noopener')}
                      style={{ borderRadius: 10 }}
                    >
                      View
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Space>
  );
}

