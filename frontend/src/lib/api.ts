import { client } from '../client/client.gen';

// API Key from environment variable - no fallback
export const API_KEY = import.meta.env.VITE_API_KEY;

if (!API_KEY) {
    throw new Error('VITE_API_KEY environment variable is required');
}

// Determine API base URL based on environment
// In production (Docker): use /api which nginx proxies to backend
// In development: use localhost:8000 directly
const getBaseUrl = () => {
    // Check if we're in development mode (Vite dev server)
    if (import.meta.env.DEV) {
        return 'http://localhost:8000';
    }
    // In production, use the /api proxy configured in nginx
    return '/api';
};

// Configure the client
client.setConfig({
    baseUrl: getBaseUrl(),
});

// Add interceptor to inject API Key and Auth Token
client.interceptors.request.use((request) => {
    // Inject API Key
    request.headers.set('X-API-Key', API_KEY);

    // Inject Auth Token if available
    const token = localStorage.getItem('token');
    if (token) {
        request.headers.set('Authorization', `Bearer ${token}`);
    }

    return request;
});

export { client };
