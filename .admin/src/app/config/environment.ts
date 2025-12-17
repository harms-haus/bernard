export type EnvironmentConfig = {
  apiBaseUrl: string;
  useMocks: boolean;
};

export const environment: EnvironmentConfig = {
  apiBaseUrl: '/api',
  useMocks: false
};
