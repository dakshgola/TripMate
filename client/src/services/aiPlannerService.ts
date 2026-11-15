import { apiClient, daysApi, placesApi, assignmentsApi, budgetApi, dayNotesApi, tripsApi } from '../api/client';
import type { Trip, Day, Place } from '../types';

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

export interface ItineraryRequest {
  destination: string;
  days: number;
  budget: string;
  currency?: string;
  weather?: string;
  travelStyle?: string;
  interests?: string[];
  startDate?: string;
}

export async function checkAiKeyStatus(): Promise<{
  configured: boolean;
  model?: string;
}> {
  try {
    const res = await apiClient.get('/ai/status');
    return {
      configured: Boolean(res.data?.configured),
      model: res.data?.model,
    };
  } catch {
    return { configured: false };
  }
}

export function parseItineraryText(
  rawText: string,
  params: ItineraryRequest,
): StructuredItinerary {
  let parsedJson: Partial<StructuredItinerary> = {};
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch && jsonMatch[1]) {
    try {
      parsedJson = JSON.parse(jsonMatch[1]);
    } catch {
      const braceMatch = rawText.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          parsedJson = JSON.parse(braceMatch[0]);
        } catch {
          parsedJson = {};
        }
      }
    }
  }

  const days: ItineraryDay[] = (parsedJson.days || []).map((d, index) => ({
    dayNumber: d.dayNumber ?? index + 1,
    title: d.title ?? `Day ${index + 1}`,
    weatherNote: d.weatherNote ?? `Weather-appropriate plan for ${params.weather || 'current'} season`,
    activities: (d.activities || []).map((a) => ({
      name: a.name ?? 'Scenic Exploration',
      timeSlot: a.timeSlot ?? 'morning',
      time: a.time,
      duration: a.duration,
      description: a.description ?? '',
      estimatedCost: typeof a.estimatedCost === 'number' ? a.estimatedCost : 0,
      category: a.category ?? 'Sightseeing',
    })),
  }));

  if (days.length === 0) {
    for (let i = 1; i <= params.days; i++) {
      days.push({
        dayNumber: i,
        title: `Day ${i}: Discover ${params.destination}`,
        weatherNote: `Tailored for ${params.weather || 'pleasant'} weather`,
        activities: [
          {
            name: `Highlights of ${params.destination}`,
            timeSlot: 'morning',
            time: '09:00',
            duration: '3 hours',
            description: `Visit top attractions and landmarks in ${params.destination}`,
            estimatedCost: 350,
            category: 'Sightseeing',
          },
          {
            name: 'Local Food & Heritage Tour',
            timeSlot: 'afternoon',
            time: '13:00',
            duration: '2.5 hours',
            description: 'Taste authentic local delicacies and visit cultural hotspots',
            estimatedCost: 600,
            category: 'Food',
          },
          {
            name: 'Evening Promenade & Sunset',
            timeSlot: 'evening',
            time: '17:30',
            duration: '2 hours',
            description: 'Scenic viewpoint, local evening market and dinner',
            estimatedCost: 300,
            category: 'Culture',
          },
        ],
      });
    }
  }

  const budgetBreakdown: BudgetBreakdownItem[] =
    parsedJson.budgetBreakdown?.map((b) => ({
      category: b.category ?? 'General',
      name: b.name ?? 'Expense',
      amount: Number(b.amount) || 0,
    })) || [
      { category: 'Accommodation', name: 'Stay & Hotels', amount: params.days * 2500 },
      { category: 'Food & Dining', name: 'Meals & Dining', amount: params.days * 1200 },
      { category: 'Local Transport', name: 'Local Transfers & Cabs', amount: params.days * 800 },
      { category: 'Activities & Entry', name: 'Sightseeing & Entry Passes', amount: params.days * 600 },
    ];

  const totalBudget =
    parsedJson.totalEstimatedBudget ||
    budgetBreakdown.reduce((sum, item) => sum + (item.amount || 0), 0);

  return {
    destination: params.destination,
    daysCount: params.days,
    summary: parsedJson.summary || `A comprehensive ${params.days}-day plan for ${params.destination}.`,
    weatherForecast: parsedJson.weatherForecast || `Comfortable planning for ${params.weather || 'seasonal'} conditions.`,
    packingTips: parsedJson.packingTips || [
      'Comfortable walking shoes',
      'Weather-appropriate layers and rain/sun protection',
      'Portable charger & refillable water bottle',
    ],
    days,
    budgetBreakdown,
    totalEstimatedBudget: totalBudget,
    currency: params.currency || 'INR',
    markdown: rawText,
  };
}

