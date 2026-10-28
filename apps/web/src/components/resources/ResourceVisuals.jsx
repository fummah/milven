import React, { useEffect, useState } from 'react';
import { FilePdfOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import { assetUrl } from '../../lib/slideUrls';

export function ResourceSourceTag({ type, source }) {
  const isPdf = type === 'PDF';
  const label = isPdf ? 'Uploaded PDF' : source === 'MANUAL' ? 'Manual' : 'AI Generated';
  const color = isPdf ? 'red' : source === 'MANUAL' ? 'default' : 'purple';
  return <Tag color={color} style={{ marginInlineEnd: 0 }}>{label}</Tag>;
}

export function ResourceTypeTag({ type }) {
  return <Tag color={type === 'PDF' ? 'volcano' : type === 'NOTE' ? 'blue' : 'cyan'} style={{ marginInlineEnd: 0 }}>{type === 'PDF' ? 'PDF' : type === 'NOTE' ? 'Note' : 'Formula Card'}</Tag>;
}

export function PdfThumbnail({ url, title = 'PDF', height = 180 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);
  const src = url ? assetUrl(url) : null;
  return (
    <div style={{ height, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {src && !failed ? (
        <img
          src={src}
          alt={`${title} first page`}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }}
        />
      ) : (
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <FilePdfOutlined style={{ fontSize: 42, color: '#ef4444' }} />
          <div style={{ fontSize: 11, marginTop: 6 }}>Thumbnail preparing</div>
        </div>
      )}
    </div>
  );
}
