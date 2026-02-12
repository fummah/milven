import { Card, Form, Input, Button, Select, Row, Col, Typography, message } from 'antd';
import { UserOutlined, MailOutlined, LockOutlined, PhoneOutlined, GlobalOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { countriesOptions } from '../constants/countries';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export function RegisterPage() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const onFinish = async (values) => {
    setSubmitting(true);
    try {
      const res = await axios.post(`${API_URL}/api/auth/register`, {
        email: values.email,
        password: values.password,
        firstName: values.firstName?.trim() || undefined,
        lastName: values.lastName?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
        country: values.country || undefined,
        level: values.level
      });
      message.success(res.data?.message ?? 'Registration successful. Please check your email to verify your account.');
      navigate('/login');
    } catch (err) {
      const msg = err.response?.data?.error ?? 'Could not register. Email may already be in use.';
      message.error(typeof msg === 'string' ? msg : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 24px', minHeight: '80vh', alignItems: 'center' }}>
      <Card
        style={{ width: 720, maxWidth: '100%', boxShadow: '0 4px 24px rgba(16,37,64,0.12)', borderRadius: 12 }}
        styles={{ body: { padding: '28px 32px' } }}
      >
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <Typography.Title level={3} style={{ color: '#102540', margin: '0 0 8px' }}>
            Create your account
          </Typography.Title>
          <Typography.Text type="secondary">
            Student registration – verify your email to sign in
          </Typography.Text>
        </div>
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="firstName"
                label="First name"
                rules={[{ required: true, message: 'Enter your first name' }]}
              >
                <Input prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} placeholder="First name" size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="lastName"
                label="Last name"
                rules={[{ required: true, message: 'Enter your last name' }]}
              >
                <Input prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} placeholder="Last name" size="large" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="email"
                label="Email"
                rules={[{ required: true, message: 'Enter your email' }, { type: 'email', message: 'Enter a valid email' }]}
              >
                <Input prefix={<MailOutlined style={{ color: '#bfbfbf' }} />} placeholder="you@example.com" size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="phone" label="Phone">
                <Input prefix={<PhoneOutlined style={{ color: '#bfbfbf' }} />} placeholder="+27 72 000 0000" size="large" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="level"
                label="Level"
                rules={[{ required: true, message: 'Select your level' }]}
              >
                <Select
                  size="large"
                  placeholder="Select level"
                  options={[
                    { label: 'Level I', value: 'LEVEL1' },
                    { label: 'Level II', value: 'LEVEL2' },
                    { label: 'Level III', value: 'LEVEL3' }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="country" label="Country">
                <Select
                  showSearch
                  placeholder="Select country"
                  options={countriesOptions}
                  optionFilterProp="label"
                  allowClear
                  size="large"
                  suffixIcon={<GlobalOutlined style={{ color: '#bfbfbf' }} />}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="password"
                label="Password"
                rules={[
                  { required: true, message: 'Enter a password' },
                  { min: 8, message: 'Use at least 8 characters' }
                ]}
              >
                <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} placeholder="At least 8 characters" size="large" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
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
                <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} placeholder="Confirm password" size="large" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item style={{ marginBottom: 16 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={submitting}
              style={{ background: 'linear-gradient(135deg,#102540,#1b3a5b)', border: 'none', height: 44 }}
            >
              Register
            </Button>
          </Form.Item>
          <div style={{ textAlign: 'center' }}>
            <Typography.Text type="secondary">Already have an account? </Typography.Text>
            <Link to="/login">Log in</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
}
