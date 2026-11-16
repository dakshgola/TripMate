import React, { useState, type FormEvent, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router'
import { ShieldAlert, KeyRound, Lock, Mail, CheckCircle2, ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { authApi } from '../api/client'
import { getApiErrorMessage } from '../types'

const inputBase: React.CSSProperties = {
  width: '100%',
  padding: '11px 44px 11px 38px',
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  fontSize: 'calc(14px * var(--fs-scale-body, 1))',
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color 120ms',
  background: 'white',
  color: '#111827',
}

export default function AdminRecoveryPage(): React.ReactElement {
  const navigate = useNavigate()
  const [secret, setSecret] = useState('')
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [recoveredEmail, setRecoveredEmail] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isLoading) return
    setError('')

    if (!secret.trim()) {
      setError('Admin recovery secret is required.')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsLoading(true)
    try {
      const res = await authApi.adminRecovery({
        recovery_secret: secret.trim(),
        new_password: newPassword,
        email: email.trim() || undefined,
      })
      if (res.success) {
        setRecoveredEmail(res.email || email || 'admin account')
        setSuccess(true)
      } else {
        setError('Admin recovery could not be completed.')
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Admin recovery failed. Check your recovery secret and credentials.'))
    } finally {
      setIsLoading(false)
    }
  }

  const shell = (inner: React.ReactNode) => (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #f9fafb, #ffffff)',
        padding: 24,
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'white',
          borderRadius: 20,
          boxShadow: '0 12px 40px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
          padding: '32px 28px',
        }}
      >
        {inner}
      </div>
    </div>
  )

  if (success) {
    return shell(
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: '#ecfdf5',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#059669',
            marginBottom: 16,
          }}
        >
          <CheckCircle2 size={28} />
        </div>
        <h1 style={{ fontSize: 'calc(22px * var(--fs-scale-title, 1))', fontWeight: 700, color: '#111827', margin: '0 0 10px 0' }}>
          Admin Password Reset
        </h1>
        <p style={{ fontSize: 'calc(14px * var(--fs-scale-body, 1))', color: '#4b5563', lineHeight: 1.55, margin: 0 }}>
          The admin password for <strong>{recoveredEmail}</strong> has been successfully updated. You can now sign in with your new password.
        </p>
        <button
          type="button"
          onClick={() => navigate('/login')}
          style={{
            marginTop: 24,
            padding: '11px 22px',
            background: '#111827',
            color: 'white',
            border: 'none',
            borderRadius: 12,
            fontSize: 'calc(14px * var(--fs-scale-body, 1))',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Back to Sign In
        </button>
      </div>
    )
  }

  return shell(
    <>
      <button
        type="button"
        onClick={() => navigate('/login')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          color: '#6b7280',
          fontSize: 'calc(13px * var(--fs-scale-body, 1))',
          fontFamily: 'inherit',
          marginBottom: 22,
        }}
      >
        <ArrowLeft size={14} /> Back to Sign In
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: '#fef2f2',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ShieldAlert size={20} />
        </div>
        <h1 style={{ fontSize: 'calc(22px * var(--fs-scale-title, 1))', fontWeight: 700, color: '#111827', margin: 0 }}>
          Admin Recovery
        </h1>
      </div>

      <p style={{ fontSize: 'calc(13.5px * var(--fs-scale-body, 1))', color: '#6b7280', lineHeight: 1.55, margin: '0 0 20px 0' }}>
        Reset the administrator password using your deployment&apos;s <code>ADMIN_RECOVERY_SECRET</code> environment variable.
      </p>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 10,
            fontSize: 'calc(13px * var(--fs-scale-body, 1))',
            color: '#dc2626',
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Admin Recovery Secret
          </label>
          <div style={{ position: 'relative' }}>
            <KeyRound size={15} className="text-[#9ca3af]" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSecret(e.target.value)}
              required
              placeholder="Enter ADMIN_RECOVERY_SECRET"
              style={inputBase}
              onFocus={(e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = '#111827')}
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = '#e5e7eb')}
            />
            <button
              type="button"
              onClick={() => setShowSecret(v => !v)}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#9ca3af', width: 22, height: 22,
              }}
            >
              {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Admin Email (Optional)
          </label>
          <div style={{ position: 'relative' }}>
            <Mail size={15} className="text-[#9ca3af]" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="email"
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="Leave blank for primary admin"
              style={{ ...inputBase, paddingRight: 12 }}
              onFocus={(e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = '#111827')}
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = '#e5e7eb')}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            New Admin Password
          </label>
          <div style={{ position: 'relative' }}>
            <Lock size={15} className="text-[#9ca3af]" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
              required
              placeholder="Minimum 8 characters"
              style={inputBase}
              onFocus={(e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = '#111827')}
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = '#e5e7eb')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#9ca3af', width: 22, height: 22,
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Confirm New Password
          </label>
          <div style={{ position: 'relative' }}>
            <Lock size={15} className="text-[#9ca3af]" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
              required
              placeholder="Re-enter new password"
              style={inputBase}
              onFocus={(e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = '#111827')}
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = '#e5e7eb')}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          style={{
            marginTop: 6,
            padding: '12px',
            background: '#111827',
            color: 'white',
            border: 'none',
            borderRadius: 12,
            fontSize: 'calc(14px * var(--fs-scale-body, 1))',
            fontWeight: 700,
            cursor: isLoading ? 'default' : 'pointer',
            fontFamily: 'inherit',
            opacity: isLoading ? 0.7 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {isLoading ? 'Resetting Admin Password…' : 'Reset Admin Password'}
        </button>
      </form>
    </>
  )
}
