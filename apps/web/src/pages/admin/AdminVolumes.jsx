import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Drawer, Form, Input, Select, Space, Table, Tag, Typography, message } from 'antd';
import { PlusOutlined, LinkOutlined } from '@ant-design/icons';
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

  const courseOptions = useMemo(() => (courses || []).map(c => ({ value: c.id, label: `${c.name} (${c.level})` })), [courses]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ name: '', description: '', courseIds: [] });
    setOpen(true);
  };

  const openEdit = async (row) => {
    setEditing(row);
    form.resetFields();
    // Load current course links for this volume
    try {
      const { data } = await api.get(`/api/cms/volumes/${row.id}`);
      const currentCourseIds = (data.volume?.courseLinks || []).map(link => link.courseId);
      form.setFieldsValue({ 
        name: row.name, 
        description: row.description || '',
        courseIds: currentCourseIds
      });
    } catch {
      form.setFieldsValue({ 
        name: row.name, 
        description: row.description || '',
        courseIds: []
      });
    }
    setOpen(true);
  };

  const save = async (values) => {
    try {
      setSaving(true);
      const courseIds = values.courseIds || [];
      let volumeId;
      
      if (editing?.id) {
        // Update volume
        await api.put(`/api/cms/volumes/${editing.id}`, { 
          name: values.name, 
          description: values.description 
        });
        volumeId = editing.id;
        
        // Update course links for existing volume
        const { data: currentData } = await api.get(`/api/cms/volumes/${volumeId}`);
        const currentLinks = currentData.volume?.courseLinks || [];
        const currentCourseIds = currentLinks.map(link => link.courseId);
        
        // Find courses to add and remove
        const toAdd = courseIds.filter(id => !currentCourseIds.includes(id));
        const toRemove = currentCourseIds.filter(id => !courseIds.includes(id));
        
        // Add new links
        for (const courseId of toAdd) {
          try {
            await api.post(`/api/cms/courses/${courseId}/volumes`, { volumeId });
          } catch (e) {
            console.error(`Failed to link course ${courseId}:`, e);
          }
        }
        
        // Remove old links
        for (const courseId of toRemove) {
          try {
            await api.delete(`/api/cms/courses/${courseId}/volumes/${volumeId}`);
          } catch (e) {
            console.error(`Failed to unlink course ${courseId}:`, e);
          }
        }
        
        message.success('Volume updated');
        if (toAdd.length > 0 || toRemove.length > 0) {
          message.info(`Course links updated: ${courseIds.length} course(s) linked`);
        }
      } else {
        // Create volume with course links
        const { data } = await api.post('/api/cms/volumes', { 
          name: values.name, 
          description: values.description,
          courseIds: courseIds
        });
        volumeId = data.volume?.id;
        message.success(courseIds.length > 0 
          ? `Volume created and linked to ${courseIds.length} course(s)`
          : 'Volume created');
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

  const attach = async (volumeId, courseId) => {
    try {
      await api.post(`/api/cms/courses/${courseId}/volumes`, { volumeId });
      message.success('Attached to course');
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || 'Attach failed');
    }
  };

  const detach = async (volumeId, courseId) => {
    try {
      await api.delete(`/api/cms/courses/${courseId}/volumes/${volumeId}`);
      message.success('Detached from course');
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || 'Detach failed');
    }
  };

  const remove = async (row) => {
    try {
      await api.delete(`/api/cms/volumes/${row.id}`);
      message.success('Deleted');
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || 'Delete failed');
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
      title: 'Courses',
      render: (_, row) => {
        const links = row.courseLinks || [];
        if (!links.length) return <Typography.Text type="secondary">—</Typography.Text>;
        return (
          <Space wrap>
            {links.map(l => (
              <Tag key={l.courseId} color="blue">{l.course?.name || l.courseId}</Tag>
            ))}
          </Space>
        );
      }
    },
    {
      title: 'Actions',
      width: 280,
      render: (_, row) => (
        <Space wrap>
          <Button size="small" onClick={() => openEdit(row)}>Edit</Button>
          <Button size="small" danger onClick={() => remove(row)}>Delete</Button>
          {filterCourseId && (
            (row.courseLinks || []).some(l => l.courseId === filterCourseId)
              ? <Button size="small" icon={<LinkOutlined />} onClick={() => detach(row.id, filterCourseId)}>Detach</Button>
              : <Button size="small" type="primary" icon={<LinkOutlined />} onClick={() => attach(row.id, filterCourseId)}>Attach</Button>
          )}
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
          <Form.Item name="name" label="Volume Name" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="e.g. Volume 1" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea 
              rows={3} 
              placeholder="Optional description for this volume..."
              maxLength={500}
              showCount
            />
          </Form.Item>
          <Form.Item name="courseIds" label="Link to Courses" rules={[{ required: false }]}>
            <Select
              mode="multiple"
              placeholder="Select courses to link this volume to"
              options={courseOptions}
              showSearch
              optionFilterProp="label"
              allowClear
            />
          </Form.Item>
        </Form>
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
          {editing 
            ? 'Update course links by selecting/deselecting courses above. Changes will be saved when you click Save.'
            : 'Select one or more courses to link this volume to. You can link it to more courses later by editing.'}
        </Typography.Text>
      </Drawer>
    </Space>
  );
}
