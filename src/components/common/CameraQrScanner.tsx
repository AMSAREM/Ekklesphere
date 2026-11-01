// src/components/common/CameraQrScanner.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  Flashlight,
  RefreshCw,
  Scan,
  Upload,
  AlertTriangle,
  Volume2,
  VolumeX,
  CheckCircle2,
  Maximize2,
  Play,
  Square,
} from 'lucide-react';
import jsQR from 'jsqr';

export interface CameraQrScannerProps {
  onScan: (decodedText: string) => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  isActive?: boolean;
  onClose?: () => void;
  className?: string;
  reticleSize?: 'sm' | 'md' | 'lg';
  showControls?: boolean;
  instructionsText?: string;
}

export const CameraQrScanner: React.FC<CameraQrScannerProps> = ({
  onScan,
  soundEnabled = true,
  onToggleSound,
  isActive = true,
  onClose,
  className = '',
  reticleSize = 'md',
  showControls = true,
  instructionsText = 'Align member QR pass or service code inside frame',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'running' | 'paused' | 'denied' | 'error' | 'unsupported'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [scanCooldown, setScanCooldown] = useState(false);
  const lastDetectedTimeRef = useRef<number>(0);

  // Play pleasant check-in chime
  const playBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(987.77, ctx.currentTime); // B5 note
      osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.08); // E6 note
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40, 20, 40]);
      }
    } catch {
      // AudioContext blocked by policy
    }
  }, [soundEnabled]);

  // Stop active camera stream tracks
  const stopCameraStream = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore track cleanup error
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  // Request hardware camera access
  const startCameraStream = useCallback(async () => {
    stopCameraStream();
    setErrorMessage(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraState('unsupported');
      setErrorMessage('Camera API is not supported in this browser environment.');
      return;
    }

    setCameraState('starting');

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }

      // Check for torch capability
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities = (track.getCapabilities?.() || {}) as { torch?: boolean };
        setTorchAvailable(Boolean(capabilities.torch));
      }

      setCameraState('running');
    } catch (err: unknown) {
      const error = err as Error;
      console.warn('[CameraQrScanner] Camera stream initialization error:', error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setCameraState('denied');
        setErrorMessage('Camera access was denied. Please allow camera permissions in your browser or device settings.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setCameraState('unsupported');
        setErrorMessage('No camera hardware found on this device.');
      } else {
        setCameraState('error');
        setErrorMessage(error.message || 'Unable to access camera.');
      }
    }
  }, [facingMode, stopCameraStream]);

  // Flashlight / Torch toggle
  const toggleFlashlight = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextState = !torchOn;
      // standard advanced torch constraint
      await (track.applyConstraints as any)({
        advanced: [{ torch: nextState }],
      });
      setTorchOn(nextState);
    } catch (err) {
      console.warn('[CameraQrScanner] Failed to toggle flashlight:', err);
      setTorchOn(false);
    }
  };

  // Flip Camera Lens (environment -> user -> environment)
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Process video frames for QR codes
  useEffect(() => {
    if (cameraState !== 'running' || !isActive) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    let isScanningFrame = false;

    const scanFrame = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      const now = Date.now();
      // Rate limit frame processing to avoid CPU spikes (~15 scans per second)
      if (now - lastDetectedTimeRef.current < 80) {
        animationFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      if (!isScanningFrame) {
        isScanningFrame = true;
        try {
          let detectedValue: string | null = null;

          // 1. Try native hardware-accelerated BarcodeDetector if available
          if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
            try {
              const barcodeDetector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
              const barcodes = await barcodeDetector.detect(video);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                detectedValue = barcodes[0].rawValue;
              }
            } catch {
              // Fallback to jsQR below
            }
          }

          // 2. Fallback to jsQR with canvas
          if (!detectedValue) {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              const width = Math.min(video.videoWidth || 640, 640);
              const height = Math.min(video.videoHeight || 480, 480);
              canvas.width = width;
              canvas.height = height;

              ctx.drawImage(video, 0, 0, width, height);
              const imageData = ctx.getImageData(0, 0, width, height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
              });

              if (code && code.data) {
                detectedValue = code.data;
              }
            }
          }

          if (detectedValue && detectedValue.trim()) {
            const trimmed = detectedValue.trim();
            // Cooldown logic: do not fire continuously on identical code within 2 seconds
            if (trimmed !== lastScannedCode || now - lastDetectedTimeRef.current > 2000) {
              lastDetectedTimeRef.current = now;
              setLastScannedCode(trimmed);
              setScanCooldown(true);
              playBeep();
              onScan(trimmed);

              setTimeout(() => {
                setScanCooldown(false);
              }, 1600);
            }
          }
        } catch (err) {
          // ignore scan frame glitch
        } finally {
          isScanningFrame = false;
        }
      }

      animationFrameRef.current = requestAnimationFrame(scanFrame);
    };

    animationFrameRef.current = requestAnimationFrame(scanFrame);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [cameraState, isActive, lastScannedCode, onScan, playBeep]);

  // Handle image upload fallback
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current || document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          playBeep();
          setLastScannedCode(code.data);
          onScan(code.data);
        } else {
          setErrorMessage('Could not find a valid QR code in the uploaded image.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Lifecycle: activate camera on mount if requested
  useEffect(() => {
    if (isActive) {
      startCameraStream();
    } else {
      stopCameraStream();
    }

    return () => {
      stopCameraStream();
    };
  }, [isActive, facingMode, startCameraStream, stopCameraStream]);

  const reticleDimensions =
    reticleSize === 'sm'
      ? 'w-40 h-40 sm:w-44 sm:h-44'
      : reticleSize === 'lg'
      ? 'w-60 h-60 sm:w-72 sm:h-72'
      : 'w-48 h-48 sm:w-56 sm:h-56';

  return (
    <div className={`relative rounded-3xl overflow-hidden bg-black text-white shadow-2xl border border-white/15 select-none ${className}`}>
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Hidden file input for QR image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Live Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          cameraState === 'running' ? 'opacity-100' : 'opacity-0 absolute inset-0'
        }`}
      />

      {/* Camera Off / Fallback Backdrop */}
      {cameraState !== 'running' && (
        <div className="absolute inset-0 bg-gradient-to-br from-[#121124] via-[#1A1833] to-[#0A0914] flex flex-col items-center justify-center p-6 text-center">
          {cameraState === 'starting' ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#6D5CF2]/20 text-[#8C7DFF] flex items-center justify-center animate-spin">
                <RefreshCw className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-white">Starting Camera Hardware...</p>
              <p className="text-[11px] text-slate-400">Requesting sensor permission</p>
            </div>
          ) : cameraState === 'denied' || cameraState === 'error' || cameraState === 'unsupported' ? (
            <div className="flex flex-col items-center gap-3 max-w-xs">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <CameraOff className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-rose-300">Camera Unavailable</h4>
                <p className="text-[11px] text-slate-400 mt-1">{errorMessage || 'Unable to access camera.'}</p>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={startCameraStream}
                  className="px-3.5 py-1.5 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Camera</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Image</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/10 text-white/70 flex items-center justify-center">
                <Camera className="w-6 h-6" />
              </div>
              <button
                type="button"
                onClick={startCameraStream}
                className="px-4 py-2 rounded-xl bg-[#6D5CF2] hover:bg-[#5b4be0] text-white text-xs font-bold shadow-lg transition-all flex items-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Activate Camera Scanner</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* TOP CONTROLS HUD OVERLAY */}
      {showControls && (
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-auto">
          {/* Status Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-md border border-white/15 text-[10px] font-mono">
            {cameraState === 'running' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                <span className="text-emerald-400 font-bold">
                  LIVE · {facingMode === 'environment' ? 'REAR' : 'FRONT'}
                </span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                <span className="text-amber-400">CAMERA STANDBY</span>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5">
            {/* Flashlight button */}
            <button
              type="button"
              onClick={toggleFlashlight}
              disabled={cameraState !== 'running' || !torchAvailable}
              className={`p-2 rounded-full backdrop-blur-md border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                torchOn
                  ? 'bg-amber-400 text-black border-amber-300 shadow-lg shadow-amber-400/50'
                  : 'bg-black/60 text-white/80 border-white/10 hover:text-white hover:bg-black/80'
              }`}
              title={
                !torchAvailable
                  ? 'Flashlight not supported on this lens'
                  : torchOn
                  ? 'Turn Flashlight Off'
                  : 'Turn Flashlight On'
              }
            >
              <Flashlight className="w-4 h-4" />
            </button>

            {/* Lens Flip button */}
            <button
              type="button"
              onClick={toggleFacingMode}
              disabled={cameraState !== 'running'}
              className="p-2 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/80 backdrop-blur-md border border-white/10 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Flip Camera Lens (Front / Rear)"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Upload QR image button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/80 backdrop-blur-md border border-white/10 transition-all cursor-pointer"
              title="Upload QR Code Photo/Screenshot"
            >
              <Upload className="w-4 h-4" />
            </button>

            {/* Sound toggle button */}
            {onToggleSound && (
              <button
                type="button"
                onClick={onToggleSound}
                className="p-2 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/80 backdrop-blur-md border border-white/10 transition-all cursor-pointer"
                title={soundEnabled ? 'Mute Beep Sound' : 'Enable Beep Sound'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
              </button>
            )}
          </div>
        </div>
      )}

      {/* RETICLE TARGET VIEWFINDER BOX (Centered) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className={`relative ${reticleDimensions} flex items-center justify-center`}>
          {/* Four Corner Reticles */}
          <div
            className={`absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 rounded-tl-2xl transition-colors duration-200 ${
              scanCooldown ? 'border-emerald-400 shadow-[0_0_15px_#10B981]' : 'border-[#6D5CF2]'
            }`}
          />
          <div
            className={`absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 rounded-tr-2xl transition-colors duration-200 ${
              scanCooldown ? 'border-emerald-400 shadow-[0_0_15px_#10B981]' : 'border-[#6D5CF2]'
            }`}
          />
          <div
            className={`absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 rounded-bl-2xl transition-colors duration-200 ${
              scanCooldown ? 'border-emerald-400 shadow-[0_0_15px_#10B981]' : 'border-[#6D5CF2]'
            }`}
          />
          <div
            className={`absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 rounded-br-2xl transition-colors duration-200 ${
              scanCooldown ? 'border-emerald-400 shadow-[0_0_15px_#10B981]' : 'border-[#6D5CF2]'
            }`}
          />

          {/* Animated Laser Scanning Line */}
          {cameraState === 'running' && !scanCooldown && (
            <div
              className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-[#59C3C3] to-transparent shadow-[0_0_12px_#59C3C3] animate-pulse"
              style={{
                animation: 'scanSweep 2.2s ease-in-out infinite alternate',
              }}
            />
          )}

          {/* Success Check Flash inside reticle */}
          {scanCooldown && (
            <div className="w-16 h-16 rounded-full bg-emerald-500/30 text-emerald-300 flex items-center justify-center border-2 border-emerald-400 backdrop-blur-md animate-in zoom-in-75 duration-150">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>
          )}

          {/* Scanning Guidance Badge */}
          <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <span className="px-3 py-1 rounded-full bg-black/75 backdrop-blur-md text-[11px] font-bold text-white/90 border border-white/10 flex items-center gap-1.5 shadow-lg">
              <Scan className="w-3 h-3 text-[#6D5CF2]" />
              <span>{instructionsText}</span>
            </span>
          </div>
        </div>
      </div>

      {/* BOTTOM FOOTER HUD OVERLAY */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-none">
        <span className="text-[10px] text-slate-400 font-mono bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-md">
          Ekklesphere Scanner v1.0
        </span>
        {lastScannedCode && (
          <span className="text-[10px] text-emerald-400 font-mono bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-md truncate max-w-[180px]">
            Last: {lastScannedCode}
          </span>
        )}
      </div>
    </div>
  );
};
