import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
  GatewayTimeoutException,
  UnauthorizedException,
} from '@nestjs/common';
import { readEnv } from '../../app-config';
import { PlanItineraryDto, ChatAiDto } from './ai.dto';

export interface ItineraryActivity {
  name: string;
  timeSlot: 'morning' | 'afternoon' | 'evening';
  time?: string;
  duration?: string;
  description: string;
  estimatedCost?: number;
  category?: string;
}

export interface ItineraryDay {
  dayNumber: number;
  title: string;
  weatherNote: string;
  activities: ItineraryActivity[];
}

export interface BudgetBreakdownItem {
  category: string;
  name: string;
  amount: number;
}

export interface StructuredItinerary {
  destination: string;
  daysCount: number;
  summary: string;
  weatherForecast: string;
  packingTips: string[];
  days: ItineraryDay[];
  budgetBreakdown: BudgetBreakdownItem[];
  totalEstimatedBudget: number;
  currency: string;
  markdown: string;
}

function extractJson(text: string): unknown {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // try fallback below
    }
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      // cannot parse
    }
  }

  return null;
}

function validateAndFormatItinerary(
  parsed: unknown,
  dto: PlanItineraryDto,
  rawMarkdown: string,
): StructuredItinerary {
  if (!parsed || typeof parsed !== 'object') {
    throw new BadRequestException(
      'AI response could not be parsed as a valid structured JSON itinerary. Please try again.',
    );
  }

  const data = parsed as Record<string, unknown>;

  // 1. Days validation
  if (!Array.isArray(data.days) || data.days.length === 0) {
    throw new BadRequestException('AI itinerary validation failed: missing or empty "days" list.');
  }

  const rawDays = data.days as Array<Record<string, unknown>>;
  if (rawDays.length !== dto.days) {
    throw new BadRequestException(
      `AI itinerary validation failed: requested ${dto.days} days, but received ${rawDays.length} days from AI.`,
    );
  }

  const validatedDays: ItineraryDay[] = [];
  for (let i = 0; i < rawDays.length; i++) {
    const d = rawDays[i];
    const expectedDayNumber = i + 1;
    const title = typeof d.title === 'string' && d.title.trim().length > 0
      ? d.title.trim()
      : `Day ${expectedDayNumber}: Explore ${dto.destination}`;

    const weatherNote = typeof d.weatherNote === 'string' && d.weatherNote.trim().length > 0
      ? d.weatherNote.trim()
      : `Tailored for ${dto.weather} weather`;

    if (!Array.isArray(d.activities) || d.activities.length === 0) {
      throw new BadRequestException(
        `AI itinerary validation failed: Day ${expectedDayNumber} must contain at least one activity.`,
      );
    }

    const validatedActivities: ItineraryActivity[] = [];
    for (let j = 0; j < d.activities.length; j++) {
      const act = d.activities[j] as Record<string, unknown>;
      const name = typeof act.name === 'string' ? act.name.trim() : '';
      if (!name) {
        throw new BadRequestException(
          `AI itinerary validation failed: Day ${expectedDayNumber} activity #${j + 1} has an empty name.`,
        );
      }

      const description = typeof act.description === 'string' ? act.description.trim() : '';
      if (!description) {
        throw new BadRequestException(
          `AI itinerary validation failed: Day ${expectedDayNumber} activity "${name}" has an empty description.`,
        );
      }

      const timeSlotRaw = typeof act.timeSlot === 'string' ? act.timeSlot.toLowerCase() : 'morning';
      const timeSlot: 'morning' | 'afternoon' | 'evening' =
        timeSlotRaw === 'evening' ? 'evening' : timeSlotRaw === 'afternoon' ? 'afternoon' : 'morning';

      const costRaw = typeof act.estimatedCost === 'number' && !isNaN(act.estimatedCost) ? act.estimatedCost : 0;
      const estimatedCost = Math.max(0, Math.round(costRaw));

      validatedActivities.push({
        name,
        timeSlot,
        time: typeof act.time === 'string' && act.time.trim() ? act.time.trim() : undefined,
        duration: typeof act.duration === 'string' && act.duration.trim() ? act.duration.trim() : undefined,
        description,
        estimatedCost,
        category: typeof act.category === 'string' && act.category.trim() ? act.category.trim() : 'Sightseeing',
      });
    }

    validatedDays.push({
      dayNumber: expectedDayNumber,
      title,
      weatherNote,
      activities: validatedActivities,
    });
  }

  // 2. Budget breakdown validation
  if (!Array.isArray(data.budgetBreakdown) || data.budgetBreakdown.length === 0) {
    throw new BadRequestException(
      'AI itinerary validation failed: missing "budgetBreakdown" in model response.',
    );
  }

  const budgetBreakdown: BudgetBreakdownItem[] = (
    data.budgetBreakdown as Array<Record<string, unknown>>
  ).map((b, idx) => {
    const category = typeof b.category === 'string' && b.category.trim() ? b.category.trim() : 'General';
    const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim() : `Expense Item ${idx + 1}`;
    const amountRaw = typeof b.amount === 'number' && !isNaN(b.amount) ? b.amount : 0;
    return {
      category,
      name,
      amount: Math.max(0, Math.round(amountRaw)),
    };
  });

  // Calculate consistent budget total (sum of items)
  const totalEstimatedBudget = budgetBreakdown.reduce((sum, item) => sum + item.amount, 0);

  // 3. Summary, weather forecast & packing tips
  const summary = typeof data.summary === 'string' && data.summary.trim()
    ? data.summary.trim()
    : `${dto.days}-day personalized itinerary for ${dto.destination}.`;

  const weatherForecast = typeof data.weatherForecast === 'string' && data.weatherForecast.trim()
    ? data.weatherForecast.trim()
    : `Curated for ${dto.weather} season in ${dto.destination}.`;

  const packingTips = Array.isArray(data.packingTips) && data.packingTips.length > 0
    ? (data.packingTips as unknown[])
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.trim())
    : ['Comfortable footwear', 'Weather-appropriate clothing', 'Essential travel documents'];

  return {
    destination: dto.destination,
    daysCount: dto.days,
    summary,
    weatherForecast,
    packingTips,
    days: validatedDays,
    budgetBreakdown,
    totalEstimatedBudget,
    currency: dto.currency || 'INR',
    markdown: rawMarkdown,
  };
}

