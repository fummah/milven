import React from 'react';
import { Button, Card, Space, Tag, Typography } from 'antd';
import { EyeOutlined, FileTextOutlined } from '@ant-design/icons';
import { PdfThumbnail, ResourceSourceTag, ResourceTypeTag } from './ResourceVisuals';

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };
const LEVEL_COLORS = { LEVEL1: 'blue', LEVEL2: 'purple', LEVEL3: 'gold' };

export default function SummaryResourceCard({ resource, onOpen }) {
  if (resource.type === 'PDF') {
    return (
      <Card
        hoverable
        onClick={() => onOpen?.(resource)}
        style={{ borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', height: '100%', cursor: 'pointer' }}
        styles={{ body: { padding: 0 } }}
      >
        <PdfThumbnail url={resource.thumbnailUrl} title={resource.title} height={210} />
        <div style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#102540', lineHeight: 1.35 }}>{resource.title}</div>
          <Space size={[4, 4]} wrap style={{ marginTop: 9 }}>
            <ResourceTypeTag type="PDF" />
            <ResourceSourceTag type="PDF" />
            <Tag color={LEVEL_COLORS[resource.level]}>{LEVEL_LABELS[resource.level] || resource.level}</Tag>
            {resource.volume?.name && <Tag>{resource.volume.name}</Tag>}
            {resource.module?.name ? <Tag>{resource.module.name}</Tag> : <Tag>Whole Volume</Tag>}
            {resource.pageCount ? <Tag>{resource.pageCount} pages</Tag> : null}
          </Space>
          <Button type="link" icon={<EyeOutlined />} style={{ padding: 0, marginTop: 10 }}>View PDF</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      hoverable
      onClick={() => onOpen?.(resource)}
      style={{ borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', height: '100%', cursor: 'pointer' }}
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', padding: '16px 20px' }}>
        <Typography.Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          {LEVEL_LABELS[resource.level]} {resource.volume?.name ? `| ${resource.volume.name}` : ''}
        </Typography.Text>
        <Typography.Title level={5} style={{ color: '#fff', margin: '4px 0 0' }}>{resource.title}</Typography.Title>
      </div>
      <div style={{ padding: '12px 20px' }}>
        <Space size={[4, 4]} wrap style={{ marginBottom: 8 }}>
          <ResourceTypeTag type="SUMMARY" />
          <ResourceSourceTag type="SUMMARY" source={resource.source} />
          {resource.module?.name && <Tag>{resource.module.name}</Tag>}
          {resource.year && <Tag>{resource.year}</Tag>}
        </Space>
        {resource.snapshot && <div style={{ color: '#475569', fontSize: 13, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{resource.snapshot}</div>}
        <Button type="link" icon={<FileTextOutlined />} style={{ padding: 0, marginTop: 8 }}>View Summary</Button>
      </div>
    </Card>
  );
}
