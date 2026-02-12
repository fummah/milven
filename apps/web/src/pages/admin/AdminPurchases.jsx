import React, { useEffect, useState } from 'react';
import { Card, Table, Space, Typography, Select, Button, message, Modal, Form } from 'antd';
import { ReloadOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

export function AdminPurchases() {
  const [loading, setLoading] = useState(false);
  const [purchases, setPurchases] = useState([]);
  const [users, setUsers] = useState([]);
  const [filterUserId, setFilterUserId] = useState(null);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const loadUsers = async (q='') => {
    try {
      const { data } = await api.get('/api/users', { params: q ? { q } : {} });
      setUsers(data.users || []);
    } catch {}
  };
  const loadPurchases = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/billing/purchases', { params: filterUserId ? { userId: filterUserId } : {} });
      setPurchases(data.purchases || []);
    } catch (e) {
      message.error('Failed to load purchases');
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  };
  const loadProducts = async () => {
    try {
      const { data } = await api.get('/api/billing/products', { params: { active: true } });
      // Only ONE_TIME products for purchases
      setProducts((data.products || []).filter(p => p.interval === 'ONE_TIME'));
    } catch {}
  };
  useEffect(() => { loadUsers(); loadProducts(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadPurchases(); /* eslint-disable-next-line */ }, [filterUserId]);

  const onCreate = async (vals) => {
    setCreating(true);
    try {
      // Create invoice (finalized) and mark it as paid
      const invRes = await api.post('/api/billing/invoices', {
        userId: vals.userId,
        productIds: [vals.productId],
        finalize: true,
        send: false,
        adminPurchase: true
      });
      const invId = invRes?.data?.invoice?.id;
      if (invId) {
        await api.put(`/api/billing/invoices/${invId}`, { action: 'pay' });
      }
      message.success('Purchase recorded and invoice paid');
      setOpen(false);
      form.resetFields();
      setFilterUserId(vals.userId);
      await loadPurchases();
    } catch (e) {
      message.error('Failed to create purchase');
    } finally {
      setCreating(false);
    }
  };

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const openEdit = (row) => {
    setEditing(row);
    setEditOpen(true);
  };
  const submitEdit = async (vals) => {
    if (!editing) return;
    setEditSubmitting(true);
    try {
      // Only invoices can be edited; sessions are view-only
      if (String(editing.id).startsWith('in_')) {
        if (vals.dueDate) {
          await api.put(`/api/billing/invoices/${editing.id}`, { dueDate: vals.dueDate.toISOString() });
        }
      }
      message.success('Updated');
      setEditOpen(false);
      setEditing(null);
      await loadPurchases();
    } catch {
      message.error('Failed to update');
    } finally {
      setEditSubmitting(false);
    }
  };
  const onDelete = async (row) => {
    try {
      if (String(row.id).startsWith('in_')) {
        await api.delete(`/api/billing/invoices/${row.id}`);
        message.success('Deleted');
        await loadPurchases();
      } else {
        message.info('Only invoice purchases can be deleted.');
      }
    } catch {
      message.error('Delete failed (only draft invoices can be deleted).');
    }
  };

  const columns = [
    { title: 'Product', dataIndex: 'productName' },
    { title: 'User', render: (_, r) => r.userEmail || '-' },
    { title: 'Amount', render: (_, r) => r.amount_total ? `$${(r.amount_total/100).toFixed(2)}` : '-' },
    { title: 'Currency', dataIndex: 'currency' },
    { title: 'Status', dataIndex: 'payment_status' },
    { title: 'Created', render: (_, r) => r.created ? new Date(r.created * 1000).toLocaleString() : '-' },
    { title: 'Actions', render: (_, r) => (
      <Space>
        <Button size="small" onClick={() => r.url ? window.open(r.url, '_blank', 'noopener') : message.info('No link available')}>View</Button>
        <Button size="small" onClick={() => openEdit(r)} disabled={!String(r.id).startsWith('in_')}>Edit</Button>
        <Button size="small" danger onClick={() => onDelete(r)} disabled={!String(r.id).startsWith('in_')}>Delete</Button>
      </Space>
    ) }
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Purchases (One-time)</Typography.Title>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Create Purchase</Button>
          <Button icon={<ReloadOutlined />} onClick={loadPurchases}>Refresh</Button>
        </Space>
      </Space>
      <Card>
        <Table rowKey="id" loading={loading} dataSource={purchases} columns={columns} />
      </Card>
      <Modal
        title="Edit Purchase"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={editSubmitting}
      >
        <Form form={form} layout="vertical" onFinish={submitEdit}>
          <Form.Item label="User">
            <Typography.Text>{editing?.userEmail || '-'}</Typography.Text>
          </Form.Item>
          <Form.Item label="Product">
            <Typography.Text>{editing?.productName || '-'}</Typography.Text>
          </Form.Item>
          <Form.Item name="dueDate" label="Due Date (invoices only)">
            {/* We avoid importing DatePicker to keep deps minimal; accept ISO date via input for now */}
            <input type="date" onChange={(e) => {
              const v = e.target.value;
              if (v) {
                const dt = new Date(v + 'T00:00:00');
                form.setFieldsValue({ dueDate: dt });
              } else {
                form.setFieldsValue({ dueDate: null });
              }
            }} />
          </Form.Item>
          {!String(editing?.id || '').startsWith('in_') && (
            <Typography.Paragraph type="secondary">
              Only invoice purchases can be edited or deleted.
            </Typography.Paragraph>
          )}
        </Form>
      </Modal>
      <Modal
        title="Create One-time Purchase"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={creating}
      >
        <Form form={form} layout="vertical" onFinish={onCreate}>
          <Form.Item name="userId" label="User" rules={[{ required: true }]}>
            <Select showSearch placeholder="Select user" options={(users || []).map(u => ({ label: `${u.email}${u.firstName ? ' - ' + u.firstName : ''}`, value: u.id }))} />
          </Form.Item>
          <Form.Item name="productId" label="Product (ONE_TIME)" rules={[{ required: true }]}>
            <Select placeholder="Select product" options={(products || []).map(p => ({ label: `${p.name} - $${(p.priceCents/100).toFixed(2)}`, value: p.id }))} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

