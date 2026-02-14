import React, { useEffect, useState } from 'react';
import { Card, Table, Space, Button, Typography, Modal, Form, Input, InputNumber, Switch, message, Grid } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

export function AdminTaxes() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [loading, setLoading] = useState(false);
  const [taxes, setTaxes] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/billing/taxes');
      setTaxes(data.taxes || []);
    } catch {
      setTaxes([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const onNew = () => {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  };
  const onEdit = (row) => {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      ratePercent: row.ratePercent,
      active: row.active,
      isDefault: row.isDefault,
      description: row.description
    });
    setOpen(true);
  };
  const onDelete = async (row) => {
    try {
      await api.delete(`/api/billing/taxes/${row.id}`);
      message.success('Deleted');
      load();
    } catch {
      message.error('Delete failed');
    }
  };
  const onSave = async (vals) => {
    setSaving(true);
    try {
      if (editing?.id) {
        await api.put(`/api/billing/taxes/${editing.id}`, vals);
        message.success('Updated');
      } else {
        await api.post('/api/billing/taxes', vals);
        message.success('Created');
      }
      setOpen(false);
      load();
    } catch {
      message.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name' },
    { title: 'Rate %', dataIndex: 'ratePercent' },
    { title: 'Default', dataIndex: 'isDefault', render: v => v ? 'Yes' : 'No' },
    { title: 'Active', dataIndex: 'active', render: v => v ? 'Yes' : 'No' },
    { title: 'Description', dataIndex: 'description', render: v => v || '-' },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(r)}>Edit</Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(r)}>Delete</Button>
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <Typography.Title level={4} style={{ margin: 0 }}>Taxes</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>New Tax</Button>
      </div>
      <Card>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={taxes}
          columns={columns}
          size={isMobile ? 'small' : 'middle'}
          scroll={isMobile ? { x: 'max-content' } : undefined}
        />
      </Card>
      <Modal
        title={editing ? 'Edit Tax' : 'New Tax'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" onFinish={onSave} initialValues={{ active: true, isDefault: false }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="ratePercent" label="Rate (%)" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input />
          </Form.Item>
          <Form.Item name="isDefault" label="Default" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

