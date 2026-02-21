import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const courses = await prisma.course.findMany({
    select: { id: true, level: true }
  });

  for (const course of courses) {
    const existingVolumes = await prisma.volume.findMany({
      where: { courseId: course.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true }
    });

    let defaultVolumeId = existingVolumes[0]?.id ?? null;

    if (!defaultVolumeId) {
      const created = await prisma.volume.create({
        data: {
          courseId: course.id,
          name: 'Volume 1',
          order: 1
        },
        select: { id: true }
      });
      defaultVolumeId = created.id;
    }

    await prisma.module.updateMany({
      where: { courseId: course.id, volumeId: null },
      data: { volumeId: defaultVolumeId }
    });

    let unassigned = await prisma.module.findFirst({
      where: { volumeId: defaultVolumeId, name: 'Unassigned' },
      select: { id: true }
    });

    if (!unassigned) {
      const max = await prisma.module.findFirst({
        where: { volumeId: defaultVolumeId },
        orderBy: [{ order: 'desc' }, { createdAt: 'desc' }],
        select: { order: true }
      });

      unassigned = await prisma.module.create({
        data: {
          name: 'Unassigned',
          level: course.level,
          courseId: course.id,
          volumeId: defaultVolumeId,
          order: (max?.order ?? 0) + 1
        },
        select: { id: true }
      });
    }

    await prisma.topic.updateMany({
      where: { courseId: course.id, moduleId: null },
      data: { moduleId: unassigned.id }
    });
  }

  const questions = await prisma.question.findMany({
    select: { id: true, topicId: true, courseId: true, volumeId: true, moduleId: true }
  });

  for (const q of questions) {
    if (q.courseId && q.volumeId && q.moduleId) continue;

    const topic = await prisma.topic.findUnique({
      where: { id: q.topicId },
      select: {
        moduleId: true,
        module: {
          select: {
            volumeId: true,
            volume: { select: { courseId: true } }
          }
        }
      }
    });

    const moduleId = topic?.moduleId ?? null;
    const volumeId = topic?.module?.volumeId ?? null;
    const courseId = topic?.module?.volume?.courseId ?? null;

    if (!moduleId || !volumeId || !courseId) continue;

    await prisma.question.update({
      where: { id: q.id },
      data: { moduleId, volumeId, courseId }
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
