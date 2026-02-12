import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, List, Typography, message } from 'antd';

export function Videos() {
	const [videos, setVideos] = useState([]);

	useEffect(() => {
		(async () => {
			try {
				const res = await api.get('/api/content/videos');
				setVideos(res.data.videos);
			} catch {
				message.error('Subscription required to view videos');
			}
		})();
	}, []);

	return (
		<Card title="Video Lectures">
			<List
				itemLayout="vertical"
				dataSource={videos}
				renderItem={(v) => (
					<List.Item key={v.id}>
						<Typography.Text strong>{v.title}</Typography.Text>
						<br />
						<a href={v.url} target="_blank" rel="noreferrer">{v.url}</a>
					</List.Item>
				)}
			/>
		</Card>
	);
}


