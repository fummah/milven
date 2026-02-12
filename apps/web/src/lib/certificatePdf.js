import { jsPDF } from 'jspdf';

const NAVY = [16, 37, 64];       // #102540
const NAVY_LIGHT = [27, 58, 91]; // #1b3a5b
const GOLD = [180, 150, 80];     // accent for seal/border

/**
 * Generate and download a course completion certificate PDF.
 * Navy blue professional design.
 * @param {Object} opts
 * @param {string} opts.userName - Student full name
 * @param {string} opts.courseName - Course name
 * @param {string|Date} opts.completedAt - Completion date (exam submitted)
 * @param {number} [opts.scorePercent] - Score percentage (optional)
 */
export function downloadCertificatePdf({ userName, courseName, completedAt, scorePercent }) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;

  const centerX = pageWidth / 2;

  const textCenter = (text, y, fontSize = 12) => {
    doc.setFontSize(fontSize);
    const w = doc.getTextWidth(text);
    doc.text(text, (pageWidth - w) / 2, y);
  };

  // Navy double border (outer + inner)
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.2);
  doc.rect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2);
  doc.setLineWidth(0.4);
  doc.rect(margin + 4, margin + 4, pageWidth - margin * 2 - 8, pageHeight - margin * 2 - 8);

  // Navy header band
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(...NAVY_LIGHT);
  doc.rect(0, 28, pageWidth, 4, 'F');

  // Title on header
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  textCenter('CERTIFICATE OF COMPLETION', 18);

  // Body text in dark gray / navy
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  textCenter('This is to certify that', 52);

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  textCenter(userName || 'Student', 66);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  textCenter('has successfully completed the course', 78);

  // Course name in navy box
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.3);
  doc.setFillColor(248, 250, 252); // very light background
  const courseNameText = courseName || 'Course';
  const courseLines = doc.splitTextToSize(courseNameText, pageWidth - 70);
  const courseBlockHeight = Math.max(22, courseLines.length * 8 + 12);
  const courseBoxY = 88;
  doc.rect(margin + 15, courseBoxY, pageWidth - margin * 2 - 30, courseBlockHeight, 'FD');
  doc.setTextColor(...NAVY);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(courseLines, centerX, courseBoxY + courseBlockHeight / 2 - (courseLines.length * 4) + 4, { align: 'center' });

  const afterCourseY = courseBoxY + courseBlockHeight + 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  const dateStr = completedAt
    ? new Date(completedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  if (dateStr) textCenter(`Completed on ${dateStr}`, afterCourseY);
  if (scorePercent != null && scorePercent !== '') {
    textCenter(`Score: ${Math.round(scorePercent)}%`, afterCourseY + (dateStr ? 8 : 0));
  }

  // Decorative seal (rounded square with check)
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.6);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(centerX - 10, pageHeight - 58, 20, 20, 3, 3, 'FD');
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.text('✓', centerX - 2, pageHeight - 48);

  // Footer band
  doc.setFillColor(...NAVY);
  doc.rect(0, pageHeight - 18, pageWidth, 18, 'F');
  doc.setFontSize(8);
  doc.setTextColor(200, 210, 220);
  textCenter('This certificate is issued for educational purposes.', pageHeight - 10);

  doc.setTextColor(0, 0, 0);
  const safeName = (courseName || 'Course').replace(/[^a-zA-Z0-9\s-]/g, '').trim().slice(0, 40);
  doc.save(`Certificate-${safeName}.pdf`);
}
