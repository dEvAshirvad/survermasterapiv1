# Session Entries API

## Module purpose

`session_entries` stores draft and submitted answers for each static form section under a session.  
It enables card-wise entry listing, empty draft creation, partial save, submit, and soft delete flows used by the frontend.

All routes are local-team open in this phase (no auth headers).

## API map

| Method | URL | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/v1/sessions/:id/entries` | Open | List entries in a session, optional `formCode` filter. |
| `POST` | `/api/v1/sessions/:id/entries` | Open | Create an empty draft entry for a form code. |
| `GET` | `/api/v1/sessions/:id/entries/:entryId` | Open | Fetch a single session entry. |
| `PATCH` | `/api/v1/sessions/:id/entries/:entryId` | Open | Partially update answers/progress with optimistic concurrency. |
| `POST` | `/api/v1/sessions/:id/entries/:entryId/submit` | Open | Mark a draft as submitted with optimistic concurrency. |
| `DELETE` | `/api/v1/sessions/:id/entries/:entryId` | Open | Soft-delete an entry. |

## GET /api/v1/sessions/:id/entries

List entries for a session.

### Request format

- `params`
  - `id`: session ID
- `query`
  - `formCode` (optional): one of `A..N`
  - `page` (optional): integer, default `1`
  - `limit` (optional): integer, default `10`

Example:

```http
GET /api/v1/sessions/665a1b2c3d4e5f6789012345/entries?formCode=A&page=1&limit=10
```

### Response format

Success:

```json
{
  "success": true,
  "status": 200,
  "data": [
    {
      "id": "666b2c3d4e5f678901234567",
      "sessionId": "665a1b2c3d4e5f6789012345",
      "formCode": "A",
      "status": "draft",
      "answers": {},
      "progress": { "answered": 0, "totalVisible": 0, "percent": 0 },
      "version": 0,
      "createdAt": "2026-06-12T07:00:00.000Z",
      "updatedAt": "2026-06-12T07:00:00.000Z",
      "submittedAt": null,
      "deletedAt": null
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

Error:

```json
{
  "success": false,
  "status": 404,
  "error": {
    "code": "NOT_FOUND",
    "title": "NOT_FOUND",
    "message": "The requested resource was not found."
  }
}
```

### Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Invalid params/query. |
| `NOT_FOUND` | 404 | Session does not exist. |

### Notes

- List endpoint is paginated.

## POST /api/v1/sessions/:id/entries

Create an empty draft entry for a static form code.

### Request format

- `params`
  - `id`: session ID
- `body`
  - `formCode`: `A..N`

Example:

```json
{
  "formCode": "A"
}
```

### Response format

Success:

```json
{
  "success": true,
  "status": 201,
  "data": {
    "id": "666b2c3d4e5f678901234567"
  }
}
```

Error:

```json
{
  "success": false,
  "status": 404,
  "error": {
    "code": "NOT_FOUND",
    "title": "NOT_FOUND",
    "message": "The requested resource was not found."
  }
}
```

### Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Invalid session ID or form code. |
| `NOT_FOUND` | 404 | Session does not exist. |

### Notes

- Side effect: inserts a row in `session_entries` with status `draft`, empty answers, and version `0`.

## GET /api/v1/sessions/:id/entries/:entryId

Get one session entry.

### Request format

- `params`
  - `id`: session ID
  - `entryId`: entry ID

### Response format

Success:

```json
{
  "success": true,
  "status": 200,
  "data": {
    "id": "666b2c3d4e5f678901234567",
    "sessionId": "665a1b2c3d4e5f6789012345",
    "formCode": "A",
    "status": "draft",
    "answers": {},
    "progress": { "answered": 0, "totalVisible": 0, "percent": 0 },
    "version": 0
  }
}
```

Error:

```json
{
  "success": false,
  "status": 404,
  "error": {
    "code": "NOT_FOUND",
    "title": "NOT_FOUND",
    "message": "The requested resource was not found."
  }
}
```

### Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Invalid path params. |
| `NOT_FOUND` | 404 | Session or entry not found. |

## PATCH /api/v1/sessions/:id/entries/:entryId

Partially update draft answers/progress with optimistic concurrency.

### Request format

- `params`
  - `id`
  - `entryId`
- `body`
  - `expectedVersion` (required)
  - `answers` (optional)
  - `progress` (optional)

Example:

```json
{
  "expectedVersion": 2,
  "answers": {
    "A1.1": "Yes"
  },
  "progress": {
    "answered": 12,
    "totalVisible": 20,
    "percent": 60
  }
}
```

### Response format

Success:

```json
{
  "success": true,
  "status": 200,
  "data": {
    "id": "666b2c3d4e5f678901234567",
    "version": 3
  }
}
```

Error:

```json
{
  "success": false,
  "status": 409,
  "error": {
    "code": "VERSION_CONFLICT",
    "title": "VERSION_CONFLICT",
    "message": "Entry was updated by another operation. Refresh and retry."
  }
}
```

### Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Invalid body/params. |
| `NOT_FOUND` | 404 | Session or entry not found. |
| `VERSION_CONFLICT` | 409 | `expectedVersion` does not match latest entry version. |

### Notes

- Write endpoint with side effects.
- Frontend should always send current `expectedVersion`.

## POST /api/v1/sessions/:id/entries/:entryId/submit

Submit a draft entry.

### Request format

- `params`: `id`, `entryId`
- `body`: `{ "expectedVersion": <number> }`

### Response format

Success:

```json
{
  "success": true,
  "status": 200,
  "data": {
    "id": "666b2c3d4e5f678901234567",
    "status": "submitted",
    "version": 4
  }
}
```

Error:

```json
{
  "success": false,
  "status": 409,
  "error": {
    "code": "VERSION_CONFLICT",
    "title": "VERSION_CONFLICT",
    "message": "Entry submit failed due to stale version or status."
  }
}
```

### Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Invalid params/body. |
| `NOT_FOUND` | 404 | Session or entry not found. |
| `VERSION_CONFLICT` | 409 | Stale version or entry not in draft status. |

### Notes

- Write endpoint with side effects.

## DELETE /api/v1/sessions/:id/entries/:entryId

Soft delete entry by setting `deletedAt`.

### Request format

- `params`: `id`, `entryId`

### Response format

Success:

```json
{
  "success": true,
  "status": 200,
  "data": {
    "id": "666b2c3d4e5f678901234567",
    "deletedAt": "2026-06-12T07:30:00.000Z"
  }
}
```

Error:

```json
{
  "success": false,
  "status": 404,
  "error": {
    "code": "NOT_FOUND",
    "title": "NOT_FOUND",
    "message": "The requested resource was not found."
  }
}
```

### Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Invalid params. |
| `NOT_FOUND` | 404 | Session or entry not found. |

### Notes

- Write endpoint with side effects.

## Frontend integration notes

- Required sequence:
  1. Create/select session.
  2. List entries by `formCode`.
  3. Create draft entry.
  4. PATCH repeatedly with `expectedVersion`.
  5. Submit with latest `expectedVersion`.
- Cache hints:
  - Entry list can be cached briefly and invalidated after create/patch/submit/delete.
- Retry:
  - Retry network errors safely.
  - On `409`, refetch entry and replay user edits with latest version.
