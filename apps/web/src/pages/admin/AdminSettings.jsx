import React, { useEffect, useState } from 'react';
import { Card, Tabs, Form, Input, InputNumber, Switch, Button, Upload, Space, Typography, message, List } from 'antd';
import { UploadOutlined, SaveOutlined, BgColorsOutlined, DollarOutlined, SafetyCertificateOutlined, ReadOutlined, ScheduleOutlined, SettingOutlined, QuestionCircleOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';

export function AdminSettings() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({});
  const [brandForm] = Form.useForm();
  const [paymentsForm] = Form.useForm();
  const [authForm] = Form.useForm();
  const [learningForm] = Form.useForm();
  const [examForm] = Form.useForm();
  const [systemForm] = Form.useForm();
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPct, setLogoPct] = useState(0);
  const [faqList, setFaqList] = useState([]);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/settings');
      setSettings(data.settings || {});
      // hydrate forms
      brandForm.setFieldsValue({
        name: data.settings?.['brand.name'] ?? 'MILVEN FINANCE SCHOOL',
        primaryColor: data.settings?.['brand.primaryColor'] ?? '#102540',
        logoUrl: data.settings?.['brand.logoUrl'] ?? '/logo.png'
      });
      paymentsForm.setFieldsValue({
        useStripe: data.settings?.['payments.useStripe'] ?? true,
        publishableKey: data.settings?.['payments.stripe.publishableKey'] ?? ''
      });
      authForm.setFieldsValue({
        allowRegistration: data.settings?.['auth.allowRegistration'] ?? true,
        requireEmailVerification: data.settings?.['auth.requireEmailVerification'] ?? false
      });
      learningForm.setFieldsValue({
        heartbeatSec: data.settings?.['learning.progress.heartbeatSec'] ?? 5,
        require100: data.settings?.['learning.topic.gate.require100'] ?? false
      });
      examForm.setFieldsValue({
        timeLimitMinutes: data.settings?.['exams.default.timeLimitMinutes'] ?? 60,
        requireSubscription: data.settings?.['exams.requireSubscription'] ?? false
      });
      systemForm.setFieldsValue({
        supportEmail: data.settings?.['system.supportEmail'] ?? 'support@milven.finance',
        uploadMaxSizeMb: data.settings?.['system.uploadMaxSizeMb'] ?? 200
      });
      const faq = data.settings?.['faq.items'];
      setFaqList(Array.isArray(faq) ? faq : []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); /* eslint-disable-next-line */ }, []);

  const onSave = async (obj) => {
    setSaving(true);
    try {
      await api.put('/api/settings', obj);
      message.success('Settings saved');
      await fetchSettings();
    } catch {
      message.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const uploadProps = {
    name: 'file',
    action: '/api/cms/upload',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`
    },
    onProgress({ percent }) {
      setLogoUploading(true);
      setLogoPct(Math.round(percent || 0));
    },
    onChange(info) {
      if (info.file.status === 'done') {
        const url = info.file?.response?.url;
        if (url) {
          brandForm.setFieldsValue({ logoUrl: url });
          message.success('Logo uploaded');
        }
        setLogoUploading(false);
        setLogoPct(0);
      } else if (info.file.status === 'error') {
        message.error('Upload failed');
        setLogoUploading(false);
        setLogoPct(0);
      }
    }
  };

  const badge = (iconNode, fg, bg) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: '50%',
        background: bg,
        color: fg,
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)'
      }}
    >
      {iconNode}
    </span>
  );

  const items = [
    {
      key: 'branding',
      label: <Space size={6}>{badge(<BgColorsOutlined />, '#102540', '#e6f4ff')}<span>Branding</span></Space>,
      children: (
        <Card loading={loading}>
          <Form form={brandForm} layout="vertical" onFinish={(v) => onSave({
            'brand.name': v.name,
            'brand.primaryColor': v.primaryColor,
            'brand.logoUrl': v.logoUrl
          })}>
            <Typography.Paragraph type="secondary">
              Configure your brand identity used across the application.
            </Typography.Paragraph>
            <Form.Item name="name" label="Brand Name" rules={[{ required: true }]}>
              <Input placeholder="MILVEN FINANCE SCHOOL" />
            </Form.Item>
            <Form.Item name="primaryColor" label="Primary Color" rules={[{ required: true }]}>
              <Input placeholder="#102540" />
            </Form.Item>
            <Form.Item name="logoUrl" label="Logo URL">
              <Input placeholder="/logo.png" />
            </Form.Item>
            <Upload {...uploadProps} showUploadList={false}>
              <Button icon={<UploadOutlined />} loading={logoUploading}>
                {logoUploading ? `Uploading ${logoPct}%` : 'Upload Logo'}
              </Button>
            </Upload>
            <div className="mt-4">
              <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={saving}>Save Branding</Button>
            </div>
          </Form>
        </Card>
      )
    },
    {
      key: 'payments',
      label: <Space size={6}>{badge(<DollarOutlined />, '#52c41a', '#f6ffed')}<span>Payments</span></Space>,
      children: (
        <Card loading={loading}>
          <Typography.Paragraph type="secondary">
            Stripe secret key is managed by the server environment. You can toggle usage and set the publishable key here.
          </Typography.Paragraph>
          <Form form={paymentsForm} layout="vertical" onFinish={(v) => onSave({
            'payments.useStripe': !!v.useStripe,
            'payments.stripe.publishableKey': v.publishableKey
          })}>
            <Form.Item name="useStripe" label="Use Stripe" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="publishableKey" label="Stripe Publishable Key">
              <Input placeholder="pk_test_..." />
            </Form.Item>
            <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={saving}>Save Payments</Button>
          </Form>
        </Card>
      )
    },
    {
      key: 'auth',
      label: <Space size={6}>{badge(<SafetyCertificateOutlined />, '#faad14', '#fffbe6')}<span>Auth & Users</span></Space>,
      children: (
        <Card loading={loading}>
          <Form form={authForm} layout="vertical" onFinish={(v) => onSave({
            'auth.allowRegistration': !!v.allowRegistration,
            'auth.requireEmailVerification': !!v.requireEmailVerification
          })}>
            <Form.Item name="allowRegistration" label="Allow Student Registration" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="requireEmailVerification" label="Require Email Verification" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={saving}>Save Auth</Button>
          </Form>
        </Card>
      )
    },
    {
      key: 'learning',
      label: <Space size={6}>{badge(<ReadOutlined />, '#1890ff', '#e6f7ff')}<span>Learning</span></Space>,
      children: (
        <Card loading={loading}>
          <Form form={learningForm} layout="vertical" onFinish={(v) => onSave({
            'learning.progress.heartbeatSec': Number(v.heartbeatSec || 5),
            'learning.topic.gate.require100': !!v.require100
          })}>
            <Form.Item name="heartbeatSec" label="Progress Heartbeat Seconds" rules={[{ required: true }]}>
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item name="require100" label="Require 100% Topic Completion to Advance" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={saving}>Save Learning</Button>
          </Form>
        </Card>
      )
    },
    {
      key: 'exams',
      label: <Space size={6}>{badge(<ScheduleOutlined />, '#fa8c16', '#fff7e6')}<span>Exams</span></Space>,
      children: (
        <Card loading={loading}>
          <Form form={examForm} layout="vertical" onFinish={(v) => onSave({
            'exams.default.timeLimitMinutes': Number(v.timeLimitMinutes || 60),
            'exams.requireSubscription': !!v.requireSubscription
          })}>
            <Form.Item name="timeLimitMinutes" label="Default Time Limit (minutes)" rules={[{ required: true }]}>
              <InputNumber min={10} />
            </Form.Item>
            <Form.Item name="requireSubscription" label="Require Subscription to Take Exams" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={saving}>Save Exams</Button>
          </Form>
        </Card>
      )
    },
    {
      key: 'faq',
      label: <Space size={6}>{badge(<QuestionCircleOutlined />, '#722ed1', '#f9f0ff')}<span>FAQ</span></Space>,
      children: (
        <Card loading={loading}>
          <Typography.Paragraph type="secondary">
            Add frequently asked questions. They appear in the header under Explore Courses.
          </Typography.Paragraph>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Space.Compact style={{ width: '100%', maxWidth: 600 }}>
              <Input
                placeholder="Question"
                value={faqQuestion}
                onChange={(e) => setFaqQuestion(e.target.value)}
                style={{ flex: 1 }}
              />
              <Input
                placeholder="Answer"
                value={faqAnswer}
                onChange={(e) => setFaqAnswer(e.target.value)}
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  const q = (faqQuestion || '').trim();
                  const a = (faqAnswer || '').trim();
                  if (!q || !a) {
                    message.warning('Enter both question and answer');
                    return;
                  }
                  setFaqList((prev) => [...prev, { question: q, answer: a }]);
                  setFaqQuestion('');
                  setFaqAnswer('');
                }}
              >
                Add
              </Button>
            </Space.Compact>
            <List
              bordered
              dataSource={faqList}
              locale={{ emptyText: 'No FAQs yet. Add one above.' }}
              renderItem={(item, index) => (
                <List.Item
                  actions={[
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => setFaqList((prev) => prev.filter((_, i) => i !== index))}
                    />
                  ]}
                >
                  <List.Item.Meta
                    title={item.question}
                    description={item.answer}
                  />
                </List.Item>
              )}
            />
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await api.put('/api/settings', { 'faq.items': faqList });
                  message.success('FAQ saved');
                  await fetchSettings();
                } catch {
                  message.error('Failed to save FAQ');
                } finally {
                  setSaving(false);
                }
              }}
            >
              Save FAQ
            </Button>
          </Space>
        </Card>
      )
    },
    {
      key: 'system',
      label: <Space size={6}>{badge(<SettingOutlined />, '#595959', '#fafafa')}<span>System</span></Space>,
      children: (
        <Card loading={loading}>
          <Form form={systemForm} layout="vertical" onFinish={(v) => onSave({
            'system.supportEmail': v.supportEmail,
            'system.uploadMaxSizeMb': Number(v.uploadMaxSizeMb || 200)
          })}>
            <Form.Item name="supportEmail" label="Support Email" rules={[{ type: 'email', required: true }]}>
              <Input placeholder="support@milven.finance" />
            </Form.Item>
            <Form.Item name="uploadMaxSizeMb" label="Upload Max Size (MB)" rules={[{ required: true }]}>
              <InputNumber min={10} />
            </Form.Item>
            <Space>
              <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={saving}>Save System</Button>
            </Space>
          </Form>
          <div className="mt-4">
            <Typography.Text type="secondary">
              Stripe configured: {settings?.__meta?.stripeConfigured ? 'Yes' : 'No'} · Webhook: {settings?.__meta?.webhookConfigured ? 'Yes' : 'No'}
            </Typography.Text>
          </div>
        </Card>
      )
    }
  ];

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <Typography.Title level={2} className="page-header-title">
            Settings
          </Typography.Title>
          <div className="page-header-subtitle">
            Configure your application settings and preferences
          </div>
        </div>
      </div>

      {/* Settings Tabs */}
      <Card className="modern-card" styles={{ body: { padding: 0 } }}>
        <Tabs items={items} className="modern-tabs" style={{ padding: '0 24px' }} />
      </Card>
    </Space>
  );
}

