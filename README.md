# Todo Backend API

A comprehensive Express.js backend for a collaborative todo application with PostgreSQL database.

## Features

- 🔐 JWT Authentication (register, login, profile management)
- 📝 Todo Lists with CRUD operations
- ✅ Tasks with subtasks, tags, priorities, and due dates
- 👥 Collaborative lists with member management and role-based access
- 🔒 Secure API with rate limiting and validation
- 🗄️ PostgreSQL database with proper relationships
- 🚀 RESTful API design

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL database (running in Docker as mentioned)
- npm or yarn

## Environment Setup

1. Copy your environment variables to a `.env` file:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_USER=todo_user
DB_PASSWORD=todo_pass
DB_NAME=todo_db
JWT_SECRET=supersecretjwt
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Make sure your PostgreSQL database is running with the schema you provided.

3. Start the development server:
```bash
npm run dev
```

Or start in production mode:
```bash
npm start
```

## API Endpoints

### Authentication

#### Register User
```
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

#### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

#### Get Profile
```
GET /api/auth/profile
Authorization: Bearer <token>
```

#### Update Profile
```
PUT /api/auth/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Smith"
}
```

#### Change Password
```
PUT /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

### Lists

#### Get All Lists
```
GET /api/lists
Authorization: Bearer <token>
```

#### Get Single List with Tasks
```
GET /api/lists/:id
Authorization: Bearer <token>
```

#### Create List
```
POST /api/lists
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Todo List"
}
```

#### Update List
```
PUT /api/lists/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated List Name"
}
```

#### Delete List
```
DELETE /api/lists/:id
Authorization: Bearer <token>
```

### List Members

#### Get List Members
```
GET /api/lists/:listId/members
Authorization: Bearer <token>
```

#### Add Member to List
```
POST /api/lists/:listId/members
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "member@example.com",
  "role": "member" // or "admin"
}
```

#### Update Member Role
```
PUT /api/lists/:listId/members/:userId
Authorization: Bearer <token>
Content-Type: application/json

{
  "role": "admin"
}
```

#### Remove Member
```
DELETE /api/lists/:listId/members/:userId
Authorization: Bearer <token>
```

#### Leave List
```
DELETE /api/lists/:listId/leave
Authorization: Bearer <token>
```

#### Transfer Ownership
```
PUT /api/lists/:listId/transfer-ownership
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "newowner@example.com"
}
```

### Tasks

#### Get Tasks by List
```
GET /api/tasks/list/:listId
Authorization: Bearer <token>
```

#### Get Single Task
```
GET /api/tasks/:id
Authorization: Bearer <token>
```

#### Create Task
```
POST /api/tasks
Authorization: Bearer <token>
Content-Type: application/json

{
  "list_id": 1,
  "title": "Complete project",
  "description": "Finish the todo app",
  "priority": "high",
  "due_date": "2024-12-31",
  "tags": ["work", "urgent"]
}
```

#### Update Task
```
PUT /api/tasks/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated task title",
  "description": "Updated description",
  "priority": "medium",
  "due_date": "2024-12-25",
  "completed": false,
  "tags": ["work", "updated"]
}
```

#### Toggle Task Completion
```
PATCH /api/tasks/:id/toggle
Authorization: Bearer <token>
```

#### Delete Task
```
DELETE /api/tasks/:id
Authorization: Bearer <token>
```

### Subtasks

#### Create Subtask
```
POST /api/tasks/:taskId/subtasks
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Subtask title"
}
```

#### Update Subtask
```
PUT /api/tasks/subtasks/:subtaskId
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated subtask",
  "completed": true
}
```

#### Toggle Subtask Completion
```
PATCH /api/tasks/subtasks/:subtaskId/toggle
Authorization: Bearer <token>
```

#### Delete Subtask
```
DELETE /api/tasks/subtasks/:subtaskId
Authorization: Bearer <token>
```

### Tags

#### Get All Tags
```
GET /api/tasks/tags/all
Authorization: Bearer <token>
```

## Database Schema

The application uses the PostgreSQL schema you provided with these tables:
- `users` - User accounts
- `lists` - Todo lists
- `list_members` - List sharing and permissions
- `tasks` - Individual tasks
- `subtasks` - Task subdivisions
- `tags` - Task categorization
- `task_tags` - Many-to-many relationship between tasks and tags

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting (100 req/15min general, 5 req/15min for auth)
- Input validation and sanitization
- CORS protection
- Helmet.js security headers
- SQL injection prevention with parameterized queries

## Error Handling

The API returns consistent error responses:

```json
{
  "error": "Error description",
  "details": ["Validation error details if applicable"]
}
```

## Development

- Use `npm run dev` for development with nodemon auto-restart
- Check `/health` endpoint for API and database status
- Visit `/` for API documentation overview

## Production Deployment

1. Set `NODE_ENV=production`
2. Use a strong `JWT_SECRET`
3. Configure proper CORS origins
4. Set up reverse proxy (nginx)
5. Use process manager (PM2)
6. Set up database backups
7. Configure logging

## License

ISC
