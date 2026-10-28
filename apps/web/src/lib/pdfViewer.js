import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { assetUrl } from './slideUrls';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const STATUS_MESSAGES = {
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to view this PDF.',
  404: 'The PDF file could not be found.',
  429: 'Too many requests. Please try again shortly.',
  500: 'The PDF could not be loaded due to a server error.'
};

export function loadPdfDocument(pdfUrl) {
  return pdfjsLib.getDocument({
    url: assetUrl(pdfUrl),
    withCredentials: false
  });
}

export function getPdfErrorInfo(error, fallback = 'This PDF could not be opened because the file is invalid or unsupported.') {
  const status = Number(error?.response?.status ?? error?.status ?? error?.statusCode);
  if (Number.isFinite(status) && status > 0) {
    return {
      message: STATUS_MESSAGES[status] || (status >= 500
        ? STATUS_MESSAGES[500]
        : 'The PDF could not be loaded.'),
      code: `HTTP_${status}`
    };
  }

  const name = error?.name || '';
  if (name === 'InvalidPDFException') {
    return { message: fallback, code: 'INVALID_PDF' };
  }
  if (name === 'MissingPDFException') {
    return { message: STATUS_MESSAGES[404], code: 'MISSING_PDF' };
  }
  if (name === 'RenderingCancelledException') {
    return { message: 'PDF rendering was cancelled. Please try again.', code: 'RENDER_CANCELLED' };
  }
  if (name === 'UnexpectedResponseException') {
    const responseStatus = Number(error?.status);
    if (Number.isFinite(responseStatus) && responseStatus > 0) {
      return {
        message: STATUS_MESSAGES[responseStatus] || STATUS_MESSAGES[500],
        code: `HTTP_${responseStatus}`
      };
    }
  }
  if (error instanceof TypeError) {
    return { message: 'The PDF service could not be reached. Please check your connection and retry.', code: 'NETWORK_ERROR' };
  }

  return { message: fallback, code: name || 'PDF_LOAD_FAILED' };
}
