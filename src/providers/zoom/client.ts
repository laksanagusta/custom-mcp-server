import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../../config/index.js';
import { mcpLogger as logger } from '../../utils/logger.js';
import type { ZoomMeeting, ZoomMeetingList, ZoomCreateMeetingRequest, ZoomUser } from './types.js';

interface ZoomTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export class ZoomClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.client = axios.create({
      baseURL: config.zoom.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add request interceptor to inject auth token
    this.client.interceptors.request.use(
      async (config) => {
        const token = await this.getAccessToken();
        config.headers.Authorization = `Bearer ${token}`;
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        logger.error('Zoom API Error:', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );
  }

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.accessToken && Date.now() < this.tokenExpiry - 60000) {
      return this.accessToken;
    }

    try {
      logger.info('Fetching new Zoom access token...');
      
      // Create Basic Auth header from clientId:clientSecret
      const credentials = Buffer.from(
        `${config.zoom.clientId}:${config.zoom.clientSecret}`
      ).toString('base64');

      const response = await axios.post<ZoomTokenResponse>(
        config.zoom.oauthUrl,
        new URLSearchParams({
          grant_type: 'account_credentials',
          account_id: config.zoom.accountId
        }).toString(),
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      logger.info('Successfully obtained Zoom access token');
      return this.accessToken;
    } catch (error) {
      logger.error('Failed to get Zoom access token:', error);
      throw new Error('Failed to authenticate with Zoom API');
    }
  }

  async getCurrentUser(): Promise<ZoomUser> {
    try {
      const response = await this.client.get<ZoomUser>('/users/me');
      return response.data;
    } catch (error) {
      logger.error('Failed to get current user:', error);
      throw new Error('Failed to get Zoom user information');
    }
  }

  async listMeetings(userId: string = 'me', pageSize: number = 30): Promise<ZoomMeetingList> {
    try {
      const response = await this.client.get<ZoomMeetingList>(`/users/${userId}/meetings`, {
        params: {
          page_size: pageSize,
          type: 'scheduled'
        }
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to list meetings:', error);
      throw new Error('Failed to list Zoom meetings');
    }
  }

  async getMeeting(meetingId: string): Promise<ZoomMeeting> {
    try {
      const response = await this.client.get<ZoomMeeting>(`/meetings/${meetingId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get meeting:', error);
      throw new Error(`Failed to get Zoom meeting ${meetingId}`);
    }
  }

  async createMeeting(request: ZoomCreateMeetingRequest): Promise<ZoomMeeting> {
    try {
      const response = await this.client.post<ZoomMeeting>('/users/me/meetings', request);
      return response.data;
    } catch (error) {
      logger.error('Failed to create meeting:', error);
      throw new Error('Failed to create Zoom meeting');
    }
  }

  async deleteMeeting(meetingId: string, scheduleForReminder: boolean = false): Promise<void> {
    try {
      await this.client.delete(`/meetings/${meetingId}`, {
        params: {
          schedule_for_reminder: scheduleForReminder
        }
      });
    } catch (error) {
      logger.error('Failed to delete meeting:', error);
      throw new Error(`Failed to delete Zoom meeting ${meetingId}`);
    }
  }
}