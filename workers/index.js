// Cloudflare Worker Principal - API REST
import { SessionManager } from './session-manager.js';

export { SessionManager };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      // Router
      const path = url.pathname;
      
      // Health check
      if (path === '/health') {
        return jsonResponse({ status: 'ok', timestamp: Date.now() }, corsHeaders);
      }
      
      // Auth endpoints (públicos)
      if (path.startsWith('/api/auth')) {
        return handleAuth(request, env, path, corsHeaders);
      }
      
      // Verificar autenticación para endpoints protegidos
      const authHeader = request.headers.get('Authorization');
      let currentUser = null;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        currentUser = await verifyToken(token, env);
        
        if (!currentUser) {
          return jsonResponse({ error: 'Invalid or expired token' }, corsHeaders, 401);
        }
      }
      
      // Business endpoints (requieren auth)
      if (path.startsWith('/api/business')) {
        if (!currentUser) {
          return jsonResponse({ error: 'Authentication required' }, corsHeaders, 401);
        }
        return handleBusiness(request, env, path, corsHeaders, currentUser);
      }
      
      // Users endpoints (requieren auth)
      if (path.startsWith('/api/users')) {
        if (!currentUser) {
          return jsonResponse({ error: 'Authentication required' }, corsHeaders, 401);
        }
        return handleUsers(request, env, path, corsHeaders, currentUser);
      }
      
      // Sync endpoints (requieren auth)
      if (path.startsWith('/api/sync')) {
        if (!currentUser) {
          return jsonResponse({ error: 'Authentication required' }, corsHeaders, 401);
        }
        return handleSync(request, env, path, corsHeaders, currentUser);
      }
      
      // Backup endpoint (requiere auth)
      if (path.startsWith('/api/backup')) {
        if (!currentUser) {
          return jsonResponse({ error: 'Authentication required' }, corsHeaders, 401);
        }
        return handleBackup(request, env, path, corsHeaders, currentUser);
      }
      
      // Test cron endpoint (público para pruebas - REMOVER EN PRODUCCIÓN)
      if (path === '/api/test-cron' && request.method === 'GET') {
        console.log('🧪 Ejecutando prueba manual del cron...');
        
        // Ejecutar la misma lógica del scheduled
        try {
          await runScheduledBackup(env);
          return jsonResponse({ 
            success: true, 
            message: 'Backup cron ejecutado manualmente',
            timestamp: new Date().toISOString()
          }, corsHeaders);
        } catch (error) {
          return jsonResponse({ 
            success: false, 
            error: error.message 
          }, corsHeaders, 500);
        }
      }
      
      // WebSocket endpoint (requiere auth via query param)
      if (path === '/ws') {
        return handleWebSocket(request, env, corsHeaders);
      }
      
      return jsonResponse({ error: 'Not found' }, corsHeaders, 404);
      
    } catch (error) {
      console.error('Error:', error);
      return jsonResponse(
        { error: error.message || 'Internal server error' },
        corsHeaders,
        500
      );
    }
  },
  
  // Cron trigger para backup automático a las 10 PM hora de Ecuador (UTC-5)
  async scheduled(event, env, ctx) {
    console.log('🕙 Ejecutando backup automático programado...');
    await runScheduledBackup(env);
  }
};

