import { useState } from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values) => {
    if (!token) {
      message.error('Invalid reset link. Request a new one.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/api/auth/password/reset/confirm', {
        token,
        password: values.password
      });
      setDone(true);
      message.success('Password updated. You can log in now.');
    } catch (err) {
      message.error(err.response?.data?.error || 'Failed to reset password. Link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <Card style={{ width: 420, maxWidth: '100%' }}>
          <Typography.Title level={4}>Password updated</Typography.Title>
          <Typography.Paragraph>You can now log in with your new password.</Typography.Paragraph>
          <Button type="primary" onClick={() => navigate('/login')}>
            Go to Login
          </Button>
        </Card>
      </div>
    );
  }

  if (!token || token.length < 10) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
        <Card style={{ width: 420, maxWidth: '100%' }}>
          <Typography.Paragraph type="danger">Invalid or missing reset link. Please use the link from your email or request a new one from the login page.</Typography.Paragraph>
          <Button type="primary" onClick={() => navigate('/login')}>
            Go to Login
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
      <Card title="Set new password" style={{ width: 420, maxWidth: '100%' }}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="password"
            label="New password"
            rules={[{ required: true, min: 8, message: 'Use at least 8 characters' }]}
          >
            <Input.Password placeholder="At least 8 characters" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Confirm password"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Confirm your password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
                  return Promise.reject(new Error('Passwords do not match'));
                }
              })
            ]}
          >
            <Input.Password placeholder="Confirm new password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Update password
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