@Injectable()
export class AiService {
  private resolveKey(): string | undefined {
    const fromEnv =
      readEnv().integrations.geminiApiKey ||
      process.env.GEMINI_API_KEY;

    const trimmed = fromEnv?.trim();
    if (trimmed && trimmed !== 'your_gemini_api_key_here' && trimmed !== '••••••••') {
      return trimmed;
    }
    return undefined;
  }

  getStatus() {
    const key = this.resolveKey();
    return {
      configured: Boolean(key),
      model: 'gemini-flash-lite-latest',
    };
  }

  private async callGeminiApi(
    apiKey: string,
    contents: unknown[],
    systemInstruction?: string,
  ): Promise<string> {
    const models = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
    let lastError: Error | null = null;

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      try {
        const body: Record<string, unknown> = {
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        };

        if (systemInstruction) {
          body.systemInstruction = {
            parts: [{ text: systemInstruction }],
          };
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(25000),
        });

        if (!res.ok) {
          const errText = await res.text();

          // Classify auth errors - fail immediately since other models will also fail with an invalid key
          if (res.status === 401 || res.status === 403 || errText.includes('API_KEY_INVALID')) {
            throw new UnauthorizedException(
              'Google Gemini API key is invalid or unauthorized. Please verify your GEMINI_API_KEY in server/.env.',
            );
          }

          // On 503 (overloaded), 429 (rate limit), or 404 (model not found), record error and try next model
          if (
            res.status === 503 ||
            res.status === 429 ||
            res.status === 404 ||
            errText.includes('RESOURCE_EXHAUSTED') ||
            errText.includes('UNAVAILABLE')
          ) {
            lastError = new HttpException(
              res.status === 429 || errText.includes('RESOURCE_EXHAUSTED')
                ? 'Google Gemini rate limit reached. Please wait a moment and try again.'
                : 'Google Gemini service is temporarily experiencing high demand. Please try again in a few moments.',
              res.status === 429 ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.SERVICE_UNAVAILABLE,
            );
            continue;
          }

          lastError = new BadRequestException(`Gemini API error (${res.status}): ${errText.slice(0, 200)}`);
          continue;
        }

        const data = (await res.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            finishReason?: string;
          }>;
        };

        const candidate = data?.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;

        if (text && text.trim().length > 0) {
          return text;
        }

