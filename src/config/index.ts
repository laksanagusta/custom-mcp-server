import 'dotenv/config';
import { mcpLogger as logger } from '../utils/logger.js';

export interface AppConfig {
  zoom: {
    accountId: string;
    clientId: string;
    clientSecret: string;
    baseUrl: string;
    oauthUrl: string;
  };
  github: {
    token: string;
    baseUrl: string;
  };
  googleSheets: {
    apiKey: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    refreshToken?: string;
    accessToken?: string;
  };
  openai: {
    apiKey: string;
  };
}

function getEnvVar(name: string, required: boolean = true): string {
  const value = process.env[name];
  if (required && !value) {
    logger.error(`Missing required environment variable: ${name}`);
    throw new Error(`Environment variable ${name} is required`);
  }
  return value || '';
}

export const config: AppConfig = {
  zoom: {
    accountId: getEnvVar('ZOOM_ACCOUNT_ID'),
    clientId: getEnvVar('ZOOM_CLIENT_ID'),
    clientSecret: getEnvVar('ZOOM_CLIENT_SECRET'),
    baseUrl: 'https://api.zoom.us/v2',
    oauthUrl: 'https://zoom.us/oauth/token'
  },
  github: {
    token: getEnvVar('GITHUB_TOKEN'),
    baseUrl: 'https://api.github.com'
  },
  googleSheets: {
    apiKey: getEnvVar('GOOGLE_SHEETS_API_KEY'),
    clientId: getEnvVar('GOOGLE_CLIENT_ID', false),
    clientSecret: getEnvVar('GOOGLE_CLIENT_SECRET', false),
    redirectUri: getEnvVar('GOOGLE_REDIRECT_URI', false),
    refreshToken: getEnvVar('GOOGLE_REFRESH_TOKEN', false),
    accessToken: getEnvVar('GOOGLE_ACCESS_TOKEN', false)
  },
  openai: {
    apiKey: getEnvVar('OPENAI_API_KEY')
  }
};