// Función para ejecutar el backup programado (reutilizable)
async function runScheduledBackup(env) {
  try {
    // Obtener todos los negocios activos
    const businesses = await env.DB.prepare(`
      SELECT DISTINCT b.id, b.name, b.owner_user_id
      FROM businesses b
      INNER JOIN users u ON b.id = u.business_id
      WHERE u.is_active = 1
    `).all();
    
    console.log(`📊 Encontrados ${businesses.results?.length || 0} negocios activos`);
    
    for (const business of (businesses.results || [])) {
      try {
        console.log(`🔄 Procesando backup para: ${business.name}`);
        
        // Buscar credenciales de Telegram para este negocio
        const telegramCreds = await env.DB.prepare(`
          SELECT data FROM sync_data
          WHERE business_id = ? AND data_type = 'telegramCredentials' AND deleted = 0
          LIMIT 1
        `).bind(business.id).first();
        
        if (!telegramCreds) {
          console.log(`⚠️ No hay credenciales de Telegram para ${business.name}`);
          continue;
        }
        
        const creds = JSON.parse(telegramCreds.data);
        
        if (!creds.botToken || !creds.chatId) {
          console.log(`⚠️ Credenciales incompletas para ${business.name}`);
          continue;
        }
        
        console.log(`✅ Credenciales encontradas para ${business.name}`);
        
        // Obtener datos del negocio
        const syncData = await env.DB.prepare(`
          SELECT * FROM sync_data 
          WHERE business_id = ? AND deleted = 0
          ORDER BY data_type, created_at ASC
        `).bind(business.id).all();
        
        console.log(`📦 Datos obtenidos: ${syncData.results?.length || 0} registros`);
        
        // Agrupar datos
        const groupedData = {
          clients: [],
          sales: [],
          orders: [],
          expenses: [],
          prices: [],
          mermaRecords: [],
          diezmos: [],
          paymentHistory: [],
          config: []
        };
        
        for (const row of (syncData.results || [])) {
          const dataType = row.data_type;
          const data = JSON.parse(row.data);
          
          if (groupedData[dataType]) {
            groupedData[dataType].push(data);
          }
        }
        
        // Construir backup
        const backupData = {
          clients: groupedData.clients,
          sales: groupedData.sales,
          orders: groupedData.orders,
          expenses: groupedData.expenses,
          mermaPrices: groupedData.prices,
          mermaRecords: groupedData.mermaRecords,
          diezmosRecords: groupedData.diezmos,
          diezmosConfig: groupedData.config.find(c => c.key === 'diezmos') || { diezmoPercent: 10, ofrendaPercent: 5 },
          paymentHistory: groupedData.paymentHistory,
          creditosData: {
            creditSales: groupedData.sales.filter(s => !s.isPaid),
            paymentHistory: groupedData.sales.filter(s => s.paymentHistory && s.paymentHistory.length > 0)
          },
          config: groupedData.config.find(c => c.key === 'app') || {},
          telegramConfig: {
            botToken: creds.botToken,
            chatId: creds.chatId
          },
          metadata: {
            exportDate: new Date().toISOString(),
            version: '2.1',
            totalClients: groupedData.clients.length,
            totalSales: groupedData.sales.length,
            totalOrders: groupedData.orders.length,
            totalExpenses: groupedData.expenses.length,
            totalPayments: groupedData.paymentHistory.length,
            appName: 'GallOli',
            businessId: business.id,
            businessName: business.name,
            createdBy: 'server-cron'
          }
        };
        
        const dataStr = JSON.stringify(backupData, null, 2);
        const filename = `pollos_backup_${new Date().toISOString().split('T')[0]}_${Date.now()}.json`;
        
        console.log(`📤 Enviando backup a Telegram: ${filename}`);
        console.log(`📊 Tamaño: ${(new Blob([dataStr]).size / 1024).toFixed(2)} KB`);
        
        // Enviar a Telegram
        const formData = new FormData();
        formData.append('chat_id', creds.chatId);
        formData.append('document', new Blob([dataStr], { type: 'application/json' }), filename);
        formData.append('caption', 
          `📦 Backup Automático GallOli\n` +
          `🏢 ${business.name}\n` +
          `📅 ${new Date().toLocaleString('es-ES')}\n\n` +
          `📊 Estadísticas:\n` +
          `👥 Clientes: ${groupedData.clients.length}\n` +
          `💰 Ventas: ${groupedData.sales.length}\n` +
          `📋 Pedidos: ${groupedData.orders.length}\n` +
          `💸 Gastos: ${groupedData.expenses.length}\n` +
          `📦 Tamaño: ${(new Blob([dataStr]).size / 1024).toFixed(2)} KB`
        );
        
        const telegramResponse = await fetch(
          `https://api.telegram.org/bot${creds.botToken}/sendDocument`,
          {
            method: 'POST',
            body: formData
          }
        );
        
        const telegramResult = await telegramResponse.json();
        
        if (telegramResult.ok) {
          console.log(`✅ Backup enviado exitosamente para ${business.name}`);
          
          // Registrar backup exitoso
          await env.DB.prepare(`
            INSERT INTO sync_data (id, business_id, data_type, data, version, created_by, created_at, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            generateId(),
            business.id,
            'backupLog',
            JSON.stringify({
              filename,
              timestamp: Date.now(),
              success: true,
              method: 'cron'
            }),
            1,
            'server-cron',
            Date.now(),
            'server-cron',
            Date.now()
          ).run();
        } else {
          console.error(`❌ Error enviando backup para ${business.name}:`, telegramResult.description);
        }
        
      } catch (error) {
        console.error(`❌ Error procesando backup para ${business.name}:`, error);
        console.error('Stack:', error.stack);
      }
    }
    
    console.log('✅ Backup automático completado');
    
  } catch (error) {
    console.error('❌ Error en backup automático:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
}

// Helper functions
function jsonResponse(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

async function getRequestBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function generateId() {
  return crypto.randomUUID();
}

function generateToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Hash password usando Web Crypto API
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Crear JWT simple
async function createJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );
  
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${data}.${encodedSignature}`;
}

// Verificar JWT
async function verifyJWT(token, secret) {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    const data = `${encodedHeader}.${encodedPayload}`;
    
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const signature = Uint8Array.from(atob(encodedSignature), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      encoder.encode(data)
    );
    
    if (!valid) return null;
    
    const payload = JSON.parse(atob(encodedPayload));
    
    // Verificar expiración
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return null;
    }
    
    return payload;
  } catch {
    return null;
  }
}

// Verificar token y obtener usuario
async function verifyToken(token, env) {
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) return null;
  
  // Buscar usuario en DB
  const result = await env.DB.prepare(`
    SELECT u.*, b.name as business_name
    FROM users u
    LEFT JOIN businesses b ON u.business_id = b.id
    WHERE u.id = ? AND u.is_active = 1
  `).bind(payload.user_id).first();
  
  if (!result) return null;
  
  // Actualizar last_seen
  await env.DB.prepare(`
    UPDATE users SET last_seen = ? WHERE id = ?
  `).bind(Date.now(), result.id).run();
  
  return result;
}

// Auth handlers
async function handleAuth(request, env, path, corsHeaders) {
  try {
    const method = request.method;
    
    // POST /api/auth/telegram/init - Iniciar login con Telegram
    if (path === '/api/auth/telegram/init' && method === 'POST') {
      const { telegram_id, telegram_username, telegram_first_name } = await getRequestBody(request);
      
      if (!telegram_id) {
        return jsonResponse({ error: 'telegram_id required' }, corsHeaders, 400);
      }
      
      // Generar código de verificación de 6 dígitos
      const verification_code = Math.floor(100000 + Math.random() * 900000).toString();
      const expires_at = Date.now() + (5 * 60 * 1000); // 5 minutos
      
      // Guardar código en tabla temporal
      await env.DB.prepare(`
        INSERT OR REPLACE INTO verification_codes (telegram_id, code, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `).bind(telegram_id, verification_code, expires_at, Date.now()).run();
      
      // Enviar código via Telegram Bot (opcional)
      try {
        const botToken = env.TELEGRAM_BOT_TOKEN;
        const message = `🔐 Tu código de verificación para GallOli es: *${verification_code}*\n\nExpira en 5 minutos.`;
        
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegram_id,
            text: message,
            parse_mode: 'Markdown'
        })
      });
    } catch (error) {
      console.error('Error enviando mensaje Telegram:', error);
    }
    
    return jsonResponse({
      success: true,
      message: 'Código enviado a Telegram',
      expires_in: 300
    }, corsHeaders);
  }
  
  // POST /api/auth/telegram/verify - Verificar código y crear sesión
  if (path === '/api/auth/telegram/verify' && method === 'POST') {
    const { telegram_id, verification_code, telegram_username, telegram_first_name } = await getRequestBody(request);
    
    if (!telegram_id || !verification_code) {
      return jsonResponse({ error: 'Missing parameters' }, corsHeaders, 400);
    }
    
    // Verificar código
    const codeRecord = await env.DB.prepare(`
      SELECT * FROM verification_codes
      WHERE telegram_id = ? AND code = ? AND expires_at > ?
    `).bind(telegram_id, verification_code, Date.now()).first();
    
    if (!codeRecord) {
      return jsonResponse({ error: 'Código inválido o expirado' }, corsHeaders, 401);
    }
    
    // Eliminar código usado
    await env.DB.prepare(`
      DELETE FROM verification_codes WHERE telegram_id = ?
    `).bind(telegram_id).run();
    
    // Buscar usuario existente
    let user = await env.DB.prepare(`
      SELECT * FROM users WHERE telegram_id = ?
    `).bind(telegram_id).first();
    
    let business = null;
    
    if (user) {
      // Usuario existente
      business = await env.DB.prepare(`
        SELECT * FROM businesses WHERE id = ?
      `).bind(user.business_id).first();
      
      // Actualizar last_seen
      await env.DB.prepare(`
        UPDATE users SET last_seen = ? WHERE id = ?
      `).bind(Date.now(), user.id).run();
      
    } else {
      // Nuevo usuario - crear negocio y usuario
      const businessId = generateId();
      const userId = generateId();
      const userName = telegram_first_name || telegram_username || `Usuario ${telegram_id}`;
      
      // Crear negocio
      await env.DB.prepare(`
        INSERT INTO businesses (id, name, owner_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(businessId, `Negocio de ${userName}`, userId, Date.now(), Date.now()).run();
      
      // Crear usuario
      await env.DB.prepare(`
        INSERT INTO users (id, business_id, telegram_id, telegram_username, name, role, is_active, created_at, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        userId,
        businessId,
        telegram_id,
        telegram_username || null,
        userName,
        'super_admin',
        1,
        Date.now(),
        Date.now()
      ).run();
      
      user = {
        id: userId,
        business_id: businessId,
        telegram_id,
        telegram_username,
        name: userName,
        role: 'super_admin',
        is_active: 1
      };
      
      business = {
        id: businessId,
        name: `Negocio de ${userName}`,
        owner_user_id: userId
      };
    }
    
    // Crear JWT token
    const tokenPayload = {
      user_id: user.id,
      business_id: user.business_id,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 días
    };
    
    const token = await createJWT(tokenPayload, env.JWT_SECRET);
    
    // Guardar sesión
    const sessionId = generateId();
    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_activity)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      sessionId,
      user.id,
      await hashPassword(token),
      Date.now(),
      Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 días
      Date.now()
    ).run();
    
    return jsonResponse({
      token,
      user: {
        id: user.id,
        business_id: user.business_id,
        telegram_id: user.telegram_id,
        telegram_username: user.telegram_username,
        name: user.name,
        role: user.role
      },
      business: {
        id: business.id,
        name: business.name
      }
    }, corsHeaders);
  }
  
  // POST /api/auth/email/register - Registro con email
  if (path === '/api/auth/email/register' && method === 'POST') {
    const { email, password, name } = await getRequestBody(request);
    
    if (!email || !password || !name) {
      return jsonResponse({ error: 'Email, password y name requeridos' }, corsHeaders, 400);
    }
    
    // Verificar si email ya existe
    const existing = await env.DB.prepare(`
      SELECT id FROM users WHERE email = ?
    `).bind(email).first();
    
    if (existing) {
      return jsonResponse({ error: 'Email ya registrado' }, corsHeaders, 409);
    }
    
    // Crear negocio y usuario
    const businessId = generateId();
    const userId = generateId();
    const passwordHash = await hashPassword(password);
    
    await env.DB.prepare(`
      INSERT INTO businesses (id, name, owner_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(businessId, `Negocio de ${name}`, userId, Date.now(), Date.now()).run();
    
    await env.DB.prepare(`
      INSERT INTO users (id, business_id, email, password_hash, name, role, is_active, created_at, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      businessId,
      email,
      passwordHash,
      name,
      'super_admin',
      1,
      Date.now(),
      Date.now()
    ).run();
    
    // Crear token
    const tokenPayload = {
      user_id: userId,
      business_id: businessId,
      role: 'super_admin',
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
    };
    
    const token = await createJWT(tokenPayload, env.JWT_SECRET);
    
    // Guardar sesión
    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_activity)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      generateId(),
      userId,
      await hashPassword(token),
      Date.now(),
      Date.now() + (30 * 24 * 60 * 60 * 1000),
      Date.now()
    ).run();
    
    return jsonResponse({
      token,
      user: {
        id: userId,
        business_id: businessId,
        email,
        name,
        role: 'super_admin'
      },
      business: {
        id: businessId,
        name: `Negocio de ${name}`
      }
    }, corsHeaders);
  }
  
  // POST /api/auth/email/login - Login con email
  if (path === '/api/auth/email/login' && method === 'POST') {
    const { email, password } = await getRequestBody(request);
    
    if (!email || !password) {
      return jsonResponse({ error: 'Email y password requeridos' }, corsHeaders, 400);
    }
    
    // Buscar usuario
    const user = await env.DB.prepare(`
      SELECT * FROM users WHERE email = ? AND is_active = 1
    `).bind(email).first();
    
    if (!user) {
      return jsonResponse({ error: 'Credenciales inválidas' }, corsHeaders, 401);
    }
    
    // Verificar password
    const passwordHash = await hashPassword(password);
    if (passwordHash !== user.password_hash) {
      return jsonResponse({ error: 'Credenciales inválidas' }, corsHeaders, 401);
    }
    
    // Buscar negocio
    const business = await env.DB.prepare(`
      SELECT * FROM businesses WHERE id = ?
    `).bind(user.business_id).first();
    
    // Crear token
    const tokenPayload = {
      user_id: user.id,
      business_id: user.business_id,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
    };
    
    const token = await createJWT(tokenPayload, env.JWT_SECRET);
    
    // Guardar sesión
    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_activity)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      generateId(),
      user.id,
      await hashPassword(token),
      Date.now(),
      Date.now() + (30 * 24 * 60 * 60 * 1000),
      Date.now()
    ).run();
    
    // Actualizar last_seen
    await env.DB.prepare(`
      UPDATE users SET last_seen = ? WHERE id = ?
    `).bind(Date.now(), user.id).run();
    
    return jsonResponse({
      token,
      user: {
        id: user.id,
        business_id: user.business_id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      business: {
        id: business.id,
        name: business.name
      }
    }, corsHeaders);
  }
  
  // POST /api/auth/pin/set - Establecer PIN
  if (path === '/api/auth/pin/set' && method === 'POST') {
    const { user_id, pin } = await getRequestBody(request);
    
    if (!user_id || !pin || pin.length !== 4) {
      return jsonResponse({ error: 'user_id y PIN de 4 dígitos requeridos' }, corsHeaders, 400);
    }
    
    const pinHash = await hashPassword(pin);
    
    await env.DB.prepare(`
      UPDATE users SET pin_hash = ? WHERE id = ?
    `).bind(pinHash, user_id).run();
    
    return jsonResponse({ success: true }, corsHeaders);
  }
  
  // POST /api/auth/pin/login - Login con PIN
  if (path === '/api/auth/pin/login' && method === 'POST') {
    const { user_id, pin } = await getRequestBody(request);
    
    if (!user_id || !pin) {
      return jsonResponse({ error: 'user_id y PIN requeridos' }, corsHeaders, 400);
    }
    
    const user = await env.DB.prepare(`
      SELECT * FROM users WHERE id = ? AND is_active = 1
    `).bind(user_id).first();
    
    if (!user || !user.pin_hash) {
      return jsonResponse({ error: 'PIN no configurado' }, corsHeaders, 401);
    }
    
    const pinHash = await hashPassword(pin);
    if (pinHash !== user.pin_hash) {
      return jsonResponse({ error: 'PIN incorrecto' }, corsHeaders, 401);
    }
    
    // Crear token
    const tokenPayload = {
      user_id: user.id,
      business_id: user.business_id,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
    };
    
    const token = await createJWT(tokenPayload, env.JWT_SECRET);
    
    // Guardar sesión
    await env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_activity)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      generateId(),
      user.id,
      await hashPassword(token),
      Date.now(),
      Date.now() + (30 * 24 * 60 * 60 * 1000),
      Date.now()
    ).run();
    
    return jsonResponse({
      token,
      user: {
        id: user.id,
        business_id: user.business_id,
        name: user.name,
        role: user.role
      }
    }, corsHeaders);
  }
  
  // POST /api/auth/refresh - Refrescar token
  if (path === '/api/auth/refresh' && method === 'POST') {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Token requerido' }, corsHeaders, 401);
    }
    
    const token = authHeader.substring(7);
    const user = await verifyToken(token, env);
    
    if (!user) {
      return jsonResponse({ error: 'Token inválido' }, corsHeaders, 401);
    }
    
    // Crear nuevo token
    const tokenPayload = {
      user_id: user.id,
      business_id: user.business_id,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
    };
    
    const newToken = await createJWT(tokenPayload, env.JWT_SECRET);
    
    return jsonResponse({ token: newToken }, corsHeaders);
  }
  
  // POST /api/auth/logout - Cerrar sesión
  if (path === '/api/auth/logout' && method === 'POST') {
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const tokenHash = await hashPassword(token);
      
      // Eliminar sesión
      await env.DB.prepare(`
        DELETE FROM sessions WHERE token_hash = ?
      `).bind(tokenHash).run();
    }
    
    return jsonResponse({ success: true }, corsHeaders);
  }
  
  return jsonResponse({ error: 'Not found' }, corsHeaders, 404);
  
  } catch (error) {
    console.error('Error in handleAuth:', error);
    return jsonResponse({ error: error.message || 'Internal server error' }, corsHeaders, 500);
  }
}

