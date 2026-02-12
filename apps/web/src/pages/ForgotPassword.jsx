import { useState } from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

export function ForgotPasswordPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
      await axios.post(`${API_URL}/api/auth/password/reset/request`, { email: values.email });
      setSent(true);
      message.success('If an account exists, you will receive a password reset link by email.');
    } catch {
      message.error('Something went wrong. Try again later.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <Card style={{ width: 420, maxWidth: '100%' }}>
          <Typography.Title level={4}>Check your email</Typography.Title>
          <Typography.Paragraph>
            If an account exists for that email, we've sent a link to reset your password. The link expires in 1 hour.
          </Typography.Paragraph>
          <Button type="primary" onClick={() => navigate('/login')}>
            Back to Login
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
      <Card title="Forgot password" style={{ width: 420, maxWidth: '100%' }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Enter your email and we'll send you a link to reset your password.
        </Typography.Paragraph>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="you@example.com" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Send reset link
            </Button>
          </Form.Item>
        </Form>
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <Link to="/login">Back to Login</Link>
        </div>
      </Card>
    </div>
  );
}
