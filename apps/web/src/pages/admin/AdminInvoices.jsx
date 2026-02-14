import React, { useEffect, useState } from 'react';
import { Card, Table, Space, Button, Typography, Modal, Form, Select, message, DatePicker, Tag, Tooltip, Input, Dropdown, Grid } from 'antd';
import { PlusOutlined, FileTextOutlined, DownloadOutlined, SendOutlined, StopOutlined, ExclamationCircleOutlined, EditOutlined, DownOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../../lib/api';

const { RangePicker } = DatePicker;

export function AdminInvoices() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [filterUserId, setFilterUserId] = useState(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const [taxes, setTaxes] = useState([]);
  const [taxId, setTaxId] = useState();
  const [editOpen, setEditOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm] = Form.useForm();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState(null);
  const [statusFilter, setStatusFilter] = useState();
  const [query, setQuery] = useState('');
  const [editDetail, setEditDetail] = useState(null);
  const [replaceProducts, setReplaceProducts] = useState([]);
  const [replaceQty, setReplaceQty] = useState({});
  const [selectedStatus, setSelectedStatus] = useState('Pending');
  const [dateRange, setDateRange] = useState(null);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterUserId) params.userId = filterUserId;
      if (statusFilter) params.status = statusFilter;
      if (query && query.trim()) params.q = query.trim();
      const { data } = await api.get('/api/billing/invoices', { params });
      setInvoices(data.invoices || []);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };
  const loadUsers = async (q='') => {
    try {
      const { data } = await api.get('/api/users', { params: q ? { q } : {} });
      setUsers(data.users || []);
    } catch {}
  };
  const loadProducts = async () => {
    try {
      const { data } = await api.get('/api/billing/products', { params: { active: true } });
      setProducts((data.products || []).filter(p => p.interval && (typeof p.price === 'number' ? p.price > 0 : (p.priceCents > 0)))); // must be priced
    } catch {}
  };
  const loadTaxes = async () => {
    try {
      const { data } = await api.get('/api/billing/taxes');
      setTaxes(data.taxes || []);
    } catch {}
  };

  const filteredInvoices = invoices.filter((inv) => {
    if (!dateRange || dateRange.length !== 2 || !dateRange[0] || !dateRange[1]) return true;
    if (!inv.created) return false;
    const createdTs = new Date(inv.created).getTime();
    const startTs = dateRange[0].startOf('day').valueOf();
    const endTs = dateRange[1].endOf('day').valueOf();
    if (Number.isNaN(createdTs) || Number.isNaN(startTs) || Number.isNaN(endTs)) return true;
    return createdTs >= startTs && createdTs <= endTs;
  });

  const getInvoiceAmountDue = (inv) => {
    if (inv?.status === 'paid' || inv?.displayStatus === 'Paid') return 0;
    if (typeof inv?.amountRemaining === 'number') return inv.amountRemaining;
    if (typeof inv?.amountDue === 'number') return inv.amountDue;
    return 0;
  };

  const getInvoiceAmountPaid = (inv) => {
    const total = typeof inv?.total === 'number'
      ? inv.total
      : (typeof inv?.amountDue === 'number' ? inv.amountDue : 0);

    if (inv?.status === 'paid' || inv?.displayStatus === 'Paid') return total;
    const due = getInvoiceAmountDue(inv);
    return Math.max(0, total - due);
  };

  const totals = filteredInvoices.reduce(
    (acc, inv) => ({
      total: acc.total + (typeof inv.total === 'number' ? inv.total : 0),
      paid: acc.paid + getInvoiceAmountPaid(inv),
      due: acc.due + getInvoiceAmountDue(inv),
    }),
    { total: 0, paid: 0, due: 0 }
  );

  useEffect(() => { loadProducts(); loadUsers(); loadTaxes(); /* eslint-disable-next-line */ }, []);
