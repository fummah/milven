import React from 'react';
import { Button, Spin, Typography } from 'antd';

const { Text } = Typography;

export function ContentStageLoader({ label = 'Loading...', compact = false }) {
  return (
    <div
      data-content-loader="true"
      aria-live="polite"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: compact ? 'transparent' : 'rgba(2, 6, 23, 0.48)',
        pointerEvents: 'none'
      }}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        padding: '16px 22px',
        borderRadius: 12,
        background: 'rgba(15, 23, 42, 0.82)',
        border: '1px solid rgba(148, 163, 184, 0.18)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.25)'
      }}>
        <Spin size="large" />
        <Text style={{ color: '#e2e8f0', fontSize: 13 }}>{label}</Text>
      </div>
    </div>
  );
}

export function ContentStageError({ message = 'This page could not be loaded.', onRetry, onBack, backLabel = 'Go back' }) {
  return (
    <div data-content-error="true" style={{
      position: 'absolute',
      inset: 0,
      zIndex: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: 'rgba(2, 6, 23, 0.84)'
    }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <Text style={{ color: '#f8fafc', display: 'block', fontSize: 16, fontWeight: 600 }}>Page unavailable</Text>
        <Text style={{ color: '#cbd5e1', display: 'block', fontSize: 13, marginTop: 8 }}>{message}</Text>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          {onRetry && <Button type="primary" onClick={onRetry}>Retry</Button>}
          {onBack && <Button onClick={onBack}>{backLabel}</Button>}
        </div>
      </div>
    </div>
  );
}
