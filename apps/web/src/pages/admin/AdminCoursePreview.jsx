import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Layout, List, Typography, Button, Space, Card, Tag, message, Avatar, Tooltip, Progress, Radio, Divider, Collapse, Modal, Drawer } from 'antd';
import { ArrowLeftOutlined, EyeOutlined, PlusOutlined, MenuFoldOutlined, MenuUnfoldOutlined, BookOutlined, ReadOutlined, FieldTimeOutlined, HistoryOutlined, CheckCircleFilled, LinkOutlined, FilePdfOutlined, FileImageOutlined, CaretRightOutlined, TrophyOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { api } from '../../lib/api';
import { useSettings } from '../../contexts/SettingsContext.jsx';

export function AdminCoursePreview() {
  const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
  const asUrl = (u) => {
    if (!u) return u;
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    if (u.startsWith('/uploads')) return `${API_URL}${u}`;
    return u;
  };
  const { id } = useParams(); // courseId
  const location = useLocation();
  const topicParam = (() => {
    try { return new URLSearchParams(location.search).get('topicId'); } catch { return null; }
  })();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [materialsByTopic, setMaterialsByTopic] = useState({});
  const [currentTopicId, setCurrentTopicId] = useState(null);
  const [quizByTopic, setQuizByTopic] = useState({});
  const [loading, setLoading] = useState(false);
  const [siderWidth, setSiderWidth] = useState(320);
  const [narrow, setNarrow] = useState(false);
  const [etaByTopic, setEtaByTopic] = useState({});
  const [progressByTopic, setProgressByTopic] = useState({});
  const [remainingByTopic, setRemainingByTopic] = useState({});
  const [timeSpentByTopic, setTimeSpentByTopic] = useState({});
  const [inlineAttemptId, setInlineAttemptId] = useState(null);
  const [inlineExamId, setInlineExamId] = useState(null);
  const [inlineQuestions, setInlineQuestions] = useState([]);
  const [inlineSubmitting, setInlineSubmitting] = useState(false);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [resultAttempt, setResultAttempt] = useState(null);
  const [answersDrawerOpen, setAnswersDrawerOpen] = useState(false);
  const [answersDrawerAttempt, setAnswersDrawerAttempt] = useState(null);
  const [answersDrawerLoading, setAnswersDrawerLoading] = useState(false);
  const [submittedAttemptByExamId, setSubmittedAttemptByExamId] = useState({});
  const [overallProgress, setOverallProgress] = useState(0);
  const [courseExam, setCourseExam] = useState(null);
  const [courseExamLoading, setCourseExamLoading] = useState(false);
  const [startCourseExamLoading, setStartCourseExamLoading] = useState(false);
  const [courseExamAttemptId, setCourseExamAttemptId] = useState(null);
  const userClickedTopicIdRef = useRef(null);
  const isStudentPath = location.pathname.startsWith('/student');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const { settings } = useSettings();
  const heartbeatSec = Number(settings['learning.progress.heartbeatSec'] || 10);
  const heartbeatMs = Math.max(1000, heartbeatSec * 1000);

  // Live update overall course progress while studying
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await api.get(`/api/learning/courses/${id}/progress`);
        if (!cancelled) setOverallProgress(Math.round(data?.percent ?? 0));
      } catch {}
    };
    // initial and interval
    poll();
    const t = setInterval(poll, 20000);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener('resize', onResize);
    };
  }, [id]);

  // Auto-advance only when progress *just* reaches 100% (not when user reopens a completed topic)
  const prevProgressRef = useRef({ topicId: null, pct: 0 });
  useEffect(() => {
    if (!currentTopicId || !topics?.length) return;
    const pct = progressByTopic[currentTopicId] ?? 0;
    const prev = prevProgressRef.current;
    if (prev.topicId !== currentTopicId) {
      prevProgressRef.current = { topicId: currentTopicId, pct };
      return;
    }
    const justCompleted = pct >= 100 && prev.pct < 100;
    prevProgressRef.current = { topicId: currentTopicId, pct };
    if (!justCompleted) return;
    if (userClickedTopicIdRef.current === currentTopicId) {
      userClickedTopicIdRef.current = null;
      return;
    }
    const idx = topics.findIndex(t => t.id === currentTopicId);
    const next = idx >= 0 ? topics[idx + 1] : null;
    if (next) {
      setCurrentTopicId(next.id);
      prevProgressRef.current = { topicId: next.id, pct: progressByTopic[next.id] ?? 0 };
      (async () => {
        await loadMaterialsFor(next.id);
        await loadQuizFor(next.id);
        try {
          const { data } = await api.get(`/api/learning/topics/${next.id}/progress`);
          setProgressByTopic(prev => ({ ...prev, [next.id]: data?.percent ?? 0 }));
          if (typeof data?.remainingSeconds === 'number') {
            setRemainingByTopic(prev => ({ ...prev, [next.id]: Math.max(0, Math.ceil(data.remainingSeconds / 60)) }));
          }
        } catch {}
        try { message.success('Topic completed. Moved to next topic.'); } catch {}
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTopicId, progressByTopic[currentTopicId]]);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      // Use student-friendly endpoint
      const { data } = await api.get(`/api/learning/courses/${id}/detail`);
      setDetail(data);
      let initialTopic = (data.topics || [])[0]?.id || null;
      if (topicParam && (data.topics || []).some(t => t.id === topicParam)) {
        initialTopic = topicParam;
      }
      setCurrentTopicId(initialTopic);
      if (initialTopic) {
        await loadMaterialsFor(initialTopic);
        await loadQuizFor(initialTopic);
        try {
          const { data: tp } = await api.get(`/api/learning/topics/${initialTopic}/progress`);
          setProgressByTopic(prev => ({ ...prev, [initialTopic]: tp?.percent ?? 0 }));
          if (typeof tp?.remainingSeconds === 'number') {
            setRemainingByTopic(prev => ({ ...prev, [initialTopic]: Math.max(0, Math.ceil(tp.remainingSeconds / 60)) }));
          }
          if (typeof tp?.estimatedSeconds === 'number') {
            setEtaByTopic(prev => ({ ...prev, [initialTopic]: Math.max(1, Math.ceil(tp.estimatedSeconds / 60)) }));
          }
          if (typeof tp?.timeSpentSec === 'number') {
            setTimeSpentByTopic(prev => ({ ...prev, [initialTopic]: tp.timeSpentSec }));
          }
        } catch {}
      }
      // Estimate times
      try {
        const topics = data.topics || [];
        const res = await Promise.all(
          topics.map(async (t) => {
            try {
              const { data: m } = await api.get(`/api/cms/topics/${t.id}/materials`);
              const eta = typeof m.etaSeconds === 'number'
                ? Math.max(1, Math.ceil(m.etaSeconds / 60))
                : estimateMinutes(m.materials || []);
              return [t.id, eta];
            } catch {
              return [t.id, 0];
            }
          })
        );
        setEtaByTopic(Object.fromEntries(res));
      } catch {}
      // Load overall course progress
      try {
        const { data: cp } = await api.get(`/api/learning/courses/${id}/progress`);
        setOverallProgress(Math.round(cp?.percent ?? 0));
      } catch {}
      // Progress from storage
      try {
        const key = `previewProgress:${id}`;
        const saved = JSON.parse(localStorage.getItem(key) || '{}');
        setProgressByTopic(saved);
      } catch {}
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  const loadMaterialsFor = async (topicId) => {
    if (!topicId || materialsByTopic[topicId]) return;
    try {
      const { data } = await api.get(`/api/learning/topics/${topicId}/materials`);
      setMaterialsByTopic(prev => ({ ...prev, [topicId]: data.materials || [] }));
      if (typeof data.etaSeconds === 'number') {
        setEtaByTopic(prev => ({ ...prev, [topicId]: Math.max(1, Math.ceil(data.etaSeconds / 60)) }));
      } else {
        const eta = estimateMinutes(data.materials || []);
        setEtaByTopic(prev => ({ ...prev, [topicId]: eta }));
      }
    } catch {
      setMaterialsByTopic(prev => ({ ...prev, [topicId]: [] }));
    }
  };

  const loadQuizFor = async (topicId) => {
    try {
      // Use public endpoint so students get active quizzes; admin preview also uses this
      const { data } = await api.get('/api/exams/public', { params: { topicId, type: 'QUIZ' } });
      const quiz = (data?.exams || [])[0] || null;
      setQuizByTopic(prev => ({ ...prev, [topicId]: quiz }));
    } catch {}
  };

  const fetchMyAttempts = async () => {
    try {
      const { data } = await api.get('/api/exams/attempts/me');
      const attempts = data?.attempts || [];
      const submitted = attempts.filter(a => a.status === 'SUBMITTED');
      const byExam = {};
      for (const a of submitted) {
        if (a.examId && (!byExam[a.examId] || new Date(a.submittedAt) > new Date(byExam[a.examId].submittedAt))) {
          byExam[a.examId] = { id: a.id, scorePercent: a.scorePercent, submittedAt: a.submittedAt };
        }
      }
      setSubmittedAttemptByExamId(byExam);
    } catch {
      setSubmittedAttemptByExamId({});
    }
  };

  useEffect(() => { fetchDetail(); /* eslint-disable-next-line */ }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchMyAttempts();
  }, [id]);

  const fetchCourseExam = async () => {
    if (!id || !isStudentPath) return;
    setCourseExamLoading(true);
    try {
      const { data } = await api.get('/api/exams/public', { params: { courseId: id, type: 'COURSE' } });
      const exams = data?.exams || [];
      setCourseExam(exams[0] || null);
    } catch {
      setCourseExam(null);
    } finally {
      setCourseExamLoading(false);
    }
  };

  useEffect(() => {
    if (!id || !isStudentPath) return;
    fetchCourseExam();
  }, [id, isStudentPath]);

  // Whether user has already submitted the course exam (for "Complete" + "View results")
  useEffect(() => {
    if (!id || !isStudentPath) return;
    (async () => {
      try {
        const { data } = await api.get('/api/learning/me/courses');
        const course = (data?.courses || []).find(c => c.courseId === id);
        setCourseExamAttemptId(course?.examResult?.attemptId ?? null);
      } catch {
        setCourseExamAttemptId(null);
      }
    })();
  }, [id, isStudentPath]);

  const course = detail?.course;
  const modules = detail?.modules ?? [];
  const topics = (detail?.topics || []).slice().sort((a, b) => {
    const am = a.moduleNumber ?? 0, bm = b.moduleNumber ?? 0;
    if (am !== bm) return am - bm;
    const ao = a.order ?? 0, bo = b.order ?? 0;
    return ao - bo;
  });
  const standaloneTopics = (detail?.topics || []).filter(t => !t.moduleId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const currentMaterials = currentTopicId ? (materialsByTopic[currentTopicId] || []) : [];
  const video = currentMaterials.find(m => m.kind === 'VIDEO' && m.url);
  const htmls = currentMaterials.filter(m => m.kind === 'HTML' && m.contentHtml);
  const docs = currentMaterials.filter(m => m.kind !== 'VIDEO' && m.kind !== 'HTML' && m.url);
  const currentTopic = topics.find(t => t.id === currentTopicId);
  const currentQuiz = currentTopicId ? quizByTopic[currentTopicId] : null;

  const startQuiz = async () => {
    const q = currentTopicId ? quizByTopic[currentTopicId] : null;
    if (!q) return message.error('No quiz for this topic');
    try {
      const { data } = await api.post(`/api/exams/${q.id}/attempts`, {});
      const attemptId = data?.attempt?.id;
      if (attemptId) {
        setInlineAttemptId(attemptId);
        setInlineExamId(q.id);
        const qs = await api.get(`/api/exams/${q.id}/questions`);
        setInlineQuestions(qs.data.questions || []);
        message.success('Quiz started');
      }
    } catch {
      message.error('Could not start quiz');
    }
  };

  const onContentScroll = (e) => {
    const el = e.currentTarget;
    const total = el.scrollHeight - el.clientHeight;
    const pct = total > 0 ? Math.min(100, Math.round((el.scrollTop / total) * 100)) : 100;
    if (!currentTopicId) return;
    const current = progressByTopic[currentTopicId] ?? 0;
    const nextPct = Math.max(current, pct);
    const next = { ...progressByTopic, [currentTopicId]: nextPct };
    setProgressByTopic(next);
    try {
      localStorage.setItem(`previewProgress:${id}`, JSON.stringify(next));
    } catch {}
  };

  const submitInline = async () => {
    if (!inlineAttemptId) return;
    setInlineSubmitting(true);
    try {
      const { data } = await api.post(`/api/exams/attempts/${inlineAttemptId}/submit`, {});
      const att = data?.attempt;
      if (att) {
        setResultAttempt({ id: att.id, scorePercent: att.scorePercent, submittedAt: att.submittedAt });
        setResultModalOpen(true);
        setSubmittedAttemptByExamId(prev => ({ ...prev, [inlineExamId]: { id: att.id, scorePercent: att.scorePercent, submittedAt: att.submittedAt } }));
      }
      setInlineAttemptId(null);
      setInlineExamId(null);
      setInlineQuestions([]);
    } catch {
      message.error('Submit failed');
    } finally {
      setInlineSubmitting(false);
    }
  };

  const openResultModal = (attemptInfo) => {
    if (!attemptInfo) return;
    setResultAttempt({ id: attemptInfo.id, scorePercent: attemptInfo.scorePercent, submittedAt: attemptInfo.submittedAt });
    setResultModalOpen(true);
  };

  const startCourseExam = async () => {
    if (!courseExam?.id) return;
    setStartCourseExamLoading(true);
    try {
      const { data } = await api.post(`/api/exams/${courseExam.id}/attempts`, {});
      const attemptId = data?.attempt?.id;
      if (attemptId) navigate(isStudentPath ? `/student/exams/take/${attemptId}` : `/exams/take/${attemptId}`);
      else message.error('Could not start exam');
    } catch (e) {
      message.error(e?.response?.data?.error || 'Could not start exam');
    } finally {
      setStartCourseExamLoading(false);
    }
  };

  const closeResultModal = () => {
    setResultModalOpen(false);
    setResultAttempt(null);
  };

  const openAnswersDrawer = async () => {
    const attemptId = resultAttempt?.id;
    if (!attemptId) return;
    closeResultModal();
    setAnswersDrawerOpen(true);
    setAnswersDrawerLoading(true);
    setAnswersDrawerAttempt(null);
    try {
      const { data } = await api.get(`/api/exams/attempts/${attemptId}`);
      setAnswersDrawerAttempt(data?.attempt ?? null);
    } catch {
      message.error('Could not load answers');
      setAnswersDrawerOpen(false);
    } finally {
      setAnswersDrawerLoading(false);
    }
  };


  const onSelectOption = async (questionId, optionId) => {
    if (!inlineAttemptId) return;
    try {
      await api.post(`/api/exams/attempts/${inlineAttemptId}/answers`, {
        questionId,
        selectedOptionId: optionId,
        timeSpentSec: 5
      });
    } catch {}
  };

  // Track user activity to avoid counting idle time
  const lastUserActiveRef = useRef(Date.now());
  useEffect(() => {
    const onActive = () => { lastUserActiveRef.current = Date.now(); };
    window.addEventListener('mousemove', onActive);
    window.addEventListener('keydown', onActive);
    window.addEventListener('touchstart', onActive);
    window.addEventListener('wheel', onActive);
    return () => {
      window.removeEventListener('mousemove', onActive);
      window.removeEventListener('keydown', onActive);
      window.removeEventListener('touchstart', onActive);
      window.removeEventListener('wheel', onActive);
    };
  }, []);

  // Heartbeat for HTML content (first HTML block)
  const htmlRef = useRef(null);
  const htmlTimerRef = useRef(null);
  const maxHtmlDepthRef = useRef(0);
  const lastHtmlBeatAtRef = useRef(Date.now());
  useEffect(() => {
    if (!htmlRef.current || inlineAttemptId) return;
    const el = htmlRef.current;
    let visible = false;
    const io = new IntersectionObserver((entries) => {
      visible = entries.some(e => e.isIntersecting);
    }, { threshold: [0.25] });
    io.observe(el);
    htmlTimerRef.current = setInterval(async () => {
      if (!visible) return;
      // Do not count if user idle for >15s (Coursera/Udemy-like guard)
      if (Date.now() - lastUserActiveRef.current > 15000) return;
      const mat = htmls[0];
      if (!mat) return;
      // Use monotonic scroll depth (never decreases)
      const currentDepth = Math.min(1, (el.scrollTop + el.clientHeight) / Math.max(1, el.scrollHeight));
      const depth = Math.max(maxHtmlDepthRef.current, currentDepth);
      maxHtmlDepthRef.current = depth;
      // Use true elapsed time since last beat to avoid inflation
      const now = Date.now();
      const elapsedSec = Math.max(0, Math.floor((now - lastHtmlBeatAtRef.current) / 1000));
      if (elapsedSec <= 0) return;
      lastHtmlBeatAtRef.current = now;
      try {
        await api.post(`/api/learning/progress/materials/${mat.id}/heartbeat`, {
          kind: 'HTML',
          deltaSec: Math.min(elapsedSec, heartbeatSec),
          scrollDepth: depth
        });
      } catch {}
    }, heartbeatMs);
    return () => {
      try { io.disconnect(); } catch {}
      if (htmlTimerRef.current) clearInterval(htmlTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htmls.length, inlineAttemptId, heartbeatMs, heartbeatSec]);

  // Heartbeat for VIDEO (mp4 element only)
  const videoRef = useRef(null);
  const videoTimerRef = useRef(null);
  const lastVideoPosRef = useRef(0);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || inlineAttemptId) return;
    const mat = video;
    if (!mat) return;
    const tick = async () => {
      if (v.paused || v.seeking || v.readyState < 2) return;
      // Only count actual playback progress; seeking backwards does not add time
      const pos = Math.floor(v.currentTime);
      const dur = Math.max(1, Math.floor(v.duration || 0));
      const deltaPos = Math.max(0, pos - (lastVideoPosRef.current || 0));
      lastVideoPosRef.current = pos;
      try {
        await api.post(`/api/learning/progress/materials/${mat.id}/heartbeat`, {
          kind: 'VIDEO',
          deltaSec: deltaPos, // actual played seconds since last beat
          positionSec: pos,
          durationSec: dur
        });
      } catch {}
    };
    videoTimerRef.current = setInterval(tick, heartbeatMs);
    const onPause = () => tick();
    const onTime = () => tick();
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTime);
    return () => {
      if (videoTimerRef.current) clearInterval(videoTimerRef.current);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTime);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id, inlineAttemptId, heartbeatMs, heartbeatSec]);

  return (
    <Layout style={{ height: 'calc(100vh - 120px)' }}>
      <Layout.Sider width={siderWidth} style={{ background: '#ffffff', color: '#102540', borderRight: '2px solid #102540', overflow: 'hidden', height: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', padding: 12 }}>
        <Space align="center" style={{ justifyContent: 'space-between', width: '100%', marginBottom: 14, flexShrink: 0 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => {
              const params = new URLSearchParams(location.search);
              const back = params.get('back');
              if (back) {
                try {
                  navigate(decodeURIComponent(back));
                  return;
                } catch {}
              }
              // Default back depending on path context
              if (location.pathname.startsWith('/student')) {
                navigate('/student');
              } else {
                navigate(`/admin/courses/${id}?tab=topics`);
              }
            }}
          >
            Back
          </Button>
          <Typography.Title level={5} style={{ color: '#102540', margin: 0 }}>
            {course ? `${course.name}` : 'Course'}
          </Typography.Title>
          <Tooltip title={siderWidth > 260 ? 'Minimize sidebar' : 'Expand sidebar'}>
            <Button
              type="text"
              icon={siderWidth > 260 ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
              onClick={() => setSiderWidth(w => (w > 260 ? 240 : 320))}
            />
          </Tooltip>
        </Space>
        <Space align="center" style={{ margin: '8px 0 12px 0', flexShrink: 0 }}>
          <ReadOutlined style={{ color: '#102540' }} />
          <Typography.Text strong style={{ color: '#102540' }}>Course Modules</Typography.Text>
        </Space>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', marginBottom: 8, contain: 'strict' }}>
        {modules.length > 0 ? (
        <Collapse
          defaultActiveKey={[...modules.map(m => m.id), ...(standaloneTopics.length > 0 ? ['_standalone'] : [])]}
          expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} style={{ color: '#102540' }} />}
          expandIconPosition="end"
          ghost
          style={{ background: 'transparent', border: 'none' }}
          items={[
            ...modules.map((mod, modIndex) => ({
              key: mod.id,
              label: (
                <Space direction="vertical" size={0} align="flex-start">
                  <span style={{ color: '#102540', fontWeight: 700, fontSize: 13 }}>Module {modIndex + 1}:</span>
                  <span style={{ color: '#4b5563', fontWeight: 500, fontSize: 12 }}>{mod.name}</span>
                </Space>
              ),
              children: (
                <List
                  size="small"
                  dataSource={mod.topics || []}
                  style={{ paddingLeft: 8, border: 'none' }}
                  renderItem={(t) => {
                    const itemCount = (materialsByTopic[t.id] || []).length;
                    return (
                      <List.Item
                        style={{
                          background: (t.id === currentTopicId) ? 'rgba(16,37,64,0.08)' : 'transparent',
                          borderRadius: 6,
                          cursor: 'pointer',
                          padding: '8px 10px',
                          marginBottom: 4,
                          border: '1px solid rgba(16,37,64,0.06)'
                        }}
                        onClick={async () => {
                          userClickedTopicIdRef.current = t.id;
                          setCurrentTopicId(t.id);
                          await loadMaterialsFor(t.id);
                          await loadQuizFor(t.id);
                          try {
                            const { data } = await api.get(`/api/learning/topics/${t.id}/progress`);
                            setProgressByTopic(prev => ({ ...prev, [t.id]: data?.percent ?? 0 }));
                            if (typeof data?.remainingSeconds === 'number') {
                              setRemainingByTopic(prev => ({ ...prev, [t.id]: Math.max(0, Math.ceil(data.remainingSeconds / 60)) }));
                            } else {
                              const estMin = etaByTopic[t.id] ?? 0;
                              const perc = data?.percent ?? 0;
                              const remain = Math.max(0, Math.ceil(estMin * (1 - perc / 100)));
                              setRemainingByTopic(prev => ({ ...prev, [t.id]: remain }));
                            }
                            if (typeof data?.estimatedSeconds === 'number') {
                              setEtaByTopic(prev => ({ ...prev, [t.id]: Math.max(1, Math.ceil(data.estimatedSeconds / 60)) }));
                            }
                            if (typeof data?.timeSpentSec === 'number') {
                              setTimeSpentByTopic(prev => ({ ...prev, [t.id]: data.timeSpentSec }));
                            }
                          } catch {}
                        }}
                      >
                        <List.Item.Meta
                          avatar={<Avatar size="small" style={{ background: '#e5e7eb', color: '#4b5563' }}>{((mod.topics || []).indexOf(t) + 1)}</Avatar>}
                          title={
                            <Space align="center" size={4}>
                              <span style={{ color: '#102540', fontSize: 13 }}>{t.name}</span>
                              {(progressByTopic[t.id] ?? 0) >= 100 && (
                                <CheckCircleFilled style={{ color: '#52c41a', fontSize: 14 }} />
                              )}
                            </Space>
                          }
                          description={
                            <Space direction="vertical" size={0}>
                              <Space size={8} wrap>
                                <span style={{ color: '#6b7280', fontSize: 12 }}>
                                  <FieldTimeOutlined style={{ marginRight: 2 }} />
                                  {etaByTopic[t.id] ?? 0} min
                                </span>
                                {itemCount > 0 && (
                                  <span style={{ color: '#6b7280', fontSize: 12 }}>
                                    {itemCount} item{itemCount !== 1 ? 's' : ''}/pages
                                  </span>
                                )}
                              </Space>
                                  <Progress
                                    percent={progressByTopic[t.id] ?? 0}
                                    size="small"
                                    status="active"
                                    style={{ marginTop: 2 }}
                                    format={(p) => `${Math.round(p ?? 0)}%`}
                                  />
                            </Space>
                          }
                        />
                      </List.Item>
                    );
                  }}
                />
              )
            })),
            ...(standaloneTopics.length > 0
              ? [{
                  key: '_standalone',
                  label: <span style={{ color: '#102540', fontWeight: 600 }}>Other topics</span>,
                  children: (
                    <List
                      size="small"
                      dataSource={standaloneTopics}
                      style={{ paddingLeft: 8, border: 'none' }}
                      renderItem={(t) => {
                        const itemCount = (materialsByTopic[t.id] || []).length;
                        return (
                          <List.Item
                            style={{
                              background: (t.id === currentTopicId) ? 'rgba(16,37,64,0.08)' : 'transparent',
                              borderRadius: 6,
                              cursor: 'pointer',
                              padding: '8px 10px',
                              marginBottom: 4,
                              border: '1px solid rgba(16,37,64,0.06)'
                            }}
                            onClick={async () => {
                              userClickedTopicIdRef.current = t.id;
                              setCurrentTopicId(t.id);
                              await loadMaterialsFor(t.id);
                              await loadQuizFor(t.id);
                              try {
                                const { data } = await api.get(`/api/learning/topics/${t.id}/progress`);
                                setProgressByTopic(prev => ({ ...prev, [t.id]: data?.percent ?? 0 }));
                                if (typeof data?.remainingSeconds === 'number') {
                                  setRemainingByTopic(prev => ({ ...prev, [t.id]: Math.max(0, Math.ceil(data.remainingSeconds / 60)) }));
                                } else {
                                  const estMin = etaByTopic[t.id] ?? 0;
                                  const perc = data?.percent ?? 0;
                                  const remain = Math.max(0, Math.ceil(estMin * (1 - perc / 100)));
                                  setRemainingByTopic(prev => ({ ...prev, [t.id]: remain }));
                                }
                                if (typeof data?.estimatedSeconds === 'number') {
                                  setEtaByTopic(prev => ({ ...prev, [t.id]: Math.max(1, Math.ceil(data.estimatedSeconds / 60)) }));
                                }
                                if (typeof data?.timeSpentSec === 'number') {
                                  setTimeSpentByTopic(prev => ({ ...prev, [t.id]: data.timeSpentSec }));
                                }
                              } catch {}
                            }}
                          >
                            <List.Item.Meta
                              avatar={<Avatar size="small" style={{ background: '#e5e7eb', color: '#4b5563' }} icon={<BookOutlined />} />}
                              title={
                                <Space align="center" size={4}>
                                  <span style={{ color: '#102540', fontSize: 13 }}>{t.name}</span>
                                  {(progressByTopic[t.id] ?? 0) >= 100 && (
                                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 14 }} />
                                  )}
                                </Space>
                              }
                              description={
                                <Space size={8}>
                                  <span style={{ color: '#6b7280', fontSize: 12 }}>
                                    <FieldTimeOutlined style={{ marginRight: 2 }} />
                                    {etaByTopic[t.id] ?? 0} min
                                  </span>
                                  {itemCount > 0 && (
                                    <span style={{ color: '#6b7280', fontSize: 12 }}>
                                      {itemCount} item{itemCount !== 1 ? 's' : ''}/pages
                                    </span>
                                  )}
                                </Space>
                              }
                            />
                          </List.Item>
                        );
                      }}
                    />
                  )
                }]
              : [])
          ]}
        />
        ) : (
        <List
          dataSource={topics}
          renderItem={(t) => (
            <List.Item
              style={{
                background: (t.id === currentTopicId) ? 'rgba(16,37,64,0.06)' : 'transparent',
                borderRadius: 6,
                cursor: 'pointer',
                padding: '10px 12px',
                marginBottom: 6,
                border: '1px solid rgba(16,37,64,0.08)'
              }}
              onClick={async () => {
                userClickedTopicIdRef.current = t.id;
                setCurrentTopicId(t.id);
                await loadMaterialsFor(t.id);
                await loadQuizFor(t.id);
                try {
                  const { data } = await api.get(`/api/learning/topics/${t.id}/progress`);
                  setProgressByTopic(prev => ({ ...prev, [t.id]: data?.percent ?? 0 }));
                  if (typeof data?.remainingSeconds === 'number') {
                    setRemainingByTopic(prev => ({ ...prev, [t.id]: Math.max(0, Math.ceil(data.remainingSeconds / 60)) }));
                  } else {
                    const estMin = etaByTopic[t.id] ?? 0;
                    const perc = data?.percent ?? 0;
                    const remain = Math.max(0, Math.ceil(estMin * (1 - perc / 100)));
                    setRemainingByTopic(prev => ({ ...prev, [t.id]: remain }));
                  }
                } catch {}
              }}
            >
              <List.Item.Meta
                avatar={<Avatar style={{ background: '#102540' }} icon={<BookOutlined />} />}
                title={
                  <Space align="center">
                    <span style={{ color: '#102540', fontWeight: 700 }}>{`Module ${t.moduleNumber ?? '-'} · ${t.name}`}</span>
                    {(progressByTopic[t.id] ?? 0) >= 100 && (
                      <CheckCircleFilled style={{ color: '#52c41a' }} />
                    )}
                  </Space>
                }
                description={
                  <Space direction="vertical" size={2}>
                    <Space size={10} wrap>
                      <span style={{ color: '#4b5563', display: 'inline-flex', alignItems: 'center' }}>
                        <FieldTimeOutlined style={{ marginRight: 4 }} />
                        {etaByTopic[t.id] ?? 0} min
                      </span>
                      <span style={{ color: '#4b5563', display: 'inline-flex', alignItems: 'center' }}>
                        <HistoryOutlined style={{ marginRight: 4 }} />
                        {remainingByTopic[t.id] ?? Math.max(0, Math.ceil((etaByTopic[t.id] ?? 0) * (1 - (progressByTopic[t.id] ?? 0) / 100)))} min
                      </span>
                      <span style={{ color: '#4b5563', display: 'inline-flex', alignItems: 'center' }}>
                        <HistoryOutlined style={{ marginRight: 4 }} />
                        Spent {Math.max(0, Math.round((timeSpentByTopic[t.id] ?? 0) / 60))} min
                      </span>
                    </Space>
                    <Progress
                      percent={progressByTopic[t.id] ?? 0}
                      size="small"
                      status="active"
                      format={(p) => `${Math.round(p ?? 0)}%`}
                    />
                  </Space>
                }
              />
            </List.Item>
          )}
        />
        )}
        </div>
        <div style={{ flexShrink: 0, paddingTop: 8, borderTop: '1px solid rgba(16,37,64,0.1)' }}>
          <Typography.Text strong style={{ color: '#102540' }}>Overall Progress</Typography.Text>
          <Progress
            percent={Math.round(averageProgress(progressByTopic))}
            style={{ marginTop: 4 }}
            format={(p) => `${Math.round(p ?? 0)}%`}
          />
        </div>
        <div style={{ flexShrink: 0, marginTop: 12 }}>
          {isStudentPath ? (
            courseExamAttemptId ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Tag color="green">Complete</Tag>
                <Button
                  block
                  type="primary"
                  icon={<TrophyOutlined />}
                  onClick={() => navigate(`/student/exams/result/${courseExamAttemptId}`)}
                >
                  View results
                </Button>
              </Space>
            ) : (
              <Tooltip title={!courseExam && !courseExamLoading ? 'No exam available at this time. Check start and end dates.' : courseExam ? undefined : 'Loading...'}>
                <Button
                  block
                  type="primary"
                  loading={courseExamLoading || startCourseExamLoading}
                  disabled={!courseExam}
                  onClick={startCourseExam}
                >
                  Take Overall Exam
                </Button>
              </Tooltip>
            )
          ) : (
            <Button
              block
              type="primary"
              onClick={() => {
                const back = encodeURIComponent(`/admin/courses/${id}/preview`);
                navigate(`/admin/exams/builder?mode=course&courseId=${id}&back=${back}`);
              }}
            >
              Take Overall Exam
            </Button>
          )}
        </div>
        </div>
      </Layout.Sider>
      <Layout.Content style={{ padding: 16, overflow: 'auto' }} onScroll={onContentScroll}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {currentTopic ? currentTopic.name : 'Topic'}
            </Typography.Title>
            <Space>
              {!inlineAttemptId ? (
                submittedAttemptByExamId[currentQuiz?.id] ? (
                  <Button
                    type="primary"
                    icon={<TrophyOutlined />}
                    onClick={() => openResultModal(submittedAttemptByExamId[currentQuiz?.id])}
                  >
                    View results
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    icon={<ReadOutlined />}
                    onClick={startQuiz}
                    disabled={!currentQuiz}
                  >
                    Take Quiz
                  </Button>
                )
              ) : (
                <Button onClick={() => setInlineAttemptId(null)}>
                  Back to Content
                </Button>
              )}
            </Space>
          </Space>
          {isMobile && currentTopic && (
            <Card size="small">
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Typography.Text>
                  Estimated: {etaByTopic[currentTopic.id] ?? 0} min
                </Typography.Text>
                <Typography.Text>
                  Remaining: {remainingByTopic[currentTopic.id] ?? Math.max(0, Math.ceil((etaByTopic[currentTopic.id] ?? 0) * (1 - (progressByTopic[currentTopic.id] ?? 0) / 100)))} min
                </Typography.Text>
                <Typography.Text>
                  Spent: {Math.max(0, Math.round((timeSpentByTopic[currentTopic.id] ?? 0) / 60))} min
                </Typography.Text>
              </Space>
              <div style={{ marginTop: 8 }}>
                <Progress
                  percent={progressByTopic[currentTopic.id] ?? 0}
                  format={(p) => `${Math.round(p ?? 0)}%`}
                />
              </div>
            </Card>
          )}
          <div style={{ maxWidth: narrow ? 900 : '100%', margin: '0 auto', width: '100%' }}>
          {!inlineAttemptId && video && (
            <Card size="small" bodyStyle={{ padding: 0, overflow: 'hidden' }}>
              {toYouTubeEmbed(video.url)
                ? (
                  <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                    <iframe
                      src={toYouTubeEmbed(video.url)}
                      title="Video"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                    />
                  </div>
                )
                : <video ref={videoRef} src={asUrl(video.url)} controls style={{ width: '100%' }} />}
            </Card>
          )}
          {!inlineAttemptId && htmls.map((h, idx) => (
            <Card key={h.id} size="small" title={h.title || 'Content'}>
              <div ref={idx === 0 ? htmlRef : null} style={{ maxHeight: 480, overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: h.contentHtml }} />
            </Card>
          ))}
          {!inlineAttemptId && docs.length > 0 && (
            <Card size="small" title="Attachments">
              <List
                dataSource={docs}
                renderItem={(d) => (
                  <List.Item>
                    <Space>
                      <Button
                        type="primary"
                        ghost
                        shape="round"
                        style={{ borderWidth: 2 }}
                        icon={
                          d.kind === 'PDF' ? <FilePdfOutlined /> :
                          d.kind === 'IMAGE' ? <FileImageOutlined /> :
                          <LinkOutlined />
                        }
                        onClick={() => window.open(asUrl(d.url), '_blank', 'noopener')}
                      >
                        {d.title || d.url}
                      </Button>
                      <Tag style={{ marginLeft: 8 }}>{d.kind}</Tag>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          )}
          {inlineAttemptId && (
            <Card size="small" title="Quiz" extra={<Button type="primary" loading={inlineSubmitting} onClick={submitInline}>Submit</Button>}>
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {inlineQuestions.length === 0 && (
                  <Typography.Text type="secondary">Loading questions...</Typography.Text>
                )}
                {inlineQuestions.map((q, idx) => (
                  <div key={q.id}>
                    <Typography.Text strong>{`Q${idx + 1}. ${q.stem}`}</Typography.Text>
                    {q.options?.length ? (
                      <Radio.Group onChange={(e) => onSelectOption(q.id, e.target.value)} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        {q.options.map(o => (
                          <Radio key={o.id} value={o.id}>{o.text}</Radio>
                        ))}
                      </Radio.Group>
                    ) : (
                      <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>Constructed Response not supported inline here.</Typography.Paragraph>
                    )}
                    <Divider />
                  </div>
                ))}
              </Space>
            </Card>
          )}
          </div>
        </Space>
      </Layout.Content>

      <Modal
        title={null}
        open={resultModalOpen}
        onCancel={closeResultModal}
        footer={null}
        width={420}
        centered
        destroyOnClose
        styles={{ body: { padding: '24px 24px 16px' } }}
      >
        <Space direction="vertical" size={20} style={{ width: '100%', textAlign: 'center' }}>
          <div style={{ padding: '16px 0' }}>
            <TrophyOutlined style={{ fontSize: 48, color: '#faad14' }} />
            <Typography.Title level={3} style={{ margin: '12px 0 4px' }}>
              Quiz complete
            </Typography.Title>
            <Typography.Text type="secondary">Your score</Typography.Text>
            <Typography.Title level={1} style={{ margin: '8px 0', color: '#102540' }}>
              {resultAttempt != null ? `${Math.round(resultAttempt.scorePercent ?? 0)}%` : '—'}
            </Typography.Title>
            {(resultAttempt?.scorePercent ?? 0) >= 70 ? (
              <Space style={{ color: '#52c41a' }}>
                <CheckCircleOutlined /> Passed
              </Space>
            ) : (resultAttempt?.scorePercent ?? 0) > 0 ? (
              <Space style={{ color: '#ff4d4f' }}>
                <CloseCircleOutlined /> Below passing (70%)
              </Space>
            ) : null}
          </div>
          <Space style={{ width: '100%', justifyContent: 'center' }} size="middle">
            <Button type="primary" size="large" onClick={openAnswersDrawer}>
              View correct answers
            </Button>
            <Button size="large" onClick={closeResultModal}>
              Close
            </Button>
          </Space>
        </Space>
      </Modal>

      <Drawer
        title="Correct answers"
        placement="right"
        width={Math.min(480, typeof window !== 'undefined' ? window.innerWidth * 0.9 : 480)}
        open={answersDrawerOpen}
        onClose={() => { setAnswersDrawerOpen(false); setAnswersDrawerAttempt(null); }}
        destroyOnClose
      >
        {answersDrawerLoading ? (
          <Typography.Text type="secondary">Loading...</Typography.Text>
        ) : !answersDrawerAttempt ? (
          <Typography.Text type="secondary">No data.</Typography.Text>
        ) : (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            {(() => {
              const answers = answersDrawerAttempt.answers || [];
              const total = answers.length || 1;
              const correctCount = answers.filter(a => a.isCorrect === true).length;
              const scorePct = Math.round(answersDrawerAttempt.scorePercent ?? (correctCount / total) * 100);
              const passed = scorePct >= 70;
              return (
                <div
                  style={{
                    background: passed
                      ? 'linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)'
                      : 'linear-gradient(135deg, #fff2f0 0%, #ffccc7 100%)',
                    borderRadius: 12,
                    padding: 20,
                    border: `1px solid ${passed ? '#b7eb8f' : '#ffa39e'}`,
                    marginBottom: 8
                  }}
                >
                  <Space direction="vertical" size={12} style={{ width: '100%', alignItems: 'center', textAlign: 'center' }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                      Quiz result
                    </Typography.Text>
                    <Typography.Title level={2} style={{ margin: 0, color: passed ? '#389e0d' : '#cf1322', fontWeight: 700 }}>
                      {scorePct}%
                    </Typography.Title>
                    <Tag color={passed ? 'success' : 'error'} style={{ margin: 0, fontWeight: 600 }}>
                      {passed ? 'Passed' : 'Below passing (70%)'}
                    </Tag>
                    <Typography.Text style={{ color: '#595959', fontSize: 14 }}>
                      {correctCount} of {total} correct
                    </Typography.Text>
                  </Space>
                </div>
              );
            })()}
            {(() => {
              const answers = answersDrawerAttempt.answers || [];
              const failedCount = answers.filter(a => a.isCorrect !== true).length;
              if (failedCount === 0) return null;
              return (
                <Button
                  type="primary"
                  block
                  size="large"
                  style={{ marginBottom: 8 }}
                  onClick={() => {
                    // TODO: plug AI assistant here – e.g. open a panel/modal with failed questions for AI help
                    message.info('AI assistant coming soon – get help on failed questions here.');
                  }}
                >
                  Get help from AI on failed questions ({failedCount})
                </Button>
              );
            })()}
            <Typography.Text type="secondary" style={{ display: 'block' }}>
              Review each question with the correct answer and your answer.
            </Typography.Text>
            {(answersDrawerAttempt.answers || []).length === 0 ? (
              <Typography.Text type="secondary">No answers to review.</Typography.Text>
            ) : (
              (answersDrawerAttempt.answers || []).map((a, idx) => {
                const correct = a.isCorrect === true;
                const correctOpt = (a?.question?.options || []).find(o => o.isCorrect);
                const correctText = correctOpt?.text ?? '—';
                const yourText = a?.selectedOption?.text ?? '—';
                return (
                  <div key={a.id || idx} style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <Typography.Text strong>Question {idx + 1}</Typography.Text>
                    <Typography.Paragraph style={{ margin: '8px 0 4px' }}>{a?.question?.stem}</Typography.Paragraph>
                    <Space direction="vertical" size={4}>
                      <Space>
                        {correct ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
                        <Typography.Text type="secondary">Your answer:</Typography.Text>
                        <Typography.Text>{yourText}</Typography.Text>
                      </Space>
                      {!correct && (
                        <Space style={{ marginLeft: 24 }}>
                          <Typography.Text type="secondary">Correct answer:</Typography.Text>
                          <Typography.Text style={{ color: '#52c41a' }}>{correctText}</Typography.Text>
                        </Space>
                      )}
                    </Space>
                  </div>
                );
              })
            )}
          </Space>
        )}
      </Drawer>
    </Layout>
  );
}

function toYouTubeEmbed(url) {
  try {
    if (!url) return null;
    const u = new URL(url, window.location.origin);
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      return v ? `https://www.youtube.com/embed/${v}` : null;
    }
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

function estimateMinutes(materials) {
  // Prefer server-provided estimates
  const hasEst = materials.some(m => typeof m.estimatedSeconds === 'number' && m.estimatedSeconds > 0);
  if (hasEst) {
    const total = materials.reduce((acc, m) => acc + (m.estimatedSeconds || 0), 0);
    return Math.max(1, Math.ceil(total / 60));
  }
  // Fallback heuristic
  let chars = 0;
  let videos = 0;
  for (const m of materials) {
    if (m.kind === 'HTML' && m.contentHtml) {
      chars += m.contentHtml.replace(/<[^>]+>/g, '').length;
    }
    if (m.kind === 'VIDEO') videos += 1;
  }
  const readMin = Math.ceil(chars / 900);
  const videoMin = videos * 5;
  return Math.max(1, readMin + videoMin);
}

function averageProgress(map) {
  const vals = Object.values(map || {});
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

