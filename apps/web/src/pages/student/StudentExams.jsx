import React, { useEffect, useMemo, useState } from 'react';
import { Card, List, Space, Button, Typography, Tag, Empty, message } from 'antd';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';

export function StudentExams() {
  const [loading, setLoading] = useState(false);
  const [enrolled, setEnrolled] = useState([]);
  const [examsByCourse, setExamsByCourse] = useState({});
  const [startingExamId, setStartingExamId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const en = await api.get('/api/learning/me/courses');
        setEnrolled(en.data.courses || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const enrolledCourseIds = useMemo(
    () => (enrolled || []).map(c => c.courseId).filter(Boolean),
    [enrolled]
  );

  useEffect(() => {
    (async () => {
      if (enrolledCourseIds.length === 0) {
        setExamsByCourse({});
        return;
      }
      const obj = {};
      for (const cid of enrolledCourseIds) {
        try {
          const { data } = await api.get('/api/exams/public', { params: { courseId: cid, type: 'COURSE' } });
          obj[cid] = data.exams || [];
        } catch {
          obj[cid] = [];
        }
      }
      setExamsByCourse(obj);
    })();
  }, [enrolledCourseIds.join(',')]);

  const items = useMemo(() => {
    const map = {};
    (enrolled || []).forEach(c => {
      if (!c.courseId) return;
      map[c.courseId] = { course: c, exams: examsByCourse[c.courseId] || [] };
    });
    return Object.values(map).filter(row => (row.exams || []).length > 0);
  }, [enrolled, examsByCourse]);

  const startExam = async (examId) => {
    if (!examId) return;
    setStartingExamId(examId);
    try {
      const { data } = await api.post(`/api/exams/${examId}/attempts`, {});
      const attemptId = data?.attempt?.id;
      if (attemptId) navigate(`/student/exams/take/${attemptId}`);
      else message.error('Could not start exam');
    } catch (e) {
      message.error(e?.response?.data?.error || 'Could not start exam');
    } finally {
      setStartingExamId(null);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>My Exams</Typography.Title>
      <Card loading={loading}>
        {!items.length ? (
          <Empty description="No exams available at this time" />
        ) : (
          <List
            dataSource={items}
            renderItem={(row) => {
              const firstExam = (row.exams || [])[0];
              const submitted = row.course?.examResult?.attemptId;
              return (
                <List.Item>
                  <List.Item.Meta
                    title={row.course?.name}
                    description={<span>Level: {row.course?.level}</span>}
                  />
                  <Space direction="vertical" align="end">
                    <Space wrap>
                      {(row.exams || []).map(ex => (
                        <Tag key={ex.id} color="green">{ex.name}</Tag>
                      ))}
                    </Space>
                    {submitted ? (
                      <Space>
                        <Tag color="green">Complete</Tag>
                        <Button
                          type="primary"
                          onClick={() => navigate(`/student/exams/result/${submitted}`)}
                        >
                          View results
                        </Button>
                      </Space>
                    ) : (
                      <Button
                        type="primary"
                        loading={firstExam && startingExamId === firstExam.id}
                        disabled={!firstExam}
                        onClick={() => firstExam && startExam(firstExam.id)}
                      >
                        Take exam
                      </Button>
                    )}
                  </Space>
                </List.Item>
              );
            }}
          />
        )}
      </Card>
    </Space>
  );
}

