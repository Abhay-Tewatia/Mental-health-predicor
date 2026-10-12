# Mental Health Score Predictor

A full-stack machine learning demo that estimates a student's mental health score from digital-habit and lifestyle data. A **FastAPI** backend serves a pre-trained scikit-learn model, and a **vanilla HTML, CSS, and JavaScript** frontend collects the inputs, validates them, and displays the prediction.

The frontend has no frameworks, no build step, and no package manager. The backend is a single `main.py` file that loads a pickled model.

---

## Table of contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Tech stack](#tech-stack)
4. [Project structure](#project-structure)
5. [Prerequisites](#prerequisites)
6. [Setup and running](#setup-and-running)
7. [API reference](#api-reference)
8. [Input field reference](#input-field-reference)
9. [Frontend behavior](#frontend-behavior)
10. [CORS](#cors)
11. [Error handling](#error-handling)
12. [Accessibility and responsive design](#accessibility-and-responsive-design)
13. [Troubleshooting](#troubleshooting)
14. [Known limitations](#known-limitations)
15. [Possible improvements](#possible-improvements)
16. [License](#license)

---

## Features

- **Twelve-field student profile form**, covering demographics, digital habits, and lifestyle.
- **Client-side validation** that mirrors the backend's Pydantic rules, so invalid data is caught before any request is sent.
- **Server-side validation mapping.** If the backend rejects a value (HTTP 422), the error is shown next to the matching field.
- **Prediction via the Fetch API** with a JSON body, a 15-second timeout, and cancellation of superseded requests.
- **Clear error states** for network failures, validation errors, server errors, timeouts, and malformed responses.
- **Loading and empty states**, plus an animated result card that counts up to the predicted score.
- **Responsive layout** that works on desktop and phones, with no horizontal scrolling.
- **Accessibility support:** labels, `aria-invalid`, `aria-describedby`, a live region for results, keyboard-operable controls, and respect for `prefers-reduced-motion`.

---

## Architecture

```
┌──────────────────────┐     POST /predict (JSON)     ┌──────────────────────────┐
│  Browser             │ ───────────────────────────▶ │  FastAPI (uvicorn)       │
│  index.html          │                              │  main.py                 │
│  style.css           │ ◀─────────────────────────── │  - Pydantic validation   │
│  script.js           │   { predicted_mental_health_ │  - pandas DataFrame      │
└──────────────────────┘        score: float }        │  - joblib model.predict  │
                                                      └──────────────────────────┘
                                                                  │
                                                      Mental_Health_Model.pkl
```

1. The user fills in the form in the browser.
2. `script.js` validates each field against the same rules the backend uses.
3. On success, the form is converted into a JSON object whose keys match the backend's `StudentData` model.
4. The browser sends a `POST` request to `http://127.0.0.1:8000/predict`.
5. The backend validates the payload, builds a one-row pandas DataFrame, runs `model.predict`, and returns the rounded score.
6. The frontend displays the score in the result card.

---

## Tech stack

| Layer    | Technology                                                    |
| -------- | ------------------------------------------------------------- |
| Model    | scikit-learn pipeline, serialized with `joblib` (`.pkl`)      |
| Backend  | Python, FastAPI, Pydantic v2, pandas, uvicorn                 |
| Frontend | HTML5, CSS3 (custom properties, grid, flexbox), vanilla JavaScript (ES2020+) |
| Fonts    | Inter via Google Fonts (falls back to system fonts)           |

---

## Project structure

```
project/
├── main.py                     # FastAPI app: model loading, schema, /predict endpoint
├── Mental_Health_Model.pkl     # Pre-trained model (loaded with joblib)
├── requirements.txt            # Backend dependencies
└── frontend/                   # Or wherever you keep the static files
    ├── index.html              # Page structure, form fields, result card
    ├── style.css               # Theme tokens, layout, components, animations
    ├── script.js               # Validation, payload building, Fetch, UI state
    └── README.md               # This file
```

The three frontend files are independent of the backend. You can host them on any static server.

---

## Prerequisites

- **Python 3.9 or newer** for the backend.
- **pip** to install the Python packages.
- **A modern browser** (Chrome, Edge, Firefox, or Safari, current versions).
- Optional: any static file server. Python's built-in `http.server` is enough.

---

## Setup and running

### 1. Backend

Create and activate a virtual environment, then install the dependencies:

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Place `Mental_Health_Model.pkl` in the same folder as `main.py`. `main.py` loads it from that relative path, so run the server from that folder.

Start the API:

```bash
uvicorn main:app --port 8000 --reload
```

Check that it works. Open `http://127.0.0.1:8000/` in a browser. You should see:

```json
"Hello! Welcome to the Mental Health Prediction API."
```

Interactive API docs are available at `http://127.0.0.1:8000/docs`. FastAPI generates these automatically.

### 2. Frontend

Serve the frontend folder over HTTP from a second terminal:

```bash
cd frontend
python -m http.server 5500
```

Then open **http://localhost:5500** in your browser.

> **Why not double-click `index.html`?** Opening the file directly gives the page a `file://` origin, which some browsers treat differently for `fetch`. Serving it over HTTP avoids that and matches how the page will run in production.

### 3. Use the app

1. Fill in every field. Required fields are marked, and invalid values are flagged as you go.
2. Click **Predict score**.
3. The result card shows the predicted score rounded to two decimals.
4. Click **Reset** to clear the form and start over.

---

## API reference

### `GET /`

Health check. Returns a plain JSON string.

```json
"Hello! Welcome to the Mental Health Prediction API."
```

### `POST /predict`

**Request headers**

```
Content-Type: application/json
```

**Request body:** a JSON object with the twelve fields listed in the [Input field reference](#input-field-reference).

```json
{
  "Age": 20,
  "Gender": "Female",
  "Country": "India",
  "Academic_Level": "Undergraduate",
  "Most_Used_Platform": "Instagram",
  "Purpose_Of_Use": "Education",
  "Avg_Daily_Usage_Hours": 3.5,
  "Daily_Unlocks": 60,
  "Study_Hours": 4,
  "Physical_Activity_Hours": 1,
  "Sleep_Hours_Per_Night": 7,
  "Stress_Level": "Very High"
}
```

**Success response (HTTP 200):**

```json
{
  "predicted_mental_health_score": 7.06
}
```

The value is `round(float(prediction), 2)`.

**Validation error response (HTTP 422):** returned by FastAPI and Pydantic when a field is missing, has the wrong type, or breaks a constraint. The `detail` array identifies the field by its `loc`.

```json
{
  "detail": [
    {
      "type": "greater_than_equal",
      "loc": ["body", "Age"],
      "msg": "Input should be greater than or equal to 10",
      "input": 5
    }
  ]
}
```

### Server-side processing

The endpoint does the following:

1. Validates the body against `StudentData`.
2. Sets `country_group` to the country if it is in `top_countries`, and to `"other"` otherwise.
3. Builds a one-row `pandas.DataFrame` with all twelve fields plus `Country_Grouped`.
4. Calls `model.predict(input_data)[0]`.
5. Returns the rounded value.

---

## Input field reference

These rules come from the `StudentData` Pydantic model. The frontend enforces the same rules.

| Field (JSON key)            | Type    | Constraint                          | Allowed values / notes                                                                                   | Form control        |
| --------------------------- | ------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------- |
| `Age`                       | integer | 10 ≤ value ≤ 100                    | Whole number                                                                                             | Number input        |
| `Gender`                    | literal | Exact match                         | `Male`, `Female`                                                                                         | Radio buttons       |
| `Country`                   | string  | Any string                          | Free text. The form suggests common countries, but any value is accepted.                                | Text input + datalist |
| `Academic_Level`            | literal | Exact match                         | `High School`, `Undergraduate`, `Graduate`                                                               | Select              |
| `Most_Used_Platform`        | literal | Exact match                         | `Facebook`, `LinkedIn`, `Instagram`, `Snapchat`, `Twitter`, `YouTube`, `TikTok`, `LINE`, `KakaoTalk`, `VKontakte`, `WhatsApp`, `WeChat` | Select |
| `Purpose_Of_Use`            | literal | Exact match                         | `Networking`, `Education`, `Entertainment`, `News`                                                       | Select              |
| `Avg_Daily_Usage_Hours`     | float   | 0 ≤ value ≤ 24                      | Hours per day                                                                                            | Number input (step 0.1) |
| `Daily_Unlocks`             | integer | value ≥ 0                           | Phone unlocks per day, whole number                                                                      | Number input        |
| `Study_Hours`               | float   | 0 ≤ value ≤ 24                      | Hours per day                                                                                            | Number input (step 0.1) |
| `Physical_Activity_Hours`   | float   | 0 ≤ value ≤ 24                      | Hours per day                                                                                            | Number input (step 0.1) |
| `Sleep_Hours_Per_Night`     | float   | 0 ≤ value ≤ 24                      | Hours per night                                                                                          | Number input (step 0.1) |
| `Stress_Level`              | literal | Exact match                         | `Low`, `Medium`, `High`, `Very High`                                                                     | Select              |

The literal values are case-sensitive and must match exactly. The frontend sends them unchanged.

---

## Frontend behavior

### Validation

`script.js` checks each field on submit, using rules that mirror the backend:

- **Required:** empty fields are rejected.
- **Integers:** must match `^-?\d+$`, then the range is checked.
- **Floats:** must be a finite number, then the range is checked.
- **Choices:** must be one of the listed options.

Errors appear under the field and the control gets `aria-invalid="true"`. The first invalid field receives focus. An error clears as soon as the user changes that field.

### Payload building

Integer fields are parsed with `parseInt(value, 10)`, float fields with `parseFloat`, and text and choice fields are trimmed strings. The result is a plain object whose keys match the backend's field names.

### Request lifecycle

- A new submit cancels any request still in flight, using `AbortController`.
- A 15-second timeout aborts requests that get no response.
- The submit button is disabled and shows a spinner while the request runs. The form is marked `aria-busy="true"`.
- The result card switches between the empty, loading, error, and success panels.
- Reset cancels any in-flight request and returns the form and result card to their initial state.

### Score display

The score counts up from 0 to the returned value over 900 ms, using an ease-out curve. Users who prefer reduced motion see the final value immediately. The score is shown as-is, with no interpretation, because the backend does not define a scale.

---

## CORS

`main.py` enables CORS for all origins:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

This lets the frontend call the API from any origin. If you later restrict `allow_origins`, add the frontend's exact origin, for example `http://localhost:5500`. The browser treats `http://localhost:5500` and `http://127.0.0.1:5500` as different origins, so list whichever one you use.

---

## Error handling

The frontend distinguishes these cases and shows a specific message for each:

| Situation                                | Detected by                                  | Shown to the user                                                        |
| ---------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| Server not running, or CORS blocked      | `fetch` throws a `TypeError`                  | "Could not reach the API…" with the uvicorn command                       |
| No response within 15 seconds            | `AbortError` after the timeout               | "No response after 15 seconds…"                                          |
| Invalid values rejected by the server    | HTTP 422                                     | Field-level messages, plus a banner                                      |
| `/predict` not found                     | HTTP 404                                     | "The /predict endpoint was not found…"                                   |
| Server crash                             | HTTP 5xx                                     | "The server hit an internal error…", pointing to the uvicorn log         |
| Other non-OK status                      | Any other non-2xx                            | Generic status message                                                   |
| Body not in the expected shape           | Missing or non-numeric `predicted_mental_health_score` | "…not in the expected format"                              |

---

## Accessibility and responsive design

- Every input has a visible `<label>`. Radio groups use `<fieldset>` and `<legend>`.
- Help text and error messages are linked with `aria-describedby`.
- Invalid controls set `aria-invalid="true"`.
- The result card uses `aria-live="polite"`, so screen readers announce the result or error.
- The API status indicator has been removed. Connection problems now appear as error messages when the user submits.
- Focus outlines are visible on all interactive elements.
- A skip link jumps straight to the form.
- `prefers-reduced-motion` disables animations and the score count-up.
- Layout breakpoints: below 960 px the result card moves below the form. Below 640 px the form becomes a single column and the action buttons stack.

---

## Troubleshooting

**The result card says "Could not reach the API".**
- Check that uvicorn is running on port 8000. The port in `script.js` (`API_BASE_URL`) must match.
- Open `http://127.0.0.1:8000/` directly to confirm the server responds.
- Open the browser's developer console. A CORS message there means the origin is not allowed.

**`ModuleNotFoundError` when starting uvicorn.**
- Activate the virtual environment, then run `pip install -r requirements.txt`.

**Model loading error, or `numpy._core` not found.**
- The model was saved with numpy 2.x. Install `numpy>=2` in the same environment, then restart the server.

**Scikit-learn version warning or error when loading the model.**
- Install the same scikit-learn version that was used for training. Run `pip show scikit-learn` in the training environment and pin that version in `requirements.txt`.

**The result is always the same, or looks wrong.**
- Check that the field values are what you intended. The model was trained on the features listed above, with the same names.

**Frontend shows old content after an edit.**
- Hard-refresh the page (Ctrl+Shift+R, or Cmd+Shift+R on macOS).

---

## Known limitations

- **No model documentation in this repo.** The training data, preprocessing steps, evaluation metrics, and score range are not documented here. Add them before presenting the model as validated.
- **The score is not interpreted.** The frontend shows the raw number and does not label it as high or low risk.
- **Clinical use is not supported.** This is a demonstration project. It is not a diagnostic tool and should not be used for medical decisions.
- **Country grouping inconsistency in `main.py`.** `top_countries` includes `"Other"` (capital O), but the code assigns `"other"` (lowercase) for unlisted countries. If the model was trained with `"Other"`, unlisted countries are encoded differently from what the training data used. Check the training code and align the value.
- **Country is free text.** The backend accepts any string. Unusual spellings such as "USA" versus "United States" may be grouped differently.
- **No authentication or rate limiting.** The API is open to anyone who can reach it.
- **The model file is large** (about 25 MB). Consider Git LFS if you version-control it.

---

## Possible improvements

- Add a `/health` endpoint and a model-version field to the response.
- Add a unit-test suite for the backend (pytest with FastAPI's `TestClient`) and for the validation logic in the frontend.
- Move the `top_countries` list and the field definitions into one shared JSON file, so the frontend and backend cannot drift apart.
- Display the model's documented accuracy or error metrics next to the result.
- Add a dark-mode toggle that respects the user's stored choice.
- Package the app with Docker, with one container for the API and one for the static files.

---

## License

Add your license here, for example MIT.
