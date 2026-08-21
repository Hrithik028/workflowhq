import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

import type { ApiErrorPayload, Session } from "../types";

let accessToken: string | null = null;
let refreshRequest: Promise<Session> | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
  withCredentials: true,
  timeout: 12_000
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

const requestRefresh = async () => {
  if (!refreshRequest) {
    refreshRequest = axios
      .post<{ data: Session }>(
        `${api.defaults.baseURL}/auth/refresh`,
        {},
        { withCredentials: true, timeout: 12_000 }
      )
      .then((response) => {
        setAccessToken(response.data.data.accessToken);
        return response.data.data;
      })
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
};

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryConfig | undefined;
    const isAuthRoute = original?.url?.includes("/auth/");
    if (error.response?.status === 401 && original && !original._retry && !isAuthRoute) {
      original._retry = true;
      await requestRefresh();
      return api(original);
    }
    return Promise.reject(error);
  }
);

export const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError<ApiErrorPayload>(error)) {
    return error.response?.data.error?.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
};
