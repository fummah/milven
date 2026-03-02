import { Card, Form, Input, Button, Typography, message, Divider, Checkbox } from 'antd';
import { MailOutlined, LockOutlined, CrownOutlined, LoginOutlined, UserOutlined, SettingOutlined, TeamOutlined, BarChartOutlined, SafetyOutlined } from '@ant-design/icons';
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
      window.dispatchEvent(new Event('auth:changed'));
      message.success('Welcome, Admin');
      navigate('/admin');
    } catch (err) {
      message.error('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-8 items-center">
        {/* Left Side - Login Form */}
        <motion.div 
          className="w-full lg:w-[440px] order-2 lg:order-1"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card
            className="border-0 shadow-2xl"
            style={{ borderRadius: 24 }}
            styles={{ body: { padding: '40px 36px' } }}
          >
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-lg shadow-slate-500/30">
                <CrownOutlined className="text-amber-400 text-2xl" />
              </div>
              <Typography.Title level={2} className="!mb-2 !text-slate-800">
                Admin Portal
              </Typography.Title>
              <Typography.Text className="text-slate-500">
                Sign in to manage your platform
              </Typography.Text>
            </div>

            <Form layout="vertical" form={form} onFinish={onFinish} requiredMark={false}>
              <Form.Item
                name="email"
                label={<span className="text-slate-600 font-medium">Email Address</span>}
                rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
              >
                <Input
                  size="large"
                  placeholder="admin@milven.finance"
                  prefix={<MailOutlined className="text-slate-400" />}
                  className="!rounded-xl !h-12"
                  style={{ background: '#f8fafc' }}
                />
              </Form.Item>
              <Form.Item
                name="password"
                label={<span className="text-slate-600 font-medium">Password</span>}
                rules={[{ required: true, min: 8, message: 'Use at least 8 characters' }]}
              >
                <Input.Password
                  size="large"
                  placeholder="Enter your password"
                  prefix={<LockOutlined className="text-slate-400" />}
                  className="!rounded-xl !h-12"
                  style={{ background: '#f8fafc' }}
                />
              </Form.Item>

              <div className="flex items-center justify-between mb-5">
                <Checkbox className="text-slate-600">Remember me</Checkbox>
                <Link to="/forgot-password" className="text-slate-600 hover:text-slate-800 text-sm font-medium">
                  Forgot password?
                </Link>
              </div>

              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Button
                  size="large"
                  htmlType="submit"
                  loading={loading}
                  icon={<LoginOutlined />}
                  className="!w-full !h-12 !rounded-xl !font-semibold !text-base"
                  style={{
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
                    color: '#fff',
                    border: 'none',
                    boxShadow: '0 8px 20px rgba(15, 23, 42, 0.4)'
                  }}
                >
                  Sign in as Admin
                </Button>
              </motion.div>

              <Divider className="!my-6">
                <span className="text-slate-400 text-sm">or</span>
              </Divider>

              <div className="text-center">
                <Link to="/login">
                  <Button 
                    icon={<UserOutlined />} 
                    size="large"
                    className="!rounded-xl !h-11 !font-medium"
                    style={{ width: '100%' }}
                  >
                    Sign in as Student
                  </Button>
                </Link>
              </div>
            </Form>
          </Card>

          <div className="mt-4 text-center">
            <Typography.Text className="text-slate-500 text-sm">
              Protected area. Unauthorized access is prohibited.
            </Typography.Text>
          </div>
        </motion.div>

        {/* Right Side - Branding */}
        <motion.div 
          className="flex-1 hidden lg:block order-1 lg:order-2"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div 
            className="rounded-3xl p-10 h-full"
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
              minHeight: 520
            }}
          >
            <div className="mb-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-6 shadow-lg shadow-amber-500/30">
                <CrownOutlined className="text-white text-2xl" />
              </div>
              <Typography.Title level={2} className="!text-white !mb-3">
                Admin Control Center
              </Typography.Title>
              <Typography.Text className="text-slate-300 text-lg">
                Manage courses, students, and platform settings
              </Typography.Text>
            </div>

            <div className="space-y-5 mt-10">
              {[
                { icon: <TeamOutlined />, title: 'User Management', desc: 'Manage students and admin accounts', color: 'from-[#1e3a5f] to-[#2d4a6f]' },
                { icon: <SettingOutlined />, title: 'Course Builder', desc: 'Create and organize learning content', color: 'from-[#102540] to-[#1e3a5f]' },
                { icon: <BarChartOutlined />, title: 'Analytics Dashboard', desc: 'Track performance and engagement', color: 'from-emerald-400 to-teal-500' },
                { icon: <SafetyOutlined />, title: 'Exam Management', desc: 'Build and schedule assessments', color: 'from-amber-400 to-orange-500' }
              ].map((item, idx) => (
                <motion.div 
                  key={idx}
                  className="flex items-start gap-4"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + idx * 0.1 }}
                >
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                    <span className="text-white text-lg">{item.icon}</span>
                  </div>
                  <div>
                    <Typography.Text className="text-white font-semibold block">{item.title}</Typography.Text>
                    <Typography.Text className="text-slate-400 text-sm">{item.desc}</Typography.Text>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-10 pt-6 border-t border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <Typography.Text className="text-slate-400 text-sm">
                  Secure admin access with role-based permissions
                </Typography.Text>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

