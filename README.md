# Full-Stack Task Workflow Platform

A full-stack task manager built for my software engineering portfolio. It covers the core product flow from account creation to authenticated task CRUD, filtering, and dashboard stats.

## What This Project Does

After signing up or logging in, a user can:

- create tasks
- update task title, description, status, priority, and due date
- filter tasks by status and priority
- delete tasks
- view task stats in a dashboard

Each user can only access their own tasks.

## Tech Stack

### Frontend

- React
- Vite
- JavaScript
- CSS
- Axios
- React Router

### Backend

- Node.js
- Express.js
- PostgreSQL
- JWT
- bcrypt
- dotenv
- cors
- pg

## Features

- user registration
- user login
- hashed passwords with bcrypt
- JWT authentication
- protected frontend routes
- protected backend routes
- token stored in `localStorage`
- logout support
- task CRUD
- task filtering
- task statistics
- responsive dashboard UI

## Folder Structure

```text
task-workflow-platform/
|-- backend/
|   |-- src/
|   |   |-- config/
|   |   |   `-- db.js
|   |   |-- middleware/
|   |   |   `-- authMiddleware.js
|   |   |-- routes/
|   |   |   |-- authRoutes.js
|   |   |   `-- taskRoutes.js
|   |   |-- controllers/
|   |   |   |-- authController.js
|   |   |   `-- taskController.js
|   |   |-- schema.sql
|   |   `-- server.js
|   |-- package.json
|   `-- .env.example
|-- frontend/
|   |-- src/
|   |   |-- api/
|   |   |   `-- api.js
|   |   |-- components/
|   |   |   |-- Navbar.jsx
|   |   |   |-- ProtectedRoute.jsx
|   |   |   |-- TaskCard.jsx
|   |   |   `-- TaskForm.jsx
|   |   |-- pages/
|   |   |   |-- Login.jsx
|   |   |   |-- Register.jsx
|   |   |   `-- Dashboard.jsx
|   |   |-- App.jsx
|   |   |-- main.jsx
|   |   `-- styles.css
|   |-- index.html
|   |-- package.json
|   |-- vite.config.js
|   `-- .env.example
|-- screenshots/
`-- README.md
```

## Database Schema

Run the SQL file at `backend/src/schema.sql`.

### `users`

- `id`
- `name`
- `email`
- `password_hash`
- `role`
- `created_at`

### `tasks`

- `id`
- `user_id`
- `title`
- `description`
- `status`
- `priority`
- `due_date`
- `created_at`
- `updated_at`

### Allowed values

Status:

- `todo`
- `in_progress`
- `completed`

Priority:

- `low`
- `medium`
- `high`

## API Routes

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Tasks

- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `GET /api/tasks/stats`

## API Testing Examples

Use this header for protected routes:

```http
Authorization: Bearer <your_jwt_token>
```

### Register

Request:

```json
{
  "name": "Hrithik Jadhav",
  "email": "hrithik@example.com",
  "password": "securepass123"
}
```

Response:

```json
{
  "message": "Registration successful.",
  "token": "<jwt_token>",
  "user": {
    "id": 1,
    "name": "Hrithik Jadhav",
    "email": "hrithik@example.com",
    "role": "user",
    "created_at": "2026-06-15T08:00:00.000Z"
  }
}
```

### Login

Request:

```json
{
  "email": "hrithik@example.com",
  "password": "securepass123"
}
```

Response:

```json
{
  "message": "Login successful.",
  "token": "<jwt_token>",
  "user": {
    "id": 1,
    "name": "Hrithik Jadhav",
    "email": "hrithik@example.com",
    "role": "user",
    "created_at": "2026-06-15T08:00:00.000Z"
  }
}
```

### Create Task

Request:

```json
{
  "title": "Build dashboard cards",
  "description": "Show total, completed, in-progress, and high-priority counts.",
  "status": "in_progress",
  "priority": "high",
  "due_date": "2026-06-20"
}
```

Response:

```json
{
  "message": "Task created successfully.",
  "task": {
    "id": 4,
    "user_id": 1,
    "title": "Build dashboard cards",
    "description": "Show total, completed, in-progress, and high-priority counts.",
    "status": "in_progress",
    "priority": "high",
    "due_date": "2026-06-20T00:00:00.000Z",
    "created_at": "2026-06-15T08:10:00.000Z",
    "updated_at": "2026-06-15T08:10:00.000Z"
  }
}
```

### Get Tasks

Example request:

```http
GET /api/tasks?status=in_progress&priority=high
```

Response:

```json
[
  {
    "id": 4,
    "user_id": 1,
    "title": "Build dashboard cards",
    "description": "Show total, completed, in-progress, and high-priority counts.",
    "status": "in_progress",
    "priority": "high",
    "due_date": "2026-06-20T00:00:00.000Z",
    "created_at": "2026-06-15T08:10:00.000Z",
    "updated_at": "2026-06-15T08:10:00.000Z"
  }
]
```

### Update Task

Example request:

```http
PUT /api/tasks/4
```

```json
{
  "title": "Build dashboard cards",
  "description": "Finalize responsive stat cards and loading states.",
  "status": "completed",
  "priority": "high",
  "due_date": "2026-06-20"
}
```

Response:

```json
{
  "message": "Task updated successfully.",
  "task": {
    "id": 4,
    "user_id": 1,
    "title": "Build dashboard cards",
    "description": "Finalize responsive stat cards and loading states.",
    "status": "completed",
    "priority": "high",
    "due_date": "2026-06-20T00:00:00.000Z",
    "created_at": "2026-06-15T08:10:00.000Z",
    "updated_at": "2026-06-15T08:22:00.000Z"
  }
}
```

### Delete Task

Example request:

```http
DELETE /api/tasks/4
```

Response:

```json
{
  "message": "Task deleted successfully."
}
```

### Get Task Stats

Example request:

```http
GET /api/tasks/stats
```

Response:

```json
{
  "total_tasks": 8,
  "completed_tasks": 3,
  "in_progress_tasks": 2,
  "todo_tasks": 3,
  "high_priority_tasks": 2
}
```

## Local Setup

### 1. Clone the repo

```bash
git clone <your-repo-url>
cd task-workflow-platform
```

### 2. Set up the backend

```bash
cd backend
npm install
```

Create a `backend/.env` file from `backend/.env.example`:

```env
PORT=5000
DATABASE_URL=postgresql://postgres:password@localhost:5432/task_workflow_platform
JWT_SECRET=replace_with_a_long_random_secret
CORS_ORIGIN=http://localhost:5173
```

### 3. Set up PostgreSQL

Create a database named `task_workflow_platform`, then run:

```bash
psql -U postgres -d task_workflow_platform -f src/schema.sql
```

### 4. Start the backend

```bash
npm run dev
```

The backend will run on `http://localhost:5000`.

### 5. Set up the frontend

Open a new terminal:

```bash
cd frontend
npm install
```

Create a `frontend/.env` file from `frontend/.env.example`:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

### 6. Start the frontend

```bash
npm run dev
```

The frontend will run on `http://localhost:5173`.

## Notes For Local Testing

- register a user first
- log in to get a token
- the frontend stores the token in `localStorage`
- `/api/tasks` and `/api/tasks/stats` require authentication

## Possible Next Improvements

- add validation with a library like Zod or React Hook Form
- add tests for auth and task routes
- add pagination or search
- add refresh tokens or cookie-based auth
- add the optional AI task breakdown feature after the core app is fully deployed and stable
