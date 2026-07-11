(() => {
  "use strict";

  const form = document.getElementById("state-form");
  const stateSelect = document.getElementById("state");
  if (!(form instanceof HTMLFormElement) || !(stateSelect instanceof HTMLSelectElement)) return;

  const startedAt = performance.now();
  const counters = {
    pointerMoves: 0,
    pointerDowns: 0,
    touchStarts: 0,
    keyDowns: 0,
    stateChanges: 0,
    focusCount: 0,
    blurCount: 0,
    visibilityChanges: 0
  };

  let firstInteractionMs;
  let stateChangedMs;
  let visibleStartedAt = document.visibilityState === "visible" ? performance.now() : undefined;
  let visibleTotalMs = 0;
  let submitting = false;

  const elapsed = () => Math.max(0, Math.round(performance.now() - startedAt));
  const markFirstInteraction = () => {
    if (firstInteractionMs === undefined) firstInteractionMs = elapsed();
  };
  const increment = (name, limit = 10_000) => {
    counters[name] = Math.min(limit, counters[name] + 1);
  };

  document.addEventListener(
    "pointermove",
    () => {
      increment("pointerMoves", 250);
      markFirstInteraction();
    },
    { passive: true }
  );
  document.addEventListener(
    "pointerdown",
    () => {
      increment("pointerDowns");
      markFirstInteraction();
    },
    { passive: true }
  );
  document.addEventListener(
    "touchstart",
    () => {
      increment("touchStarts");
      markFirstInteraction();
    },
    { passive: true }
  );
  document.addEventListener("keydown", () => {
    increment("keyDowns");
    markFirstInteraction();
  });
  stateSelect.addEventListener("change", () => {
    increment("stateChanges");
    markFirstInteraction();
    stateChangedMs = elapsed();
  });
  window.addEventListener("focus", () => increment("focusCount"));
  window.addEventListener("blur", () => increment("blurCount"));
  document.addEventListener("visibilitychange", () => {
    increment("visibilityChanges");
    const now = performance.now();
    if (document.visibilityState === "visible") {
      visibleStartedAt = now;
    } else if (visibleStartedAt !== undefined) {
      visibleTotalMs += Math.max(0, now - visibleStartedAt);
      visibleStartedAt = undefined;
    }
  });

  function currentVisibleMs() {
    const inProgress = visibleStartedAt === undefined ? 0 : performance.now() - visibleStartedAt;
    return Math.max(0, Math.round(visibleTotalMs + inProgress));
  }

  async function fingerprint() {
    if (!globalThis.crypto?.subtle) return undefined;

    const source = JSON.stringify({
      userAgent: navigator.userAgent,
      languages: navigator.languages,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: [screen.width, screen.height, screen.colorDepth],
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      maxTouchPoints: navigator.maxTouchPoints
    });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    return Array.from(new Uint8Array(digest).slice(0, 16))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  const fingerprintPromise = fingerprint().catch(() => undefined);

  function baseTelemetry() {
    let timezone;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      timezone = undefined;
    }

    return {
      pageVisibleMs: currentVisibleMs(),
      ...(firstInteractionMs !== undefined ? { firstInteractionMs } : {}),
      ...(stateChangedMs !== undefined ? { stateChangedMs } : {}),
      submittedMs: elapsed(),
      ...counters,
      webdriver: navigator.webdriver === true,
      ...(timezone ? { timezone } : {}),
      languages: Array.isArray(navigator.languages) ? navigator.languages.slice(0, 16) : [],
      screen: {
        width: screen.width,
        height: screen.height,
        colorDepth: screen.colorDepth
      },
      hardwareConcurrency: navigator.hardwareConcurrency,
      ...(typeof navigator.deviceMemory === "number"
        ? { deviceMemory: navigator.deviceMemory }
        : {}),
      maxTouchPoints: navigator.maxTouchPoints
    };
  }

  function nativeFallback() {
    submitting = true;
    HTMLFormElement.prototype.submit.call(form);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;

    const button = form.querySelector("button[type=submit]");
    if (button instanceof HTMLButtonElement) button.disabled = true;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5_000);

    try {
      const fingerprintId = await Promise.race([
        fingerprintPromise,
        new Promise((resolve) => window.setTimeout(() => resolve(undefined), 150))
      ]);
      const telemetry = baseTelemetry();
      if (typeof fingerprintId === "string") telemetry.fingerprintId = fingerprintId;

      const tokenInput = form.elements.namedItem("pageToken");
      const pageToken = tokenInput instanceof HTMLInputElement ? tokenInput.value : "";
      const response = await fetch("/api/decision", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "text/plain"
        },
        body: JSON.stringify({
          state: stateSelect.value,
          pageToken,
          telemetry
        }),
        signal: controller.signal
      });

      if (!response.ok) throw new Error(`Decision endpoint returned ${response.status}`);
      const rawTarget = (await response.text()).trim();
      const target = new URL(rawTarget, window.location.href);
      if (target.protocol !== "http:" && target.protocol !== "https:") {
        throw new Error("Unsupported redirect protocol");
      }
      window.location.assign(target.href);
    } catch {
      nativeFallback();
    } finally {
      window.clearTimeout(timeout);
    }
  });
})();
