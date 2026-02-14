import React, { useEffect, useState } from 'react';
import { Table, Typography, Input, Space, Button, Modal, Form, Select, message, Drawer, Row, Col, Popconfirm, Tooltip, Grid } from 'antd';
import { countriesOptions } from '../../constants/countries';
import { PlusOutlined, EyeOutlined, EditOutlined, DeleteOutlined, FilterOutlined } from '@ant-design/icons';
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
    { title: 'First Name', dataIndex: 'firstName' },
    { title: 'Last Name', dataIndex: 'lastName' },
    { title: 'Email', dataIndex: 'email' },
    { title: 'Phone', dataIndex: 'phone' },
    { title: 'Country', dataIndex: 'country' },
    { title: 'Course', dataIndex: ['course','name'], render: (_v, record) => {
      const c = record.course;
      if (!c) return '-';
      const lv = c.level;
      const label = lv === 'LEVEL1' ? 'Level I' : lv === 'LEVEL2' ? 'Level II' : lv === 'LEVEL3' ? 'Level III' : lv === 'NONE' ? 'None' : lv;
      return `${c.name} — ${label}`;
    }},
    { title: 'Subscription', dataIndex: 'subscription', render: (v) => {
      const color = v === 'ACTIVE' ? '#16a34a' : v === 'PAST_DUE' ? '#f59e0b' : v === 'CANCELED' ? '#ef4444' : '#64748b';
      return <span style={{ color, fontWeight: 600 }}>{v ?? 'INCOMPLETE'}</span>;
    }},
    { title: 'Verified', dataIndex: 'emailVerifiedAt', render: (v) => (v ? 'Yes' : 'No') },
    { title: 'Created', dataIndex: 'createdAt', render: (v) => (v ? new Date(v).toLocaleString() : '-') },
    {
      title: 'Actions',
      render: (_, record) => (
        <Space size={6}>
          <Tooltip title="View">
            <Button
              size="small"
              shape="circle"
              type="text"
              icon={<EyeOutlined />}
              style={{ background: '#e6f4ff', color: '#102540' }}
              onClick={() => navigate(`/admin/students/${record.id}`)}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              size="small"
              shape="circle"
              type="text"
              icon={<EditOutlined />}
              style={{ background: '#fff7e6', color: '#fa8c16' }}
              onClick={() => { setEditing(record); editForm.setFieldsValue(record); setEditOpen(true); }}
            />
          </Tooltip>
          <Popconfirm title="Delete this student?" onConfirm={() => removeUser(record)}>
            <Tooltip title="Delete">
              <Button
                size="small"
                shape="circle"
                type="text"
                icon={<DeleteOutlined />}
                style={{ background: '#fff1f0', color: '#cf1322' }}
              />
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-3 gap-3">
        <Typography.Title level={4} style={{ margin: 0 }}>Students</Typography.Title>
        <Space wrap>
          <Input.Search placeholder="Search email" allowClear onSearch={() => fetchUsers()} value={q} onChange={e => setQ(e.target.value)} style={{ width: isMobile ? 260 : undefined }} />
          <Select
            placeholder="Level"
            allowClear
            style={{ width: isMobile ? 180 : 160 }}
            value={level}
            onChange={setLevel}
            options={[
              { value: 'LEVEL1', label: 'Level I' },
              { value: 'LEVEL2', label: 'Level II' },
              { value: 'LEVEL3', label: 'Level III' }
            ]}
          />
          <Button icon={<FilterOutlined />} onClick={() => fetchUsers()}>Filter</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>New Student</Button>
        </Space>
      </div>
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
          onChange: (page) => fetchUsers({ skip: (page - 1) * 20, take: 20 })
        }}
      />

      <Drawer
        title="Edit Student"
        open={editOpen}
        onClose={() => setEditOpen(false)}
        width={720}
        destroyOnClose
        extra={<Button type="primary" loading={saving} onClick={() => editForm.submit()}>Save</Button>}
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
        title="Create Student"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText="Create"
        width={720}
        confirmLoading={creating}
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

