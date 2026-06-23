# Sessions API

## Module purpose

Survey sessions group all entries for one field deployment in a specific village context.
Routes are open for local team usage in this phase (no auth headers).

---

## API map

| Method | URL | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/api/v1/sessions` | Open | Create a session; returns `{ id }`. |
| `GET` | `/api/v1/sessions` | Open | Paginated list of sessions. |
| `GET` | `/api/v1/sessions/:id` | Open | Session detail with summary placeholders. |
| `PATCH` | `/api/v1/sessions/:id` | Open | Update session context; title is regenerated server-side. |

---

## POST /api/v1/sessions

Create a new survey session. The server generates `title` as `{district} {block} {gramPanchayat} - {Month} {Year}` from context fields.

### Request

```json
{
  "context": {
    "district": "Korba",
    "block": "Kartala",
    "gramPanchayat": "GP Name",
    "village": "Village Name",
    "surveyDate": "2026-03-15",
    "distanceFromNearestMine": 0,
    "totalPopulation": 1200,
    "totalHouseholds": 250,
    "scHouseholds": 40,
    "stHouseholds": 60,
    "miningAffectedArea": "direct",
    "surveyorName": "Rajesh Kumar",
    "surveyorNameNIT": "Priya Sharma"
  }
}
```

Omit `totalPopulation`, `totalHouseholds`, `scHouseholds`, or `stHouseholds` to default them to `0`.

### Response

```json
{
  "success": true,
  "status": 201,
  "data": {
    "id": "665a1b2c3d4e5f6789012345"
  }
}
```

### Errors

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Missing or invalid body fields. |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server failure. |

---

## GET /api/v1/sessions

List sessions.

### Query

| Param | Type | Default |
| --- | --- | --- |
| `page` | integer | 1 |
| `limit` | integer | 10 |

### Response

```json
{
  "success": true,
  "status": 200,
  "data": [
    {
      "id": "665a1b2c3d4e5f6789012345",
      "title": "Korba Kartala GP Name - March 2026",
      "context": {
        "district": "Korba",
        "block": "Kartala",
        "gramPanchayat": "GP Name",
        "village": "Village Name",
        "surveyDate": "2026-03-15T00:00:00.000Z",
        "totalPopulation": 1200,
        "totalHouseholds": 250,
        "scHouseholds": 40,
        "stHouseholds": 60,
        "miningAffectedArea": "direct",
        "surveyorName": "Rajesh Kumar",
        "surveyorNameNIT": "Priya Sharma"
      },
      "createdAt": "2026-06-11T10:00:00.000Z",
      "updatedAt": "2026-06-11T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

---

## GET /api/v1/sessions/:id

Get one session detail.

### Response

```json
{
  "success": true,
  "status": 200,
  "data": {
    "id": "665a1b2c3d4e5f6789012345",
    "title": "Korba Block 3 — March 2026",
    "context": {
      "district": "Korba",
      "block": "Kartala",
      "gramPanchayat": "GP Name",
      "village": "Village Name",
      "surveyDate": "2026-03-15T00:00:00.000Z",
      "totalPopulation": 1200,
      "totalHouseholds": 250,
      "scHouseholds": 40,
      "stHouseholds": 60,
      "miningAffectedArea": "direct",
      "surveyorName": "Rajesh Kumar",
      "surveyorNameNIT": "Priya Sharma"
    },
    "forms": [],
    "summary": {
      "formCount": 0,
      "entryCount": 0
    }
  }
}
```

### Errors

| Code | HTTP | Meaning |
| --- | --- | --- |
| `NOT_FOUND` | 404 | Unknown session id. |
| `VALIDATION_ERROR` | 400 | Invalid path param. |

---

## PATCH /api/v1/sessions/:id

Update session context for edit flow. Title is regenerated from district, block, gram panchayat, and survey date.

### Request

```json
{
  "context": {
    "district": "Korba",
    "block": "Kartala",
    "gramPanchayat": "GP Name",
    "village": "Updated Village Name",
    "surveyDate": "2026-06-16",
    "distanceFromNearestMine": 0,
    "totalPopulation": 1200,
    "totalHouseholds": 250,
    "scHouseholds": 40,
    "stHouseholds": 60,
    "miningAffectedArea": "indirect",
    "surveyorName": "Rajesh Kumar",
    "surveyorNameNIT": "Priya Sharma"
  }
}
```

### Response

```json
{
  "success": true,
  "status": 200,
  "data": {
    "id": "665a1b2c3d4e5f6789012345",
    "title": "Korba Kartala GP Name - June 2026",
    "context": {
      "district": "Korba",
      "block": "Kartala",
      "gramPanchayat": "GP Name",
      "village": "Updated Village Name",
      "surveyDate": "2026-03-16T00:00:00.000Z",
      "totalPopulation": 1200,
      "totalHouseholds": 250,
      "scHouseholds": 40,
      "stHouseholds": 60,
      "miningAffectedArea": "indirect",
      "surveyorName": "Rajesh Kumar",
      "surveyorNameNIT": "Priya Sharma"
    },
    "forms": [],
    "summary": {
      "formCount": 0,
      "entryCount": 0
    }
  }
}
```

### Errors

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Missing or invalid body/path fields. |
| `NOT_FOUND` | 404 | Unknown session id. |

---

## Frontend integration notes

1. Call `POST /api/v1/sessions` with `context` only; do not send `title`.
2. Call `GET /api/v1/sessions` for list screen.
3. Call `GET /api/v1/sessions/:id` when session is selected.
4. Call `PATCH /api/v1/sessions/:id` from session edit screen; title updates automatically when context changes.
5. `session_entries` routes provide actual entry stats; detail endpoint still returns placeholder `forms` summary.
