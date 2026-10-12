(() => {
  "use strict";

  /* ------------------------------------------------------------------
   * Configuration
   * ------------------------------------------------------------------ */
  const API_BASE_URL = "http://127.0.0.1:8000";
  const PREDICT_URL = `${API_BASE_URL}/predict`;
  const REQUEST_TIMEOUT_MS = 15000;

  /*
   * Mirrors the `StudentData` Pydantic model in main.py.
   * Keys are the exact JSON field names the backend expects.
   * Input `name` attributes in index.html use the same keys.
   */
  const FIELD_RULES = {
    Age:                     { kind: "int",    min: 10, max: 100 },
    Gender:                  { kind: "choice", options: ["Male", "Female"] },
    Country:                 { kind: "text" },
    Academic_Level:          { kind: "choice", options: ["Undergraduate", "Graduate", "High School"] },
    Most_Used_Platform:      {
      kind: "choice",
      options: ["Facebook", "LinkedIn", "Instagram", "Snapchat", "Twitter", "YouTube",
                "TikTok", "LINE", "KakaoTalk", "VKontakte", "WhatsApp", "WeChat"],
    },
    Purpose_Of_Use:          { kind: "choice", options: ["Networking", "Education", "Entertainment", "News"] },
    Avg_Daily_Usage_Hours:   { kind: "float",  min: 0, max: 24 },
    Daily_Unlocks:           { kind: "int",    min: 0 },
    Study_Hours:             { kind: "float",  min: 0, max: 24 },
    Physical_Activity_Hours: { kind: "float",  min: 0, max: 24 },
    Sleep_Hours_Per_Night:   { kind: "float",  min: 0, max: 24 },
    Stress_Level:            { kind: "choice", options: ["Medium", "Low", "Very High", "High"] },
  };

  const FIELD_KEYS = Object.keys(FIELD_RULES);

  /* ------------------------------------------------------------------
   * DOM references
   * ------------------------------------------------------------------ */
  const form = document.getElementById("prediction-form");
  const submitBtn = document.getElementById("submit-btn");
  const submitSpinner = submitBtn.querySelector(".spinner");
  const resetBtn = document.getElementById("reset-btn");
  const formAlert = document.getElementById("form-alert");
  const resultCard = document.getElementById("result-card");
  const resultErrorText = document.getElementById("result-error-text");
  const scoreValue = document.getElementById("score-value");

  const panels = {};
  resultCard.querySelectorAll("[data-panel]").forEach((el) => {
    panels[el.dataset.panel] = el;
  });

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ------------------------------------------------------------------
   * Errors
   * ------------------------------------------------------------------ */
  class ApiError extends Error {
    constructor(kind, message, extra = {}) {
      super(message);
      this.name = "ApiError";
      this.kind = kind; // "network" | "timeout" | "validation" | "server" | "http" | "unexpected" | "aborted"
      Object.assign(this, extra);
    }
  }

  /* ------------------------------------------------------------------
   * Client-side validation (mirrors Pydantic rules)
   * ------------------------------------------------------------------ */
  function validateValue(key, rawValue) {
    const rule = FIELD_RULES[key];
    const value = typeof rawValue === "string" ? rawValue.trim() : String(rawValue ?? "").trim();

    if (value === "") return "This field is required.";

    switch (rule.kind) {
      case "int": {
        if (!/^-?\d+$/.test(value)) return "Enter a whole number.";
        const n = Number(value);
        if (rule.min !== undefined && n < rule.min) return `Must be ${rule.min} or more.`;
        if (rule.max !== undefined && n > rule.max) return `Must be ${rule.max} or less.`;
        return "";
      }
      case "float": {
        const n = Number(value);
        if (!Number.isFinite(n)) return "Enter a valid number.";
        if (rule.min !== undefined && n < rule.min) return `Must be ${rule.min} or more.`;
        if (rule.max !== undefined && n > rule.max) return `Must be ${rule.max} or less.`;
        return "";
      }
      case "choice":
        return rule.options.includes(value) ? "" : "Select one of the listed options.";
      case "text":
      default:
        return "";
    }
  }

  function setFieldError(key, message) {
    const errorEl = document.getElementById(`error-${key}`);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = !message;
    }
    form.querySelectorAll(`[name="${key}"]`).forEach((control) => {
      control.setAttribute("aria-invalid", message ? "true" : "false");
    });
  }

  function clearAllFieldErrors() {
    FIELD_KEYS.forEach((key) => setFieldError(key, ""));
  }

  function validateForm() {
    let firstInvalidControl = null;
    let isValid = true;

    for (const key of FIELD_KEYS) {
      const message = validateValue(key, form.elements.namedItem(key).value);
      setFieldError(key, message);
      if (message) {
        isValid = false;
        if (!firstInvalidControl) {
          firstInvalidControl = form.querySelector(`[name="${key}"]`);
        }
      }
    }

    if (firstInvalidControl) firstInvalidControl.focus();
    return isValid;
  }

  /* Convert the form into the exact JSON shape StudentData expects. */
  function buildPayload() {
    const payload = {};
    for (const key of FIELD_KEYS) {
      const rule = FIELD_RULES[key];
      const raw = String(form.elements.namedItem(key).value).trim();
      if (rule.kind === "int") payload[key] = parseInt(raw, 10);
      else if (rule.kind === "float") payload[key] = parseFloat(raw);
      else payload[key] = raw;
    }
    return payload;
  }

  /* ------------------------------------------------------------------
   * Alerts and result panels
   * ------------------------------------------------------------------ */
  function showFormAlert(message, tone = "error") {
    formAlert.textContent = message;
    formAlert.dataset.tone = tone;
    formAlert.hidden = false;
  }

  function hideFormAlert() {
    formAlert.hidden = true;
    formAlert.textContent = "";
  }

  function setPanel(name) {
    resultCard.dataset.state = name;
    for (const [panelName, el] of Object.entries(panels)) {
      el.hidden = panelName !== name;
    }
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitSpinner.hidden = !isLoading;
    form.setAttribute("aria-busy", String(isLoading));
    if (isLoading) setPanel("loading");
  }

  function animateNumber(el, target, decimals = 2) {
    if (prefersReducedMotion.matches) {
      el.textContent = target.toFixed(decimals);
      return;
    }
    const duration = 900;
    const start = performance.now();
    const frame = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = (target * eased).toFixed(decimals);
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function showSuccess(score) {
    setPanel("success");
    animateNumber(scoreValue, score, 2);
    if (window.innerWidth <= 960) {
      resultCard.scrollIntoView({ behavior: prefersReducedMotion.matches ? "auto" : "smooth", block: "nearest" });
    }
  }

  function showFailure(err) {
    if (err.kind === "validation") {
      for (const [key, message] of Object.entries(err.fieldErrors)) {
        setFieldError(key, message);
      }
      showFormAlert(err.message, "warning");
    }
    resultErrorText.textContent = err.message;
    setPanel("error");
  }

  /* ------------------------------------------------------------------
   * API calls
   * ------------------------------------------------------------------ */
  function parseValidationError(data) {
    const fieldErrors = {};
    const general = [];

    if (typeof data?.detail === "string") {
      general.push(data.detail);
    } else if (Array.isArray(data?.detail)) {
      for (const item of data.detail) {
        const msg = typeof item?.msg === "string" ? item.msg : "Invalid value.";
        const loc = Array.isArray(item?.loc) ? item.loc : [];
        const field = loc.find((part) => Object.prototype.hasOwnProperty.call(FIELD_RULES, part));
        if (field) {
          fieldErrors[field] = msg.charAt(0).toUpperCase() + msg.slice(1);
        } else {
          general.push(msg);
        }
      }
    }

    let message;
    if (Object.keys(fieldErrors).length) {
      message = "The server rejected some values. Please review the highlighted fields.";
    } else if (general.length) {
      message = `The server rejected the request: ${general.join("; ")}`;
    } else {
      message = "The server rejected the request as invalid.";
    }
    return new ApiError("validation", message, { fieldErrors });
  }

  async function requestPrediction(payload, signal) {
    let response;
    try {
      response = await fetch(PREDICT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (err) {
      if (err && err.name === "AbortError") throw err; // handled by the caller
      throw new ApiError(
        "network",
        `Could not reach the API at ${API_BASE_URL}. Make sure the server is running with ` +
          "\"uvicorn main:app --port 8000 --reload\". If it is running, check the browser console " +
          "for a CORS or network message."
      );
    }

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null; // non-JSON body; handled below
    }

    if (!response.ok) {
      if (response.status === 422) throw parseValidationError(data);
      if (response.status === 404) {
        throw new ApiError("http", "The /predict endpoint was not found. Check that the backend is the correct app.");
      }
      if (response.status >= 500) {
        throw new ApiError(
          "server",
          "The server hit an internal error while predicting. Check the uvicorn terminal for the traceback."
        );
      }
      throw new ApiError("http", `The server responded with an unexpected status (${response.status}).`);
    }

    const score = data?.predicted_mental_health_score;
    if (typeof score !== "number" || !Number.isFinite(score)) {
      throw new ApiError(
        "unexpected",
        "The server responded, but the result was not in the expected format (predicted_mental_health_score)."
      );
    }
    return score;
  }

  let activeController = null;
  let requestSeq = 0;

  async function runPrediction(payload) {
    if (activeController) activeController.abort();

    const controller = new AbortController();
    activeController = controller;
    const seq = ++requestSeq;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    setLoading(true);
    try {
      const score = await requestPrediction(payload, controller.signal);
      if (seq !== requestSeq) return;
      showSuccess(score);
    } catch (err) {
      if (seq !== requestSeq) return; // superseded by a newer request or a reset
      showFailure(normalizeError(err, timedOut));
    } finally {
      clearTimeout(timer);
      if (seq === requestSeq) {
        activeController = null;
        setLoading(false);
      }
    }
  }

  function normalizeError(err, timedOut) {
    if (err instanceof ApiError) return err;
    if (err && err.name === "AbortError") {
      return timedOut
        ? new ApiError(
            "timeout",
            `No response after ${REQUEST_TIMEOUT_MS / 1000} seconds. The server may be busy or stopped.`
          )
        : new ApiError("aborted", "The request was cancelled.");
    }
    console.error(err);
    return new ApiError("unknown", "Something unexpected went wrong. See the browser console for details.");
  }

  /* ------------------------------------------------------------------
   * Event wiring
   * ------------------------------------------------------------------ */
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    hideFormAlert();

    if (!validateForm()) {
      showFormAlert("Please fix the highlighted fields before predicting.", "warning");
      return;
    }
    runPrediction(buildPayload());
  });

  // Clear a field's error as soon as the user changes it.
  const clearErrorOnChange = (event) => {
    const key = event.target.name;
    if (key && FIELD_RULES[key]) setFieldError(key, "");
  };
  form.addEventListener("input", clearErrorOnChange);
  form.addEventListener("change", clearErrorOnChange);

  resetBtn.addEventListener("click", () => {
    requestSeq++;
    if (activeController) activeController.abort();
    activeController = null;
    setLoading(false);

    form.reset();
    clearAllFieldErrors();
    hideFormAlert();
    setPanel("empty");
    form.elements.namedItem("Age").focus();
  });

  /* ------------------------------------------------------------------
   * Init
   * ------------------------------------------------------------------ */
  setPanel("empty");
})();