import React, { useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Space, Typography, Card } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { ExamBuilder } from '../ExamBuilder.jsx';

export function AdminExamBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const back = params.get('back');
  const mode = params.get('mode'); // 'quiz' when launched from a Topic
  const topicId = params.get('topicId') || '';
  const courseId = params.get('courseId') || '';

  const handleBack = () => {
    if (back) {
      navigate(decodeURIComponent(back));
    } else {
      navigate(-1);
    }
  };

  // In quiz mode, hide the "Level" field in the underlying ExamBuilder UI (if present)
  useEffect(() => {
    if (mode === 'quiz') {
      const observer = new MutationObserver(() => {
        document.querySelectorAll('.ant-form-item-label').forEach((el) => {
          const label = el.textContent ? el.textContent.trim().toLowerCase() : '';
          if (label === 'level') {
            const item = el.closest('.ant-form-item');
            if (item && item.style) item.style.display = 'none';
          }
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
      // initial run
      setTimeout(() => {
        document.querySelectorAll('.ant-form-item-label').forEach((el) => {
          const label = el.textContent ? el.textContent.trim().toLowerCase() : '';
          if (label === 'level') {
            const item = el.closest('.ant-form-item');
            if (item && item.style) item.style.display = 'none';
          }
        });
      }, 0);
      return () => observer.disconnect();
    }
  }, [mode]);

  const header = useMemo(() => {
    if (mode === 'quiz') {
      return 'Build Topic Quiz';
    }
    return 'Build Course Exam';
  }, [mode]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }} className={mode === 'quiz' ? 'admin-exam-builder-quiz' : ''}>
      <Space align="center">
        <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>Back</Button>
        <Typography.Title level={4} style={{ margin: 0 }}>{header}</Typography.Title>
      </Space>
      <Card bodyStyle={{ padding: 0 }}>
        {/* Pass context via query params; ExamBuilder can use location.search if it supports it */}
        <ExamBuilder />
        {/* If needed later, we can wrap ExamBuilder and inject props derived from topicId/courseId */}
      </Card>
    </Space>
  );
}

