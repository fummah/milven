import React, { useEffect, useState } from 'react';
import { Card, Table, Space, Button, Typography, Modal, Form, Select, Switch, Popconfirm, message } from 'antd';
import { PlusOutlined, StopOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

export function AdminSubscriptions() {
  const [loading, setLoading] = useState(false);
  const [subs, setSubs] = useState([]);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [filterUserId, setFilterUserId] = useState(null);
  const [filterStatus, setFilterStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const loadSubs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/billing/subscriptions', { params: filterUserId ? { userId: filterUserId } : {} });
      setSubs(data.subscriptions || []);
    } catch {
      setSubs([]);
    } finally {
      setLoading(false);
    }
  };
  const loadUsers = async (q='') => {
    try {
      const { data } = await api.get('/api/users', { params: q ? { q } : {} });
      setUsers(data.users || []);
    } catch {}
  };
  const loadProducts = async () => {
    try {
      const { data } = await api.get('/api/billing/products', { params: { active: true } });
      // only recurring plans for subscriptions
      setProducts((data.products || []).filter(p => p.interval === 'MONTHLY' || p.interval === 'YEARLY'));
    } catch {}
  };

  useEffect(() => { loadProducts(); loadUsers(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadSubs(); /* eslint-disable-next-line */ }, [filterUserId]);

  const onCreate = async (vals) => {
    setCreating(true);
    try {
      await api.post('/api/billing/subscriptions', {
        userId: vals.userId,
        productId: vals.productId
      });
      message.success('Subscription created');
      setOpen(false);
      form.resetFields();
      // Focus list and refresh immediately for the selected user
      setFilterUserId(vals.userId);
      try {
        const { data } = await api.get('/api/billing/subscriptions', { params: { userId: vals.userId } });
        setSubs(data.subscriptions || []);
      } catch {}
    } catch (e) {
      message.error('Failed to create subscription');
    } finally {
      setCreating(false);
    }
  };

  const onToggleCancelAtPeriodEnd = async (id, value) => {
    try {
      await api.put(`/api/billing/subscriptions/${id}`, { cancelAtPeriodEnd: value });
      message.success('Updated');
      await loadSubs();
    } catch {
      message.error('Failed to update subscription');
    }
  };

  const onCancelNow = async (id) => {
    try {
      await api.delete(`/api/billing/subscriptions/${id}`);
      message.success('Canceled subscription');
      await loadSubs();
    } catch {
      message.error('Failed to cancel');
    }
  };

  const columns = [
    { title: 'User', render: (_, r) => r.userEmail || '-' },
    { title: 'Status', dataIndex: 'status' },
    { title: 'Product', render: (_, r) => r.productName || r.items?.data?.[0]?.price?.product?.name || '-' },
    { title: 'Interval', render: (_, r) => r.items?.data?.[0]?.price?.recurring?.interval || '-' },
    { title: 'Cancel at Period End', render: (_, r) => <Switch checked={r.cancel_at_period_end} onChange={(v) => onToggleCancelAtPeriodEnd(r.id, v)} disabled={r.status === 'canceled'} /> },
    { title: 'Current Period End', render: (_, r) => r.current_period_end ? new Date(r.current_period_end * 1000).toLocaleString() : '-' },
    { title: 'Actions', render: (_, r) => (
      <Space>
        <Popconfirm
          title="Cancel subscription"
          description="Are you sure you want to cancel this subscription now?"
          okText="Yes, cancel"
          cancelText="No"
          onConfirm={() => onCancelNow(r.id)}
          disabled={r.status === 'canceled'}
        >
          <Button danger icon={<StopOutlined />} disabled={r.status === 'canceled'}>Cancel Now</Button>
        </Popconfirm>
      </Space>
    ) }
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Subscriptions</Typography.Title>
        <Space>
          <Select
            allowClear
            placeholder="Filter by user"
            style={{ width: 260 }}
            value={filterUserId || undefined}
            onChange={setFilterUserId}
            showSearch
            onSearch={(v) => loadUsers(v)}
            optionFilterProp="label"
            options={(users || []).map(u => ({ label: `${u.email}${u.firstName ? ' - ' + u.firstName : ''}`, value: u.id }))}
          />
          <Select
            allowClear
            placeholder="Filter status"
            style={{ width: 200 }}
            value={filterStatus || undefined}
            onChange={setFilterStatus}
            options={[
              { label: 'Active', value: 'active' },
              { label: 'Trialing', value: 'trialing' },
              { label: 'Past Due', value: 'past_due' },
              { label: 'Unpaid', value: 'unpaid' },
              { label: 'Incomplete', value: 'incomplete' },
              { label: 'Incomplete Expired', value: 'incomplete_expired' },
              { label: 'Canceled', value: 'canceled' }
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Create Subscription</Button>
        </Space>
      </Space>
      <Card>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={
            (filterStatus
              ? subs.filter(s => (s.status || '').toLowerCase() === filterStatus)
              : subs)
          }
          columns={columns}
        />
      </Card>
      <Modal
        title="Create Subscription"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={creating}
      >
        <Form form={form} layout="vertical" onFinish={onCreate}>
          <Form.Item name="userId" label="User" rules={[{ required: true }]}>
            <Select showSearch placeholder="Select user" options={(users || []).map(u => ({ label: `${u.email}${u.firstName ? ' - ' + u.firstName : ''}`, value: u.id }))} />
          </Form.Item>
          <Form.Item name="productId" label="Product" rules={[{ required: true }]}>
            <Select placeholder="Select product" options={(products || []).map(p => ({ label: `${p.name} (${p.interval}) - $${(p.priceCents/100).toFixed(2)}`, value: p.id }))} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

