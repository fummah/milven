import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, BookOpen, FileText, GraduationCap, Layers, Tag, Clock, BookMarked } from 'lucide-react';
import { api } from '../../lib/api';
import StudentPdfViewer from '../../components/StudentPdfViewer.jsx';

const StudentLearning = () => {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [volumes, setVolumes] = useState([]);
  const [selectedVolume, setSelectedVolume] = useState(null);
  const [modules, setModules] = useState([]);
  const [topics, setTopics] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [expandedModules, setExpandedModules] = useState(new Set());
  const [expandedTopics, setExpandedTopics] = useState(new Set());
  const [progress, setProgress] = useState({});
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfViewerTarget, setPdfViewerTarget] = useState(null);
  const [curriculumDoc, setCurriculumDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);

  useEffect(() => {
    fetchCourses();
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      fetchVolumes();
      fetchProgress();
      setSelectedVolume(null);
      setModules([]);
      setTopics([]);
      setConcepts([]);
      setMappings([]);
      setCurriculumDoc(null);
    }
  }, [selectedCourse]);

  useEffect(() => {
    if (selectedVolume && selectedCourse) {
      fetchHierarchyAndMappings();
    }
  }, [selectedVolume, selectedCourse]);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/learning/me/courses');
      const data = response.data?.courses || [];
      setCourses(data);
      if (data.length > 0) {
        setSelectedCourse(data[0].courseId);
      }
    } catch (error) {
      console.error('Failed to fetch courses:', error);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchVolumes = async () => {
    try {
      const response = await api.get('/api/learning/volumes/public', {
        params: { courseId: selectedCourse }
      });
      setVolumes(response.data?.volumes || []);
    } catch (error) {
      console.error('Failed to fetch volumes:', error);
      setVolumes([]);
    }
  };

  const fetchProgress = async () => {
    try {
      const response = await api.get(`/api/learning/courses/${selectedCourse}/progress`);
      setProgress(response.data || {});
    } catch (error) {
      console.error('Failed to fetch progress:', error);
      setProgress({});
    }
  };

  const fetchHierarchyAndMappings = async () => {
    setHierarchyLoading(true);
    try {
      const [modulesRes, topicsRes, conceptsRes, docRes] = await Promise.allSettled([
        api.get('/api/learning/modules/public', {
          params: { courseId: selectedCourse, volumeId: selectedVolume }
        }),
        api.get('/api/learning/topics/public', {
          params: { courseId: selectedCourse }
        }),
        api.get('/api/learning/concepts/public', {
          params: { courseId: selectedCourse }
        }),
        api.get(`/api/pdf-mapping/volume/${selectedVolume}/document`, {
          params: { courseId: selectedCourse }
        })
      ]);

      const mods = modulesRes.status === 'fulfilled' ? (modulesRes.value.data?.modules || []) : [];
      const allTopics = topicsRes.status === 'fulfilled' ? (topicsRes.value.data?.topics || []) : [];
      const allConcepts = conceptsRes.status === 'fulfilled' ? (conceptsRes.value.data?.concepts || []) : [];

      // Filter to this volume's modules
      const volumeModuleIds = new Set(mods.map(m => m.id));
      const volumeTopics = allTopics.filter(t => volumeModuleIds.has(t.moduleId));
      const volumeTopicIds = new Set(volumeTopics.map(t => t.id));
      const volumeConcepts = allConcepts.filter(c => volumeTopicIds.has(c.topicId));

      setModules(mods);
      setTopics(volumeTopics);
      setConcepts(volumeConcepts);

      // Handle document + mappings
      if (docRes.status === 'fulfilled') {
        const doc = docRes.value.data;
        setCurriculumDoc(doc);
        setMappings(doc.mappings || []);
      } else {
        setCurriculumDoc(null);
        setMappings([]);
      }

      // Auto-expand first module
      if (mods.length > 0) {
        setExpandedModules(new Set([mods[0].id]));
      }
    } catch (error) {
      console.error('Failed to fetch hierarchy:', error);
    } finally {
      setHierarchyLoading(false);
    }
  };

  const getMappingForTarget = (type, id) => {
    return mappings.find(m => m.targetType === type && m.targetId === id);
  };

  const toggleModule = (moduleId) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId);
      return next;
    });
  };

  const toggleTopic = (topicId) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      next.has(topicId) ? next.delete(topicId) : next.add(topicId);
      return next;
    });
  };

  const openPdfViewer = (target) => {
    if (!curriculumDoc?.fileExists) return;
    setPdfViewerTarget(target);
    setShowPdfViewer(true);
  };

  const getTopicsForModule = (moduleId) => topics.filter(t => t.moduleId === moduleId);
  const getConceptsForTopic = (topicId) => concepts.filter(c => c.topicId === topicId);

  const selectedCourseData = courses.find(c => c.courseId === selectedCourse);
  const selectedVolumeData = volumes.find(v => v.id === selectedVolume);
  const hasCurriculum = curriculumDoc?.fileExists;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6 flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading your courses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <GraduationCap size={32} className="text-blue-600" />
          Learning Center
        </h1>
        <p className="text-gray-500 mt-1">Navigate your curriculum, explore modules, topics, and concepts</p>
      </div>

      {courses.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <BookOpen size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Courses Yet</h3>
          <p className="text-gray-500">You haven't subscribed to any courses. Browse available courses to get started.</p>
        </div>
      ) : (
        <>
          {/* Course & Volume Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1.5">Course</label>
              <select
                value={selectedCourse || ''}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
              >
                {courses.map(course => (
                  <option key={course.courseId} value={course.courseId}>
                    {course.name} {course.level ? `(${course.level.replace('LEVEL', 'Level ')})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1.5">Volume</label>
              <select
                value={selectedVolume || ''}
                onChange={(e) => setSelectedVolume(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                disabled={!selectedCourse || volumes.length === 0}
              >
                <option value="">Select a volume...</option>
                {volumes.map(volume => (
                  <option key={volume.id} value={volume.id}>{volume.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Progress Bar */}
          {selectedCourseData && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 mb-6 border border-blue-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-blue-600" />
                  <span className="font-semibold text-gray-800">Course Progress</span>
                </div>
                <span className="text-xl font-bold text-blue-700">{progress.percent || selectedCourseData.progressPercent || 0}%</span>
              </div>
              <div className="w-full bg-white rounded-full h-2.5 shadow-inner">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${progress.percent || selectedCourseData.progressPercent || 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Volume Content */}
          {selectedVolume && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Volume Header */}
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Layers size={22} className="text-indigo-600" />
                  <h2 className="text-lg font-bold text-gray-900">{selectedVolumeData?.name || 'Volume'}</h2>
                </div>
                {hasCurriculum && (
                  <button
                    onClick={() => openPdfViewer(null)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium shadow-sm"
                  >
                    <FileText size={16} />
                    Open Curriculum PDF
                  </button>
                )}
              </div>

              {hierarchyLoading ? (
                <div className="p-12 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                  <p className="text-gray-500 text-sm">Loading curriculum structure...</p>
                </div>
              ) : modules.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <BookOpen size={40} className="mx-auto mb-3 opacity-50" />
                  <p>No modules found for this volume</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {modules.map(module => {
                    const moduleTopics = getTopicsForModule(module.id);
                    const isExpanded = expandedModules.has(module.id);
                    const moduleMapping = getMappingForTarget('MODULE', module.id);

                    return (
                      <div key={module.id}>
                        {/* Module Row */}
                        <div
                          className="flex items-center gap-3 px-6 py-4 cursor-pointer hover:bg-blue-50/50 transition-colors"
                          onClick={() => toggleModule(module.id)}
                        >
                          {isExpanded ? (
                            <ChevronDown size={18} className="text-blue-600 flex-shrink-0" />
                          ) : (
                            <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
                          )}
                          <BookMarked size={18} className="text-blue-600 flex-shrink-0" />
                          <span className="font-semibold text-gray-900 flex-1">{module.name}</span>
                          <div className="flex items-center gap-2">
                            {moduleMapping && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                p.{moduleMapping.pageNumber}
                              </span>
                            )}
                            <span className="text-xs text-gray-400">{moduleTopics.length} topics</span>
                            {hasCurriculum && moduleMapping && (
                              <button
                                onClick={(e) => { e.stopPropagation(); openPdfViewer({ type: 'MODULE', id: module.id, name: module.name }); }}
                                className="ml-1 p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                title="View in curriculum"
                              >
                                <FileText size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Topics under Module */}
                        {isExpanded && moduleTopics.length > 0 && (
                          <div className="bg-gray-50/50">
                            {moduleTopics.map(topic => {
                              const topicConcepts = getConceptsForTopic(topic.id);
                              const isTopicExpanded = expandedTopics.has(topic.id);
                              const topicMapping = getMappingForTarget('TOPIC', topic.id);

                              return (
                                <div key={topic.id}>
                                  {/* Topic Row */}
                                  <div
                                    className="flex items-center gap-3 pl-14 pr-6 py-3 cursor-pointer hover:bg-indigo-50/50 transition-colors"
                                    onClick={() => toggleTopic(topic.id)}
                                  >
                                    {topicConcepts.length > 0 ? (
                                      isTopicExpanded ? (
                                        <ChevronDown size={15} className="text-indigo-500 flex-shrink-0" />
                                      ) : (
                                        <ChevronRight size={15} className="text-gray-400 flex-shrink-0" />
                                      )
                                    ) : (
                                      <span className="w-[15px] flex-shrink-0" />
                                    )}
                                    <Tag size={14} className="text-green-600 flex-shrink-0" />
                                    <span className="text-sm font-medium text-gray-800 flex-1">{topic.name}</span>
                                    <div className="flex items-center gap-2">
                                      {topicMapping && (
                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                          p.{topicMapping.pageNumber}
                                        </span>
                                      )}
                                      {topicConcepts.length > 0 && (
                                        <span className="text-xs text-gray-400">{topicConcepts.length} concepts</span>
                                      )}
                                      {hasCurriculum && topicMapping && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); openPdfViewer({ type: 'TOPIC', id: topic.id, name: topic.name }); }}
                                          className="p-1 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                                          title="View in curriculum"
                                        >
                                          <FileText size={13} />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Concepts under Topic */}
                                  {isTopicExpanded && topicConcepts.length > 0 && (
                                    <div className="bg-white/60">
                                      {topicConcepts.map(concept => {
                                        const conceptMapping = getMappingForTarget('CONCEPT', concept.id);
                                        return (
                                          <div
                                            key={concept.id}
                                            className="flex items-center gap-3 pl-24 pr-6 py-2.5 hover:bg-purple-50/50 transition-colors cursor-pointer"
                                            onClick={() => hasCurriculum && conceptMapping && openPdfViewer({ type: 'CONCEPT', id: concept.id, name: concept.name })}
                                          >
                                            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full flex-shrink-0" />
                                            <span className="text-sm text-gray-700 flex-1">{concept.name}</span>
                                            <div className="flex items-center gap-2">
                                              {conceptMapping && (
                                                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                                                  p.{conceptMapping.pageNumber}
                                                </span>
                                              )}
                                              {hasCurriculum && conceptMapping && (
                                                <button
                                                  onClick={(e) => { e.stopPropagation(); openPdfViewer({ type: 'CONCEPT', id: concept.id, name: concept.name }); }}
                                                  className="p-1 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors"
                                                  title="View in curriculum"
                                                >
                                                  <FileText size={12} />
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* PDF Viewer Modal */}
      {showPdfViewer && selectedVolume && (
        <StudentPdfViewer
          volumeId={selectedVolume}
          courseId={selectedCourse}
          initialTarget={pdfViewerTarget}
          onClose={() => {
            setShowPdfViewer(false);
            setPdfViewerTarget(null);
          }}
          showNavigation={true}
        />
      )}
    </div>
  );
};

export default StudentLearning;
