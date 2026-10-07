import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { PawPrint, ArrowRight, EnvelopeSimple, Lock, ChatCenteredDots, ArrowLeft } from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  RecaptchaVerifier, 
  signInWithPhoneNumber 
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import FaultyTerminal from '../components/FaultyTerminal';
import Button from '../components/ui/Button';
import ScreenLoader from '../components/ui/ScreenLoader';

const fieldClass = 'w-full bg-night-2 border border-white/10 rounded-2xl px-3.5 py-2.5 text-sm text-canvas placeholder:text-canvas/30 focus:border-copper outline-none transition';

function formatToE164(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('63') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+63${digits.slice(1)}`;
  if (digits.length === 10) return `+63${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

export default function Login() {
  const { currentUser, userData, loading } = useAuth();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [busy, setBusy] = useState(false);

  // Registration Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [gender, setGender] = useState('Male');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');

  // SMS Verification Flow States
  const [isOtpStep, setIsOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const recaptchaVerifierRef = useRef(null);

  useEffect(() => {
    if (!currentUser || !userData) return;
    if (userData.role === 'admin') navigate('/admin');
    else if (userData.role === 'owner' && userData.is_approved !== false) navigate('/dashboard');
    else if (userData.role === 'owner' && userData.is_approved === false) navigate('/pending');
  }, [currentUser, userData, navigate]);

  const destroyRecaptcha = () => {
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch (_) {}
      recaptchaVerifierRef.current = null;
    }
  };

  useEffect(() => {
    return () => destroyRecaptcha();
  }, []);

  if (loading) {
    return <ScreenLoader message="Welcome back…" />;
  }

  const createRecaptcha = () => {
    destroyRecaptcha();
    const config = {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => {
        setError('reCAPTCHA expired. Please try clicking submit again.');
        destroyRecaptcha();
      },
    };

    try {
      recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', config);
    } catch (_) {
      try {
        recaptchaVerifierRef.current = new RecaptchaVerifier('recaptcha-container', config, auth);
      } catch (err) {
        console.error('Recaptcha init failed:', err);
      }
    }
    return recaptchaVerifierRef.current;
  };

  // STEP 1: Process Login OR Trigger SMS for Register
  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const rawPhone = phone.trim();
        if (!rawPhone || rawPhone.length < 10) {
          throw new Error('Please enter a valid mobile number (e.g. 09171234567).');
        }

        const formattedPhone = formatToE164(rawPhone);
        const verifier = createRecaptcha();

        if (!verifier) {
          throw new Error('Could not initialize reCAPTCHA verifier. Please refresh the page.');
        }

        const confirmation = await signInWithPhoneNumber(auth, formattedPhone, verifier);
        setConfirmationResult(confirmation);
        setIsOtpStep(true);
        setMessage(`Verification code sent via SMS to ${formattedPhone}.`);
      }
    } catch (err) {
      console.error('Firebase Auth Error:', err);
      destroyRecaptcha();

      if (err.code === 'auth/operation-not-allowed') {
        setError('Phone Authentication is disabled in Firebase Console. Go to Authentication > Sign-in method > Phone and enable it.');
      } else if (err.code === 'auth/invalid-phone-number') {
        setError('Invalid phone number format. Please check the digits entered.');
      } else if (err.code === 'auth/quota-exceeded') {
        setError('Daily SMS quota exceeded. Add this phone number to "Phone numbers for testing" in Firebase Console.');
      } else if (err.code === 'auth/captcha-check-failed' || err.code === 'auth/unauthorized-domain') {
        setError(`reCAPTCHA check failed. Ensure "${window.location.hostname}" is listed in Firebase Authorized Domains.`);
      } else {
        setError(err.message || 'Could not send verification SMS.');
      }
    } finally {
      setBusy(false);
    }
  };

  // STEP 2: Verify SMS OTP & Auto-Approve Account
  const handleVerifyOtpAndCreateAccount = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);

    if (!otpCode || otpCode.trim().length !== 6) {
      setError('Please enter the 6-digit verification code.');
      setBusy(false);
      return;
    }

    try {
      if (!confirmationResult) {
        throw new Error('Verification session expired. Please go back and request a new code.');
      }

      // 1. Confirm Phone via OTP
      await confirmationResult.confirm(otpCode.trim());

      // 2. Create permanent Email/Password account
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;

      // 3. Save profile to Firestore with is_approved: true
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email.toLowerCase(),
        username: username.toLowerCase().trim(),
        first_name: firstName.trim(),
        middle_name: middleName.trim(),
        last_name: lastName.trim(),
        birthday,
        gender,
        phone_number: formatToE164(phone.trim()),
        phone_verified: true,
        role: 'owner',
        is_approved: true, // Auto-approved upon phone OTP verification
        created_at: new Date().toISOString(),
      });

      setMessage('Phone verified! Welcome to PawFound.');
      setIsOtpStep(false);
      destroyRecaptcha();

      // Clear input state
      setFirstName('');
      setMiddleName('');
      setLastName('');
      setBirthday('');
      setPhone('');
      setUsername('');
      setPassword('');
      setOtpCode('');

      navigate('/dashboard');
    } catch (err) {
      console.error('OTP Verification Error:', err);
      if (err.code === 'auth/invalid-verification-code') {
        setError('Incorrect 6-digit code. Please verify your SMS and try again.');
      } else if (err.code === 'auth/code-expired') {
        setError('The verification code has expired. Please go back and request a new one.');
      } else {
        setError(err.message || 'Invalid SMS code. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-night relative flex items-center justify-center p-4 sm:p-6 py-12 sm:py-8 overflow-y-auto">
      {/* Invisible reCAPTCHA Anchor */}
      <div id="recaptcha-container" className="invisible"></div>

      {/* Faulty Terminal Background */}
      <div className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none">
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          <FaultyTerminal
            scale={2.4}
            digitSize={1.2}
            scanlineIntensity={0.5}
            glitchAmount={1}
            flickerAmount={1}
            noiseAmp={1}
            chromaticAberration={0.075}
            dither={0.35}
            curvature={0.55}
            tint="#f0905a"
            mouseReact
            mouseStrength={0.5}
            brightness={0.6}
          />
        </div>
      </div>

      <motion.div
        layout
        className={`relative z-10 w-full ${isLogin ? 'max-w-[420px]' : 'max-w-3xl'} bg-night/85 backdrop-blur-xl text-canvas border border-white/10 rounded-[32px] shadow-[0_30px_80px_rgba(0,0,0,0.45)] p-6 sm:p-8`}
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="w-9 h-9 rounded-2xl bg-copper text-white flex items-center justify-center">
            <PawPrint size={18} weight="fill" />
          </span>
        </div>
        <div className="text-center mb-6">
          <h1 className="font-display text-3xl tracking-tight">
            Paw<span className="text-copper">Found</span>
          </h1>
          <p className="text-canvas/60 text-sm mt-1">Keep every walk, heartbeat, and homecoming in view.</p>
        </div>

        {/* Tab Toggle */}
        {!isOtpStep && (
          <div className="flex mb-6 bg-night-2 p-1.5 rounded-2xl border border-white/8">
            {['Sign in', 'Create account'].map((label, idx) => {
              const active = isLogin === (idx === 0);
              return (
                <button
                  key={label}
                  type="button"
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${active ? 'bg-copper text-white shadow-md' : 'text-canvas/50 hover:text-canvas'}`}
                  onClick={() => { 
                    setIsLogin(idx === 0); 
                    setError(''); 
                    setMessage(''); 
                    setIsOtpStep(false); 
                    destroyRecaptcha(); 
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm font-medium bg-danger/15 border border-danger/30 text-[#F8B4B0] p-3 rounded-2xl mb-4"
            >
              {error}
            </motion.div>
          )}
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm font-medium bg-meadow/15 border border-meadow/30 text-[#B7E4C7] p-3 rounded-2xl mb-4"
            >
              {message}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step 2: SMS OTP Verification */}
        {isOtpStep ? (
          <form className="flex flex-col gap-4" onSubmit={handleVerifyOtpAndCreateAccount}>
            <div className="text-center">
              <span className="w-12 h-12 rounded-2xl bg-copper/20 text-copper flex items-center justify-center mx-auto mb-2">
                <ChatCenteredDots size={24} weight="fill" />
              </span>
              <h3 className="font-display text-lg">Verify Mobile Number</h3>
              <p className="text-xs text-canvas/60 mt-1">
                Enter the 6-digit code sent to <span className="text-canvas font-mono">{formatToE164(phone)}</span>
              </p>
            </div>

            <div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                placeholder="123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center tracking-[0.4em] font-mono text-2xl bg-night-2 border border-white/10 rounded-2xl py-3 text-canvas outline-none focus:border-copper font-bold"
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1 !bg-white/10 !text-canvas"
                onClick={() => { setIsOtpStep(false); setError(''); destroyRecaptcha(); }}
                disabled={busy}
              >
                <ArrowLeft size={16} /> Back
              </Button>
              <Button
                type="submit"
                disabled={busy || otpCode.trim().length !== 6}
                className="flex-1 !bg-meadow !text-night font-bold"
              >
                {busy ? 'Verifying…' : 'Verify & Finish'}
              </Button>
            </div>
          </form>
        ) : (
          <form className="flex flex-col gap-3.5" onSubmit={handleAuth}>
            {!isLogin ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="First name">
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required className={fieldClass} />
                </Field>
                <Field label="Middle name">
                  <input value={middleName} onChange={(e) => setMiddleName(e.target.value)} className={fieldClass} />
                </Field>
                <Field label="Last name">
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} required className={fieldClass} />
                </Field>
                <Field label="Birthday">
                  <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} required className={`${fieldClass} [color-scheme:dark]`} />
                </Field>
                <Field label="Gender">
                  <select value={gender} onChange={(e) => setGender(e.target.value)} required className={fieldClass}>
                    <option value="" disabled>Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </Field>
                <Field label="Mobile (for SMS OTP)">
                  <input
                    type="tel"
                    placeholder="09171234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className={fieldClass}
                  />
                </Field>
                <Field label="Username">
                  <input value={username} onChange={(e) => setUsername(e.target.value)} required className={fieldClass} />
                </Field>
                <Field label="Email">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={fieldClass} />
                </Field>
                <Field label="Password">
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className={fieldClass} />
                </Field>
              </div>
            ) : (
              <div className="flex flex-col gap-3.5">
                <Field label="Email">
                  <div className="relative">
                    <EnvelopeSimple className="absolute left-3.5 top-1/2 -translate-y-1/2 text-canvas/35" size={18} />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={`${fieldClass} pl-10`} placeholder="you@email.com" />
                  </div>
                </Field>
                <Field label="Password">
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-canvas/35" size={18} />
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className={`${fieldClass} pl-10`} placeholder="Your password" />
                  </div>
                </Field>
              </div>
            )}

            <Button type="submit" disabled={busy} className="w-full mt-2 py-3 font-bold">
              <span>{busy ? 'Please wait…' : isLogin ? 'Continue' : 'Verify via SMS & Register'}</span>
              <ArrowRight size={16} weight="bold" />
            </Button>
          </form>
        )}

        {!isLogin && !isOtpStep && (
          <p className="mt-4 text-xs text-center text-canvas/45 leading-relaxed">
            New registrations require a one-time SMS verification. Once verified, your account is activated immediately.
          </p>
        )}
      </motion.div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-canvas/55 mb-1.5">{label}</label>
      {children}
    </div>
  );
}