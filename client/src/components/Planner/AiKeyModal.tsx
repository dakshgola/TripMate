import React, { useState, useEffect } from 'react';
import { KeyRound, X, ExternalLink, AlertCircle, ShieldCheck, RefreshCw, Check } from 'lucide-react';
import { checkAiKeyStatus } from '../../services/aiPlannerService';

interface AiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeySaved?: () => void;
}

export function AiKeyModal({ isOpen, onClose, onKeySaved }: AiKeyModalProps) {
  const [status, setStatus] = useState<{ configured: boolean; model?: string }>({ configured: false });
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = async () => {
    setRefreshing(true);
    try {
      const s = await checkAiKeyStatus();
      setStatus(s);
      onKeySaved?.();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-surface-primary border border-edge-subtle text-content-primary shadow-2xl"
        style={{
          width: '100%',
          maxWidth: 480,
          borderRadius: 20,
          overflow: 'hidden',
          animation: 'fadeScale 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.15), rgba(247, 147, 30, 0.05))',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #ff6b35, #f7931e)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(255, 107, 53, 0.35)',
              }}
            >
              <KeyRound size={20} color="white" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Google Gemini AI Engine</h3>
              <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>Server-side AI itinerary planner</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              opacity: 0.6,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Current Status Pill */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              background: status.configured ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${status.configured ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {status.configured ? (
                <ShieldCheck size={18} color="#22c55e" />
              ) : (
                <AlertCircle size={18} color="#ef4444" />
              )}
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {status.configured ? 'Backend AI Service Active' : 'Backend Key Not Configured'}
              </span>
            </div>
            <span style={{ fontSize: 11, opacity: 0.8 }}>
              {status.configured ? (status.model || 'gemini-flash-lite-latest') : 'server/.env'}
            </span>
          </div>

          {/* Architecture / Security Info */}
          <div
            className="bg-surface-secondary border border-edge-faint"
            style={{
              padding: '14px 16px',
              borderRadius: 12,
              fontSize: 12.5,
              lineHeight: 1.55,
              opacity: 0.9,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={15} color="#22c55e" /> Secure Server-Side Architecture
            </div>
            <p style={{ margin: '0 0 8px 0', opacity: 0.8 }}>
              All AI itinerary generation and chat requests are processed through Trip Mate's NestJS backend. API credentials are kept exclusively on the server and never exposed to the browser.
            </p>
            <div style={{ fontWeight: 600, marginTop: 8, marginBottom: 4 }}>To configure or update the key:</div>
            <ol style={{ margin: 0, paddingLeft: 18, opacity: 0.85 }}>
              <li>
                Open <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>server/.env</code>
              </li>
              <li>
                Set <code style={{ color: '#ff6b35' }}>GEMINI_API_KEY=your_gemini_api_key</code>
              </li>
              <li>Restart or reload the backend service</li>
            </ol>
          </div>

          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12.5,
              color: '#ff6b35',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            <ExternalLink size={14} /> Get a free Gemini API key at Google AI Studio
          </a>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={fetchStatus}
              disabled={refreshing}
              className="border border-edge-subtle"
              style={{
                padding: '11px 16px',
                borderRadius: 12,
                background: 'none',
                color: 'inherit',
                cursor: refreshing ? 'wait' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              Refresh Status
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '11px 18px',
                borderRadius: 12,
                border: 'none',
                background: 'linear-gradient(135deg, #ff6b35, #f7931e)',
                color: 'white',
                fontWeight: 700,
                fontSize: 13.5,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 14px rgba(255, 107, 53, 0.35)',
              }}
            >
              <Check size={16} /> Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
