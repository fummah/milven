import React, { useEffect, useState } from 'react';
import { Table, Typography, Input, Space, Button, Form, Select, InputNumber, Switch, message, Drawer, Descriptions, Tag, Grid, Card, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined, DeleteOutlined, DollarOutlined, BookOutlined, SearchOutlined, FilterOutlined, ShoppingOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

export function AdminProducts() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [onlyActive, setOnlyActive] = useState(undefined);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [courses, setCourses] = useState([]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/billing/products', { params: { q, ...(typeof onlyActive === 'boolean' ? { active: onlyActive } : {}) } });
      setData(res.data.products || []);
      setTotal((res.data.products || []).length);
    } finally {
      setLoading(false);
    }
  };

  const fetchCourses = async () => {
    try {
      const res = await api.get('/api/cms/courses', { params: { active: true } });
      setCourses((res.data.courses || []).map(c => ({ value: c.id, label: `${c.name} (${c.level})` })));
    } catch {}
  };

  useEffect(() => { fetchProducts(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { fetchCourses(); /* eslint-disable-next-line */ }, []);

  const columns = [
    { 
      title: 'Product', 
      dataIndex: 'name',
      render: (name, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="icon-badge-sm icon-badge-green">
            <ShoppingOutlined style={{ fontSize: 14 }} />
          </div>
          <div>
            <Typography.Text strong style={{ display: 'block', color: '#1e293b' }}>
              {name}
            </Typography.Text>
            {record.description && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {record.description?.substring(0, 40)}{record.description?.length > 40 ? '...' : ''}
              </Typography.Text>
            )}
          </div>
        </div>
      )
    },
    { 
      title: 'Price', 
      dataIndex: 'priceCents', 
      render: (v, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <DollarOutlined style={{ color: '#22c55e' }} />
          <Typography.Text strong style={{ color: '#22c55e' }}>
            ${((v || 0)/100).toFixed(2)}{r.interval === 'MONTHLY' ? '/mo' : r.interval === 'YEARLY' ? '/yr' : ''}
          </Typography.Text>
        </div>
      )
    },
    { 
      title: 'Interval', 
      dataIndex: 'interval',
      render: (v) => {
        const colorMap = { ONE_TIME: 'blue', MONTHLY: 'green', YEARLY: 'purple' };
        const labelMap = { ONE_TIME: 'One-time', MONTHLY: 'Monthly', YEARLY: 'Yearly' };
        return <Tag color={colorMap[v] || 'default'}>{labelMap[v] || v}</Tag>;
      }
    },
    { 
      title: 'Status', 
      dataIndex: 'active', 
      render: v => v ? (
        <Tag icon={<CheckCircleOutlined />} color="success">Active</Tag>
      ) : (
        <Tag icon={<CloseCircleOutlined />} color="default">Inactive</Tag>
      )
    },
    { 
      title: 'Courses', 
      dataIndex: 'courses', 
      render: (arr) => (
        (arr || []).length > 0 ? (
          <Space wrap size={4}>
            {(arr || []).slice(0, 2).map(c => (
              <Tag key={c.id} icon={<BookOutlined />} color="blue">{c.name}</Tag>
            ))}
            {(arr || []).length > 2 && (
              <Tag>+{arr.length - 2} more</Tag>
            )}
          </Space>
        ) : <Tag>No courses</Tag>
      )
    },
    {
      title: 'Actions',
      width: 140,
      render: (_, record) => (
        <Space size={8}>
          <Tooltip title="View Details">
            <button className="action-btn action-btn-view" onClick={() => setViewing(record)}>
              <EyeOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Edit">
            <button 
              className="action-btn action-btn-edit" 
              onClick={() => { 
                setEditing(record); 
                form.setFieldsValue({
                  name: record.name,
                  description: record.description,
                  price: (record.priceCents || 0)/100,
                  interval: record.interval,
                  active: record.active,
                  courseIds: (record.courses || []).map(c => c.id)
                }); 
                setOpen(true); 
              }}
            >
              <EditOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Delete">
            <button className="action-btn action-btn-delete" onClick={() => removeProduct(record)}>
              <DeleteOutlined />
            </button>
          </Tooltip>
        </Space>
      )
    }
  ];

  const removeProduct = async (record) => {
    try {
      await api.delete(`/api/billing/products/${record.id}`);
      message.success('Product deleted');
      fetchProducts();
    } catch {
      message.error('Delete failed');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <Typography.Title level={3} className="page-header-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-badge icon-badge-green">
              <ShoppingOutlined style={{ fontSize: 20 }} />
            </div>
            Products
          </Typography.Title>
          <Typography.Text type="secondary" className="page-header-subtitle">
            Manage subscription plans and one-time purchases
          </Typography.Text>
        </div>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ interval: 'ONE_TIME', active: true }); setOpen(true); }}
          style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', border: 'none', borderRadius: 10, height: 40, fontWeight: 500 }}
        >
          New Product
        </Button>
      </div>

      <Card className="modern-card" style={{ marginBottom: 20 }}>
        <Space wrap size={12}>
          <Input
            placeholder="Search products..." 
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            allowClear 
            value={q} 
            onChange={e => setQ(e.target.value)} 
            onPressEnter={fetchProducts}
            style={{ width: isMobile ? '100%' : 280, borderRadius: 10 }} 
          />
          <Select 
            placeholder="Filter by status" 
            allowClear 
            style={{ width: isMobile ? '100%' : 160, borderRadius: 10 }} 
            value={onlyActive} 
            onChange={setOnlyActive}
            options={[{ value: true, label: 'Active' }, { value: false, label: 'Inactive' }]}
          />
          <Button 
            icon={<FilterOutlined />} 
            onClick={fetchProducts}
            style={{ borderRadius: 10 }}
          >
            Filter
          </Button>
        </Space>
      </Card>

      <Card className="modern-card">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={data}
          columns={columns}
          className="modern-table"
          size={isMobile ? 'small' : 'middle'}
          scroll={isMobile ? { x: 'max-content' } : undefined}
          pagination={{ total, pageSize: 20, showSizeChanger: false, showTotal: (total) => `${total} products` }}
        />
      </Card>

      <Drawer 
        title={editing ? 'Edit Product' : 'New Product'} 
        open={open} 
        onClose={() => setOpen(false)} 
        width={800}
        className="modern-drawer"
        extra={
          <Button 
            type="primary" 
            loading={submitting} 
            onClick={() => form.submit()}
            style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', border: 'none', borderRadius: 8 }}
          >
            {editing ? 'Save Changes' : 'Create Product'}
          </Button>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            try {
              setSubmitting(true);
              const payload = {
                name: values.name,
                description: values.description,
                priceCents: Math.round((values.price || 0) * 100),
                interval: values.interval,
                active: !!values.active,
                courseIds: values.courseIds || []
              };
              if (editing) {
                await api.put(`/api/billing/products/${editing.id}`, payload);
                message.success('Product updated');
              } else {
                await api.post('/api/billing/products', payload);
                message.success('Product created');
              }
              setOpen(false);
              setEditing(null);
              fetchProducts();
            } catch {
              message.error('Save failed');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <Form.Item name="name" label="Product Name" rules={[{ required: true }]}>
            <Input placeholder="e.g., CFA Level I Monthly Subscription" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="Optional description" />
          </Form.Item>
          <Space size="large" wrap>
            <Form.Item name="price" label="Price (USD)" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="interval" label="Interval" rules={[{ required: true }]}>
              <Select style={{ width: 180 }} options={[
                { value: 'ONE_TIME', label: 'One‑time' },
                { value: 'MONTHLY', label: 'Monthly' },
                { value: 'YEARLY', label: 'Yearly' }
              ]} />
            </Form.Item>
            <Form.Item name="active" label="Active" valuePropName="checked" initialValue>
              <Switch />
            </Form.Item>
          </Space>
          <Form.Item name="courseIds" label="Linked Courses">
            <Select mode="multiple" options={courses} placeholder="Select one or more courses" />
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer
        title="Product Details"
        open={!!viewing}
        onClose={() => setViewing(null)}
        width={520}
        className="modern-drawer"
        extra={viewing && (
          <Button 
            type="primary" 
            icon={<EditOutlined />} 
            onClick={() => { 
              setViewing(null); 
              setEditing(viewing); 
              form.setFieldsValue({
                name: viewing.name,
                description: viewing.description,
                price: (viewing.priceCents || 0) / 100,
                interval: viewing.interval,
                active: viewing.active,
                courseIds: (viewing.courses || []).map(c => c.id)
              }); 
              setOpen(true); 
            }}
            style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', border: 'none', borderRadius: 8 }}
          >
            Edit
          </Button>
        )}
      >
        {viewing && (
          <div style={{ paddingTop: 8 }}>
            <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>{viewing.name}</Typography.Title>
            {viewing.description && (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>{viewing.description}</Typography.Paragraph>
            )}
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label={<span><DollarOutlined style={{ marginRight: 6 }} />Price</span>}>
                <Typography.Text strong>
                  ${((viewing.priceCents || 0) / 100).toFixed(2)}
                  {viewing.interval === 'MONTHLY' && ' / month'}
                  {viewing.interval === 'YEARLY' && ' / year'}
                  {viewing.interval === 'ONE_TIME' && ' one-time'}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Interval">
                <Tag color={viewing.interval === 'ONE_TIME' ? 'blue' : viewing.interval === 'MONTHLY' ? 'green' : 'purple'}>
                  {viewing.interval === 'ONE_TIME' ? 'One-time' : viewing.interval === 'MONTHLY' ? 'Monthly' : viewing.interval === 'YEARLY' ? 'Yearly' : viewing.interval}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={viewing.active ? 'success' : 'default'}>{viewing.active ? 'Active' : 'Inactive'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={<span><BookOutlined style={{ marginRight: 6 }} />Linked Courses</span>}>
                {(viewing.courses && viewing.courses.length)
                  ? (
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        {viewing.courses.map(c => (
                          <div key={c.id}>
                            <Typography.Text>{typeof c === 'object' && c !== null ? (c.name || c.label || c.id) : String(c)}</Typography.Text>
                            {typeof c === 'object' && c !== null && c.level && (
                              <Tag style={{ marginLeft: 8 }}>{c.level}</Tag>
                            )}
                          </div>
                        ))}
                      </Space>
                    )
                  : <Typography.Text type="secondary">No courses linked</Typography.Text>}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Drawer>
    </div>
  );
}

