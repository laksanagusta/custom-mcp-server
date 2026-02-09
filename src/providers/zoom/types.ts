export interface ZoomMeeting {
  id: number;
  uuid: string;
  host_id: string;
  topic: string;
  type: number;
  status: string;
  start_time: string;
  duration: number;
  timezone: string;
  agenda?: string;
  join_url: string;
  password?: string;
  h323_password?: string;
  pstn_password?: string;
  encrypted_password?: string;
  settings: {
    host_video: boolean;
    participant_video: boolean;
    cn_meeting: boolean;
    in_meeting: boolean;
    join_before_host: boolean;
    mute_upon_entry: boolean;
    watermark: boolean;
    use_pmi: boolean;
    approval_type: number;
    registration_type?: number;
    audio: string;
    auto_recording: string;
    enforce_login: boolean;
    enforce_login_domains: string;
    alternative_hosts?: string;
    close_registration: boolean;
    show_share_button: boolean;
    allow_multiple_devices: boolean;
    registrants_confirmation_email: boolean;
    waiting_room: boolean;
    request_permission_to_unmute_participants: boolean;
    registrants_email_notification: boolean;
    meeting_authentication: boolean;
    encryption_type: string;
  };
  created_at: string;
}

export interface ZoomMeetingList {
  page_count: number;
  page_number: number;
  page_size: number;
  total_records: number;
  next_page_token?: string;
  meetings: ZoomMeeting[];
}

export interface ZoomCreateMeetingRequest {
  topic: string;
  type?: number; // 1: instant, 2: scheduled, 3: recurring with no fixed time, 8: recurring with fixed time
  start_time?: string; // ISO 8601 format
  duration?: number; // minutes
  schedule_for?: string;
  timezone?: string;
  password?: string;
  agenda?: string;
  settings?: Partial<ZoomMeeting['settings']>;
}

export interface ZoomUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  type: number;
  role_name?: string;
  pmi: number;
  use_pmi: boolean;
  vanity_url?: string;
  personal_meeting_url?: string;
  timezone: string;
  verified: number;
  dept?: string;
  created_at: string;
  last_login_time?: string;
  last_client_version?: string;
  pic_url?: string;
  host_key?: string;
  jid?: string;
  group_ids?: string[];
  im_group_ids?: string[];
  account_id?: string;
  language?: string;
  phone_country?: string;
  phone_number?: string;
  status: string;
  job_title?: string;
  location?: string;
  login_types?: number[];
  role_id?: string;
  account_number?: number;
  cluster?: string;
  user_created_at?: string;
}