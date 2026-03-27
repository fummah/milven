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
  const [volumes, setVolumes] = useState([]);
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

  // Load courses and volumes
  useEffect(() => {
    if (mode === 'quiz' || courseId) return;
    (async () => {
      try {
        const [cRes, vRes] = await Promise.all([api.get('/api/cms/courses'), api.get('/api/cms/volumes')]);
        setCourses(Array.isArray(cRes.data?.courses) ? cRes.data.courses : (cRes.data?.items || []));
        setVolumes(Array.isArray(vRes.data?.volumes) ? vRes.data.volumes : []);
      } catch {
        setCourses([]);
        setVolumes([]);
      }
    })();
  }, [mode, courseId]);

  // Also load volumes when we have a courseId from URL
  useEffect(() => {
    if (!courseId && !selectedCourseId) return;
    (async () => {
      try {
        const { data } = await api.get('/api/cms/volumes');
        setVolumes(Array.isArray(data?.volumes) ? data.volumes : []);
      } catch {
        setVolumes([]);
      }
    })();
  }, [courseId, selectedCourseId]);

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

  const selectedVolumeId = Form.useWatch('volumeId', form);
  const selectedModuleId = Form.useWatch('moduleId', form);
  const selectedTopicIds = Form.useWatch('topicIds', form);

  const volumeOptions = useMemo(() => {
    const effCourse = courseId || selectedCourseId;
    if (!effCourse) return [];
    const filteredTopics = topics.filter(t => t.courseId === effCourse || t.course?.id === effCourse);
    const volumeIds = Array.from(new Set(filteredTopics.map(t => t.module?.volumeId).filter(Boolean)));
    return volumeIds
      .map(vid => {
        const vol = (volumes || []).find(v => v.id === vid);
        return vol ? { value: vol.id, label: vol.description ? `${vol.name} - ${vol.description}` : vol.name } : null;
      })
      .filter(Boolean);
  }, [topics, volumes, courseId, selectedCourseId]);

  const moduleOptions = useMemo(() => {
    const effCourse = courseId || selectedCourseId;
    let filtered = effCourse ? topics.filter(t => t.courseId === effCourse || t.course?.id === effCourse) : [];
    if (selectedVolumeId) filtered = filtered.filter(t => t.module?.volumeId === selectedVolumeId);
    const moduleMap = new Map();
    filtered.forEach(t => {
      if (t.module?.id && !moduleMap.has(t.module.id)) {
        moduleMap.set(t.module.id, { value: t.module.id, label: t.module.name || t.module.id });
      }
    });
    return Array.from(moduleMap.values());
  }, [topics, courseId, selectedCourseId, selectedVolumeId]);

  const topicOptions = useMemo(() => {
    const effCourse = courseId || selectedCourseId;
    let filtered = effCourse ? topics.filter(t => t.courseId === effCourse || t.course?.id === effCourse) : topics;
    if (selectedVolumeId) filtered = filtered.filter(t => t.module?.volumeId === selectedVolumeId);
    if (selectedModuleId) filtered = filtered.filter(t => t.moduleId === selectedModuleId || t.module?.id === selectedModuleId);
    return filtered.map(t => ({ value: t.id, label: t.name }));
  }, [topics, courseId, selectedCourseId, selectedVolumeId, selectedModuleId]);

  const conceptOptions = useMemo(() => {
    const tIds = Array.isArray(selectedTopicIds) ? selectedTopicIds : [];
    const effCourse = courseId || selectedCourseId;
    let relevantTopics = effCourse ? topics.filter(t => t.courseId === effCourse || t.course?.id === effCourse) : topics;
    if (selectedVolumeId) relevantTopics = relevantTopics.filter(t => t.module?.volumeId === selectedVolumeId);
    if (selectedModuleId) relevantTopics = relevantTopics.filter(t => t.moduleId === selectedModuleId || t.module?.id === selectedModuleId);
    if (tIds.length > 0) relevantTopics = relevantTopics.filter(t => tIds.includes(t.id));
    const concepts = [];
    relevantTopics.forEach(t => {
      if (t?.concepts) t.concepts.forEach(c => concepts.push({ value: c.id, label: `${c.name} (${t.name})` }));
    });
    return concepts;
  }, [topics, selectedTopicIds, courseId, selectedCourseId, selectedVolumeId, selectedModuleId]);

  const onCourseChange = async (cid) => {
    setSelectedCourseId(cid);
    form.setFieldsValue({ volumeId: undefined, moduleId: undefined, topicIds: undefined, conceptIds: undefined });
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
				volumeId: values.volumeId || undefined,
				moduleId: values.moduleId || undefined,
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
          {(courseId || selectedCourseId) && mode !== 'quiz' && volumeOptions.length > 0 && (
            <Form.Item label="Volume (optional)" name="volumeId">
              <Select
                placeholder="All volumes"
                showSearch
                optionFilterProp="label"
                options={volumeOptions}
                allowClear
                onChange={() => { form.setFieldsValue({ moduleId: undefined, topicIds: undefined, conceptIds: undefined }); }}
              />
            </Form.Item>
          )}
          {(courseId || selectedCourseId) && mode !== 'quiz' && moduleOptions.length > 0 && (
            <Form.Item label="Learning Module (optional)" name="moduleId">
              <Select
                placeholder="All modules"
                showSearch
                optionFilterProp="label"
                options={moduleOptions}
                allowClear
                onChange={() => { form.setFieldsValue({ topicIds: undefined, conceptIds: undefined }); }}
              />
            </Form.Item>
          )}
          {(courseId || selectedCourseId) && mode !== 'quiz' && topicOptions.length > 0 && (
            <Form.Item label="Topic(s) (optional)" name="topicIds">
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
            <Form.Item label="Concept(s) (optional)" name="conceptIds">
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


