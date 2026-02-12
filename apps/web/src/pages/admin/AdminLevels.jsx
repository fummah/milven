import React, { useEffect, useState } from 'react';
import { Table, Typography, Input, Space, Button, Form, Drawer, Switch, InputNumber, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

export function AdminLevels() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const fetchLevels = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/cms/levels');
      setData(res.data?.levels ?? []);
    } catch {
      message.error('Failed to load levels');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLevels(); }, []);

  const remove = async (row) => {
    try {
      await api.delete(`/api/cms/levels/${row.id}`);
      message.success('Level deleted');
      fetchLevels();
    } catch {
      message.error('Delete failed');
    }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name' },
    { title: 'Code', dataIndex: 'code' },
    { title: 'Order', dataIndex: 'order', render: (v) => v ?? '-' },
    { title: 'Active', dataIndex: 'active', render: (v) => (v ? 'Yes' : 'No') },
    {
      title: 'Actions',
      render: (_, row) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => { setEditing(row); form.setFieldsValue(row); setOpen(true); }}>Edit</Button>
          <Popconfirm title="Delete this level?" onConfirm={() => remove(row)}>
            <Button icon={<DeleteOutlined />} size="small" danger>Delete</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Typography.Title level={4} style={{ margin: 0 }}>Levels</Typography.Title>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ active: true }); setOpen(true); }}>
            New Level
          </Button>
        </Space>
      </div>
      <Table rowKey="id" loading={loading} dataSource={data} columns={columns} pagination={false} />

      <Drawer
        title={editing ? 'Edit Level' : 'New Level'}
        open={open}
        onClose={() => setOpen(false)}
        width={520}
        extra={<Button type="primary" onClick={() => form.submit()}>{editing ? 'Save' : 'Create'}</Button>}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            try {
              if (editing) {
                await api.put(`/api/cms/levels/${editing.id}`, values);
                message.success('Level updated');
              } else {
                await api.post('/api/cms/levels', values);
                message.success('Level created');
              }
              setOpen(false);
              setEditing(null);
              fetchLevels();
            } catch {
              message.error('Save failed');
            }
          }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g., Level I" />
          </Form.Item>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}>
            <Input placeholder="e.g., LEVEL1, LEVEL2, LEVEL3, NONE" />
          </Form.Item>
          <Form.Item name="order" label="Order">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}

