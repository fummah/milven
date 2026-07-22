import React, { useEffect, useState } from 'react';
import { Card, Tabs, Form, Input, InputNumber, Switch, Button, Upload, Space, Typography, message, List, Modal, Tag, Spin } from 'antd';
import { UploadOutlined, SaveOutlined, BgColorsOutlined, DollarOutlined, SafetyCertificateOutlined, ReadOutlined, ScheduleOutlined, SettingOutlined, QuestionCircleOutlined, PlusOutlined, DeleteOutlined, RobotOutlined, ApiOutlined } from '@ant-design/icons';
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
  const [aiForm] = Form.useForm();
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPct, setLogoPct] = useState(0);
  const [faqList, setFaqList] = useState([]);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [modelsOpen, setModelsOpen] = useState(false);
  const [modelsList, setModelsList] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsKeyPrefix, setModelsKeyPrefix] = useState('');
  const [modelsProvider, setModelsProvider] = useState('');
  const [aiConfig, setAiConfig] = useState(null);
  const [aiConfigLoading, setAiConfigLoading] = useState(false);

  const fetchAiConfig = async () => {
    setAiConfigLoading(true);
    try {
      const { data } = await api.get('/api/settings/ai-config');
      setAiConfig(data);
      aiForm.setFieldsValue({
        aiProvider: data.activeProvider || 'openai',
        aiDefaultModel: data.activeModel || '',
      });
    } catch { /* ignore */ } finally { setAiConfigLoading(false); }
  };

  const fetchModels = async (provider) => {
    const prov = provider || aiConfig?.activeProvider || 'openai';
    setModelsLoading(true);
    setModelsList([]);
    setModelsKeyPrefix('');
    setModelsProvider(prov);
    try {
      const { data } = await api.get(`/api/settings/ai-models?provider=${prov}`);
      setModelsList(data.models || []);
      setModelsKeyPrefix(data.keyPrefix || '');
    } catch (err) {
      message.error(err?.response?.data?.error || 'Failed to fetch models');
    } finally {
      setModelsLoading(false);
    }
  };

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

  useEffect(() => { fetchSettings(); fetchAiConfig(); /* eslint-disable-next-line */ }, []);

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
      key: 'ai',
      label: <Space size={6}>{badge(<RobotOutlined />, '#722ed1', '#f9f0ff')}<span>AI Configuration</span></Space>,
      children: (
        <Card loading={loading || aiConfigLoading}>
          <Typography.Paragraph type="secondary">
            Configure AI providers for question generation, hints, formulas, and other AI features. You can use OpenAI, Anthropic (Claude), or switch between them.
          </Typography.Paragraph>

          {/* Active provider + default model */}
          <Form form={aiForm} layout="vertical" onFinish={async (v) => {
            const updates = {};
            if (v.aiProvider) updates['ai.provider'] = v.aiProvider;
            if (v.aiDefaultModel) updates['ai.model'] = v.aiDefaultModel;
            if (v.openaiApiKey?.trim()) updates['ai.openai.apiKey'] = v.openaiApiKey.trim();
            if (v.anthropicApiKey?.trim()) updates['ai.anthropic.apiKey'] = v.anthropicApiKey.trim();
            if (Object.keys(updates).length === 0) { message.info('No changes to save.'); return; }
            await onSave(updates);
            aiForm.setFieldsValue({ openaiApiKey: '', anthropicApiKey: '' });
            fetchAiConfig();
          }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <Form.Item name="aiProvider" label="Active AI Provider" style={{ flex: 1 }}>
                <Select
                  options={(aiConfig?.providers || []).map(p => ({
                    value: p.id,
                    label: <span>{p.label} {p.hasKey ? <Tag color="green" style={{ marginLeft: 6, fontSize: 11 }}>Key set</Tag> : <Tag color="orange" style={{ marginLeft: 6, fontSize: 11 }}>No key</Tag>}</span>
                  }))}
                />
              </Form.Item>
              <Form.Item name="aiDefaultModel" label="Default Model" style={{ flex: 1 }}>
                <Input placeholder={aiConfig?.defaultModel || 'gpt-4o-mini'} />
              </Form.Item>
            </div>

            <Typography.Text strong style={{ display: 'block', marginBottom: 8, marginTop: 4 }}>API Keys</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 12 }}>
              Leave blank when saving to keep existing keys. Keys are stored securely in the database.
              {aiConfig?.providers?.map(p => p.hasKey ? <span key={p.id} style={{ marginLeft: 12 }}><Tag color="green">{p.label}</Tag> <code>{p.keyPrefix}</code></span> : null)}
            </Typography.Paragraph>
            <div style={{ display: 'flex', gap: 16 }}>
              <Form.Item name="openaiApiKey" label="OpenAI API Key" style={{ flex: 1 }}>
                <Input.Password placeholder="sk-... (leave blank to keep existing)" autoComplete="off" />
              </Form.Item>
              <Form.Item name="anthropicApiKey" label="Anthropic API Key" style={{ flex: 1 }}>
                <Input.Password placeholder="sk-ant-... (leave blank to keep existing)" autoComplete="off" />
              </Form.Item>
            </div>
            <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={saving}>Save AI Configuration</Button>
          </Form>

          <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
            <Typography.Text strong>Available Models</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              List models accessible with your configured API key for a provider.
            </Typography.Paragraph>
            <Space>
              {(aiConfig?.providers || []).filter(p => p.hasKey).map(p => (
                <Button key={p.id} icon={<ApiOutlined />} onClick={() => { setModelsOpen(true); fetchModels(p.id); }}>
                  {p.label} Models
                </Button>
              ))}
              {(aiConfig?.providers || []).every(p => !p.hasKey) && (
                <Typography.Text type="secondary">Configure an API key above to list available models.</Typography.Text>
              )}
            </Space>
          </div>
          <Modal
            title={`Available Models — ${modelsProvider === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI'}`}
            open={modelsOpen}
            onCancel={() => setModelsOpen(false)}
            footer={<Button onClick={() => setModelsOpen(false)}>Close</Button>}
            width={700}
          >
            {modelsLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /><div style={{ marginTop: 12 }}>Fetching models…</div></div>
            ) : modelsList.length === 0 ? (
              <Typography.Text type="secondary">No models found.</Typography.Text>
            ) : (
              <>
                <Typography.Text type="secondary" style={{ marginBottom: 12, display: 'block' }}>{modelsList.length} models available for key <code>{modelsKeyPrefix}</code></Typography.Text>
                <div style={{ maxHeight: 450, overflowY: 'auto' }}>
                  <List
                    size="small"
                    bordered
                    dataSource={modelsList}
                    renderItem={(m) => (
                      <List.Item>
                        <List.Item.Meta
                          title={<span style={{ fontFamily: 'monospace', fontSize: 13 }}>{m.id}</span>}
                          description={<Tag color="blue">{m.owned_by}</Tag>}
                        />
                      </List.Item>
                    )}
                  />
                </div>
              </>
            )}
          </Modal>
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

