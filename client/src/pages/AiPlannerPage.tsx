import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import Navbar from "../components/Layout/Navbar";
import {
  generateItinerary, chatWithAssistant, createNewTripFromItinerary,
  checkAiKeyStatus, type StructuredItinerary, type ApplyProgress,
} from "../services/aiPlannerService";
import { AiKeyModal } from "../components/Planner/AiKeyModal";
import { useToast } from "../components/shared/Toast";
import {
  Sparkles, MapPin, Calendar, Wallet, Cloud, Sun, CloudRain, Snowflake,
  Wind, Utensils, Camera, Music, Backpack, BookOpen, Zap, RefreshCw,
  Clock, Tag, CheckCircle, AlertCircle, Copy, Bot, Send, X,
  ChevronRight, ChevronLeft, Key, Thermometer,
  DollarSign, FolderPlus, Loader2, RotateCcw, Shield,
} from "lucide-react";

const BUDGET_OPTIONS = [
  { id: "budget", label: "Budget",   icon: "🎒", desc: "Backpacker-friendly" },
  { id: "mid",    label: "Mid-range", icon: "🏨", desc: "Comfortable & balanced" },
  { id: "luxury", label: "Luxury",   icon: "💎", desc: "Premium experience" },
];
const STYLE_OPTIONS = [
  { id: "solo",   label: "Solo",   icon: "🧍" },
  { id: "couple", label: "Couple", icon: "👫" },
  { id: "family", label: "Family", icon: "👨‍👩‍👧" },
  { id: "group",  label: "Group",  icon: "👥" },
];
const WEATHER_OPTIONS = [
  { id: "summer",  label: "Summer",  Icon: Sun,         color: "#f59e0b" },
  { id: "monsoon", label: "Monsoon", Icon: CloudRain,   color: "#0284c7" },
  { id: "winter",  label: "Winter",  Icon: Snowflake,   color: "#38bdf8" },
  { id: "spring",  label: "Spring",  Icon: Wind,        color: "#10b981" },
  { id: "autumn",  label: "Autumn",  Icon: Thermometer, color: "#f97316" },
];
const INTEREST_OPTIONS = [
  { id: "culture",     label: "Culture & Heritage",  Icon: BookOpen },
  { id: "food",        label: "Food & Cuisine",       Icon: Utensils },
  { id: "adventure",   label: "Adventure & Trekking", Icon: Backpack },
  { id: "photography", label: "Photography",          Icon: Camera },
  { id: "nightlife",   label: "Nightlife & Music",    Icon: Music },
  { id: "nature",      label: "Nature & Wildlife",    Icon: Zap },
];
const CURRENCY_OPTIONS = ["INR","USD","EUR","GBP","AED","SGD","JPY","AUD"];

