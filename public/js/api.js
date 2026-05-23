/**
 * api.js - Capa de comunicacion con el servidor Express.
 * Envia el Bearer token en cada request a rutas /admin/*.
 * Si el servidor responde 401, redirige al login automaticamente.
 */

const BASE = '';

// Gestion del token en localStorage
const Auth = {
  getToken:  function() { return localStorage.getItem('fs_token'); },
  setToken:  function(t) { localStorage.setItem('fs_token', t); },
  getUser:   function() { return localStorage.getItem('fs_user'); },
  setUser:   function(u) { localStorage.setItem('fs_user', u); },
  clear:     function() { localStorage.removeItem('fs_token'); localStorage.removeItem('fs_user'); localStorage.removeItem('fs_expires'); },
  setExpiry: function(ts) { localStorage.setItem('fs_expires', ts); },
  isExpired: function() {
    var exp = localStorage.getItem('fs_expires');
    return exp ? Date.now() > Number(exp) : true;
  },
  isLoggedIn: function() { return !!this.getToken() && !this.isExpired(); },
};

async function request(method, endpoint, body, isFormData) {
  var headers = {};

  // Adjuntar token en rutas admin
  if (endpoint.startsWith('/admin')) {
    var token = Auth.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
  }

  if (!isFormData) headers['Content-Type'] = 'application/json';

  var opts = { method: method, headers: headers };
  if (body && !isFormData) opts.body = JSON.stringify(body);
  if (body && isFormData)  opts.body = body;

  var res  = await fetch(BASE + endpoint, opts);
  var json = await res.json();

  // Token invalido o expirado -> limpiar y redirigir a login
  if (res.status === 401) {
    Auth.clear();
    if (window.App && window.App.showLogin) window.App.showLogin(json.message);
    throw json;
  }

  if (!res.ok) throw json;
  return json;
}

var API = {
  auth: {
    login:  function(u, p) { return request('POST', '/admin/login',  { username: u, password: p }); },
    logout: function()     { return request('POST', '/admin/logout', null); },
  },
  collections: {
    list:   function()        { return request('GET',    '/admin/collections'); },
    get:    function(slug)    { return request('GET',    '/admin/collections/' + slug); },
    create: function(payload) { return request('POST',   '/admin/collections', payload); },
    delete: function(slug)    { return request('DELETE', '/admin/collections/' + slug); },
  },
  items: {
    list:   function(slug)          { return request('GET',    '/admin/collections/' + slug + '/items'); },
    get:    function(slug, id)      { return request('GET',    '/admin/collections/' + slug + '/items/' + id); },
    create: function(slug, data)    { return request('POST',   '/admin/collections/' + slug + '/items', data); },
    update: function(slug, id, data){ return request('PUT',    '/admin/collections/' + slug + '/items/' + id, data); },
    delete: function(slug, id)      { return request('DELETE', '/admin/collections/' + slug + '/items/' + id); },
  },
  upload: function(formData) { return request('POST', '/admin/upload', formData, true); },
};

window.API  = API;
window.Auth = Auth;
