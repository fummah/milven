import React from 'react';
import { Button, Card, Space, Tag, Tooltip, Typography } from 'antd';
import {
  CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined,
  ReloadOutlined, StarFilled, StarOutlined, UploadOutlined
} from '@ant-design/icons';
import MathText from '../MathText';
import { PdfThumbnail, ResourceSourceTag, ResourceTypeTag } from './ResourceVisuals';

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };
const LEVEL_COLORS = { LEVEL1: 'blue', LEVEL2: 'purple', LEVEL3: 'gold' };

export default function FormulaResourceCard({
  resource,
  isAdmin = false,
  onPreview,
  onEdit,
  onToggleHighYield,
  onDuplicate,
  onDelete,
  onOpenPdf,
  onEditPdf,
  onReplacePdf,
  onDownloadPdf,
  onTogglePdfStatus
}) {
  if (resource.type === 'PDF') {
    return (
      <Card
        hoverable
        onClick={() => onOpenPdf?.(resource)}
        style={{ borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', height: '100%', cursor: 'pointer' }}
        styles={{ body: { padding: 0 } }}
      >
        <PdfThumbnail url={resource.thumbnailUrl} title={resource.title} height={210} />
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#102540', lineHeight: 1.35 }}>{resource.title}</div>
            <Tag color={resource.status === 'PUBLISHED' ? 'green' : 'default'}>{resource.status === 'PUBLISHED' ? 'Published' : 'Draft'}</Tag>
          </div>
          <Space size={[4, 4]} wrap style={{ marginTop: 9 }}>
            <ResourceTypeTag type="PDF" />
            <ResourceSourceTag type="PDF" />
            <Tag color={LEVEL_COLORS[resource.level]}>{LEVEL_LABELS[resource.level] || resource.level}</Tag>
            {resource.volume?.name && <Tag>{resource.volume.name}</Tag>}
            <Tag>Whole Volume</Tag>
            {resource.pageCount ? <Tag>{resource.pageCount} pages</Tag> : null}
            {resource.year ? <Tag>{resource.year}</Tag> : null}
          </Space>
          {resource.originalFilename && <div style={{ marginTop: 10, fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resource.originalFilename}</div>}
        </div>
        {isAdmin && (
          <div style={{ borderTop: '1px solid #f0f0f0', padding: '8px 12px', display: 'flex', justifyContent: 'flex-end', gap: 2, background: '#fafafa' }} onClick={event => event.stopPropagation()}>
            <Tooltip title="Preview PDF"><Button size="small" type="text" icon={<EyeOutlined />} onClick={() => onOpenPdf?.(resource)} /></Tooltip>
            <Tooltip title="Edit details"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEditPdf?.(resource)} /></Tooltip>
            <Tooltip title="Replace PDF"><Button size="small" type="text" icon={<UploadOutlined />} onClick={() => onReplacePdf?.(resource)} /></Tooltip>
            <Tooltip title={resource.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}><Button size="small" type="text" icon={resource.status === 'PUBLISHED' ? <StarFilled style={{ color: '#22c55e' }} /> : <ReloadOutlined />} onClick={() => onTogglePdfStatus?.(resource)} /></Tooltip>
            <Tooltip title="Download"><Button size="small" type="text" icon={<DownloadOutlined />} onClick={() => onDownloadPdf?.(resource)} /></Tooltip>
            <Tooltip title="Delete"><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onDelete?.(resource)} /></Tooltip>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card
      hoverable
      onClick={() => onPreview?.(resource)}
      style={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', height: '100%' }}
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#102540', lineHeight: 1.35 }}>{resource.title}</div>
          {resource.highYield && <StarFilled style={{ color: '#f59e0b', marginTop: 3 }} />}
        </div>
        <Space size={[4, 4]} wrap style={{ marginTop: 9 }}>
          <ResourceTypeTag type="FORMULA" />
          <ResourceSourceTag type="FORMULA" source={resource.source} />
          <Tag color={LEVEL_COLORS[resource.level]}>{LEVEL_LABELS[resource.level] || resource.level}</Tag>
          {resource.volume?.name && <Tag>{resource.volume.name}</Tag>}
          {resource.module?.name && <Tag>{resource.module.name}</Tag>}
          {resource.topic?.name && <Tag>{resource.topic.name}</Tag>}
        </Space>
        <div style={{ marginTop: 12, background: '#f0f4f8', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0', minHeight: 68, overflow: 'hidden' }}>
          <Typography.Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Formula</Typography.Text>
          <MathText text={resource.formula} tag="div" style={{ fontFamily: "'Cambria Math', Georgia, serif", fontSize: 17, fontWeight: 600, color: '#102540', marginTop: 4, maxHeight: 96, overflow: 'hidden' }} />
        </div>
        {resource.interpretation && <div style={{ fontSize: 12.5, color: '#475569', marginTop: 10, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{resource.interpretation}</div>}
      </div>
      {isAdmin && (
        <div style={{ borderTop: '1px solid #f0f0f0', padding: '8px 12px', display: 'flex', justifyContent: 'flex-end', gap: 2, background: '#fafafa' }} onClick={event => event.stopPropagation()}>
          <Tooltip title="Preview"><Button size="small" type="text" icon={<EyeOutlined />} onClick={() => onPreview?.(resource)} /></Tooltip>
          <Tooltip title="Edit"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEdit?.(resource)} /></Tooltip>
          <Tooltip title={resource.highYield ? 'Remove High-Yield' : 'Mark High-Yield'}><Button size="small" type="text" icon={resource.highYield ? <StarFilled style={{ color: '#f59e0b' }} /> : <StarOutlined />} onClick={() => onToggleHighYield?.(resource)} /></Tooltip>
          <Tooltip title="Duplicate"><Button size="small" type="text" icon={<CopyOutlined />} onClick={() => onDuplicate?.(resource)} /></Tooltip>
          <Tooltip title="Delete"><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onDelete?.(resource)} /></Tooltip>
        </div>
      )}
    </Card>
  );
}