const SLOT_STYLES: Record<string, { badgeClass: string; label: string }> = {
  morning:   { badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20", label: "Morning" },
  afternoon: { badgeClass: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20", label: "Afternoon" },
  evening:   { badgeClass: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20", label: "Evening" },
};

const BAR_COLORS = [
  "from-slate-700 to-slate-900 dark:from-slate-300 dark:to-slate-100",
  "from-emerald-600 to-teal-700",
  "from-sky-600 to-blue-700",
  "from-amber-500 to-orange-600",
  "from-teal-600 to-emerald-700",
  "from-indigo-600 to-slate-800",
];

function fmtCur(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all ${
        selected
          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm"
          : "bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  if (done) {
    return (
      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm bg-emerald-500 text-white shadow-sm transition-all shrink-0">
        <CheckCircle size={17} />
      </div>
    );
  }
  if (active) {
    return (
      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm ring-4 ring-slate-900/10 dark:ring-white/10 transition-all shrink-0">
        {n}
      </div>
    );
  }
  return (
    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 transition-all shrink-0">
      {n}
    </div>
  );
}

function ActivityRow({ act, currency }: { act: any; currency: string }) {
  const slot = SLOT_STYLES[act.timeSlot] || SLOT_STYLES.morning;
  return (
    <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-3 sm:p-4 mb-2.5 transition-all">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`text-[10px] sm:text-xs font-semibold px-2.5 py-0.5 rounded-full ${slot.badgeClass}`}>
              {slot.label}
            </span>
            {act.time && (
              <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Clock size={11} /> {act.time}
              </span>
            )}
            {act.duration && (
              <span className="text-xs text-slate-400 dark:text-slate-500">· {act.duration}</span>
            )}
          </div>
          <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mb-1">
            {act.name}
          </div>
          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {act.description}
          </div>
        </div>
        {!!act.estimatedCost && act.estimatedCost > 0 && (
          <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1 whitespace-nowrap shrink-0">
            ~{fmtCur(act.estimatedCost, currency)}
          </div>
        )}
      </div>
      {act.category && (
        <div className="mt-2.5">
          <span className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-700/60 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
            <Tag size={10} /> {act.category}
          </span>
        </div>
      )}
    </div>
  );
}

function DayCard({ day, currency }: { day: any; currency: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden mb-3.5 transition-all">
      <button
        onClick={() => setOpen((o) => !o)}
        type="button"
        className="w-full flex items-center gap-3 p-4 sm:p-5 bg-transparent border-none cursor-pointer text-left hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center font-extrabold text-sm shadow-sm shrink-0">
          D{day.dayNumber}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
            {day.title}
          </div>
          {day.weatherNote && (
            <div className="text-xs text-sky-600 dark:text-sky-400 mt-0.5 flex items-center gap-1.5">
              <Cloud size={12} /> {day.weatherNote}
            </div>
          )}
        </div>
        <ChevronRight
          size={18}
          className={`text-slate-400 dark:text-slate-500 transition-transform duration-200 ${
            open ? "rotate-90" : "rotate-0"
          }`}
        />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 sm:px-5 sm:pb-5 pt-0">
          {day.activities.map((a: any, i: number) => (
            <ActivityRow key={i} act={a} currency={currency} />
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetBars({ items, total, currency }: { items: any[]; total: number; currency: string }) {
  return (
    <div className="flex flex-col gap-3.5">
      {items.map((item, i) => {
        const pct = total > 0 ? Math.round((item.amount / total) * 100) : 0;
        return (
          <div key={i}>
            <div className="flex justify-between mb-1.5 text-xs sm:text-sm">
              <span className="text-slate-700 dark:text-slate-300 font-medium">{item.name}</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {fmtCur(item.amount, currency)}{" "}
                <span className="text-slate-400 dark:text-slate-500 font-normal">({pct}%)</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${BAR_COLORS[i % BAR_COLORS.length]} transition-all duration-700`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      <div className="mt-2 p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-center">
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 font-medium">
          Total Estimated Budget
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
          {fmtCur(total, currency)}
        </div>
      </div>
    </div>
  );
}

export default function AiPlannerPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [formPage, setFormPage] = useState(0);
  const [destination, setDestination] = useState("");
  const [days, setDays] = useState(5);
  const [startDate, setStartDate] = useState("");
  const [weather, setWeather] = useState("summer");
  const [travelStyle, setTravelStyle] = useState("couple");
  const [budget, setBudget] = useState("mid");
  const [currency, setCurrency] = useState("INR");
  const [interests, setInterests] = useState<string[]>(["culture", "food"]);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyStatus, setKeyStatus] = useState<{ configured: boolean; model?: string }>({
    configured: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState<StructuredItinerary | null>(null);
  const [viewMode, setViewMode] = useState<"days" | "budget" | "tips" | "markdown">("days");
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<ApplyProgress | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMsgs, setChatMsgs] = useState<Array<{ role: "user" | "assistant"; content: string; id: string }>>([
    {
      role: "assistant",
      id: "init",
      content:
        "Hi! I am Trip Mate AI.\n\nGenerate your itinerary first, then ask me anything — packing tips, local food, hidden gems, or budget hacks!",
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs]);

  useEffect(() => {
    checkAiKeyStatus().then(setKeyStatus);
  }, []);

  const toggleInterest = (id: string) =>
    setInterests((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));

  const generate = useCallback(async () => {
    if (!destination.trim()) {
      setError("Please enter a destination.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await generateItinerary({
        destination: destination.trim(),
        days,
        budget,
        currency,
        weather,
        travelStyle,
        interests,
        startDate: startDate || undefined,
      });
      setItinerary(result);
      toast.success("Itinerary generated!");
    } catch (e: unknown) {
      const msg = (e instanceof Error ? e.message : String(e)) || "Generation failed. Check your API key.";
      setError(msg);
      if (msg.toLowerCase().includes("key")) setKeyModalOpen(true);
    } finally {
      setLoading(false);
    }
  }, [destination, days, budget, currency, weather, travelStyle, interests, startDate, toast]);

  const applyToNewTrip = useCallback(async () => {
    if (!itinerary || applying) return;
    setApplying(true);
    setApplyProgress(null);
    try {
      const trip = await createNewTripFromItinerary(itinerary, startDate || undefined, setApplyProgress);
      toast.success("Trip created!");
      setTimeout(() => navigate(`/trips/${trip.id}`), 800);
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : String(e)) || "Failed");
    } finally {
      setApplying(false);
      setApplyProgress(null);
    }
  }, [itinerary, applying, startDate, navigate, toast]);

  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const uid = Date.now().toString();
    const aid = (Date.now() + 1).toString();
    setChatMsgs((prev) => [...prev, { role: "user", id: uid, content: text }, { role: "assistant", id: aid, content: "" }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const history = chatMsgs
        .filter((m) => m.id !== "init")
        .concat({ role: "user", id: uid, content: text })
        .map((m) => ({ role: m.role, content: m.content }));
      const ctx = itinerary
        ? {
            destination: itinerary.destination,
            days: itinerary.daysCount,
            weather,
            budget,
            currency,
            dayPlans: itinerary.days.map((d) => ({
              day: d.dayNumber,
              title: d.title,
              activities: d.activities.map((a) => `${a.name} (${a.timeSlot}${a.estimatedCost ? ` ~${a.estimatedCost}` : ""})`),
            })),
            packingTips: itinerary.packingTips,
            budgetSummary: itinerary.budgetBreakdown.map((b) => `${b.name}: ${b.amount} ${itinerary.currency}`),
          }
        : undefined;
      const reply = await chatWithAssistant(history, ctx as Record<string, unknown> | undefined);
      setChatMsgs((prev) => prev.map((m) => (m.id === aid ? { ...m, content: reply } : m)));
    } catch (err: unknown) {
      const errTxt = err instanceof Error ? err.message : "Failed to get reply from AI assistant.";
      setChatMsgs((prev) => prev.map((m) => (m.id === aid ? { ...m, content: `⚠️ ${errTxt}` } : m)));
    } finally {
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  }, [chatInput, chatLoading, chatMsgs, itinerary, weather, budget, currency]);

  const copyMarkdown = () => {
    if (itinerary) {
      navigator.clipboard.writeText(itinerary.markdown).then(() => toast.success("Copied!"));
    }
  };

  const inputClass =
    "w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-white/10 focus:border-slate-900 dark:focus:border-slate-400 text-sm transition-colors";
  const labelClass =
    "block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 relative font-sans">
      <div className="relative z-10 pt-[calc(var(--nav-h)+20px)] pb-24 px-4 sm:px-6 lg:px-8">
        <Navbar />

        {!itinerary ? (
          <div className="max-w-2xl mx-auto">
            {/* Header / Hero */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 mb-3 shadow-xs">
                <Sparkles size={13} className="text-emerald-600 dark:text-emerald-400" />
                <span>Powered by Google Gemini</span>
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
                AI Trip Planner
              </h1>
              <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-2.5 max-w-lg mx-auto">
                Personalized itinerary · Weather-smart · Budget-aware
              </p>
            </div>

            {/* Step Progress Indicator */}
            <div className="flex items-center justify-center gap-2 sm:gap-4 mb-8">
              {["Destination", "Style & Budget", "Interests"].map((label, i) => (
                <React.Fragment key={i}>
                  <button
                    type="button"
                    onClick={() => setFormPage(i)}
                    className="flex flex-col items-center gap-1.5 cursor-pointer bg-transparent border-none p-0 group"
                  >
                    <StepDot n={i + 1} active={formPage === i} done={formPage > i} />
                    <span
                      className={`text-[11px] sm:text-xs transition-colors ${
                        formPage === i
                          ? "font-semibold text-slate-900 dark:text-white"
                          : formPage > i
                          ? "font-medium text-emerald-600 dark:text-emerald-400"
                          : "font-medium text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                  {i < 2 && (
                    <div
                      className={`w-8 sm:w-16 h-0.5 mb-5 rounded-full transition-colors ${
                        formPage > i ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"
                      }`}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Form Container Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm sm:shadow-md p-6 sm:p-8 transition-all">
              {/* Backend AI Status Indicator */}
              <div
                className={`flex items-center justify-between p-3 sm:p-3.5 rounded-xl border text-xs sm:text-sm font-medium mb-6 ${
                  keyStatus.configured
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                    : "bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    {keyStatus.configured && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span
                      className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                        keyStatus.configured ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                    />
                  </span>
                  <span>
                    {keyStatus.configured
                      ? `Backend AI Active (${keyStatus.model || "Gemini"})`
                      : "Gemini API key not configured"}
                  </span>
                </div>
                <button
                  onClick={() => setKeyModalOpen(true)}
                  type="button"
                  className={`bg-transparent border-none cursor-pointer text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    keyStatus.configured
                      ? "text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200"
                      : "text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200"
                  }`}
                >
                  <Key size={13} />
                  {keyStatus.configured ? "View Status" : "Configure"}
                </button>
              </div>

              {/* Step 1: Destination, Days, Date, Weather */}
              {formPage === 0 && (
                <div className="flex flex-col gap-5">
                  <div>
                    <label className={labelClass}>
                      <MapPin size={14} className="text-slate-500 dark:text-slate-400" />
                      Destination *
                    </label>
                    <input
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="e.g. Goa, Paris, Manali, Kyoto…"
                      className={inputClass}
                      onKeyDown={(e) => e.key === "Enter" && setFormPage(1)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>
                        <Calendar size={14} className="text-slate-500 dark:text-slate-400" />
                        Number of Days
                      </label>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setDays((d) => Math.max(1, d - 1))}
                          type="button"
                          className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer"
                        >
                          -
                        </button>
                        <span className="text-2xl font-bold text-slate-900 dark:text-white w-12 text-center">
                          {days}
                        </span>
                        <button
                          onClick={() => setDays((d) => Math.min(30, d + 1))}
                          type="button"
                          className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className={labelClass}>
                        <Calendar size={14} className="text-slate-500 dark:text-slate-400" />
                        Start Date (optional)
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>
                      <Cloud size={14} className="text-slate-500 dark:text-slate-400" />
                      Season / Weather
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {WEATHER_OPTIONS.map((opt) => {
                        const sel = weather === opt.id;
                        const Ic = opt.Icon;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setWeather(opt.id)}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                              sel
                                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm"
                                : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            <Ic size={14} style={{ color: sel ? undefined : opt.color }} />
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Travel Style, Budget, Currency */}
              {formPage === 1 && (
                <div className="flex flex-col gap-5">
                  <div>
                    <label className={labelClass}>Travel Style</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {STYLE_OPTIONS.map((opt) => {
                        const sel = travelStyle === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setTravelStyle(opt.id)}
                            className={`p-3 rounded-xl border text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                              sel
                                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-sm"
                                : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            <span className="text-base sm:text-lg">{opt.icon}</span>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>
                      <Wallet size={14} className="text-slate-500 dark:text-slate-400" />
                      Budget Level
                    </label>
                    <div className="flex flex-col gap-2.5">
                      {BUDGET_OPTIONS.map((opt) => {
                        const sel = budget === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setBudget(opt.id)}
                            className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                              sel
                                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-sm"
                                : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                            }`}
                          >
                            <span className="text-xl">{opt.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div
                                className={`text-xs sm:text-sm font-bold ${
                                  sel ? "text-white dark:text-slate-900" : "text-slate-900 dark:text-white"
                                }`}
                              >
                                {opt.label}
                              </div>
                              <div
                                className={`text-xs ${
                                  sel
                                    ? "text-slate-300 dark:text-slate-600"
                                    : "text-slate-500 dark:text-slate-400"
                                }`}
                              >
                                {opt.desc}
                              </div>
                            </div>
                            {sel && (
                              <CheckCircle
                                size={17}
                                className={sel ? "text-emerald-400 dark:text-emerald-600" : ""}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>
                      <DollarSign size={14} className="text-slate-500 dark:text-slate-400" />
                      Currency
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {CURRENCY_OPTIONS.map((c) => (
                        <Chip key={c} selected={currency === c} onClick={() => setCurrency(c)}>
                          {c}
                        </Chip>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Interests */}
              {formPage === 2 && (
                <div className="flex flex-col gap-5">
                  <div>
                    <label className={labelClass}>
                      Interests{" "}
                      <span className="text-slate-400 dark:text-slate-500 font-normal">
                        (select any)
                      </span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {INTEREST_OPTIONS.map((opt) => {
                        const sel = interests.includes(opt.id);
                        const Ic = opt.Icon;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleInterest(opt.id)}
                            className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                              sel
                                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-sm"
                                : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            <Ic
                              size={15}
                              className={sel ? "text-white dark:text-slate-900" : "text-slate-500 dark:text-slate-400"}
                            />
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
                    <label className={labelClass}>
                      <Key size={14} className="text-slate-500 dark:text-slate-400" />
                      AI Configuration
                    </label>
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2.5 text-xs sm:text-sm">
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${
                            keyStatus.configured ? "bg-emerald-500" : "bg-amber-500"
                          }`}
                        />
                        <span
                          className={`font-semibold ${
                            keyStatus.configured
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-amber-700 dark:text-amber-400"
                          }`}
                        >
                          {keyStatus.configured
                            ? "Backend Gemini AI Ready"
                            : "API Key Not Configured in server/.env"}
                        </span>
                      </div>
                      <button
                        onClick={() => setKeyModalOpen(true)}
                        type="button"
                        className="bg-transparent border-none text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white cursor-pointer text-xs font-semibold"
                      >
                        Details
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                      Trip Mate securely processes all requests on the backend. No API keys are exposed to the client.
                    </p>
                  </div>
                </div>
              )}

              {/* Navigation Actions */}
              <div className="flex gap-3 mt-7">
                {formPage > 0 && (
                  <button
                    type="button"
                    onClick={() => setFormPage((p) => p - 1)}
                    className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                  >
                    <ChevronLeft size={16} /> Back
                  </button>
                )}
                {formPage < 2 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (formPage === 0 && !destination.trim()) {
                        setError("Please enter a destination.");
                        return;
                      }
                      setError(null);
                      setFormPage((p) => p + 1);
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-xs sm:text-sm font-semibold shadow-sm transition-all cursor-pointer"
                  >
                    Next <ChevronRight size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={generate}
                    disabled={loading}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-xs sm:text-sm font-semibold shadow-sm transition-all disabled:opacity-60 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Generating Itinerary...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Generate Itinerary
                      </>
                    )}
                  </button>
                )}
              </div>

              {error && (
                <div className="mt-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs sm:text-sm flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Itinerary Results View */
          <div className="max-w-4xl mx-auto">
            <button
              type="button"
              onClick={() => setItinerary(null)}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white mb-4 transition-colors bg-transparent border-none p-0 cursor-pointer"
            >
              <ChevronLeft size={16} /> Back to Planner
            </button>

            {/* Trip Summary Hero Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 sm:p-7 mb-6 relative overflow-hidden">
              <div className="flex justify-between items-start flex-wrap gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Sparkles size={12} /> AI-Generated Itinerary
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 m-0">
                    <MapPin size={22} className="text-emerald-500 shrink-0" />
                    <span>{itinerary.destination}</span>
                  </h2>
                  <div className="flex gap-2 sm:gap-3 mt-3 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      <Calendar size={12} /> {itinerary.daysCount} days
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      <Wallet size={12} /> {budget} · {currency}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      <Cloud size={12} /> {weather}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 items-center flex-wrap">
                  <button
                    type="button"
                    onClick={copyMarkdown}
                    title="Copy Markdown"
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={generate}
                    title="Regenerate"
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    <RotateCcw size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={applyToNewTrip}
                    disabled={applying}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-xs sm:text-sm font-semibold shadow-sm transition-all disabled:opacity-60 cursor-pointer"
                  >
                    {applying ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        {applyProgress?.step || "Creating Trip..."}
                      </>
                    ) : (
                      <>
                        <FolderPlus size={15} />
                        Create Trip
                      </>
                    )}
                  </button>
                </div>
              </div>

              <p className="mt-4 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {itinerary.summary}
              </p>

              {itinerary.weatherForecast && (
                <div className="mt-3.5 p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs sm:text-sm text-sky-700 dark:text-sky-300 flex items-center gap-2">
                  <Cloud size={14} className="shrink-0" />
                  <span>{itinerary.weatherForecast}</span>
                </div>
              )}

              {applying && applyProgress && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5 font-medium">
                    <span>{applyProgress.step}</span>
                    <span>{applyProgress.percent}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${applyProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Segmented View Mode Tabs */}
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 mb-5 gap-1 flex-wrap">
              {(["days", "budget", "tips", "markdown"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setViewMode(tab)}
                  className={`px-3.5 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                    viewMode === tab
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-transparent border-none"
                  }`}
                >
                  {tab === "days"
                    ? "Day-by-Day"
                    : tab === "budget"
                    ? "Budget"
                    : tab === "tips"
                    ? "Packing Tips"
                    : "Markdown"}
                </button>
              ))}
            </div>

            {/* View Tab 1: Day-by-Day */}
            {viewMode === "days" && (
              <div>
                <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setActiveDay(null)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      activeDay === null
                        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs"
                        : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                    }`}
                  >
                    All Days
                  </button>
                  {itinerary.days.map((d) => (
                    <button
                      key={d.dayNumber}
                      type="button"
                      onClick={() => setActiveDay(d.dayNumber)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                        activeDay === d.dayNumber
                          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs"
                          : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                      }`}
                    >
                      Day {d.dayNumber}
                    </button>
                  ))}
                </div>

                {itinerary.days
                  .filter((d) => activeDay === null || d.dayNumber === activeDay)
                  .map((day) => (
                    <DayCard key={day.dayNumber} day={day} currency={itinerary!.currency} />
                  ))}
              </div>
            )}

            {/* View Tab 2: Budget */}
            {viewMode === "budget" && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 sm:p-7">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-5">
                  Budget Breakdown
                </h3>
                <BudgetBars
                  items={itinerary.budgetBreakdown}
                  total={itinerary.totalEstimatedBudget}
                  currency={itinerary.currency}
                />
              </div>
            )}

            {/* View Tab 3: Packing Tips */}
            {viewMode === "tips" && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 sm:p-7">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-4">
                  Packing & Travel Tips
                </h3>
                <div className="flex flex-col gap-2.5">
                  {itinerary.packingTips.map((tip, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60"
                    >
                      <CheckCircle size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                      <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        {tip}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* View Tab 4: Raw Markdown */}
            {viewMode === "markdown" && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Raw Markdown
                  </span>
                  <button
                    type="button"
                    onClick={copyMarkdown}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
                <pre className="p-4 sm:p-5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed overflow-x-auto max-h-[500px] whitespace-pre-wrap font-mono">
                  {itinerary.markdown}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating AI Assistant Button */}
      {!chatOpen && (
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          title="Chat with Trip Mate AI"
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer border-none"
        >
          <Bot size={24} />
          <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-950" />
        </button>
      )}

      {/* Floating AI Chat Window */}
      {chatOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[90vw] max-w-[360px] h-[500px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70">
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center shrink-0">
              <Bot size={17} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Trip Mate AI
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                Online
              </div>
            </div>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 p-1 bg-transparent border-none cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-2.5">
            {chatMsgs.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "rounded-2xl rounded-tr-xs bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs"
                      : "rounded-2xl rounded-tl-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60"
                  }`}
                >
                  {msg.content || <span className="opacity-50 italic">Thinking...</span>}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-xs bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse delay-150" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse delay-300" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex gap-2 items-center">
              <input
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendChat())
                }
                placeholder="Ask about packing, routes, food..."
                className="flex-1 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-white/10"
              />
              <button
                type="button"
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border-none transition-colors ${
                  chatInput.trim()
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 cursor-pointer shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                }`}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Modal */}
      <AiKeyModal
        isOpen={keyModalOpen}
        onClose={() => setKeyModalOpen(false)}
        onKeySaved={() => checkAiKeyStatus().then(setKeyStatus)}
      />
    </div>
  );
}
