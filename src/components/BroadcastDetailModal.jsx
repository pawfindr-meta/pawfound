import React from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { Phone, Heartbeat, Drop, BatteryCharging, ShieldCheck } from '@phosphor-icons/react';

export default function BroadcastDetailModal({ broadcast, open, onClose, onRescue, currentUserId }) {
  if (!broadcast) return null;
  const isOwner = broadcast.owner_id === currentUserId;

  return (
    <Modal open={open} onClose={onClose} title={`Lost Pet: ${broadcast.pet_name}`} subtitle="Community Search Alert">
      <div className="flex flex-col gap-3.5">
        <div className="bg-danger-soft border border-danger/20 rounded-2xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-danger font-semibold text-xs uppercase tracking-wide">
            <span className="w-2 h-2 rounded-full bg-danger animate-ping" />
            Active Community Alert
          </div>
          <span className="text-xs text-muted font-mono">{broadcast.id_tag || 'No Tag'}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm bg-canvas border border-linen rounded-2xl p-3">
          <div><span className="text-xs text-muted">Species</span><p className="font-semibold">{broadcast.pet_type}</p></div>
          <div><span className="text-xs text-muted">Breed</span><p className="font-semibold">{broadcast.pet_breed}</p></div>
          <div><span className="text-xs text-muted">Age</span><p className="font-semibold">{broadcast.pet_age} yrs</p></div>
          <div><span className="text-xs text-muted">Last Seen</span><p className="font-semibold">{new Date(broadcast.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>
        </div>

        <div className="bg-night text-canvas rounded-2xl p-3 flex justify-around">
          <div className="flex flex-col items-center">
            <Heartbeat size={18} className="text-copper" />
            <span className="text-[10px] text-canvas/50 mt-1">Heartbeat</span>
            <span className="font-bold text-xs">{broadcast.vitals?.bpm || '--'} BPM</span>
          </div>
          <div className="flex flex-col items-center">
            <Drop size={18} className="text-meadow" />
            <span className="text-[10px] text-canvas/50 mt-1">SpO2</span>
            <span className="font-bold text-xs">{broadcast.vitals?.spo2 || '--'}%</span>
          </div>
          <div className="flex flex-col items-center">
            <BatteryCharging size={18} className="text-amber" />
            <span className="text-[10px] text-canvas/50 mt-1">Battery</span>
            <span className="font-bold text-xs">{broadcast.vitals?.battery || '--'}%</span>
          </div>
        </div>

        <div className="bg-surface border border-linen rounded-2xl p-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-muted">Owner Name</div>
            <div className="font-bold text-sm text-ink">{broadcast.owner_name}</div>
          </div>
          <a
            href={`tel:${broadcast.owner_phone}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-copper hover:bg-copper-dark text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            <Phone size={14} weight="fill" /> Call Owner
          </a>
        </div>

        <div className="flex gap-2 mt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Close</Button>
          {!isOwner && (
            <Button
              className="flex-1 !bg-meadow !text-white font-bold"
              onClick={() => {
                onRescue(broadcast);
                onClose();
              }}
            >
              <ShieldCheck size={16} weight="bold" /> Rescued Pet
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}