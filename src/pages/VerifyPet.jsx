import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PawPrint, Phone, WarningCircle } from '@phosphor-icons/react';

export default function VerifyPet() {
  const { petId } = useParams();
  const [pet, setPet] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPublicPet() {
      try {
        const snap = await getDoc(doc(db, 'public_pets', petId));
        if (snap.exists()) {
          setPet(snap.data());
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchPublicPet();
  }, [petId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center text-sm font-semibold text-muted">
        Checking pet tag registry...
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="min-h-screen bg-canvas p-4 flex flex-col items-center justify-center text-center">
        <WarningCircle size={44} className="text-danger mb-2" />
        <h2 className="font-display text-xl font-bold text-ink">Unregistered Tag</h2>
        <p className="text-xs text-muted mt-1 max-w-xs">
          This collar is either unassigned or no longer registered in the PawFound registry.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas p-4 flex items-center justify-center">
      <div className="w-full max-w-sm bg-surface border border-linen rounded-3xl p-6 shadow-xl flex flex-col gap-4">
        <div className="flex items-center gap-3 border-b border-linen pb-3">
          <div className="w-10 h-10 rounded-2xl bg-copper text-white flex items-center justify-center shadow-sm">
            <PawPrint size={20} weight="fill" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-copper tracking-wider">Official Pet Tag</span>
            <h1 className="font-display text-2xl leading-none text-ink">{pet.name}</h1>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-canvas border border-linen rounded-2xl p-3 text-sm">
          <div><span className="text-xs text-muted">Animal</span><p className="font-semibold text-ink">{pet.type}</p></div>
          <div><span className="text-xs text-muted">Breed</span><p className="font-semibold text-ink">{pet.breed || 'Mixed'}</p></div>
          <div><span className="text-xs text-muted">Age</span><p className="font-semibold text-ink">{pet.age} yrs</p></div>
          <div><span className="text-xs text-muted">Collar ID</span><p className="font-mono text-xs font-semibold text-copper">{pet.id_tag || 'N/A'}</p></div>
        </div>

        <div className="bg-night text-canvas rounded-2xl p-3.5 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-canvas/50">Owner</div>
            <div className="font-bold text-sm">{pet.owner_name}</div>
          </div>
          <a
            href={`tel:${pet.owner_phone}`}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-copper text-white rounded-xl text-xs font-bold shadow hover:bg-copper-dark transition"
          >
            <Phone size={14} weight="fill" /> Call Owner
          </a>
        </div>
      </div>
    </div>
  );
}