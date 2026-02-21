import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Select, message, Table, Drawer, Space, Popconfirm, Tag, Tabs, Modal, Upload, Steps, Layout, List, Divider, Radio, Descriptions, Typography, Grid } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined, UploadOutlined, FolderOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

const LEVEL_OPTIONS = [
  { label: 'None', value: 'NONE' },
  { label: 'Level I', value: 'LEVEL1' },
  { label: 'Level II', value: 'LEVEL2' },
  { label: 'Level III', value: 'LEVEL3' }
];

export function AdminTopics() {
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
  const asUrl = (u) => {
    if (!u) return u;
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    if (u.startsWith('/uploads')) return `${API_URL}${u}`;
    return u;
  };
  const [form] = Form.useForm();
  const [moduleForm] = Form.useForm();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [modules, setModules] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [moduleDrawerOpen, setModuleDrawerOpen] = useState(false);
  const [editingModule, setEditingModule] = useState(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialForm] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [activeTab, setActiveTab] = useState('modules');
  const [filterCourseId, setFilterCourseId] = useState('');
  const [filterModuleId, setFilterModuleId] = useState('');
  const [filterQ, setFilterQ] = useState('');
  const [filterModuleCourseId, setFilterModuleCourseId] = useState('');
  const [filterVolumeId, setFilterVolumeId] = useState('');
  const [moduleCourseId, setModuleCourseId] = useState('');
  const [courses, setCourses] = useState([]);
  const [topicStep, setTopicStep] = useState(0);
  const [savingTopic, setSavingTopic] = useState(false);
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [materialEditing, setMaterialEditing] = useState(null);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [examViewOpen, setExamViewOpen] = useState(false);
  const [examViewLoading, setExamViewLoading] = useState(false);
  const [examViewExam, setExamViewExam] = useState(null);
  const [examViewQuestions, setExamViewQuestions] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      const topicLevel = filterCourseId ? (courses.find(c => c.id === filterCourseId)?.level) : undefined;
      if (filterCourseId) params.courseId = filterCourseId;
      if (topicLevel) params.level = topicLevel;
      if (filterModuleId) params.moduleId = filterModuleId;
      if (filterQ) params.q = filterQ;
      const moduleLevel = filterModuleCourseId ? (courses.find(c => c.id === filterModuleCourseId)?.level) : undefined;
      const moduleParams = filterVolumeId
        ? { volumeId: filterVolumeId }
        : (filterModuleCourseId ? { courseId: filterModuleCourseId, ...(moduleLevel ? { level: moduleLevel } : {}) } : (moduleLevel ? { level: moduleLevel } : {}));
      const [topicsRes, modulesRes, coursesRes] = await Promise.all([
        api.get('/api/cms/topics', { params }),
        api.get('/api/cms/modules', { params: moduleParams }),
        api.get('/api/cms/courses')
      ]);
      setData(topicsRes.data.topics ?? []);
      setTotal(topicsRes.data.total ?? 0);
      setModules(modulesRes.data.modules ?? []);
      setCourses((coursesRes.data.courses ?? []).map(c => ({ id: c.id, name: c.name, level: c.level })));

      try {
        const volRes = await api.get('/api/cms/volumes', { params: filterCourseId ? { courseId: filterCourseId } : {} });
        const volList = (volRes.data.volumes ?? []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
        setVolumes(volList);
      } catch {
        setVolumes([]);
      }
    } catch {
      message.error('Failed to load topics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCourseId, filterModuleId, filterModuleCourseId, filterVolumeId]);

  const loadMaterials = async (topicId) => {
    try {
      setMaterialsLoading(true);
      const res = await api.get(`/api/cms/topics/${topicId}/materials`);
      setMaterials(res.data.materials ?? []);
    } catch {
      setMaterials([]);
    } finally {
      setMaterialsLoading(false);
    }
  };

  const openPreview = (topic) => {
    const course = (topic?.courseId ? courses.find(c => c.id === topic.courseId) : null) || courses.find(c => c.level === topic.level);
    if (course) {
      const back = encodeURIComponent('/admin/topics');
      navigate(`/admin/courses/${course.id}/preview?topicId=${topic.id}&back=${back}`);
    } else {
      message.warning('No course with this topic\'s level. Create a course for this level to use the full preview.');
    }
  };

  const openExamView = async (examRow) => {
    try {
      setExamViewLoading(true);
      const { data: ed } = await api.get(`/api/exams/${examRow.id}`);
      const exam = ed.exam;
      setExamViewExam(exam);
      const params = exam?.type === 'QUIZ' && exam?.topicId ? { topicId: exam.topicId } : { level: exam.level };
      const { data: ql } = await api.get('/api/cms/questions', { params });
      const detailed = await Promise.all(
        (ql.questions || []).map(async (q) => {
          const { data } = await api.get(`/api/cms/questions/${q.id}`);
          return data.question;
        })
      );
      setExamViewQuestions(detailed);
      setExamViewOpen(true);
    } catch (e) {
      message.error('Failed to load exam');
    } finally {
      setExamViewLoading(false);
    }
  };

  const addQuiz = (topic) => {
    const back = encodeURIComponent('/admin/topics');
    const params = new URLSearchParams({ mode: 'quiz', back, topicId: topic?.id || '' }).toString();
    navigate(`/admin/exams/builder?${params}`);
  };

  const submit = async (values) => {
    try {
      setSavingTopic(true);
      const course = courses.find(c => c.id === values.courseId);
      const level = course?.level;
      if (!level) {
        message.error('Please select a course');
        return;
      }
      if (!values.moduleId) {
        message.error('Please select a module');
        return;
      }
      const payload = {
        name: values.name,
        courseId: values.courseId,
        moduleId: values.moduleId,
        level
      };
      if (editing) {
        await api.put(`/api/cms/topics/${editing.id}`, payload);
        message.success('Topic updated');
        setTopicStep(1);
        await loadMaterials(editing.id);
        load();
      } else {
        const { data } = await api.post('/api/cms/topics', payload);
        const created = data?.topic;
        if (created?.id) {
          message.success('Topic created');
          setEditing(created);
          setTopicStep(1);
          await loadMaterials(created.id);
          load();
        } else {
          form.resetFields();
          setDrawerOpen(false);
          load();
        }
      }
    } catch {
      message.error('Failed to save topic (admin only)');
    } finally {
      setSavingTopic(false);
    }
  };

  const submitModule = async (values) => {
    try {
      const volumeId = values.volumeId ? String(values.volumeId) : '';
      const courseId = values.courseId ? String(values.courseId) : '';
      if (!courseId) {
        message.error('Please select a course');
        return;
      }
      if (!volumeId) {
        message.error('Please select a volume');
        return;
      }

      const course = courses.find(c => c.id === courseId);
      const level = course?.level;
      if (editingModule) {
        await api.put(`/api/cms/modules/${editingModule.id}`, {
          name: values.name,
          ...(courseId ? { courseId } : {}),
          ...(typeof level !== 'undefined' ? { level } : {}),
          volumeId,
          order: values.order != null ? Number(values.order) : undefined
        });
        message.success('Module updated');
      } else {
        await api.post('/api/cms/modules', {
          name: values.name,
          ...(courseId ? { courseId } : {}),
          ...(typeof level !== 'undefined' ? { level } : {}),
          volumeId,
          order: values.order != null ? Number(values.order) : undefined
        });
        message.success('Module created');
      }
      moduleForm.resetFields();
      setEditingModule(null);
      setModuleDrawerOpen(false);
      load();
    } catch {
      message.error('Failed to save module');
    }
  };

  const removeModule = async (record) => {
    try {
      await api.delete(`/api/cms/modules/${record.id}`);
      message.success('Module deleted');
      load();
    } catch {
      message.error('Failed to delete module');
    }
  };

  const remove = async (record) => {
    try {
      await api.delete(`/api/cms/topics/${record.id}`);
      message.success('Deleted');
      load();
    } catch {
      message.error('Failed to delete');
    }
  };

  const moveTopic = async (record, direction) => {
    const idx = data.findIndex(t => t.id === record.id);
    if (idx < 0) return;
    const arr = [...data];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    const tmp = arr[idx]; arr[idx] = arr[swapIdx]; arr[swapIdx] = tmp;
    // optimistic update
    setData(arr);
    try {
      await api.post('/api/cms/topics/reorder', { ids: arr.map(t => t.id) });
      message.success('Reordered');
    } catch {
      message.error('Reorder failed');
      load();
    }
  };

  const openManage = async (record) => {
    setEditing(record);
    await loadMaterials(record.id);
    setManageOpen(true);
  };

  const saveMaterial = async (values) => {
    try {
      if (!editing) return;
      if (values.id) {
        await api.put(`/api/cms/materials/${values.id}`, values);
        message.success('Material updated');
      } else {
        await api.post(`/api/cms/topics/${editing.id}/materials`, values);
        message.success('Material created');
      }
      setMaterialModalOpen(false);
      materialForm.resetFields();
      loadMaterials(editing.id);
    } catch {
      message.error('Failed to save material');
    }
  };

  const removeMaterial = async (row) => {
    try {
      await api.delete(`/api/cms/materials/${row.id}`);
      message.success('Deleted');
      loadMaterials(editing.id);
    } catch {
      message.error('Delete failed');
    }
  };

  const materialsColumns = [
    { title: 'Title', dataIndex: 'title' },
    { title: 'Kind', dataIndex: 'kind' },
    { title: 'Est. min', dataIndex: 'estimatedSeconds', render: (v) => v ? Math.ceil(v / 60) : '-' },
    { title: 'URL', dataIndex: 'url', render: (v) => v ? <a href={asUrl(v)} target="_blank" rel="noreferrer">{v}</a> : '-' },
    { title: 'Updated', dataIndex: 'updatedAt', render: v => v ? new Date(v).toLocaleString() : '-' },
    {
      title: 'Actions',
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => { materialForm.setFieldsValue(row); setMaterialModalOpen(true); }}>Edit</Button>
          <Popconfirm title="Delete material?" onConfirm={() => removeMaterial(row)}>
            <Button size="small" danger>Delete</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const columns = [
    { title: 'Order', dataIndex: 'order', width: 90, render: (_v, r, idx) => (
      <Space size={4}>
        <Button size="small" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => moveTopic(r, 'up')} />
        <Button size="small" icon={<ArrowDownOutlined />} disabled={idx === data.length - 1} onClick={() => moveTopic(r, 'down')} />
      </Space>
    ) },
    { title: 'Module', dataIndex: ['module', 'name'], width: 140, render: (v) => v ? <Tag color="default">{v}</Tag> : '—' },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Level', dataIndex: 'level', render: (v) => <Tag color="blue">{v}</Tag> },
    {
      title: 'Actions',
      render: (_, record) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => {
            setEditing(record);
            setTopicStep(0);
            const courseId = record.courseId ?? (courses.find(c => c.level === record.level)?.id ?? '');
            form.setFieldsValue({ name: record.name, moduleId: record.moduleId || '', courseId });
            setDrawerOpen(true);
          }}>
            Edit
          </Button>
          <Button size="small" onClick={() => openManage(record)}>Manage</Button>
          <Button size="small" onClick={() => openPreview(record)}>Preview</Button>
          <Popconfirm title="Delete topic?" onConfirm={() => remove(record)}>
            <Button danger icon={<DeleteOutlined />} size="small">Delete</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const moduleOptions = modules.map(m => ({ value: m.id, label: `${m.name} (${m.level})` }));

  return (
    <Card
      title="Admin · Modules & Topics"
      extra={
        <Space>
          <Button icon={<FolderOutlined />} onClick={() => { setEditingModule(null); moduleForm.resetFields(); moduleForm.setFieldsValue({ courseId: filterModuleCourseId || '', level: 'LEVEL1' }); setModuleDrawerOpen(true); }}>
            New Module
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setTopicStep(0); form.resetFields(); form.setFieldsValue({ courseId: '', moduleId: '' }); setDrawerOpen(true); }}>
            New Topic
          </Button>
        </Space>
      }
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        {
          key: 'modules',
          label: 'Modules',
          children: (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space wrap align="center">
                <span>Course:</span>
                <Select
                  value={filterModuleCourseId || undefined}
                  onChange={(v) => setFilterModuleCourseId(v ?? '')}
                  placeholder="All courses"
                  allowClear
                  style={{ minWidth: 220 }}
                  options={[
                    { label: 'All courses', value: '' },
                    ...courses.map(c => ({ value: c.id, label: `${c.name} (${c.level})` }))
                  ]}
                  showSearch
                  optionFilterProp="label"
                />
                <span>Volume:</span>
                <Select
                  value={filterVolumeId || undefined}
                  onChange={(v) => setFilterVolumeId(v ?? '')}
                  placeholder="All volumes"
                  allowClear
                  style={{ minWidth: 220 }}
                  options={[
                    { label: 'All volumes', value: '' },
                    ...(volumes || []).map(v => ({ value: v.id, label: `${v.name}` }))
                  ]}
                  showSearch
                  optionFilterProp="label"
                />
                <Button onClick={() => setFilterModuleCourseId('')}>Reset</Button>
              </Space>
              <Table
                rowKey="id"
                loading={loading}
                dataSource={modules}
                size={isMobile ? 'small' : 'middle'}
                scroll={isMobile ? { x: 'max-content' } : undefined}
                pagination={{ pageSize: 20 }}
                expandable={{
                  defaultExpandAllRows: false,
                  expandedRowRender: (record) => {
                    const topicList = record.topics ?? [];
                    if (topicList.length === 0) return <span style={{ color: '#999', paddingLeft: 8 }}>No topics in this module</span>;
                    return (
                      <Table
                        size="small"
                        rowKey="id"
                        dataSource={topicList}
                        scroll={isMobile ? { x: 'max-content' } : undefined}
                        pagination={false}
                        columns={[
                          { title: 'Order', dataIndex: 'order', width: 70 },
                          { title: 'Name', dataIndex: 'name' },
                          { title: 'Level', dataIndex: 'level', render: (v) => v ? <Tag color="blue">{v}</Tag> : '—' },
                          {
                            title: 'Actions',
                            width: 260,
                            render: (_, topicRow) => (
                              <Space size={4}>
                                <Button icon={<EditOutlined />} size="small" onClick={() => {
                                  setEditing(topicRow);
                                  const courseId = topicRow.courseId ?? (courses.find(c => c.level === topicRow.level)?.id ?? '');
                                  form.setFieldsValue({ name: topicRow.name, moduleId: topicRow.moduleId || '', courseId });
                                  setDrawerOpen(true);
                                }}>Edit</Button>
                                <Button size="small" onClick={() => openManage(topicRow)}>Manage</Button>
                                <Button size="small" onClick={() => openPreview(topicRow)}>Preview</Button>
                                <Popconfirm title="Delete topic?" onConfirm={() => remove(topicRow)}>
                                  <Button danger icon={<DeleteOutlined />} size="small">Delete</Button>
                                </Popconfirm>
                              </Space>
                            )
                          }
                        ]}
                      />
                    );
                  },
                  rowExpandable: () => true
                }}
                columns={[
                  { title: 'Name', dataIndex: 'name' },
                  {
                    title: 'Course',
                    key: 'course',
                    render: (_, record) => {
                      const linked = record.courseId ? courses.find(c => c.id === record.courseId) : null;
                      if (linked) return <Tag key={linked.id} color="blue" style={{ marginBottom: 2 }}>{linked.name}</Tag>;
                      const matching = courses.filter(c => c.level === record.level);
                      if (matching.length === 0) return <span style={{ color: '#999' }}>—</span>;
                      return matching.map(c => <Tag key={c.id} color="blue" style={{ marginBottom: 2 }}>{c.name}</Tag>);
                    }
                  },
                  { title: 'Order', dataIndex: 'order', width: 80 },
                  {
                    title: 'Topics',
                    dataIndex: 'topics',
                    width: 90,
                    render: (arr) => (arr?.length ?? 0)
                  },
                  {
                    title: 'Actions',
                    width: 180,
                    render: (_, record) => (
                      <Space>
                        <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingModule(record); moduleForm.setFieldsValue(record); setModuleDrawerOpen(true); }}>Edit</Button>
                        <Popconfirm title="Delete module? Topics will be unlinked." onConfirm={() => removeModule(record)}>
                          <Button size="small" danger icon={<DeleteOutlined />}>Delete</Button>
                        </Popconfirm>
                      </Space>
                    )
                  }
                ]}
              />
            </Space>
          )
        },
        {
          key: 'topics',
          label: 'Topics',
          children: (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Space wrap align="center">
                <span>Course:</span>
                <Select
                  value={filterCourseId || undefined}
                  onChange={(v) => setFilterCourseId(v ?? '')}
                  options={[
                    { label: 'All courses', value: '' },
                    ...courses.map(c => ({ value: c.id, label: `${c.name} (${c.level})` }))
                  ]}
                  style={{ minWidth: 220 }}
                  allowClear
                  placeholder="All courses"
                  showSearch
                  optionFilterProp="label"
                />
                <span>Module:</span>
                <Select
                  value={filterModuleId || undefined}
                  onChange={(v) => setFilterModuleId(v ?? '')}
                  options={[
                    { label: 'All modules', value: '' },
                    ...modules
                      .filter(m => {
                        if (!filterCourseId) return true;
                        if (m.courseId) return m.courseId === filterCourseId;
                        const lvl = courses.find(c => c.id === filterCourseId)?.level;
                        return lvl ? m.level === lvl : true;
                      })
                      .map(m => ({ value: m.id, label: `${m.name} (${m.level})` }))
                  ]}
                  style={{ minWidth: 200 }}
                  allowClear
                  placeholder="All modules"
                />
                <Input
                  prefix={<SearchOutlined />}
                  placeholder="Search topic name"
                  value={filterQ}
                  onChange={(e) => setFilterQ(e.target.value)}
                  allowClear
                  style={{ width: 220 }}
                  onPressEnter={() => load()}
                />
                <Button onClick={() => load()}>Apply</Button>
                <Button onClick={() => { setFilterCourseId(''); setFilterModuleId(''); setFilterQ(''); }}>Reset</Button>
              </Space>
              <Table rowKey="id" loading={loading} dataSource={data} columns={columns} pagination={{ total, pageSize: 20 }} />
            </Space>
          )
        }
      ]} />

      <Drawer
        title={editingModule ? 'Edit Module' : 'Create Module'}
        open={moduleDrawerOpen}
        onClose={() => setModuleDrawerOpen(false)}
        width={400}
        destroyOnClose
      >
        <Form layout="vertical" form={moduleForm} onFinish={submitModule} initialValues={{ level: 'LEVEL1' }}>
          <Form.Item name="name" label="Module Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Module 1: Ethics" />
          </Form.Item>
          <Form.Item name="courseId" label="Course" rules={[{ required: true, message: 'Select a course' }]}>
            <Select
              placeholder="Select a course"
              options={courses.map(c => ({ value: c.id, label: `${c.name} (${c.level})` }))}
              showSearch
              optionFilterProp="label"
														onChange={async (v) => {
															setModuleCourseId(v ?? '');
															moduleForm.setFieldsValue({ volumeId: undefined });
															try {
																const volRes = await api.get('/api/cms/volumes', { params: v ? { courseId: v } : {} });
																const volList = (volRes.data.volumes ?? []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
																setVolumes(volList);
															} catch {
																setVolumes([]);
															}
														}}
            />
          </Form.Item>
          <Form.Item name="volumeId" label="Volume" rules={[{ required: true, message: 'Select a volume' }]}>
            <Select
              placeholder="Select a volume"
              options={(volumes || []).map(v => ({ value: v.id, label: v.name }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="level" label="Level" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="order" label="Order">
            <Input type="number" min={0} placeholder="Display order" />
          </Form.Item>
          <Space>
            <Button onClick={() => setModuleDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit">{editingModule ? 'Update' : 'Create'}</Button>
          </Space>
        </Form>
      </Drawer>

      <Drawer
        title={editing ? `Edit Topic · ${editing.name}` : 'New Topic'}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setTopicStep(0); setEditing(null); }}
        width={860}
        destroyOnClose={false}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Steps size="small" current={topicStep} items={[{ title: 'Details' }, { title: 'Learning Materials' }]} />
          <Form layout="vertical" form={form} onFinish={submit} initialValues={{ courseId: '', moduleId: '' }}>
            {topicStep === 0 && (
              <>
                <Form.Item name="name" label="Topic Name" rules={[{ required: true }]}>
                  <Input placeholder="e.g. Ethics and Professional Standards" />
                </Form.Item>
                <Form.Item name="courseId" label="Course" rules={[{ required: true, message: 'Select a course' }]}>
                  <Select
                    placeholder="Select a course (topic level = course level)"
                    options={courses.map(c => ({ value: c.id, label: `${c.name} (${c.level})` }))}
                    showSearch
                    optionFilterProp="label"
                  />
                </Form.Item>
                <Form.Item noStyle shouldUpdate={(prev, curr) => prev.courseId !== curr.courseId}>
                  {({ getFieldValue }) => {
                    const courseId = getFieldValue('courseId');
                    const course = courses.find(c => c.id === courseId);
                    const moduleOpts = courseId
                      ? modules
                        .filter(m => (m.courseId ? m.courseId === courseId : (course ? m.level === course.level : true)))
                        .map(m => ({ value: m.id, label: `${m.name} (${m.level})` }))
                      : moduleOptions;
                    return (
                      <Form.Item name="moduleId" label="Module" rules={[{ required: true, message: 'Select a module' }]}>
                        <Select
                          placeholder="Select a module"
                          options={moduleOpts}
                        />
                      </Form.Item>
                    );
                  }}
                </Form.Item>
                <Space>
                  <Button onClick={() => { setDrawerOpen(false); setTopicStep(0); setEditing(null); }}>Cancel</Button>
                  <Button type="primary" loading={savingTopic} htmlType="submit">{editing ? 'Save & Continue' : 'Create & Continue'}</Button>
                </Space>
              </>
            )}
          </Form>
          {topicStep === 1 && editing && (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Title level={5} style={{ margin: 0 }}>Learning Materials</Typography.Title>
              <Space style={{ marginBottom: 12 }}>
                <Button type="primary" onClick={() => { materialForm.resetFields(); setMaterialEditing(null); setMaterialModalOpen(true); }}>New Material</Button>
              </Space>
              <Table
                rowKey="id"
                loading={materialsLoading}
                dataSource={materials}
                columns={materialsColumns}
                size={isMobile ? 'small' : 'middle'}
                scroll={isMobile ? { x: 'max-content' } : undefined}
                pagination={false}
              />
              <Space>
                <Button onClick={() => setTopicStep(0)}>Back</Button>
                <Button type="primary" onClick={() => { setDrawerOpen(false); setTopicStep(0); setEditing(null); }}>Done</Button>
              </Space>
            </Space>
          )}
        </Space>
      </Drawer>

      <Drawer
        title={editing ? `Manage: ${editing.name}` : 'Manage Topic'}
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        width={840}
        destroyOnClose
      >
        <Tabs
          defaultActiveKey="materials"
          items={[
            {
              key: 'materials',
              label: 'Learning Materials',
              children: (
                <>
                  <Space style={{ marginBottom: 12 }}>
                    <Button type="primary" onClick={() => { materialForm.resetFields(); setMaterialModalOpen(true); }}>New Material</Button>
                  </Space>
                  <Table rowKey="id" dataSource={materials} columns={materialsColumns} pagination={false} />
                </>
              )
            },
            {
              key: 'exams',
              label: 'Exams (Builder)',
              children: (
                <div>
                  Build topic-specific exams in the Exam Builder (filter by level). Go to Testing → Exam Builder.
                </div>
              )
            }
          ]}
        />
      </Drawer>

      {/* Exam / Quiz View Drawer */}
      <Drawer
        title={examViewExam ? (examViewExam.type === 'QUIZ' ? 'Quiz Preview' : 'Exam Preview') : 'Exam Preview'}
        open={examViewOpen}
        width={820}
        onClose={() => setExamViewOpen(false)}
      >
        {examViewLoading ? (
          <Typography.Text>Loading...</Typography.Text>
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {examViewExam && (
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="Name" span={2}>{examViewExam.name}</Descriptions.Item>
                <Descriptions.Item label="Type">{examViewExam.type || (examViewExam.name?.toLowerCase().includes('quiz') ? 'QUIZ' : 'COURSE')}</Descriptions.Item>
                <Descriptions.Item label="Level">{examViewExam.level}</Descriptions.Item>
                <Descriptions.Item label="Time Limit (min)">{examViewExam.timeLimitMinutes}</Descriptions.Item>
                <Descriptions.Item label="Active">{examViewExam.active ? 'Yes' : 'No'}</Descriptions.Item>
              </Descriptions>
            )}
            <Divider />
            {(examViewQuestions || []).map((q, idx) => (
              <Card key={q.id} size="small" bordered>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Typography.Text strong>{`Q${idx + 1}. ${q.stem}`}</Typography.Text>
                  {q.type === 'MCQ' || q.type === 'VIGNETTE_MCQ' ? (
                    <Radio.Group
                      value={(q.options || []).find(o => o.isCorrect)?.id}
                      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                      disabled
                    >
                      {(q.options || []).map(o => (
                        <Radio key={o.id} value={o.id}>{o.text}</Radio>
                      ))}
                    </Radio.Group>
                  ) : (
                    <Typography.Text type="secondary">Constructed Response (no choices)</Typography.Text>
                  )}
                </Space>
              </Card>
            ))}
          </Space>
        )}
      </Drawer>

      <Modal
        title="Learning Material"
        open={materialModalOpen}
        onCancel={() => setMaterialModalOpen(false)}
        onOk={() => materialForm.submit()}
      >
        <Form layout="vertical" form={materialForm} onFinish={saveMaterial}>
          <Form.Item name="id" hidden><Input /></Form.Item>
          <Form.Item name="kind" label="Type" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'LINK', label: 'Link' },
                { value: 'PDF', label: 'PDF' },
                { value: 'VIDEO', label: 'Video' },
                { value: 'IMAGE', label: 'Image' },
                { value: 'HTML', label: 'HTML Content' }
              ]}
            />
          </Form.Item>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue, setFieldsValue }) => {
              const kind = getFieldValue('kind');
              const doUpload = async ({ file, onSuccess, onError }) => {
                try {
                  setUploading(true);
                  setUploadPct(0);
                  const fd = new FormData();
                  fd.append('file', file);
                  const { data } = await api.post('/api/cms/upload', fd, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    onUploadProgress: (e) => {
                      if (e.total) {
                        const pct = Math.round((e.loaded * 100) / e.total);
                        setUploadPct(pct);
                      } else {
                        setUploadPct(p => (p < 95 ? p + 5 : p));
                      }
                    }
                  });
                  setFieldsValue({ url: data.url });
                  // Try auto-detect duration for videos to prefill estimatedMinutes
                  try {
                    const currentKind = getFieldValue('kind');
                    if (currentKind === 'VIDEO' && data.url && typeof document !== 'undefined') {
                      const videoEl = document.createElement('video');
                      videoEl.style.position = 'fixed';
                      videoEl.style.left = '-9999px';
                      videoEl.src = data.url;
                      const onMeta = () => {
                        const dur = Math.max(1, Math.ceil((videoEl.duration || 0) / 60));
                        if (Number.isFinite(dur) && dur > 0) {
                          setFieldsValue({ estimatedMinutes: dur });
                        }
                        cleanup();
                      };
                      const onErr = () => cleanup();
                      const cleanup = () => {
                        try {
                          videoEl.removeEventListener('loadedmetadata', onMeta);
                          videoEl.removeEventListener('error', onErr);
                          videoEl.pause?.();
                          videoEl.src = '';
                        } catch {}
                      };
                      videoEl.addEventListener('loadedmetadata', onMeta);
                      videoEl.addEventListener('error', onErr);
                      // Kick off loading
                      videoEl.load?.();
                    }
                  } catch {}
                  onSuccess?.(data, file);
                  message.success('File uploaded');
                } catch (e) {
                  onError?.(e);
                  message.error('Upload failed');
                } finally {
                  setUploading(false);
                  setUploadPct(0);
                }
              };
              return (
                <>
                  {(kind === 'LINK' || kind === 'PDF' || kind === 'VIDEO' || kind === 'IMAGE') && (
                    <>
                      <Form.Item name="url" label="URL" rules={[{ required: true }]}>
                        <Input placeholder="https://..." />
                      </Form.Item>
                      <Upload customRequest={doUpload} showUploadList={false} disabled={uploading}>
                        <Button icon={<UploadOutlined />} loading={uploading}>
                          {uploading ? `Uploading ${uploadPct}%` : 'Upload File'}
                        </Button>
                      </Upload>
                      <Form.Item
                        name="estimatedMinutes"
                        label="Estimated time (minutes)"
                        tooltip="Used to calculate topic total time and progress. Auto-filled for videos where possible."
                        rules={[{ required: kind !== 'HTML', message: 'Please estimate minutes (or provide TEXT content).' }]}
                      >
                        <Input type="number" min={1} placeholder="e.g. 5" />
                      </Form.Item>
                    </>
                  )}
                  {kind === 'HTML' && (
                    <Form.Item name="contentHtml" label="TEXT Content" rules={[{ required: true }]}>
                      <Input.TextArea rows={6} placeholder="<p>Content...</p>" />
                    </Form.Item>
                  )}
                </>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
