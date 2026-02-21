import { Card, Form, Input, Button, Typography, message, Divider, Alert, Checkbox } from 'antd';
import { MailOutlined, LockOutlined, CrownOutlined, LoginOutlined, ArrowRightOutlined, UserOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import React, { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export function AdminLoginPage() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    try {
      setLoading(true);
      const res = await axios.post(`${API_URL}/api/auth/login`, values);
      console.log(res);
      if (res.data?.user?.role !== 'ADMIN') {
        message.error('Admin access required');
        return;
      }
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('currentUser', JSON.stringify(res.data.user));
      // notify app-level listeners
      window.dispatchEvent(new Event('auth:changed'));
      message.success('Welcome, Admin');
      // Go straight to admin; App will hydrate user from cached currentUser
      navigate('/admin');
    } catch (err) {
      message.error('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-8 flex justify-center">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{ width: 520, maxWidth: '100%' }}
      >
        <Card
          style={{ borderRadius: 16 }}
          bodyStyle={{ padding: 24, paddingTop: 18 }}
          title={
            <div className="flex items-center gap-2">
              <CrownOutlined style={{ color: '#102540' }} />
              <Typography.Text strong>Admin Login</Typography.Text>
            </div>
          }
        >
          

          <Form layout="vertical" form={form} onFinish={onFinish} requiredMark={false}>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
            >
              <Input
                size="large"
                placeholder="admin@milven.finance"
                prefix={<MailOutlined style={{ color: '#64748b' }} />}
              />
            </Form.Item>
            <Form.Item
              name="password"
              label="Password"
              rules={[{ required: true, min: 8, message: 'Use at least 8 characters' }]}
            >
              <Input.Password
                size="large"
                placeholder="••••••••"
                prefix={<LockOutlined style={{ color: '#64748b' }} />}
              />
            </Form.Item>

            <div className="flex items-center justify-between mb-3">
              <Checkbox>Remember me</Checkbox>
              <Link to="/reset-password" className="text-[#102540]">Forgot password?</Link>
            </div>

            <Button
              size="large"
              htmlType="submit"
              loading={loading}
              icon={<LoginOutlined />}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg,#102540 0%,#1b3a5b 50%,#274a74 100%)',
                color: '#fff',
                border: 'none',
                boxShadow: '0 10px 22px rgba(16,37,64,0.35)'
              }}
            >
              Sign in as Admin
            </Button>

            <Divider />
            <div className="flex items-center justify-between">
              <div className="text-gray-600">Want to sign in as a student?</div>
              <Link to="/login">
                <Button icon={<UserOutlined />} type="default" size="middle">
                  Student Login
                </Button>
              </Link>
            </div>
          </Form>
        </Card>

        <div className="mt-3 text-center text-gray-500 text-sm">
          Need access? <Link to="/register" className="text-[#102540]">Request an account</Link>{' '}
          <ArrowRightOutlined />
        </div>
      </motion.div>
    </div>
  );
}

