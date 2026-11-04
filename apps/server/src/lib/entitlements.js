export async function getAccessibleCourseIds(prisma, user) {
  if (!user) return [];
  if (user.role === 'ADMIN') return null;
  const rows = await prisma.enrollment.findMany({
    where: {
      userId: user.id,
      status: { not: 'CANCELLED' },
      course: { active: true }
    },
    select: { courseId: true }
  });
  return [...new Set(rows.map(row => row.courseId).filter(Boolean))];
}

export async function canAccessCourse(prisma, user, courseId) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (!courseId) return false;
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
    select: { id: true, status: true, course: { select: { active: true } } }
  });
  if (!enrollment) return false;
  if (enrollment.status === 'CANCELLED') return false;
  if (enrollment.course && enrollment.course.active === false) return false;
  return true;
}

export async function hasActiveCourseAccess(prisma, userId, courseId) {
  if (!userId || !courseId) return false;
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId, courseId, status: { not: 'CANCELLED' }, course: { active: true } },
    select: { id: true }
  });
  return Boolean(enrollment);
}
