import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'curriculum-pdfs');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename but sanitize for filesystem safety
    const sanitized = file.originalname
      .replace(/[^a-zA-Z0-9._\-\s]/g, '') // Remove special chars except dots, hyphens, spaces
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_{2,}/g, '_'); // Collapse multiple underscores
    const name = sanitized || `${uuidv4()}.pdf`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

export function pdfMappingRouter(prisma) {
  const router = Router();

  // Upload curriculum PDF for a volume
  router.post('/upload', requireAuth(), upload.single('pdf'), async (req, res) => {
    try {
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { volumeId, courseId } = req.body;
      if (!volumeId || !courseId) {
        return res.status(400).json({ error: 'volumeId and courseId are required' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No PDF file uploaded' });
      }

      // Verify volume exists
      const volume = await prisma.volume.findUnique({
        where: { id: volumeId },
        include: { courseLinks: { where: { courseId } } }
      });

      if (!volume) {
        return res.status(404).json({ error: 'Volume not found' });
      }

      if (volume.courseLinks.length === 0) {
        return res.status(400).json({ error: 'Volume is not linked to this course' });
      }

      // Remove existing curriculum document for this volume if it exists
      const existingDoc = await prisma.curriculumDocument.findUnique({
        where: { courseId_volumeId: { courseId, volumeId } }
      });

      if (existingDoc) {
        // Delete old file
        const oldFilePath = path.join(process.cwd(), 'uploads', 'curriculum-pdfs', existingDoc.filename);
        try {
          await fs.unlink(oldFilePath);
        } catch (err) {
          console.warn('Failed to delete old PDF file:', err);
        }

        // Delete existing mappings
        await prisma.pdfMapping.deleteMany({
          where: { curriculumDocumentId: existingDoc.id }
        });

        // Delete existing document
        await prisma.curriculumDocument.delete({
          where: { id: existingDoc.id }
        });
      }

      // Create new curriculum document
      const curriculumDocument = await prisma.curriculumDocument.create({
        data: {
          courseId,
          volumeId,
          filename: req.file.filename,
          fileSize: req.file.size,
          uploadedById: req.user.id
        }
      });

      return res.json({
        success: true,
        curriculumDocument: {
          id: curriculumDocument.id,
          filename: req.file.filename,
          originalName: req.file.originalname,
          fileSize: req.file.size,
          uploadedAt: curriculumDocument.createdAt
        }
      });
    } catch (error) {
      console.error('[PDF Upload Error]', error);
      return res.status(500).json({ error: 'Failed to upload PDF' });
    }
  });

  // Get curriculum document for a volume
  router.get('/volume/:volumeId/document', async (req, res) => {
    try {
      const { volumeId } = req.params;
      const { courseId } = req.query;

      if (!courseId) {
        return res.status(400).json({ error: 'courseId is required' });
      }

      const document = await prisma.curriculumDocument.findUnique({
        where: { courseId_volumeId: { courseId, volumeId } },
        include: {
          pdfMappings: {
            orderBy: { pageNumber: 'asc' }
          },
          volume: { select: { name: true } },
          course: { select: { name: true, level: true } }
        }
      });

      if (!document) {
        return res.status(404).json({ error: 'No curriculum document found for this volume' });
      }

      // Check if the actual file exists on disk
      const filePath = path.join(process.cwd(), 'uploads', 'curriculum-pdfs', document.filename);
      let fileExists = false;
      try {
        await fs.access(filePath);
        fileExists = true;
      } catch {
        fileExists = false;
      }

      // Build display name from course/volume info (never use extractedText which is huge)
      const displayName = `${document.course?.name || 'Course'} - ${document.volume?.name || 'Volume'}.pdf`;

      return res.json({
        id: document.id,
        filename: document.filename,
        originalName: displayName,
        fileSize: document.fileSize,
        uploadedAt: document.createdAt,
        fileExists,
        mappings: document.pdfMappings
      });
    } catch (error) {
      console.error('[Get Document Error]', error);
      return res.status(500).json({ error: 'Failed to fetch document' });
    }
  });

  // Create or update PDF mapping
  router.post('/mapping', requireAuth(), async (req, res) => {
    try {
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const schema = z.object({
        curriculumDocumentId: z.string(),
        targetType: z.enum(['MODULE', 'TOPIC', 'CONCEPT']),
        targetId: z.string(),
        pageNumber: z.number().int().positive(),
        pageLabel: z.string().optional(),
        yOffset: z.number().optional(),
        sectionTitle: z.string().optional()
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const { curriculumDocumentId, targetType, targetId, pageNumber, pageLabel, yOffset, sectionTitle } = parsed.data;

      // Verify curriculum document exists and get volumeId
      const document = await prisma.curriculumDocument.findUnique({
        where: { id: curriculumDocumentId }
      });

      if (!document) {
        return res.status(404).json({ error: 'Curriculum document not found' });
      }

      // Verify target exists
      let target;
      switch (targetType) {
        case 'MODULE':
          target = await prisma.module.findUnique({ where: { id: targetId } });
          break;
        case 'TOPIC':
          target = await prisma.topic.findUnique({ where: { id: targetId } });
          break;
        case 'CONCEPT':
          target = await prisma.concept.findUnique({ where: { id: targetId } });
          break;
      }

      if (!target) {
        return res.status(404).json({ error: `${targetType} not found` });
      }

      // Create or update mapping
      const mapping = await prisma.pdfMapping.upsert({
        where: {
          volumeId_targetType_targetId: {
            volumeId: document.volumeId,
            targetType,
            targetId
          }
        },
        update: {
          curriculumDocumentId,
          pageNumber,
          pageLabel,
          yOffset: yOffset || 0,
          sectionTitle
        },
        create: {
          volumeId: document.volumeId,
          curriculumDocumentId,
          targetType,
          targetId,
          pageNumber,
          pageLabel,
          yOffset: yOffset || 0,
          sectionTitle
        }
      });

      return res.json({ success: true, mapping });
    } catch (error) {
      console.error('[Mapping Error]', error);
      return res.status(500).json({ error: 'Failed to create mapping' });
    }
  });

  // Get mapping for a specific target
  router.get('/mapping/:targetType/:targetId', async (req, res) => {
    try {
      const { targetType, targetId } = req.params;

      if (!['MODULE', 'TOPIC', 'CONCEPT'].includes(targetType)) {
        return res.status(400).json({ error: 'Invalid target type' });
      }

      // First get the target to find its volume
      let target;
      switch (targetType) {
        case 'MODULE':
          target = await prisma.module.findUnique({ 
            where: { id: targetId },
            select: { volumeId: true, name: true }
          });
          break;
        case 'TOPIC':
          target = await prisma.topic.findUnique({ 
            where: { id: targetId },
            include: { module: { select: { volumeId: true } } }
          });
          break;
        case 'CONCEPT':
          target = await prisma.concept.findUnique({ 
            where: { id: targetId },
            include: { topic: { include: { module: { select: { volumeId: true } } } } }
          });
          break;
      }

      if (!target) {
        return res.status(404).json({ error: `${targetType} not found` });
      }

      const volumeId = targetType === 'MODULE' ? target.volumeId : 
                      targetType === 'TOPIC' ? target.module.volumeId : 
                      target.topic.module.volumeId;

      const mapping = await prisma.pdfMapping.findUnique({
        where: {
          volumeId_targetType_targetId: {
            volumeId,
            targetType,
            targetId
          }
        },
        include: {
          curriculumDocument: {
            select: { id: true, filename: true }
          }
        }
      });

      if (!mapping) {
        return res.status(404).json({ error: 'No mapping found for this target' });
      }

      return res.json({
        mapping: {
          pageNumber: mapping.pageNumber,
          pageLabel: mapping.pageLabel,
          yOffset: mapping.yOffset,
          sectionTitle: mapping.sectionTitle,
          document: mapping.curriculumDocument
        }
      });
    } catch (error) {
      console.error('[Get Mapping Error]', error);
      return res.status(500).json({ error: 'Failed to fetch mapping' });
    }
  });

  // Get all mappings for a volume (for admin interface)
  router.get('/volume/:volumeId/mappings', requireAuth(), async (req, res) => {
    try {
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { volumeId } = req.params;

      const mappings = await prisma.pdfMapping.findMany({
        where: { volumeId },
        include: {
          curriculumDocument: {
            select: { id: true, filename: true }
          }
        },
        orderBy: { pageNumber: 'asc' }
      });

      // Get target details for each mapping
      const enrichedMappings = await Promise.all(mappings.map(async (mapping) => {
        let target = null;
        switch (mapping.targetType) {
          case 'MODULE':
            target = await prisma.module.findUnique({
              where: { id: mapping.targetId },
              select: { id: true, name: true }
            });
            break;
          case 'TOPIC':
            target = await prisma.topic.findUnique({
              where: { id: mapping.targetId },
              select: { id: true, name: true, module: { select: { name: true } } }
            });
            break;
          case 'CONCEPT':
            target = await prisma.concept.findUnique({
              where: { id: mapping.targetId },
              select: { id: true, name: true, topic: { select: { name: true, module: { select: { name: true } } } } }
            });
            break;
        }

        return {
          ...mapping,
          target
        };
      }));

      return res.json({ mappings: enrichedMappings });
    } catch (error) {
      console.error('[Get Mappings Error]', error);
      return res.status(500).json({ error: 'Failed to fetch mappings' });
    }
  });

  // Delete a mapping
  router.delete('/mapping/:mappingId', requireAuth(), async (req, res) => {
    try {
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { mappingId } = req.params;

      await prisma.pdfMapping.delete({
        where: { id: mappingId }
      });

      return res.json({ success: true });
    } catch (error) {
      console.error('[Delete Mapping Error]', error);
      return res.status(500).json({ error: 'Failed to delete mapping' });
    }
  });

  // Serve PDF files
  router.get('/file/:filename', async (req, res) => {
    try {
      const { filename } = req.params;
      const filePath = path.join(process.cwd(), 'uploads', 'curriculum-pdfs', filename);
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({ error: 'PDF file not found' });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

      // Stream the file
      const fileStream = require('fs').createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error('[Serve PDF Error]', error);
      return res.status(500).json({ error: 'Failed to serve PDF' });
    }
  });

  return router;
}
