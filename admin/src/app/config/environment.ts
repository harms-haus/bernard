export type EnvironmentConfig = {
  apiBaseUrl: string;
  adminToken?: string;
  useMocks: boolean;
};

export const environment: EnvironmentConfig = {
  apiBaseUrl: '/api',
  adminToken: 'super-secret-admin-token',
  useMocks: false
};
