import { useEffect, useMemo, useRef, useState } from "react";

const now = () => Date.now();

function msToClock(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${m}:${pad(s)}`;
}

type Phase = "READY" | "IN_SET" | "IN_REST";

type SetLog = {
  setStart: number | null;
  setEnd: number | null;
  restStart: number | null;
  restEnd: number | null;
};

type Exercise = {
  id: string;
  name: string;
  sets: SetLog[];
};

type Workout = {
  startTime: number | null;
  exerciseStartTime: number | null;
  endTime: number | null;
  phase: Phase;
  currentExerciseIndex: number;
  exercises: Exercise[];
  active: { setStart: number | null; restStart: number | null };
};

function newWorkout(): Workout {
  return {
    startTime: null,
    exerciseStartTime: null,
    endTime: null,
    phase: "READY",
    currentExerciseIndex: 0,
    exercises: [{ id: "ex-1", name: "Exercise 1", sets: [] }],
    active: { setStart: null, restStart: null },
  };
}

function getPhaseLabel(phase: Phase) {
  if (phase === "IN_SET") return "Lifting";
  if (phase === "IN_REST") return "Resting";
  return "Ready";
}

function getPhaseColor(phase: Phase) {
  if (phase === "IN_SET") return "#22c55e";
  if (phase === "IN_REST") return "#ef4444";
  return "white";
}

function getGlowBoxShadow(phase: Phase, fallback = "0 0 0 rgba(0,0,0,0)") {
  if (phase === "IN_SET") return "0 0 40px rgba(34,197,94,0.25)";
  if (phase === "IN_REST") return "0 0 40px rgba(239,68,68,0.25)";
  return fallback;
}

function getSetCountForDisplay(workout: Workout) {
  // Starts at Set 0 and only increments when user taps End Set.
  return workout.exercises[workout.currentExerciseIndex].sets.length;
}

function calcTotals(workout: Workout) {
  let workMs = 0;
  let restMs = 0;

  for (const ex of workout.exercises) {
    for (const s of ex.sets) {
      if (s.setStart != null && s.setEnd != null) workMs += s.setEnd - s.setStart;
      if (s.restStart != null && s.restEnd != null) restMs += s.restEnd - s.restStart;
    }
  }

  const end = workout.endTime ?? now();
  const gymMs = workout.startTime ? end - workout.startTime : 0;
  return { workMs, restMs, gymMs };
}

function exerciseTotals(ex: Exercise) {
  let workMs = 0;
  let restMs = 0;
  for (const s of ex.sets) {
    if (s.setStart != null && s.setEnd != null) workMs += s.setEnd - s.setStart;
    if (s.restStart != null && s.restEnd != null) restMs += s.restEnd - s.restStart;
  }
  return { workMs, restMs };
}

function calcPercent(part: number, total: number) {
  if (!total || total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function PressableButton({
  style,
  onClick,
  children,
  disabled,
}: {
  style: any;
  onClick: (() => void) | undefined;
  children: any;
  disabled?: boolean;
}) {
  const [pressed, setPressed] = useState(false);

  const merged = {
    ...style,
    opacity: disabled ? 0.6 : 1,
    transform: pressed && !disabled ? "scale(0.98)" : "scale(1)",
    cursor: disabled ? "not-allowed" : "pointer",
  };

  return (
    <button
      disabled={disabled}
      style={merged}
      onClick={disabled ? undefined : onClick}
      onPointerDown={() => !disabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      {children}
    </button>
  );
}

// Lightweight sanity checks (run once).
(function runSanityChecks() {
  console.assert(msToClock(0) === "0:00", "msToClock(0) should be 0:00");
  console.assert(msToClock(59_000) === "0:59", "msToClock(59000) should be 0:59");
  console.assert(msToClock(60_000) === "1:00", "msToClock(60000) should be 1:00");
  console.assert(msToClock(3_661_000) === "61:01", "msToClock should handle > 60 minutes");

  const w = newWorkout();
  console.assert(w.startTime === null, "New workout should be not-started");
  console.assert(getSetCountForDisplay(w) === 0, "New workout starts at Set 0");

  w.exercises[0].sets.push({ setStart: 1, setEnd: 101, restStart: 101, restEnd: 201 });
  const totals = calcTotals(w);
  console.assert(totals.workMs === 100, "Totals should count lifting time");
  console.assert(totals.restMs === 100, "Totals should count resting time");

  console.assert(calcPercent(50, 100) === 50, "calcPercent basic");
  console.assert(calcPercent(0, 0) === 0, "calcPercent handles zero total");
})();

export default function App() {
  const [workout, setWorkout] = useState<Workout>(newWorkout());
  const [tick, setTick] = useState(0);

  // Screen wake lock (best-effort)
  const wakeLockRef = useRef<any>(null);

  async function requestWakeLock() {
    try {
      const wl: any = (navigator as any).wakeLock;
      if (!wl?.request) return;
      wakeLockRef.current = await wl.request("screen");
      wakeLockRef.current?.addEventListener?.("release", () => {
        wakeLockRef.current = null;
      });
    } catch {
      // ignore
    }
  }

  async function releaseWakeLock() {
    try {
      if (wakeLockRef.current?.release) await wakeLockRef.current.release();
    } catch {
      // ignore
    } finally {
      wakeLockRef.current = null;
    }
  }

  // Prevent iOS double-tap zoom + gesture zoom (best effort)
  useEffect(() => {
    let lastTouchEnd = 0;
    const onTouchEnd = (e: TouchEvent) => {
      const nowTs = Date.now();
      if (nowTs - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = nowTs;
    };
    const onGestureStart = (e: Event) => e.preventDefault();

    document.addEventListener("touchend", onTouchEnd, { passive: false });
    document.addEventListener("gesturestart", onGestureStart as any, { passive: false } as any);
    return () => {
      document.removeEventListener("touchend", onTouchEnd as any);
      document.removeEventListener("gesturestart", onGestureStart as any);
    };
  }, []);

  // Full-screen layout on phone sizes
  const [vw, setVw] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 999));
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isPhoneLayout = vw <= 430;

  const cardBase = useMemo(() => {
    if (!isPhoneLayout) return styles.card;
    return {
      ...styles.card,
      maxWidth: "100%",
      minHeight: "100vh",
      borderRadius: 0,
      paddingTop: "calc(18px + env(safe-area-inset-top))",
      paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
      paddingLeft: "calc(18px + env(safe-area-inset-left))",
      paddingRight: "calc(18px + env(safe-area-inset-right))",
    };
  }, [isPhoneLayout]);

  // Only tick while workout is running
  useEffect(() => {
    if (!workout.startTime || workout.endTime) return;
    const t = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [workout.startTime, workout.endTime]);

  const workoutElapsed = workout.startTime ? (workout.endTime ?? now()) - workout.startTime : 0;

  const exerciseElapsed = workout.exerciseStartTime
    ? (workout.endTime ?? now()) - workout.exerciseStartTime
    : 0;

  const phaseElapsed = useMemo(() => {
    if (workout.endTime) return 0;
    if (workout.phase === "IN_SET" && workout.active.setStart != null) return now() - workout.active.setStart;
    if (workout.phase === "IN_REST" && workout.active.restStart != null) return now() - workout.active.restStart;
    return 0;
  }, [workout, tick]);

  function startWorkout() {
    if (workout.startTime) return;
    requestWakeLock();
    setWorkout({
      ...workout,
      startTime: now(),
      exerciseStartTime: null,
      endTime: null,
      phase: "READY",
      active: { setStart: null, restStart: null },
    });
  }

  function startSet() {
    if (!workout.startTime || workout.endTime || workout.phase !== "READY") return;

    const shouldStartExerciseTimer = !workout.exerciseStartTime;
    const t = now();

    setWorkout({
      ...workout,
      phase: "IN_SET",
      exerciseStartTime: shouldStartExerciseTimer ? t : workout.exerciseStartTime,
      active: { setStart: t, restStart: null },
    });
  }

  function endSetStartRest() {
    if (!workout.startTime || workout.endTime || workout.phase !== "IN_SET") return;

    const ex = workout.exercises[workout.currentExerciseIndex];
    const sets = [...ex.sets];
    const t = now();

    sets.push({
      setStart: workout.active.setStart,
      setEnd: t,
      restStart: t,
      restEnd: null,
    });

    const exercises = [...workout.exercises];
    exercises[workout.currentExerciseIndex] = { ...ex, sets };

    setWorkout({
      ...workout,
      exercises,
      phase: "IN_REST",
      active: { setStart: null, restStart: t },
    });
  }

  function endRestStartSet() {
    if (!workout.startTime || workout.endTime || workout.phase !== "IN_REST") return;

    const ex = workout.exercises[workout.currentExerciseIndex];
    const sets = [...ex.sets];
    if (sets.length === 0) return;

    const t = now();
    const last = sets[sets.length - 1];
    sets[sets.length - 1] = { ...last, restEnd: t };

    const exercises = [...workout.exercises];
    exercises[workout.currentExerciseIndex] = { ...ex, sets };

    setWorkout({
      ...workout,
      exercises,
      phase: "IN_SET",
      active: { setStart: t, restStart: null },
    });
  }

  function nextExercise() {
    if (!workout.startTime || workout.endTime) return;

    let w: Workout = { ...workout };

    // Force-finish any active timing before moving on
    if (w.phase === "IN_SET") {
      const ex = w.exercises[w.currentExerciseIndex];
      const sets = [...ex.sets];
      const t = now();

      sets.push({
        setStart: w.active.setStart ?? t,
        setEnd: t,
        restStart: null,
        restEnd: null,
      });

      const exercises = [...w.exercises];
      exercises[w.currentExerciseIndex] = { ...ex, sets };
      w.exercises = exercises;
      w.active = { setStart: null, restStart: null };
      w.phase = "READY";
    } else if (w.phase === "IN_REST") {
      const ex = w.exercises[w.currentExerciseIndex];
      const sets = [...ex.sets];
      if (sets.length > 0) {
        const t = now();
        const last = sets[sets.length - 1];
        sets[sets.length - 1] = { ...last, restEnd: last.restEnd ?? t };
        const exercises = [...w.exercises];
        exercises[w.currentExerciseIndex] = { ...ex, sets };
        w.exercises = exercises;
      }
      w.active = { setStart: null, restStart: null };
      w.phase = "READY";
    }

    const exercises = [...w.exercises];
    exercises.push({
      id: `ex-${exercises.length + 1}`,
      name: `Exercise ${exercises.length + 1}`,
      sets: [],
    });

    setWorkout({
      ...w,
      exercises,
      currentExerciseIndex: exercises.length - 1,
      exerciseStartTime: null,
      phase: "READY",
      active: { setStart: null, restStart: null },
    });
  }

  function finishWorkout() {
    if (!workout.startTime || workout.endTime) return;

    let w: Workout = { ...workout };

    if (w.phase === "IN_SET") {
      const ex = w.exercises[w.currentExerciseIndex];
      const sets = [...ex.sets];
      const t = now();

      // End lifting AND auto-add rest of 0:00 for consistency
      sets.push({
        setStart: w.active.setStart ?? t,
        setEnd: t,
        restStart: t,
        restEnd: t,
      });

      const exercises = [...w.exercises];
      exercises[w.currentExerciseIndex] = { ...ex, sets };
      w.exercises = exercises;
    } else if (w.phase === "IN_REST") {
      const ex = w.exercises[w.currentExerciseIndex];
      const sets = [...ex.sets];
      if (sets.length > 0) {
        const last = sets[sets.length - 1];
        if (last.restStart != null && last.restEnd == null) {
          const t = now();
          sets[sets.length - 1] = { ...last, restEnd: t };
          const exercises = [...w.exercises];
          exercises[w.currentExerciseIndex] = { ...ex, sets };
          w.exercises = exercises;
        }
      }
    }

    w.active = { setStart: null, restStart: null };
    w.phase = "READY";
    w.endTime = now();

    setWorkout(w);
    releaseWakeLock();
  }

  function resetAll() {
    setWorkout(newWorkout());
    setTick(0);
    releaseWakeLock();
  }

  const primaryAction = (() => {
    if (!workout.startTime || workout.endTime) return null;
    if (workout.phase === "READY") return { label: "Start Set", action: startSet, type: "start" as const };
    if (workout.phase === "IN_SET")
      return { label: "End Set → Start Rest", action: endSetStartRest, type: "set" as const };
    if (workout.phase === "IN_REST")
      return { label: "End Rest → Start Set", action: endRestStartSet, type: "rest" as const };
    return null;
  })();

  // ---- Summary Screen ----
  if (workout.endTime) {
    const totals = calcTotals(workout);
    const activeMs = totals.workMs + totals.restMs;
    const liftPct = calcPercent(totals.workMs, activeMs);
    const restPctAdj = Math.max(0, Math.min(100, 100 - liftPct));

    return (
      <div style={styles.shell}>
        <div style={{ ...cardBase, boxShadow: styles.card.boxShadow }}>
          <h1 style={{ margin: 0 }}>Summary</h1>
          <div style={{ marginTop: 4, opacity: 0.75, fontSize: 13 }}>
            Total time in gym: <strong>{msToClock(totals.gymMs)}</strong>
          </div>

          <div style={styles.summaryGrid}>
            <div style={styles.summaryBox}>
              <div style={{ ...styles.summaryLabel, color: "#22c55e" }}>Total Lifting</div>
              <div style={{ ...styles.summaryValue, color: "#22c55e" }}>{msToClock(totals.workMs)}</div>
            </div>
            <div style={styles.summaryBox}>
              <div style={{ ...styles.summaryLabel, color: "#ef4444" }}>Total Resting</div>
              <div style={{ ...styles.summaryValue, color: "#ef4444" }}>{msToClock(totals.restMs)}</div>
            </div>
          </div>

          <div style={styles.percentRow}>
            <div style={styles.percentText}>
              <span style={{ color: "#22c55e", fontWeight: 900 }}>{liftPct}%</span>
              <span style={{ opacity: 0.65 }}> lifting</span>
              <span style={{ opacity: 0.45 }}> • </span>
              <span style={{ color: "#ef4444", fontWeight: 900 }}>{restPctAdj}%</span>
              <span style={{ opacity: 0.65 }}> resting</span>
            </div>
            <div style={styles.percentBar} aria-hidden>
              <div style={{ ...styles.percentLift, width: `${liftPct}%` }} />
              <div style={{ ...styles.percentRest, width: `${restPctAdj}%` }} />
            </div>
          </div>

          <hr style={{ opacity: 0.2 }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {workout.exercises.map((ex) => {
              const exT = exerciseTotals(ex);
              const exTotal = exT.workMs + exT.restMs;

              return (
                <div key={ex.id} style={styles.exerciseCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 800 }}>{ex.name}</div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                      <div style={{ opacity: 0.7, fontSize: 12 }}>{ex.sets.length} sets</div>
                      <div
                        style={{
                          opacity: 0.85,
                          fontSize: 12,
                          fontWeight: 800,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {msToClock(exTotal)}
                      </div>
                    </div>
                  </div>

                  <div style={styles.totalsGrid}>
                    <div />
                    <div style={styles.totalsLabelLift}>Lifting total</div>
                    <div style={styles.totalsLabelRest}>Resting total</div>

                    <div />
                    <div style={styles.totalsValueLift}>{msToClock(exT.workMs)}</div>
                    <div style={styles.totalsValueRest}>{msToClock(exT.restMs)}</div>
                  </div>

                  {ex.sets.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      {ex.sets.map((s, sIdx) => {
                        const liftMs =
                          s.setStart != null && s.setEnd != null ? s.setEnd - s.setStart : 0;
                        const restMs =
                          s.restStart != null && s.restEnd != null ? s.restEnd - s.restStart : 0;

                        return (
                          <div key={sIdx} style={styles.setRow}>
                            <div style={styles.setLabel}>Set {sIdx + 1}</div>
                            <div style={styles.setLift}>
                              <strong>{msToClock(liftMs)}</strong>
                            </div>
                            <div style={styles.setRest}>
                              <strong>{msToClock(restMs)}</strong>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ height: 12 }} />
          <PressableButton style={styles.startButton} onClick={resetAll}>
            New Workout
          </PressableButton>
        </div>
      </div>
    );
  }

  // ---- Main Workout Screen ----
  const phase = workout.phase;
  const label = getPhaseLabel(phase);
  const color = getPhaseColor(phase);
  const cardShadow = getGlowBoxShadow(phase, styles.card.boxShadow);
  const setCount = getSetCountForDisplay(workout);

  return (
    <div style={styles.shell}>
      <div style={{ ...cardBase, boxShadow: cardShadow }}>
        <div style={styles.topHeader}>
          <div style={styles.topStat}>
            <div style={styles.topLabel}>Exercise Time</div>
            <div style={styles.topValue}>{msToClock(exerciseElapsed)}</div>
          </div>

          <div style={{ ...styles.topStat, alignItems: "flex-end" }}>
            <div style={styles.topLabel}>Workout Time</div>
            <div style={styles.topValue}>{msToClock(workoutElapsed)}</div>
          </div>
        </div>

        <hr style={{ opacity: 0.2 }} />

        <div style={styles.exerciseLine}>{`Exercise ${workout.currentExerciseIndex + 1} — Set ${setCount}`}</div>
        <div style={{ ...styles.phaseLabel, color }}>{label}</div>

        <div style={styles.phaseTimerWrap}>
          <div style={styles.phaseTimerValue}>{phase === "READY" ? "0:00" : msToClock(phaseElapsed)}</div>
        </div>

        {primaryAction && (
          <PressableButton
            style={
              primaryAction.type === "rest"
                ? styles.restButton
                : primaryAction.type === "set"
                ? styles.setButton
                : styles.startButton
            }
            onClick={primaryAction.action}
          >
            {primaryAction.label}
          </PressableButton>
        )}

        <PressableButton style={styles.secondary} onClick={nextExercise} disabled={!workout.startTime}>
          Next Exercise
        </PressableButton>

        <PressableButton style={styles.secondary} onClick={workout.startTime ? finishWorkout : startWorkout}>
          {workout.startTime ? "Finish Workout" : "Start Workout"}
        </PressableButton>
      </div>
    </div>
  );
}

const styles: Record<string, any> = {
  shell: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "stretch",
    justifyContent: "stretch",
    background: "#0b0b0f",
    color: "white",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    padding: 0,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#141421",
    borderRadius: 20,
    padding: 22,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  },
  topHeader: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    alignItems: "start",
    gap: 10,
  },
  topStat: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  topLabel: {
    fontSize: 11,
    opacity: 0.6,
    fontWeight: 800,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  topValue: {
    fontSize: 32,
    fontWeight: 950,
    letterSpacing: -0.9,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  },
  exerciseLine: {
    fontSize: 12,
    opacity: 0.65,
    fontWeight: 800,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  phaseLabel: {
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textAlign: "center",
    marginTop: 2,
  },
  phaseTimerWrap: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  phaseTimerValue: {
    fontSize: 72,
    fontWeight: 950,
    letterSpacing: -1.4,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  },
  startButton: {
    padding: 18,
    borderRadius: 16,
    border: "none",
    fontWeight: 800,
    fontSize: 18,
    background: "#ffffff",
    color: "#0b0b0f",
    boxShadow: "0 8px 24px rgba(255,255,255,0.18)",
    transition: "transform 80ms ease, box-shadow 80ms ease",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
  setButton: {
    padding: 18,
    borderRadius: 16,
    border: "none",
    fontWeight: 800,
    fontSize: 18,
    background: "#22c55e",
    color: "white",
    boxShadow: "0 8px 24px rgba(34,197,94,0.4)",
    transition: "transform 80ms ease, box-shadow 80ms ease",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
  restButton: {
    padding: 18,
    borderRadius: 16,
    border: "none",
    fontWeight: 800,
    fontSize: 18,
    background: "#ef4444",
    color: "white",
    boxShadow: "0 8px 24px rgba(239,68,68,0.4)",
    transition: "transform 80ms ease, box-shadow 80ms ease",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
  secondary: {
    padding: 16,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "transparent",
    color: "white",
    fontWeight: 700,
    fontSize: 16,
    boxShadow: "0 0 0 rgba(0,0,0,0)",
    transition: "transform 80ms ease, box-shadow 80ms ease",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginTop: 6,
  },
  summaryBox: {
    borderRadius: 14,
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(255,255,255,0.06)",
    padding: 10,
  },
  summaryLabel: {
    opacity: 0.6,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 950,
    marginTop: 2,
    lineHeight: 1.05,
    fontVariantNumeric: "tabular-nums",
  },
  exerciseCard: {
    borderRadius: 14,
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(255,255,255,0.06)",
    padding: 10,
  },
  totalsGrid: {
    display: "grid",
    gridTemplateColumns: "54px 92px 92px",
    rowGap: 2,
    columnGap: 8,
    marginTop: 8,
    padding: "0 8px", // match setRow horizontal padding so columns line up perfectly
  },
  totalsLabelLift: {
    opacity: 0.6,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#22c55e",
    justifySelf: "end",
    textAlign: "right",
  },
  totalsLabelRest: {
    opacity: 0.6,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#ef4444",
    justifySelf: "end",
    textAlign: "right",
  },
  totalsValueLift: {
    fontSize: 15,
    fontWeight: 950,
    lineHeight: 1.05,
    fontVariantNumeric: "tabular-nums",
    color: "#22c55e",
    justifySelf: "end",
    textAlign: "right",
  },
  totalsValueRest: {
    fontSize: 15,
    fontWeight: 950,
    lineHeight: 1.05,
    fontVariantNumeric: "tabular-nums",
    color: "#ef4444",
    justifySelf: "end",
    textAlign: "right",
  },
  setRow: {
    display: "grid",
    gridTemplateColumns: "54px 92px 92px",
    alignItems: "baseline",
    columnGap: 8,
    padding: "5px 8px",
    borderRadius: 10,
    background: "rgba(0,0,0,0.16)",
    border: "1px solid rgba(255,255,255,0.05)",
  },
  setLabel: {
    fontWeight: 900,
    opacity: 0.9,
  },
  setLift: {
    color: "#22c55e",
    fontVariantNumeric: "tabular-nums",
    justifySelf: "end",
    textAlign: "right",
  },
  setRest: {
    color: "#ef4444",
    fontVariantNumeric: "tabular-nums",
    justifySelf: "end",
    textAlign: "right",
  },
  percentRow: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 2,
    marginBottom: 2,
  },
  percentText: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
  percentBar: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    display: "flex",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  percentLift: {
    background: "rgba(34,197,94,0.9)",
  },
  percentRest: {
    background: "rgba(239,68,68,0.9)",
  },
};
