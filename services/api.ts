// services/api.ts
import axios from 'axios';

export const BASE_URL = 'https://api.luneksa.com';
const api = axios.create({
  baseURL: `${BASE_URL}/`,
  timeout: 15000,
});



// keep paths clean
api.interceptors.request.use((config) => {
  if (config.url?.startsWith('/')) config.url = config.url.slice(1);
  console.log(
    '[REQ]',
    `${config.baseURL}${config.url}`,
    config.method,
    config.params || '',
    config.data || ''
  );
  return config;
});

api.interceptors.response.use(
  (res) => {
    console.log('[RES]', res.status, res.config.url);
    return res;
  },
  (err) => {
    console.log(
      '[ERR]',
      err.response?.status,
      err.config?.url,
      err.response?.data || err.message
    );
    return Promise.reject(err);
  }
);

export default api;
