import React, { useState, useEffect } from 'react';
import Modal from '../shared/Modal';
import { KeyRound, ShieldCheck, RefreshCw, Check, AlertCircle } from 'lucide-react';
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2.5">
          <KeyRound className="w-5 h-5 text-accent" />
          <span className="font-semibold text-base text-content">Gemini AI Status</span>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Status card */}
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            status.configured
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}
        >
          <div className="flex items-center gap-3">
            {status.configured ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400" />
            )}
            <div>
              <div className="font-semibold text-sm">
                {status.configured ? 'AI Backend Connected' : 'No Gemini Key Found'}
              </div>
              <div className="text-xs opacity-80">
                {status.configured
                  ? `Model: ${status.model || 'gemini-flash-lite-latest'}`
                  : 'Add GEMINI_API_KEY in server/.env'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchStatus}
            disabled={refreshing}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Refresh status"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Security Note */}
        <div className="text-xs text-content-muted leading-relaxed bg-surface-secondary p-3.5 rounded-xl border border-edge">
          <p className="font-medium text-content mb-1">Security Architecture</p>
          <p>
            Your Gemini API Key is kept strictly on the backend (<code className="text-accent">server/.env</code>) and is never exposed to the browser.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-surface-secondary border border-edge text-content text-sm font-medium hover:bg-surface-hover transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