// Business handlers
async function handleBusiness(request, env, path, corsHeaders, currentUser) {
  const method = request.method;
  
  // GET /api/business - Obtener negocio actual
  if (path === '/api/business' && method === 'GET') {
    const business = await env.DB.prepare(`
      SELECT * FROM businesses WHERE id = ?
    `).bind(currentUser.business_id).first();
    
    if (!business) {
      return jsonResponse({ error: 'Negocio no encontrado' }, corsHeaders, 404);
    }
    
    return jsonResponse({ business }, corsHeaders);
  }
  
  // PUT /api/business - Actualizar negocio
  if (path === '/api/business' && method === 'PUT') {
    // Verificar permisos
    if (!['super_admin', 'admin'].includes(currentUser.role)) {
      return jsonResponse({ error: 'Sin permisos' }, corsHeaders, 403);
    }
    
    const { name, settings } = await getRequestBody(request);
    
    await env.DB.prepare(`
      UPDATE businesses 
      SET name = COALESCE(?, name),
          settings = COALESCE(?, settings),
          updated_at = ?
      WHERE id = ?
    `).bind(
      name || null,
      settings ? JSON.stringify(settings) : null,
      Date.now(),
      currentUser.business_id
    ).run();
    
    const business = await env.DB.prepare(`
      SELECT * FROM businesses WHERE id = ?
    `).bind(currentUser.business_id).first();
    
    return jsonResponse({ business }, corsHeaders);
  }
  
  // POST /api/business/invitation - Crear código de invitación
  if (path === '/api/business/invitation' && method === 'POST') {
    // Verificar permisos
    if (!['super_admin', 'admin'].includes(currentUser.role)) {
      return jsonResponse({ error: 'Sin permisos' }, corsHeaders, 403);
    }
    
    const { role, max_uses, expires_in_hours } = await getRequestBody(request);
    
    if (!role) {
      return jsonResponse({ error: 'role requerido' }, corsHeaders, 400);
    }
    
    // Generar código único de 8 caracteres
    const code = generateToken().substring(0, 8).toUpperCase();
    const expiresAt = expires_in_hours 
      ? Date.now() + (expires_in_hours * 60 * 60 * 1000)
      : null;
    
    await env.DB.prepare(`
      INSERT INTO invitation_codes (code, business_id, created_by, role, max_uses, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      code,
      currentUser.business_id,
      currentUser.id,
      role,
      max_uses || 1,
      expiresAt,
      Date.now()
    ).run();
    
    return jsonResponse({
      code,
      role,
      max_uses: max_uses || 1,
      expires_at: expiresAt
    }, corsHeaders);
  }
  
  // POST /api/business/join - Unirse con código de invitación
  if (path === '/api/business/join' && method === 'POST') {
    const { code } = await getRequestBody(request);
    
    if (!code) {
      return jsonResponse({ error: 'code requerido' }, corsHeaders, 400);
    }
    
    // Buscar código
    const invitation = await env.DB.prepare(`
      SELECT * FROM invitation_codes 
      WHERE code = ? AND is_active = 1
    `).bind(code.toUpperCase()).first();
    
    if (!invitation) {
      return jsonResponse({ error: 'Código inválido' }, corsHeaders, 404);
    }
    
    // Verificar expiración
    if (invitation.expires_at && invitation.expires_at < Date.now()) {
      return jsonResponse({ error: 'Código expirado' }, corsHeaders, 410);
    }
    
    // Verificar usos
    if (invitation.uses >= invitation.max_uses) {
      return jsonResponse({ error: 'Código agotado' }, corsHeaders, 410);
    }
    
    // Actualizar usuario
    await env.DB.prepare(`
      UPDATE users 
      SET business_id = ?, role = ?
      WHERE id = ?
    `).bind(invitation.business_id, invitation.role, currentUser.id).run();
    
    // Incrementar usos
    await env.DB.prepare(`
      UPDATE invitation_codes 
      SET uses = uses + 1
      WHERE code = ?
    `).bind(code.toUpperCase()).run();
    
    // Obtener negocio
    const business = await env.DB.prepare(`
      SELECT * FROM businesses WHERE id = ?
    `).bind(invitation.business_id).first();
    
    return jsonResponse({
      success: true,
      business,
      role: invitation.role
    }, corsHeaders);
  }
  
  return jsonResponse({ error: 'Not found' }, corsHeaders, 404);
}

// Users handlers
async function handleUsers(request, env, path, corsHeaders, currentUser) {
  const method = request.method;
  
  // GET /api/users - Listar usuarios del negocio
  if (path === '/api/users' && method === 'GET') {
    const users = await env.DB.prepare(`
      SELECT id, business_id, telegram_id, telegram_username, email, name, role, created_at, last_seen, is_active
      FROM users 
      WHERE business_id = ?
      ORDER BY created_at DESC
    `).bind(currentUser.business_id).all();
    
    return jsonResponse({ users: users.results || [] }, corsHeaders);
  }
  
  // GET /api/users/online - Usuarios online
  if (path === '/api/users/online' && method === 'GET') {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    
    const users = await env.DB.prepare(`
      SELECT id, name, role, last_seen
      FROM users 
      WHERE business_id = ? AND last_seen > ? AND is_active = 1
      ORDER BY last_seen DESC
    `).bind(currentUser.business_id, fiveMinutesAgo).all();
    
    return jsonResponse({ users: users.results || [] }, corsHeaders);
  }
  
  // GET /api/users/:id - Obtener usuario específico
  if (path.match(/^\/api\/users\/[^\/]+$/) && method === 'GET') {
    const userId = path.split('/').pop();
    
    const user = await env.DB.prepare(`
      SELECT id, business_id, telegram_id, telegram_username, email, name, role, created_at, last_seen, is_active
      FROM users 
      WHERE id = ? AND business_id = ?
    `).bind(userId, currentUser.business_id).first();
    
    if (!user) {
      return jsonResponse({ error: 'Usuario no encontrado' }, corsHeaders, 404);
    }
    
    return jsonResponse({ user }, corsHeaders);
  }
  
  // PUT /api/users/:id - Actualizar usuario
  if (path.match(/^\/api\/users\/[^\/]+$/) && method === 'PUT') {
    const userId = path.split('/').pop();
    
    // Verificar permisos
    if (!['super_admin', 'admin'].includes(currentUser.role)) {
      return jsonResponse({ error: 'Sin permisos' }, corsHeaders, 403);
    }
    
    const { name, role, is_active } = await getRequestBody(request);
    
    // Verificar que el usuario pertenece al mismo negocio
    const targetUser = await env.DB.prepare(`
      SELECT * FROM users WHERE id = ? AND business_id = ?
    `).bind(userId, currentUser.business_id).first();
    
    if (!targetUser) {
      return jsonResponse({ error: 'Usuario no encontrado' }, corsHeaders, 404);
    }
    
    // No permitir que admin modifique super_admin
    if (targetUser.role === 'super_admin' && currentUser.role !== 'super_admin') {
      return jsonResponse({ error: 'Sin permisos' }, corsHeaders, 403);
    }
    
    await env.DB.prepare(`
      UPDATE users 
      SET name = COALESCE(?, name),
          role = COALESCE(?, role),
          is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).bind(
      name || null,
      role || null,
      is_active !== undefined ? is_active : null,
      userId
    ).run();
    
    const user = await env.DB.prepare(`
      SELECT id, business_id, telegram_id, telegram_username, email, name, role, created_at, last_seen, is_active
      FROM users WHERE id = ?
    `).bind(userId).first();
    
    return jsonResponse({ user }, corsHeaders);
  }
  
  // DELETE /api/users/:id - Desactivar usuario
  if (path.match(/^\/api\/users\/[^\/]+$/) && method === 'DELETE') {
    const userId = path.split('/').pop();
    
    // Verificar permisos
    if (!['super_admin', 'admin'].includes(currentUser.role)) {
      return jsonResponse({ error: 'Sin permisos' }, corsHeaders, 403);
    }
    
    // Verificar que el usuario pertenece al mismo negocio
    const targetUser = await env.DB.prepare(`
      SELECT * FROM users WHERE id = ? AND business_id = ?
    `).bind(userId, currentUser.business_id).first();
    
    if (!targetUser) {
      return jsonResponse({ error: 'Usuario no encontrado' }, corsHeaders, 404);
    }
    
    // No permitir eliminar super_admin
    if (targetUser.role === 'super_admin') {
      return jsonResponse({ error: 'No se puede eliminar super_admin' }, corsHeaders, 403);
    }
    
    // No permitir auto-eliminación
    if (userId === currentUser.id) {
      return jsonResponse({ error: 'No puedes eliminarte a ti mismo' }, corsHeaders, 403);
    }
    
    // Desactivar usuario
    await env.DB.prepare(`
      UPDATE users SET is_active = 0 WHERE id = ?
    `).bind(userId).run();
    
    // Eliminar sesiones
    await env.DB.prepare(`
      DELETE FROM sessions WHERE user_id = ?
    `).bind(userId).run();
    
    return jsonResponse({ success: true }, corsHeaders);
  }
  
  return jsonResponse({ error: 'Not found' }, corsHeaders, 404);
}

