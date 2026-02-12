import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Typography, Space, Button, Tabs, Table, Tag, Popconfirm, message, Modal, Select, Progress } from 'antd';
import { ArrowLeftOutlined, InfoCircleOutlined, ReadOutlined, BarChartOutlined, DollarOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';

const ENROLLMENT_STATUS_OPTIONS = [
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' }
];
import { api } from '../../lib/api';

export function AdminStudentView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [courses, setCourses] = useState([]);
  const [enrollCourseIds, setEnrollCourseIds] = useState([]);
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);
  const [progressCourses, setProgressCourses] = useState([]);
  const [progressLoading, setProgressLoading] = useState(false);

  const fetchProgress = async () => {
    if (!id) return;
    setProgressLoading(true);
    try {
      const { data } = await api.get(`/api/users/${id}/progress`);
      setProgressCourses(data.courses || []);
    } catch {
      setProgressCourses([]);
    } finally {
      setProgressLoading(false);
    }
  };

  const fetchUser = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/users/${id}`);
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoices = async () => {
    try {
      const { data } = await api.get(`/api/billing/invoices`, { params: { userId: id } });
      setInvoices(data.invoices || []);
    } catch {
      setInvoices([]);
    }
  };

  useEffect(() => { fetchUser(); fetchInvoices(); /* eslint-disable-next-line */ }, [id]);

  const openEnrollModal = async () => {
    setEnrollModalOpen(true);
    setEnrollCourseIds([]);
    try {
      const { data } = await api.get('/api/cms/courses');
      setCourses(data.courses || []);
    } catch {
      setCourses([]);
    }
  };

  const enrollInCourses = async () => {
    if (!enrollCourseIds?.length) {
      message.warning('Select at least one course');
      return;
    }
    setEnrollSubmitting(true);
    try {
      await api.post(`/api/users/${id}/enrollments`, { courseIds: enrollCourseIds });
      message.success(`Enrolled in ${enrollCourseIds.length} course(s)`);
      setEnrollModalOpen(false);
      setEnrollCourseIds([]);
      fetchUser();
    } catch (e) {
      message.error(e?.response?.data?.error || 'Failed to enroll');
    } finally {
      setEnrollSubmitting(false);
    }
  };

  const enrolledCourseIds = (user?.enrollments || []).map(e => e.course?.id).filter(Boolean);
  const availableCourses = courses.filter(c => !enrolledCourseIds.includes(c.id));

  const general = (
    <Descriptions column={1} bordered size="middle">
      <Descriptions.Item label="Name">{(user?.firstName || '-') + ' ' + (user?.lastName || '')}</Descriptions.Item>
      <Descriptions.Item label="Email">{user?.email}</Descriptions.Item>
      <Descriptions.Item label="Phone">{user?.phone || '-'}</Descriptions.Item>
      <Descriptions.Item label="Country">{user?.country || '-'}</Descriptions.Item>
      <Descriptions.Item label="Role">{user?.role}</Descriptions.Item>
      <Descriptions.Item label="Level">{user?.level}</Descriptions.Item>
      <Descriptions.Item label="Verified">{user?.emailVerifiedAt ? 'Yes' : 'No'}</Descriptions.Item>
      <Descriptions.Item label="Created">{user?.createdAt ? new Date(user.createdAt).toLocaleString() : '-'}</Descriptions.Item>
      <Descriptions.Item label="Updated">{user?.updatedAt ? new Date(user.updatedAt).toLocaleString() : '-'}</Descriptions.Item>
    </Descriptions>
  );

  const updateEnrollmentStatus = async (courseId, status) => {
    try {
      await api.put(`/api/users/${id}/enrollments/${courseId}`, { status });
      message.success('Status updated');
      fetchUser();
    } catch (e) {
      message.error(e?.response?.data?.error || 'Failed to update status');
    }
  };

  const enrollColumns = [
    { title: 'Course', dataIndex: ['course','name'] },
    { title: 'Level', dataIndex: ['course','level'] },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 160,
      render: (v, r) => {
        const status = v || 'IN_PROGRESS';
        const tagColor = status === 'COMPLETED' ? 'green' : status === 'CANCELLED' ? 'red' : 'blue';
        return (
          <Select
            size="small"
            value={status}
            onChange={(val) => updateEnrollmentStatus(r.course?.id, val)}
            options={ENROLLMENT_STATUS_OPTIONS}
            style={{ width: 130 }}
          />
        );
      }
    },
    { title: 'Enrolled At', dataIndex: 'createdAt', render: v => v ? new Date(v).toLocaleString() : '-' },
    {
      title: 'Actions',
      render: (_, r) => (
        <Space>
          <Button size="small" type="link" onClick={() => navigate(`/admin/courses/${r.course?.id}`)}>
            View Course
          </Button>
          <Popconfirm
            title="Unenroll student?"
            description="This will remove the student from this course."
            okText="Unenroll"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              try {
                await api.delete(`/api/users/${id}/enrollments/${r.course?.id}`);
                message.success('Student unenrolled from course');
                fetchUser();
              } catch (e) {
                message.error(e?.response?.data?.error || 'Failed to unenroll');
              }
            }}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>Unenroll</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const subsColumns = [
    { title: 'Provider', dataIndex: 'provider' },
    { title: 'Status', dataIndex: 'status', render: s => <Tag color={s === 'ACTIVE' ? 'green' : s === 'PAST_DUE' ? 'orange' : s === 'CANCELED' ? 'red' : 'blue'}>{s}</Tag> },
    { title: 'Product', dataIndex: 'plan', render: v => v || '-' },
    { title: 'Currency', dataIndex: 'currency', render: v => v || '-' },
    { title: 'Current Period End', dataIndex: 'currentPeriodEnd', render: v => v ? new Date(v).toLocaleString() : '-' },
    { title: 'Updated', dataIndex: 'updatedAt', render: v => v ? new Date(v).toLocaleString() : '-' }
  ];

  const payColumns = [
    { title: 'Provider', dataIndex: 'provider' },
    { title: 'Reference', dataIndex: 'reference' },
    { title: 'Amount', dataIndex: 'amount', render: v => v != null ? `$${(v/100).toFixed(2)}` : '-' },
    { title: 'Currency', dataIndex: 'currency' },
    { title: 'Status', dataIndex: 'status' },
    { title: 'Date', dataIndex: 'createdAt', render: v => v ? new Date(v).toLocaleString() : '-' }
  ];

  const invoiceColumns = [
    { title: 'Invoice #', dataIndex: 'number' },
    { title: 'Amount Paid', dataIndex: 'amountPaid', render: v => v != null ? `$${(v/100).toFixed(2)}` : '-' },
    { title: 'Currency', dataIndex: 'currency' },
    { title: 'Status', dataIndex: 'status' },
    { title: 'Date', dataIndex: 'created', render: v => v ? new Date(v).toLocaleString() : '-' },
    { title: 'Actions', render: (_, r) => (
      <Space>
        {r.hostedInvoiceUrl ? <a href={r.hostedInvoiceUrl} target="_blank" rel="noreferrer">View</a> : null}
        {r.invoicePdf ? <a href={r.invoicePdf} target="_blank" rel="noreferrer">Download PDF</a> : null}
      </Space>
    ) }
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/students')}>Back</Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : 'Student Details'}
          </Typography.Title>
        </Space>
      </Space>

      <Card loading={loading}>
        {user && (
          <Tabs
            defaultActiveKey="general"
            onChange={(key) => { if (key === 'progress') fetchProgress(); }}
            items={[
              {
                key: 'general',
                label: (
                  <Space size={6}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#e6f4ff', color: '#102540', border: '1px solid rgba(0,0,0,0.08)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)', fontSize: 14 }}>
                      <InfoCircleOutlined />
                    </span>
                    <span>General</span>
                  </Space>
                ),
                children: general
              },
              {
                key: 'academic',
                label: (
                  <Space size={6}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#f9f0ff', color: '#722ed1', border: '1px solid rgba(0,0,0,0.08)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)', fontSize: 14 }}>
                      <ReadOutlined />
                    </span>
                    <span>Academic</span>
                  </Space>
                ),
                children: (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Space>
                      <Button type="primary" icon={<PlusOutlined />} onClick={openEnrollModal}>
                        Enroll in course(s)
                      </Button>
                      <Typography.Text type="secondary">
                        {user.enrollments?.length ?? 0} course(s) enrolled
                      </Typography.Text>
                    </Space>
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={user.enrollments || []}
                      columns={enrollColumns}
                      pagination={false}
                    />
                  </Space>
                )
              },
              {
                key: 'progress',
                label: (
                  <Space size={6}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#fffbe6', color: '#faad14', border: '1px solid rgba(0,0,0,0.08)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)', fontSize: 14 }}>
                      <BarChartOutlined />
                    </span>
                    <span>Progress</span>
                  </Space>
                ),
                children: (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Typography.Text type="secondary">
                      Progress and exam status per enrolled course.
                    </Typography.Text>
                    <Table
                      rowKey="courseId"
                      size="small"
                      loading={progressLoading}
                      dataSource={progressCourses}
                      pagination={false}
                      expandable={{
                        expandedRowRender: (record) => {
                          const attempts = record.attempts || [];
                          if (attempts.length === 0) {
                            return <Typography.Text type="secondary">No exam attempts yet.</Typography.Text>;
                          }
                          return (
                            <Table
                              size="small"
                              rowKey="id"
                              dataSource={attempts}
                              pagination={false}
                              columns={[
                                { title: 'Exam', dataIndex: 'examName', key: 'examName' },
                                { title: 'Type', dataIndex: 'examType', key: 'examType', render: v => v === 'COURSE' ? 'Overall exam' : 'Quiz' },
                                { title: 'Status', dataIndex: 'status', key: 'status', render: s => <Tag color={s === 'SUBMITTED' ? 'blue' : 'default'}>{s}</Tag> },
                                { title: 'Score', dataIndex: 'scorePercent', key: 'scorePercent', render: v => v != null ? `${v}%` : '-' },
                                { title: 'Submitted', dataIndex: 'submittedAt', key: 'submittedAt', render: v => v ? new Date(v).toLocaleString() : '-' }
                              ]}
                            />
                          );
                        },
                        rowExpandable: () => true
                      }}
                      columns={[
                        { title: 'Course', dataIndex: 'courseName', key: 'courseName', render: (v, r) => <Space><strong>{v}</strong>{r.courseLevel ? <Tag>{r.courseLevel}</Tag> : null}</Space> },
                        { title: 'Enrollment status', dataIndex: 'enrollmentStatus', key: 'enrollmentStatus', width: 140, render: (v) => { const s = v || 'IN_PROGRESS'; const color = s === 'COMPLETED' ? 'green' : s === 'CANCELLED' ? 'red' : 'blue'; return <Tag color={color}>{s === 'IN_PROGRESS' ? 'In Progress' : s === 'COMPLETED' ? 'Completed' : 'Cancelled'}</Tag>; } },
                        { title: 'Course progress', dataIndex: 'progressPercent', key: 'progressPercent', width: 160, render: (v) => <Progress percent={v ?? 0} size="small" /> },
                        { title: 'Exams taken', dataIndex: 'attempts', key: 'attempts', width: 100, render: (attempts) => (attempts?.length ?? 0) },
                        { title: 'Overall exam', dataIndex: 'overallExamStatus', key: 'overallExamStatus', width: 120, render: (v) => { const s = v || 'Not taken'; const color = s === 'Passed' ? 'green' : s === 'Failed' ? 'red' : 'default'; return <Tag color={color}>{s}</Tag>; } }
                      ]}
                    />
                    {progressCourses.length === 0 && !progressLoading && (
                      <Typography.Text type="secondary">No enrolled courses. Enroll the student in the Academic tab to see progress.</Typography.Text>
                    )}
                  </Space>
                )
              },
              {
                key: 'billing',
                label: (
                  <Space size={6}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: '#f6ffed', color: '#52c41a', border: '1px solid rgba(0,0,0,0.08)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)', fontSize: 14 }}>
                      <DollarOutlined />
                    </span>
                    <span>Invoices & Subscriptions</span>
                  </Space>
                ),
                children: (
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Typography.Title level={5} style={{ margin: 0 }}>Subscriptions</Typography.Title>
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={user.subscriptions || []}
                      columns={subsColumns}
                      pagination={false}
                    />
                    <Typography.Title level={5} style={{ margin: 0 }}>Payments</Typography.Title>
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={user.payments || []}
                      columns={payColumns}
                      pagination={false}
                    />
                  <Typography.Title level={5} style={{ margin: 0 }}>Invoices</Typography.Title>
                  <Table
                    rowKey="id"
                    size="small"
                    dataSource={invoices || []}
                    columns={invoiceColumns}
                    pagination={false}
                  />
                  </Space>
                )
              }
            ]}
          />
        )}
      </Card>

      <Modal
        title="Enroll student in course(s)"
        open={enrollModalOpen}
        onCancel={() => { setEnrollModalOpen(false); setEnrollCourseIds([]); }}
        onOk={enrollInCourses}
        okText="Enroll"
        confirmLoading={enrollSubmitting}
        destroyOnClose
        width={480}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            Select one or more courses. Already enrolled courses are not shown.
          </Typography.Text>
          <Select
            mode="multiple"
            placeholder="Select courses"
            value={enrollCourseIds}
            onChange={setEnrollCourseIds}
            style={{ width: '100%' }}
            options={availableCourses.map(c => ({ value: c.id, label: `${c.name} (${c.level})` }))}
            showSearch
            optionFilterProp="label"
            allowClear
          />
          {availableCourses.length === 0 && enrollModalOpen && (
            <Typography.Text type="secondary">No more courses to enroll. Student is already in all available courses.</Typography.Text>
          )}
        </Space>
      </Modal>
    </Space>
  );
}

