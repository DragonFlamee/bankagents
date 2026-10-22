import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  animate,
  AnimatePresence,
  motion,
  MotionConfig,
  useIsPresent,
} from "motion/react";

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
  stiffness: 430,
  damping: 23,
  mass: 0.65,
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
        {
          scale: button.matches(".nav-item, .recent-task")
            ? 0.985
            : button.getBoundingClientRect().width < 64
              ? 0.94
              : 0.975,
        },
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
        <DisclosureMotion />
        {children}
      </MotionConfig>
    </ReducedMotion.Provider>
  );
}

export function useReducedMotionPreference() {
  return useContext(ReducedMotion);
}

// Keep native details semantics. Hold it open during collapse; only geometry moves,
// so text never fades into the background. A second click reverses from this frame.
function DisclosureMotion() {
  const reduced = useContext(ReducedMotion);
  useEffect(() => {
    if (reduced) return;
    const active = new Map<
      HTMLDetailsElement,
      { animation: Animation; restore: () => void }
    >();
    function click(event: MouseEvent) {
      const summary =
        event.target instanceof Element
          ? event.target.closest("summary")
          : null;
      const detail = summary?.parentElement;
      if (
        !summary ||
        !(detail instanceof HTMLDetailsElement) ||
        !detail.closest("#root") ||
        event.defaultPrevented ||
        event.button !== 0
      )
        return;
      event.preventDefault();
      const currentHeight = detail.getBoundingClientRect().height;
      const opening = detail.dataset.disclosureTarget
        ? detail.dataset.disclosureTarget !== "open"
        : !detail.open;
      active.get(detail)?.restore();
      const previousHeight = detail.style.height,
        previousOverflow = detail.style.overflow;
      const collapsed = () => {
        detail.open = false;
        const h = detail.getBoundingClientRect().height;
        detail.open = true;
        return h;
      };
      detail.open = true;
      const target = opening
        ? detail.getBoundingClientRect().height
        : collapsed();
      detail.dataset.disclosureTarget = opening ? "open" : "closed";
      summary.setAttribute("aria-expanded", String(opening));
      const children = [...detail.children].filter(
        (e) => e !== summary,
      ) as HTMLElement[];
      const oldInert = children.map((e) => e.inert);
      if (!opening) {
        if (
          detail.contains(document.activeElement) &&
          document.activeElement !== summary
        )
          (summary as HTMLElement).focus({ preventScroll: true });
        children.forEach((e) => {
          e.inert = true;
        });
      }
      detail.style.height = `${currentHeight}px`;
      detail.style.overflow = "clip";
      const animation = detail.animate(
        [{ height: `${currentHeight}px` }, { height: `${target}px` }],
        { duration: 240, easing: "cubic-bezier(.22,.8,.25,1)" },
      );
      const restore = () => {
        animation.cancel();
        detail.style.height = previousHeight;
        detail.style.overflow = previousOverflow;
        children.forEach((e, i) => {
          e.inert = oldInert[i];
        });
        delete detail.dataset.disclosureTarget;
        summary.removeAttribute("aria-expanded");
        active.delete(detail);
      };
      active.set(detail, { animation, restore });
      animation.onfinish = () => {
        restore();
        detail.open = opening;
      };
    }
    document.addEventListener("click", click);
    return () => {
      document.removeEventListener("click", click);
      active.forEach((v, e) => {
        const open = e.dataset.disclosureTarget === "open";
        v.restore();
        e.open = open;
      });
    };
  }, [reduced]);
  return null;
}

function RevealBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useContext(ReducedMotion),
    present = useIsPresent();
  return (
    <motion.div
      className={className}
      inert={!present}
      aria-hidden={!present || undefined}
      initial={reduced ? false : { height: 0 }}
      animate={{ height: "auto" }}
      exit={{ height: 0 }}
      transition={{ duration: reduced ? 0 : 0.24, ease }}
      style={{ overflow: "clip" }}
    >
      {children}
    </motion.div>
  );
}
export function Reveal({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && <RevealBody className={className}>{children}</RevealBody>}
    </AnimatePresence>
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
      initial={reduced ? false : { y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 1,
        y: reduced ? 0 : -2,
        transition: { duration: reduced ? 0 : 0.08, ease },
      }}
      transition={{ duration: reduced ? 0 : 0.24, ease }}
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
      initial={reduced ? false : { y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduced ? 0 : 0.24,
        ease,
        delay: reduced ? 0 : Math.min(index * 0.025, 0.1),
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
          animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0.12, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <motion.span
        key={status}
        className="node-status-mark"
        initial={reduced ? false : { scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduced ? { duration: 0 } : settle}
      >
        {children}
      </motion.span>
    </div>
  );
}
