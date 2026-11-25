import { useEffect, useRef, useState } from 'react';

function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  });
}

export function CameraCaptureModal({
  open,
  title = 'Capture payment proof',
  onClose,
  onCapture,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [facingMode, setFacingMode] = useState('environment');

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    setError('');
    setStarting(true);

    async function start() {
      stopStream(streamRef.current);
      streamRef.current = null;
      if (!navigator?.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          setStarting(false);
          setError('Camera is not supported in this browser. Use Upload screenshot instead.');
        }
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStarting(false);
      } catch (err) {
        if (cancelled) return;
        setStarting(false);
        const name = String(err?.name || '');
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setError('Camera permission was blocked. Allow camera access, or use Upload screenshot.');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setError('No camera was found on this device. Use Upload screenshot instead.');
        } else {
          setError('Could not open the camera. Try again or use Upload screenshot.');
        }
      }
    }

    start();

    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', onKey);

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
      stopStream(streamRef.current);
      streamRef.current = null;
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onClose is event-only; restart only on open/facingMode
  }, [open, facingMode]);

  function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError('Camera is still starting. Wait a moment, then try again.');
      return;
    }
    const canvas = document.createElement('canvas');
    const maxW = 1280;
    const scale = Math.min(1, maxW / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Could not capture a frame from the camera.');
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    stopStream(streamRef.current);
    streamRef.current = null;
    onCapture?.(dataUrl);
    onClose?.();
  }

  if (!open) return null;

  return (
    <div
      className="modal-overlay modal-overlay--elevated"
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-sale-camera-title"
      onClick={onClose}
    >
      <div className="modal-content log-sale-camera-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="log-sale-camera-title">{title}</h3>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Point the camera at the GCash success / receipt screen, then capture.
        </p>

        <div className="log-sale-camera-frame">
          {error ? (
            <div className="log-sale-camera-error" role="alert">{error}</div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="log-sale-camera-video"
                playsInline
                muted
                autoPlay
              />
              {starting ? <div className="log-sale-camera-loading">Starting camera…</div> : null}
            </>
          )}
        </div>

        <div className="modal-actions log-sale-camera-actions">
          {!error ? (
            <>
              <button
                className="button ghost"
                type="button"
                onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                disabled={starting}
              >
                Switch camera
              </button>
              <button
                className="button"
                type="button"
                onClick={takePhoto}
                disabled={starting}
              >
                Capture photo
              </button>
            </>
          ) : null}
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
