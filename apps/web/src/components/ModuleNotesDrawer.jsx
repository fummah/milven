import React, { useEffect, useState } from 'react';
import { Drawer, Typography, Tag, Spin, Empty } from 'antd';
import { BookOutlined } from '@ant-design/icons';
import { api } from '../lib/api';
import { ModuleNotePreviewCard } from './ModuleNotePreviewCard';

/**
 * A reusable drawer that fetches and displays Module Notes for a given topicId.
 * Props:
 *   - open: boolean
 *   - onClose: () => void
 *   - topicId: string | null
 *   - topicName: string | null (for display in the title)
 */
export function ModuleNotesDrawer({ open, onClose, topicId, topicName }) {
	const [loading, setLoading] = useState(false);
	const [notes, setNotes] = useState([]);
	const [activeNote, setActiveNote] = useState(null);

	useEffect(() => {
		if (!open || !topicId) return;
		setLoading(true);
		setNotes([]);
		setActiveNote(null);
		api.get('/api/module-notes', { params: { topicId, status: 'PUBLISHED', limit: 50 } })
			.then(res => {
				const list = res.data?.notes || [];
				setNotes(list);
				if (list.length > 0) setActiveNote(list[0]);
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [open, topicId]);

	return (
		<Drawer
			title={
				<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
					<div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #102540 0%, #1b3a5b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
						<BookOutlined style={{ fontSize: 16, color: '#fff' }} />
					</div>
					<div>
						<div style={{ fontWeight: 700, color: '#102540', fontSize: 15 }}>Module Notes</div>
						{topicName && <div style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>{topicName}</div>}
					</div>
				</div>
			}
			placement="right"
			open={open}
			onClose={onClose}
			width={Math.min(780, typeof window !== 'undefined' ? window.innerWidth * 0.92 : 780)}
			styles={{ body: { padding: 0, background: '#f8fafc' } }}
		>
			{loading ? (
				<div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>
			) : notes.length === 0 ? (
				<div style={{ padding: 40 }}>
					<Empty
						image={Empty.PRESENTED_IMAGE_SIMPLE}
						description={
							<div>
								<Typography.Text style={{ display: 'block', color: '#64748b', marginBottom: 4 }}>No module notes found for this topic</Typography.Text>
								<Typography.Text type="secondary" style={{ fontSize: 12 }}>Module notes will appear here once they are published by the admin.</Typography.Text>
							</div>
						}
					/>
				</div>
			) : (
				<div>
					{/* Note selector if multiple */}
					{notes.length > 1 && (
						<div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff', display: 'flex', gap: 8, overflowX: 'auto' }}>
							{notes.map((n, idx) => (
								<Tag
									key={n.id}
									color={activeNote?.id === n.id ? 'blue' : undefined}
									onClick={() => setActiveNote(n)}
									style={{ cursor: 'pointer', borderRadius: 8, padding: '4px 12px', fontWeight: activeNote?.id === n.id ? 600 : 400 }}
								>
									{n.title}
								</Tag>
							))}
						</div>
					)}

					{activeNote && <ModuleNotePreviewCard note={activeNote} />}
				</div>
			)}
		</Drawer>
	);
}

export default ModuleNotesDrawer;
