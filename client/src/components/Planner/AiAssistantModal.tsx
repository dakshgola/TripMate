import React, { useState, useEffect, useRef } from 'react';
import Modal from '../shared/Modal';
import {
  Sparkles,
  Bot,
  Send,
  Wand2,
  X,
  Sun,
  CloudRain,
  Snowflake,
  CloudSun,
  Calendar,
  Wallet,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Layers,
  MessageSquare,
  KeyRound,
  RotateCcw,
  Check,
  Copy,
  Info,
  MapPin,
  TrendingUp,
} from 'lucide-react';
import type { Trip, Day } from '../../types';
import {
  generateItinerary,
  chatWithAssistant,
  applyItineraryToTrip,
  checkAiKeyStatus,
  type StructuredItinerary,
  type ApplyProgress,
} from '../../services/aiPlannerService';
import { AiKeyModal } from './AiKeyModal';
import { useToast } from '../shared/Toast';

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip;
  days: Day[];
  onPlanApplied?: () => void;
}

const WEATHER_OPTIONS = [
  { value: 'pleasant', label: 'Pleasant / Spring', icon: CloudSun },
  { value: 'summer', label: 'Summer / Hot', icon: Sun },
  { value: 'monsoon', label: 'Monsoon / Rainy', icon: CloudRain },
  { value: 'winter', label: 'Winter / Cold', icon: Snowflake },
];

const BUDGET_TIERS = [
  { value: 'budget', label: 'Budget', desc: 'Hostels, local transit & street food' },
  { value: 'mid', label: 'Mid-range', desc: 'Comfortable hotels, cabs & cafes' },
  { value: 'luxury', label: 'Luxury', desc: 'Resorts, private tours & fine dining' },
];

const TRAVEL_STYLES = [
  { value: 'couple', label: 'Couple / Romance' },
  { value: 'family', label: 'Family with Kids' },
  { value: 'friends', label: 'Friends / Group' },
  { value: 'solo', label: 'Solo Explorer' },
  { value: 'backpacker', label: 'Backpacker' },
];

const INTEREST_TAGS = [
  'Must-see sights',
  'Local food & street eats',
  'Culture & heritage',
  'Nature & scenic viewpoints',
  'Adventure & hiking',
  'Shopping & local markets',
  'Relaxation & cafes',
  'Photography spots',
];