        if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
          throw new BadRequestException(
            `Gemini generation ended with reason: ${candidate.finishReason}. Please adjust the prompt.`,
          );
        }
      } catch (err) {
        if (err instanceof HttpException) {
          throw err;
        }

        const isTimeout =
          (err as { name?: string })?.name === 'TimeoutError' ||
          String(err).toLowerCase().includes('timeout') ||
          String(err).toLowerCase().includes('aborted');

        if (isTimeout) {
          throw new GatewayTimeoutException(
            'Google Gemini request timed out after 25 seconds. Please try again.',
          );
        }

        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    if (lastError instanceof HttpException) {
      throw lastError;
    }

    throw new BadRequestException(
      lastError?.message || 'Failed to communicate with Google Gemini API. Please check your network and configuration.',
    );
  }

  async generateItinerary(dto: PlanItineraryDto): Promise<StructuredItinerary> {
    const apiKey = this.resolveKey();
    if (!apiKey) {
      throw new BadRequestException(
        'Gemini API key is not configured. Please ensure GEMINI_API_KEY is configured in server/.env.',
      );
    }

    const systemInstruction = `You are TripMate AI, an expert travel planner and local tour specialist.
Your mission is to generate a comprehensive, highly realistic day-by-day travel itinerary.
Strictly factor in:
1. Weather & Season: activities must suit "${dto.weather}" conditions.
2. Number of Days: generate EXACTLY ${dto.days} distinct days (Day 1 through Day ${dto.days}). Every single day from 1 to ${dto.days} must be present in the "days" array.
3. Budget: realistic costs in ${dto.currency} considering the "${dto.budget}" budget level.
4. Travel Style: "${dto.travelStyle}".
5. Interests: ${dto.interests?.length ? dto.interests.join(', ') : 'sightseeing, local food & culture'}.

You MUST respond with a valid JSON code block enclosed in \`\`\`json and \`\`\` matching this schema exactly, followed by a markdown guide:
{
  "summary": "Short 2-3 sentence overview of the trip to ${dto.destination}",
  "weatherForecast": "Expected climate summary and seasonal advice for ${dto.weather}",
  "packingTips": ["item 1", "item 2", "item 3"],
  "days": [
    {
      "dayNumber": 1,
      "title": "Day 1 title",
      "weatherNote": "Weather advice for day 1",
      "activities": [
        {
          "name": "Activity or attraction name",
          "timeSlot": "morning",
          "time": "09:00",
          "duration": "2.5 hours",
          "description": "Engaging description of activity",
          "estimatedCost": 500,
          "category": "Sightseeing"
        }
      ]
    }
  ],
  "budgetBreakdown": [
    { "category": "Accommodation", "name": "Hotel / Stay (${dto.days} nights)", "amount": 10000 },
    { "category": "Food & Dining", "name": "Daily meals & street food", "amount": 6000 },
    { "category": "Local Transport", "name": "Cabs, autos, transit", "amount": 3500 },
    { "category": "Activities & Entry", "name": "Tickets, guides, passes", "amount": 2500 }
  ],
  "totalEstimatedBudget": 22000
}`;

    const promptText = `Plan a ${dto.days}-day trip to ${dto.destination}.
- Duration: ${dto.days} days (generate Day 1 to Day ${dto.days})
- Target Budget: ${dto.budget} in ${dto.currency}
- Weather / Season: ${dto.weather}
- Travel Style: ${dto.travelStyle}
- Interests: ${dto.interests?.length ? dto.interests.join(', ') : 'Must-see attractions, local culture & food'}
${dto.startDate ? `- Start Date: ${dto.startDate}` : ''}

Please generate the complete itinerary now with both the \`\`\`json block and detailed markdown!`;

    const rawResponse = await this.callGeminiApi(
      apiKey,
      [{ role: 'user', parts: [{ text: promptText }] }],
      systemInstruction,
    );

    const parsed = extractJson(rawResponse);
    return validateAndFormatItinerary(parsed, dto, rawResponse);
  }

  async chat(dto: ChatAiDto): Promise<{ reply: string }> {
    const apiKey = this.resolveKey();
    if (!apiKey) {
      throw new BadRequestException(
        'Gemini API key is not configured. Please ensure GEMINI_API_KEY is configured in server/.env.',
      );
    }

    const validMessages = dto.messages.filter((m) => m.content && m.content.trim().length > 0);
    if (validMessages.length === 0) {
      throw new BadRequestException('At least one chat message is required.');
    }

    const contents: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> = [];

    // Ensure the conversation begins with a user message for Gemini compliance
    if (validMessages[0].role !== 'user') {
      contents.push({ role: 'user', parts: [{ text: 'Hello, TripMate AI' }] });
    }

    for (const m of validMessages) {
      const role: 'user' | 'model' = m.role === 'assistant' || m.role === 'model' ? 'model' : 'user';
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts[0].text += `\n\n${m.content.trim()}`;
      } else {
        contents.push({ role, parts: [{ text: m.content.trim() }] });
      }
    }

    const systemInstruction = `You are TripMate AI, an expert travel assistant.
You help users plan and refine trips with specific attention to weather conditions, day counts, and budgets.
Give practical, accurate advice on destinations, local food, transport, packing, and timing.
${dto.tripContext ? `Current Trip Context:\n${JSON.stringify(dto.tripContext, null, 2)}` : ''}`;

    const reply = await this.callGeminiApi(apiKey, contents, systemInstruction);
    return { reply };
  }
}
