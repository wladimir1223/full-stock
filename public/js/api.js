/**
 * api.js — Capa de comunicación con Full Stock backend.
 *
 * Auth (localStorage):
 *   fs_token       → JWT
 *   fs_expires     → expiración en ms (extraída del JWT)
 *   fs_email       → email del usuario
 *   fs_name        → nombre del negocio / tenant
 *   fs_slug        → tenant slug (usado en la URL pública de la API)
 *   fs_role        → rol del usuario ('tenant' | 'superadmin')
 *
 * Todos los requests a /admin/* y /api/v1/superadmin/* incluyen "Authorization: Bearer <jwt>".
 * Un 401 limpia la sesión y redirige al login automáticamente.
 */

// ─── Auth (gestión de sesión) ─────────────────────────────────────────────────

const Auth = {
  // Token
  getToken:  function() { return localStorage.getItem('fs_token'); },
  setToken:  function(t) {
    localStorage.setItem('fs_token', t);
    // Decodificar payload del JWT para extraer expiración y datos del tenant
    try {
      const parts = t.split('.');
      if (parts.length === 3) {
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const payload = JSON.parse(atob(b64));
        if (payload.exp)        localStorage.setItem('fs_expires', payload.exp * 1000);
        if (payload.email)      localStorage.setItem('fs_email',   payload.email);
        if (payload.name)       localStorage.setItem('fs_name',    payload.name);
        if (payload.tenantSlug) localStorage.setItem('fs_slug',    payload.tenantSlug);
        if (payload.role)       localStorage.setItem('fs_role',    payload.role);
      }
    } catch (_) {}
  },

  // Datos del tenant (leídos desde el JWT al hacer setToken)
  getEmail:       function() { return localStorage.getItem('fs_email')   || ''; },
  getName:        function() { return localStorage.getItem('fs_name')    || ''; },
  getTenantSlug:  function() { return localStorage.getItem('fs_slug')    || ''; },
  getRole:        function() { return localStorage.getItem('fs_role')    || 'tenant'; },

  // Compatibilidad: getUser devuelve el nombre del negocio
  getUser: function() { return this.getName(); },

  // Sesión
  isExpired:  function() {
    var exp = localStorage.getItem('fs_expires');
    return exp ? Date.now() > Number(exp) : true;
  },
  isLoggedIn: function() { return !!this.getToken() && !this.isExpired(); },
  clear: function() {
    ['fs_token', 'fs_expires', 'fs_email', 'fs_name', 'fs_slug', 'fs_role'].forEach(function(k) {
      localStorage.removeItem(k);
    });
  },
};

// ─── Request base ─────────────────────────────────────────────────────────────

async function request(method, endpoint, body, isFormData) {
  var headers = {};

  if (endpoint.startsWith('/admin') || endpoint.startsWith('/api/v1/superadmin')) {
    var token = Auth.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
  }

  if (!isFormData) headers['Content-Type'] = 'application/json';

  var opts = { method: method, headers: headers };
  if (body && !isFormData) opts.body = JSON.stringify(body);
  if (body && isFormData)  opts.body = body;

  var res  = await fetch(endpoint, opts);
  var json = await res.json();

  if (res.status === 401) {
    Auth.clear();
    if (window.App && window.App.showLogin) window.App.showLogin(json.message);
    throw json;
  }

  if (!res.ok) throw json;
  return json;
}

// ─── API ──────────────────────────────────────────────────────────────────────

var API = {
  auth: {
    register: function(name, email, password) {
      return request('POST', '/auth/register', { name: name, email: email, password: password });
    },
    login: function(email, password) {
      return request('POST', '/auth/login', { email: email, password: password });
    },
    // Logout es solo client-side (JWT stateless): limpiar localStorage
    logout: function() {
      Auth.clear();
      return Promise.resolve({ success: true });
    },
    // Solicitud de recuperación de contraseña
    recover: function(email) {
      return request('POST', '/auth/recover', { email: email });
    },
  },
  collections: {
    list:   function()        { return request('GET',    '/admin/collections'); },
    get:    function(slug)    { return request('GET',    '/admin/collections/' + slug); },
    create: function(payload) { return request('POST',   '/admin/collections', payload); },
    delete: function(slug)    { return request('DELETE', '/admin/collections/' + slug); },
  },
  items: {
    list:   function(slug)                { return request('GET',    '/admin/collections/' + slug + '/items'); },
    get:    function(slug, id)            { return request('GET',    '/admin/collections/' + slug + '/items/' + id); },
    create: function(slug, data)          { return request('POST',   '/admin/collections/' + slug + '/items', data); },
    update: function(slug, id, data)      { return request('PUT',    '/admin/collections/' + slug + '/items/' + id, data); },
    delete: function(slug, id)            { return request('DELETE', '/admin/collections/' + slug + '/items/' + id); },
    sell:   function(slug, id, quantity)  { return request('POST',   '/admin/collections/' + slug + '/items/' + id + '/sell', { quantity: quantity }); },
  },
  upload: function(formData) { return request('POST', '/admin/upload', formData, true); },
  superadmin: {
    logs: function(limit, tenant) {
      var url = '/api/v1/superadmin/logs?limit=' + (limit || 100);
      if (tenant) url += '&tenant=' + encodeURIComponent(tenant);
      return request('GET', url);
    },
    tenants: function() {
      return request('GET', '/api/v1/superadmin/tenants');
    },
    updatePlan: function(tenantId, plan) {
      return request('PUT', '/api/v1/superadmin/tenants/' + tenantId + '/plan', { plan: plan });
    },
  },
  settings: {
    get:    function()       { return request('GET', '/admin/settings'); },
    update: function(data)   { return request('PUT', '/admin/settings', data); },
  },
  planUsage: {
    get: function() { return request('GET', '/admin/plan-usage'); },
  },
};

window.API  = API;
window.Auth = Auth;
