import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default api;

// Auth
export const auth = {
  login: (data: { email: string; password: string }) =>
    api.post('/api/auth/login', data),
  register: (data: { email: string; password: string; name: string }) =>
    api.post('/api/auth/register', data),
  me: () => api.get('/api/auth/me'),
};

// Providers
export const providers = {
  list: () => api.get('/api/providers'),
  get: (id: string) => api.get(`/api/providers/${id}`),
  create: (data: any) => api.post('/api/providers', data),
  update: (id: string, data: any) => api.put(`/api/providers/${id}`, data),
  delete: (id: string) => api.delete(`/api/providers/${id}`),
  test: (id: string) => api.post(`/api/providers/${id}/test`),
  addKey: (providerId: string, data: any) =>
    api.post(`/api/providers/${providerId}/keys`, data),
  updateKey: (keyId: string, data: any) =>
    api.put(`/api/providers/keys/${keyId}`, data),
  deleteKey: (keyId: string) => api.delete(`/api/providers/keys/${keyId}`),
};

// Usage
export const usage = {
  stats: (period?: string) =>
    api.get('/api/usage/stats', { params: { period } }),
  logs: (params?: any) => api.get('/api/usage/logs', { params }),
  models: (period?: string) =>
    api.get('/api/usage/models', { params: { period } }),
  costs: (period?: string) =>
    api.get('/api/usage/costs', { params: { period } }),
};

// Routing
export const routing = {
  rules: {
    list: () => api.get('/api/routing/rules'),
    get: (id: string) => api.get(`/api/routing/rules/${id}`),
    create: (data: any) => api.post('/api/routing/rules', data),
    update: (id: string, data: any) => api.put(`/api/routing/rules/${id}`, data),
    delete: (id: string) => api.delete(`/api/routing/rules/${id}`),
    toggle: (id: string) => api.post(`/api/routing/rules/${id}/toggle`),
    reorder: (ruleIds: string[]) =>
      api.post('/api/routing/rules/reorder', { ruleIds }),
  },
  aliases: {
    list: () => api.get('/api/routing/aliases'),
    create: (data: any) => api.post('/api/routing/aliases', data),
    update: (id: string, data: any) =>
      api.put(`/api/routing/aliases/${id}`, data),
    delete: (id: string) => api.delete(`/api/routing/aliases/${id}`),
  },
};
