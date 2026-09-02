import React from 'react';
import { signOut } from 'firebase/auth';
import { motion } from 'framer-motion';
import { Hourglass, SignOut } from '@phosphor-icons/react';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import FaultyTerminal from '../components/FaultyTerminal';
import Button from '../components/ui/Button';

export default function PendingApproval() {
  const { userData } = useAuth();

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-canvas">
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

      <div className="relative z-10 h-full w-full flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-surface/95 backdrop-blur-xl border border-linen rounded-[28px] p-8 shadow-[0_24px_60px_rgba(28,23,18,0.18)] text-center"
        >
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-soft text-amber flex items-center justify-center mb-4">
            <Hourglass size={28} weight="duotone" />
          </div>
          <h1 className="font-display text-2xl text-ink">You’re almost in</h1>
          <p className="text-muted text-sm mt-2 leading-relaxed">
            Hi {userData?.first_name || 'there'}. Your owner account is waiting for a quick review.
            We’ll unlock your dashboard as soon as an admin approves it — no need to register again.
          </p>
          <div className="mt-6 rounded-2xl bg-linen/70 px-4 py-3 text-sm text-ink">
            We’ll email <span className="font-semibold">{userData?.email}</span> when you’re approved.
          </div>
          <Button variant="secondary" className="w-full mt-6" onClick={() => signOut(auth)}>
            <SignOut size={16} weight="bold" />
            Sign out
          </Button>
        </motion.div>
      </div>
    </div>
  );
}