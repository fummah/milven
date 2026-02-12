import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export const api = axios.create({
	baseURL: API_URL,
	withCredentials: false
});

api.interceptors.request.use(config => {
	const token = localStorage.getItem('token');
	if (token) {
		config.headers = config.headers ?? {};
		config.headers.Authorization = `Bearer ${token}`;
	}
	return config;
});

// Global auth guard for API responses
api.interceptors.response.use(
	(res) => res,
	(error) => {
		const status = error?.response?.status;
		if (status === 401) {
			try {
				localStorage.removeItem('token');
				localStorage.removeItem('currentUser');
			} catch {}
			// notify app-wide listeners
			try {
				window.dispatchEvent(new Event('auth:changed'));
			} catch {}
			// Do not force-redirect here; route guards will handle navigation
		}
		return Promise.reject(error);
	}
);


