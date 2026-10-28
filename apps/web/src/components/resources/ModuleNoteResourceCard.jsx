import React from 'react';
import { Button, Card, Space, Tag, Tooltip, Typography } from 'antd';
import {
  DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined, ReloadOutlined,
  StarFilled, StarOutlined, UploadOutlined
} from '@ant-design/icons';
import { PdfThumbnail, ResourceSourceTag, ResourceTypeTag } from './ResourceVisuals';

const LEVEL_LABELS = { LEVEL1: 'Level I', LEVEL2: 'Level II', LEVEL3: 'Level III' };
const LEVEL_COLORS = { LEVEL1: 'blue', LEVEL2: 'purple', LEVEL3: 'gold' };

function lastUpdatedLabel(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleDateString(); } catch { return ''; }
}

export default function ModuleNoteResourceCard({
  resource,
  isAdmin = false,
  onPreview,
  onEdit,
  onToggleStatus,
  onDelete,
  onOpenPdf,
  onEditPdf,
  onReplacePdf,
  onDownloadPdf,
  onTogglePdfStatus
}) {
  const isPdf = resource.type === 'PDF';
  const status = resource.status;
  const level = resource.level || resource.course?.level;
  const moduleName = resource.module?.name;

  if (isPdf) {
    const ready = resource.processingStatus === 'READY';
    return (
      <Card
        hoverable
        onClick={() => onOpenPdf?.(resource)}
        style={{ borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', height: '100%', cursor: 'pointer' }}
        styles={{ body: { padding: 0 } }}
      >
        <PdfThumbnail url={resource.thumbnailUrl} title={resource.title} height={210} />
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#102540', lineHeight: 1.35 }}>{resource.title}</div>
            <Tag color={status === 'PUBLISHED' ? 'green' : 'default'}>{status === 'PUBLISHED' ? 'Published' : 'Draft'}</Tag>
          </div>
          <Space size={[4, 4]} wrap style={{ marginTop: 9 }}>
            <ResourceTypeTag type="PDF" />
            <ResourceSourceTag type="PDF" />
            <Tag color={LEVEL_COLORS[level]}>{LEVEL_LABELS[level] || level || 'Level'}</Tag>
            {resource.volume?.name && <Tag>{resource.volume.name}</Tag>}
            <Tag>Whole Volume</Tag>
            {resource.pageCount ? <Tag>{resource.pageCount} pages</Tag> : null}
            {resource.year ? <Tag>{resource.year}</Tag> : null}
            {!ready && <Tag color={resource.processingStatus === 'FAILED' ? 'error' : 'processing'}>{resource.processingStatus === 'FAILED' ? 'Processing failed' : 'Processing'}</Tag>}
          </Space>
          {resource.originalFilename && <div style={{ marginTop: 10, fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resource.originalFilename}</div>}
        </div>
        {isAdmin && (
          <div style={{ borderTop: '1px solid #f0f0f0', padding: '8px 12px', display: 'flex', justifyContent: 'flex-end', gap: 2, background: '#fafafa' }} onClick={event => event.stopPropagation()}>
            <Tooltip title="Preview PDF"><Button size="small" type="text" icon={<EyeOutlined />} onClick={() => onOpenPdf?.(resource)} /></Tooltip>
            <Tooltip title="Edit details"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEditPdf?.(resource)} /></Tooltip>
            <Tooltip title="Replace PDF"><Button size="small" type="text" icon={<UploadOutlined />} onClick={() => onReplacePdf?.(resource)} /></Tooltip>
            <Tooltip title={status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}><Button size="small" type="text" icon={status === 'PUBLISHED' ? <StarFilled style={{ color: '#22c55e' }} /> : <StarOutlined />} onClick={() => onTogglePdfStatus?.(resource)} /></Tooltip>
            <Tooltip title="Download"><Button size="small" type="text" icon={<DownloadOutlined />} onClick={() => onDownloadPdf?.(resource)} /></Tooltip>
            <Tooltip title="Delete"><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onDelete?.(resource)} /></Tooltip>
          </div>
        )}
      </Card>
    );
  }

  const losCount = Array.isArray(resource.losStatements) ? resource.losStatements.length : 0;
  const conceptCount = Array.isArray(resource.concepts) ? resource.concepts.length : 0;
  const formulaCount = Array.isArray(resource.formulaRecap) ? resource.formulaRecap.length : 0;
  const practiceCount = Array.isArray(resource.practiceSet) ? resource.practiceSet.length : 0;

  return (
    <Card
      hoverable
      onClick={() => onPreview?.(resource)}
      style={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', height: '100%' }}
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#102540', lineHeight: 1.3 }}>{resource.title}</div>
            {moduleName && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{moduleName}</div>}
          </div>
          <Tag color={status === 'PUBLISHED' ? 'green' : 'default'} style={{ flexShrink: 0, marginTop: 2 }}>{status}</Tag>
        </div>
        <Space size={[4, 4]} wrap style={{ marginTop: 9 }}>
          <ResourceTypeTag type="NOTE" />
          <ResourceSourceTag type="NOTE" source={resource.source} />
          <Tag color={LEVEL_COLORS[level]}>{LEVEL_LABELS[level] || level}</Tag>
          {resource.difficulty && <Tag>{resource.difficulty}</Tag>}
          {resource.studyTime && <Tag color="geekblue">{resource.studyTime}</Tag>}
        </Space>
        {resource.overview && <div style={{ fontSize: 13, color: '#475569', marginTop: 9, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{resource.overview}</div>}
        <Space size={[8, 6]} wrap style={{ marginTop: 10 }}>
          {losCount > 0 && <Tag color="blue">{losCount} LOS</Tag>}
          {conceptCount > 0 && <Tag color="purple">{conceptCount} concepts</Tag>}
          {formulaCount > 0 && <Tag color="cyan">{formulaCount} formulas</Tag>}
          {practiceCount > 0 && <Tag color="green">{practiceCount} practice Qs</Tag>}
        </Space>
        {resource.updatedAt && <Typography.Text type="secondary" style={{ display: 'block', fontSize: 11, marginTop: 10 }}>Updated {lastUpdatedLabel(resource.updatedAt)}</Typography.Text>}
      </div>
      {isAdmin && (
        <div style={{ borderTop: '1px solid #f0f0f0', padding: '8px 12px', display: 'flex', justifyContent: 'flex-end', gap: 2, background: '#fafafa' }} onClick={event => event.stopPropagation()}>
          <Tooltip title="Preview"><Button size="small" type="text" icon={<EyeOutlined />} onClick={() => onPreview?.(resource)} /></Tooltip>
          <Tooltip title="Edit"><Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEdit?.(resource)} /></Tooltip>
          <Tooltip title={status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}><Button size="small" type="text" icon={status === 'PUBLISHED' ? <StarFilled style={{ color: '#22c55e' }} /> : <ReloadOutlined />} onClick={() => onToggleStatus?.(resource)} /></Tooltip>
          <Tooltip title="Delete"><Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onDelete?.(resource)} /></Tooltip>
        </div>
      )}
    </Card>
  );
}