function normalizeCostCategory(cat?: string): string {
  if (!cat) return 'activities';
  const c = cat.toLowerCase();
  if (c.includes('hotel') || c.includes('stay') || c.includes('accommodat') || c.includes('room')) return 'accommodation';
  if (c.includes('food') || c.includes('dine') || c.includes('dining') || c.includes('meal') || c.includes('snack') || c.includes('cafe')) return 'food';
  if (c.includes('flight') || c.includes('plane') || c.includes('air') || c.includes('airline')) return 'flights';
  if (c.includes('transit') || c.includes('transport') || c.includes('cab') || c.includes('taxi') || c.includes('bus') || c.includes('train')) return 'transport';
  if (c.includes('sight') || c.includes('monument') || c.includes('museum')) return 'sightseeing';
  if (c.includes('shop') || c.includes('market') || c.includes('souvenir')) return 'shopping';
  return 'activities';
}

export async function generateItinerary(
  params: ItineraryRequest,
  onChunk?: (chunk: string) => void,
): Promise<StructuredItinerary> {
  // All AI requests run through the NestJS backend
  try {
    const res = await apiClient.post(
      '/ai/plan-itinerary',
      params,
      { timeout: 90000 },
    );
    const itinerary = res.data as StructuredItinerary;
    if (onChunk && itinerary.markdown) {
      onChunk(itinerary.markdown);
    }
    return itinerary;
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (err as Error)?.message ||
      'Failed to generate itinerary. Please check that GEMINI_API_KEY is configured in server/.env.';
    throw new Error(msg);
  }
}

export async function chatWithAssistant(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  tripContext?: Record<string, unknown>,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  // All AI chat runs through the NestJS backend
  try {
    const res = await apiClient.post(
      '/ai/chat',
      {
        messages,
        tripContext,
      },
      { timeout: 60000 },
    );
    const reply = (res.data?.reply as string) || '';
    if (onChunk) onChunk(reply);
    return reply;
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (err as Error)?.message ||
      'Failed to send chat message. Please verify your GEMINI_API_KEY in server/.env.';
    throw new Error(msg);
  }
}

export interface ApplyProgress {
  step: string;
  percent: number;
}

/**
 * Apply the generated itinerary directly into a trip's plan!
 * Adds days, places, place assignments to days, weather notes, and budget items.
 */
