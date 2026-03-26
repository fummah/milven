import { Card, Form, Input, InputNumber, Button, Select, message } from 'antd';
import { api } from '../lib/api';
import { useNavigate, useLocation } from 'react-router-dom';
import React, { useEffect, useMemo, useState } from 'react';

export function ExamBuilder() {
	const [form] = Form.useForm();
	const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode'); // 'quiz' when launched from topic
  const topicId = params.get('topicId') || '';
  const courseId = params.get('courseId') || '';
  const [hideLevel, setHideLevel] = useState(false);
  const [levelFromTopic, setLevelFromTopic] = useState(null);
  const [levelFromCourse, setLevelFromCourse] = useState(null);
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(courseId || '');

  useEffect(() => {
    async function initDefaults() {
      if (mode === 'quiz' && topicId) {
        setHideLevel(true);
        try {
          const { data } = await api.get(`/api/cms/topics/${topicId}`);
          const t = data?.topic;
          if (t?.level) setLevelFromTopic(t.level);
          const defaultName = t?.name ? `${t.name} Quiz` : 'Quiz';
          form.setFieldsValue({
            name: defaultName,
            // level hidden but we keep it in state
            timeLimitMinutes: 60,
            questionCount: 10
          });
        } catch {
          form.setFieldsValue({ name: 'Quiz', timeLimitMinutes: 60, questionCount: 10 });
        }
      } else {
        // Course exam: if courseId provided, hide level and derive from course
        if (courseId) {
          setHideLevel(true);
          try {
            const { data } = await api.get(`/api/cms/courses/${courseId}`);
            const count = Array.isArray(data?.exams) ? data.exams.length : 0;
            const courseLevel = data?.course?.level ?? null;
            if (courseLevel) setLevelFromCourse(courseLevel);
            form.setFieldsValue({ name: `Exam ${count + 1}` });
          } catch {
            form.setFieldsValue({ name: 'Exam 1' });
          }
        } else {
          // No course context; select a course (level derived from course)
          setHideLevel(true);
          form.setFieldsValue({ name: 'Exam 1' });
        }
      }
    }
    initDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load courses for selection when building course exam without context
  useEffect(() => {
    if (mode === 'quiz' || courseId) return;
    (async () => {
      try {
        const { data } = await api.get('/api/cms/courses');
        const list = Array.isArray(data?.courses) ? data.courses : (data?.items || []);
        setCourses(list);
      } catch {
        setCourses([]);
      }
    })();
  }, [mode, courseId]);

  // Load topics for the effective course (for concept filtering)
  useEffect(() => {
    const effCourse = courseId || selectedCourseId;
    if (!effCourse) { setTopics([]); return; }
    (async () => {
      try {
        const { data } = await api.get(`/api/cms/topics?courseId=${effCourse}`);
        setTopics(Array.isArray(data?.topics) ? data.topics : []);
      } catch {
        setTopics([]);
      }
    })();
  }, [courseId, selectedCourseId]);

  const selectedTopicIds = Form.useWatch('topicIds', form);
  const conceptOptions = useMemo(() => {
    const tIds = Array.isArray(selectedTopicIds) ? selectedTopicIds : [];
    // If no specific topics selected, show all concepts for the course
    const relevantTopics = tIds.length > 0 ? topics.filter(t => tIds.includes(t.id)) : topics;
    const concepts = [];
    relevantTopics.forEach(t => {
      if (t?.concepts) t.concepts.forEach(c => concepts.push({ value: c.id, label: `${c.name} (${t.name})` }));
    });
    return concepts;
  }, [topics, selectedTopicIds]);

  const topicOptions = useMemo(() => {
    return topics.map(t => ({ value: t.id, label: t.name }));
  }, [topics]);

  const onCourseChange = async (cid) => {
    setSelectedCourseId(cid);
    form.setFieldsValue({ topicIds: undefined, conceptIds: undefined });
    try {
      const { data } = await api.get(`/api/cms/courses/${cid}`);
      const cl = data?.course?.level ?? null;
      if (cl) setLevelFromCourse(cl);
    } catch {
      // ignore
    }
  };

	const onBuild = async (values) => {
		try {
      const effectiveCourseId = courseId || values.courseId || selectedCourseId || undefined;
			const res = await api.post('/api/exams/custom', {
				name: values.name,
				level: mode === 'quiz'
          ? (levelFromTopic ?? 'LEVEL1')
          : (effectiveCourseId ? (levelFromCourse ?? 'LEVEL1') : values.level),
				timeLimitMinutes: values.timeLimitMinutes,
				topicIds: mode === 'quiz' && topicId ? [topicId] : (values.topicIds ?? []),
				conceptIds: Array.isArray(values.conceptIds) && values.conceptIds.length > 0 ? values.conceptIds : undefined,
				questionCount: values.questionCount,
        examType: mode === 'quiz' ? 'QUIZ' : 'COURSE',
        topicId: mode === 'quiz' ? topicId : undefined,
        courseId: effectiveCourseId
			});
			const examId = res.data.exam.id;
      message.success('Exam created. Add questions next.');
      const backParam = params.get('back');
      const back = backParam ? backParam : encodeURIComponent(window.location.pathname + window.location.search);
      const qp = new URLSearchParams({ mode: mode || '', topicId, courseId, back }).toString();
			navigate(`/admin/exams/${examId}/edit?${qp}`);
		} catch {
			message.error('Subscription required or invalid input.');
		}
	};

	return (
		<div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
			<Card title="Build Custom Exam" style={{ width: 600, maxWidth: '100%' }}>
				<Form layout="vertical" form={form} onFinish={onBuild} initialValues={{ level: 'LEVEL1', timeLimitMinutes: 90, questionCount: 20 }}>
					<Form.Item label="Name" name="name" rules={[{ required: true }]}>
						<Input placeholder="My Level I Practice" />
					</Form.Item>
          {/* For generic build (no course context), allow course selection instead of level */}
          {(!courseId && mode !== 'quiz') && (
            <Form.Item label="Course" name="courseId" rules={[{ required: true }]}>
              <Select
                showSearch
                placeholder="Select course"
                options={(courses || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(c => ({ label: `${c.name} — ${c.level}`, value: c.id }))}
                onChange={onCourseChange}
              />
            </Form.Item>
          )}
          {!hideLevel && (mode === 'quiz') && (
            <Form.Item label="Level" name="level" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Level I', value: 'LEVEL1' },
                  { label: 'Level II', value: 'LEVEL2' },
                  { label: 'Level III', value: 'LEVEL3' }
                ]}
              />
            </Form.Item>
          )}
          {(courseId || selectedCourseId) && mode !== 'quiz' && topicOptions.length > 0 && (
            <Form.Item label="Topics (optional)" name="topicIds">
              <Select
                mode="multiple"
                placeholder="All topics"
                showSearch
                optionFilterProp="label"
                options={topicOptions}
                onChange={() => { form.setFieldsValue({ conceptIds: undefined }); }}
              />
            </Form.Item>
          )}
          {(courseId || selectedCourseId) && mode !== 'quiz' && conceptOptions.length > 0 && (
            <Form.Item label="Concepts (optional)" name="conceptIds">
              <Select
                mode="multiple"
                placeholder="All concepts"
                showSearch
                optionFilterProp="label"
                options={conceptOptions}
              />
            </Form.Item>
          )}
					<Form.Item label="Time limit (minutes)" name="timeLimitMinutes" rules={[{ required: true }]}>
						<InputNumber min={10} max={360} style={{ width: '100%' }} />
					</Form.Item>
					<Form.Item label="Question count" name="questionCount" rules={[{ required: true }]}>
						<InputNumber min={5} max={120} style={{ width: '100%' }} />
					</Form.Item>
					<Button type="primary" htmlType="submit" block>
						Create & Start
					</Button>
				</Form>
			</Card>
		</div>
	);
}


