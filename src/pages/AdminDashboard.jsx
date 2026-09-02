import React, { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  UsersThree, PawPrint, Cpu, Lightning, SignOut, Play, Pause, Path, MapPin, Check, X
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
  const [activeView, setActiveView] = useState('approvals');

  const [selectedTag, setSelectedTag] = useState('ESP-C3-TEST');
  const [simLat, setSimLat] = useState('14.6760');
  const [simLng, setSimLng] = useState('121.0437');
  const [simBpm, setSimBpm] = useState('85');
  const [simSpo2, setSimSpo2] = useState('98');
  const [simBattery, setSimBattery] = useState('100');
  const [simStatus, setSimStatus] = useState('');
  const [isAutoMoving, setIsAutoMoving] = useState(false);

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
      if (petData.length > 0 && petData[0].id_tag && selectedTag === 'ESP-C3-TEST') {
        setSelectedTag(petData[0].id_tag);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'safe_zones'), (snapshot) => {
      const szData = [];
      snapshot.forEach((docSnap) => szData.push({ id: docSnap.id, ...docSnap.data() }));
      setAllSafezones(szData);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let timer = null;
    if (isAutoMoving) {
      timer = setInterval(() => {
        setSimLat((prevLat) => {
          setSimLng((prevLng) => {
            const deltaLat = (Math.random() - 0.42) * 0.0008;
            const deltaLng = (Math.random() - 0.42) * 0.0008;
            const nextLat = (parseFloat(prevLat) + deltaLat).toFixed(6);
            const nextLng = (parseFloat(prevLng) + deltaLng).toFixed(6);
            const nextBpm = Math.floor(80 + Math.random() * 35);
            const nextSpo2 = Math.floor(95 + Math.random() * 4);
            setSimBpm(nextBpm.toString());
            setSimSpo2(nextSpo2.toString());
            telemetryThrottler.queueTelemetry(selectedTag, {
              lat: parseFloat(nextLat),
              lng: parseFloat(nextLng),
              bpm: nextBpm,
              spo2: nextSpo2,
              battery: parseInt(simBattery),
            });
            return nextLng;
          });
          return prevLat;
        });
      }, 2000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [isAutoMoving, selectedTag, simBattery]);

  const toggleApproval = async (id, currentStatus, name) => {
    try {
      await updateDoc(doc(db, 'users', id), { is_approved: !currentStatus });
      toast.success(currentStatus ? `${name} paused` : `${name} approved`);
    } catch (error) {
      toast.error('Could not update that account.');
    }
  };

  const handlePushTelemetry = async (e) => {
    e.preventDefault();
    if (!selectedTag) return;
    setSimStatus(`Sending a ping to ${selectedTag}…`);
    try {
      telemetryThrottler.queueTelemetry(selectedTag, {
        lat: parseFloat(simLat),
        lng: parseFloat(simLng),
        bpm: parseInt(simBpm),
        spo2: parseInt(simSpo2),
        battery: parseInt(simBattery),
      });
      setSimStatus(`Queued for ${selectedTag}.`);
      toast.success('Ping queued');
      setTimeout(() => setSimStatus(''), 2500);
    } catch (error) {
      setSimStatus(error.message);
    }
  };

  const handleTeleportToSafezone = (szId) => {
    const targetZone = allSafezones.find((sz) => sz.id === szId);
    if (!targetZone) return;
    setSimLat(targetZone.lat.toFixed(6));
    setSimLng(targetZone.lng.toFixed(6));
    telemetryThrottler.queueTelemetry(selectedTag, {
      lat: targetZone.lat,
      lng: targetZone.lng,
      bpm: parseInt(simBpm),
      spo2: parseInt(simSpo2),
      battery: parseInt(simBattery),
    });
    setSimStatus(`Moved inside “${targetZone.name}”.`);
    toast.success(`Moved into ${targetZone.name}`);
    setTimeout(() => setSimStatus(''), 2500);
  };

  const pendingCount = owners.filter((o) => !o.is_approved).length;
  const field = 'w-full bg-night-2 border border-white/10 rounded-xl px-3 py-2 text-sm text-canvas outline-none focus:border-copper';

  return (
    <div className="flex h-screen w-screen bg-canvas text-ink overflow-hidden p-3 gap-3">
      <aside className="bg-night text-canvas p-2 rounded-[22px] flex flex-col gap-2 items-center shrink-0 w-[72px]">
        <div className="w-full pb-2 border-b border-white/10 text-center pt-1">
          <span className="font-display text-lg">P<span className="text-copper">F</span></span>
          <p className="text-[9px] text-copper font-bold uppercase tracking-wider">Admin</p>
        </div>
        <nav className="flex-1 w-full flex flex-col gap-2 items-center">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`relative p-3 rounded-2xl transition ${active ? 'bg-copper text-white' : 'text-canvas/70 hover:bg-white/8'}`}
                title={item.label}
              >
                <Icon size={22} weight={active ? 'fill' : 'duotone'} />
                {item.id === 'approvals' && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber text-night text-[9px] font-bold rounded-full flex items-center justify-center">{pendingCount}</span>
                )}
              </button>
            );
          })}
        </nav>
        <button onClick={() => signOut(auth)} className="p-3 text-canvas/70 hover:bg-copper hover:text-white rounded-2xl" title="Sign out">
          <SignOut size={20} weight="bold" />
        </button>
      </aside>

      <main className="flex-1 flex flex-col gap-3 min-h-0">
        <header className="flex justify-between items-center bg-surface border border-linen px-4 py-3 rounded-[22px]">
          <div>
            <h2 className="font-display text-lg">Operations</h2>
            <p className="text-xs text-muted">Approve owners, inspect pets, and simulate collars.</p>
          </div>
          <div className="px-3 py-1.5 bg-meadow-soft text-meadow text-xs rounded-full flex items-center gap-2 font-semibold">
            <span className="w-2 h-2 rounded-full bg-meadow animate-pulse" />
            Online
          </div>
        </header>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 min-h-0">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="col-span-1 lg:col-span-2 bg-night text-canvas rounded-[28px] p-5 flex flex-col overflow-hidden"
          >
            {activeView === 'approvals' && (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-display text-lg">Owner access</h3>
                  <span className="text-sm text-canvas/50">{pendingCount} waiting</span>
                </div>
                {owners.length === 0 ? (
                  <EmptyState inverted title="No owner accounts yet" body="New registrations will land here for a one-tap review." />
                ) : (
                  <div className="flex-1 overflow-auto custom-scrollbar flex flex-col gap-2">
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
                  <h3 className="font-display text-lg">All pets</h3>
                  <span className="text-sm text-canvas/50">{allPets.length} registered</span>
                </div>
                {allPets.length === 0 ? (
                  <EmptyState inverted title="No pets yet" body="Pets appear here after an owner adds them." />
                ) : (
                  <div className="flex-1 overflow-auto custom-scrollbar flex flex-col gap-2">
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
              <div className="flex-1 flex items-center justify-center">
                <EmptyState
                  inverted
                  icon={<Cpu size={28} weight="duotone" />}
                  title="Device inspector"
                  body="Live collar diagnostics will live here. Use the simulator tab to send test pings for now."
                />
              </div>
            )}

            {activeView === 'simulator' && (
              <>
                <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
                  <h3 className="font-display text-lg">Collar simulator</h3>
                  <button
                    type="button"
                    onClick={() => setIsAutoMoving(!isAutoMoving)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 ${
                      isAutoMoving ? 'bg-amber text-night' : 'bg-meadow/20 text-meadow border border-meadow/30'
                    }`}
                  >
                    {isAutoMoving ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
                    {isAutoMoving ? 'Pause walk' : 'Start walk'}
                  </button>
                </div>
                <form onSubmit={handlePushTelemetry} className="flex-1 overflow-auto custom-scrollbar flex flex-col gap-3 max-w-xl">
                  <label className="text-xs font-semibold text-canvas/50">Target collar
                    <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)} className={`${field} mt-1`}>
                      {allPets.length > 0
                        ? allPets.filter((p) => p.id_tag).map((pet) => <option key={pet.id} value={pet.id_tag}>{pet.name} — {pet.id_tag}</option>)
                        : <option value="ESP-C3-TEST">ESP-C3-TEST</option>}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-canvas/50">Drop into a zone
                    <select onChange={(e) => handleTeleportToSafezone(e.target.value)} defaultValue="" className={`${field} mt-1`}>
                      <option value="" disabled>Choose a saved zone…</option>
                      {allSafezones.map((sz) => (
                        <option key={sz.id} value={sz.id}>{sz.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="text-xs font-semibold text-copper flex items-center gap-1"><Path size={14} /> Location</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" step="any" value={simLat} onChange={(e) => setSimLat(e.target.value)} className={field} />
                    <input type="number" step="any" value={simLng} onChange={(e) => setSimLng(e.target.value)} className={field} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-xs text-canvas/50">BPM<input type="number" value={simBpm} onChange={(e) => setSimBpm(e.target.value)} className={`${field} mt-1`} /></label>
                    <label className="text-xs text-canvas/50">SpO2<input type="number" value={simSpo2} onChange={(e) => setSimSpo2(e.target.value)} className={`${field} mt-1`} /></label>
                    <label className="text-xs text-canvas/50">Battery<input type="number" value={simBattery} onChange={(e) => setSimBattery(e.target.value)} className={`${field} mt-1`} /></label>
                  </div>
                  <Button type="submit" className="w-full">
                    <Lightning size={16} weight="bold" /> Send one ping
                  </Button>
                  {isAutoMoving && (
                    <div className="bg-amber/15 border border-amber/30 text-amber text-center text-xs p-3 rounded-2xl font-semibold">
                      Auto walk is sending a ping every 2 seconds
                    </div>
                  )}
                  {simStatus && !isAutoMoving && (
                    <div className="text-center text-xs p-3 rounded-2xl bg-meadow/15 text-meadow">{simStatus}</div>
                  )}
                </form>
              </>
            )}
          </motion.div>

          <div className="bg-surface border border-linen rounded-[28px] p-5 flex flex-col gap-3">
            <h3 className="font-display text-lg">At a glance</h3>
            <div className="bg-copper-soft rounded-2xl p-4">
              <div className="text-xs text-muted font-semibold uppercase tracking-wide">Owners</div>
              <div className="font-display text-3xl text-copper">{owners.length}</div>
            </div>
            <div className="bg-meadow-soft rounded-2xl p-4">
              <div className="text-xs text-muted font-semibold uppercase tracking-wide">Pets</div>
              <div className="font-display text-3xl text-meadow">{allPets.length}</div>
            </div>
            <div className="bg-amber-soft rounded-2xl p-4">
              <div className="text-xs text-muted font-semibold uppercase tracking-wide">Waiting for access</div>
              <div className="font-display text-3xl text-amber">{pendingCount}</div>
            </div>
            <div className="bg-canvas rounded-2xl p-4 flex items-center gap-2 text-sm text-muted">
              <MapPin size={16} className="text-copper" />
              {allSafezones.length} home zones across all owners
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
