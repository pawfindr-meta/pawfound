import React, { useState, useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  UsersThree, PawPrint, Cpu, Lightning, SignOut, Play, Pause, Path, MapPin, Check, X,
  CheckCircle, Target, Power, WarningOctagon
} from '@phosphor-icons/react';
import { auth, db } from '../firebase';
import { telemetryThrottler } from '../utils/dbThrottler';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';

const NAV = [
  { id: 'approvals', icon: UsersThree, label: 'People' },
  { id: 'pets', icon: PawPrint, label: 'Pets' },
  { id: 'devices', icon: Cpu, label: 'Devices' },
  { id: 'simulator', icon: Lightning, label: 'Simulator' },
];

export default function AdminDashboard() {
  const [owners, setOwners] = useState([]);
  const [allPets, setAllPets] = useState([]);
  const [allSafezones, setAllSafezones] = useState([]);
  const [activeView, setActiveView] = useState('simulator');

  // Multi-Pet Failsafe Simulator States
  const [selectedPetIds, setSelectedPetIds] = useState([]);
  const [movementPattern, setMovementPattern] = useState('wander');
  const [targetZoneId, setTargetZoneId] = useState('');
  const [placementOffset, setPlacementOffset] = useState('center');
  const [isSimulating, setIsSimulating] = useState(false);

  const simStateRef = useRef({});
  const timerRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'owner'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ownerData = [];
      snapshot.forEach((docSnap) => ownerData.push({ id: docSnap.id, ...docSnap.data() }));
      setOwners(ownerData);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'pets'), (snapshot) => {
      const petData = [];
      snapshot.forEach((docSnap) => petData.push({ id: docSnap.id, ...docSnap.data() }));
      setAllPets(petData);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'safe_zones'), (snapshot) => {
      const szData = [];
      snapshot.forEach((docSnap) => szData.push({ id: docSnap.id, ...docSnap.data() }));
      setAllSafezones(szData);
      if (szData.length > 0 && !targetZoneId) {
        setTargetZoneId(szData[0].id);
      }
    });
    return () => unsubscribe();
  }, [targetZoneId]);

  const togglePetSelection = (petId) => {
    setSelectedPetIds((prev) =>
      prev.includes(petId) ? prev.filter((id) => id !== petId) : [...prev, petId]
    );
  };

  const toggleOwnerPets = (ownerId) => {
    const ownerPetIds = allPets
      .filter((p) => (p.owner_id === ownerId || p.user_id === ownerId) && p.id_tag)
      .map((p) => p.id);

    const allSelected = ownerPetIds.length > 0 && ownerPetIds.every((id) => selectedPetIds.includes(id));
    if (allSelected) {
      setSelectedPetIds((prev) => prev.filter((id) => !ownerPetIds.includes(id)));
    } else {
      setSelectedPetIds((prev) => Array.from(new Set([...prev, ...ownerPetIds])));
    }
  };

  const handleSetCollarPower = async (turnOn) => {
    if (selectedPetIds.length === 0) {
      toast.error('Select at least one pet to change collar power.');
      return;
    }

    const activePets = allPets.filter((p) => selectedPetIds.includes(p.id) && p.id_tag);
    if (activePets.length === 0) {
      toast.error('Selected pets must have a Collar ID (id_tag) linked.');
      return;
    }

    const targetZone = allSafezones.find((sz) => sz.id === targetZoneId);
    const baseLat = targetZone ? targetZone.lat : 14.5995;
    const baseLng = targetZone ? targetZone.lng : 120.9842;

    for (const pet of activePets) {
      if (turnOn) {
        const currentCoord = simStateRef.current[pet.id_tag] || { lat: baseLat, lng: baseLng };
        telemetryThrottler.queueTelemetry(pet.id_tag, {
          lat: parseFloat(currentCoord.lat.toFixed(6)),
          lng: parseFloat(currentCoord.lng.toFixed(6)),
          bpm: 86,
          spo2: 98,
          battery: 95,
          status: 'online',
          is_breached: false,
        });
      } else {
        await telemetryThrottler.setDeviceOffline(pet.id_tag);
      }
    }

    if (!turnOn && isSimulating) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsSimulating(false);
    }

    toast.success(turnOn ? `Turned ON collar for ${activePets.length} pet(s)` : `Turned OFF collar for ${activePets.length} pet(s)`);
  };

  const handlePlaceInSafezone = () => {
    if (selectedPetIds.length === 0) {
      toast.error('Select at least one pet to place into the safe zone.');
      return;
    }

    const activePets = allPets.filter((p) => selectedPetIds.includes(p.id) && p.id_tag);
    if (activePets.length === 0) {
      toast.error('Selected pets must have a Collar ID (id_tag) linked.');
      return;
    }

    const targetZone = allSafezones.find((sz) => sz.id === targetZoneId);
    if (!targetZone) {
      toast.error('Please select a valid safe zone.');
      return;
    }

    const centerLat = targetZone.lat;
    const centerLng = targetZone.lng;
    const zoneRadiusMeters = Number(targetZone.radius) || 200;
    const metersPerDegLat = 111320;
    const metersPerDegLng = 111320 * Math.cos((centerLat * Math.PI) / 180);

    const distanceMultiplier = placementOffset === 'center' ? 0.15 : placementOffset === 'inner' ? 0.65 : 0.98;

    activePets.forEach((pet, index) => {
      const angle = (index * (360 / activePets.length) * Math.PI) / 180;
      const targetDistMeters = Math.min(zoneRadiusMeters * distanceMultiplier, zoneRadiusMeters - 2);

      const placedLat = centerLat + (targetDistMeters * Math.sin(angle)) / metersPerDegLat;
      const placedLng = centerLng + (targetDistMeters * Math.cos(angle)) / metersPerDegLng;

      simStateRef.current[pet.id_tag] = {
        lat: placedLat,
        lng: placedLng,
        headingRad: angle,
        centerLat,
        centerLng,
        zoneRadiusMeters,
        metersPerDegLat,
        metersPerDegLng,
        isEscaping: false,
      };

      telemetryThrottler.queueTelemetry(pet.id_tag, {
        lat: parseFloat(placedLat.toFixed(6)),
        lng: parseFloat(placedLng.toFixed(6)),
        bpm: 85,
        spo2: 98,
        battery: 95,
        status: 'online',
        is_breached: false,
      });
    });

    toast.success(`Placed ${activePets.length} pet(s) into “${targetZone.name}”!`);
  };

  const handleTriggerInstantBreach = async () => {
    if (selectedPetIds.length === 0) {
      toast.error('Select at least one pet to trigger collar breach.');
      return;
    }

    const activePets = allPets.filter((p) => selectedPetIds.includes(p.id) && p.id_tag);
    if (activePets.length === 0) {
      toast.error('Selected pets must have a Collar ID (id_tag) linked.');
      return;
    }

    for (const pet of activePets) {
      try {
        await updateDoc(doc(db, 'devices', pet.id_tag), {
          status: 'offline',
          is_breached: true,
          last_updated: new Date().toISOString(),
        });
      } catch (err) {
        await telemetryThrottler.setDeviceOffline(pet.id_tag);
      }

      if (simStateRef.current[pet.id_tag]) {
        delete simStateRef.current[pet.id_tag];
      }
    }

    toast.error(`Breach triggered: ${activePets.length} collar(s) forcefully shut down. Owner alerted.`);
  };

  const toggleSimulation = async () => {
    if (isSimulating) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsSimulating(false);

      for (const petId of selectedPetIds) {
        const pet = allPets.find((p) => p.id === petId);
        if (pet?.id_tag) {
          telemetryThrottler.setDeviceOffline(pet.id_tag);
        }
      }
      toast.info('Failsafe simulation paused. Devices set offline.');
    } else {
      if (selectedPetIds.length === 0) {
        toast.error('Select at least one pet to simulate.');
        return;
      }

      const activePets = allPets.filter((p) => selectedPetIds.includes(p.id) && p.id_tag);
      if (activePets.length === 0) {
        toast.error('Selected pets must have a Collar ID (id_tag) linked.');
        return;
      }

      const targetZone = allSafezones.find((sz) => sz.id === targetZoneId);
      const centerLat = targetZone ? targetZone.lat : 14.5995;
      const centerLng = targetZone ? targetZone.lng : 120.9842;
      const zoneRadiusMeters = Number(targetZone?.radius) || 200;

      const metersPerDegLat = 111320;
      const metersPerDegLng = 111320 * Math.cos((centerLat * Math.PI) / 180);

      activePets.forEach((pet, index) => {
        const initialAngle = (index * (360 / activePets.length) * Math.PI) / 180;
        const initialDistMeters = Math.min(zoneRadiusMeters * 0.35, 45);

        simStateRef.current[pet.id_tag] = {
          lat: centerLat + (initialDistMeters * Math.sin(initialAngle)) / metersPerDegLat,
          lng: centerLng + (initialDistMeters * Math.cos(initialAngle)) / metersPerDegLng,
          headingRad: initialAngle,
          centerLat,
          centerLng,
          zoneRadiusMeters,
          metersPerDegLat,
          metersPerDegLng,
          isEscaping: false,
        };
      });

      setIsSimulating(true);
      toast.success(`Realistic movement running for ${activePets.length} pet(s)!`);

      timerRef.current = setInterval(() => {
        activePets.forEach((pet) => {
          const state = simStateRef.current[pet.id_tag];
          if (!state) return;

          const stepMeters = 4.8 + Math.random() * 1.2;

          const dLatM = (state.lat - state.centerLat) * state.metersPerDegLat;
          const dLngM = (state.lng - state.centerLng) * state.metersPerDegLng;
          const currentDistM = Math.sqrt(dLatM * dLatM + dLngM * dLngM);
          const angleFromCenter = Math.atan2(dLatM, dLngM);

          if (movementPattern === 'breach') {
            if (state.isEscaping) {
              const wobble = (Math.random() - 0.5) * 0.22;
              state.headingRad = angleFromCenter + wobble;

              if (currentDistM >= state.zoneRadiusMeters * 1.25) {
                state.isEscaping = false;
              }
            } else {
              const wobble = (Math.random() - 0.5) * 0.22;
              state.headingRad = angleFromCenter + Math.PI + wobble;

              if (currentDistM <= state.zoneRadiusMeters * 0.2) {
                state.isEscaping = true;
              }
            }
          } else if (movementPattern === 'orbit') {
            const tangentAngle = angleFromCenter + Math.PI / 2;
            const radialCorrection = (state.zoneRadiusMeters - currentDistM) * 0.04;
            state.headingRad = tangentAngle + (radialCorrection / stepMeters);
          } else {
            state.headingRad += (Math.random() - 0.5) * 0.5;

            if (currentDistM >= state.zoneRadiusMeters * 0.88) {
              state.headingRad = angleFromCenter + Math.PI;
            }
          }

          const deltaLatM = stepMeters * Math.sin(state.headingRad);
          const deltaLngM = stepMeters * Math.cos(state.headingRad);

          const nextLat = state.lat + deltaLatM / state.metersPerDegLat;
          const nextLng = state.lng + deltaLngM / state.metersPerDegLng;

          state.lat = nextLat;
          state.lng = nextLng;

          const dynamicBpm = Math.floor(88 + Math.random() * 22);
          const dynamicSpo2 = Math.floor(96 + Math.random() * 3);

          telemetryThrottler.queueTelemetry(pet.id_tag, {
            lat: parseFloat(nextLat.toFixed(6)),
            lng: parseFloat(nextLng.toFixed(6)),
            bpm: dynamicBpm,
            spo2: dynamicSpo2,
            battery: 94,
            status: 'online',
            is_breached: false,
          });
        });
      }, 4500);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const toggleApproval = async (id, currentStatus, name) => {
    try {
      await updateDoc(doc(db, 'users', id), { is_approved: !currentStatus });
      toast.success(currentStatus ? `${name} paused` : `${name} approved`);
    } catch (error) {
      toast.error('Could not update account.');
    }
  };

  const pendingCount = owners.filter((o) => !o.is_approved).length;
  const field = 'w-full bg-night-2 border border-white/10 rounded-xl px-3 py-2 text-sm text-canvas outline-none focus:border-copper';

  return (
    <div className="w-full min-h-screen bg-canvas text-ink lg:h-screen lg:overflow-hidden flex flex-col md:flex-row p-2.5 sm:p-3 gap-3">
      {/* Top Header / Sidebar */}
      <aside className="bg-night text-canvas p-2 rounded-[22px] flex flex-row md:flex-col gap-2 items-center justify-between md:justify-start shrink-0 w-full md:w-[72px] z-30">
        <div className="w-auto md:w-full pb-0 md:pb-2 border-b-0 md:border-b border-white/10 text-center pt-0 md:pt-1 px-2 md:px-0 flex items-center md:flex-col">
          <span className="font-display text-lg">P<span className="text-copper">F</span></span>
          <p className="text-[9px] text-copper font-bold uppercase tracking-wider ml-1.5 md:ml-0">Admin</p>
        </div>
        <nav className="flex md:flex-1 w-auto md:w-full flex-row md:flex-col gap-1.5 md:gap-2 items-center">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`relative p-2.5 md:p-3 rounded-2xl transition ${active ? 'bg-copper text-white' : 'text-canvas/70 hover:bg-white/8'}`}
                title={item.label}
              >
                <Icon size={20} weight={active ? 'fill' : 'duotone'} />
                {item.id === 'approvals' && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber text-night text-[9px] font-bold rounded-full flex items-center justify-center">{pendingCount}</span>
                )}
              </button>
            );
          })}
        </nav>
        <button onClick={() => signOut(auth)} className="p-2.5 md:p-3 text-canvas/70 hover:bg-copper hover:text-white rounded-2xl" title="Sign out">
          <SignOut size={20} weight="bold" />
        </button>
      </aside>

      {/* Main Workspace: Full page scroll on mobile, contained grid on desktop */}
      <main className="flex-1 w-full flex flex-col gap-3 pb-28 md:pb-0 overflow-y-visible lg:overflow-y-auto min-h-0">
        <header className="flex justify-between items-center bg-surface border border-linen px-4 py-3 rounded-[22px] shrink-0">
          <div>
            <h2 className="font-display text-lg">Operations & Failsafe Controller</h2>
            <p className="text-xs text-muted">Manage system approvals and run multi-pet simulation scenarios.</p>
          </div>
          <div className="flex items-center gap-2">
            {isSimulating && (
              <span className="px-3 py-1 bg-amber/15 text-amber text-xs rounded-full border border-amber/30 flex items-center gap-1.5 font-semibold animate-pulse">
                <Lightning size={14} weight="fill" /> Simulating ({selectedPetIds.length})
              </span>
            )}
            <div className="px-3 py-1.5 bg-meadow-soft text-meadow text-xs rounded-full flex items-center gap-2 font-semibold">
              <span className="w-2 h-2 rounded-full bg-meadow animate-pulse" />
              Live
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-3 gap-3">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-2 bg-night text-canvas rounded-[28px] p-4 sm:p-5 flex flex-col h-auto lg:h-full lg:overflow-hidden"
          >
            {activeView === 'approvals' && (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-display text-lg">Owner access</h3>
                  <span className="text-sm text-canvas/50">{pendingCount} waiting</span>
                </div>
                {owners.length === 0 ? (
                  <EmptyState inverted title="No owner accounts yet" body="New registrations will land here for review." />
                ) : (
                  <div className="flex flex-col gap-2 lg:overflow-y-auto custom-scrollbar">
                    {owners.map((owner) => (
                      <div key={owner.id} className="bg-night-2 border border-white/8 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold">{owner.first_name} {owner.last_name}</div>
                          <div className="text-xs text-copper">@{owner.username}</div>
                          <div className="text-xs text-canvas/50 mt-1">{owner.email} · {owner.phone_number}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${owner.is_approved ? 'bg-meadow/20 text-meadow' : 'bg-amber/20 text-amber'}`}>
                            {owner.is_approved ? 'Approved' : 'Waiting'}
                          </span>
                          <Button
                            variant={owner.is_approved ? 'secondary' : 'primary'}
                            className={owner.is_approved ? '!bg-white/10 !text-canvas' : ''}
                            onClick={() => toggleApproval(owner.id, owner.is_approved, owner.first_name)}
                          >
                            {owner.is_approved ? <><X size={14} /> Pause</> : <><Check size={14} /> Approve</>}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeView === 'pets' && (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-display text-lg">All registered pets</h3>
                  <span className="text-sm text-canvas/50">{allPets.length} registered</span>
                </div>
                {allPets.length === 0 ? (
                  <EmptyState inverted title="No pets yet" body="Pets appear here once owners register them." />
                ) : (
                  <div className="flex flex-col gap-2 lg:overflow-y-auto custom-scrollbar">
                    {allPets.map((pet) => (
                      <div key={pet.id} className="bg-night-2 border border-white/8 rounded-2xl p-4">
                        <div className="font-semibold text-copper">{pet.name}</div>
                        <div className="text-xs text-canvas/50 mt-0.5">{pet.type} · {pet.breed || 'Mixed'} · {pet.age} yrs</div>
                        <div className="text-xs font-mono text-meadow mt-2">{pet.id_tag || 'No collar linked'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeView === 'devices' && (
              <div className="py-12 flex items-center justify-center">
                <EmptyState
                  inverted
                  icon={<Cpu size={28} weight="duotone" />}
                  title="Device inspector"
                  body="Hardware connections and active simulator streams both register as telemetry packets."
                />
              </div>
            )}

            {activeView === 'simulator' && (
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <h3 className="font-display text-lg">Failsafe Simulator</h3>
                    <p className="text-xs text-canvas/50">Simulate motion, control power states, and place pets into zones (4.5s intervals).</p>
                  </div>
                  <Button
                    onClick={toggleSimulation}
                    className={`!px-5 !py-2.5 font-bold ${
                      isSimulating ? '!bg-rose-600 !text-white' : '!bg-meadow !text-night'
                    }`}
                  >
                    {isSimulating ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
                    {isSimulating ? 'Stop Failsafe Mode' : 'Run Failsafe Simulation'}
                  </Button>
                </div>

                {/* Instant Collar Power Trigger Strip */}
                <div className="bg-night-2 border border-white/8 rounded-2xl p-3.5 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <Power size={18} className="text-copper shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-canvas">Collar Power State</div>
                      <div className="text-[11px] text-canvas/50">Immediately sets collar status to Live or Offline on Owner Dashboard</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => handleSetCollarPower(true)}
                      className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-semibold bg-meadow/20 text-meadow hover:bg-meadow hover:text-night transition"
                    >
                      Turn Collar ON
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetCollarPower(false)}
                      className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-500/20 text-rose-400 hover:bg-rose-600 hover:text-white transition"
                    >
                      Turn Collar OFF
                    </button>
                  </div>
                </div>

                {/* Safezone Placement & Configuration Strip */}
                <div className="bg-night-2 border border-white/8 rounded-2xl p-3.5 flex flex-col gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-canvas/50 mb-1 block">Target Safe Zone</label>
                      <select
                        value={targetZoneId}
                        onChange={(e) => setTargetZoneId(e.target.value)}
                        className={field}
                      >
                        {allSafezones.map((sz) => (
                          <option key={sz.id} value={sz.id}>{sz.name} ({sz.radius || 200}m)</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-canvas/50 mb-1 block">Placement Position</label>
                      <select
                        value={placementOffset}
                        onChange={(e) => setPlacementOffset(e.target.value)}
                        className={field}
                      >
                        <option value="center">Near Center (Safe)</option>
                        <option value="inner">Mid Yard (65% radius)</option>
                        <option value="edge">Perimeter Fence Edge (98% radius)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-canvas/50 mb-1 block">Continuous Walk Pattern</label>
                      <select
                        value={movementPattern}
                        onChange={(e) => setMovementPattern(e.target.value)}
                        disabled={isSimulating}
                        className={field}
                      >
                        <option value="wander">Realistic Wander (Safe exploratory walking)</option>
                        <option value="orbit">Perimeter Orbit (Walks the fence boundary)</option>
                        <option value="breach">Safe Zone Breach (Smooth Walk-Out & Return)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-white/5 flex-wrap gap-3">
                    <span className="text-xs text-canvas/50">
                      Simulate physical tampering or snap pets into safe zones.
                    </span>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handlePlaceInSafezone}
                        className="flex-1 sm:flex-none !bg-white/10 !text-canvas hover:!bg-copper hover:!text-white !py-2 !px-3.5 !text-xs"
                      >
                        <Target size={15} weight="bold" /> Place in Zone
                      </Button>
                      <Button
                        type="button"
                        onClick={handleTriggerInstantBreach}
                        className="flex-1 sm:flex-none !bg-rose-600 hover:!bg-rose-700 !text-white !py-2 !px-3.5 !text-xs font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <WarningOctagon size={15} weight="fill" /> Force Breach / Shutdown
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Grouped Pet Selector: Natural list layout on mobile */}
                <div className="flex flex-col gap-2 mt-1">
                  <span className="text-xs font-semibold text-copper flex items-center gap-1">
                    <PawPrint size={14} /> Select Pets (Categorized by Owner)
                  </span>

                  <div className="flex flex-col gap-3 lg:max-h-[260px] lg:overflow-y-auto custom-scrollbar pr-1">
                    {owners.map((owner) => {
                      const ownerPets = allPets.filter(
                        (p) => (p.owner_id === owner.id || p.user_id === owner.id) && p.id_tag
                      );
                      if (ownerPets.length === 0) return null;

                      const allOwnerSelected = ownerPets.every((p) => selectedPetIds.includes(p.id));

                      return (
                        <div key={owner.id} className="bg-night-2 border border-white/8 rounded-2xl p-3">
                          <div className="flex justify-between items-center mb-2 pb-2 border-b border-white/5">
                            <div>
                              <span className="text-xs font-bold text-canvas">{owner.first_name} {owner.last_name}</span>
                              <span className="text-[10px] text-canvas/40 ml-2">@{owner.username}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleOwnerPets(owner.id)}
                              disabled={isSimulating}
                              className="text-[11px] text-copper hover:underline font-semibold"
                            >
                              {allOwnerSelected ? 'Deselect all' : 'Select all'}
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {ownerPets.map((pet) => {
                              const isSelected = selectedPetIds.includes(pet.id);
                              return (
                                <button
                                  key={pet.id}
                                  type="button"
                                  onClick={() => togglePetSelection(pet.id)}
                                  disabled={isSimulating}
                                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                                    isSelected
                                      ? 'border-copper bg-copper/15 text-canvas'
                                      : 'border-white/5 bg-white/3 text-canvas/60 hover:bg-white/5'
                                  }`}
                                >
                                  <div>
                                    <div className="font-semibold text-xs">{pet.name}</div>
                                    <div className="text-[10px] font-mono text-meadow">{pet.id_tag}</div>
                                  </div>
                                  {isSelected ? (
                                    <CheckCircle size={18} weight="fill" className="text-copper shrink-0" />
                                  ) : (
                                    <div className="w-4 h-4 rounded-full border border-white/20 shrink-0" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* System Metrics Panel */}
          <div className="bg-surface border border-linen rounded-[28px] p-5 flex flex-col gap-3">
            <h3 className="font-display text-lg">System Metrics</h3>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
              <div className="bg-copper-soft rounded-2xl p-4">
                <div className="text-xs text-muted font-semibold uppercase tracking-wide">Owners</div>
                <div className="font-display text-3xl text-copper">{owners.length}</div>
              </div>
              <div className="bg-meadow-soft rounded-2xl p-4">
                <div className="text-xs text-muted font-semibold uppercase tracking-wide">Registered Pets</div>
                <div className="font-display text-3xl text-meadow">{allPets.length}</div>
              </div>
              <div className="bg-amber-soft rounded-2xl p-4">
                <div className="text-xs text-muted font-semibold uppercase tracking-wide">Pending Access</div>
                <div className="font-display text-3xl text-amber">{pendingCount}</div>
              </div>
              <div className="bg-canvas rounded-2xl p-4 flex items-center gap-2 text-sm text-muted col-span-2 lg:col-span-1">
                <MapPin size={16} className="text-copper" />
                {allSafezones.length} safe zones mapped
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}