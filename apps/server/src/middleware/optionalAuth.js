import jwt from 'jsonwebtoken';

export function optionalAuth() {
  return (req, _res, next) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return next();
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'dev_secret');
      req.user = { id: payload.sub, role: payload.role, level: payload.level };
    } catch {
      req.user = undefined;
    }
    return next();
  };
}
