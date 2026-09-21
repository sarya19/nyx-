# Nyx MVP Backend

Node.js + Express + Socket.IO API for a collaborative coding platform. Students register, create workspaces, and edit the same document in real time. Latest code is persisted to MongoDB.

## Folder structure

```
.
├── .env.example
├── package.json
├── README.md
└── src
    ├── server.js              # HTTP + Socket.IO bootstrap
    ├── config
    │   └── db.js              # MongoDB / Mongoose connection
    ├── middleware
    │   └── auth.js            # JWT for HTTP and sockets
    ├── models
    │   ├── User.js
    │   └── Workspace.js
    ├── routes
    │   ├── auth.js            # register / login
    │   └── workspaces.js      # protected workspace APIs
    └── sockets
        └── index.js           # rooms, code sync, presence, persistence
```

## Prerequisites

- Node.js 18+
- MongoDB running locally or a MongoDB Atlas URI

## Setup

```bash
npm install
copy .env.example .env
```

On macOS/Linux use `cp .env.example .env`.

Edit `.env`:

```
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/nyx
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d
CLIENT_ORIGIN=http://localhost:5173
CODE_SAVE_INTERVAL_MS=10000
```

## Run

```bash
npm run dev    # auto-reload with node --watch
npm start      # production-style start
```

Health check: `GET http://localhost:4000/health`

## HTTP API

All JSON. Protected routes require:

```
Authorization: Bearer <jwt>
```

### Auth

`POST /api/auth/register`

```json
{ "email": "ada@college.edu", "password": "secret123", "name": "Ada" }
```

Response `201`: `{ "token", "user": { "id", "email", "name" } }`

`POST /api/auth/login`

```json
{ "email": "ada@college.edu", "password": "secret123" }
```

Response `200`: `{ "token", "user" }`

### Workspaces (JWT required)

`POST /api/workspaces`

```json
{ "name": "Lab 1", "language": "javascript", "code": "// start here" }
```

Creates a workspace owned by the caller. The owner is added to `memberIds`.

`GET /api/workspaces`

Lists workspaces where the user is owner or member (no full `code` payload).

`GET /api/workspaces/:id`

Returns details plus current `code`. `403` if the user is not a member.

## Socket.IO

Connect to the same origin/port as the HTTP server.

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:4000", {
  auth: { token: jwt },
});
```

The handshake JWT can also be sent as `Authorization: Bearer <jwt>` or `?token=`.

### Events

| Client → server | Payload | Behavior |
| --- | --- | --- |
| `join_workspace` | `{ workspaceId }` | Joins room `workspace:<id>` if the user is a member. Optional ack returns `{ ok, code, users }`. |
| `leave_workspace` | `{ workspaceId }` | Leaves the room and refreshes presence. |
| `code_change` | `{ workspaceId, code, userId }` | Broadcasts to **others** in the room. Queues a MongoDB save. |

| Server → client | Payload |
| --- | --- |
| `code_change` | `{ workspaceId, code, userId }` |
| `presence_update` | `{ workspaceId, users: [{ id, name, email }] }` |
| `error_message` | `{ ok: false, error }` |

Code is written to MongoDB shortly after each change (debounce ~400ms) and again on an interval (`CODE_SAVE_INTERVAL_MS`, default 10s) so a crash still keeps a recent snapshot.

## Example client flow

1. Register or login and store `token`.
2. `POST /api/workspaces` and keep `id`.
3. Open a socket with `auth: { token }`.
4. `socket.emit("join_workspace", { workspaceId })`.
5. On editor input: `socket.emit("code_change", { workspaceId, code, userId })`.
6. Apply incoming `code_change` events from teammates; ignore echoes of your own `userId` if you already applied locally.
7. Render `presence_update.users` as the live collaborator list.
