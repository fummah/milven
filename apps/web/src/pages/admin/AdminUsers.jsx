import React, { useEffect, useState } from 'react';
import { Table, Typography, Input, Space, Select, Button, Modal, Form, message, Drawer, Popconfirm, Descriptions, Tag, Divider, Row, Col, Switch, Grid, Card } from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined, DeleteOutlined, UserOutlined, MailOutlined, PhoneOutlined, GlobalOutlined, SafetyCertificateOutlined, CalendarOutlined, SearchOutlined, FilterOutlined, UserAddOutlined, TeamOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { countriesOptions } from '../../constants/countries';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export function AdminUsers() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [role, setRole] = useState();
  const [level, setLevel] = useState();
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [viewingFull, setViewingFull] = useState(null);
  const [viewingLoading, setViewingLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [roleOptions, setRoleOptions] = useState([
    { value: 'ADMIN', label: 'Admin' },
    { value: 'STUDENT', label: 'Student' }
  ]);

  const fetchUsers = async (params = {}) => {
    setLoading(true);
    try {
      const url = new URL(`${API_URL}/api/users`);
      url.searchParams.set('take', params.take ?? 20);
      url.searchParams.set('skip', params.skip ?? 0);
      if (q) url.searchParams.set('q', q);
      if (role) url.searchParams.set('role', role);
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

  useEffect(() => {
    async function loadRoles() {
      try {
        const res = await api.get('/api/roles');
        const roles = res.data.roles ?? [];
        const custom = roles.filter(r => r.type === 'CUSTOM').map(r => ({ value: `custom:${r.id}`, label: r.name }));
        setRoleOptions([
          { value: 'ADMIN', label: 'Admin' },
          { value: 'STUDENT', label: 'Student' },
          ...custom
        ]);
      } catch {}
    }
    loadRoles();
  }, []);

  useEffect(() => {
    if (!viewing?.id) {
      setViewingFull(null);
      return;
    }
    setViewingFull(null);
    setViewingLoading(true);
    api.get(`/api/users/${viewing.id}`)
      .then((res) => {
        setViewingFull(res.data?.user ?? null);
      })
      .catch(() => setViewingFull(null))
      .finally(() => setViewingLoading(false));
  }, [viewing?.id]);

  const columns = [
    { 
      title: 'User', 
      render: (_, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className={`icon-badge-sm ${record.role === 'ADMIN' ? 'icon-badge-orange' : 'icon-badge-blue'}`}>
            <UserOutlined style={{ fontSize: 14 }} />
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
    { title: 'Role', dataIndex: 'role', render: v => (
      <Tag color={v === 'ADMIN' ? 'gold' : 'blue'}>{v}</Tag>
    )},
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
          <button className="action-btn action-btn-view" onClick={() => setViewing(record)}>
            <EyeOutlined />
          </button>
          <button 
            className="action-btn action-btn-edit" 
            onClick={() => {
              setEditing(record);
              form.setFieldsValue({
                role: record.role,
                level: record.level,
                firstName: record.firstName,
                lastName: record.lastName,
                phone: record.phone,
                country: record.country,
                verified: !!record.emailVerifiedAt
              });
              setOpen(true);
            }}
          >
            <EditOutlined />
          </button>
          <Popconfirm title="Delete user?" onConfirm={() => removeUser(record)}>
            <button className="action-btn action-btn-delete">
              <DeleteOutlined />
            </button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <Typography.Title level={2} className="page-header-title">
            Users
          </Typography.Title>
          <div className="page-header-subtitle">
            Manage all user accounts and permissions
          </div>
        </div>
        <Button 
          type="primary" 
          size="large"
          icon={<UserAddOutlined />} 
          onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}
          style={{ 
            background: 'linear-gradient(135deg, #102540, #1e3a5f)',
            border: 'none',
            borderRadius: 12,
            height: 44,
            paddingInline: 24,
            fontWeight: 600
          }}
        >
          Add User
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
            placeholder="Filter by role" 
            allowClear 
            style={{ width: 140 }} 
            value={role} 
            onChange={setRole}
            options={[{ value: 'ADMIN', label: 'Admin' }, { value: 'STUDENT', label: 'Student' }]}
          />
          <Select 
            placeholder="Filter by level" 
            allowClear 
            style={{ width: 160 }} 
            value={level} 
            onChange={setLevel}
            options={[{ value: 'LEVEL1', label: 'Level I' }, { value: 'LEVEL2', label: 'Level II' }, { value: 'LEVEL3', label: 'Level III' }]}
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
            <div className="icon-badge-sm icon-badge-blue">
              <UserOutlined />
            </div>
            <span>User Details</span>
          </div>
        }
        open={!!viewing}
        onClose={() => { setViewing(null); setViewingFull(null); }}
        width={480}
        className="modern-drawer"
        extra={
          viewing && (
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => {
                const u = viewingFull || viewing;
                setViewing(null);
                setViewingFull(null);
                setEditing(u);
                form.setFieldsValue({ role: u.role, level: u.level, firstName: u.firstName, lastName: u.lastName, phone: u.phone, country: u.country, verified: !!u.emailVerifiedAt });
                setOpen(true);
              }}
              style={{ borderRadius: 10, background: 'linear-gradient(135deg, #102540, #1e3a5f)', border: 'none' }}
            >
              Edit User
            </Button>
          )
        }
      >
        {viewing && (() => {
          const u = viewingFull || viewing;
          if (viewingLoading && !viewingFull) {
            return (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <Typography.Text type="secondary">Loading details…</Typography.Text>
              </div>
            );
          }
          return (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #102540 0%, #1a3a5c 100%)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12
                  }}
                >
                  <UserOutlined style={{ fontSize: 36, color: '#fff' }} />
                </div>
                <Typography.Title level={4} style={{ margin: '0 0 4px' }}>
                  {[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}
                </Typography.Title>
                <Typography.Text type="secondary">{u.email || '—'}</Typography.Text>
              </div>
              <Divider style={{ margin: '8px 0' }} />
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label={<Space><MailOutlined /> Email</Space>}>
                  {u.email || '—'}
                </Descriptions.Item>
                <Descriptions.Item label={<Space><PhoneOutlined /> Phone</Space>}>
                  {u.phone || '—'}
                </Descriptions.Item>
                <Descriptions.Item label={<Space><GlobalOutlined /> Country</Space>}>
                  {u.country || '—'}
                </Descriptions.Item>
                <Descriptions.Item label={<Space><SafetyCertificateOutlined /> Role</Space>}>
                  <Tag color={u.role === 'ADMIN' ? 'gold' : 'blue'}>{u.role || '—'}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Level">
                  {u.level ? <Tag>{u.level}</Tag> : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Email verified">
                  {u.emailVerifiedAt ? (
                    <Tag color="success">Yes</Tag>
                  ) : (
                    <Tag color="default">No</Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label={<Space><CalendarOutlined /> Created</Space>}>
                  {u.createdAt ? new Date(u.createdAt).toLocaleString() : '—'}
                </Descriptions.Item>
                {u.updatedAt && (
                  <Descriptions.Item label="Updated">
                    {new Date(u.updatedAt).toLocaleString()}
                  </Descriptions.Item>
                )}
              </Descriptions>
              {viewingFull?.enrollments?.length > 0 && (
                <>
                  <Divider orientation="left" plain>Enrollments</Divider>
                  <div style={{ background: '#fafafa', borderRadius: 8, padding: 12 }}>
                    {viewingFull.enrollments.map((e, idx) => (
                      <div
                        key={e.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 0',
                          borderBottom: idx < viewingFull.enrollments.length - 1 ? '1px solid #f0f0f0' : 'none'
                        }}
                      >
                        <Typography.Text>{e.course?.name ?? '—'}</Typography.Text>
                        <Tag color={e.status === 'COMPLETED' ? 'green' : e.status === 'CANCELLED' ? 'default' : 'blue'}>{e.status}</Tag>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {viewingFull?.subscriptions?.length > 0 && (
                <>
                  <Divider orientation="left" plain>Subscriptions</Divider>
                  <div style={{ background: '#fafafa', borderRadius: 8, padding: 12 }}>
                    {viewingFull.subscriptions.map((s, idx) => (
                      <div
                        key={s.id}
                        style={{
                          padding: '6px 0',
                          borderBottom: idx < viewingFull.subscriptions.length - 1 ? '1px solid #f0f0f0' : 'none'
                        }}
                      >
                        <Typography.Text strong>{s.provider || '—'}</Typography.Text>
                        <span style={{ marginLeft: 8 }}>
                          <Tag color={s.status === 'active' || s.status === 'ACTIVE' ? 'green' : 'default'}>{s.status}</Tag>
                          {s.currentPeriodEnd && (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {' · Ends '}{new Date(s.currentPeriodEnd).toLocaleDateString()}
                            </Typography.Text>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Space>
          );
        })()}
      </Drawer>
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className={`icon-badge-sm ${editing ? 'icon-badge-orange' : 'icon-badge-green'}`}>
              {editing ? <EditOutlined /> : <UserAddOutlined />}
            </div>
            <span>{editing ? 'Edit User' : 'Create New User'}</span>
          </div>
        }
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText={editing ? 'Save Changes' : 'Create User'}
        className="modern-modal"
        okButtonProps={{ 
          style: { borderRadius: 10, background: 'linear-gradient(135deg, #102540, #1e3a5f)', border: 'none' }
        }}
        cancelButtonProps={{ style: { borderRadius: 10 } }}
      >
        <Form form={form} layout="vertical" onFinish={async (values) => {
          try {
            if (editing) {
              await api.put(`/api/users/${editing.id}`, {
                firstName: values.firstName,
                lastName: values.lastName,
                phone: values.phone,
                country: values.country,
                role: values.role.startsWith('custom:') ? 'STUDENT' : values.role,
                customRoleId: values.role.startsWith('custom:') ? values.role.replace('custom:', '') : undefined,
                level: values.level,
                password: values.password || undefined,
                verified: values.verified
              });
              message.success('User updated');
            } else {
              await api.post('/api/users', {
                email: values.email,
                password: values.password,
                firstName: values.firstName,
                lastName: values.lastName,
                phone: values.phone,
                country: values.country,
                role: values.role.startsWith('custom:') ? 'STUDENT' : values.role,
                customRoleId: values.role.startsWith('custom:') ? values.role.replace('custom:', '') : undefined,
                level: values.level
              });
              message.success('User created');
            }
            setOpen(false);
            setEditing(null);
            form.resetFields();
            fetchUsers();
          } catch {
            message.error('Save failed');
          }
        }}>
          {!editing && (
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
              <Input placeholder="user@example.com" />
            </Form.Item>
          )}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="firstName" label="First Name">
                <Input placeholder="First name" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lastName" label="Last Name">
                <Input placeholder="Last name" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="Contact Number">
                <Input placeholder="+27 72 000 0000" />
              </Form.Item>
            </Col>
            <Col span={12}>
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
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="role" label="Role" rules={[{ required: true }]}>
                <Select options={roleOptions} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="level" label="CFA Level" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'LEVEL1', label: 'Level I' },
                    { value: 'LEVEL2', label: 'Level II' },
                    { value: 'LEVEL3', label: 'Level III' }
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          {editing && (
            <Form.Item name="verified" label="Student verified" valuePropName="checked">
              <Switch checkedChildren="Verified" unCheckedChildren="Not verified" />
            </Form.Item>
          )}
          <Form.Item name="password" label={editing ? 'New Password (optional)' : 'Password'} rules={editing ? [] : [{ required: true, min: 8 }]}>
            <Input.Password placeholder={editing ? 'Leave blank to keep current' : 'At least 8 characters'} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

async function removeUser(record) {
  try {
    await api.delete(`/api/users/${record.id}`);
    window.dispatchEvent(new Event('users:refresh')); // optional, not used here
  } catch {}
}

