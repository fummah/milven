import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Upload, FileText, MapPin, Trash2, Save, Eye, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';

const AdminPdfMapping = () => {
  const [volumes, setVolumes] = useState([]);
  const [selectedVolume, setSelectedVolume] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courses, setCourses] = useState([]);
  const [document, setDocument] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [volumesLoading, setVolumesLoading] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [learningHierarchy, setLearningHierarchy] = useState({ modules: [], topics: [], concepts: [] });
  const [uploadProgress, setUploadProgress] = useState(null);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [totalPdfPages, setTotalPdfPages] = useState(0);
  const [isMapping, setIsMapping] = useState(false);
  const [mappingTarget, setMappingTarget] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);

  useEffect(() => {
    fetchCourses();
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      fetchVolumes();
      setSelectedVolume(null); // Reset volume when course changes
    }
  }, [selectedCourse]);

  useEffect(() => {
    if (selectedCourse && selectedVolume) {
      fetchDocument();
      fetchMappings();
      fetchLearningHierarchy();
    }
  }, [selectedCourse, selectedVolume]);

  const fetchCourses = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Use the same api utility as AdminCourses
      const response = await api.get('/api/cms/courses');
      const coursesArray = response.data?.courses || response.data?.items || [];
      setCourses(Array.isArray(coursesArray) ? coursesArray : []);
    } catch (error) {
      console.error('Failed to fetch courses:', error);
      setError(`Failed to load courses: ${error.response?.data?.error || error.message}`);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchVolumes = async () => {
    if (!selectedCourse) return;
    
    setVolumesLoading(true);
    try {
      const response = await api.get('/api/learning/volumes/public', {
        params: { courseId: selectedCourse }
      });
      setVolumes(response.data?.volumes || []);
    } catch (error) {
      console.error('Failed to fetch volumes:', error);
      setVolumes([]);
    } finally {
      setVolumesLoading(false);
    }
  };

  const fetchDocument = async () => {
    if (!selectedVolume || !selectedCourse) return;
    
    setDocumentLoading(true);
    try {
      const response = await api.get(`/api/pdf-mapping/volume/${selectedVolume}/document`, {
        params: { courseId: selectedCourse }
      });
      setDocument(response.data);
      // Also populate mappings from document response
      if (response.data.mappings?.length) {
        setMappings(response.data.mappings);
      }
      if (response.data.fileExists) {
        setPdfUrl(`${api.defaults.baseURL}/uploads/curriculum-pdfs/${response.data.filename}`);
      } else {
        setPdfUrl(null);
      }
    } catch (error) {
      console.error('Failed to fetch document:', error);
      setDocument(null);
      setPdfUrl(null);
    } finally {
      setDocumentLoading(false);
    }
  };

  const fetchMappings = async () => {
    if (!selectedVolume) return;
    
    try {
      const response = await api.get(`/api/pdf-mapping/volume/${selectedVolume}/mappings`);
      setMappings(response.data?.mappings || []);
    } catch (error) {
      console.error('Failed to fetch mappings:', error);
      setMappings([]);
    }
  };

  const fetchLearningHierarchy = async () => {
    if (!selectedVolume || !selectedCourse) return;
    
    try {
      const [modulesRes, topicsRes, conceptsRes] = await Promise.all([
        api.get('/api/learning/modules/public', {
          params: { courseId: selectedCourse, volumeId: selectedVolume }
        }),
        api.get('/api/learning/topics/public', {
          params: { courseId: selectedCourse }
        }),
        api.get('/api/cms/concepts', {
          params: { courseId: selectedCourse }
        })
      ]);

      const modules = modulesRes.data?.modules || [];
      const topics = topicsRes.data?.topics || [];
      const concepts = conceptsRes.data?.concepts || [];

      // Filter topics to only those belonging to modules in this volume
      const volumeModuleIds = new Set(modules.map(m => m.id));
      const volumeTopics = topics.filter(t => volumeModuleIds.has(t.moduleId));

      // Filter concepts to only those belonging to volume topics
      const volumeTopicIds = new Set(volumeTopics.map(t => t.id));
      const volumeConcepts = concepts.filter(c => volumeTopicIds.has(c.topicId));

      setLearningHierarchy({
        modules,
        topics: volumeTopics,
        concepts: volumeConcepts
      });
    } catch (error) {
      console.error('Failed to fetch learning hierarchy:', error);
      setLearningHierarchy({ modules: [], topics: [], concepts: [] });
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !selectedVolume || !selectedCourse) return;

    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('volumeId', selectedVolume);
    formData.append('courseId', selectedCourse);

    try {
      setUploadProgress('Uploading...');
      const response = await api.post('/api/pdf-mapping/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setUploadProgress('Upload successful!');
      fetchDocument();
      setTimeout(() => setUploadProgress(null), 2000);
    } catch (error) {
      console.error('Upload failed:', error);
      const errorMessage = error.response?.data?.error || 'Upload failed';
      setUploadProgress(`Upload failed: ${errorMessage}`);
      setTimeout(() => setUploadProgress(null), 3000);
    }
  };

  const startMapping = (target) => {
    setMappingTarget(target);
    setIsMapping(true);
  };

  const saveMapping = async () => {
    if (!mappingTarget || !document) return;

    try {
      const response = await api.post('/api/pdf-mapping/mapping', {
        curriculumDocumentId: document.id,
        targetType: mappingTarget.type,
        targetId: mappingTarget.id,
        pageNumber: currentPdfPage,
        yOffset: 0 // Could be enhanced with PDF viewer position
      });

      const data = response.data;
      setMappings(prev => [...prev.filter(m => !(m.targetType === mappingTarget.type && m.targetId === mappingTarget.id)), data.mapping]);
      setIsMapping(false);
      setMappingTarget(null);
    } catch (error) {
      console.error('Failed to save mapping:', error);
      const errorMessage = error.response?.data?.error || 'Failed to save mapping';
      alert(`Failed to save mapping: ${errorMessage}`);
    }
  };

  const deleteMapping = async (mappingId) => {
    try {
      await api.delete(`/api/pdf-mapping/mapping/${mappingId}`);
      setMappings(prev => prev.filter(m => m.id !== mappingId));
    } catch (error) {
      console.error('Failed to delete mapping:', error);
      const errorMessage = error.response?.data?.error || 'Failed to delete mapping';
      alert(`Failed to delete mapping: ${errorMessage}`);
    }
  };

  const getMappingForTarget = (type, id) => {
    return mappings.find(m => m.targetType === type && m.targetId === id);
  };

  const navigateToMapping = (mapping) => {
    setCurrentPdfPage(mapping.pageNumber);
    // Scroll to PDF viewer
    document.getElementById('pdf-viewer')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">PDF Curriculum Mapping</h1>
        <p className="text-gray-600">Upload curriculum PDFs and map them to learning modules, topics, and concepts</p>
      </div>

      {/* Course and Volume Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Course</label>
          {loading ? (
            <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              <span className="text-gray-600">Loading courses...</span>
            </div>
          ) : error ? (
            <div className="w-full px-3 py-2 border border-red-300 rounded-md bg-red-50 text-red-700">
              {error}
            </div>
          ) : (
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
                <option key={course.id} value={course.id}>
                  {course.name} {course.level && `(${course.level.replace('LEVEL', 'Level ')})`}
                </option>
              ))}
            </select>
          )}
          {courses.length === 0 && !loading && !error && (
            <p className="text-sm text-gray-500 mt-1">No courses available</p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Volume</label>
          {volumesLoading ? (
            <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              <span className="text-gray-600">Loading volumes...</span>
            </div>
          ) : (
            <select
              value={selectedVolume || ''}
              onChange={(e) => setSelectedVolume(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!selectedCourse}
            >
              <option value="">Choose a volume...</option>
              {volumes.map(volume => (
                <option key={volume.id} value={volume.id}>{volume.name}</option>
              ))}
            </select>
          )}
          {volumes.length === 0 && !volumesLoading && selectedCourse && (
            <p className="text-sm text-gray-500 mt-1">No volumes available for this course</p>
          )}
        </div>
      </div>

      {selectedVolume && selectedCourse && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Upload and Learning Hierarchy */}
          <div className="space-y-6">
            {/* PDF Upload */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Upload className="mr-2" size={20} />
                Upload Curriculum PDF
              </h2>
              
              {document ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                    <div className="flex items-center">
                      <FileText className="mr-2 text-green-600" size={20} />
                      <div>
                        <p className="font-medium text-green-900">{document.originalName || document.filename}</p>
                        <p className="text-sm text-green-700">
                          {(document.fileSize / 1024 / 1024).toFixed(2)} MB • Uploaded {new Date(document.uploadedAt).toLocaleDateString()}
                        </p>
                        {!document.fileExists && (
                          <p className="text-sm text-red-600 mt-1 font-medium">⚠ File missing on server - please reupload</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {document.fileExists ? (
                        <button
                          onClick={() => setPdfUrl(`${api.defaults.baseURL}/uploads/curriculum-pdfs/${document.filename}`)}
                          className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
                        >
                          <Eye size={16} className="mr-1" />
                          View
                        </button>
                      ) : (
                        <label className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer flex items-center">
                          <Upload size={16} className="mr-1" />
                          Reupload
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <Upload className="mx-auto text-gray-400 mb-2" size={40} />
                  <label className="cursor-pointer">
                    <span className="text-blue-600 hover:text-blue-700">Choose PDF file</span>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-sm text-gray-500 mt-2">Max file size: 50MB</p>
                </div>
              )}
              
              {uploadProgress && (
                <div className={`p-3 rounded-md ${uploadProgress.includes('failed') ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                  {uploadProgress}
                </div>
              )}
            </div>

            {/* Learning Hierarchy Tree */}
            <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <MapPin className="mr-2" size={20} />
                  Learning Hierarchy
                </h2>
                
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {learningHierarchy.modules.length === 0 ? (
                    <p className="text-gray-500 text-sm">No modules found for this volume</p>
                  ) : (
                    learningHierarchy.modules.map(module => {
                      const moduleMapping = getMappingForTarget('MODULE', module.id);
                      const moduleTopics = learningHierarchy.topics.filter(t => t.moduleId === module.id);
                      return (
                        <div key={module.id} className="border border-gray-200 rounded-lg overflow-hidden">
                          {/* Module */}
                          <div className="flex items-center justify-between p-3 bg-blue-50">
                            <div className="flex-1">
                              <p className="font-semibold text-blue-900">{module.name}</p>
                              {moduleMapping && (
                                <p className="text-xs text-blue-600">Page {moduleMapping.pageNumber}</p>
                              )}
                            </div>
                            <div className="flex items-center space-x-1">
                              {moduleMapping && (
                                <>
                                  <button onClick={() => navigateToMapping(moduleMapping)} className="p-1 text-blue-600 hover:bg-blue-100 rounded" title="View in PDF"><Eye size={14} /></button>
                                  <button onClick={() => deleteMapping(moduleMapping.id)} className="p-1 text-red-600 hover:bg-red-100 rounded" title="Delete mapping"><Trash2 size={14} /></button>
                                </>
                              )}
                              <button
                                onClick={() => startMapping({ type: 'MODULE', id: module.id, name: module.name })}
                                className={`px-2 py-1 rounded text-xs ${moduleMapping ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                              >
                                {moduleMapping ? 'Remap' : 'Map'}
                              </button>
                            </div>
                          </div>

                          {/* Topics under this module */}
                          {moduleTopics.length > 0 && (
                            <div className="pl-4 border-l-2 border-blue-200 ml-3 my-2 space-y-1">
                              {moduleTopics.map(topic => {
                                const topicMapping = getMappingForTarget('TOPIC', topic.id);
                                const topicConcepts = learningHierarchy.concepts.filter(c => c.topicId === topic.id);
                                return (
                                  <div key={topic.id}>
                                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                      <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-800">{topic.name}</p>
                                        {topicMapping && (
                                          <p className="text-xs text-blue-600">Page {topicMapping.pageNumber}</p>
                                        )}
                                      </div>
                                      <div className="flex items-center space-x-1">
                                        {topicMapping && (
                                          <>
                                            <button onClick={() => navigateToMapping(topicMapping)} className="p-1 text-blue-600 hover:bg-blue-100 rounded" title="View in PDF"><Eye size={12} /></button>
                                            <button onClick={() => deleteMapping(topicMapping.id)} className="p-1 text-red-600 hover:bg-red-100 rounded" title="Delete mapping"><Trash2 size={12} /></button>
                                          </>
                                        )}
                                        <button
                                          onClick={() => startMapping({ type: 'TOPIC', id: topic.id, name: topic.name })}
                                          className={`px-2 py-0.5 rounded text-xs ${topicMapping ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-green-600 text-white hover:bg-green-700'}`}
                                        >
                                          {topicMapping ? 'Remap' : 'Map'}
                                        </button>
                                      </div>
                                    </div>

                                    {/* Concepts under this topic */}
                                    {topicConcepts.length > 0 && (
                                      <div className="pl-4 border-l-2 border-green-200 ml-3 my-1 space-y-1">
                                        {topicConcepts.map(concept => {
                                          const conceptMapping = getMappingForTarget('CONCEPT', concept.id);
                                          return (
                                            <div key={concept.id} className="flex items-center justify-between p-1.5 bg-white rounded border border-gray-100">
                                              <div className="flex-1">
                                                <p className="text-xs font-medium text-gray-700">{concept.name}</p>
                                                {conceptMapping && (
                                                  <p className="text-xs text-blue-600">Page {conceptMapping.pageNumber}</p>
                                                )}
                                              </div>
                                              <div className="flex items-center space-x-1">
                                                {conceptMapping && (
                                                  <>
                                                    <button onClick={() => navigateToMapping(conceptMapping)} className="p-0.5 text-blue-600 hover:bg-blue-100 rounded" title="View in PDF"><Eye size={11} /></button>
                                                    <button onClick={() => deleteMapping(conceptMapping.id)} className="p-0.5 text-red-600 hover:bg-red-100 rounded" title="Delete mapping"><Trash2 size={11} /></button>
                                                  </>
                                                )}
                                                <button
                                                  onClick={() => startMapping({ type: 'CONCEPT', id: concept.id, name: concept.name })}
                                                  className={`px-1.5 py-0.5 rounded text-xs ${conceptMapping ? 'bg-gray-200 text-gray-600 hover:bg-gray-300' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
                                                >
                                                  {conceptMapping ? 'Remap' : 'Map'}
                                                </button>
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
                    })
                  )}
                </div>
              </div>
          </div>

          {/* Right Column: PDF Viewer */}
          <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center">
                  <FileText className="mr-2" size={20} />
                  PDF Viewer
                </h2>
                {isMapping && (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-orange-600">
                      Mapping: {mappingTarget?.name}
                    </span>
                    <button
                      onClick={saveMapping}
                      className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center text-sm"
                    >
                      <Save size={16} className="mr-1" />
                      Save to Page {currentPdfPage}
                    </button>
                    <button
                      onClick={() => {
                        setIsMapping(false);
                        setMappingTarget(null);
                      }}
                      className="px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* PDF Navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setCurrentPdfPage(Math.max(1, currentPdfPage - 1))}
                  disabled={currentPdfPage <= 1}
                  className="p-2 rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={20} />
                </button>
                
                <span className="text-sm font-medium">
                  Page {currentPdfPage}
                </span>
                
                <button
                  onClick={() => setCurrentPdfPage(currentPdfPage + 1)}
                  className="p-2 rounded-md bg-gray-100 hover:bg-gray-200"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {/* PDF iframe with error handling */}
              <div id="pdf-viewer" className="border border-gray-300 rounded-lg overflow-hidden" style={{ height: '600px' }}>
                {documentLoading ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                    <p className="text-gray-600">Loading PDF...</p>
                  </div>
                ) : pdfUrl ? (
                  <div className="w-full h-full relative">
                    <iframe
                      src={`${pdfUrl}#page=${currentPdfPage}`}
                      className="w-full h-full"
                      title="Curriculum PDF"
                      onLoad={() => console.log('PDF loaded successfully')}
                      onError={(e) => {
                        console.error('PDF failed to load:', e);
                        setPdfUrl(null);
                      }}
                    />
                    <div className="absolute top-2 right-2 bg-white bg-opacity-90 px-2 py-1 rounded text-xs text-gray-600">
                      Page {currentPdfPage}
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 p-6">
                    <AlertCircle className="text-red-500 mb-4" size={48} />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">PDF File Not Available</h3>
                    <p className="text-gray-600 text-center mb-2">
                      {document ? 'The PDF file is missing from the server. Please reupload it.' : 'No PDF has been uploaded for this volume yet.'}
                    </p>
                    {document && (
                      <p className="text-sm text-gray-500 text-center mb-6">
                        Previously uploaded: {document.originalName || document.filename}
                      </p>
                    )}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <label className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer flex items-center justify-center">
                        <Upload size={16} className="mr-2" />
                        {document ? 'Reupload PDF' : 'Upload PDF'}
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                      <button
                        onClick={fetchDocument}
                        className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 flex items-center justify-center"
                      >
                        <Eye size={16} className="mr-2" />
                        Retry Loading
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {isMapping && (
                <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
                  <div className="flex items-start">
                    <AlertCircle className="text-orange-600 mr-2 mt-0.5" size={16} />
                    <div className="text-sm text-orange-800">
                      <p className="font-medium">Mapping Mode Active</p>
                      <p>Navigate to the correct page in the PDF and click "Save" to map "{mappingTarget?.name}" to this location.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
        </div>
      )}
    </div>
  );
};

export default AdminPdfMapping;
