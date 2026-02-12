import React, { useEffect, useState } from 'react';
import { Table, Typography, Input, Space, Button, Form, Select, InputNumber, Switch, message, Drawer, Descriptions, Tag } from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined, DeleteOutlined, DollarOutlined, BookOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

export function AdminProducts() {
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
    { title: 'Name', dataIndex: 'name' },
    { title: 'Price', dataIndex: 'priceCents', render: (v, r) => `$${((v || 0)/100).toFixed(2)} ${r.interval === 'MONTHLY' ? '/mo' : r.interval === 'YEARLY' ? '/yr' : ''}` },
    { title: 'Interval', dataIndex: 'interval' },
    { title: 'Active', dataIndex: 'active', render: v => v ? 'Yes' : 'No' },
    { title: 'Courses', dataIndex: 'courses', render: (arr) => (arr || []).map(c => c.name).join(', ') || '—' },
    {
      title: 'Actions',
      render: (_, record) => (
        <Space>
          <Button icon={<EyeOutlined />} size="small" onClick={() => setViewing(record)}>View</Button>
          <Button icon={<EditOutlined />} size="small" onClick={() => { setEditing(record); form.setFieldsValue({
            name: record.name,
            description: record.description,
            price: (record.priceCents || 0)/100,
            interval: record.interval,
            active: record.active,
            courseIds: (record.courses || []).map(c => c.id)
          }); setOpen(true); }}>Edit</Button>
          <Button icon={<DeleteOutlined />} size="small" danger onClick={() => removeProduct(record)}>Delete</Button>
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
      <div className="flex items-center justify-between mb-3">
        <Typography.Title level={4} style={{ margin: 0 }}>Products</Typography.Title>
        <Space>
          <Input.Search placeholder="Search name/description" allowClear onSearch={fetchProducts} value={q} onChange={e => setQ(e.target.value)} />
          <Select placeholder="Active" allowClear style={{ width: 140 }} value={onlyActive} onChange={setOnlyActive}
            options={[{ value: true, label: 'Active' }, { value: false, label: 'Inactive' }]}
          />
          <Button onClick={fetchProducts}>Filter</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ interval: 'ONE_TIME', active: true }); setOpen(true); }}>New Product</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={columns}
        pagination={{ total, pageSize: 20 }}
      />

      <Drawer title={editing ? 'Edit Product' : 'New Product'} open={open} onClose={() => setOpen(false)} width={800}
              extra={<Button type="primary" loading={submitting} onClick={() => form.submit()}>{editing ? 'Save' : 'Create'}</Button>}>
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
        extra={viewing && (
          <Button type="primary" icon={<EditOutlined />} onClick={() => { setViewing(null); setEditing(viewing); form.setFieldsValue({
            name: viewing.name,
            description: viewing.description,
            price: (viewing.priceCents || 0) / 100,
            interval: viewing.interval,
            active: viewing.active,
            courseIds: (viewing.courses || []).map(c => c.id)
          }); setOpen(true); }}>Edit</Button>
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

