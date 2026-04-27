import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Button, Typography, Table, Tag, Modal, Form, Input, Select, DatePicker,
  Space, message, Tooltip, Spin, Empty, Popconfirm, Badge, Statistic, Row, Col
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, CalendarOutlined, TeamOutlined,
  BookOutlined, ClockCircleOutlined, CheckCircleOutlined, SyncOutlined,
  ExclamationCircleOutlined, SearchOutlined, ReloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api from '../../lib/api';

dayjs.extend(relativeTime);

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export default function AdminMockExams() {
  const [mockExams, setMockExams] = useState([]);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [filterCourse, setFilterCourse] = useState(null);
  const [form] = Form.useForm();

  const fetchScheduled = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterCourse ? `?courseId=${filterCourse}` : '';
      const { data } = await api.get(`/api/exams/mock/scheduled${params}`);
      setMockExams(data.mockExams || []);
    } catch (err) {
      message.error('Failed to load scheduled mock exams');
    } finally {
      setLoading(false);
    }
  }, [filterCourse]);

  const fetchCourses = useCallback(async () => {
    try {
      const { data } = await api.get('/api/cms/courses');
      setCourses(data.courses || data || []);
    } catch { /* ignore */ }
  }, []);

  const fetchStudents = useCallback(async () => {
    try {
      const { data } = await api.get('/api/users?role=STUDENT&take=100');
      setStudents(data.users || data || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchCourses(); fetchStudents(); }, [fetchCourses, fetchStudents]);
  useEffect(() => { fetchScheduled(); }, [fetchScheduled]);

  const handleCreate = async (values) => {
    setCreating(true);
    try {
      const payload = {
        courseId: values.courseId,
        studentIds: values.studentIds,
        title: values.title,
      };
      if (values.dateRange?.[0]) payload.availableFrom = values.dateRange[0].toISOString();
      if (values.dateRange?.[1]) payload.availableUntil = values.dateRange[1].toISOString();

      const { data } = await api.post('/api/exams/mock/schedule', payload);
      message.success(`Scheduled for ${data.created} student(s)${data.skipped ? ` (${data.skipped} skipped — already have active mock)` : ''}`);
      setModalOpen(false);
      form.resetFields();
      fetchScheduled();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to schedule mock exam');
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (id) => {
    try {
      await api.delete(`/api/exams/mock/scheduled/${id}`);
      message.success('Mock exam cancelled');
      fetchScheduled();
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to cancel');
    }
  };

  const statusTag = (status) => {
    const map = {
      PENDING: { color: 'gold', icon: <ClockCircleOutlined /> },
      SESSION1: { color: 'processing', icon: <SyncOutlined spin /> },
      BREAK: { color: 'cyan', icon: <ClockCircleOutlined /> },
      SESSION2: { color: 'processing', icon: <SyncOutlined spin /> },
      COMPLETED: { color: 'success', icon: <CheckCircleOutlined /> },
      CANCELLED: { color: 'default', icon: <ExclamationCircleOutlined /> },
    };
    const s = map[status] || map.PENDING;
    return <Tag color={s.color} icon={s.icon}>{status}</Tag>;
  };

  const columns = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (t) => <Text strong>{t || 'Untitled'}</Text>,
      ellipsis: true,
    },
    {
      title: 'Student',
      key: 'student',
      render: (_, r) => (
        <div>
          <Text className="block">{r.user?.firstName} {r.user?.lastName}</Text>
          <Text type="secondary" className="text-xs">{r.user?.email}</Text>
        </div>
      ),
    },
    {
      title: 'Course',
      key: 'course',
      render: (_, r) => <Tag color="blue">{r.course?.name}</Tag>,
      filters: courses.map(c => ({ text: c.name, value: c.id })),
      onFilter: (v, r) => r.courseId === v,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: statusTag,
      filters: ['PENDING', 'SESSION1', 'SESSION2', 'COMPLETED', 'CANCELLED'].map(s => ({ text: s, value: s })),
      onFilter: (v, r) => r.status === v,
    },
    {
      title: 'Available',
      key: 'available',
      render: (_, r) => {
        if (!r.availableFrom && !r.availableUntil) return <Text type="secondary">Anytime</Text>;
        return (
          <div className="text-xs">
            {r.availableFrom && <div>From: {dayjs(r.availableFrom).format('DD MMM YYYY HH:mm')}</div>}
            {r.availableUntil && <div>Until: {dayjs(r.availableUntil).format('DD MMM YYYY HH:mm')}</div>}
          </div>
        );
      },
    },
    {
      title: 'Questions',
      key: 'questions',
      render: (_, r) => {
        const s1 = r.session1Exam?.examQuestions?.length || 0;
        const s2 = r.session2Exam?.examQuestions?.length || 0;
        return <Text>{s1 + s2} Qs</Text>;
      },
    },
    {
      title: 'Scheduled',
      key: 'created',
      render: (_, r) => (
        <Tooltip title={dayjs(r.createdAt).format('DD MMM YYYY HH:mm')}>
          <Text type="secondary" className="text-xs">{dayjs(r.createdAt).fromNow()}</Text>
        </Tooltip>
      ),
      sorter: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      defaultSortOrder: 'ascend',
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_, r) => r.status === 'PENDING' ? (
        <Popconfirm title="Cancel this scheduled mock?" onConfirm={() => handleCancel(r.id)} okText="Yes" cancelText="No">
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ) : null,
    },
  ];

  // Stats
  const total = mockExams.length;
  const pending = mockExams.filter(m => m.status === 'PENDING').length;
  const inProgress = mockExams.filter(m => ['SESSION1', 'SESSION2', 'BREAK'].includes(m.status)).length;
  const completed = mockExams.filter(m => m.status === 'COMPLETED').length;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <Title level={3} className="!mb-1">Scheduled Mock Exams</Title>
          <Text type="secondary">Create and manage mock exams assigned to students</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchScheduled} loading={loading}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}
            style={{ background: 'linear-gradient(135deg, #102540, #1e3a5f)' }}>
            Schedule Mock Exam
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={12} sm={6}><Card className="stat-card"><Statistic title="Total Scheduled" value={total} prefix={<CalendarOutlined />} /></Card></Col>
        <Col xs={12} sm={6}><Card className="stat-card"><Statistic title="Pending" value={pending} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#d97706' }} /></Card></Col>
        <Col xs={12} sm={6}><Card className="stat-card"><Statistic title="In Progress" value={inProgress} prefix={<SyncOutlined />} valueStyle={{ color: '#2563eb' }} /></Card></Col>
        <Col xs={12} sm={6}><Card className="stat-card"><Statistic title="Completed" value={completed} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#16a34a' }} /></Card></Col>
      </Row>

      <Card className="modern-card">
        <div className="mb-4">
          <Select
            allowClear
            placeholder="Filter by course"
            style={{ width: 260 }}
            value={filterCourse}
            onChange={setFilterCourse}
            options={courses.map(c => ({ label: c.name, value: c.id }))}
          />
        </div>
        <Table
          dataSource={mockExams}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 900 }}
          locale={{ emptyText: <Empty description="No scheduled mock exams yet" /> }}
          className="modern-table"
        />
      </Card>

      <Modal
        title="Schedule Mock Exam"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        footer={null}
        width={600}
        className="modern-modal"
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} className="mt-4">
          <Form.Item name="title" label="Exam Title" rules={[{ required: true, message: 'Enter a title' }]}>
            <Input placeholder="e.g. Mid-Term Mock Exam — June 2026" maxLength={200} />
          </Form.Item>

          <Form.Item name="courseId" label="Course" rules={[{ required: true, message: 'Select a course' }]}>
            <Select
              placeholder="Select course"
              showSearch
              optionFilterProp="label"
              options={courses.map(c => ({ label: `${c.name} (${c.level?.replace('LEVEL', 'L')})`, value: c.id }))}
            />
          </Form.Item>

          <Form.Item name="studentIds" label="Students" rules={[{ required: true, message: 'Select at least one student' }]}>
            <Select
              mode="multiple"
              placeholder="Select students"
              showSearch
              optionFilterProp="label"
              maxTagCount={5}
              options={students.map(s => ({
                label: `${s.firstName || ''} ${s.lastName || ''} (${s.email})`.trim(),
                value: s.id
              }))}
              dropdownRender={(menu) => (
                <div>
                  {menu}
                  <div className="p-2 border-t">
                    <Button
                      type="link"
                      size="small"
                      onClick={() => form.setFieldsValue({ studentIds: students.map(s => s.id) })}
                    >
                      Select all students
                    </Button>
                  </div>
                </div>
              )}
            />
          </Form.Item>

          <Form.Item name="dateRange" label="Availability Window (optional)">
            <RangePicker
              showTime={{ format: 'HH:mm' }}
              format="DD MMM YYYY HH:mm"
              placeholder={['Available from', 'Available until']}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <div className="flex justify-end gap-3 mt-6">
            <Button onClick={() => { setModalOpen(false); form.resetFields(); }}>Cancel</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={creating}
              icon={<CalendarOutlined />}
              style={{ background: 'linear-gradient(135deg, #102540, #1e3a5f)' }}
            >
              Schedule
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
