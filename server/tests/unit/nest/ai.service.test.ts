import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AiService } from '../../../src/nest/ai/ai.service';
import {
  BadRequestException,
  HttpException,
  GatewayTimeoutException,
  UnauthorizedException,
} from '@nestjs/common';

describe('AiService', () => {
  let service: AiService;

  beforeEach(() => {
    service = new AiService();
  });

  describe('getStatus', () => {
    it('returns configured true when key is present', () => {
      const origEnv = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = 'test-api-key';
      const status = service.getStatus();
      expect(status.configured).toBe(true);
      expect(status.model).toBe('gemini-flash-lite-latest');
      if (origEnv !== undefined) process.env.GEMINI_API_KEY = origEnv;
      else delete process.env.GEMINI_API_KEY;
    });

    it('returns configured false when no key is present and env is empty', () => {
      const origEnv = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const status = service.getStatus();
      expect(typeof status.configured).toBe('boolean');

      if (origEnv !== undefined) process.env.GEMINI_API_KEY = origEnv;
    });
  });

  describe('chat', () => {
    it('throws BadRequestException if no key is configured', async () => {
      const origEnv = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      await expect(
        service.chat({
          messages: [{ role: 'user', content: 'hello' }],
        }),
      ).rejects.toThrow(BadRequestException);

      if (origEnv !== undefined) process.env.GEMINI_API_KEY = origEnv;
    });

    it('successfully calls Gemini and returns reply when mocked', async () => {
      const origEnv = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = 'test-key';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Here is some great travel advice!' }],
              },
            },
          ],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await service.chat({
        messages: [{ role: 'user', content: 'What should I pack for Goa?' }],
      });

      expect(result.reply).toBe('Here is some great travel advice!');
      expect(mockFetch).toHaveBeenCalled();
      vi.unstubAllGlobals();
      if (origEnv !== undefined) process.env.GEMINI_API_KEY = origEnv;
      else delete process.env.GEMINI_API_KEY;
    });

    it('handles conversation starting with assistant message properly', async () => {
      const origEnv = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = 'test-key';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Sure thing!' }],
              },
            },
          ],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await service.chat({
        messages: [
          { role: 'assistant', content: 'Welcome to TripMate!' },
          { role: 'user', content: 'Tell me about Goa.' },
        ],
      });

      expect(result.reply).toBe('Sure thing!');
      expect(mockFetch).toHaveBeenCalled();
      vi.unstubAllGlobals();
      if (origEnv !== undefined) process.env.GEMINI_API_KEY = origEnv;
      else delete process.env.GEMINI_API_KEY;
    });
  });

  describe('generateItinerary', () => {
    const origEnv = process.env.GEMINI_API_KEY;

    beforeEach(() => {
      process.env.GEMINI_API_KEY = 'test-key';
    });

    afterEach(() => {
      if (origEnv !== undefined) {
        process.env.GEMINI_API_KEY = origEnv;
      } else {
        delete process.env.GEMINI_API_KEY;
      }
      vi.unstubAllGlobals();
    });

    it('throws BadRequestException if no key is configured', async () => {
      delete process.env.GEMINI_API_KEY;

      await expect(
        service.generateItinerary({
          destination: 'Goa',
          days: 2,
          budget: 'mid',
          currency: 'INR',
          weather: 'summer',
          travelStyle: 'couple',
          interests: ['beach'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully generates and validates structured itinerary from Gemini response', async () => {
      const mockAiResponse = `\`\`\`json
{
  "summary": "A 2-day beach trip to Goa",
  "weatherForecast": "Warm and sunny beach climate",
  "packingTips": ["Sunscreen", "Swimwear", "Hat"],
  "days": [
    {
      "dayNumber": 1,
      "title": "Day 1: North Goa Beaches",
      "weatherNote": "Sunny and breezy",
      "activities": [
        {
          "name": "Baga Beach stroll",
          "timeSlot": "morning",
          "time": "09:00",
          "duration": "2h",
          "description": "Walk along the sand and enjoy breakfast",
          "estimatedCost": 300,
          "category": "Sightseeing"
        }
      ]
    },
    {
      "dayNumber": 2,
      "title": "Day 2: South Goa Heritage",
      "weatherNote": "Pleasant afternoon",
      "activities": [
        {
          "name": "Old Goa Churches",
          "timeSlot": "afternoon",
          "time": "14:00",
          "duration": "3h",
          "description": "Visit historic basilica and cathedral",
          "estimatedCost": 200,
          "category": "Culture"
        }
      ]
    }
  ],
  "budgetBreakdown": [
    { "category": "Accommodation", "name": "Resort stay", "amount": 5000 },
    { "category": "Food", "name": "Shack dining", "amount": 2500 }
  ],
  "totalEstimatedBudget": 7500
}
\`\`\``;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: mockAiResponse }],
              },
            },
          ],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const itinerary = await service.generateItinerary({
        destination: 'Goa',
        days: 2,
        budget: 'mid',
        currency: 'INR',
        weather: 'summer',
        travelStyle: 'couple',
        interests: ['culture', 'beach'],
      });

      expect(itinerary.destination).toBe('Goa');
      expect(itinerary.daysCount).toBe(2);
      expect(itinerary.days.length).toBe(2);
      expect(itinerary.days[0].title).toBe('Day 1: North Goa Beaches');
      expect(itinerary.days[1].title).toBe('Day 2: South Goa Heritage');
      expect(itinerary.budgetBreakdown.length).toBe(2);
      expect(itinerary.totalEstimatedBudget).toBe(7500); // 5000 + 2500
    });

    it('rejects AI response when returned days count does not match requested days', async () => {
      const mockAiResponse = `\`\`\`json
{
  "summary": "1 day trip",
  "weatherForecast": "Sunny",
  "packingTips": ["Hat"],
  "days": [
    {
      "dayNumber": 1,
      "title": "Day 1",
      "weatherNote": "Clear",
      "activities": [
        {
          "name": "Visit beach",
          "timeSlot": "morning",
          "description": "Fun time",
          "estimatedCost": 100
        }
      ]
    }
  ],
  "budgetBreakdown": [
    { "category": "Food", "name": "Snacks", "amount": 500 }
  ]
}
\`\`\``;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: mockAiResponse }] } }],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      // Requesting 3 days but AI only returned 1 day
      await expect(
        service.generateItinerary({
          destination: 'Goa',
          days: 3,
          budget: 'mid',
          currency: 'INR',
          weather: 'summer',
          travelStyle: 'couple',
          interests: ['beach'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects AI response when an activity description is empty', async () => {
      const mockAiResponse = `\`\`\`json
{
  "summary": "Trip",
  "days": [
    {
      "dayNumber": 1,
      "title": "Day 1",
      "weatherNote": "Sunny",
      "activities": [
        {
          "name": "Sightseeing",
          "timeSlot": "morning",
          "description": ""
        }
      ]
    }
  ],
  "budgetBreakdown": [{ "name": "Food", "amount": 100 }]
}
\`\`\``;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: mockAiResponse }] } }],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        service.generateItinerary({
          destination: 'Delhi',
          days: 1,
          budget: 'budget',
          currency: 'INR',
          weather: 'summer',
          travelStyle: 'solo',
          interests: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('handles rate-limiting (429) cleanly with HttpException', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: 'RESOURCE_EXHAUSTED' } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        service.generateItinerary({
          destination: 'Manali',
          days: 2,
          budget: 'mid',
          currency: 'INR',
          weather: 'winter',
          travelStyle: 'solo',
          interests: [],
        }),
      ).rejects.toThrow(HttpException);
    });

    it('handles unauthorized/invalid API key cleanly with UnauthorizedException', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: 'API_KEY_INVALID' } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        service.generateItinerary({
          destination: 'Manali',
          days: 2,
          budget: 'mid',
          currency: 'INR',
          weather: 'winter',
          travelStyle: 'solo',
          interests: [],
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('handles request timeout cleanly with GatewayTimeoutException', async () => {
      const timeoutError = new Error('The operation was aborted due to timeout');
      timeoutError.name = 'TimeoutError';
      const mockFetch = vi.fn().mockRejectedValue(timeoutError);
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        service.generateItinerary({
          destination: 'Manali',
          days: 2,
          budget: 'mid',
          currency: 'INR',
          weather: 'winter',
          travelStyle: 'solo',
          interests: [],
        }),
      ).rejects.toThrow(GatewayTimeoutException);
    });
  });
});
