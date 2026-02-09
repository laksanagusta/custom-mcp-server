import { z } from 'zod';
import { ZoomClient } from '../providers/zoom/client.js';
import { mcpLogger as logger } from '../utils/logger.js';

const zoomClient = new ZoomClient();

// Helper function to format result as MCP content with structured output
function formatResult(data: Record<string, unknown>) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(data, null, 2)
    }],
    structuredContent: data
  };
}

// Input schemas
const ListMeetingsInputSchema = z.object({
  userId: z.string().optional().describe('User ID to list meetings for (default: current user)'),
  pageSize: z.number().min(1).max(300).optional().default(30).describe('Number of meetings to return per page')
});

const GetMeetingInputSchema = z.object({
  meetingId: z.string().describe('The ID of the meeting to retrieve')
});

const CreateMeetingInputSchema = z.object({
  topic: z.string().describe('Meeting topic/title'),
  type: z.number().optional().default(2).describe('Meeting type: 1=instant, 2=scheduled, 3=recurring_no_fixed, 8=recurring_fixed'),
  startTime: z.string().optional().describe('Meeting start time in ISO 8601 format (e.g., 2025-02-10T14:00:00Z)'),
  duration: z.number().optional().default(60).describe('Meeting duration in minutes'),
  timezone: z.string().optional().default('UTC').describe('Timezone for the meeting'),
  password: z.string().optional().describe('Meeting password'),
  agenda: z.string().optional().describe('Meeting description/agenda')
});

const DeleteMeetingInputSchema = z.object({
  meetingId: z.string().describe('The ID of the meeting to delete')
});

// Output schemas
const MeetingOutputSchema = z.object({
  id: z.number(),
  topic: z.string(),
  status: z.string(),
  startTime: z.string().optional(),
  duration: z.number(),
  joinUrl: z.string(),
  password: z.string().optional()
});

const MeetingListOutputSchema = z.object({
  total: z.number(),
  meetings: z.array(z.object({
    id: z.number(),
    topic: z.string(),
    startTime: z.string(),
    duration: z.number(),
    joinUrl: z.string()
  }))
});

// Tool definitions
export const zoomTools = {
  zoom_list_meetings: {
    description: 'List all Zoom meetings for a user',
    inputSchema: ListMeetingsInputSchema,
    outputSchema: MeetingListOutputSchema,
    handler: async (input: z.infer<typeof ListMeetingsInputSchema>) => {
      try {
        logger.info('Listing Zoom meetings', { userId: input.userId });
        const meetings = await zoomClient.listMeetings(input.userId, input.pageSize);
        
        const result = {
          total: meetings.total_records,
          meetings: meetings.meetings.map(meeting => ({
            id: meeting.id,
            topic: meeting.topic,
            startTime: meeting.start_time,
            duration: meeting.duration,
            joinUrl: meeting.join_url
          }))
        };
        
        return formatResult(result);
      } catch (error) {
        logger.error('Error in zoom_list_meetings:', error);
        throw error;
      }
    }
  },

  zoom_get_meeting: {
    description: 'Get detailed information about a specific Zoom meeting',
    inputSchema: GetMeetingInputSchema,
    outputSchema: MeetingOutputSchema,
    handler: async (input: z.infer<typeof GetMeetingInputSchema>) => {
      try {
        logger.info('Getting Zoom meeting', { meetingId: input.meetingId });
        const meeting = await zoomClient.getMeeting(input.meetingId);
        
        const result = {
          id: meeting.id,
          topic: meeting.topic,
          status: meeting.status,
          startTime: meeting.start_time,
          duration: meeting.duration,
          joinUrl: meeting.join_url,
          password: meeting.password
        };
        
        return formatResult(result);
      } catch (error) {
        logger.error('Error in zoom_get_meeting:', error);
        throw error;
      }
    }
  },

  zoom_create_meeting: {
    description: 'Create a new Zoom meeting',
    inputSchema: CreateMeetingInputSchema,
    outputSchema: MeetingOutputSchema,
    handler: async (input: z.infer<typeof CreateMeetingInputSchema>) => {
      try {
        logger.info('Creating Zoom meeting', { topic: input.topic });
        const meeting = await zoomClient.createMeeting({
          topic: input.topic,
          type: input.type,
          start_time: input.startTime,
          duration: input.duration,
          timezone: input.timezone,
          password: input.password,
          agenda: input.agenda
        });
        
        const result = {
          id: meeting.id,
          topic: meeting.topic,
          status: meeting.status,
          startTime: meeting.start_time,
          duration: meeting.duration,
          joinUrl: meeting.join_url,
          password: meeting.password
        };
        
        return formatResult(result);
      } catch (error) {
        logger.error('Error in zoom_create_meeting:', error);
        throw error;
      }
    }
  },

  zoom_delete_meeting: {
    description: 'Delete a Zoom meeting',
    inputSchema: DeleteMeetingInputSchema,
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string()
    }),
    handler: async (input: z.infer<typeof DeleteMeetingInputSchema>) => {
      try {
        logger.info('Deleting Zoom meeting', { meetingId: input.meetingId });
        await zoomClient.deleteMeeting(input.meetingId);
        
        const result = {
          success: true,
          message: `Meeting ${input.meetingId} deleted successfully`
        };
        
        return formatResult(result);
      } catch (error) {
        logger.error('Error in zoom_delete_meeting:', error);
        throw error;
      }
    }
  }
};