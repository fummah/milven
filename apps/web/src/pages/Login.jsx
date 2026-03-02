import { Card, Form, Input, Button, Typography, message, Divider } from 'antd';
import { MailOutlined, LockOutlined, BookOutlined, TrophyOutlined, RocketOutlined, SafetyOutlined, CrownOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
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
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-8 items-center">
        {/* Left Side - Branding */}
        <motion.div 
          className="flex-1 hidden lg:block"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div 
            className="rounded-3xl p-10 h-full"
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1e40af 100%)',
              minHeight: 520
            }}
          >
            <div className="mb-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1e3a5f] to-[#102540] flex items-center justify-center mb-6 shadow-lg shadow-[#102540]/30">
                <BookOutlined className="text-white text-2xl" />
              </div>
              <Typography.Title level={2} className="!text-white !mb-3">
                Welcome Back
              </Typography.Title>
              <Typography.Text className="text-slate-300 text-lg">
                Continue your CFA journey with personalized learning
              </Typography.Text>
            </div>

            <div className="space-y-5 mt-10">
              {[
                { icon: <TrophyOutlined />, title: '10,000+ Questions', desc: 'Practice with real exam-style questions', color: 'from-amber-400 to-amber-600' },
                { icon: <RocketOutlined />, title: 'AI Analytics', desc: 'Track your progress with smart insights', color: 'from-[#1e3a5f] to-[#2d4a6f]' },
                { icon: <SafetyOutlined />, title: 'Pass Guarantee', desc: 'Proven methods for exam success', color: 'from-emerald-500 to-emerald-700' }
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
              <Typography.Text className="text-slate-400 text-sm">
                Join thousands of successful CFA candidates
              </Typography.Text>
            </div>
          </div>
        </motion.div>

        {/* Right Side - Login Form */}
        <motion.div 
          className="w-full lg:w-[440px]"
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
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-[#102540] to-[#1e3a5f] flex items-center justify-center shadow-lg shadow-[#102540]/30">
                <BookOutlined className="text-white text-2xl" />
              </div>
              <Typography.Title level={2} className="!mb-2 !text-slate-800">
                Student Login
              </Typography.Title>
              <Typography.Text className="text-slate-500">
                Sign in to access your learning dashboard
              </Typography.Text>
            </div>

            <Form layout="vertical" form={form} onFinish={onFinish} requiredMark={false}>
              <Form.Item
                name="email"
                label={<span className="text-slate-600 font-medium">Email Address</span>}
                rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
              >
                <Input 
                  prefix={<MailOutlined className="text-slate-400" />} 
                  placeholder="you@example.com" 
                  size="large"
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
                  prefix={<LockOutlined className="text-slate-400" />} 
                  placeholder="Enter your password" 
                  size="large"
                  className="!rounded-xl !h-12"
                  style={{ background: '#f8fafc' }}
                />
              </Form.Item>

              <div className="flex justify-end mb-5">
                <Link to="/forgot-password" className="text-[#102540] hover:text-[#1e3a5f] text-sm font-medium">
                  Forgot password?
                </Link>
              </div>

              <Form.Item style={{ marginBottom: 20 }}>
                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    block
                    size="large"
                    loading={submitting}
                    className="!h-12 !rounded-xl !font-semibold !text-base"
                    style={{ 
                      background: 'linear-gradient(135deg, #102540 0%, #1e3a5f 100%)', 
                      border: 'none',
                      boxShadow: '0 8px 20px rgba(16, 37, 64, 0.4)'
                    }}
                  >
                    Sign In
                  </Button>
                </motion.div>
              </Form.Item>

              {emailNotVerified && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-5 p-4 bg-amber-50 rounded-xl border border-amber-200"
                >
                  <Typography.Text className="text-amber-800 block mb-2">
                    Please verify your email to sign in.
                  </Typography.Text>
                  <Button 
                    type="link" 
                    size="small" 
                    loading={resendLoading} 
                    onClick={resendVerification} 
                    className="!p-0 !text-amber-700 !font-medium"
                  >
                    Resend verification email
                  </Button>
                </motion.div>
              )}

              <Divider className="!my-6">
                <span className="text-slate-400 text-sm">or</span>
              </Divider>

              <div className="text-center space-y-4">
                <div>
                  <Typography.Text className="text-slate-500">Don't have an account? </Typography.Text>
                  <Link to="/register" className="text-[#102540] hover:text-[#1e3a5f] font-semibold">
                    Create Account
                  </Link>
                </div>
                <div className="pt-2">
                  <Link to="/admin/login" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm">
                    <CrownOutlined />
                    <span>Admin Login</span>
                  </Link>
                </div>
              </div>
            </Form>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