export function AiAssistantModal({
  isOpen,
  onClose,
  trip,
  days,
  onPlanApplied,
}: AiAssistantModalProps) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'plan' | 'chat'>('plan');
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyStatus, setKeyStatus] = useState<{ configured: boolean; source: string }>({
    configured: false,
    source: 'none',
  });

  const destinationInitial = trip.title || 'Manali';
  const daysInitial = Math.max(1, days.length || 5);
  const currencyInitial = trip.currency || 'INR';

  const [destination, setDestination] = useState(destinationInitial);
  const [daysCount, setDaysCount] = useState(daysInitial);
  const [weatherSeason, setWeatherSeason] = useState('pleasant');
  const [budgetTier, setBudgetTier] = useState('mid');
  const [customBudget, setCustomBudget] = useState('');
  const [travelStyle, setTravelStyle] = useState('couple');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    'Must-see sights',
    'Local food & street eats',
  ]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedItinerary, setGeneratedItinerary] = useState<StructuredItinerary | null>(null);

  const [isApplying, setIsApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<ApplyProgress | null>(null);

  const [chatMessages, setChatMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I'm your AI Trip Mate for **${trip.title}**.\n\nGenerate an itinerary or ask me anything — local recommendations, budget advice, or packing tips.`,
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAiKeyStatus().then((st) => setKeyStatus(st)).catch(() => {});
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const toggleInterest = (tag: string) => {
    setSelectedInterests((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleGenerate = async () => {
    if (!destination.trim()) {
      toast.error('Please enter a destination');
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateItinerary({
        destination: destination.trim(),
        days: daysCount,
        budget: customBudget ? customBudget : budgetTier,
        currency: currencyInitial,
        weather: weatherSeason,
        travelStyle,
        interests: selectedInterests,
        startDate: trip.start_date || undefined,
      });

      setGeneratedItinerary(result);
      toast.success('Itinerary generated successfully!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate itinerary';
      toast.error(msg);
      if (msg.toLowerCase().includes('key')) {
        setKeyModalOpen(true);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyToTrip = async () => {
    if (!generatedItinerary) return;
    setIsApplying(true);
    try {
      const res = await applyItineraryToTrip(trip.id, generatedItinerary, {
        createDays: true,
        addPlaces: true,
        addBudget: true,
        addWeatherNotes: true,
        onProgress: setApplyProgress,
      });

      toast.success(
        `Plan applied! Added ${res.placesAdded} places, ${res.daysAdded} days, and ${res.budgetItemsAdded} budget items.`,
      );
      onPlanApplied?.();
      setTimeout(() => {
        setIsApplying(false);
        setApplyProgress(null);
        onClose();
      }, 1000);
    } catch (err) {
      console.error(err);
      toast.error('Error applying plan to trip');
      setIsApplying(false);
      setApplyProgress(null);
    }
  };

  const handleSendChat = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isChatLoading) return;

    const userMsgId = Date.now().toString();
    const assistantMsgId = (Date.now() + 1).toString();

    setChatMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: trimmed },
      { id: assistantMsgId, role: 'assistant', content: '' },
    ]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const reply = await chatWithAssistant(
        [
          ...chatMessages
            .filter((m) => m.id !== 'welcome')
            .map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: trimmed },
        ],
        {
          tripTitle: trip.title,
          destination,
          days: daysCount,
          currency: currencyInitial,
          weather: weatherSeason,
          ...(generatedItinerary
            ? {
                itinerarySummary: generatedItinerary.summary,
                dayPlans: generatedItinerary.days.map((d) => ({
                  day: d.dayNumber,
                  title: d.title,
                  activities: d.activities.map((a) => a.name),
                })),
                packingTips: generatedItinerary.packingTips,
                budgetBreakdown: generatedItinerary.budgetBreakdown,
              }
            : {}),
        },
      );

      setChatMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, content: reply } : m)),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to get answer';
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `Error: ${msg}` }
            : m,
        ),
      );
    } finally {
      setIsChatLoading(false);
    }
  };

  const copyText = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="5xl"
        title={
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-content">AI Trip Planner</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                  Gemini
                </span>
              </div>
              <p className="text-xs text-content-muted font-normal">
                {trip.title} • {daysCount} Days • {currencyInitial}
              </p>
            </div>
          </div>
        }
      >
        <div className="flex flex-col h-[72vh] -mx-6 -my-6">
          {/* Sub Navigation Bar */}
          <div className="flex items-center justify-between border-b border-edge-secondary px-6 bg-surface-secondary/40 flex-shrink-0">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('plan')}
                className={`flex items-center gap-2 py-3 px-1 text-sm font-semibold transition-colors border-b-2 ${
                  activeTab === 'plan'
                    ? 'border-accent text-accent'
                    : 'border-transparent text-content-muted hover:text-content'
                }`}
              >
                <Wand2 className="w-4 h-4" /> Itinerary Generator
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className={`flex items-center gap-2 py-3 px-1 text-sm font-semibold transition-colors border-b-2 ${
                  activeTab === 'chat'
                    ? 'border-accent text-accent'
                    : 'border-transparent text-content-muted hover:text-content'
                }`}
              >
                <MessageSquare className="w-4 h-4" /> AI Chat Assistant
              </button>
            </div>

            <button
              type="button"
              onClick={() => setKeyModalOpen(true)}
              className="flex items-center gap-1.5 text-xs text-content-muted hover:text-content px-2.5 py-1 rounded-lg border border-edge bg-surface-card"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{keyStatus.configured ? 'AI Ready' : 'API Key'}</span>
            </button>
          </div>

          {/* Modal Content */}
          <div className="flex-1 overflow-hidden flex">
            {activeTab === 'plan' ? (
              <div className="flex flex-1 w-full overflow-hidden">
                {/* Left Panel: Preferences */}
                <div className="w-80 sm:w-96 border-r border-edge-secondary p-5 overflow-y-auto flex-shrink-0 flex flex-col gap-4 bg-surface-secondary/30">
                  {/* Destination */}
                  <div>
                    <label className="block text-xs font-semibold text-content-secondary uppercase tracking-wider mb-1.5">
                      Destination
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 absolute left-3 top-3 text-content-muted" />
                      <input
                        type="text"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        placeholder="e.g. Manali, Goa, Paris"
                        className="w-full bg-surface-card border border-edge rounded-xl pl-9 pr-3 py-2 text-sm text-content placeholder:text-content-faint focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>

                  {/* Days Slider */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-semibold text-content-secondary uppercase tracking-wider">
                        Trip Duration
                      </label>
                      <span className="text-xs font-bold text-accent">{daysCount} Days</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={15}
                        value={daysCount}
                        onChange={(e) => setDaysCount(Number(e.target.value))}
                        className="flex-1 accent-accent cursor-pointer"
                      />
                      <div className="flex gap-1">
                        {[3, 5, 7, 10].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDaysCount(d)}
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              daysCount === d
                                ? 'bg-accent text-white'
                                : 'bg-surface-card border border-edge text-content-muted'
                            }`}
                          >
                            {d}d
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Weather / Season */}
                  <div>
                    <label className="block text-xs font-semibold text-content-secondary uppercase tracking-wider mb-1.5">
                      Weather & Season
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {WEATHER_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        const active = weatherSeason === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setWeatherSeason(opt.value)}
                            className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-medium transition-all ${
                              active
                                ? 'border-accent bg-accent/15 text-accent'
                                : 'border-edge bg-surface-card text-content-secondary hover:bg-surface-hover'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{opt.label.split(' / ')[0]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Budget Tier */}
                  <div>
                    <label className="block text-xs font-semibold text-content-secondary uppercase tracking-wider mb-1.5">
                      Budget Level ({currencyInitial})
                    </label>
                    <div className="flex flex-col gap-2">
                      {BUDGET_TIERS.map((tier) => {
                        const active = budgetTier === tier.value && !customBudget;
                        return (
                          <button
                            key={tier.value}
                            type="button"
                            onClick={() => {
                              setBudgetTier(tier.value);
                              setCustomBudget('');
                            }}
                            className={`p-2.5 rounded-xl border text-left transition-all ${
                              active
                                ? 'border-accent bg-accent/10 text-content'
                                : 'border-edge bg-surface-card text-content-secondary hover:bg-surface-hover'
                            }`}
                          >
                            <div className="text-xs font-bold text-content">{tier.label}</div>
                            <div className="text-[11px] text-content-muted mt-0.5">{tier.desc}</div>
                          </button>
                        );
                      })}
                      <input
                        type="text"
                        value={customBudget}
                        onChange={(e) => setCustomBudget(e.target.value)}
                        placeholder={`Or enter custom amount (${currencyInitial})`}
                        className="w-full bg-surface-card border border-edge rounded-xl px-3 py-2 text-xs text-content placeholder:text-content-faint focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>

                  {/* Travel Style */}
                  <div>
                    <label className="block text-xs font-semibold text-content-secondary uppercase tracking-wider mb-1.5">
                      Travel Style
                    </label>
                    <select
                      value={travelStyle}
                      onChange={(e) => setTravelStyle(e.target.value)}
                      className="w-full bg-surface-card border border-edge rounded-xl px-3 py-2 text-xs text-content focus:outline-none focus:border-accent"
                    >
                      {TRAVEL_STYLES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Interests */}
                  <div>
                    <label className="block text-xs font-semibold text-content-secondary uppercase tracking-wider mb-1.5">
                      Interests
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {INTEREST_TAGS.map((tag) => {
                        const active = selectedInterests.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleInterest(tag)}
                            className={`px-2.5 py-1 rounded-full text-xs transition-all ${
                              active
                                ? 'border-accent bg-accent/15 text-accent font-medium border'
                                : 'border-edge bg-surface-card text-content-muted border hover:text-content'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!destination.trim() || isGenerating}
                    className="w-full mt-2 py-3 px-4 rounded-xl font-semibold text-sm bg-accent text-white hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    <span>{isGenerating ? 'Generating Itinerary...' : 'Generate Itinerary'}</span>
                  </button>
                </div>

                {/* Right Panel: Itinerary Result */}
                <div className="flex-1 p-6 overflow-y-auto bg-surface">
                  {generatedItinerary ? (
                    <div className="space-y-6">
                      {/* Summary Banner */}
                      <div className="bg-surface-card border border-edge rounded-2xl p-5 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <h3 className="font-bold text-lg text-content">Trip Overview</h3>
                            <p className="text-sm text-content-muted mt-1 leading-relaxed">
                              {generatedItinerary.summary}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleApplyToTrip}
                            disabled={isApplying}
                            className="px-5 py-2.5 rounded-xl font-semibold text-sm bg-emerald-600 text-white hover:bg-emerald-500 transition-all flex items-center gap-2 shadow-sm flex-shrink-0 disabled:opacity-50"
                          >
                            {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            <span>{isApplying ? 'Applying to Trip...' : 'Apply Itinerary to Trip'}</span>
                          </button>
                        </div>

                        {/* Progress Bar if applying */}
                        {applyProgress && (
                          <div className="mt-4 pt-4 border-t border-edge-secondary">
                            <div className="flex justify-between text-xs text-content-muted mb-1">
                              <span>{applyProgress.step}</span>
                              <span>{applyProgress.percent}%</span>
                            </div>
                            <div className="w-full bg-surface-secondary h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-emerald-500 h-full transition-all duration-300"
                                style={{ width: `${applyProgress.percent}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Advisory & Budget Highlights */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Packing & Weather */}
                        <div className="bg-surface-card border border-edge rounded-xl p-4">
                          <div className="flex items-center gap-2 font-semibold text-sm text-content mb-3">
                            <CloudSun className="w-4 h-4 text-accent" /> Weather & Packing Tips
                          </div>
                          <ul className="space-y-2 text-xs text-content-secondary">
                            {generatedItinerary.packingTips.map((tip, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-emerald-500">✓</span>
                                <span>{tip}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Budget Breakdown */}
                        <div className="bg-surface-card border border-edge rounded-xl p-4">
                          <div className="flex items-center gap-2 font-semibold text-sm text-content mb-3">
                            <Wallet className="w-4 h-4 text-accent" /> Estimated Budget ({currencyInitial})
                          </div>
                          <div className="space-y-2 text-xs text-content-secondary">
                            {generatedItinerary.budgetBreakdown.map((item, idx) => (
                              <div key={idx} className="flex justify-between items-center py-1 border-b border-edge-secondary last:border-0">
                                <span>{item.category || item.name}</span>
                                <span className="font-semibold text-content">{item.amount?.toLocaleString()} {currencyInitial}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Day by Day Plan */}
                      <div>
                        <h4 className="font-bold text-sm text-content-secondary uppercase tracking-wider mb-4">
                          Day-by-Day Itinerary Plan
                        </h4>
                        <div className="space-y-4">
                          {generatedItinerary.days.map((day) => (
                            <div key={day.dayNumber} className="bg-surface-card border border-edge rounded-xl overflow-hidden shadow-sm">
                              <div className="bg-surface-secondary/60 border-b border-edge px-4 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-6 h-6 rounded-md bg-accent text-white flex items-center justify-center text-xs font-bold">
                                    {day.dayNumber}
                                  </div>
                                  <span className="font-semibold text-sm text-content">{day.title}</span>
                                </div>
                                {day.weatherNote && (
                                  <span className="text-xs text-content-muted">{day.weatherNote}</span>
                                )}
                              </div>
                              <div className="p-4 space-y-3">
                                {day.activities.map((act, actIdx) => (
                                  <div key={actIdx} className="flex items-start gap-3 text-sm pb-2.5 border-b border-edge-secondary last:border-0 last:pb-0">
                                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-secondary text-content-muted flex-shrink-0 mt-0.5">
                                      {act.timeSlot}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-content">{act.name}</div>
                                      {act.description && (
                                        <p className="text-xs text-content-muted mt-0.5">{act.description}</p>
                                      )}
                                    </div>
                                    {act.estimatedCost && (
                                      <span className="text-xs font-medium text-content-faint flex-shrink-0">
                                        ~{act.estimatedCost} {currencyInitial}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                      <div className="w-14 h-14 rounded-2xl bg-surface-card border border-edge flex items-center justify-center text-accent mb-4 shadow-sm">
                        <Wand2 className="w-7 h-7 text-accent" />
                      </div>
                      <h3 className="font-bold text-base text-content">Custom Trip Generation</h3>
                      <p className="text-sm text-content-muted max-w-sm mt-1 mb-6">
                        Configure your preferences on the left and click &quot;Generate Itinerary&quot; to build a complete custom plan with Gemini.
                      </p>
                      <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={!destination.trim() || isGenerating}
                        className="px-5 py-2.5 rounded-xl font-medium text-sm bg-accent text-white hover:opacity-90 transition-all flex items-center gap-2"
                      >
                        <Sparkles className="w-4 h-4" /> Start Generating
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Chat Tab */
              <div className="flex flex-col flex-1 h-full overflow-hidden bg-surface">
                {/* Chat Message List */}
                <div ref={chatScrollRef} className="flex-1 p-6 overflow-y-auto space-y-4">
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center flex-shrink-0 mt-1">
                          <Bot className="w-4 h-4 text-accent" />
                        </div>
                      )}
                      <div
                        className={`p-3.5 rounded-2xl text-sm leading-relaxed max-w-[80%] whitespace-pre-line ${
                          msg.role === 'user'
                            ? 'bg-accent text-white rounded-tr-sm'
                            : 'bg-surface-card border border-edge text-content rounded-tl-sm shadow-sm'
                        }`}
                      >
                        {msg.content || (
                          <div className="flex items-center gap-2 text-content-muted">
                            <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Chat Input */}
                <div className="p-4 border-t border-edge-secondary bg-surface-card flex items-center gap-3">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendChat(chatInput);
                      }
                    }}
                    placeholder="Ask about places to visit, local cuisine, budget advice..."
                    className="flex-1 bg-surface-secondary border border-edge rounded-xl px-4 py-2.5 text-sm text-content placeholder:text-content-faint focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => handleSendChat(chatInput)}
                    disabled={!chatInput.trim() || isChatLoading}
                    className="p-2.5 rounded-xl bg-accent text-white hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center flex-shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {keyModalOpen && (
        <AiKeyModal
          isOpen={keyModalOpen}
          onClose={() => setKeyModalOpen(false)}
          onKeySaved={() => {
            checkAiKeyStatus().then(setKeyStatus).catch(() => {});
          }}
        />
      )}
    </>
  );
}
