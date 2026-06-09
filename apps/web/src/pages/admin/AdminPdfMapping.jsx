import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Upload, FileText, MapPin, Trash2, Save, Eye, AlertCircle } from 'lucide-react';

const AdminPdfMapping = () => {
  const [volumes, setVolumes] = useState([]);
  const [selectedVolume, setSelectedVolume] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courses, setCourses] = useState([]);
  const [document, setDocument] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [learningHierarchy, setLearningHierarchy] = useState({ modules: [], topics: [], concepts: [] });
  const [uploadProgress, setUploadProgress] = useState(null);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [totalPdfPages, setTotalPdfPages] = useState(0);
  const [isMapping, setIsMapping] = useState(false);
  const [mappingTarget, setMappingTarget] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);

  useEffect(() => {
    fetchCourses();
    fetchVolumes();
  }, []);

  useEffect(() => {
    if (selectedCourse && selectedVolume) {
      fetchDocument();
      fetchMappings();
      fetchLearningHierarchy();
    }
  }, [selectedCourse, selectedVolume]);

  const fetchCourses = async () => {
    try {
      const response = await fetch('/api/learning/courses/public');
      const data = await response.json();
      setCourses(data.courses);
    } catch (error) {
      console.error('Failed to fetch courses:', error);
    }
  };

  const fetchVolumes = async () => {
    try {
      const courseId = selectedCourse || courses[0]?.id;
      if (!courseId) return;
      
      const response = await fetch(`/api/learning/volumes/public?courseId=${courseId}`);
      const data = await response.json();
      setVolumes(data.volumes);
    } catch (error) {
      console.error('Failed to fetch volumes:', error);
    }
  };

  const fetchDocument = async () => {
    if (!selectedVolume || !selectedCourse) return;
    
    try {
      const response = await fetch(`/api/pdf-mapping/volume/${selectedVolume}/document?courseId=${selectedCourse}`);
      if (response.ok) {
        const data = await response.json();
        setDocument(data);
        setPdfUrl(`/api/pdf-mapping/file/${data.filename}`);
      } else {
        setDocument(null);
        setPdfUrl(null);
      }
    } catch (error) {
      console.error('Failed to fetch document:', error);
      setDocument(null);
      setPdfUrl(null);
    }
  };

  const fetchMappings = async () => {
    if (!selectedVolume) return;
    
    try {
      const response = await fetch(`/api/pdf-mapping/volume/${selectedVolume}/mappings`);
      if (response.ok) {
        const data = await response.json();
        setMappings(data.mappings);
      }
    } catch (error) {
      console.error('Failed to fetch mappings:', error);
    }
  };

  const fetchLearningHierarchy = async () => {
    if (!selectedVolume || !selectedCourse) return;
    
    try {
      const [modulesRes, topicsRes, conceptsRes] = await Promise.all([
        fetch(`/api/learning/modules/public?courseId=${selectedCourse}&volumeId=${selectedVolume}`),
        fetch(`/api/learning/topics/public?courseId=${selectedCourse}&volumeId=${selectedVolume}`),
        fetch(`/api/learning/topics/public?courseId=${selectedCourse}`)
      ]);

      const modules = await modulesRes.json();
      const topics = await topicsRes.json();
      const allConcepts = await conceptsRes.json();

      // Filter concepts to only those in this volume's topics
      const volumeTopicIds = new Set(topics.topics?.map(t => t.id) || []);
      const concepts = allConcepts.topics?.filter(t => volumeTopicIds.has(t.id)) || [];

      setLearningHierarchy({
        modules: modules.modules || [],
        topics: topics.topics || [],
        concepts: concepts || []
      });
    } catch (error) {
      console.error('Failed to fetch learning hierarchy:', error);
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
      const response = await fetch('/api/pdf-mapping/upload', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUploadProgress('Upload successful!');
        fetchDocument();
        setTimeout(() => setUploadProgress(null), 2000);
      } else {
        const error = await response.json();
        setUploadProgress(`Upload failed: ${error.error}`);
        setTimeout(() => setUploadProgress(null), 3000);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadProgress('Upload failed');
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
      const response = await fetch('/api/pdf-mapping/mapping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          curriculumDocumentId: document.id,
          targetType: mappingTarget.type,
          targetId: mappingTarget.id,
          pageNumber: currentPdfPage,
          yOffset: 0 // Could be enhanced with PDF viewer position
        })
      });

      if (response.ok) {
        const data = await response.json();
        setMappings(prev => [...prev.filter(m => !(m.targetType === mappingTarget.type && m.targetId === mappingTarget.id)), data.mapping]);
        setIsMapping(false);
        setMappingTarget(null);
      } else {
        const error = await response.json();
        alert(`Failed to save mapping: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to save mapping:', error);
      alert('Failed to save mapping');
    }
  };

  const deleteMapping = async (mappingId) => {
    try {
      const response = await fetch(`/api/pdf-mapping/mapping/${mappingId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        setMappings(prev => prev.filter(m => m.id !== mappingId));
      } else {
        alert('Failed to delete mapping');
      }
    } catch (error) {
      console.error('Failed to delete mapping:', error);
      alert('Failed to delete mapping');
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
              <option key={course.id} value={course.id}>{course.name}</option>
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
              <option key={volume.id} value={volume.id}>{volume.name}</option>
            ))}
          </select>
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
                        <p className="font-medium text-green-900">{document.filename}</p>
                        <p className="text-sm text-green-700">
                          {(document.fileSize / 1024 / 1024).toFixed(2)} MB • Uploaded {new Date(document.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setPdfUrl(`/api/pdf-mapping/file/${document.filename}`)}
                      className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
                    >
                      <Eye size={16} className="mr-1" />
                      View
                    </button>
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

            {/* Learning Hierarchy */}
            {document && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <MapPin className="mr-2" size={20} />
                  Learning Hierarchy
                </h2>
                
                <div className="space-y-4">
                  {/* Modules */}
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Learning Modules</h3>
                    <div className="space-y-2">
                      {learningHierarchy.modules.map(module => {
                        const mapping = getMappingForTarget('MODULE', module.id);
                        return (
                          <div key={module.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex-1">
                              <p className="font-medium">{module.name}</p>
                              {mapping && (
                                <p className="text-sm text-blue-600">Mapped to page {mapping.pageNumber}</p>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              {mapping && (
                                <>
                                  <button
                                    onClick={() => navigateToMapping(mapping)}
                                    className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                                    title="View in PDF"
                                  >
                                    <Eye size={16} />
                                  </button>
                                  <button
                                    onClick={() => deleteMapping(mapping.id)}
                                    className="p-1 text-red-600 hover:bg-red-100 rounded"
                                    title="Delete mapping"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => startMapping({ type: 'MODULE', id: module.id, name: module.name })}
                                className={`px-3 py-1 rounded-md text-sm ${
                                  mapping 
                                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' 
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                              >
                                {mapping ? 'Remap' : 'Map'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Topics */}
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Topics</h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {learningHierarchy.topics.map(topic => {
                        const mapping = getMappingForTarget('TOPIC', topic.id);
                        return (
                          <div key={topic.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{topic.name}</p>
                              {mapping && (
                                <p className="text-xs text-blue-600">Page {mapping.pageNumber}</p>
                              )}
                            </div>
                            <div className="flex items-center space-x-1">
                              {mapping && (
                                <>
                                  <button
                                    onClick={() => navigateToMapping(mapping)}
                                    className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                                    title="View in PDF"
                                  >
                                    <Eye size={14} />
                                  </button>
                                  <button
                                    onClick={() => deleteMapping(mapping.id)}
                                    className="p-1 text-red-600 hover:bg-red-100 rounded"
                                    title="Delete mapping"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => startMapping({ type: 'TOPIC', id: topic.id, name: topic.name })}
                                className={`px-2 py-1 rounded text-xs ${
                                  mapping 
                                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' 
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                              >
                                {mapping ? 'Remap' : 'Map'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: PDF Viewer */}
          {pdfUrl && (
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

              {/* PDF iframe */}
              <div id="pdf-viewer" className="border border-gray-300 rounded-lg overflow-hidden" style={{ height: '600px' }}>
                <iframe
                  src={`${pdfUrl}#page=${currentPdfPage}`}
                  className="w-full h-full"
                  title="Curriculum PDF"
                />
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
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPdfMapping;
