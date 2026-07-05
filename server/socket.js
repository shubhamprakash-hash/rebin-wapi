const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('No token'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.tenantId = decoded.tenantId;
      next();
    } catch (e) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`tenant_${socket.tenantId}`);
  });

  return io;
}

function emitToTenant(tenantId, event, payload) {
  if (!io) return;
  io.to(`tenant_${tenantId}`).emit(event, payload);
}

module.exports = { initSocket, emitToTenant };