useEffect(() => { loadInvoices(); /* eslint-disable-next-line */ }, [filterUserId, statusFilter]);

  const onCreate = async (vals) => {
    setCreating(true);
    try {
      await api.post('/api/billing/invoices', {
        userId: vals.userId,
        productIds: vals.productIds,
        taxId: vals.taxId || undefined,
        finalize: true,
        send: true
      });
      message.success('Invoice created and sent');
      // Focus list on this user so the new invoice appears
      setFilterUserId(vals.userId);
      setOpen(false);
      form.resetFields();
      await loadInvoices();
    } catch (e) {
      message.error('Failed to create invoice');
    } finally {
      setCreating(false);
    }
  };

  const onAction = async (id, action) => {
    try {
      await api.put(`/api/billing/invoices/${id}`, { action });
      message.success(`Invoice ${action} ok`);
      await loadInvoices();
    } catch {
      message.error('Action failed');
    }
  };

  const onEdit = (row) => {
    setEditInvoice(row);
    // Do not prefill due date if parsing library is unavailable; user can set it
    setEditOpen(true);
    // load full details for editing (lines, status)
    (async () => {
      try {
        const { data } = await api.get(`/api/billing/invoices/${row.id}`);
        setEditDetail(data.invoice);
        // derive status label
        const raw = data.invoice?.status || 'open';
        const paid = data.invoice?.amountPaid || 0;
        const remaining = data.invoice?.amountRemaining || 0;
        let label = 'Pending';
        if (raw === 'paid') label = 'Paid';
        else if (raw === 'void') label = 'Cancelled';
        else if (raw === 'uncollectible') label = 'Unpaid';
        else if (raw === 'open') {
          label = paid === 0 ? 'Unpaid' : 'Pending';
        }
        setSelectedStatus(label);
      } catch {
        setEditDetail(null);
        setSelectedStatus(row.displayStatus || 'Pending');
      }
    })();
  };
  const onSaveEdit = async (vals) => {
    if (!editInvoice) return;
    setEditLoading(true);
    try {
      await api.put(`/api/billing/invoices/${editInvoice.id}`, {
        dueDate: vals.dueDate ? vals.dueDate.toISOString() : null
      });
      message.success('Invoice updated');
      setEditOpen(false);
      await loadInvoices();
    } catch {
      message.error('Failed to update invoice');
    } finally {
      setEditLoading(false);
    }
  };
  const onReplaceLines = async () => {
    if (!editDetail || editDetail.status !== 'draft') {
      message.error('Lines can only be edited for draft invoices');
      return;
    }
    const lines = (replaceProducts || []).map(pid => ({ productId: pid, quantity: replaceQty[pid] || 1 }));
    if (!lines.length) {
      message.error('Select at least one product');
      return;
    }
    setEditLoading(true);
    try {
      await api.patch(`/api/billing/invoices/${editDetail.id}/lines`, { lines });
      message.success('Invoice lines updated');
      const { data } = await api.get(`/api/billing/invoices/${editDetail.id}`);
      setEditDetail(data.invoice);
      await loadInvoices();
    } catch {
      message.error('Failed to update lines');
    } finally {
      setEditLoading(false);
    }
  };

  const columns = [
    { title: 'Invoice #', dataIndex: 'number' },
    { title: 'User', dataIndex: 'customerEmail', render: v => v || '-' },
    { title: 'Total', dataIndex: 'total', render: v => v != null ? `$${(v/100).toFixed(2)}` : '-' },
    { title: 'Amount Due', render: (_, r) => `$${(getInvoiceAmountDue(r)/100).toFixed(2)}` },
    { title: 'Amount Paid', render: (_, r) => `$${(getInvoiceAmountPaid(r)/100).toFixed(2)}` },
    { title: 'Currency', dataIndex: 'currency' },
    { title: 'Status', dataIndex: 'displayStatus', render: s => {
      const value = s || 'Pending';
      const color = value === 'Paid' ? 'green' : value === 'Pending' ? 'blue' : value === 'Cancelled' ? 'default' : value === 'Unpaid' ? 'orange' : 'red';
      return <Tag color={color}>{value}</Tag>;
    } },
    { title: 'Actions', render: (_, r) => {
        const items = [
          {
            key: 'view',
            disabled: !r.hostedInvoiceUrl,
            label: <span onClick={() => r.hostedInvoiceUrl && window.open(r.hostedInvoiceUrl, '_blank')}>View invoice</span>,
            icon: <FileTextOutlined />
          },
          {
            key: 'pdf',
            disabled: !r.invoicePdf,
            label: <span onClick={() => r.invoicePdf && window.open(r.invoicePdf, '_blank')}>Download PDF</span>,
            icon: <DownloadOutlined />
          },
          { type: 'divider' },
          {
            key: 'details',
            label: <span onClick={async () => {
              try {
                const { data } = await api.get(`/api/billing/invoices/${r.id}`);
                setDetailInvoice(data.invoice || r);
              } catch {
                setDetailInvoice(r);
              }
              setDetailOpen(true);
            }}>Details</span>,
            icon: <FileTextOutlined />
          },
          {
            key: 'edit',
            label: <span onClick={() => onEdit(r)}>Edit due date</span>,
            icon: <EditOutlined />
          },
          { type: 'divider' },
          {
            key: 'delete',
            danger: true,
            label: <span onClick={async () => {
              try {
                await api.delete(`/api/billing/invoices/${r.id}`);
                message.success('Deleted');
                await loadInvoices();
              } catch (e) {
                message.error('Delete failed (only draft invoices can be deleted)');
              }
            }}>Delete</span>,
            icon: <DeleteOutlined />
          },
        ];
        return (
          <Dropdown menu={{ items }} trigger={['click']}>
            <Button size="small">
              Actions <DownOutlined />
            </Button>
          </Dropdown>
        );
      }
    }
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <Typography.Title level={4} style={{ margin: 0 }}>Invoices</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Create Invoice</Button>
      </div>

      <Space wrap style={{ width: '100%' }}>
        <Button onClick={loadInvoices}>Refresh</Button>
        <Select
          allowClear
          placeholder="Filter by user"
          style={{ width: isMobile ? 260 : 260 }}
          value={filterUserId || undefined}
          onChange={setFilterUserId}
          showSearch
          onSearch={(v) => loadUsers(v)}
          optionFilterProp="label"
          options={(users || []).map(u => ({ label: `${u.email}${u.firstName ? ' - ' + u.firstName : ''}`, value: u.id }))}
        />
        <Select
          allowClear
          placeholder="Status"
          style={{ width: isMobile ? 160 : 160 }}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { label: 'Open', value: 'open' },
            { label: 'Paid', value: 'paid' },
            { label: 'Uncollectible', value: 'uncollectible' },
            { label: 'Void', value: 'void' },
            { label: 'Draft', value: 'draft' }
          ]}
        >
        </Select>
        <RangePicker
          value={dateRange}
          onChange={setDateRange}
          style={{ width: isMobile ? 260 : 260 }}
          placeholder={['From invoice date', 'To invoice date']}
        />
        <Input.Search
          placeholder="Search number, user, product…"
          allowClear
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onSearch={() => loadInvoices()}
          style={{ width: isMobile ? 260 : 260 }}
        />
      </Space>
      <Card>
        <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 8 }}>
          <Typography.Text strong>Totals (current filters)</Typography.Text>
          <Space size={8} wrap>
            <Tag color="blue">Total: ${ (totals.total / 100).toFixed(2) }</Tag>
            <Tag color="green">Paid: ${ (totals.paid / 100).toFixed(2) }</Tag>
            <Tag color="volcano">Due: ${ (totals.due / 100).toFixed(2) }</Tag>
          </Space>
        </Space>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={filteredInvoices}
          columns={columns}
          size={isMobile ? 'small' : 'middle'}
          scroll={isMobile ? { x: 'max-content' } : undefined}
          expandable={{
            expandedRowRender: (r) => (
              <div>
                <Typography.Text strong>Items</Typography.Text>
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={r.lines || []}
                  scroll={isMobile ? { x: 'max-content' } : undefined}
                  columns={[
                    { title: 'Product', dataIndex: 'productName' },
                    { title: 'Description', dataIndex: 'description' },
                    { title: 'Qty', dataIndex: 'quantity' },
                    { title: 'Amount', dataIndex: 'amount', render: v => v != null ? `$${(v/100).toFixed(2)}` : '-' }
                  ]}
                />
              </div>
            )
          }}
        />
      </Card>
      <Modal
        title="Create Invoice"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={creating}
      >
        <Form form={form} layout="vertical" onFinish={onCreate}>
          <Form.Item name="userId" label="User" rules={[{ required: true }]}>
            <Select showSearch placeholder="Select user" options={(users || []).map(u => ({ label: `${u.email}${u.firstName ? ' - ' + u.firstName : ''}`, value: u.id }))} />
          </Form.Item>
          <Form.Item name="productIds" label="Products" rules={[{ required: true }]}>
            <Select mode="multiple" placeholder="Select products" options={(products || []).map(p => ({ label: `${p.name} (${p.interval}) - $${(p.priceCents/100).toFixed(2)}`, value: p.id }))} />
          </Form.Item>
          <Form.Item name="taxId" label="Tax (optional)">
            <Select
              allowClear
              placeholder="Select tax (or default applied)"
              options={(taxes || []).filter(t => t.active).map(t => ({ label: `${t.name} (${t.ratePercent}%)${t.isDefault ? ' · Default' : ''}`, value: t.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="Edit Invoice"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => editForm.submit()}
        confirmLoading={editLoading}
      >
        <Form form={editForm} layout="vertical" onFinish={onSaveEdit}>
          <Form.Item name="dueDate" label="Due Date">
            <DatePicker showTime />
          </Form.Item>
          <Form.Item label="Status">
            <Space wrap>
              <Select
                style={{ width: 200 }}
                value={selectedStatus}
                onChange={setSelectedStatus}
                options={[
                  { label: 'Paid', value: 'Paid' },
                  { label: 'Pending', value: 'Pending' },
                  { label: 'Unpaid', value: 'Unpaid' },
                  { label: 'Cancelled', value: 'Cancelled' }
                ]}
              />
              <Button
                onClick={async () => {
                  try {
                    if (!editInvoice) return;
                    if (selectedStatus === 'Paid') {
                      await onAction(editInvoice.id, 'pay');
                    } else if (selectedStatus === 'Cancelled') {
                      await onAction(editInvoice.id, 'void');
                    } else if (selectedStatus === 'Pending') {
                      if (editDetail?.status === 'draft') await onAction(editInvoice.id, 'finalize');
                      else await onAction(editInvoice.id, 'send');
                    } else if (selectedStatus === 'Unpaid') {
                      if (editDetail?.status === 'draft') await onAction(editInvoice.id, 'finalize');
                      else message.info('Invoice already open/unpaid if not paid.');
                    }
                    await loadInvoices();
                  } catch {
                    message.error('Failed to update status');
                  }
                }}
              >
                Update Status
              </Button>
              <Button size="small" onClick={() => onAction(editInvoice?.id, 'send')} icon={<SendOutlined />}>Send Invoice</Button>
            </Space>
          </Form.Item>
          {editDetail?.status === 'draft' && (
            <>
              <Typography.Title level={5}>Edit Line Items (Draft Only)</Typography.Title>
              <Form.Item label="Products">
                <Select
                  mode="multiple"
                  placeholder="Select products"
                  value={replaceProducts}
                  onChange={(vals) => setReplaceProducts(vals)}
                  options={(products || []).map(p => ({ label: `${p.name} — $${(p.priceCents/100).toFixed(2)}`, value: p.id }))}
                />
              </Form.Item>
              {replaceProducts.map(pid => {
                const prod = products.find(p => p.id === pid);
                return (
                  <Form.Item key={pid} label={`Qty · ${prod ? prod.name : pid}`}>
                    <Input
                      type="number"
                      min={1}
                      value={replaceQty[pid] || 1}
                      onChange={e => setReplaceQty({ ...replaceQty, [pid]: Number(e.target.value || 1) })}
                      style={{ width: 120 }}
                    />
                  </Form.Item>
                );
              })}
              <Space>
                <Button onClick={onReplaceLines} type="primary">Replace Lines</Button>
              </Space>
            </>
          )}
        </Form>
      </Modal>
      <Modal
        title={`Invoice Details${detailInvoice?.number ? ' · #' + detailInvoice.number : ''}`}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={<Button onClick={() => setDetailOpen(false)}>Close</Button>}
        width={800}
      >
        {detailInvoice ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {(() => {
              const raw = detailInvoice.status || 'open';
              const paid = detailInvoice.amountPaid || 0;
              const remaining = detailInvoice.amountRemaining || 0;
              let label = 'Pending';
              if (raw === 'paid') label = 'Paid';
              else if (raw === 'void') label = 'Cancelled';
              else if (raw === 'uncollectible') label = 'Unpaid';
              else if (raw === 'open') {
                label = paid === 0 ? 'Unpaid' : 'Pending';
              }
              const color = label === 'Paid' ? 'green' : label === 'Pending' ? 'blue' : label === 'Cancelled' ? 'default' : label === 'Unpaid' ? 'orange' : 'red';
              return (
                <Typography.Text>
                  <strong>Status:</strong> <Tag color={color}>{label}</Tag>
                </Typography.Text>
              );
            })()}
            <Typography.Text><strong>User:</strong> {detailInvoice.customerEmail || '-'}</Typography.Text>
            <Typography.Text><strong>Total:</strong> ${ (detailInvoice.total/100).toFixed(2) } · <strong>Paid:</strong> ${ (getInvoiceAmountPaid(detailInvoice)/100).toFixed(2) } · <strong>Due:</strong> ${ (getInvoiceAmountDue(detailInvoice)/100).toFixed(2) }</Typography.Text>
            <Typography.Text><strong>Due Date:</strong> {detailInvoice.dueDate ? new Date(detailInvoice.dueDate).toLocaleString() : '-'}</Typography.Text>
            <Typography.Text><strong>Created:</strong> {detailInvoice.created ? new Date(detailInvoice.created).toLocaleString() : '-'}</Typography.Text>
            <Typography.Title level={5} style={{ marginTop: 8 }}>Line Items</Typography.Title>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              data={detailInvoice.lines || []}
              columns={[
                { title: 'Product', render: (_, li) => li.productName || li.priceNickname || '-' },
                { title: 'Unit', dataIndex: 'unitAmount', render: v => v != null ? `$${(v/100).toFixed(2)}` : '-' },
                { title: 'Qty', dataIndex: 'quantity' },
                { title: 'Amount', dataIndex: 'amount', render: v => v != null ? `$${(v/100).toFixed(2)}` : '-' },
                { title: 'Description', dataIndex: 'description' }
              ]}
            />
          </Space>
        ) : null}
      </Modal>
    </Space>
  );
}

