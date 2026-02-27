import React, { useEffect, useState } from 'react';
import { Table, Typography, Input, Space, Button, Modal, Form, Select, message, Drawer, Row, Col, Popconfirm, Tooltip, Grid, Card, Tag } from 'antd';
import { countriesOptions } from '../../constants/countries';
import { PlusOutlined, EyeOutlined, EditOutlined, DeleteOutlined, FilterOutlined, TeamOutlined, SearchOutlined, UserAddOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { useEffect as useReactEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export function AdminStudents() {
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [level, setLevel] = useState();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [creating, setCreating] = useState(false);

  const fetchUsers = async (params = {}) => {
    setLoading(true);
    try {
      const url = new URL(`${API_URL}/api/users`);
      url.searchParams.set('take', params.take ?? 20);
      url.searchParams.set('skip', params.skip ?? 0);
      url.searchParams.set('role', 'STUDENT');
      if (q) url.searchParams.set('q', q);
      if (level) url.searchParams.set('level', level);
      const res = await fetch(url.toString());
      const json = await res.json();
      setData(json.users ?? []);
      setTotal(json.total ?? 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCreate = async (values) => {
    try {
      setCreating(true);
      const { data } = await api.post('/api/users', {
        email: values.email,
        password: values.password,
        role: 'STUDENT',
        level: 'LEVEL1',
        firstName: values.firstName || undefined,
        lastName: values.lastName || undefined,
        phone: values.phone || undefined,
        country: values.country || undefined,
        courseId: values.courseId
      });
      message.success('Student created');
      setOpen(false);
      form.resetFields();
      fetchUsers();
      const newId = data?.user?.id;
      if (newId) {
        // redirect to student view page
        navigate(`/admin/students/${newId}`);
      }
    } catch {
      message.error('Failed to create student');
    } finally {
      setCreating(false);
    }
  };

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    async function loadCourses() {
      try {
        const res = await api.get('/api/cms/courses');
        const levelLabel = (lv) => {
          if (lv === 'LEVEL1') return 'Level I';
          if (lv === 'LEVEL2') return 'Level II';
          if (lv === 'LEVEL3') return 'Level III';
          if (lv === 'NONE') return 'None';
          return lv ?? '-';
        };
        const opts = (res.data.courses ?? []).map(c => ({
          label: `${c.name} — ${levelLabel(c.level)}`,
          value: c.id
        }));
        setCourses(opts);
      } catch {
        setCourses([]);
      }
    }
    loadCourses();
  }, []);

  const columns = [
    { 
      title: 'Student', 
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="icon-badge-sm icon-badge-purple">
            <TeamOutlined style={{ fontSize: 14 }} />
          </div>
          <div>
            <Typography.Text strong style={{ display: 'block', color: '#1e293b' }}>
              {[record.firstName, record.lastName].filter(Boolean).join(' ') || '—'}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {record.email}
            </Typography.Text>
          </div>
        </div>
      )
    },
    { title: 'Phone', dataIndex: 'phone', render: v => v || '—' },
    { title: 'Country', dataIndex: 'country', render: v => v || '—' },
    { title: 'Course', dataIndex: ['course','name'], render: (_v, record) => {
      const c = record.course;
      if (!c) return <Tag>No course</Tag>;
      const lv = c.level;
      const label = lv === 'LEVEL1' ? 'Level I' : lv === 'LEVEL2' ? 'Level II' : lv === 'LEVEL3' ? 'Level III' : lv === 'NONE' ? 'None' : lv;
      return (
        <div>
          <Typography.Text style={{ display: 'block' }}>{c.name}</Typography.Text>
          <Tag color="blue" style={{ fontSize: 11 }}>{label}</Tag>
        </div>
      );
    }},
    { title: 'Subscription', dataIndex: 'subscription', render: (v) => {
      const statusMap = {
        ACTIVE: { color: 'success', text: 'Active' },
        PAST_DUE: { color: 'warning', text: 'Past Due' },
        CANCELED: { color: 'error', text: 'Canceled' }
      };
      const status = statusMap[v] || { color: 'default', text: 'Incomplete' };
      return <Tag color={status.color}>{status.text}</Tag>;
    }},
    { title: 'Verified', dataIndex: 'emailVerifiedAt', render: (v) => (
      v ? <Tag color="success">Verified</Tag> : <Tag>Unverified</Tag>
    )},
    { title: 'Joined', dataIndex: 'createdAt', render: (v) => (
      v ? <Typography.Text type="secondary" style={{ fontSize: 13 }}>{new Date(v).toLocaleDateString()}</Typography.Text> : '—'
    )},
    {
      title: 'Actions',
      width: 140,
      render: (_, record) => (
        <Space size={8}>
          <Tooltip title="View Details">
            <button
              className="action-btn action-btn-view"
              onClick={() => navigate(`/admin/students/${record.id}`)}
            >
              <EyeOutlined />
            </button>
          </Tooltip>
          <Tooltip title="Edit">
            <button
              className="action-btn action-btn-edit"
              onClick={() => { setEditing(record); editForm.setFieldsValue(record); setEditOpen(true); }}
            >
              <EditOutlined />
            </button>
          </Tooltip>
          <Popconfirm title="Delete this student?" onConfirm={() => removeUser(record)}>
            <Tooltip title="Delete">
              <button className="action-btn action-btn-delete">
                <DeleteOutlined />
              </button>
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const removeUser = async (row) => {
    try {
      await api.delete(`/api/users/${row.id}`);
      message.success('Student deleted');
      fetchUsers();
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
            Students
          </Typography.Title>
          <div className="page-header-subtitle">
            Manage student accounts, enrollments, and subscriptions
          </div>
        </div>
        <Button 
          type="primary" 
          size="large"
          icon={<UserAddOutlined />} 
          onClick={() => setOpen(true)}
          style={{ 
            background: 'linear-gradient(135deg, #102540, #1e3a5f)',
            border: 'none',
            borderRadius: 12,
            height: 44,
            paddingInline: 24,
            fontWeight: 600
          }}
        >
          Add Student
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
            placeholder="Search by name or email..."
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            allowClear
            value={q}
            onChange={e => setQ(e.target.value)}
            onPressEnter={() => fetchUsers()}
            style={{ width: 280, borderRadius: 10 }}
          />
          <Select
            placeholder="Filter by level"
            allowClear
            style={{ width: 160 }}
            value={level}
            onChange={setLevel}
            options={[
              { value: 'LEVEL1', label: 'Level I' },
              { value: 'LEVEL2', label: 'Level II' },
              { value: 'LEVEL3', label: 'Level III' }
            ]}
          />
          <Button 
            icon={<FilterOutlined />} 
            onClick={() => fetchUsers()}
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
              onChange: (page) => fetchUsers({ skip: (page - 1) * 20, take: 20 }),
              style: { padding: '16px 24px', margin: 0 }
            }}
          />
        </div>
      </Card>

      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-badge-sm icon-badge-orange">
              <EditOutlined />
            </div>
            <span>Edit Student</span>
          </div>
        }
        open={editOpen}
        onClose={() => setEditOpen(false)}
        width={720}
        destroyOnClose
        className="modern-drawer"
        extra={
          <Button 
            type="primary" 
            loading={saving} 
            onClick={() => editForm.submit()}
            style={{ borderRadius: 10, background: 'linear-gradient(135deg, #102540, #1e3a5f)', border: 'none' }}
          >
            Save Changes
          </Button>
        }
      >
        <Form form={editForm} layout="vertical" onFinish={async (values) => {
          try {
            setSaving(true);
            await api.put(`/api/users/${editing.id}`, {
              firstName: values.firstName,
              lastName: values.lastName,
              phone: values.phone,
              country: values.country,
              courseId: values.courseId,
              password: values.password || undefined
            });
            message.success('Student updated');
            setEditOpen(false);
            setEditing(null);
            fetchUsers();
          } catch {
            message.error('Update failed');
          } finally {
            setSaving(false);
          }
        }}>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item label="Email">
                <Input value={editing?.email} disabled />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="courseId" label="Course" rules={[{ required: true }]}>
                <Select options={courses} placeholder="Select course" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="firstName" label="First Name">
                <Input placeholder="First name" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="lastName" label="Last Name">
                <Input placeholder="Last name" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="phone" label="Contact Number">
                <Input placeholder="+27 72 000 0000" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="country" label="Country">
                <Select
                  showSearch
                  placeholder="Select country"
                  options={countriesOptions}
                  optionFilterProp="label"
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="password" label="New Password (optional)">
            <Input.Password placeholder="Leave blank to keep current" />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-badge-sm icon-badge-green">
              <UserAddOutlined />
            </div>
            <span>Create New Student</span>
          </div>
        }
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText="Create Student"
        width={720}
        confirmLoading={creating}
        className="modern-modal"
        okButtonProps={{ 
          style: { borderRadius: 10, background: 'linear-gradient(135deg, #102540, #1e3a5f)', border: 'none' }
        }}
        cancelButtonProps={{ style: { borderRadius: 10 } }}
      >
        <Form form={form} layout="vertical" onFinish={onCreate} initialValues={{ level: 'LEVEL1' }}>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="firstName" label="First Name">
                <Input placeholder="First name" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="lastName" label="Last Name">
                <Input placeholder="Last name" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                <Input placeholder="student@example.com" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="phone" label="Contact Number">
                <Input placeholder="+27 72 000 0000" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="country" label="Country">
                <Select
                  showSearch
                  placeholder="Select country"
                  options={countriesOptions}
                  optionFilterProp="label"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="courseId" label="Course" rules={[{ required: true }]}>
                <Select options={courses} placeholder="Select course" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="password" label="Temp Password" rules={[{ required: true, min: 8 }]}>
            <Input.Password placeholder="At least 8 characters" />
          </Form.Item>
        </Form>
      </Modal>

      {/* View moved to dedicated page */}
    </div>
  );
}

