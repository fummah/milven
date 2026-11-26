import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Table, Space, Button, Typography, Modal, Form, Select, Switch, Popconfirm, message, Grid, Radio, Tag, Spin } from 'antd';
import { PlusOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';

export function AdminSubscriptions() {
  const screens = Grid.useBreakpoint();
  const navigate = useNavigate();
  const isMobile = !screens.md;
  const [loading, setLoading] = useState(false);
  const [subs, setSubs] = useState([]);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState(null);
  const [mode, setMode] = useState('stripe');
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
      const { data } = await api.get('/api/users', { params: { role: 'STUDENT', take: 100, ...(q ? { q } : {}) } });
      setUsers(data.users || []);
    } catch (error) {
      message.error(error?.response?.data?.error || 'Could not load users');
    }
  };
  const loadProducts = async () => {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const { data } = await api.get('/api/billing/products', { params: { active: true } });
      const rows = data.products || [];
      setProducts(rows);
      const recurring = rows.filter(p => p.subscriptionEligible ?? (p.active && (p.interval === 'MONTHLY' || p.interval === 'YEARLY')));
      const manual = rows.filter(p => p.manualAccessEligible ?? (p.active && (p.courses || []).length > 0));
      if (!recurring.length && manual.length) setMode('manual');
    } catch (error) {
      setProductsError(error?.response?.data?.error || 'Could not load products');
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => { loadProducts(); loadUsers(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadSubs(); /* eslint-disable-next-line */ }, [filterUserId]);

  const recurringProducts = useMemo(
    () => (products || []).filter(p => p.subscriptionEligible ?? (p.active && (p.interval === 'MONTHLY' || p.interval === 'YEARLY'))),
    [products]
  );
  const manualProducts = useMemo(
    () => (products || []).filter(p => p.manualAccessEligible ?? (p.active && (p.courses || []).length > 0)),
    [products]
  );
  const eligibleProducts = mode === 'manual' ? manualProducts : recurringProducts;

  const productLabel = (product) => {
    const price = `USD ${((product.priceCents || 0) / 100).toFixed(2)}`;
    const interval = product.interval === 'MONTHLY' ? 'month' : product.interval === 'YEARLY' ? 'year' : 'one-time';
    const courses = (product.courses || []).map(course => course.name || course.id).filter(Boolean).join(', ');
    return `${product.name} — ${price} / ${interval}${courses ? ` — ${courses}` : ''}`;
  };

  const userLabel = (user) => {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return name ? `${name} — ${user.email}` : user.email;
  };

  const productEmptyText = productsLoading
    ? <Spin size="small" />
    : productsError
      ? 'Products could not be loaded.'
      : mode === 'manual'
        ? 'No active products with linked courses found.'
        : 'No active recurring subscription products found. Configure a recurring product under Billing → Products.';

  const onCreate = async (vals) => {
    setCreating(true);
    try {
      await api.post('/api/billing/subscriptions', {
        userId: vals.userId,
        productId: vals.productId,
        mode
      });
      message.success(mode === 'manual' ? 'Manual course access granted' : 'Subscription created');
      setOpen(false);
      form.resetFields();
      // Focus list and refresh immediately for the selected user
      setFilterUserId(vals.userId);
      try {
        const { data } = await api.get('/api/billing/subscriptions', { params: { userId: vals.userId } });
        setSubs(data.subscriptions || []);
      } catch {}
    } catch (e) {
      message.error(e?.response?.data?.error || 'Failed to create subscription');
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

  const onCancelNow = async (record) => {
    try {
      const endpoint = record._manual
        ? `/api/billing/subscriptions/local/${record._prismaId}`
        : `/api/billing/subscriptions/${record.id}`;
      await api.delete(endpoint);
      message.success('Canceled subscription');
      await loadSubs();
    } catch (error) {
      message.error(error?.response?.data?.error || 'Failed to cancel');
    }
  };

  const columns = [
    { title: 'User', render: (_, r) => r.userEmail || '-' },
    { title: 'Status', dataIndex: 'status' },
    { title: 'Product', render: (_, r) => r.productName || r.items?.data?.[0]?.price?.product?.name || '-' },
    { title: 'Interval', render: (_, r) => r.items?.data?.[0]?.price?.recurring?.interval || '-' },
    { title: 'Cancel at Period End', render: (_, r) => <Switch checked={r.cancel_at_period_end} onChange={(v) => onToggleCancelAtPeriodEnd(r.id, v)} disabled={r.status === 'canceled' || r._manual || r._fromEnrollment} /> },
    { title: 'Current Period End', render: (_, r) => { const epoch = r.currentPeriodEnd || (r.current_period_end ? r.current_period_end * 1000 : null); return epoch ? new Date(epoch).toLocaleString() : '-'; } },
    { title: 'Actions', render: (_, r) => (
      <Space>
        <Popconfirm
          title="Cancel subscription"
          description="Are you sure you want to cancel this subscription now?"
          okText="Yes, cancel"
          cancelText="No"
          onConfirm={() => onCancelNow(r)}
          disabled={r.status === 'canceled' || r._fromEnrollment}
        >
          <Button danger icon={<StopOutlined />} disabled={r.status === 'canceled' || r._fromEnrollment}>Cancel Now</Button>
        </Popconfirm>
      </Space>
    ) }
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <Typography.Title level={4} style={{ margin: 0 }}>Subscriptions</Typography.Title>
        <Space wrap>
          <Select
            allowClear
            placeholder="Filter by user"
            style={{ width: isMobile ? 260 : 260 }}
            value={filterUserId || undefined}
            onChange={setFilterUserId}
            showSearch
            onSearch={(v) => loadUsers(v)}
            optionFilterProp="label"
            options={(users || []).map(u => ({ label: userLabel(u), value: u.id }))}
          />
          <Select
            allowClear
            placeholder="Filter status"
            style={{ width: isMobile ? 200 : 200 }}
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setOpen(true); if (!products.length && !productsLoading) loadProducts(); }}>Create Subscription</Button>
        </Space>
      </div>
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
          size={isMobile ? 'small' : 'middle'}
          scroll={isMobile ? { x: 'max-content' } : undefined}
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
          <Form.Item label="Access type">
            <Radio.Group value={mode} onChange={event => { setMode(event.target.value); form.setFieldsValue({ productId: undefined }); }}>
              <Radio.Button value="stripe">Paid recurring subscription</Radio.Button>
              <Radio.Button value="manual">Manual course access (no charge)</Radio.Button>
            </Radio.Group>
          </Form.Item>
          {mode === 'manual' ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Manual access does not collect payment"
              description="Creating this record activates the subscription locally and grants access to the product's linked courses. It does not charge a payment method."
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="Paid subscriptions require Stripe"
              description="The subscription is created in an incomplete state until payment is completed through the configured Stripe flow."
            />
          )}
          {productsError && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message="Could not load products"
              description={productsError}
              action={<Button size="small" icon={<ReloadOutlined />} onClick={loadProducts}>Retry</Button>}
            />
          )}
          <Form.Item name="userId" label="Student" rules={[{ required: true }]}>
            <Select
              showSearch
              placeholder="Search by name or email"
              optionFilterProp="label"
              notFoundContent={<Typography.Text type="secondary">No students found.</Typography.Text>}
              onSearch={value => loadUsers(value)}
              options={(users || []).map(u => ({ label: userLabel(u), value: u.id }))}
            />
          </Form.Item>
          <Form.Item name="productId" label="Product" rules={[{ required: true }]}>
            <Select
              showSearch
              loading={productsLoading}
              placeholder={mode === 'manual' ? 'Select a product to grant manually' : 'Select a recurring product'}
              optionFilterProp="label"
              notFoundContent={productEmptyText}
              options={eligibleProducts.map(p => ({ label: productLabel(p), value: p.id }))}
            />
          </Form.Item>
          {!productsLoading && !productsError && eligibleProducts.length === 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={mode === 'manual' ? 'No active products with linked courses found.' : 'No active recurring subscription products found.'}
              description={mode === 'manual'
                ? 'Add linked courses to an active product under Billing → Products.'
                : 'Configure a monthly or yearly recurring product under Billing → Products, or use manual access for a one-time product.'}
              action={<Button size="small" onClick={() => navigate('/admin/products')}>Manage Products</Button>}
            />
          )}
          <Typography.Text type="secondary">
            {mode === 'manual'
              ? `Granting access does not create a payment or invoice. ${eligibleProducts.length} product(s) available.`
              : `${eligibleProducts.length} recurring product(s) available.`}
          </Typography.Text>
        </Form>
      </Modal>
    </Space>
  );
}

