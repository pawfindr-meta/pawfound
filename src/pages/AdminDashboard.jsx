import React, { useState, useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc, addDoc, deleteDoc, getDocs, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UsersThree, PawPrint, Cpu, Lightning, SignOut, Play, Pause, MapPin, Check, X,
  CheckCircle, Target, Power, WarningOctagon, Megaphone, Phone, Heartbeat, Drop, BatteryCharging
} from '@phosphor-icons/react';
import { auth, db } from '../firebase';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import BroadcastDetailModal from '../components/BroadcastDetailModal';

// Visible navigation tabs (Failsafe Simulator is concealed inside the Admin icon)
const NAV = [
  { id: 'approvals', icon: UsersThree, label: 'People' },
  { id: 'pets', icon: PawPrint, label: 'Pets' },
  { id: 'devices', icon: Cpu, label: 'Devices' },
];

export default function AdminDashboard() {
  const [owners, setOwners] = useState([]);
  const [allPets, setAllPets] = useState([]);
  const [allSafezones, setAllSafezones] = useState([]);
  const [activeBroadcasts, setActiveBroadcasts] = useState([]);
  const [selectedBroadcast, setSelectedBroadcast] = useState(null);
  const [activeView, setActiveView] = useState('pets');

  // Hidden Failsafe Simulator Popup State
  const [isFailsafeModalOpen, setIsFailsafeModalOpen] = useState(false);

  // Multi-Pet Failsafe Simulator States
  const [selectedPetIds, setSelectedPetIds] = useState([]);
  const [movementPattern, setMovementPattern] = useState('wander');
  const [targetZoneId, setTargetZoneId] = useState('');
  const [placementOffset, setPlacementOffset] = useState('center');
  const [isSimulating, setIsSimulating] = useState(false);

  const simStateRef = useRef({});
  const timerRef = useRef(null);
  const simPingCounterRef = useRef(1000);

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

  useEffect(() => {
    const q = query(collection(db, 'broadcasts'), where('status', '==', 'active'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bData = [];
      snapshot.forEach((docSnap) => bData.push({ id: docSnap.id, ...docSnap.data() }));
      setActiveBroadcasts(bData);
    });
    return () => unsubscribe();
  }, []);

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

  // Helper to push failsafe telemetry directly to Firestore with full schema alignment
  const updateDeviceTelemetry = async (idTag, payload) => {
    simPingCounterRef.current += 1;
    const fullPayload = {
      ...payload,
      ping_count: simPingCounterRef.current,
      last_updated: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'devices', idTag), fullPayload, { merge: true });
    } catch (err) {
      console.error('Error writing simulated telemetry:', err);
    }
  };

  // ============================================================
  // ADMIN SOS HANDLERS (TRIGGER & UNTRIGGER ALERTS)
  // ============================================================
  const handleAdminTriggerSOS = async (pet) => {
    if (!pet) return;

    let lat = 14.7011;
    let lng = 120.9830;
    let vitals = { bpm: 82, spo2: 98, battery: 95 };

    if (pet.id_tag) {
      try {
        const deviceSnap = await getDoc(doc(db, 'devices', pet.id_tag));
        if (deviceSnap.exists()) {
          const dev = deviceSnap.data();
          if (typeof dev.lat === 'number') lat = dev.lat;
          if (typeof dev.lng === 'number') lng = dev.lng;
          if (dev.bpm) vitals.bpm = dev.bpm;
          if (dev.spo2) vitals.spo2 = dev.spo2;
          if (dev.battery) vitals.battery = dev.battery;
        }
      } catch (_) {}
    }

    const owner = owners.find((o) => o.id === (pet.owner_id || pet.user_id));
    const ownerName = owner ? `${owner.first_name || ''} ${owner.last_name || ''}`.trim() : 'Registered Owner';
    const ownerPhone = owner?.phone_number || 'N/A';

    try {
      await updateDoc(doc(db, 'pets', pet.id), {
        is_missing: true,
        missing_since: new Date().toISOString(),
      });

      await addDoc(collection(db, 'broadcasts'), {
        pet_id: pet.id,
        id_tag: pet.id_tag || '',
        owner_id: pet.owner_id || pet.user_id || '',
        owner_name: ownerName,
        owner_phone: ownerPhone,
        pet_name: pet.name,
        pet_type: pet.type,
        pet_breed: pet.breed || 'Mixed',
        pet_age: pet.age,
        last_lat: lat,
        last_lng: lng,
        vitals,
        status: 'active',
        triggered_by_admin: true,
        created_at: new Date().toISOString(),
      });

      toast.error(`ADMIN SOS ACTIVE: Broadcasted alert for ${pet.name}.`);
    } catch (err) {
      toast.error('Failed to trigger SOS alert.');
    }
  };

  const handleAdminUntriggerSOS = async (petId, petName) => {
    try {
      await updateDoc(doc(db, 'pets', petId), {
        is_missing: false,
      });

      const bQuery = query(
        collection(db, 'broadcasts'),
        where('pet_id', '==', petId),
        where('status', '==', 'active')
      );
      const bSnap = await getDocs(bQuery);
      const deletions = bSnap.docs.map((bDoc) => deleteDoc(bDoc.ref));
      await Promise.all(deletions);

      toast.success(`SOS resolved: ${petName} marked as safe.`);
    } catch (err) {
      toast.error('Failed to resolve alert.');
    }
  };

  const handleResolveBroadcastDirectly = async (broadcast) => {
    if (!broadcast) return;
    try {
      await deleteDoc(doc(db, 'broadcasts', broadcast.id));
      if (broadcast.pet_id) {
        await updateDoc(doc(db, 'pets', broadcast.pet_id), {
          is_missing: false,
        });
      }
      toast.success(`Alert for ${broadcast.pet_name} dismissed.`);
    } catch (err) {
      toast.error('Failed to resolve broadcast.');
    }
  };

  // ============================================================
  // HARDWARE TELEMETRY CONTROLLER (FAILSAFE SIMULATOR)
  // ============================================================
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
        await updateDeviceTelemetry(pet.id_tag, {
          lat: parseFloat(currentCoord.lat.toFixed(6)),
          lng: parseFloat(currentCoord.lng.toFixed(6)),
          gps_locked: true, // Ensures live map fix displays
          bpm: 84,
          spo2: 98,
          battery: 95,
          status: 'online',
          is_breached: false,
        });
      } else {
        await setDoc(doc(db, 'devices', pet.id_tag), {
          status: 'offline',
          last_updated: new Date(Date.now() - 30000).toISOString(), // Forces heartbeat timeout
        }, { merge: true });
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

  const handlePlaceInSafezone = async () => {
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

    for (let index = 0; index < activePets.length; index++) {
      const pet = activePets[index];
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

      await updateDeviceTelemetry(pet.id_tag, {
        lat: parseFloat(placedLat.toFixed(6)),
        lng: parseFloat(placedLng.toFixed(6)),
        gps_locked: true,
        bpm: 85,
        spo2: 98,
        battery: 95,
        status: 'online',
        is_breached: false,
      });
    }

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
      await setDoc(doc(db, 'devices', pet.id_tag), {
        status: 'offline',
        is_breached: true,
        last_updated: new Date().toISOString(),
      }, { merge: true });

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
          setDoc(doc(db, 'devices', pet.id_tag), {
            status: 'offline',
            last_updated: new Date(Date.now() - 30000).toISOString(),
          }, { merge: true });
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

      // 3.5s update loop: pushes coordinates, ping_count, and gps_locked
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

          const dynamicBpm = Math.floor(84 + Math.random() * 16);
          const dynamicSpo2 = Math.floor(96 + Math.random() * 3);

          updateDeviceTelemetry(pet.id_tag, {
            lat: parseFloat(nextLat.toFixed(6)),
            lng: parseFloat(nextLng.toFixed(6)),
            gps_locked: true,
            bpm: dynamicBpm,
            spo2: dynamicSpo2,
            battery: 94,
            status: 'online',
            is_breached: false,
          });
        });
      }, 3500);
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
        
        {/* INVISIBLE / SECRET TRIGGER: Clicking the PF Admin badge opens Failsafe Mode */}
        <button
          type="button"
          onClick={() => setIsFailsafeModalOpen((v) => !v)}
          title="Failsafe Controller (Secret)"
          className="w-auto md:w-full pb-0 md:pb-2 border-b-0 md:border-b border-white/10 text-center pt-0 md:pt-1 px-2 md:px-0 flex items-center md:flex-col hover:opacity-80 transition cursor-pointer group"
        >
          <span className="font-display text-lg tracking-tight group-hover:scale-105 transition-transform">
            P<span className="text-copper">F</span>
          </span>
          <p className="text-[9px] text-copper font-bold uppercase tracking-wider ml-1.5 md:ml-0 group-hover:text-amber transition-colors">
            Admin
          </p>
        </button>

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
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber text-night text-[9px] font-bold rounded-full flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <button onClick={() => signOut(auth)} className="p-2.5 md:p-3 text-canvas/70 hover:bg-copper hover:text-white rounded-2xl" title="Sign out">
          <SignOut size={20} weight="bold" />
        </button>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 w-full flex flex-col gap-3 pb-28 md:pb-0 overflow-y-visible lg:overflow-y-auto min-h-0">
        <header className="flex justify-between items-center bg-surface border border-linen px-4 py-3 rounded-[22px] shrink-0">
          <div>
            <h2 className="font-display text-lg">System Administration</h2>
            <p className="text-xs text-muted">Manage system approvals and registered community pets.</p>
          </div>
          <div className="flex items-center gap-2">
            {activeBroadcasts.length > 0 && (
              <span className="px-3 py-1 bg-rose-500/15 text-rose-500 text-xs rounded-full border border-rose-500/30 flex items-center gap-1.5 font-bold animate-pulse">
                <Megaphone size={14} weight="fill" /> {activeBroadcasts.length} Active SOS
              </span>
            )}
            {isSimulating && (
              <span className="px-3 py-1 bg-amber/15 text-amber text-xs rounded-full border border-amber/30 flex items-center gap-1.5 font-semibold animate-pulse">
                <Lightning size={14} weight="fill" /> Failsafe Running ({selectedPetIds.length})
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
                  <div>
                    <h3 className="font-display text-lg">All registered pets</h3>
                    <p className="text-xs text-canvas/50">Admins can review registered pets or trigger community emergency alerts.</p>
                  </div>
                  <span className="text-sm text-canvas/50">{allPets.length} registered</span>
                </div>
                {allPets.length === 0 ? (
                  <EmptyState inverted title="No pets yet" body="Pets appear here once owners register them." />
                ) : (
                  <div className="flex flex-col gap-2 lg:overflow-y-auto custom-scrollbar">
                    {allPets.map((pet) => {
                      const owner = owners.find((o) => o.id === (pet.owner_id || pet.user_id));
                      return (
                        <div key={pet.id} className="bg-night-2 border border-white/8 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-copper text-base">{pet.name}</span>
                              {pet.is_missing && (
                                <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold rounded-full animate-pulse">
                                  SOS ACTIVE
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-canvas/60 mt-0.5">
                              {pet.type} · {pet.breed || 'Mixed'} · {pet.age} yrs
                            </div>
                            <div className="text-[11px] text-canvas/40 mt-1">
                              Owner: {owner ? `${owner.first_name} ${owner.last_name}` : 'Unknown'} · Tag: <span className="font-mono text-meadow">{pet.id_tag || 'None'}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {pet.is_missing ? (
                              <Button
                                size="sm"
                                className="!bg-meadow !text-night font-bold !py-2 !px-3 text-xs"
                                onClick={() => handleAdminUntriggerSOS(pet.id, pet.name)}
                              >
                                <CheckCircle size={15} weight="bold" /> Mark Found (Clear SOS)
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                className="!bg-rose-600 hover:!bg-rose-700 !text-white font-bold !py-2 !px-3 text-xs"
                                onClick={() => handleAdminTriggerSOS(pet)}
                              >
                                <Megaphone size={15} weight="fill" /> Trigger SOS Alert
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
                  body="Hardware connections and active telemetry streams appear here."
                />
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
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4">
                <div className="text-xs text-rose-500 font-semibold uppercase tracking-wide">Active SOS Alerts</div>
                <div className="font-display text-3xl text-rose-500">{activeBroadcasts.length}</div>
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

      {/* ============================================================ */}
      {/* INVISIBLE POPUP MODAL: FAILSAFE SIMULATOR & SOS CONTROLLER   */}
      {/* Triggered exclusively by clicking the Admin logo             */}
      {/* ============================================================ */}
      <AnimatePresence>
        {isFailsafeModalOpen && (
          <motion.div
            className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div 
              className="absolute inset-0 bg-night/70 backdrop-blur-sm"
              onClick={() => setIsFailsafeModalOpen(false)} 
            />

            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 16 }}
              className="relative w-full max-w-4xl max-h-[90vh] bg-night text-canvas rounded-[28px] border border-white/10 shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center p-5 border-b border-white/10 bg-night-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-copper text-white flex items-center justify-center">
                    <Lightning size={18} weight="fill" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg leading-none">Failsafe Controller & Emergency Hub</h3>
                    <p className="text-xs text-canvas/50 mt-0.5">Manage live SOS alerts and telemetry simulations.</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsFailsafeModalOpen(false)}
                  className="p-2 rounded-xl bg-white/10 text-canvas/70 hover:text-white hover:bg-white/15"
                >
                  <X size={18} weight="bold" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 flex flex-col gap-5 overflow-y-auto custom-scrollbar">

                {/* 1. ACTIVE COMMUNITY SOS ALERTS SECTION */}
                <div className="bg-night-2 border border-rose-500/30 rounded-2xl p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Megaphone size={18} className="text-rose-500 animate-pulse" weight="fill" />
                      <span className="font-bold text-sm text-canvas">Active Community SOS Alerts</span>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400">
                      {activeBroadcasts.length} Active
                    </span>
                  </div>

                  {activeBroadcasts.length === 0 ? (
                    <div className="text-xs text-canvas/40 py-2">
                      No active emergency broadcasts at the moment.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                      {activeBroadcasts.map((b) => (
                        <div key={b.id} className="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                              <span className="font-bold text-sm text-rose-400">MISSING: {b.pet_name}</span>
                              <span className="text-[10px] font-mono text-canvas/50">Tag: {b.id_tag || 'None'}</span>
                            </div>
                            <div className="text-xs text-canvas/60 mt-0.5">
                              {b.pet_type} · {b.pet_breed} · Owner: {b.owner_name} ({b.owner_phone})
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="!bg-white/10 !text-canvas hover:!bg-white/20 !py-1 !px-2.5 text-xs"
                              onClick={() => setSelectedBroadcast(b)}
                            >
                              Inspect
                            </Button>
                            <Button
                              size="sm"
                              className="!bg-meadow !text-night font-bold !py-1 !px-2.5 text-xs"
                              onClick={() => handleResolveBroadcastDirectly(b)}
                            >
                              <CheckCircle size={14} weight="bold" /> Untrigger (Clear SOS)
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. INSTANT POWER CONTROLS */}
                <div className="bg-night-2 border border-white/8 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <Power size={18} className="text-copper shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-canvas">Collar Power Override</div>
                      <div className="text-[11px] text-canvas/50">Instantly forces device to Live or Offline on owner screen</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSetCollarPower(true)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-meadow/20 text-meadow hover:bg-meadow hover:text-night transition"
                    >
                      Turn ON
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetCollarPower(false)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/20 text-rose-400 hover:bg-rose-600 hover:text-white transition"
                    >
                      Turn OFF
                    </button>
                  </div>
                </div>

                {/* 3. SIMULATOR PATHS & SCENARIOS */}
                <div className="bg-night-2 border border-white/8 rounded-2xl p-4 flex flex-col gap-3">
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
                      <label className="text-xs font-semibold text-canvas/50 mb-1 block">Movement Pattern</label>
                      <select
                        value={movementPattern}
                        onChange={(e) => setMovementPattern(e.target.value)}
                        disabled={isSimulating}
                        className={field}
                      >
                        <option value="wander">Realistic Wander</option>
                        <option value="orbit">Perimeter Orbit</option>
                        <option value="breach">Safe Zone Breach (Walk-Out)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-white/5 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handlePlaceInSafezone}
                        className="!bg-white/10 !text-canvas hover:!bg-copper hover:!text-white !py-1.5 !px-3 text-xs"
                      >
                        <Target size={14} weight="bold" /> Place in Zone
                      </Button>
                      <Button
                        type="button"
                        onClick={handleTriggerInstantBreach}
                        className="!bg-rose-600 hover:!bg-rose-700 !text-white !py-1.5 !px-3 text-xs font-bold"
                      >
                        <WarningOctagon size={14} weight="fill" /> Force Breach / Shutdown
                      </Button>
                    </div>

                    <Button
                      onClick={toggleSimulation}
                      className={`!px-4 !py-1.5 font-bold text-xs ${
                        isSimulating ? '!bg-rose-600 !text-white' : '!bg-meadow !text-night'
                      }`}
                    >
                      {isSimulating ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
                      {isSimulating ? 'Stop Movement Loop' : 'Run Movement Loop'}
                    </Button>
                  </div>
                </div>

                {/* 4. PET SELECTOR LIST */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-copper flex items-center gap-1">
                    <PawPrint size={14} /> Select Pets to Target
                  </span>

                  <div className="flex flex-col gap-2.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    {owners.map((owner) => {
                      const ownerPets = allPets.filter(
                        (p) => (p.owner_id === owner.id || p.user_id === owner.id) && p.id_tag
                      );
                      if (ownerPets.length === 0) return null;

                      const allOwnerSelected = ownerPets.every((p) => selectedPetIds.includes(p.id));

                      return (
                        <div key={owner.id} className="bg-night-2 border border-white/8 rounded-xl p-3">
                          <div className="flex justify-between items-center mb-1.5 pb-1.5 border-b border-white/5">
                            <div>
                              <span className="text-xs font-bold text-canvas">{owner.first_name} {owner.last_name}</span>
                              <span className="text-[10px] text-canvas/40 ml-2">@{owner.username}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleOwnerPets(owner.id)}
                              disabled={isSimulating}
                              className="text-[10px] text-copper hover:underline font-semibold"
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
                                  className={`p-2 rounded-lg border text-left flex items-center justify-between transition ${
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
                                    <CheckCircle size={16} weight="fill" className="text-copper shrink-0" />
                                  ) : (
                                    <div className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Broadcast Detail Modal (Admin Authorized) */}
      <BroadcastDetailModal
        broadcast={selectedBroadcast}
        open={Boolean(selectedBroadcast)}
        onClose={() => setSelectedBroadcast(null)}
        onRescue={() => {}}
        onResolve={handleResolveBroadcastDirectly}
        currentUserId={auth.currentUser?.uid}
        isAdmin={true}
      />
    </div>
  );
}