import React from 'react';
import { Empty, Typography } from 'antd';

export function Placeholder({ title }) {
  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 12 }}>{title}</Typography.Title>
      <Empty description="Coming soon" />
    </div>
  );
}

