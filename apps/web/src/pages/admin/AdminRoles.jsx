import React, { useEffect, useMemo, useState } from 'react';
import { Card, Typography, Space, Input, Button, Table, Select, Switch, Modal, Form, message, Row, Col } from 'antd';
import { PlusOutlined, KeyOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

export function AdminRoles() {
  const [roles, setRoles] = useState([]);
  const [selectedRoleKey, setSelectedRoleKey] = useState('ADMIN');
  const [permissions, setPermissions] = useState([]);
  const [q, setQ] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [form] = Form.useForm();
  const [roleForm] = Form.useForm();
  const [rolesLoading, setRolesLoading] = useState(false);
  const [permsLoading, setPermsLoading] = useState(false);
  const [addPermLoading, setAddPermLoading] = useState(false);
  const [createRoleLoading, setCreateRoleLoading] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const filteredPermissions = useMemo(() => {
    if (!q) return permissions;
    return permissions.filter(p => p.permission.toLowerCase().includes(q.toLowerCase()));
  }, [permissions, q]);

  async function loadRoles() {
    try {
      setRolesLoading(true);
      const res = await api.get('/api/roles');
      setRoles(res.data.roles ?? []);
      if (!selectedRoleKey) {
        setSelectedRoleKey('ADMIN');
      }
    } finally {
      setRolesLoading(false);
    }
  }

  async function loadPerms(roleKey) {
    try {
      setPermsLoading(true);
      const res = await api.get(`/api/roles/${roleKey}/permissions`);
      setPermissions(res.data.permissions ?? []);
    } finally {
      setPermsLoading(false);
    }
  }

  useEffect(() => {
    loadRoles();
  }, []);

  useEffect(() => {
    if (selectedRoleKey) loadPerms(selectedRoleKey);
  }, [selectedRoleKey]);

  const roleOptions = roles.map(r => ({
    label: r.name,
    value: r.key,
    tag: r.type === 'BASE' ? 'BASE' : 'CUSTOM'
  }));

  const permColumns = [
    { title: 'Permission', dataIndex: 'permission' },
    {
      title: 'Allowed',
      dataIndex: 'allowed',
      render: (v, record) => (
        <Switch checked={!!v} onChange={(checked) => updatePermission(record.permission, checked)} />
      )
    }
  ];

  async function updatePermission(permission, allowed) {
    await api.put(`/api/roles/${selectedRoleKey}/permissions`, { permission, allowed });
    const idx = permissions.findIndex(p => p.permission === permission);
    if (idx >= 0) {
      const next = [...permissions];
      next[idx] = { ...next[idx], allowed };
      setPermissions(next);
    } else {
      setPermissions([...permissions, { permission, allowed }]);
    }
  }

  async function addPermission(values) {
    try {
      setAddPermLoading(true);
      await updatePermission(values.permission, true);
      setAddOpen(false);
      form.resetFields();
    } finally {
      setAddPermLoading(false);
    }
  }

  async function createRole(values) {
    try {
      setCreateRoleLoading(true);
      const res = await api.post('/api/roles', values);
      message.success('Role created');
      setRoleOpen(false);
      roleForm.resetFields();
      await loadRoles();
      const newKey = `custom:${res.data.role.id}`;
      setSelectedRoleKey(newKey);
      await loadPerms(newKey);
    } finally {
      setCreateRoleLoading(false);
    }
  }

  const rolesColumns = [
    { title: 'Role', dataIndex: 'name', render: (v, r) => (<span>{v} {r.type === 'BASE' ? <span className="text-xs text-gray-500">(base)</span> : null}</span>) },
    { title: 'Type', dataIndex: 'type' },
    { title: 'Description', dataIndex: 'description', ellipsis: true }
  ];
  async function deleteRole(r) {
    await api.delete(`/api/roles/custom/${r.id}`);
    message.success('Role deleted');
    await loadRoles();
    setSelectedRoleKey('ADMIN');
    await loadPerms('ADMIN');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Roles & Permissions
        </Typography.Title>
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => setRoleOpen(true)}>
            New Role
          </Button>
          <Button type="primary" icon={<KeyOutlined />} onClick={() => setAddOpen(true)}>
            Add Permission
          </Button>
        </Space>
      </div>
      <Row gutter={16}>
        <Col xs={24} md={14}>
          <Card title="Roles" extra={
            <Select
              value={selectedRoleKey}
              onChange={setSelectedRoleKey}
              options={roleOptions}
              style={{ minWidth: 220 }}
            />
          }>
            <Table
              rowKey={(r) => r.key ?? r.id}
              dataSource={roles}
              columns={[...rolesColumns, {
                title: 'Actions',
                render: (_, r) => r.type === 'CUSTOM' ? (
                  <Space>
                    <Button size="small" onClick={() => { roleForm.setFieldsValue({ name: r.name, description: r.description }); setEditTarget(r); setRoleOpen(true); }}>Edit</Button>
                    <Button size="small" danger onClick={() => deleteRole(r)}>Delete</Button>
                  </Space>
                ) : null
              }]}
              size="small"
              loading={rolesLoading}
              pagination={false}
              onRow={(record) => ({
                onClick: () => setSelectedRoleKey(record.key)
              })}
            />
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="Permissions">
            <div className="flex items-center gap-3 mb-3">
              <Input.Search placeholder="Filter permissions" allowClear value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 320 }} />
            </div>
            <Table
              rowKey="permission"
              dataSource={filteredPermissions}
              columns={permColumns}
              pagination={false}
              loading={permsLoading}
            />
            <div className="text-xs text-gray-500 mt-3">
              Tip: These permissions are used by the UI; backend critical endpoints still require ADMIN role.
            </div>
          </Card>
        </Col>
      </Row>

      <Modal title="Add Permission" open={addOpen} onCancel={() => setAddOpen(false)} onOk={() => form.submit()} okText="Add" confirmLoading={addPermLoading}>
        <Form form={form} layout="vertical" onFinish={addPermission}>
          <Form.Item name="permission" label="Permission key" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="e.g. users.manage, exams.build, cms.edit" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={editTarget ? 'Edit Role' : 'New Role'} open={roleOpen} onCancel={() => { setRoleOpen(false); setEditTarget(null); }} onOk={() => roleForm.submit()} okText={editTarget ? 'Save' : 'Create'} confirmLoading={createRoleLoading}>
        <Form form={roleForm} layout="vertical" onFinish={async (values) => {
          if (editTarget) {
            await api.put(`/api/roles/custom/${editTarget.id}`, values);
            message.success('Role updated');
            setRoleOpen(false);
            setEditTarget(null);
            await loadRoles();
            return;
          }
          await createRole(values);
        }}>
          <Form.Item name="name" label="Role name" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="e.g. Instructor" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="Optional description" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

