import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

import type { ApiErrorPayload, Session } from "../types";
import { requestActivity } from "./requestActivity";

let accessToken: string | null = null;
let refreshRequest: Promise<Session> | null = null;

// Generation can use the server's 60-second provider limit plus context/database work.
// Keep ordinary API calls short; never retry paid generation on a timeout.
export const AI_GENERATION_TIMEOUT_MS = 90_000;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
  withCredentials: true,
  timeout: 12_000
});

api.interceptors.request.use((config) => {
  (config as ActivityConfig)._finishActivity = requestActivity.begin({
    foreground: (config.method || "get").toLowerCase() === "get"
  });
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

interface ActivityConfig extends InternalAxiosRequestConfig {
  _finishActivity?: () => void;
}

const finishActivity = (config?: InternalAxiosRequestConfig) => {
  const activityConfig = config as ActivityConfig | undefined;
  activityConfig?._finishActivity?.();
  if (activityConfig) delete activityConfig._finishActivity;
};

const requestRefresh = async () => {
  if (!refreshRequest) {
    const finish = requestActivity.begin({ foreground: false });
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
        finish();
        refreshRequest = null;
      });
  }
  return refreshRequest;
};

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

api.interceptors.response.use(
  (response) => {
    finishActivity(response.config);
    return response;
  },
  async (error: AxiosError) => {
    finishActivity(error.config);
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

export const getErrorCode = (error: unknown) => {
  if (axios.isAxiosError<ApiErrorPayload>(error)) {
    return error.response?.data.error?.code || null;
  }
  return null;
};
