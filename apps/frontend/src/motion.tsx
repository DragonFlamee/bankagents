import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { animate, motion, MotionConfig, useIsPresent } from "motion/react";

// This installed Motion version snapshots its hook preference at mount. Subscribe
// here so an OS preference changed in an open banking session takes effect too.
const preference = matchMedia("(prefers-reduced-motion: reduce)");
const subscribe = (notify: () => void) => {
  preference.addEventListener("change", notify);
  return () => preference.removeEventListener("change", notify);
};
const ReducedMotion = createContext(false);

const ease = [0.22, 0.8, 0.25, 1] as const;
const settle = {
  type: "spring",
  stiffness: 460,
  damping: 20,
  mass: 0.6,
} as const;

// Delegation includes native buttons and dialog controls without replacing their
// click/submit handlers. A visual press never triggers or delays a business action.
function SpringPress() {
  const reduced = useContext(ReducedMotion);
  useEffect(() => {
    if (reduced) return;
    type Press = {
      original: string;
      animation?: ReturnType<typeof animate>;
    };
    const entries = new Map<HTMLButtonElement, Press>();
    let held: HTMLButtonElement | null = null;
    function restore(button: HTMLButtonElement, entry: Press) {
      entry.animation?.stop();
      button.style.transform = entry.original;
      entries.delete(button);
    }
    function release() {
      const button = held;
      held = null;
      if (!button) return;
      const entry = entries.get(button);
      if (!entry) return;
      entry.animation?.stop();
      entry.animation = animate(
        button,
        { scale: 1 },
        {
          ...settle,
          onComplete: () => {
            if (held !== button && entries.get(button) === entry)
              restore(button, entry);
          },
        },
      );
    }
    function press(target: EventTarget | null) {
      const button =
        target instanceof Element
          ? target.closest<HTMLButtonElement>("button")
          : null;
      if (
        !button ||
        !button.closest("#root") ||
        button.disabled ||
        button.getAttribute("aria-disabled") === "true" ||
        button.classList.contains("nav-backdrop") ||
        button.closest("[inert]")
      )
        return;
      if (held === button) return;
      release();
      held = button;
      const entry = entries.get(button) || { original: button.style.transform };
      entry.animation?.stop();
      entries.set(button, entry);
      entry.animation = animate(
        button,
        { scale: button.getBoundingClientRect().width < 64 ? 0.92 : 0.97 },
        { duration: 0.08, ease },
      );
    }
    const down = (e: PointerEvent) => {
      if (e.button === 0) press(e.target);
    };
    const keydown = (e: KeyboardEvent) => {
      if (
        !e.repeat &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key === " " || e.key === "Enter")
      )
        press(e.target);
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") release();
    };
    const focusout = (e: FocusEvent) => {
      if (e.target === held) release();
    };
    const reset = () => {
      held = null;
      entries.forEach((entry, button) => restore(button, entry));
    };
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("keyup", keyup, true);
    document.addEventListener("focusout", focusout);
    window.addEventListener("blur", reset);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("keyup", keyup, true);
      document.removeEventListener("focusout", focusout);
      window.removeEventListener("blur", reset);
      reset();
    };
  }, [reduced]);
  return null;
}

export function MotionSystem({ children }: { children: ReactNode }) {
  const reduced = useSyncExternalStore(
    subscribe,
    () => preference.matches,
    () => true,
  );
  return (
    <ReducedMotion.Provider value={reduced}>
      <MotionConfig reducedMotion={reduced ? "always" : "never"}>
        <SpringPress />
        {children}
      </MotionConfig>
    </ReducedMotion.Provider>
  );
}

export function PageSurface({
  children,
  className,
  view,
}: {
  children: ReactNode;
  className: string;
  view: string;
}) {
  const reduced = useContext(ReducedMotion),
    present = useIsPresent();
  return (
    <motion.div
      className={className}
      data-page={view}
      inert={!present}
      aria-hidden={!present || undefined}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: reduced ? 0 : -4,
        transition: { duration: reduced ? 0 : 0.1, ease },
      }}
      transition={{ duration: reduced ? 0 : 0.24, ease }}
    >
      {children}
    </motion.div>
  );
}

export function TraceBody({ children }: { children: ReactNode }) {
  const reduced = useContext(ReducedMotion),
    present = useIsPresent();
  return (
    <motion.div
      className="trace-reveal"
      inert={!present}
      initial={{ height: reduced ? "auto" : 0, opacity: reduced ? 1 : 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.22, ease }}
    >
      {children}
    </motion.div>
  );
}

export function TimelineEntry({
  children,
  className,
  index = 0,
}: {
  children: ReactNode;
  className: string;
  index?: number;
}) {
  const reduced = useContext(ReducedMotion);
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 28,
        delay: reduced ? 0 : Math.min(index * 0.035, 0.14),
        ...(reduced ? { duration: 0 } : {}),
      }}
    >
      {children}
    </motion.div>
  );
}

export function TimelineRail({ complete }: { complete: boolean }) {
  const reduced = useContext(ReducedMotion);
  return (
    <span className="timeline-rail" aria-hidden="true">
      <motion.span
        className="timeline-rail-fill"
        initial={false}
        animate={{ scaleY: complete ? 1 : 0 }}
        transition={{ duration: reduced ? 0 : 0.35, ease }}
      />
    </span>
  );
}

export function TimelineMarker({
  children,
  status,
  paused,
}: {
  children: ReactNode;
  status: string;
  paused: boolean;
}) {
  const reduced = useContext(ReducedMotion);
  return (
    <div className={`node-number ${status === "succeeded" ? "complete" : ""}`}>
      {status === "running" && !paused && !reduced && (
        <motion.span
          className="node-running-ring"
          aria-hidden="true"
          animate={{ scale: [1, 1.3, 1], opacity: [0.55, 0, 0.55] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <motion.span
        key={status}
        className="node-status-mark"
        initial={reduced ? false : { opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduced ? { duration: 0 } : settle}
      >
        {children}
      </motion.span>
    </div>
  );
}
