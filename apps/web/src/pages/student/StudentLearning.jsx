import React, { useState, useEffect } from 'react';
import { ChevronRight, BookOpen, FileText, Play, CheckCircle, Circle } from 'lucide-react';
import StudentPdfViewer from '../../components/StudentPdfViewer.jsx';

const StudentLearning = () => {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [volumes, setVolumes] = useState([]);
  const [selectedVolume, setSelectedVolume] = useState(null);
  const [modules, setModules] = useState([]);
  const [topics, setTopics] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [expandedModules, setExpandedModules] = useState(new Set());
  const [expandedTopics, setExpandedTopics] = useState(new Set());
  const [progress, setProgress] = useState({});
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfViewerTarget, setPdfViewerTarget] = useState(null);
  const [hasCurriculum, setHasCurriculum] = useState({});

  useEffect(() => {
    fetchCourses();
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      fetchVolumes();
      fetchProgress();
    }
  }, [selectedCourse]);

  useEffect(() => {
    if (selectedVolume && selectedCourse) {
      fetchModules();
      fetchTopics();
      fetchCurriculumStatus();
    }
  }, [selectedVolume, selectedCourse]);

  const fetchCourses = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/learning/me/courses', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setCourses(data.courses);
      if (data.courses.length > 0 && !selectedCourse) {
        setSelectedCourse(data.courses[0].courseId);
      }
    } catch (error) {
      console.error('Failed to fetch courses:', error);
    }
  };

  const fetchVolumes = async () => {
    try {
      const response = await fetch(`/api/learning/volumes/public?courseId=${selectedCourse}`);
      const data = await response.json();
      setVolumes(data.volumes);
      if (data.volumes.length > 0 && !selectedVolume) {
        setSelectedVolume(data.volumes[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch volumes:', error);
    }
  };

  const fetchModules = async () => {
    try {
      const response = await fetch(`/api/learning/modules/public?courseId=${selectedCourse}&volumeId=${selectedVolume}`);
      const data = await response.json();
      setModules(data.modules || []);
    } catch (error) {
      console.error('Failed to fetch modules:', error);
    }
  };

  const fetchTopics = async () => {
    try {
      const response = await fetch(`/api/learning/topics/public?courseId=${selectedCourse}&volumeId=${selectedVolume}`);
      const data = await response.json();
      setTopics(data.topics || []);
    } catch (error) {
      console.error('Failed to fetch topics:', error);
    }
  };

  const fetchProgress = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/learning/courses/${selectedCourse}/progress`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setProgress(data);
    } catch (error) {
      console.error('Failed to fetch progress:', error);
    }
  };

  const fetchCurriculumStatus = async () => {
    try {
      const response = await fetch(`/api/pdf-mapping/volume/${selectedVolume}/document?courseId=${selectedCourse}`);
      const hasDoc = response.ok;
      setHasCurriculum(prev => ({ ...prev, [selectedVolume]: hasDoc }));
    } catch (error) {
      setHasCurriculum(prev => ({ ...prev, [selectedVolume]: false }));
    }
  };

  const toggleModule = (moduleId) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId);
    } else {
      newExpanded.add(moduleId);
    }
    setExpandedModules(newExpanded);
  };

  const toggleTopic = (topicId) => {
    const newExpanded = new Set(expandedTopics);
    if (newExpanded.has(topicId)) {
      newExpanded.delete(topicId);
    } else {
      newExpanded.add(topicId);
    }
    setExpandedTopics(newExpanded);
  };

  const openPdfViewer = (target) => {
    setPdfViewerTarget(target);
    setShowPdfViewer(true);
  };

  const handleModuleClick = (module) => {
    // First expand the module
    if (!expandedModules.has(module.id)) {
      toggleModule(module.id);
    }
    // Then open PDF viewer to module location
    openPdfViewer({ type: 'MODULE', id: module.id, name: module.name });
  };

  const handleTopicClick = (topic) => {
    // First expand the topic
    if (!expandedTopics.has(topic.id)) {
      toggleTopic(topic.id);
    }
    // Then open PDF viewer to topic location
    openPdfViewer({ type: 'TOPIC', id: topic.id, name: topic.name });
  };

  const handleConceptClick = (concept) => {
    openPdfViewer({ type: 'CONCEPT', id: concept.id, name: concept.name });
  };

  const getTopicsForModule = (moduleId) => {
    return topics.filter(topic => topic.moduleId === moduleId);
  };

  const getConceptsForTopic = (topicId) => {
    // This would need to be fetched or derived from the topics data
    return []; // Placeholder - would need to implement concept fetching
  };

  const selectedCourseData = courses.find(c => c.courseId === selectedCourse);
  const selectedVolumeData = volumes.find(v => v.id === selectedVolume);

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Learning Center</h1>
        <p className="text-gray-600">Navigate through your curriculum with integrated PDF viewer</p>
      </div>

      {/* Course and Volume Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Course</label>
          <select
            value={selectedCourse || ''}
            onChange={(e) => {
              setSelectedCourse(e.target.value);
              setSelectedVolume(null);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Choose a course...</option>
            {courses.map(course => (
              <option key={course.courseId} value={course.courseId}>
                {course.name} {course.level && `(${course.level})`}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Volume</label>
          <select
            value={selectedVolume || ''}
            onChange={(e) => setSelectedVolume(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={!selectedCourse}
          >
            <option value="">Choose a volume...</option>
            {volumes.map(volume => (
              <option key={volume.id} value={volume.id}>
                {volume.name}
                {hasCurriculum[volume.id] && ' 📚'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Progress Overview */}
      {selectedCourseData && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Course Progress</h2>
            <span className="text-2xl font-bold text-blue-600">{progress.percent || 0}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${progress.percent || 0}%` }}
            ></div>
          </div>
          <div className="mt-2 text-sm text-gray-600">
            {progress.timeSpentSec && `Time spent: ${Math.round(progress.timeSpentSec / 60)} minutes`}
            {progress.remainingSeconds && ` • Remaining: ${Math.round(progress.remainingSeconds / 60)} minutes`}
          </div>
        </div>
      )}

      {/* Learning Hierarchy */}
      {selectedVolume && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <BookOpen className="mr-2" size={24} />
                {selectedVolumeData?.name}
              </h2>
              {hasCurriculum[selectedVolume] && (
                <button
                  onClick={() => openPdfViewer(null)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
                >
                  <FileText size={16} className="mr-2" />
                  Open Curriculum PDF
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-gray-200">
            {modules.map(module => {
              const moduleTopics = getTopicsForModule(module.id);
              const isExpanded = expandedModules.has(module.id);
              
              return (
                <div key={module.id} className="hover:bg-gray-50">
                  {/* Module Header */}
                  <div 
                    className="p-4 flex items-center justify-between cursor-pointer"
                    onClick={() => handleModuleClick(module)}
                  >
                    <div className="flex items-center space-x-3">
                      <ChevronRight 
                        size={20} 
                        className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      />
                      <div className="flex items-center">
                        {hasCurriculum[selectedVolume] && (
                          <FileText size={16} className="text-blue-600 mr-2" />
                        )}
                        <h3 className="font-medium text-gray-900">{module.name}</h3>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">
                        {moduleTopics.length} topics
                      </span>
                      {hasCurriculum[selectedVolume] && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleModuleClick(module);
                          }}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="View in curriculum"
                        >
                          <BookOpen size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Module Topics */}
                  {isExpanded && moduleTopics.length > 0 && (
                    <div className="pl-8 pr-4 pb-4">
                      {moduleTopics.map(topic => {
                        const topicConcepts = getConceptsForTopic(topic.id);
                        const isTopicExpanded = expandedTopics.has(topic.id);
                        
                        return (
                          <div key={topic.id} className="hover:bg-gray-50 rounded-lg">
                            {/* Topic Header */}
                            <div 
                              className="p-3 flex items-center justify-between cursor-pointer"
                              onClick={() => handleTopicClick(topic)}
                            >
                              <div className="flex items-center space-x-3">
                                <ChevronRight 
                                  size={16} 
                                  className={`text-gray-400 transition-transform ${isTopicExpanded ? 'rotate-90' : ''}`}
                                />
                                <h4 className="text-sm font-medium text-gray-800">{topic.name}</h4>
                              </div>
                              <div className="flex items-center space-x-2">
                                {topicConcepts.length > 0 && (
                                  <span className="text-xs text-gray-500">
                                    {topicConcepts.length} concepts
                                  </span>
                                )}
                                {hasCurriculum[selectedVolume] && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleTopicClick(topic);
                                    }}
                                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                    title="View in curriculum"
                                  >
                                    <BookOpen size={14} />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Topic Concepts */}
                            {isTopicExpanded && topicConcepts.length > 0 && (
                              <div className="pl-6 pr-3 pb-3">
                                {topicConcepts.map(concept => (
                                  <div 
                                    key={concept.id}
                                    className="p-2 flex items-center justify-between hover:bg-gray-50 rounded cursor-pointer"
                                    onClick={() => handleConceptClick(concept)}
                                  >
                                    <div className="flex items-center space-x-2">
                                      <Circle size={12} className="text-gray-400" />
                                      <span className="text-sm text-gray-700">{concept.name}</span>
                                    </div>
                                    {hasCurriculum[selectedVolume] && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleConceptClick(concept);
                                        }}
                                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                        title="View in curriculum"
                                      >
                                        <BookOpen size={12} />
                                      </button>
                                    )}
                                  </div>
                                ))}
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
        </div>
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
