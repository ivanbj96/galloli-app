// Durable Object para gestión de sesiones y WebSocket
export class SessionManager {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // userId -> WebSocket
    this.presence = new Map(); // userId -> { name, role, lastSeen }
  }

  async fetch(request) {
    const url = new URL(request.url);
    
    // WebSocket endpoint
    if (url.pathname === '/ws' || request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request);
    }
    
    // Get presence
    if (url.pathname === '/presence') {
      return this.getPresence();
    }
    
    // Broadcast message
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      return this.broadcast(request);
    }
    
    return new Response('Not found', { status: 404 });
  }

  async handleWebSocket(request) {
    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    
    // Get user info from query params
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    const userName = url.searchParams.get('user_name') || 'Usuario';
    const userRole = url.searchParams.get('user_role') || 'viewer';
    
    if (!userId) {
      return new Response('user_id required', { status: 400 });
    }
    
    // Accept WebSocket
    server.accept();
    
    // Store session
    this.sessions.set(userId, server);
    this.updatePresence(userId, {
      name: userName,
      role: userRole,
      status: 'online',
      lastSeen: Date.now()
    });
    
    // Send welcome message
    server.send(JSON.stringify({
      type: 'connected',
      userId: userId,
      timestamp: Date.now()
    }));
    
    // Broadcast presence update
    this.broadcastPresence();
    
    // Handle messages
    server.addEventListener('message', async (event) => {
      try {
        const message = JSON.parse(event.data);
        await this.handleMessage(userId, message, server);
      } catch (error) {
        console.error('Error handling message:', error);
        server.send(JSON.stringify({
          type: 'error',
          error: error.message
        }));
      }
    });
    
    // Handle close
    server.addEventListener('close', () => {
      this.sessions.delete(userId);
      this.updatePresence(userId, {
        status: 'offline',
        lastSeen: Date.now()
      });
      this.broadcastPresence();
    });
    
    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async handleMessage(userId, message, ws) {
    console.log('📨 Mensaje recibido de', userId, ':', message.type);
    
    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
        
      case 'change':
        console.log('🔄 Broadcasting cambio:', message.data?.data_type);
        await this.broadcastChange(userId, message.data);
        break;
        
      case 'presence':
        this.updatePresence(userId, {
          status: message.status,
          lastSeen: Date.now()
        });
        this.broadcastPresence();
        break;
        
      case 'p2p-signal':
        await this.relayP2PSignal(userId, message);
        break;
        
      default:
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Unknown message type'
        }));
    }
  }

  async broadcastChange(fromUserId, change) {
    const message = JSON.stringify({
      type: 'change',
      from: fromUserId,
      data: change,
      timestamp: Date.now()
    });
    
    console.log('📢 Broadcasting a', this.sessions.size, 'usuarios');
    
    // Send to all connected users except sender
    let sent = 0;
    for (const [userId, ws] of this.sessions) {
      if (userId !== fromUserId && ws.readyState === 1) {
        try {
          ws.send(message);
          sent++;
          console.log('✅ Enviado a', userId);
        } catch (error) {
          console.error('❌ Error enviando a', userId, error);
        }
      }
    }
    
    console.log(`📊 Mensaje enviado a ${sent} de ${this.sessions.size - 1} usuarios`);
  }

  updatePresence(userId, data) {
    const current = this.presence.get(userId) || {};
    this.presence.set(userId, {
      ...current,
      ...data,
      lastSeen: Date.now()
    });
  }

  broadcastPresence() {
    const users = Array.from(this.presence.entries()).map(([id, data]) => ({
      id,
      ...data
    }));
    
    const message = JSON.stringify({
      type: 'presence',
      users: users,
      timestamp: Date.now()
    });
    
    for (const ws of this.sessions.values()) {
      if (ws.readyState === 1) {
        try {
          ws.send(message);
        } catch (error) {
          console.error('Error broadcasting presence:', error);
        }
      }
    }
  }

  async relayP2PSignal(fromUserId, message) {
    const toUserId = message.to;
    const ws = this.sessions.get(toUserId);
    
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'p2p-signal',
        from: fromUserId,
        signal: message.signal,
        timestamp: Date.now()
      }));
    }
  }

  async getPresence() {
    const users = Array.from(this.presence.entries()).map(([id, data]) => ({
      id,
      ...data
    }));
    
    return new Response(JSON.stringify({
      users,
      count: users.length,
      timestamp: Date.now()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async broadcast(request) {
    const { message } = await request.json();
    
    console.log('📢 Broadcast request:', message.type, message.data?.data_type);
    
    const data = JSON.stringify({
      type: message.type || 'broadcast',
      from: message.from,
      data: message.data,
      timestamp: Date.now()
    });
    
    let sent = 0;
    for (const [userId, ws] of this.sessions) {
      // No enviar al usuario que originó el cambio
      if (userId !== message.from && ws.readyState === 1) {
        try {
          ws.send(data);
          sent++;
        } catch (error) {
          console.error('Error broadcasting to', userId, error);
        }
      }
    }
    
    console.log(`✅ Broadcast enviado a ${sent} usuarios`);
    
    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
