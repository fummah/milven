import { Card, Form, Input, Button, Typography, message } from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import React, { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export function LoginPage() {
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onFinish = async (values) => {
    setEmailNotVerified(false);
    setSubmitting(true);
    try {
      const res = await axios.post(`${API_URL}/api/auth/login`, values);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('currentUser', JSON.stringify(res.data.user));
      window.dispatchEvent(new Event('auth:changed'));
      message.success('Welcome');
      const role = res.data?.user?.role || 'STUDENT';
      const pendingCourseId = localStorage.getItem('pendingCourseId');
      if (role === 'STUDENT' && pendingCourseId) {
        navigate('/student/courses');
      } else {
        navigate(role === 'ADMIN' ? '/admin' : '/student');
      }
    } catch (err) {
      const data = err.response?.data;
      const code = data?.code;
      const msg = data?.error;
      if (code === 'EMAIL_NOT_VERIFIED' || (typeof msg === 'string' && msg.toLowerCase().includes('verify'))) {
        setEmailNotVerified(form.getFieldValue('email'));
        message.warning(msg || 'Please verify your email before logging in.');
      } else {
        message.error(msg || 'Invalid credentials');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resendVerification = async () => {
    if (!emailNotVerified) return;
    setResendLoading(true);
    try {
      await axios.post(`${API_URL}/api/auth/verify-email/request`, { email: emailNotVerified });
      message.success('Verification email sent. Check your inbox.');
      setEmailNotVerified(false);
    } catch {
      message.error('Failed to send. Try again later.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 24px', minHeight: '80vh', alignItems: 'center' }}>
      <Card
        style={{ width: 420, maxWidth: '100%', boxShadow: '0 4px 24px rgba(16,37,64,0.12)', borderRadius: 12 }}
        styles={{ body: { padding: '28px 32px' } }}
      >
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <Typography.Title level={3} style={{ color: '#102540', margin: '0 0 8px' }}>
            Log in
          </Typography.Title>
          <Typography.Text type="secondary">
            Sign in to your student account
          </Typography.Text>
        </div>
        <Form layout="vertical" form={form} onFinish={onFinish} requiredMark={false}>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
          >
            <Input prefix={<MailOutlined style={{ color: '#bfbfbf' }} />} placeholder="you@example.com" size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, min: 8, message: 'Use at least 8 characters' }]}
          >
            <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} placeholder="••••••••" size="large" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 16 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={submitting}
              style={{ background: 'linear-gradient(135deg,#102540,#1b3a5b)', border: 'none', height: 44 }}
            >
              Login
            </Button>
          </Form.Item>
          {emailNotVerified && (
            <div style={{ marginBottom: 12, padding: 12, background: '#fffbe6', borderRadius: 8, border: '1px solid #ffe58f' }}>
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                Verify your email to sign in. Check your inbox or:
              </Typography.Text>
              <Button type="link" size="small" loading={resendLoading} onClick={resendVerification} style={{ padding: 0 }}>
                Resend verification email
              </Button>
            </div>
          )}
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Typography.Text type="secondary">Don't have an account? </Typography.Text>
            <Link to="/register">Register</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
}
