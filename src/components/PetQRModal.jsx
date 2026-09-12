import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { QrCode, DownloadSimple } from '@phosphor-icons/react';

export default function PetQRModal({ pet, open, onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (open && pet?.id && canvasRef.current) {
      const publicUrl = `${window.location.origin}/verify-pet/${pet.id}`;
      QRCode.toCanvas(canvasRef.current, publicUrl, {
        width: 220,
        margin: 2,
        color: {
          dark: '#161310',
          light: '#FFFDF8',
        },
      });
    }
  }, [open, pet]);

  const handleDownload = () => {
    if (!canvasRef.current || !pet) return;
    const link = document.createElement('a');
    link.download = `${pet.name}-PawFound-Tag.png`;
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  return (
    <Modal open={open} onClose={onClose} title={`${pet?.name}’s Digital QR Tag`} subtitle="Print or attach to pet's collar">
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="p-3 bg-surface border border-linen rounded-2xl shadow-sm">
          <canvas ref={canvasRef} className="rounded-xl" />
        </div>
        <div className="text-center text-xs text-muted max-w-xs">
          Anyone who finds {pet?.name} can scan this with any phone camera to view their details and contact you immediately.
        </div>
        <div className="flex gap-2 w-full mt-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Close</Button>
          <Button className="flex-1" onClick={handleDownload}>
            <DownloadSimple size={16} weight="bold" /> Download Tag
          </Button>
        </div>
      </div>
    </Modal>
  );
}