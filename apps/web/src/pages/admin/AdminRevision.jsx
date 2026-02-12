import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Select, message, Table, Drawer, Space, Popconfirm, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

export function AdminRevision() {
  const [form] = Form.useForm();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/cms/revision-summaries');
      setData(res.data.summaries ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      message.error('Failed to load summaries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (values) => {
    try {
      if (editing) {
        await api.put(`/api/cms/revision-summaries/${editing.id}`, values);
        message.success('Summary updated');
      } else {
        await api.post('/api/cms/revision-summaries', values);
        message.success('Summary created');
      }
      form.resetFields();
      setEditing(null);
      setDrawerOpen(false);
      load();
    } catch {
      message.error('Failed (admin only)');
    }
  };

  const remove = async (record) => {
    try {
      await api.delete(`/api/cms/revision-summaries/${record.id}`);
      message.success('Deleted');
      load();
    } catch {
      message.error('Failed to delete');
    }
  };

  const columns = [
    { title: 'Title', dataIndex: 'title' },
    { title: 'Level', dataIndex: 'level', render: (v) => <Tag color="blue">{v}</Tag> },
    { title: 'PDF URL', dataIndex: 'contentUrl', ellipsis: true },
    {
      title: 'Actions',
      render: (_, record) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => { setEditing(record); form.setFieldsValue(record); setDrawerOpen(true); }}>
            Edit
          </Button>
          <Popconfirm title="Delete summary?" onConfirm={() => remove(record)}>
            <Button danger icon={<DeleteOutlined />} size="small">Delete</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <Card
      title="Admin · Revision Summaries"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ level: 'LEVEL1' }); setDrawerOpen(true); }}>
          New Summary
        </Button>
      }
    >
      <Table rowKey="id" loading={loading} dataSource={data} columns={columns} pagination={{ total, pageSize: 20 }} />

      <Drawer
        title={editing ? 'Edit Summary' : 'Create Summary'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
        destroyOnClose
      >
        <Form layout="vertical" form={form} onFinish={submit} initialValues={{ level: 'LEVEL1' }}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="level" label="Level" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'Level I', value: 'LEVEL1' },
                { label: 'Level II', value: 'LEVEL2' },
                { label: 'Level III', value: 'LEVEL3' }
              ]}
            />
          </Form.Item>
          <Form.Item name="contentUrl" label="Content URL (PDF)">
            <Input />
          </Form.Item>
          <Form.Item name="contentHtml" label="Inline HTML">
            <Input.TextArea rows={6} />
          </Form.Item>
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit">{editing ? 'Update' : 'Create'}</Button>
          </Space>
        </Form>
      </Drawer>
    </Card>
  );
}


