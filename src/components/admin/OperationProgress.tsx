"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type OperationProgressState = {
  label: string;
  detail?: string;
  value: number;
  status: "active" | "success" | "error";
};

export function OperationProgress({ progress }: { progress: OperationProgressState | null }) {
  if (!progress) return null;
  const value = Math.max(0, Math.min(100, Math.round(progress.value)));
  return (
    <div className={`operation-progress ${progress.status}`}>
      <div className="operation-progress-head">
        <strong>{progress.label}</strong>
        <span>{value}%</span>
      </div>
      <div
        className="operation-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={progress.label}
      >
        <span style={{ width: `${value}%` }} />
      </div>
      {progress.detail ? <div className="operation-progress-detail">{progress.detail}</div> : null}
    </div>
  );
}

export function useOperationProgress() {
  const [progress, setProgress] = useState<OperationProgressState | null>(null);
  const driftTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopDrift = useCallback(() => {
    if (driftTimer.current) {
      clearInterval(driftTimer.current);
      driftTimer.current = null;
    }
  }, []);

  const stopHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const showProgress = useCallback(
    (label: string, detail?: string, value = 8) => {
      stopDrift();
      stopHide();
      setProgress({ label, detail, value, status: "active" });
    },
    [stopDrift, stopHide]
  );

  const driftProgress = useCallback(
    ({
      label,
      detail,
      start,
      ceiling,
    }: {
      label: string;
      detail?: string;
      start: number;
      ceiling: number;
    }) => {
      stopDrift();
      stopHide();
      let current = Math.max(0, Math.min(start, ceiling));
      setProgress({ label, detail, value: current, status: "active" });
      driftTimer.current = setInterval(() => {
        current = Math.min(ceiling, current + Math.max(1, (ceiling - current) * 0.08));
        setProgress((existing) =>
          existing?.status === "active"
            ? { ...existing, label, detail, value: Math.round(current) }
            : existing
        );
        if (current >= ceiling) stopDrift();
      }, 700);
    },
    [stopDrift, stopHide]
  );

  const completeProgress = useCallback(
    (label: string, detail?: string) => {
      stopDrift();
      stopHide();
      setProgress({ label, detail, value: 100, status: "success" });
      hideTimer.current = setTimeout(() => setProgress(null), 4500);
    },
    [stopDrift, stopHide]
  );

  const failProgress = useCallback(
    (label: string, detail?: string) => {
      stopDrift();
      stopHide();
      setProgress((existing) => ({
        label,
        detail,
        value: existing?.value || 100,
        status: "error",
      }));
    },
    [stopDrift, stopHide]
  );

  const clearProgress = useCallback(() => {
    stopDrift();
    stopHide();
    setProgress(null);
  }, [stopDrift, stopHide]);

  useEffect(() => {
    return () => clearProgress();
  }, [clearProgress]);

  return { progress, showProgress, driftProgress, completeProgress, failProgress, clearProgress };
}
