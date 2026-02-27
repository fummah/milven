import React, { useEffect, useState } from 'react';
import { Table, Typography, Input, Space, Button, Modal, Form, Select, InputNumber, Switch, message, Drawer, Radio, Tooltip, Grid, Card, Tag } from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined, DeleteOutlined, FilterOutlined, BookOutlined, SearchOutlined, DollarOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';

export function AdminCourses() {
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [level, setLevel] = useState();
  const [onlyActive, setOnlyActive] = useState(undefined); // undefined = all
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [productMode, setProductMode] = useState('none'); // 'none' | 'create' | 'link'
  const [products, setProducts] = useState([]);
  const [linkProductIds, setLinkProductIds] = useState([]);
  const [createProductPrice, setCreateProductPrice] = useState();
  const [createProductInterval, setCreateProductInterval] = useState('ONE_TIME');
  const [createProductActive, setCreateProductActive] = useState(true);
  const [levelsList, setLevelsList] = useState([]);

  const fetchProducts = async () => {
    try {
      const res = await api.get('/api/billing/products', { params: { active: true } });
      setProducts(res.data.products || []);
    } catch {
      // ignore
    }
  };

  const fetchCourses = async (params = {}) => {
    setLoading(true);
    try {
      const res = await api.get('/api/cms/courses', {
        params: {
          q: q || undefined,
          level: level || undefined,
          active: typeof onlyActive !== 'undefined' ? String(!!onlyActive) : undefined
        }
      });
      setData(res.data?.courses ?? []);
      setTotal(res.data?.total ?? (Array.isArray(res.data?.courses) ? res.data.courses.length : 0));
    } catch (e) {
      message.error('Failed to load courses. Please ensure you are logged in as admin.');
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const fetchLevels = async () => {
    try {
      const res = await api.get('/api/cms/levels');
      const allowed = new Set(['NONE', 'LEVEL1', 'LEVEL2', 'LEVEL3']);
      const items = (res.data?.levels ?? [])
        .filter(l => l.active !== false && allowed.has(l.code))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(l => ({ value: l.code, label: l.name }));
      setLevelsList(items);
    } catch {
      // Fallback to basic defaults
      setLevelsList([
        { value: 'NONE', label: 'None' },
        { value: 'LEVEL1', label: 'Level I' },
        { value: 'LEVEL2', label: 'Level II' },
        { value: 'LEVEL3', label: 'Level III' }
      ]);
    }
  };

  useEffect(() => { fetchCourses(); fetchProducts(); fetchLevels(); /* eslint-disable-next-line */ }, []);

  const columns = [
    { 
      title: 'Course', 
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="icon-badge-sm icon-badge-purple">
            <BookOutlined style={{ fontSize: 14 }} />
          </div>
          <div>
            <Typography.Text strong style={{ display: 'block', color: '#1e293b' }}>
              {record.name}
            </Typography.Text>
            {record.description && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {record.description?.substring(0, 50)}{record.description?.length > 50 ? '...' : ''}
              </Typography.Text>
            )}
          </div>
        </div>
      )
    },
    { title: 'Level', dataIndex: 'level', render: (v) => {
      const found = levelsList.find(l => l.value === v);
      const label = found ? found.label : (v === 'NONE' ? 'None' : v === 'LEVEL1' ? 'Level I' : v === 'LEVEL2' ? 'Level II' : v === 'LEVEL3' ? 'Level III' : v ?? '-');
      const colorMap = { 'LEVEL1': 'blue', 'LEVEL2': 'purple', 'LEVEL3': 'gold', 'NONE': 'default' };
      return <Tag color={colorMap[v] || 'default'}>{label}</Tag>;
    }},
    { title: 'Duration', dataIndex: 'durationHours', render: (v) => v ? `${v} hrs` : '—' },
    {
      title: 'Price',
      key: 'price',
      render: (_, rec) => {
        const products = rec?.products || (rec?.courseProducts ? (rec.courseProducts || []).map(cp => cp.product) : []);
        if (!products || products.length === 0) return <Tag>No pricing</Tag>;
        if (products.length === 1) {
          const p = products[0] || {};
          const cents = typeof p.priceCents === "number" ? p.priceCents : 0;
          const dollars = (cents / 100).toFixed(2);
          const suffix = p.interval === 'MONTHLY' ? '/mo' : (p.interval === 'YEARLY' ? '/yr' : '');
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <DollarOutlined style={{ color: '#22c55e' }} />
              <Typography.Text strong style={{ color: '#22c55e' }}>${dollars}{suffix}</Typography.Text>
            </div>
          );
        }
        const amounts = products.map(p => (typeof p.priceCents === "number" ? p.priceCents : 0));
        const min = Math.min(...amounts);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <DollarOutlined style={{ color: '#22c55e' }} />
            <Typography.Text style={{ color: '#22c55e' }}>from ${(min / 100).toFixed(2)}</Typography.Text>
          </div>
        );
      }
    },
    { title: 'Status', dataIndex: 'active', render: (v) => (
      v ? (
        <Tag icon={<CheckCircleOutlined />} color="success">Active</Tag>
      ) : (
        <Tag icon={<CloseCircleOutlined />} color="default">Inactive</Tag>
      )
    )},
    {
      title: 'Actions',
      width: 140,
      render: (_, record) => (
        <Space size={8}>
          <Tooltip title="View Details">
            <button
              className="action-btn action-btn-view"
              onClick={() => navigate(`/admin/courses/${record.id}`)}
            >
              <EyeOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Edit">
            <button
              className="action-btn action-btn-edit"
              onClick={() => { setEditing(record); form.setFieldsValue(record); setOpen(true); }}
            >
              <EditOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Delete">
            <button
              className="action-btn action-btn-delete"
              onClick={() => removeCourse(record)}
            >
              <DeleteOutlined />
            </button>
          </Tooltip>
        </Space>
      )
    }
  ];

  const removeCourse = async (record) => {
    try {
      await api.delete(`/api/cms/courses/${record.id}`);
      message.success('Course deleted');
      fetchCourses();
    } catch {
      message.error('Delete failed');
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <Typography.Title level={2} className="page-header-title">
            Courses
          </Typography.Title>
          <div className="page-header-subtitle">
            Create and manage your course catalog
          </div>
        </div>
        <Button 
          type="primary" 
          size="large"
          icon={<PlusOutlined />} 
          onClick={() => {
            setEditing(null);
            form.resetFields();
            const none = levelsList.find(l => l.value === 'NONE');
            form.setFieldsValue({ active: true, level: none ? 'NONE' : undefined });
            setOpen(true);
          }}
          style={{ 
            background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            border: 'none',
            borderRadius: 12,
            height: 44,
            paddingInline: 24,
            fontWeight: 600
          }}
        >
          Create Course
        </Button>
      </div>

      {/* Filters Card */}
      <Card 
        className="modern-card" 
        style={{ marginBottom: 24 }}
        styles={{ body: { padding: '16px 24px' } }}
      >
        <Space wrap size={12} style={{ width: '100%' }}>
          <Input
            placeholder="Search courses..."
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            allowClear
            value={q}
            onChange={e => setQ(e.target.value)}
            onPressEnter={() => fetchCourses()}
            style={{ width: 260, borderRadius: 10 }}
          />
          <Select 
            placeholder="Filter by level" 
            allowClear 
            style={{ width: 160 }} 
            value={level} 
            onChange={setLevel}
            options={levelsList}
          />
          <Select 
            placeholder="Status" 
            allowClear 
            style={{ width: 140 }} 
            value={onlyActive}
            onChange={setOnlyActive}
            options={[{ value: true, label: 'Active' }, { value: false, label: 'Inactive' }]}
          />
          <Button 
            icon={<FilterOutlined />} 
            onClick={() => fetchCourses()}
            style={{ borderRadius: 10 }}
          >
            Apply Filters
          </Button>
        </Space>
      </Card>

      {/* Data Table */}
      <Card className="modern-card" styles={{ body: { padding: 0 } }}>
        <div className="modern-table">
          <Table
            rowKey="id"
            loading={loading}
            dataSource={data}
            columns={columns}
            size={isMobile ? 'small' : 'middle'}
            scroll={isMobile ? { x: 'max-content' } : undefined}
            pagination={{ 
              total, 
              pageSize: 20, 
              onChange: () => {},
              style: { padding: '16px 24px', margin: 0 }
            }}
          />
        </div>
      </Card>

      <Drawer 
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className={`icon-badge-sm ${editing ? 'icon-badge-orange' : 'icon-badge-purple'}`}>
              {editing ? <EditOutlined /> : <BookOutlined />}
            </div>
            <span>{editing ? 'Edit Course' : 'Create New Course'}</span>
          </div>
        }
        open={open} 
        onClose={() => setOpen(false)} 
        width={800}
        className="modern-drawer"
        extra={
          <Button 
            type="primary" 
            loading={submitting} 
            onClick={() => form.submit()}
            style={{ borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', border: 'none' }}
          >
            {editing ? 'Save Changes' : 'Create Course'}
          </Button>
        }>
        <Form form={form} layout="vertical" onFinish={async (values) => {
          try {
            setSubmitting(true);
            const payload = {
              name: values.name,
              description: values.description,
              level: values.level,
              durationHours: typeof values.durationHours === 'number' ? values.durationHours : undefined,
              active: typeof values.active === 'boolean' ? values.active : undefined
            };
            if (editing) {
              await api.put(`/api/cms/courses/${editing.id}`, payload);
              message.success('Course updated');
            } else {
              // create course, optionally create/link product(s)
              if (productMode === 'create') {
                const levelLabel =
                  (levelsList.find(l => l.value === values.level)?.label) ||
                  (values.level === 'LEVEL1' ? 'Level I' :
                   values.level === 'LEVEL2' ? 'Level II' :
                   values.level === 'LEVEL3' ? 'Level III' :
                   values.level === 'NONE' ? 'None' : values.level);
                const body = {
                  ...payload,
                  createProduct: true,
                  productName: `${values.name} - ${levelLabel}`,
                  productDescription: values.description,
                  productPriceCents: Math.round((createProductPrice || 0) * 100),
                  productInterval: createProductInterval,
                  productActive: createProductActive
                };
                await api.post('/api/cms/courses', body);
                message.success('Course and product created');
              } else {
                const { data: created } = await api.post('/api/cms/courses', payload);
                const courseId = created?.course?.id;
                if (productMode === 'link' && Array.isArray(linkProductIds) && linkProductIds.length > 0 && courseId) {
                  // fetch products to get current links, then update
                  const { data: list } = await api.get('/api/billing/products');
                  const mapById = new Map((list.products || []).map(p => [p.id, p]));
                  for (const pid of linkProductIds) {
                    const prod = mapById.get(pid);
                    const existingIds = (prod?.courses || []).map(c => c.id);
                    const nextIds = Array.from(new Set([...existingIds, courseId]));
                    await api.put(`/api/billing/products/${pid}`, { courseIds: nextIds });
                  }
                  message.success('Course created and linked to product(s)');
                } else {
                  message.success('Course created');
                }
              }
            }
            setOpen(false);
            setEditing(null);
            fetchCourses();
          } catch {
            message.error('Save failed');
          } finally {
            setSubmitting(false);
          }
        }}>
          <Form.Item name="name" label="Course Name" rules={[{ required: true }]}>
            <Input placeholder="e.g., Corporate Finance Essentials" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={4} placeholder="Short description" />
          </Form.Item>
          <Form.Item name="level" label="Level" rules={[{ required: true }]}>
            <Select options={levelsList} />
          </Form.Item>
          <Form.Item name="durationHours" label="Duration (hours)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          {!editing && (
            <>
              <Typography.Title level={5} style={{ marginTop: 16 }}>Product (Billing)</Typography.Title>
              <Form.Item label="Product Option" style={{ marginBottom: 8 }}>
                <Radio.Group value={productMode} onChange={(e) => setProductMode(e.target.value)}>
                  <Radio.Button value="none">No product (unallocated)</Radio.Button>
                  <Radio.Button value="create">Create product (auto‑named)</Radio.Button>
                  <Radio.Button value="link">Link to existing product(s)</Radio.Button>
                </Radio.Group>
              </Form.Item>
              {productMode === 'create' && (
                <Space size="large" wrap>
                  <Form.Item label="Price (USD)">
                    <InputNumber min={0} value={createProductPrice} onChange={setCreateProductPrice} />
                  </Form.Item>
                  <Form.Item label="Interval">
                    <Select
                      style={{ minWidth: 140 }}
                      value={createProductInterval}
                      onChange={setCreateProductInterval}
                      options={[
                        { value: 'ONE_TIME', label: 'One‑time' },
                        { value: 'MONTHLY', label: 'Monthly' },
                        { value: 'YEARLY', label: 'Yearly' }
                      ]}
                    />
                  </Form.Item>
                  <Form.Item label="Active">
                    <Switch checked={createProductActive} onChange={setCreateProductActive} />
                  </Form.Item>
                </Space>
              )}
              {productMode === 'link' && (
                <Form.Item label="Select Product(s) to link">
                  <Select
                    mode="multiple"
                    value={linkProductIds}
                    onChange={setLinkProductIds}
                    options={(products || []).map(p => ({ value: p.id, label: `${p.name} – $${(p.priceCents/100).toFixed(2)} ${p.interval === 'MONTHLY' ? '/mo' : p.interval === 'YEARLY' ? '/yr' : ''}` }))}
                    placeholder="Choose one or more products"
                  />
                </Form.Item>
              )}
            </>
          )}
          <Form.Item name="active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>

      {/* View moved to dedicated page */}
    </div>
  );
}

