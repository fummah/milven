import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, ChevronLeft, BookOpen, FileText, GraduationCap, Layers, Tag, Clock, BookMarked, ZoomIn, ZoomOut, X, Menu } from 'lucide-react';
import { api } from '../../lib/api';

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
  const [curriculumDoc, setCurriculumDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTarget, setActiveTarget] = useState(null);
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);

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
      setPdfUrl(null);
      setActiveTarget(null);
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

      const volumeModuleIds = new Set(mods.map(m => m.id));
      const volumeTopics = allTopics.filter(t => volumeModuleIds.has(t.moduleId));
      const volumeTopicIds = new Set(volumeTopics.map(t => t.id));
      const volumeConcepts = allConcepts.filter(c => volumeTopicIds.has(c.topicId));

      setModules(mods);
      setTopics(volumeTopics);
      setConcepts(volumeConcepts);

      if (docRes.status === 'fulfilled') {
        const doc = docRes.value.data;
        setCurriculumDoc(doc);
        setMappings(doc.mappings || []);
        if (doc.fileExists) {
          setPdfUrl(`${api.defaults.baseURL}/uploads/curriculum-pdfs/${doc.filename}`);
        }
      } else {
        setCurriculumDoc(null);
        setMappings([]);
        setPdfUrl(null);
      }

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

  const navigateToTarget = (type, id, name) => {
    const mapping = getMappingForTarget(type, id);
    if (mapping && pdfUrl) {
      setCurrentPage(mapping.pageNumber);
      setActiveTarget({ type, id, name });
      // Close mobile tree after navigation
      setMobileTreeOpen(false);
    }
  };

  const getTopicsForModule = (moduleId) => topics.filter(t => t.moduleId === moduleId);
  const getConceptsForTopic = (topicId) => concepts.filter(c => c.topicId === topicId);

  const selectedCourseData = courses.find(c => c.courseId === selectedCourse);
  const selectedVolumeData = volumes.find(v => v.id === selectedVolume);
  const hasCurriculum = curriculumDoc?.fileExists;

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading your courses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
      {/* Top Bar: Course & Volume Selection */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-3 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <GraduationCap size={20} className="text-blue-600" />
            <span className="font-bold text-gray-900 text-base sm:text-lg hidden sm:inline">Learning Center</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <select
              value={selectedCourse || ''}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="px-2 sm:px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[140px] sm:min-w-[180px]"
            >
              {courses.length === 0 && <option value="">No courses</option>}
              {courses.map(course => (
                <option key={course.courseId} value={course.courseId}>
                  {course.name} {course.level ? `(${course.level.replace('LEVEL', 'Level ')})` : ''}
                </option>
              ))}
            </select>
            <select
              value={selectedVolume || ''}
              onChange={(e) => setSelectedVolume(e.target.value)}
              className="px-2 sm:px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs sm:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[120px] sm:min-w-[160px]"
              disabled={!selectedCourse || volumes.length === 0}
            >
              <option value="">Select volume...</option>
              {volumes.map(volume => (
                <option key={volume.id} value={volume.id}>{volume.name}</option>
              ))}
            </select>
          </div>
          {selectedCourseData && (
            <div className="flex items-center gap-2 ml-auto">
              <div className="w-20 sm:w-32 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${progress.percent || selectedCourseData.progressPercent || 0}%` }}
                />
              </div>
              <span className="text-[10px] sm:text-xs font-semibold text-blue-700">{progress.percent || selectedCourseData.progressPercent || 0}%</span>
            </div>
          )}
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-12">
            <BookOpen size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Courses Yet</h3>
            <p className="text-gray-500">You haven't subscribed to any courses. Browse available courses to get started.</p>
          </div>
        </div>
      ) : !selectedVolume ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-12">
            <Layers size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Select a Volume</h3>
            <p className="text-gray-500">Choose a volume from the dropdown above to explore its curriculum.</p>
          </div>
        </div>
      ) : (
        /* Side-by-side layout with mobile drawer */
        <div className="flex-1 flex overflow-hidden relative">
          {/* Mobile Tree Overlay */}
          {mobileTreeOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-40 sm:hidden"
              onClick={() => setMobileTreeOpen(false)}
            />
          )}

          {/* LEFT: Learning Hierarchy Tree */}
          <div className={`fixed sm:relative z-50 sm:z-auto h-full bg-white flex flex-col overflow-hidden transition-transform duration-300 ease-in-out ${
            mobileTreeOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'
          } w-[85vw] sm:w-[380px] min-w-[320px] max-w-[400px] border-r border-gray-200`}>
            {/* Volume Header */}
            <div className="flex-shrink-0 px-4 py-3 bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Layers size={18} className="text-indigo-600 flex-shrink-0" />
                <span className="font-bold text-gray-900 text-sm truncate">{selectedVolumeData?.name || 'Volume'}</span>
              </div>
              <button
                onClick={() => setMobileTreeOpen(false)}
                className="sm:hidden p-1 rounded hover:bg-gray-200"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>
            {activeTarget && (
              <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100">
                <div className="text-xs text-indigo-600 truncate">
                  Viewing: {activeTarget.name}
                </div>
              </div>
            )}

            {/* Scrollable Tree */}
            <div className="flex-1 overflow-y-auto">
              {hierarchyLoading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-gray-500 text-xs">Loading...</p>
                </div>
              ) : modules.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <BookOpen size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No modules found</p>
                </div>
              ) : (
                <div className="py-1">
                  {modules.map(module => {
                    const moduleTopics = getTopicsForModule(module.id);
                    const isExpanded = expandedModules.has(module.id);
                    const moduleMapping = getMappingForTarget('MODULE', module.id);
                    const isActive = activeTarget?.type === 'MODULE' && activeTarget?.id === module.id;

                    return (
                      <div key={module.id}>
                        <div
                          className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors border-l-3 ${
                            isActive ? 'bg-blue-50 border-l-blue-600' : 'border-l-transparent hover:bg-gray-50'
                          }`}
                          onClick={() => {
                            toggleModule(module.id);
                            if (moduleMapping) navigateToTarget('MODULE', module.id, module.name);
                          }}
                        >
                          {isExpanded ? (
                            <ChevronDown size={14} className="text-blue-600 flex-shrink-0" />
                          ) : (
                            <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
                          )}
                          <BookMarked size={14} className="text-blue-600 flex-shrink-0" />
                          <span className="text-sm font-semibold text-gray-900 flex-1 truncate">{module.name}</span>
                          {moduleMapping && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                              p.{moduleMapping.pageNumber}
                            </span>
                          )}
                        </div>

                        {isExpanded && moduleTopics.length > 0 && (
                          <div className="ml-3 border-l border-blue-100">
                            {moduleTopics.map(topic => {
                              const topicConcepts = getConceptsForTopic(topic.id);
                              const isTopicExpanded = expandedTopics.has(topic.id);
                              const topicMapping = getMappingForTarget('TOPIC', topic.id);
                              const isTopicActive = activeTarget?.type === 'TOPIC' && activeTarget?.id === topic.id;

                              return (
                                <div key={topic.id}>
                                  <div
                                    className={`flex items-center gap-2 pl-4 pr-3 py-2 cursor-pointer transition-colors border-l-2 ${
                                      isTopicActive ? 'bg-green-50 border-l-green-600' : 'border-l-transparent hover:bg-gray-50'
                                    }`}
                                    onClick={() => {
                                      toggleTopic(topic.id);
                                      if (topicMapping) navigateToTarget('TOPIC', topic.id, topic.name);
                                    }}
                                  >
                                    {topicConcepts.length > 0 ? (
                                      isTopicExpanded ? (
                                        <ChevronDown size={12} className="text-green-500 flex-shrink-0" />
                                      ) : (
                                        <ChevronRight size={12} className="text-gray-400 flex-shrink-0" />
                                      )
                                    ) : (
                                      <span className="w-3 flex-shrink-0" />
                                    )}
                                    <Tag size={12} className="text-green-600 flex-shrink-0" />
                                    <span className="text-xs font-medium text-gray-800 flex-1 truncate">{topic.name}</span>
                                    {topicMapping && (
                                      <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                                        p.{topicMapping.pageNumber}
                                      </span>
                                    )}
                                  </div>

                                  {isTopicExpanded && topicConcepts.length > 0 && (
                                    <div className="ml-4 border-l border-green-100">
                                      {topicConcepts.map(concept => {
                                        const conceptMapping = getMappingForTarget('CONCEPT', concept.id);
                                        const isConceptActive = activeTarget?.type === 'CONCEPT' && activeTarget?.id === concept.id;
                                        return (
                                          <div
                                            key={concept.id}
                                            className={`flex items-center gap-2 pl-4 pr-3 py-1.5 cursor-pointer transition-colors border-l-2 ${
                                              isConceptActive ? 'bg-purple-50 border-l-purple-600' : 'border-l-transparent hover:bg-gray-50'
                                            }`}
                                            onClick={() => {
                                              if (conceptMapping) navigateToTarget('CONCEPT', concept.id, concept.name);
                                            }}
                                          >
                                            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full flex-shrink-0" />
                                            <span className="text-xs text-gray-700 flex-1 truncate">{concept.name}</span>
                                            {conceptMapping && (
                                              <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                                                p.{conceptMapping.pageNumber}
                                              </span>
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
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: PDF Viewer */}
          <div className="flex-1 flex flex-col bg-gray-100 min-w-0 overflow-hidden">
            {pdfUrl ? (
              <>
                {/* PDF Toolbar */}
                <div className="flex-shrink-0 flex items-center justify-between px-3 sm:px-4 py-2 bg-white border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMobileTreeOpen(true)}
                      className="sm:hidden p-1.5 rounded hover:bg-gray-100"
                    >
                      <Menu size={18} />
                    </button>
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage <= 1}
                      className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={currentPage}
                        onChange={(e) => {
                          const v = parseInt(e.target.value);
                          if (v >= 1) setCurrentPage(v);
                        }}
                        className="w-12 sm:w-14 px-2 py-1 text-center text-sm border border-gray-300 rounded"
                        min="1"
                      />
                      <span className="text-xs text-gray-500 hidden sm:inline">page</span>
                    </div>
                    <button
                      onClick={() => setCurrentPage(currentPage + 1)}
                      className="p-1.5 rounded hover:bg-gray-100"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                  {activeTarget && (
                    <div className="text-xs text-gray-600 truncate max-w-[150px] sm:max-w-[200px]">
                      <span className="font-medium">{activeTarget.type}:</span> {activeTarget.name}
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <FileText size={14} className="text-gray-400" />
                    <span className="text-xs text-gray-500 truncate max-w-[100px] sm:max-w-[150px]">{curriculumDoc?.originalName || curriculumDoc?.filename}</span>
                  </div>
                </div>

                {/* PDF Content */}
                <div className="flex-1 overflow-hidden">
                  <iframe
                    src={`${pdfUrl}#page=${currentPage}`}
                    className="w-full h-full border-0"
                    title="Curriculum PDF"
                    key={`pdf-${currentPage}`}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center p-8">
                  <FileText size={48} className="mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">
                    {hierarchyLoading ? 'Loading...' : 'No PDF Available'}
                  </h3>
                  <p className="text-gray-400 text-sm">
                    {hasCurriculum === false
                      ? 'No curriculum PDF has been uploaded for this volume yet.'
                      : 'Select a volume to view its curriculum.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentLearning;