// Sync handlers
async function handleSync(request, env, path, corsHeaders, currentUser) {
  const method = request.method;
  
  // POST /api/sync/push - Subir cambios locales
  if (path === '/api/sync/push' && method === 'POST') {
    const { changes } = await getRequestBody(request);
    
    if (!changes || !Array.isArray(changes)) {
      return jsonResponse({ error: 'changes array requerido' }, corsHeaders, 400);
    }
    
    const results = [];
    
    for (const change of changes) {
      const { data_type, data_id, action, data } = change;
      
      if (!data_type || !data_id || !action) {
        results.push({ error: 'Campos requeridos faltantes', change });
        continue;
      }
      
      try {
        // Registrar cambio
        const changeId = generateId();
        await env.DB.prepare(`
          INSERT INTO changes (id, business_id, user_id, data_type, data_id, action, changes, timestamp, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          changeId,
          currentUser.business_id,
          currentUser.id,
          data_type,
          data_id,
          action,
          JSON.stringify(change),
          Date.now(),
          1
        ).run();
        
        // Actualizar o crear en sync_data
        if (action === 'delete') {
          // Buscar por data_type y el ID dentro del JSON data
          const existing = await env.DB.prepare(`
            SELECT id FROM sync_data 
            WHERE business_id = ? AND data_type = ? AND json_extract(data, '$.id') = ? AND deleted = 0
          `).bind(currentUser.business_id, data_type, data_id).first();
          
          if (existing) {
            await env.DB.prepare(`
              UPDATE sync_data 
              SET deleted = 1, deleted_at = ?, updated_by = ?, updated_at = ?
              WHERE id = ? AND business_id = ?
            `).bind(Date.now(), currentUser.id, Date.now(), existing.id, currentUser.business_id).run();
            console.log(`🗑️ Marcado como eliminado: ${data_type}/${data_id}`);
          } else {
            console.warn(`⚠️ No se encontró ${data_type}/${data_id} para eliminar`);
          }
        } else {
          const existing = await env.DB.prepare(`
            SELECT version FROM sync_data WHERE id = ? AND business_id = ?
          `).bind(data_id, currentUser.business_id).first();
          
          const newVersion = existing ? existing.version + 1 : 1;
          
          if (existing) {
            await env.DB.prepare(`
              UPDATE sync_data 
              SET data = ?, version = ?, updated_by = ?, updated_at = ?
              WHERE id = ? AND business_id = ?
            `).bind(
              JSON.stringify(data),
              newVersion,
              currentUser.id,
              Date.now(),
              data_id,
              currentUser.business_id
            ).run();
          } else {
            await env.DB.prepare(`
              INSERT INTO sync_data (id, business_id, data_type, data, version, created_by, created_at, updated_by, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              data_id,
              currentUser.business_id,
              data_type,
              JSON.stringify(data),
              newVersion,
              currentUser.id,
              Date.now(),
              currentUser.id,
              Date.now()
            ).run();
          }
        }
        
        results.push({ success: true, change_id: changeId, data_id });
        
        // Notificar via WebSocket a otros usuarios
        try {
          const id = env.SESSION_MANAGER.idFromName(currentUser.business_id);
          const stub = env.SESSION_MANAGER.get(id);
          await stub.fetch(new Request('https://dummy/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                type: 'change',
                from: currentUser.id,
                data: {
                  data_type: data_type,
                  action: action,
                  timestamp: Date.now()
                }
              }
            })
          }));
        } catch (wsError) {
          console.error('Error notificando via WebSocket:', wsError);
        }
        
      } catch (error) {
        results.push({ error: error.message, change });
      }
    }
    
    return jsonResponse({ results }, corsHeaders);
  }
  
  // GET /api/sync/pull - Descargar cambios remotos
  if (path === '/api/sync/pull' && method === 'GET') {
    const url = new URL(request.url);
    const since = parseInt(url.searchParams.get('since') || '0');
    const data_type = url.searchParams.get('data_type');
    
    let query = `
      SELECT * FROM sync_data 
      WHERE business_id = ? AND updated_at > ?
    `;
    const params = [currentUser.business_id, since];
    
    if (data_type) {
      query += ` AND data_type = ?`;
      params.push(data_type);
    }
    
    query += ` ORDER BY updated_at ASC LIMIT 1000`;
    
    const result = await env.DB.prepare(query).bind(...params).all();
    
    const data = (result.results || []).map(row => ({
      id: row.id,
      data_type: row.data_type,
      data: JSON.parse(row.data),
      version: row.version,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
      deleted: row.deleted === 1
    }));
    
    return jsonResponse({
      data,
      timestamp: Date.now(),
      has_more: data.length === 1000
    }, corsHeaders);
  }
  
  // GET /api/sync/full - Sincronización completa
  if (path === '/api/sync/full' && method === 'GET') {
    const url = new URL(request.url);
    const data_type = url.searchParams.get('data_type');
    
    let query = `
      SELECT * FROM sync_data 
      WHERE business_id = ? AND deleted = 0
    `;
    const params = [currentUser.business_id];
    
    if (data_type) {
      query += ` AND data_type = ?`;
      params.push(data_type);
    }
    
    query += ` ORDER BY created_at ASC`;
    
    const result = await env.DB.prepare(query).bind(...params).all();
    
    const data = (result.results || []).map(row => ({
      id: row.id,
      data_type: row.data_type,
      data: JSON.parse(row.data),
      version: row.version,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
    
    return jsonResponse({
      data,
      timestamp: Date.now(),
      total: data.length
    }, corsHeaders);
  }
  
  // POST /api/sync/cleanup-duplicates - Limpiar duplicados del servidor
  if (path === '/api/sync/cleanup-duplicates' && method === 'POST') {
    try {
      console.log('🧹 Iniciando limpieza de duplicados...');
      
      // Obtener todos los datos del negocio
      const allData = await env.DB.prepare(`
        SELECT id, data_type, data, updated_at FROM sync_data 
        WHERE business_id = ? AND deleted = 0
        ORDER BY data_type, updated_at DESC
      `).bind(currentUser.business_id).all();
      
      const seenIds = new Map(); // Map<dataType_dataId, sync_data.id>
      const duplicatesToDelete = [];
      
      // Detectar duplicados por data.id (no sync_data.id)
      for (const row of allData.results || []) {
        const dataType = row.data_type;
        const parsedData = JSON.parse(row.data);
        
        // Obtener el ID del dato (no el ID de sync_data)
        let dataId = parsedData.id || parsedData.key || parsedData.date;
        if (!dataId) continue;
        
        const key = `${dataType}_${dataId}`;
        
        // Si ya vimos este data.id, es un duplicado
        if (seenIds.has(key)) {
          // Este es un duplicado - marcarlo para eliminar
          duplicatesToDelete.push(row.id); // Eliminar por sync_data.id
        } else {
          // Primera vez que vemos este data.id - guardarlo
          seenIds.set(key, row.id);
        }
      }
      
      // Eliminar duplicados de sync_data
      let deletedCount = 0;
      for (const syncDataId of duplicatesToDelete) {
        await env.DB.prepare(`
          DELETE FROM sync_data 
          WHERE id = ? AND business_id = ?
        `).bind(syncDataId, currentUser.business_id).run();
        deletedCount++;
      }
      
      console.log(`✅ Limpieza completada: ${deletedCount} duplicados eliminados`);
      
      return jsonResponse({
        success: true,
        duplicates_deleted: deletedCount,
        message: `${deletedCount} duplicados eliminados del servidor`
      }, corsHeaders);
      
    } catch (error) {
      console.error('Error limpiando duplicados:', error);
      return jsonResponse({ error: error.message }, corsHeaders, 500);
    }
  }
  
  return jsonResponse({ error: 'Not found' }, corsHeaders, 404);
}

// Backup handlers
async function handleBackup(request, env, path, corsHeaders, currentUser) {
  const method = request.method;
  
  // POST /api/backup/create - Crear y enviar backup automático
  if (path === '/api/backup/create' && method === 'POST') {
    try {
      const { telegram_bot_token, telegram_chat_id } = await getRequestBody(request);
      
      if (!telegram_bot_token || !telegram_chat_id) {
        return jsonResponse({ error: 'telegram_bot_token y telegram_chat_id requeridos' }, corsHeaders, 400);
      }
      
      // Obtener TODOS los datos del negocio desde la base de datos
      const syncData = await env.DB.prepare(`
        SELECT * FROM sync_data 
        WHERE business_id = ? AND deleted = 0
        ORDER BY data_type, created_at ASC
      `).bind(currentUser.business_id).all();
      
      // Agrupar datos por tipo
      const groupedData = {
        clients: [],
        sales: [],
        orders: [],
        expenses: [],
        prices: [],
        mermaRecords: [],
        diezmos: [],
        paymentHistory: [],
        config: [],
        telegramCredentials: []
      };
      
      for (const row of (syncData.results || [])) {
        const dataType = row.data_type;
        const data = JSON.parse(row.data);
        
        if (groupedData[dataType]) {
          groupedData[dataType].push(data);
        }
      }
      
      // Construir backup completo
      const backupData = {
        clients: groupedData.clients,
        sales: groupedData.sales,
        orders: groupedData.orders,
        expenses: groupedData.expenses,
        
        // Merma completa
        mermaPrices: groupedData.prices,
        mermaRecords: groupedData.mermaRecords,
        
        // Diezmos completos
        diezmosRecords: groupedData.diezmos,
        diezmosConfig: groupedData.config.find(c => c.key === 'diezmos') || { diezmoPercent: 10, ofrendaPercent: 5 },
        
        // Historial de pagos (construido desde sales)
        paymentHistory: groupedData.paymentHistory,
        
        // Créditos
        creditosData: {
          creditSales: groupedData.sales.filter(s => !s.isPaid),
          paymentHistory: groupedData.sales.filter(s => s.paymentHistory && s.paymentHistory.length > 0)
        },
        
        // Configuración completa
        config: groupedData.config.find(c => c.key === 'app') || {},
        
        // Configuración de Telegram
        telegramConfig: {
          botToken: telegram_bot_token,
          chatId: telegram_chat_id
        },
        
        // Metadatos
        metadata: {
          exportDate: new Date().toISOString(),
          version: '2.1',
          totalClients: groupedData.clients.length,
          totalSales: groupedData.sales.length,
          totalOrders: groupedData.orders.length,
          totalExpenses: groupedData.expenses.length,
          totalPayments: groupedData.paymentHistory.length,
          appName: 'GallOli',
          businessId: currentUser.business_id,
          createdBy: 'server'
        }
      };
      
      // Generar archivo JSON
      const dataStr = JSON.stringify(backupData, null, 2);
      const filename = `pollos_backup_${new Date().toISOString().split('T')[0]}_${Date.now()}.json`;
      
      // Preparar estadísticas para el mensaje
      const stats = {
        totalClients: groupedData.clients.length,
        totalSales: groupedData.sales.length,
        totalOrders: groupedData.orders.length,
        totalExpenses: groupedData.expenses.length,
        totalSize: (new Blob([dataStr]).size / 1024).toFixed(2) + ' KB'
      };
      
      // Enviar a Telegram
      const formData = new FormData();
      formData.append('chat_id', telegram_chat_id);
      formData.append('document', new Blob([dataStr], { type: 'application/json' }), filename);
      formData.append('caption', 
        `📦 Backup Automático GallOli (Servidor)\n` +
        `📅 ${new Date().toLocaleString('es-ES')}\n\n` +
        `📊 Estadísticas:\n` +
        `👥 Clientes: ${stats.totalClients}\n` +
        `💰 Ventas: ${stats.totalSales}\n` +
        `📋 Pedidos: ${stats.totalOrders}\n` +
        `💸 Gastos: ${stats.totalExpenses}\n` +
        `📦 Tamaño: ${stats.totalSize}`
      );
      
      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${telegram_bot_token}/sendDocument`,
        {
          method: 'POST',
          body: formData
        }
      );
      
      const telegramResult = await telegramResponse.json();
      
      if (!telegramResult.ok) {
        throw new Error(telegramResult.description || 'Error enviando a Telegram');
      }
      
      // Registrar backup en la base de datos
      await env.DB.prepare(`
        INSERT INTO sync_data (id, business_id, data_type, data, version, created_by, created_at, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        generateId(),
        currentUser.business_id,
        'backupLog',
        JSON.stringify({
          filename,
          timestamp: Date.now(),
          stats,
          success: true
        }),
        1,
        'server',
        Date.now(),
        'server',
        Date.now()
      ).run();
      
      return jsonResponse({
        success: true,
        filename,
        stats,
        telegram_message_id: telegramResult.result.message_id
      }, corsHeaders);
      
    } catch (error) {
      console.error('Error creando backup:', error);
      return jsonResponse({ error: error.message || 'Error creando backup' }, corsHeaders, 500);
    }
  }
  
  return jsonResponse({ error: 'Not found' }, corsHeaders, 404);
}

// WebSocket handler
async function handleWebSocket(request, env, corsHeaders) {
  const upgradeHeader = request.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }
  
  // Get business ID from query params
  const url = new URL(request.url);
  const businessId = url.searchParams.get('business_id');
  
  if (!businessId) {
    return new Response('business_id required', { status: 400 });
  }
  
  // Get Durable Object
  const id = env.SESSION_MANAGER.idFromName(businessId);
  const stub = env.SESSION_MANAGER.get(id);
  
  return stub.fetch(request);
}
