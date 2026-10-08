import React, { useState, useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import {
  PawPrint, Play, Pause, Power, SignOut,
  Heartbeat, Drop, BatteryCharging, WarningOctagon, PencilSimple
} from '@phosphor-icons/react';
import { auth, db } from '../firebase';
import Button from '../components/ui/Button';

export default function WalkerDashboard() {
  const [pets, setPets] = useState([]);
  const [selectedPetId, setSelectedPetId] = useState('');
  const [manualCollarTag, setManualCollarTag] = useState('COLLAR01');
  const [useManualTag, setUseManualTag] = useState(false);

  const [isWalkerOnline, setIsWalkerOnline] = useState(false);
  const [isWalking, setIsWalking] = useState(false);
  const [lastCoords, setLastCoords] = useState(null);
  const [pingCounter, setPingCounter] = useState(1);
  const [lastPushedTime, setLastPushedTime] = useState(null);

  const geoWatchIdRef = useRef(null);
  const pushIntervalRef = useRef(null);
  const latestCoordsRef = useRef(null);
  const pingCounterRef = useRef(1);

  // Fetch registered pets across all users (public_pets + pets + system_config fallback)
  useEffect(() => {
    const petMap = new Map();

    const updatePetsList = () => {
      const merged = Array.from(petMap.values());
      if (merged.length > 0) {
        setPets(merged);
        setSelectedPetId((prev) => {
          if (prev && merged.some((p) => p.id === prev)) return prev;
          return merged[0].id;
        });
        setUseManualTag(false);
      }
    };

    // 1. Primary: public_pets (always publicly readable across all users without auth restrictions)
    const unsubPublic = onSnapshot(
      collection(db, 'public_pets'),
      (snapshot) => {
        snapshot.forEach((d) => {
          const data = d.data();
          petMap.set(d.id, {
            id: d.id,
            name: data.name || 'Unnamed Pet',
            type: data.type || 'Pet',
            id_tag: data.id_tag || data.tag_id || '',
            owner_name: data.owner_name || '',
          });
        });
        updatePetsList();
      },
      (err) => console.warn('public_pets query error:', err)
    );

    // 2. Direct 'pets' collection
    const unsubPets = onSnapshot(
      collection(db, 'pets'),
      (snapshot) => {
        snapshot.forEach((d) => {
          const data = d.data();
          const existing = petMap.get(d.id) || {};
          petMap.set(d.id, {
            id: d.id,
            name: data.name || existing.name || 'Unnamed Pet',
            type: data.type || existing.type || 'Pet',
            id_tag: data.id_tag || data.tag_id || existing.id_tag || '',
            owner_name: data.owner_name || existing.owner_name || '',
          });
        });
        updatePetsList();
      },
      () => console.warn('Direct pets query restricted, relying on public registry.')
    );

    // 3. Fallback: Admin shared configuration document
    const unsubShared = onSnapshot(
      doc(db, 'system_config', 'walker_shared_pets'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (Array.isArray(data?.pets)) {
            data.pets.forEach((p) => {
              if (p?.id && !petMap.has(p.id)) {
                petMap.set(p.id, p);
              }
            });
            updatePetsList();
          }
        }
      },
      (err) => console.warn('Shared config note:', err)
    );

    return () => {
      unsubPublic();
      unsubPets();
      unsubShared();
    };
  }, []);

  const activePet = pets.find((p) => p.id === selectedPetId);
  const activeCollarId = useManualTag 
    ? manualCollarTag.trim() 
    : (activePet?.id_tag?.trim() || manualCollarTag.trim() || 'COLLAR01');

  // Transmit telemetry matching the ESP32 packet schema
  const transmitCollarPacket = async (coords, isLiveWalk = true) => {
    if (!activeCollarId) {
      toast.error('Please specify a Collar ID Tag.');
      return;
    }

    pingCounterRef.current += 1;
    setPingCounter(pingCounterRef.current);

    const simulatedBpm = isLiveWalk ? Math.floor(92 + Math.random() * 20) : 84;
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
      await setDoc(doc(db, 'devices', activeCollarId), payload, { merge: true });
      setLastPushedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      console.error('Failed to transmit walker telemetry:', err);
    }
  };

  // Toggle Collar Power
  const handleToggleWalkerPower = async () => {
    if (!activeCollarId) {
      toast.error('Please provide a valid Collar ID Tag.');
      return;
    }

    if (isWalkerOnline) {
      if (isWalking) handleStopWalk();
      setIsWalkerOnline(false);

      await setDoc(doc(db, 'devices', activeCollarId), {
        status: 'offline',
        last_updated: new Date(Date.now() - 30000).toISOString(),
      }, { merge: true });

      toast.info(`Collar ${activeCollarId} powered OFF.`);
    } else {
      setIsWalkerOnline(true);
      await transmitCollarPacket(latestCoordsRef.current, false);
      toast.success(`Collar ${activeCollarId} is now active & ready!`);
    }
  };

  // Start Live Walk (Actively polls & pushes fresh phone GPS every 10 seconds)
  const handleStartWalk = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }

    if (!isWalkerOnline) {
      setIsWalkerOnline(true);
    }

    setIsWalking(true);
    toast.success('Live walk started! Streaming phone GPS every 10s.');

    const captureAndTransmitLocation = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const freshCoords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          latestCoordsRef.current = freshCoords;
          setLastCoords(freshCoords);
          transmitCollarPacket(freshCoords, true);
        },
        (err) => {
          console.warn('GPS reading warning:', err.message);
          if (latestCoordsRef.current) {
            transmitCollarPacket(latestCoordsRef.current, true);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 9000,
          maximumAge: 0,
        }
      );
    };

    // 1. Initial immediate transmission
    captureAndTransmitLocation();

    // 2. Continuous background GPS listener
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        latestCoordsRef.current = c;
        setLastCoords(c);
      },
      (err) => console.warn('watchPosition update note:', err.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 9000 }
    );

    // 3. Guaranteed 10-second active sampling loop
    if (pushIntervalRef.current) clearInterval(pushIntervalRef.current);
    pushIntervalRef.current = setInterval(() => {
      captureAndTransmitLocation();
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
    if (!activeCollarId) return;
    await setDoc(doc(db, 'devices', activeCollarId), {
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
      {/* Header */}
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
        {auth.currentUser && (
          <button
            onClick={() => signOut(auth)}
            className="p-2 text-muted hover:text-danger rounded-xl hover:bg-danger-soft transition"
            title="Sign out"
          >
            <SignOut size={18} weight="bold" />
          </button>
        )}
      </header>

      {/* Target Pet / Collar Tag Selector */}
      <div className="bg-surface border border-linen rounded-2xl p-4 mb-4 shadow-sm">
        <div className="flex justify-between items-center mb-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted">
            Target Collar Device
          </label>
          <button
            type="button"
            onClick={() => setUseManualTag((v) => !v)}
            className="text-[11px] text-copper font-semibold flex items-center gap-1 hover:underline"
          >
            <PencilSimple size={13} />
            {useManualTag ? 'Use Pet Dropdown' : 'Enter Tag Manually'}
          </button>
        </div>

        {useManualTag || pets.length === 0 ? (
          <div>
            <input
              type="text"
              value={manualCollarTag}
              onChange={(e) => setManualCollarTag(e.target.value.toUpperCase())}
              disabled={isWalking}
              placeholder="e.g. COLLAR01"
              className="w-full bg-canvas border border-linen rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-copper outline-none focus:border-copper"
            />
            <p className="text-[11px] text-muted mt-1.5">
              Testing collar tag: <span className="font-mono font-bold text-copper">{activeCollarId}</span>
            </p>
          </div>
        ) : (
          <div>
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
                  {p.name} ({p.type}) {p.id_tag ? `— Tag: ${p.id_tag}` : '— (No tag assigned)'} {p.owner_name ? `· ${p.owner_name}` : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted mt-1.5">
              Broadcasting as: <span className="font-mono font-bold text-copper">{activeCollarId}</span>
              {!activePet?.id_tag && (
                <span className="text-amber-500 ml-1.5 font-medium">(No tag on pet; using fallback {activeCollarId})</span>
              )}
            </p>
          </div>
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
            <span className="font-bold text-sm text-ink">{isWalking ? '104' : '84'} BPM</span>
          </div>
          <div className="bg-canvas border border-linen rounded-xl p-2.5 flex flex-col items-center">
            <Drop size={18} className="text-meadow mb-1" />
            <span className="text-[10px] text-muted">Blood O2</span>
            <span className="font-bold text-sm text-ink">97%</span>
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