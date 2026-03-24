import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Drawer, Form, Input, Select, Space, Table, Tag, Typography, message, Modal, Popconfirm } from 'antd';
import { PlusOutlined, LinkOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import { api } from '../../lib/api';

// Natural sort comparison - handles "Volume 1", "Volume 10" correctly
function naturalCompare(a, b) {
  const ax = [], bx = [];
  (a || '').replace(/(\d+)|(\D+)/g, (_, $1, $2) => { ax.push([$1 || Infinity, $2 || '']); });
  (b || '').replace(/(\d+)|(\D+)/g, (_, $1, $2) => { bx.push([$1 || Infinity, $2 || '']); });
  while (ax.length && bx.length) {
    const an = ax.shift();
    const bn = bx.shift();
    const nn = (parseInt(an[0], 10) || 0) - (parseInt(bn[0], 10) || 0) || an[1].localeCompare(bn[1]);
    if (nn) return nn;
  }
  return ax.length - bx.length;
}

function sortByNaturalName(arr) {
  return arr.slice().sort((a, b) => naturalCompare(a.name, b.name));
}

export function AdminVolumes() {
  const [loading, setLoading] = useState(false);
  const [volumes, setVolumes] = useState([]);
  const [courses, setCourses] = useState([]);
  const [filterCourseId, setFilterCourseId] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [volRes, courseRes] = await Promise.all([
        api.get('/api/cms/volumes', { params: filterCourseId ? { courseId: filterCourseId } : {} }),
        api.get('/api/cms/courses')
      ]);
      const volList = sortByNaturalName(volRes.data.volumes || []);
      setVolumes(volList);
      setCourses(courseRes.data.courses || []);
    } catch {
      message.error('Failed to load volumes');
      setVolumes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCourseId]);

  const courseOptions = useMemo(() => (courses || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => ({ value: c.id, label: `${c.name} (${c.level})` })), [courses]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ name: '', description: '', courseId: filterCourseId || undefined });
    setOpen(true);
  };

  const openEdit = async (row) => {
    setEditing(row);
    form.resetFields();
    // Get current course link for this volume
    const links = row.courseLinks || [];
    const courseId = links.length > 0 ? links[0].courseId : undefined;
    form.setFieldsValue({ 
      name: row.name, 
      description: row.description || '',
      courseId
    });
    setOpen(true);
  };

  const save = async (values) => {
    try {
      setSaving(true);
      const courseId = values.courseId;
      
      if (editing?.id) {
        // Update volume
        await api.put(`/api/cms/volumes/${editing.id}`, { 
          name: values.name, 
          description: values.description 
        });
        
        // Update course link: remove old, add new
        const currentLinks = editing.courseLinks || [];
        const currentCourseId = currentLinks.length > 0 ? currentLinks[0].courseId : null;
        
        if (courseId !== currentCourseId) {
          // Remove old link
          if (currentCourseId) {
            try { await api.delete(`/api/cms/courses/${currentCourseId}/volumes/${editing.id}`); } catch {}
          }
          // Add new link
          if (courseId) {
            try { await api.post(`/api/cms/courses/${courseId}/volumes`, { volumeId: editing.id }); } catch {}
          }
        }
        
        message.success('Volume updated');
      } else {
        // Create volume with single course link
        const { data } = await api.post('/api/cms/volumes', { 
          name: values.name, 
          description: values.description,
          courseIds: courseId ? [courseId] : []
        });
        message.success('Volume created');
      }
      
      setOpen(false);
      setEditing(null);
      form.resetFields();
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };


  const remove = async (row) => {
    try {
      await api.delete(`/api/cms/volumes/${row.id}`);
      message.success('Volume deleted');
      load();
    } catch (err) {
      if (err?.response?.status === 409 && err?.response?.data?.related) {
        const { related, message: msg } = err.response.data;
        Modal.confirm({
          title: 'Delete Volume?',
          icon: <ExclamationCircleFilled />,
          content: (
            <div>
              <p>{msg || 'This volume has associated entities:'}</p>
              <ul style={{ margin: '8px 0', paddingLeft: 20 }}>{related.map((r, i) => <li key={i}>{r}</li>)}</ul>
              <p><strong>All associated data will be permanently deleted.</strong></p>
            </div>
          ),
          okText: 'Delete All',
          okType: 'danger',
          async onOk() {
            try {
              await api.delete(`/api/cms/volumes/${row.id}?force=true`);
              message.success('Volume and all associated data deleted');
              load();
            } catch {
              message.error('Failed to delete volume');
            }
          }
        });
      } else {
        message.error(err?.response?.data?.error || 'Delete failed');
      }
    }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', render: (text, record) => (
      <Space direction="vertical" size={0}>
        <span>{text}</span>
        {record.description && (
          <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
            {record.description.length > 50 ? `${record.description.substring(0, 50)}...` : record.description}
          </Typography.Text>
        )}
      </Space>
    ) },
    {
      title: 'Course',
      render: (_, row) => {
        const links = row.courseLinks || [];
        if (!links.length) return <Typography.Text type="secondary">—</Typography.Text>;
        const link = links[0];
        const c = link.course;
        return <Tag color="blue">{c ? `${c.name} (${c.level})` : link.courseId}</Tag>;
      }
    },
    {
      title: 'Actions',
      width: 180,
      render: (_, row) => (
        <Space wrap>
          <Button size="small" onClick={() => openEdit(row)}>Edit</Button>
          <Popconfirm title="Delete this volume?" onConfirm={() => remove(row)}>
            <Button size="small" danger>Delete</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>Volumes</Typography.Title>
        <Space wrap>
          <Select
            value={filterCourseId || undefined}
            onChange={(v) => setFilterCourseId(v ?? '')}
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ minWidth: 320 }}
            placeholder="Filter by course (optional)"
            options={courseOptions}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New Volume</Button>
        </Space>
      </Space>

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={volumes}
          columns={columns}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Drawer
        title={editing ? 'Edit Volume' : 'New Volume'}
        open={open}
        onClose={() => setOpen(false)}
        width={420}
        destroyOnClose
        extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>{editing ? 'Save' : 'Create'}</Button>}
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="name" label="Volume Name/Description" rules={[{ required: true, min: 2 }]}>
            <Input.TextArea rows={3} placeholder="Enter volume name and description..." />
          </Form.Item>
          <Form.Item name="description" label="Volume Number">
            <Input 
              placeholder="e.g. Volume 1"
            />
          </Form.Item>
          <Form.Item name="courseId" label="Course" rules={[{ required: true, message: 'Please select a course' }]}>
            <Select
              placeholder="Select the course this volume belongs to"
              options={courseOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        </Form>
      </Drawer>
    </Space>
  );
}
