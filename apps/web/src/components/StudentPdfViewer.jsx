import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Download, X, BookOpen } from 'lucide-react';

const StudentPdfViewer = ({ 
  volumeId, 
  courseId, 
  initialTarget = null, 
  onClose,
  showNavigation = true 
}) => {
  const [document, setDocument] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [navigationTargets, setNavigationTargets] = useState([]);

  useEffect(() => {
    if (volumeId && courseId) {
      fetchDocument();
      if (initialTarget) {
        fetchMappingAndNavigate(initialTarget);
      }
    }
  }, [volumeId, courseId, initialTarget]);

  const fetchDocument = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/pdf-mapping/volume/${volumeId}/document?courseId=${courseId}`);
      if (response.ok) {
        const data = await response.json();
        setDocument(data);
        setPdfUrl(`/api/pdf-mapping/file/${data.filename}`);
        
        // Extract page count from PDF metadata or set a default
        // This could be enhanced with PDF.js to get actual page count
        setTotalPages(500); // Default estimate, should be dynamic
      } else {
        setError('No curriculum document found for this volume');
      }
    } catch (err) {
      console.error('Failed to fetch document:', err);
      setError('Failed to load curriculum document');
    } finally {
      setLoading(false);
    }
  };

  const fetchMappingAndNavigate = async (target) => {
    try {
      const response = await fetch(`/api/pdf-mapping/mapping/${target.type}/${target.id}`);
      if (response.ok) {
        const data = await response.json();
        setCurrentPage(data.mapping.pageNumber);
      }
    } catch (err) {
      console.error('Failed to fetch mapping:', err);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleZoom = (delta) => {
    const newZoom = Math.max(50, Math.min(200, zoom + delta));
    setZoom(newZoom);
  };

  const handleRotation = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleDownload = () => {
    if (pdfUrl) {
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = document?.filename || 'curriculum.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const navigateToTarget = async (target) => {
    await fetchMappingAndNavigate(target);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-700">Loading curriculum...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Curriculum Not Available</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
          </div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex z-50">
      {/* Main PDF Viewer */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-md"
            >
              <X size={20} />
            </button>
            <div className="flex items-center">
              <BookOpen className="mr-2 text-blue-600" size={20} />
              <h2 className="font-semibold text-gray-900">
                {document?.filename || 'Curriculum Document'}
              </h2>
            </div>
          </div>
          
          {/* Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleZoom(-10)}
              className="p-2 hover:bg-gray-100 rounded-md"
              title="Zoom Out"
            >
              <ZoomOut size={18} />
            </button>
            <span className="text-sm font-medium min-w-[50px] text-center">
              {zoom}%
            </span>
            <button
              onClick={() => handleZoom(10)}
              className="p-2 hover:bg-gray-100 rounded-md"
              title="Zoom In"
            >
              <ZoomIn size={18} />
            </button>
            <button
              onClick={handleRotation}
              className="p-2 hover:bg-gray-100 rounded-md"
              title="Rotate"
            >
              <RotateCw size={18} />
            </button>
            <button
              onClick={handleDownload}
              className="p-2 hover:bg-gray-100 rounded-md"
              title="Download"
            >
              <Download size={18} />
            </button>
          </div>
        </div>

        {/* PDF Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Navigation Sidebar */}
          {showNavigation && navigationTargets.length > 0 && (
            <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 mb-4">Quick Navigation</h3>
                <div className="space-y-2">
                  {navigationTargets.map((target, index) => (
                    <button
                      key={index}
                      onClick={() => navigateToTarget(target)}
                      className="w-full text-left p-3 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{target.name}</p>
                          <p className="text-sm text-gray-500 capitalize">{target.type}</p>
                        </div>
                        <ChevronRight className="text-gray-400" size={16} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PDF Display */}
          <div className="flex-1 bg-gray-100 overflow-auto">
            <div className="flex flex-col items-center py-4">
              {/* Page Navigation */}
              <div className="flex items-center space-x-4 mb-4 bg-white px-4 py-2 rounded-lg shadow-sm">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={20} />
                </button>
                
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={currentPage}
                    onChange={(e) => handlePageChange(parseInt(e.target.value) || 1)}
                    className="w-16 px-2 py-1 text-center border border-gray-300 rounded-md"
                    min="1"
                    max={totalPages}
                  />
                  <span className="text-gray-600">/ {totalPages}</span>
                </div>
                
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {/* PDF iframe */}
              <div 
                className="bg-white shadow-lg rounded-lg overflow-hidden"
                style={{
                  transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                  transformOrigin: 'center',
                  transition: 'transform 0.2s ease'
                }}
              >
                <iframe
                  src={`${pdfUrl}#page=${currentPage}&zoom=${zoom}`}
                  className="border-0"
                  style={{
                    width: '800px',
                    height: '1000px'
                  }}
                  title="Curriculum PDF"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentPdfViewer;