export async function applyItineraryToTrip(
  tripId: number,
  itinerary: StructuredItinerary,
  options: {
    createDays?: boolean;
    addPlaces?: boolean;
    addBudget?: boolean;
    addWeatherNotes?: boolean;
    onProgress?: (progress: ApplyProgress) => void;
  } = {},
): Promise<{ daysAdded: number; placesAdded: number; budgetItemsAdded: number }> {
  const {
    createDays = true,
    addPlaces = true,
    addBudget = true,
    addWeatherNotes = true,
    onProgress,
  } = options;

  let daysAdded = 0;
  let placesAdded = 0;
  let budgetItemsAdded = 0;

  onProgress?.({ step: 'Loading trip days...', percent: 10 });

  // 1. Get or create days
  let existingDays: Day[] = [];
  try {
    const daysRes = await daysApi.list(tripId);
    existingDays = (daysRes?.days || daysRes || []) as Day[];
  } catch {
    existingDays = [];
  }

  const sortedDays = [...existingDays].sort(
    (a, b) => (a.day_number ?? 0) - (b.day_number ?? 0),
  );

  const neededDaysCount = itinerary.days.length;
  const daysMap: Record<number, Day> = {};

  // Map existing days by 1-based index
  sortedDays.forEach((d, i) => {
    daysMap[i + 1] = d;
  });

  if (createDays && sortedDays.length < neededDaysCount) {
    const toCreate = neededDaysCount - sortedDays.length;
    for (let i = 0; i < toCreate; i++) {
      const dayNum = sortedDays.length + i + 1;
      onProgress?.({
        step: `Adding Day ${dayNum}...`,
        percent: 10 + Math.round((i / toCreate) * 20),
      });
      try {
        const newDayRes = await daysApi.create(tripId, {
          position: dayNum,
          notes: itinerary.days[dayNum - 1]?.weatherNote || undefined,
        });
        const createdDay = newDayRes.day;
        daysMap[dayNum] = createdDay;
        daysAdded++;
      } catch (err) {
        console.warn(`Could not create day ${dayNum}:`, err);
      }
    }
  }

  // 2. Add places and assign to days
  if (addPlaces) {
    let activityCount = 0;
    const totalActivities = itinerary.days.reduce(
      (sum, d) => sum + d.activities.length,
      0,
    );

    for (const dayPlan of itinerary.days) {
      const targetDay = daysMap[dayPlan.dayNumber];
      const targetDayId = targetDay?.id;

      for (const act of dayPlan.activities) {
        activityCount++;
        onProgress?.({
          step: `Adding place: ${act.name}...`,
          percent: 30 + Math.round((activityCount / Math.max(1, totalActivities)) * 40),
        });

        try {
          // Create place
          const placeRes = await placesApi.create(tripId, {
            name: act.name,
            description: `${act.time ? `[${act.time}] ` : ''}${act.description}`,
            address: itinerary.destination,
            notes: act.duration ? `Duration: ${act.duration}` : undefined,
          });
          const createdPlace = (placeRes as { place?: Place })?.place ?? (placeRes as unknown as Place);
          placesAdded++;

          // Assign to day if day exists
          if (targetDayId && createdPlace?.id) {
            await assignmentsApi.create(tripId, targetDayId, {
              place_id: createdPlace.id,
              notes: act.time ? `Scheduled: ${act.time}` : undefined,
            });
          }
        } catch (err) {
          console.warn(`Error adding place ${act.name}:`, err);
        }
      }

      // Add weather note to the day
      if (addWeatherNotes && targetDayId && dayPlan.weatherNote) {
        try {
          await dayNotesApi.create(tripId, targetDayId, {
            text: `☀️ Weather: ${dayPlan.weatherNote}`.slice(0, 500),
            icon: 'Sun',
          });
        } catch {
          // ignore day note failure
        }
      }
    }
  }

  // 3. Add budget items
  if (addBudget && itinerary.budgetBreakdown?.length) {
    onProgress?.({ step: 'Adding budget estimates...', percent: 80 });
    for (const item of itinerary.budgetBreakdown) {
      try {
        await budgetApi.create(tripId, {
          name: item.name,
          category: normalizeCostCategory(item.category),
          total_price: item.amount,
          currency: itinerary.currency || 'INR',
        });
        budgetItemsAdded++;
      } catch (err) {
        console.warn(`Error adding budget item ${item.name}:`, err);
      }
    }
  }

  onProgress?.({ step: 'Complete!', percent: 100 });
  return { daysAdded, placesAdded, budgetItemsAdded };
}

/**
 * Creates a brand new Trip in TREK and applies the itinerary to it!
 */
export async function createNewTripFromItinerary(
  itinerary: StructuredItinerary,
  startDate?: string,
  onProgress?: (progress: ApplyProgress) => void,
): Promise<Trip> {
  onProgress?.({ step: `Creating new trip for ${itinerary.destination}...`, percent: 5 });

  const title = `Trip to ${itinerary.destination}`;
  const tripRes = await tripsApi.create({
    title,
    description: `AI-generated itinerary for ${itinerary.destination}`,
    currency: itinerary.currency || 'INR',
    start_date: startDate || undefined,
  });

  const trip = ((tripRes as { trip?: Trip })?.trip ?? (tripRes as unknown as Trip)) as Trip;

  await applyItineraryToTrip(trip.id, itinerary, {
    createDays: true,
    addPlaces: true,
    addBudget: true,
    addWeatherNotes: true,
    onProgress,
  });

  return trip;
}
