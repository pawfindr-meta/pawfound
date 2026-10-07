import React, { useState, useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import {
  PawPrint, NavigationArrow, Play, Pause, Power, SignOut,
  MapPin, Heartbeat, Drop, BatteryCharging, WarningOctagon
} from '@phosphor-icons/react';
import { auth, db } from '../firebase';
import Button from '../components/ui/Button';

export default function WalkerDashboard() {
  const [pets, setPets] = useState([]);
  const [selectedPetId, setSelectedPetId] = useState('');
  const [isWalkerOnline, setIsWalkerOnline] = useState(false);
  const [isWalking, setIsWalking] = useState(false);
  const [lastCoords, setLastCoords] = useState(null);
  const [pingCounter, setPingCounter] = useState(1);
  const [lastPushedTime, setLastPushedTime] = useState(null);

  const geoWatchIdRef = useRef(null);
  const pushIntervalRef = useRef(null);
  const latestCoordsRef = useRef(null);
  const pingCounterRef = useRef(1);

  // Fetch all registered pets with linked collar IDs
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pets'), (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.id_tag) list.push({ id: d.id, ...data });
      });
      setPets(list);
      if (list.length > 0 && !selectedPetId) {
        setSelectedPetId(list[0].id);
      }
    });
    return () => unsub();
  }, [selectedPetId]);

  const activePet = pets.find((p) => p.id === selectedPetId) || pets[0];

  // Transmit telemetry matching the ESP32 packet schema
  const transmitCollarPacket = async (coords, isLiveWalk = true) => {
    if (!activePet?.id_tag) return;

    pingCounterRef.current += 1;
    setPingCounter(pingCounterRef.current);

    const simulatedBpm = isLiveWalk ? Math.floor(92 + Math.random() * 20) : 82;
    const simulatedSpo2 = Math.floor(97 + Math.random() * 2);

    const payload = {
      status: 'online',
      gps_locked: Boolean(coords),
      lat: coords ? parseFloat(coords.lat.toFixed(6)) : null,
      lng: coords ? parseFloat(coords.lng.toFixed(6)) : null,
      bpm: simulatedBpm,
      spo2: simulatedSpo2,
      battery: 92,
      is_breached: false,
      ping_count: pingCounterRef.current,
      last_updated: new Date().toISOString(),
      source: 'phone_walker',
    };

    try {
      await setDoc(doc(db, 'devices', activePet.id_tag), payload, { merge: true });
      setLastPushedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      console.error('Failed to transmit walker telemetry:', err);
    }
  };

  // Toggle Collar Power
  const handleToggleWalkerPower = async () => {
    if (!activePet?.id_tag) {
      toast.error('Please select a pet with an assigned collar tag.');
      return;
    }

    if (isWalkerOnline) {
      if (isWalking) handleStopWalk();
      setIsWalkerOnline(false);

      await setDoc(doc(db, 'devices', activePet.id_tag), {
        status: 'offline',
        last_updated: new Date(Date.now() - 30000).toISOString(),
      }, { merge: true });

      toast.info(`Collar ${activePet.id_tag} powered down.`);
    } else {
      setIsWalkerOnline(true);
      await transmitCollarPacket(latestCoordsRef.current, false);
      toast.success(`Collar ${activePet.id_tag} is now active & ready!`);
    }
  };

  // Start Live Walk (Streams Phone GPS Every 10 Seconds)
  const handleStartWalk = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }

    if (!isWalkerOnline) {
      setIsWalkerOnline(true);
    }

    setIsWalking(true);
    toast.success('Live walk started! Pushing phone GPS every 10s.');

    // Watch position from phone GPS
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        latestCoordsRef.current = c;
        setLastCoords(c);
      },
      (err) => {
        console.warn('GPS reading error:', err);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 8000 }
    );

    // Initial transmission
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        latestCoordsRef.current = c;
        setLastCoords(c);
        transmitCollarPacket(c, true);
      },
      () => {}
    );

    // 10-second sync loop
    pushIntervalRef.current = setInterval(() => {
      if (latestCoordsRef.current) {
        transmitCollarPacket(latestCoordsRef.current, true);
      }
    }, 10000);
  };

  const handleStopWalk = () => {
    setIsWalking(false);
    if (geoWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(geoWatchIdRef.current);
      geoWatchIdRef.current = null;
    }
    if (pushIntervalRef.current) {
      clearInterval(pushIntervalRef.current);
      pushIntervalRef.current = null;
    }
    toast.info('Live walk paused.');
  };

  const handleTriggerBreach = async () => {
    if (!activePet?.id_tag) return;
    await setDoc(doc(db, 'devices', activePet.id_tag), {
      status: 'offline',
      is_breached: true,
      last_updated: new Date().toISOString(),
    }, { merge: true });
    toast.error('Simulated Tamper! Breach alert sent to owner.');
  };

  useEffect(() => {
    return () => {
      if (geoWatchIdRef.current !== null) navigator.geolocation.clearWatch(geoWatchIdRef.current);
      if (pushIntervalRef.current) clearInterval(pushIntervalRef.current);
    };
  }, []);

  return (
    <div className="w-full min-h-screen bg-canvas text-ink flex flex-col p-3 sm:p-5 max-w-lg mx-auto">
      <header className="flex justify-between items-center bg-surface border border-linen px-4 py-3 rounded-2xl shrink-0 shadow-sm mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-copper text-white flex items-center justify-center font-bold">
            <PawPrint size={20} weight="fill" />
          </div>
          <div>
            <h1 className="font-display text-lg leading-none">Paw<span className="text-copper">Found</span></h1>
            <p className="text-[11px] text-muted mt-0.5">Field Walker Companion</p>
          </div>
        </div>
        <button
          onClick={() => signOut(auth)}
          className="p-2 text-muted hover:text-danger rounded-xl hover:bg-danger-soft transition"
          title="Sign out"
        >
          <SignOut size={18} weight="bold" />
        </button>
      </header>

      {/* Pet Selector */}
      <div className="bg-surface border border-linen rounded-2xl p-4 mb-4 shadow-sm">
        <label className="text-xs font-bold uppercase tracking-wider text-muted block mb-1.5">
          Target Pet & Collar
        </label>
        <select
          value={selectedPetId}
          onChange={(e) => {
            if (isWalking) handleStopWalk();
            setSelectedPetId(e.target.value);
          }}
          disabled={isWalking}
          className="w-full bg-canvas border border-linen rounded-xl px-3 py-2.5 text-sm font-semibold text-ink outline-none focus:border-copper"
        >
          {pets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.type}) — Collar ID: {p.id_tag}
            </option>
          ))}
        </select>
        {activePet && (
          <p className="text-xs text-muted mt-2">
            Broadcasting as: <span className="font-mono font-bold text-copper">{activePet.id_tag}</span>
          </p>
        )}
      </div>

      {/* Main Controls */}
      <div className="bg-night text-canvas rounded-3xl p-5 mb-4 shadow-xl flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-xs text-canvas/50 uppercase tracking-widest font-bold">Collar Power</span>
            <div className="font-display text-xl mt-0.5 flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${isWalkerOnline ? 'bg-meadow animate-pulse' : 'bg-canvas/30'}`} />
              {isWalkerOnline ? 'Collar Online' : 'Collar Offline'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleWalkerPower}
            className={`p-3.5 rounded-2xl font-bold flex items-center gap-2 transition ${
              isWalkerOnline
                ? 'bg-danger text-white hover:bg-rose-700'
                : 'bg-meadow text-night hover:bg-emerald-400'
            }`}
          >
            <Power size={20} weight="bold" />
            {isWalkerOnline ? 'Power Off' : 'Turn On'}
          </button>
        </div>

        <hr className="border-white/10" />

        <div>
          <span className="text-xs text-canvas/50 uppercase tracking-widest font-bold block mb-2">
            Live GPS Sync (Every 10s)
          </span>
          {isWalking ? (
            <Button
              className="w-full !bg-rose-600 hover:!bg-rose-700 !text-white font-bold !py-3.5 text-base flex items-center justify-center gap-2 shadow-lg"
              onClick={handleStopWalk}
            >
              <Pause size={20} weight="fill" /> Pause / End Walk
            </Button>
          ) : (
            <Button
              className="w-full !bg-copper hover:!bg-copper-dark !text-white font-bold !py-3.5 text-base flex items-center justify-center gap-2 shadow-lg"
              onClick={handleStartWalk}
            >
              <Play size={20} weight="fill" /> Start Live Walk
            </Button>
          )}
        </div>

        {/* GPS Stream Status */}
        <div className="bg-white/5 rounded-2xl p-3.5 text-xs flex flex-col gap-1.5 font-mono">
          <div className="flex justify-between">
            <span className="text-canvas/50">Phone GPS:</span>
            <span className="text-meadow font-bold">
              {lastCoords ? `${lastCoords.lat.toFixed(5)}, ${lastCoords.lng.toFixed(5)}` : 'Waiting for fix...'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-canvas/50">Packets Pushed:</span>
            <span>#{pingCounter}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-canvas/50">Last Update:</span>
            <span>{lastPushedTime || 'None'}</span>
          </div>
        </div>
      </div>

      {/* Telemetry Preview */}
      <div className="bg-surface border border-linen rounded-2xl p-4 shadow-sm mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3">Live Collar Telemetry Emulation</h3>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-canvas border border-linen rounded-xl p-2.5 flex flex-col items-center">
            <Heartbeat size={18} className="text-copper mb-1" />
            <span className="text-[10px] text-muted">Heart Rate</span>
            <span className="font-bold text-sm text-ink">{isWalking ? '104' : '82'} BPM</span>
          </div>
          <div className="bg-canvas border border-linen rounded-xl p-2.5 flex flex-col items-center">
            <Drop size={18} className="text-meadow mb-1" />
            <span className="text-[10px] text-muted">Blood O2</span>
            <span className="font-bold text-sm text-ink">98%</span>
          </div>
          <div className="bg-canvas border border-linen rounded-xl p-2.5 flex flex-col items-center">
            <BatteryCharging size={18} className="text-amber mb-1" />
            <span className="text-[10px] text-muted">Battery</span>
            <span className="font-bold text-sm text-ink">92%</span>
          </div>
        </div>
      </div>

      {/* Simulated Breach */}
      <div className="bg-surface border border-linen rounded-2xl p-4 shadow-sm flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-ink">Simulate Collar Breach</h4>
          <p className="text-[11px] text-muted">Triggers instant tamper alarm on Owner Dashboard</p>
        </div>
        <button
          type="button"
          onClick={handleTriggerBreach}
          className="px-3 py-2 bg-danger-soft text-danger hover:bg-danger hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
        >
          <WarningOctagon size={16} weight="fill" /> Tamper
        </button>
      </div>
    </div>
  );
}