import React, { useState, useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Circle, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  House, PawPrint, ChartLineUp, Crosshair, Plus, Bell, User, X,
  WarningOctagon, ShieldCheck, Trash, MapPin, Gps, Heartbeat,
  Drop, BatteryCharging, SignOut, Target, NavigationArrow, WifiHigh, WifiSlash, PencilSimple
} from '@phosphor-icons/react';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { checkPetSafety, DEFAULT_MAP_CENTER } from '../lib/geo';
import { formatLastSeen, isLive } from '../lib/time';
import { formatAuthError } from '../lib/formatError';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';

function createPetMarkerIcon(isSelected, isBreached, hasSignal) {
  const color = !hasSignal ? '#6B6258' : isBreached ? '#B42318' : '#C45C26';
  return L.divIcon({
    className: 'custom-pet-marker',
    html: `<div class="relative flex h-8 w-8 items-center justify-center">
      <span class="${isBreached && hasSignal ? 'animate-ping' : ''} absolute inline-flex h-full w-full rounded-full opacity-70" style="background:${color}"></span>
      <span class="relative inline-flex rounded-full h-6 w-6 border-[3px] ${isSelected ? 'scale-125' : ''}" style="background:${color};border-color:#FFFDF8;box-shadow:0 0 0 2px ${color}40"></span>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function MapUpdater({ center, follow }) {
  const map = useMap();
  useEffect(() => {
    if (follow && center?.[0] && center?.[1]) map.setView(center, map.getZoom());
  }, [center, follow, map]);
  return null;
}

function MapClickHandler({ isPlacingMode, onMapClick }) {
  useMapEvents({
    click: (e) => {
      if (isPlacingMode) onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MetricRow({ icon, label, value, unit, percent, tone = 'copper' }) {
  const bar = {
    copper: 'bg-copper',
    meadow: 'bg-meadow',
    danger: 'bg-danger',
    muted: 'bg-muted',
  }[tone];
  const iconTone = {
    copper: 'bg-copper-soft text-copper',
    meadow: 'bg-meadow-soft text-meadow',
    danger: 'bg-danger-soft text-danger',
    muted: 'bg-linen text-muted',
  }[tone];
  return (
    <div className="bg-canvas border border-linen rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-sm">
      <div className="flex justify-between items-center gap-3">
        <span className="text-sm text-ink font-semibold flex items-center gap-2">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>{icon}</span>
          {label}
        </span>
        <span className="shrink-0 text-xl leading-none font-bold tracking-tight text-ink">
          {value}{unit ? <span className="ml-1 text-xs font-semibold text-muted">{unit}</span> : null}
        </span>
      </div>
      <div className="w-full bg-linen h-2 rounded-full overflow-hidden">
        <div className={`${bar} h-full rounded-full transition-all duration-500`} style={{ width: `${Math.min(100, percent || 0)}%` }} />
      </div>
    </div>
  );
}

export default function OwnerDashboard() {
  const { userData, currentUser } = useAuth();
  const [panel, setPanel] = useState('home');
  const [pets, setPets] = useState([]);
  const [activePetId, setActivePetId] = useState(null);
  const [isAddPetModalOpen, setIsAddPetModalOpen] = useState(false);
  const [devicesData, setDevicesData] = useState({});
  const [biometricHistory, setBiometricHistory] = useState([]);
  const [positionTrails, setPositionTrails] = useState({});
  const [safezones, setSafezones] = useState([]);
  const [followPet, setFollowPet] = useState(true);
  const [now, setNow] = useState(Date.now());

  const [newSzName, setNewSzName] = useState('');
  const [newSzLat, setNewSzLat] = useState('');
  const [newSzLng, setNewSzLng] = useState('');
  const [newSzRadius, setNewSzRadius] = useState(200);
  const [editingZoneId, setEditingZoneId] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isPlacingOnMap, setIsPlacingOnMap] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [alertsOpen, setAlertsOpen] = useState(false);

  const breachedPetsRef = useRef(new Set());
  const prevDeviceStateRef = useRef({});
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const q = query(collection(db, 'pets'), where('owner_id', '==', currentUser.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const petList = [];
      snapshot.forEach((docSnap) => petList.push({ id: docSnap.id, ...docSnap.data() }));
      setPets(petList);
      if (petList.length > 0) {
        if (!activePetId || !petList.some((p) => p.id === activePetId)) {
          setActivePetId(petList[0].id);
        }
      } else {
        setActivePetId(null);
      }
    });
    return () => unsub();
  }, [currentUser, activePetId]);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const q = query(collection(db, 'safe_zones'), where('owner_id', '==', currentUser.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() }));
      setSafezones(list);
    });
    return () => unsub();
  }, [currentUser]);

  const activePet = pets.find((p) => p.id === activePetId) || pets[0];

  useEffect(() => {
    if (pets.length === 0) return;
    const unsubs = pets.map((pet) => {
      if (!pet.id_tag) return () => {};
      return onSnapshot(doc(db, 'devices', pet.id_tag), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        const lat = typeof data.lat === 'number' ? data.lat : null;
        const lng = typeof data.lng === 'number' ? data.lng : null;

        const isDeviceOnline = data.status === 'online' && Boolean(data.last_updated);
        const pingTimestamp = isDeviceOnline ? new Date(data.last_updated).getTime() : null;

        setDevicesData((prev) => ({
          ...prev,
          [pet.id_tag]: {
            lat,
            lng,
            bpm: isDeviceOnline ? (data.bpm ?? '--') : '--',
            spo2: isDeviceOnline ? (data.spo2 ?? '--') : '--',
            battery: isDeviceOnline ? (data.battery ?? '--') : '--',
            status: isDeviceOnline ? 'online' : 'offline',
            is_breached: Boolean(data.is_breached),
            lastPingTime: pingTimestamp,
          },
        }));

        if (isDeviceOnline && lat != null && lng != null) {
          setPositionTrails((prev) => {
            const currentTrail = prev[pet.id_tag] || [];
            const lastPos = currentTrail[currentTrail.length - 1];
            if (!lastPos || lastPos[0] !== lat || lastPos[1] !== lng) {
              return { ...prev, [pet.id_tag]: [...currentTrail, [lat, lng]].slice(-25) };
            }
            return prev;
          });
        }

        if (activePet && pet.id_tag === activePet.id_tag) {
          if (isDeviceOnline && data.bpm && data.spo2) {
            const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setBiometricHistory((prev) => [...prev, { time: timeString, bpm: data.bpm, spo2: data.spo2 }].slice(-20));
          } else if (!isDeviceOnline) {
            setBiometricHistory([]);
          }
        }
      });
    });
    return () => unsubs.forEach((unsub) => unsub());
  }, [pets, activePetId]);

  // Safezone Boundary Breach Detection
  useEffect(() => {
    if (safezones.length === 0) return;
    pets.forEach((pet) => {
      const telemetry = devicesData[pet.id_tag];
      if (!telemetry || telemetry.status === 'offline' || telemetry.lat == null || telemetry.lng == null) return;
      const safety = checkPetSafety(telemetry.lat, telemetry.lng, safezones);

      if (!safety.isSafe && !breachedPetsRef.current.has(pet.id)) {
        breachedPetsRef.current.add(pet.id);
        const item = {
          id: Date.now() + Math.random(),
          title: `${pet.name} left home`,
          message: `${pet.name} is outside every saved zone.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'alert',
          read: false,
        };
        setNotifications((prev) => [item, ...prev]);
        toast.error(item.title, { description: item.message });
      } else if (safety.isSafe && breachedPetsRef.current.has(pet.id)) {
        breachedPetsRef.current.delete(pet.id);
        const zone = safety.matchedZone?.name || 'a safe zone';
        const item = {
          id: Date.now() + Math.random(),
          title: `${pet.name} is back`,
          message: `${pet.name} returned to ${zone}.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'success',
          read: false,
        };
        setNotifications((prev) => [item, ...prev]);
        toast.success(item.title, { description: item.message });
      }
    });
  }, [devicesData, pets, safezones]);

  // Sudden Collar Shutdown / Forceful Removal Tamper Detection
  useEffect(() => {
    pets.forEach((pet) => {
      if (!pet.id_tag) return;
      const currentTelemetry = devicesData[pet.id_tag];
      if (!currentTelemetry) return;

      const previous = prevDeviceStateRef.current[pet.id_tag];
      const isBreachedNow = currentTelemetry.is_breached;
      const wasOnline = previous?.status === 'online';
      const isNowOffline = currentTelemetry.status === 'offline';

      // Trigger critical alert when status abruptly drops offline with a breach, or flips is_breached
      if ((wasOnline && isNowOffline && isBreachedNow) || (!previous?.is_breached && isBreachedNow)) {
        const item = {
          id: Date.now() + Math.random(),
          title: `CRITICAL: ${pet.name}'s collar breached!`,
          message: `${pet.name}'s collar was forcefully removed, damaged, or powered down.`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'alert',
          read: false,
        };

        setNotifications((prev) => [item, ...prev]);
        toast.error(item.title, {
          description: item.message,
          duration: 8000,
        });
      }

      prevDeviceStateRef.current[pet.id_tag] = {
        status: currentTelemetry.status,
        is_breached: currentTelemetry.is_breached,
      };
    });
  }, [devicesData, pets]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return toast.error('Location is not available in this browser.');
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNewSzLat(pos.coords.latitude.toFixed(6));
        setNewSzLng(pos.coords.longitude.toFixed(6));
        if (!newSzName) setNewSzName('Home');
        setIsLocating(false);
        toast.success('Pinned to your current location');
      },
      () => {
        toast.error('Could not read your location.');
        setIsLocating(false);
      }
    );
  };

  const handleMapPinSelected = (lat, lng) => {
    setNewSzLat(lat.toFixed(6));
    setNewSzLng(lng.toFixed(6));
    setIsPlacingOnMap(false);
    setPanel('zones');
    if (!newSzName) setNewSzName('Pinned zone');
  };

  const handleEditSafezone = (zone) => {
    setEditingZoneId(zone.id);
    setNewSzName(zone.name);
    setNewSzLat(zone.lat.toFixed(6));
    setNewSzLng(zone.lng.toFixed(6));
    setNewSzRadius(zone.radius);
  };

  const resetSafezoneForm = () => {
    setEditingZoneId(null);
    setNewSzName('');
    setNewSzLat('');
    setNewSzLng('');
    setNewSzRadius(200);
  };

  const handleAddSafezone = async (e) => {
    e.preventDefault();
    if (!newSzName || !newSzLat || !newSzLng || !currentUser?.uid) return;
    try {
      const zoneData = {
        name: newSzName,
        lat: parseFloat(newSzLat),
        lng: parseFloat(newSzLng),
        radius: Number(newSzRadius),
      };

      if (editingZoneId) {
        await updateDoc(doc(db, 'safe_zones', editingZoneId), zoneData);
        toast.success('Home zone updated');
      } else {
        await addDoc(collection(db, 'safe_zones'), {
          ...zoneData,
          owner_id: currentUser.uid,
          created_at: new Date().toISOString(),
        });
        toast.success('Home zone saved');
      }
      resetSafezoneForm();
    } catch (err) {
      toast.error(formatAuthError(err));
    }
  };

  const handleDeleteSafezone = async (id, name) => {
    if (!currentUser?.uid) return;
    if (!window.confirm(`Remove “${name}”?`)) return;
    await deleteDoc(doc(db, 'safe_zones', id));
    toast.success('Zone removed');
  };

  const handleAddPet = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    try {
      await addDoc(collection(db, 'pets'), {
        owner_id: currentUser.uid,
        name: formData.get('pet_name'),
        type: formData.get('pet_type'),
        breed: formData.get('pet_breed'),
        age: formData.get('pet_age'),
        id_tag: (formData.get('id_tag') || '').trim(),
        created_at: new Date().toISOString(),
      });
      setIsAddPetModalOpen(false);
      toast.success('Pet added to your family');
    } catch (error) {
      toast.error(formatAuthError(error));
    }
  };

  const handleDeletePet = async (petId, petName, idTag) => {
    if (!currentUser?.uid) return;
    if (!window.confirm(`Are you sure you want to remove “${petName}”? This cannot be undone.`)) return;

    try {
      await deleteDoc(doc(db, 'pets', petId));
      
      breachedPetsRef.current.delete(petId);
      if (idTag) {
        setPositionTrails((prev) => {
          const updated = { ...prev };
          delete updated[idTag];
          return updated;
        });
        setDevicesData((prev) => {
          const updated = { ...prev };
          delete updated[idTag];
          return updated;
        });
      }

      toast.success(`${petName} removed`);
    } catch (err) {
      toast.error(formatAuthError(err));
    }
  };

  const markAlertsRead = () => {
    setAlertsOpen(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const activeTelemetry = activePet?.id_tag ? devicesData[activePet.id_tag] : null;
  const hasFix = activeTelemetry?.lat != null && activeTelemetry?.lng != null;
  const activeSafety = activePet && hasFix
    ? checkPetSafety(activeTelemetry.lat, activeTelemetry.lng, safezones)
    : { isSafe: true, matchedZone: null, unknown: true };

  const mapCenter = hasFix
    ? [activeTelemetry.lat, activeTelemetry.lng]
    : (safezones[0] ? [safezones[0].lat, safezones[0].lng] : DEFAULT_MAP_CENTER);

  // Single source of truth for online/offline state
  const isCollarOnline = activeTelemetry?.status === 'online' && activeTelemetry?.lastPingTime != null;
  const live = isCollarOnline && isLive(activeTelemetry?.lastPingTime, now);

  const bpmValue = live ? (parseFloat(activeTelemetry?.bpm) || 0) : 0;
  const spo2Value = live ? (parseFloat(activeTelemetry?.spo2) || 0) : 0;
  const batteryValue = live ? (parseFloat(activeTelemetry?.battery) || 0) : 0;

  const navItems = [
    { id: 'home', icon: House, label: 'Home' },
    { id: 'pets', icon: PawPrint, label: 'Pets' },
    { id: 'health', icon: ChartLineUp, label: 'Health' },
    { id: 'zones', icon: Crosshair, label: 'Zones' },
  ];

  return (
    <div className="flex flex-col h-screen w-screen bg-canvas text-ink overflow-hidden">
      <header className="flex justify-between items-center px-4 py-3 shrink-0 z-20 bg-surface/80 border-b border-linen backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-copper text-white flex items-center justify-center shadow-sm">
            <PawPrint size={18} weight="fill" />
          </div>
          <div>
            <h1 className="font-display text-xl leading-none">Paw<span className="text-copper">Found</span></h1>
            <p className="text-xs text-muted mt-0.5">Hi {userData?.first_name || 'there'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex text-xs font-medium bg-surface border border-linen rounded-full px-3 py-1.5 text-muted">
            {pets.length} {pets.length === 1 ? 'pet' : 'pets'} · {safezones.length} {safezones.length === 1 ? 'zone' : 'zones'}
          </span>
          <button
            onClick={markAlertsRead}
            className="relative p-2.5 bg-surface border border-linen hover:bg-copper-soft rounded-2xl transition"
            title="Alerts"
          >
            <Bell size={18} weight="duotone" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
          <button onClick={() => setPanel('profile')} className="p-2.5 bg-night text-canvas hover:bg-copper rounded-2xl transition" title="Profile">
            <User size={18} weight="duotone" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 px-3 py-3 gap-3">
        <aside className="hidden md:flex bg-night text-canvas p-2 rounded-[22px] flex-col gap-2 items-center shrink-0 w-[68px] shadow-lg shadow-night/10">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = panel === item.id || (item.id === 'home' && panel === 'home');
            return (
              <button
                key={item.id}
                onClick={() => setPanel(item.id)}
                className={`p-3 rounded-2xl transition-all ${active ? 'bg-copper text-white' : 'text-canvas/70 hover:bg-white/8'}`}
                title={item.label}
              >
                <Icon size={22} weight={active ? 'fill' : 'duotone'} />
              </button>
            );
          })}
          <button onClick={() => setIsAddPetModalOpen(true)} className="mt-auto p-3 bg-copper hover:bg-copper-dark text-white rounded-2xl" title="Add pet">
            <Plus size={20} weight="bold" />
          </button>
        </aside>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 min-h-0">
          <div className="lg:col-span-2 bg-night rounded-[28px] overflow-hidden relative min-h-[320px] h-full shadow-lg shadow-night/10">
            {isPlacingOnMap && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[2000] bg-copper text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-sm font-semibold">
                <Target size={18} weight="bold" />
                Tap the map to drop a home zone
                <button onClick={() => setIsPlacingOnMap(false)} className="ml-1 bg-black/20 p-1 rounded-lg"><X size={12} weight="bold" /></button>
              </div>
            )}

            <MapContainer center={mapCenter} zoom={15} style={{ height: '100%', width: '100%', minHeight: 280 }}>
              <TileLayer 
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
                attribution="&copy; OpenStreetMap contributors" 
              />
              <MapUpdater center={mapCenter} follow={followPet && !isPlacingOnMap} />
              <MapClickHandler isPlacingMode={isPlacingOnMap} onMapClick={handleMapPinSelected} />

              {safezones.map((sz) => (
                <Circle key={sz.id} center={[sz.lat, sz.lng]} radius={sz.radius} pathOptions={{ color: '#2F7D57', fillColor: '#2F7D57', fillOpacity: 0.12, weight: 2, dashArray: '6 6' }} />
              ))}

              {pets.map((pet) => {
                const trail = positionTrails[pet.id_tag];
                if (!trail || trail.length < 2) return null;
                return <Polyline key={`trail-${pet.id}`} positions={trail} pathOptions={{ color: '#C45C26', weight: 3, opacity: 0.7 }} />;
              })}

              {pets.map((pet) => {
                const telemetry = devicesData[pet.id_tag];
                if (telemetry?.lat == null || telemetry?.lng == null) return null;
                const petOnline = telemetry.status === 'online' && telemetry.lastPingTime != null;
                const safety = checkPetSafety(telemetry.lat, telemetry.lng, safezones);
                const selected = activePetId === pet.id;
                const signal = petOnline && isLive(telemetry.lastPingTime, now);
                return (
                  <Marker
                    key={pet.id}
                    position={[telemetry.lat, telemetry.lng]}
                    icon={createPetMarkerIcon(selected, (!safety.isSafe && !safety.unknown) || telemetry.is_breached, signal)}
                    eventHandlers={{ click: () => { setActivePetId(pet.id); setFollowPet(true); } }}
                  >
                    <Popup className="custom-leaflet-popup">
                      <div className="text-sm p-1">
                        <strong className="text-copper">{pet.name}</strong>
                        <div className={`mt-1 font-medium ${
                          telemetry.is_breached
                            ? 'text-danger font-bold'
                            : !signal
                            ? 'text-muted'
                            : !safety.isSafe && !safety.unknown
                            ? 'text-danger'
                            : safety.matchedZone
                            ? 'text-meadow'
                            : 'text-muted'
                        }`}>
                          {telemetry.is_breached
                            ? 'Collar Tampered / Breached'
                            : !signal
                            ? 'Collar is offline'
                            : !safety.isSafe && !safety.unknown
                            ? 'Outside every zone'
                            : safety.matchedZone
                            ? `Inside ${safety.matchedZone.name}`
                            : 'No zones yet'}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>

            <div className="absolute top-3 left-3 z-[1000] flex gap-2 overflow-x-auto max-w-[70%] pb-1">
              {pets.map((pet) => (
                <button
                  key={pet.id}
                  onClick={() => { setActivePetId(pet.id); setFollowPet(true); }}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold border transition ${
                    activePetId === pet.id ? 'bg-copper text-white border-copper' : 'bg-surface/90 text-ink border-linen'
                  }`}
                >
                  {pet.name}
                </button>
              ))}
            </div>

            <div className="absolute top-3 right-3 z-[1000] rounded-2xl border border-white/60 bg-surface/90 px-3 py-2 shadow-lg backdrop-blur-md">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink">
                <span className={`h-2 w-2 rounded-full ${live ? 'bg-meadow animate-pulse' : activeTelemetry?.is_breached ? 'bg-danger animate-ping' : 'bg-muted'}`} />
                {activeTelemetry?.is_breached ? 'Tamper Alert' : live ? 'Live location' : 'Location offline'}
              </div>
              <div className="mt-0.5 max-w-[130px] truncate text-xs text-muted">
                {activePet?.name || 'No pet selected'}
              </div>
            </div>

            <button
              onClick={() => setFollowPet((v) => !v)}
              className={`absolute bottom-4 left-3 z-[1000] flex items-center gap-2 px-3 py-2 rounded-2xl text-sm font-semibold shadow-lg border ${
                followPet ? 'bg-copper text-white border-copper' : 'bg-surface text-ink border-linen'
              }`}
            >
              <NavigationArrow size={16} weight="fill" />
              {followPet ? 'Following' : 'Follow pet'}
            </button>
          </div>

          <div className="hidden lg:flex lg:col-span-1 h-full min-h-0 flex-col gap-3">
            <HealthCard
              activePet={activePet}
              activeTelemetry={activeTelemetry}
              activeSafety={activeSafety}
              live={live}
              now={now}
              bpmValue={bpmValue}
              spo2Value={spo2Value}
              batteryValue={batteryValue}
              biometricHistory={biometricHistory}
              onAdd={() => setIsAddPetModalOpen(true)}
            />
            <PetListCard 
              pets={pets} 
              activePetId={activePetId} 
              devicesData={devicesData} 
              safezones={safezones} 
              now={now} 
              onSelect={setActivePetId} 
              onDelete={handleDeletePet} 
            />
          </div>
        </div>
      </div>

      <nav className="md:hidden flex items-center justify-around px-2 py-2 bg-surface border-t border-linen shadow-[0_-8px_24px_rgba(28,23,18,0.06)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = panel === item.id;
          return (
            <button key={item.id} onClick={() => setPanel(item.id)} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[11px] font-semibold ${active ? 'text-copper' : 'text-muted'}`}>
              <Icon size={22} weight={active ? 'fill' : 'duotone'} />
              {item.label}
            </button>
          );
        })}
        <button onClick={() => setIsAddPetModalOpen(true)} className="flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-semibold text-copper">
          <Plus size={22} weight="bold" />
          Add
        </button>
      </nav>

      <AnimatePresence>
        {panel === 'pets' && (
          <SlidePanel title="Your pets" onClose={() => setPanel('home')}>
            {pets.length === 0 ? (
              <EmptyState
                icon={<PawPrint size={28} weight="fill" />}
                title="Add your first pet"
                body="Give them a name now. You can link a collar later when the hardware is ready."
                action={<Button onClick={() => setIsAddPetModalOpen(true)}>Add a pet</Button>}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {pets.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between bg-canvas border border-linen rounded-2xl p-4 hover:border-copper/40 transition gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => { setActivePetId(p.id); setPanel('home'); setFollowPet(true); }}
                      className="text-left flex-1"
                    >
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-sm text-muted">{p.type} · {p.breed || 'Mixed'} · {p.age} yrs</div>
                      <div className="text-xs text-copper mt-1">{p.id_tag ? `Collar ${p.id_tag}` : 'No collar linked yet'}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePet(p.id, p.name, p.id_tag)}
                      className="p-2.5 text-muted hover:text-danger hover:bg-danger-soft rounded-xl transition"
                      title={`Remove ${p.name}`}
                    >
                      <Trash size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SlidePanel>
        )}

        {panel === 'health' && (
          <SlidePanel title="Health stream" subtitle={activePet?.name} onClose={() => setPanel('home')} wide>
            {biometricHistory.length > 0 ? (
              <div className="h-[48vh] bg-canvas rounded-2xl p-3 border border-linen">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={biometricHistory} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="bpmG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C45C26" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#C45C26" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="spo2G" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2F7D57" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#2F7D57" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8DFD2" />
                    <XAxis dataKey="time" stroke="#6B6258" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" stroke="#6B6258" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" stroke="#2F7D57" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: '#FFFDF8', borderColor: '#E8DFD2', borderRadius: 12, fontSize: 12 }} />
                    <Area isAnimationActive={false} yAxisId="left" type="monotone" dataKey="bpm" stroke="#C45C26" strokeWidth={2.5} fill="url(#bpmG)" name="Heart rate" />
                    <Area isAnimationActive={false} yAxisId="right" type="monotone" dataKey="spo2" stroke="#2F7D57" strokeWidth={2.5} fill="url(#spo2G)" name="SpO2" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                icon={<Heartbeat size={28} weight="fill" />}
                title="Waiting for a heartbeat"
                body={`Once ${activePet?.name || 'your pet'}’s collar starts sending data, the live chart appears here.`}
              />
            )}
          </SlidePanel>
        )}

        {panel === 'zones' && (
          <SlidePanel title="Home zones" subtitle="Pets are safe inside any of these circles." onClose={() => setPanel('home')}>
            {safezones.length === 0 && (
              <p className="text-sm text-muted mb-4">No zones yet. Use your location or tap the map to set home.</p>
            )}
            <div className="flex flex-col gap-2 mb-4">
              {safezones.map((sz) => (
                <div key={sz.id} className="bg-canvas border border-linen rounded-2xl p-3 flex justify-between items-center">
                  <div>
                    <div className="font-semibold flex items-center gap-1.5"><MapPin size={14} className="text-meadow" />{sz.name}</div>
                    <div className="text-xs text-muted font-mono mt-0.5">{sz.lat.toFixed(4)}, {sz.lng.toFixed(4)} · {sz.radius}m</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleEditSafezone(sz)} className="p-2 text-muted hover:bg-copper-soft hover:text-copper rounded-xl" title={`Edit ${sz.name}`}>
                      <PencilSimple size={16} />
                    </button>
                    <button onClick={() => handleDeleteSafezone(sz.id, sz.name)} className="p-2 text-danger hover:bg-danger-soft rounded-xl" title={`Delete ${sz.name}`}>
                      <Trash size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleAddSafezone} className="flex flex-col gap-3 bg-canvas border border-linen rounded-2xl p-4">
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => { setPanel('home'); setIsPlacingOnMap(true); }}>
                  <Target size={14} /> Tap map
                </Button>
                <Button type="button" variant="secondary" className="flex-1" onClick={handleUseCurrentLocation} disabled={isLocating}>
                  <Gps size={14} /> {isLocating ? 'Finding…' : 'My location'}
                </Button>
              </div>
              <label className="text-xs font-semibold text-muted">Name
                <input value={newSzName} onChange={(e) => setNewSzName(e.target.value)} required placeholder="Home, park, office" className="mt-1 w-full bg-surface border border-linen rounded-xl px-3 py-2 text-sm outline-none focus:border-copper" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-muted">Latitude
                  <input type="number" step="any" value={newSzLat} onChange={(e) => setNewSzLat(e.target.value)} required className="mt-1 w-full bg-surface border border-linen rounded-xl px-3 py-2 text-sm font-mono outline-none" />
                </label>
                <label className="text-xs font-semibold text-muted">Longitude
                  <input type="number" step="any" value={newSzLng} onChange={(e) => setNewSzLng(e.target.value)} required className="mt-1 w-full bg-surface border border-linen rounded-xl px-3 py-2 text-sm font-mono outline-none" />
                </label>
              </div>
              <label className="text-xs font-semibold text-muted flex justify-between">Radius <span className="text-copper">{newSzRadius} m</span></label>
              <input type="range" min="20" max="1000" step="10" value={newSzRadius} onChange={(e) => setNewSzRadius(Number(e.target.value))} className="accent-copper" />
              <div className="flex gap-2">
                {editingZoneId && (
                  <Button type="button" variant="secondary" className="flex-1" onClick={resetSafezoneForm}>Cancel</Button>
                )}
                <Button type="submit" className="flex-1">{editingZoneId ? 'Update zone' : 'Save zone'}</Button>
              </div>
            </form>
          </SlidePanel>
        )}

        {panel === 'profile' && (
          <SlidePanel title="Your profile" onClose={() => setPanel('home')}>
            <div className="grid grid-cols-2 gap-3 text-sm bg-canvas border border-linen rounded-2xl p-4">
              <div><div className="text-xs text-muted">Name</div><div className="font-medium">{userData?.first_name} {userData?.last_name}</div></div>
              <div><div className="text-xs text-muted">Username</div><div className="font-medium">@{userData?.username}</div></div>
              <div className="col-span-2"><div className="text-xs text-muted">Email</div><div className="font-medium">{userData?.email}</div></div>
              <div className="col-span-2"><div className="text-xs text-muted">Phone</div><div className="font-medium">{userData?.phone_number}</div></div>
            </div>
            <Button variant="danger" className="w-full mt-4" onClick={() => signOut(auth)}>
              <SignOut size={16} /> Sign out
            </Button>
          </SlidePanel>
        )}
      </AnimatePresence>

      <Modal open={alertsOpen} onClose={() => setAlertsOpen(false)} title="Alerts" subtitle="Live updates from collars and zones">
        {notifications.length === 0 ? (
          <EmptyState icon={<Bell size={24} />} title="All quiet" body="You’ll see a toast here if a pet leaves a home zone or a collar is breached." />
        ) : (
          <div className="flex flex-col gap-2">
            {notifications.map((n) => (
              <div key={n.id} className={`p-3 rounded-2xl border text-sm ${
                n.type === 'alert' ? 'bg-danger-soft border-danger/20' :
                n.type === 'success' ? 'bg-meadow-soft border-meadow/20' :
                'bg-canvas border-linen'
              }`}>
                <div className="flex justify-between gap-2 font-semibold">
                  <span>{n.title}</span>
                  <span className="text-xs text-muted font-medium">{n.time}</span>
                </div>
                <p className="text-sm text-muted mt-1">{n.message}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={isAddPetModalOpen} onClose={() => setIsAddPetModalOpen(false)} title="Add a pet" subtitle="Collar ID is optional until the hardware is ready.">
        <form onSubmit={handleAddPet} className="flex flex-col gap-3">
          <label className="text-xs font-semibold text-muted">Name *
            <input name="pet_name" required className="mt-1 w-full bg-canvas border border-linen rounded-xl px-3 py-2 text-sm outline-none focus:border-copper" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-muted">Type *
              <select name="pet_type" required className="mt-1 w-full bg-canvas border border-linen rounded-xl px-3 py-2 text-sm outline-none">
                <option value="">Select…</option>
                <option value="Dog">Dog</option>
                <option value="Cat">Cat</option>
                <option value="Rabbit">Rabbit</option>
                <option value="Bird">Bird</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-muted">Breed
              <input name="pet_breed" className="mt-1 w-full bg-canvas border border-linen rounded-xl px-3 py-2 text-sm outline-none" />
            </label>
            <label className="text-xs font-semibold text-muted">Age *
              <input type="number" name="pet_age" required className="mt-1 w-full bg-canvas border border-linen rounded-xl px-3 py-2 text-sm outline-none" />
            </label>
            <label className="text-xs font-semibold text-muted">Collar ID
              <input name="id_tag" placeholder="Optional" className="mt-1 w-full bg-canvas border border-linen rounded-xl px-3 py-2 text-sm font-mono outline-none" />
            </label>
          </div>
          <div className="flex gap-2 mt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsAddPetModalOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1">Save pet</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function SlidePanel({ title, subtitle, onClose, children, wide }) {
  return (
    <motion.div
      className="fixed inset-0 z-[2500] flex items-end sm:items-center justify-center p-0 sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button className="absolute inset-0 bg-night/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <motion.div
        initial={{ y: 48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 32, opacity: 0 }}
        className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[86vh] bg-surface rounded-t-3xl sm:rounded-3xl border border-linen shadow-2xl flex flex-col overflow-hidden`}
      >
        <div className="flex justify-between items-start p-5 border-b border-linen">
          <div>
            <h2 className="font-display text-lg">{title}</h2>
            {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-linen"><X size={16} weight="bold" /></button>
        </div>
        <div className="p-5 overflow-auto custom-scrollbar">{children}</div>
      </motion.div>
    </motion.div>
  );
}

function HealthCard({ activePet, activeTelemetry, activeSafety, live, now, bpmValue, spo2Value, batteryValue, biometricHistory, onAdd }) {
  if (!activePet) {
    return (
      <div className="flex-1 bg-surface border border-linen rounded-[28px] p-4">
        <EmptyState
          icon={<PawPrint size={24} weight="fill" />}
          title="No pets yet"
          body="Add a pet to start tracking location and health."
          action={<Button onClick={onAdd}>Add your first pet</Button>}
        />
      </div>
    );
  }

  const breached = (!activeSafety.isSafe && !activeSafety.unknown) || activeTelemetry?.is_breached;
  const spo2Tone = spo2Value && spo2Value < 94 ? 'danger' : 'meadow';
  const batTone = !live ? 'muted' : batteryValue < 20 ? 'danger' : 'meadow';

  return (
    <div className="flex-none bg-surface border border-linen rounded-[28px] p-4 flex flex-col overflow-hidden">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Selected pet</div>
          <h3 className="font-display text-xl">{activePet.name}</h3>
          <p className="text-sm text-muted">{activePet.type} · {activePet.breed || 'Mixed'} · {activePet.age} yrs</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
          breached ? 'bg-danger-soft text-danger' : 'bg-meadow-soft text-meadow'
        }`}>
          {breached ? <WarningOctagon size={12} weight="fill" /> : <ShieldCheck size={12} weight="fill" />}
          {activeTelemetry?.is_breached ? 'Collar Breached' : breached ? 'Outside zones' : activeSafety.matchedZone ? activeSafety.matchedZone.name : 'No zones yet'}
        </span>
      </div>
      <div className={`flex items-center gap-2 text-xs mb-3 ${live ? 'text-meadow' : 'text-muted'}`}>
        {live ? <WifiHigh size={14} /> : <WifiSlash size={14} />}
        {formatLastSeen(activeTelemetry?.lastPingTime, now)}
        {activePet.id_tag ? <span className="text-muted">· {activePet.id_tag}</span> : <span className="text-muted">· No collar</span>}
      </div>
      <div className="mb-3 rounded-2xl border border-linen bg-night p-3 text-canvas">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-canvas/70">
            <span className={`h-2 w-2 rounded-full ${live ? 'bg-meadow animate-pulse' : 'bg-canvas/40'}`} />
            Live health trend
          </div>
          <span className="font-mono text-[10px] text-canvas/50">BPM / SpO2</span>
        </div>
        {live && biometricHistory.length > 1 ? (
          <div className="h-20">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={biometricHistory} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="healthBpmFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C45C26" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#C45C26" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="healthSpo2Fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5DB184" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#5DB184" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  cursor={{ stroke: '#FFFDF8', strokeOpacity: 0.25 }}
                  contentStyle={{ background: '#231E19', border: '1px solid #4A4036', borderRadius: 10, color: '#FFFDF8', fontSize: 11 }}
                  labelStyle={{ color: '#CFC4B7' }}
                />
                <Area isAnimationActive={false} type="monotone" dataKey="bpm" stroke="#C45C26" strokeWidth={2.5} fill="url(#healthBpmFill)" name="Heart rate" connectNulls />
                <Area isAnimationActive={false} type="monotone" dataKey="spo2" stroke="#5DB184" strokeWidth={2.5} fill="url(#healthSpo2Fill)" name="SpO2" connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-canvas/20 text-xs text-canvas/55">
            Collar is offline
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <MetricRow 
          icon={<Heartbeat size={16} className="text-copper" />} 
          label="Heart rate" 
          value={live ? (activeTelemetry?.bpm ?? '--') : '--'} 
          unit={live ? 'BPM' : ''} 
          percent={live ? (bpmValue / 200) * 100 : 0} 
        />
        <MetricRow 
          icon={<Drop size={16} className="text-meadow" />} 
          label="Blood oxygen" 
          value={live ? (activeTelemetry?.spo2 ?? '--') : '--'} 
          unit={live ? '%' : ''} 
          percent={live ? spo2Value : 0} 
          tone={spo2Tone} 
        />
        <MetricRow 
          icon={<BatteryCharging size={16} className="text-meadow" />} 
          label="Collar battery" 
          value={live ? (activeTelemetry?.battery ?? '--') : '--'} 
          unit={live ? '%' : ''} 
          percent={live ? batteryValue : 0} 
          tone={batTone} 
        />
      </div>
    </div>
  );
}

function PetListCard({ pets, activePetId, devicesData, safezones, now, onSelect, onDelete }) {
  return (
    <div className="flex-1 min-h-0 bg-surface border border-linen rounded-[28px] p-4 flex flex-col">
      <div className="flex justify-between mb-3">
        <h3 className="text-sm font-semibold">Family</h3>
        <span className="text-xs text-muted">{pets.length} registered</span>
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar flex flex-col gap-2">
        {pets.length === 0 && <p className="text-sm text-muted">Your pets will show up here.</p>}
        {pets.map((pet) => {
          const telemetry = devicesData[pet.id_tag];
          const petOnline = telemetry?.status === 'online' && telemetry?.lastPingTime != null && isLive(telemetry.lastPingTime, now);
          const safety = telemetry?.lat != null && petOnline ? checkPetSafety(telemetry.lat, telemetry.lng, safezones) : { isSafe: true, unknown: true };
          const selected = activePetId === pet.id;
          const isBreached = telemetry?.is_breached;

          return (
            <div
              key={pet.id}
              className={`p-3 rounded-2xl border flex items-center justify-between transition gap-2 ${
                selected ? 'bg-night text-canvas border-night' : 'bg-canvas border-linen hover:border-copper/40'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(pet.id)}
                className="flex-1 text-left"
              >
                <div className="font-semibold text-sm">{pet.name}</div>
                <div className={`text-xs ${selected ? 'text-canvas/60' : 'text-muted'}`}>{pet.type} · {formatLastSeen(telemetry?.lastPingTime, now)}</div>
              </button>
              
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isBreached
                    ? 'bg-danger text-white'
                    : !petOnline
                    ? 'bg-night/10 text-muted'
                    : !safety.isSafe && !safety.unknown
                    ? 'bg-danger/15 text-danger'
                    : 'bg-meadow/15 text-meadow'
                }`}>
                  {isBreached ? 'BREACH' : !petOnline ? 'OFF' : (!safety.isSafe && !safety.unknown ? 'OUT' : 'OK')}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(pet.id, pet.name, pet.id_tag);
                  }}
                  className={`p-1.5 rounded-lg transition ${
                    selected 
                      ? 'text-canvas/50 hover:text-danger hover:bg-white/10' 
                      : 'text-muted hover:text-danger hover:bg-danger-soft'
                  }`}
                  title={`Remove ${pet.name}`}
                >
                  <Trash size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}