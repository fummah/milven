import { useEffect, useState } from 'react';
import { Card, Button, Typography, Result, Spin } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!token || token.length < 10) {
      setStatus('error');
      setMessage('Invalid or missing verification link.');
      return;
    }
    (async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
        await axios.post(`${API_URL}/api/auth/verify-email/confirm`, { token });
        setStatus('success');
      } catch (err) {
        setStatus('error');
        setMessage(err.response?.data?.error || 'Verification failed. The link may have expired.');
      }
    })();
  }, [token]);

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spin size="large" tip="Verifying your email..." />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
      <Card style={{ width: 480, maxWidth: '100%' }}>
        {status === 'success' && (
          <Result
            status="success"
            title="Email verified"
            subTitle="You can now log in to your account."
            extra={[
              <Button type="primary" key="login" onClick={() => navigate('/login')}>
                Go to Login
              </Button>
            ]}
          />
        )}
        {status === 'error' && (
          <Result
            status="error"
            title="Verification failed"
            subTitle={message}
            extra={[
              <Button type="primary" key="login" onClick={() => navigate('/login')}>
                Go to Login
              </Button>,
              <Button key="register" onClick={() => navigate('/register')}>
                Register again
              </Button>
            ]}
          />
        )}
      </Card>
    </div>
  );
}
