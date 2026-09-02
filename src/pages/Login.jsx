import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { PawPrint, ArrowRight, EnvelopeSimple, Lock } from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import FaultyTerminal from '../components/FaultyTerminal';
import Button from '../components/ui/Button';
import ScreenLoader from '../components/ui/ScreenLoader';
import { formatAuthError } from '../lib/formatError';

const fieldClass = 'w-full bg-night-2 border border-white/10 rounded-2xl px-3.5 py-2.5 text-sm text-canvas placeholder:text-canvas/30 focus:border-copper outline-none transition';

export default function Login() {
  const { currentUser, userData, loading } = useAuth();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!currentUser || !userData) return;
    if (userData.role === 'admin') navigate('/admin');
    else if (userData.role === 'owner' && userData.is_approved) navigate('/dashboard');
    else if (userData.role === 'owner' && !userData.is_approved) navigate('/pending');
  }, [currentUser, userData, navigate]);

  if (loading) {
    return <ScreenLoader message="Welcome back…" />;
  }

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, 'users', user.uid), {
          email: user.email,
          username,
          first_name: firstName,
          middle_name: middleName,
          last_name: lastName,
          birthday,
          gender,
          phone_number: phone,
          role: 'owner',
          is_approved: false,
          created_at: new Date().toISOString(),
        });

        setMessage('Account created. An admin will review it shortly — you can close this and come back anytime.');
        setIsLogin(true);
        setFirstName('');
        setMiddleName('');
        setLastName('');
        setBirthday('');
        setGender('');
        setPhone('');
        setUsername('');
        setPassword('');
      }
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-screen items-center justify-center p-4 bg-night overflow-auto">
      {/* Faulty Terminal Animated Background */}
      <div className="fixed inset-0 z-0 flex items-center justify-center pointer-events-auto">
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
        className={`relative z-10 w-full ${isLogin ? 'max-w-[420px]' : 'max-w-3xl'} bg-night/80 backdrop-blur-xl text-canvas border border-white/10 rounded-[32px] shadow-[0_30px_80px_rgba(0,0,0,0.45)] p-6 md:p-8`}
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

        <div className="flex mb-6 bg-night-2 p-1.5 rounded-2xl border border-white/8">
          {['Sign in', 'Create account'].map((label, idx) => {
            const active = isLogin === (idx === 0);
            return (
              <button
                key={label}
                type="button"
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${active ? 'bg-copper text-white shadow-md' : 'text-canvas/50 hover:text-canvas'}`}
                onClick={() => { setIsLogin(idx === 0); setError(''); setMessage(''); }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <form className="flex flex-col gap-3.5" onSubmit={handleAuth}>
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm font-medium bg-danger/15 border border-danger/30 text-[#F8B4B0] p-3 rounded-2xl"
              >
                {error}
              </motion.div>
            )}
            {message && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm font-medium bg-meadow/15 border border-meadow/30 text-[#B7E4C7] p-3 rounded-2xl"
              >
                {message}
              </motion.div>
            )}
          </AnimatePresence>

          {!isLogin ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <Field label="Phone">
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required className={fieldClass} />
              </Field>
              <Field label="Username">
                <input value={username} onChange={(e) => setUsername(e.target.value)} required className={fieldClass} />
              </Field>
              <Field label="Email">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={fieldClass} />
              </Field>
              <Field label="Password">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength="6" className={fieldClass} />
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

          <Button type="submit" disabled={busy} className="w-full mt-2 py-3">
            <span>{busy ? 'Please wait…' : isLogin ? 'Continue' : 'Request access'}</span>
            <ArrowRight size={16} weight="bold" />
          </Button>
        </form>

        {!isLogin && (
          <p className="mt-4 text-xs text-center text-canvas/45 leading-relaxed">
            New owner accounts are reviewed before the first login. You will land on a waiting screen until then.
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