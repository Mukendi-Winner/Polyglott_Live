# Polyglott Live

Polyglott Live is a microphone translator built with React, Vite, and the Gemini Live API.

The flow is simple:

1. Open the interpreter screen with `Commencer`
2. Choose the input and destination languages
3. Press the mic button and speak
4. Gemini answers back as audio in the selected destination language

## Project structure

- `src/`: React frontend
- `backend/`: Express + WebSocket bridge to Gemini Live

## Frontend setup

1. Create `./.env` from `./.env.example`
2. Install frontend dependencies with `npm install`
3. Start the frontend with `npm run dev`

During development, Vite proxies `/api` and `/live` to `http://localhost:3001`.

## Backend setup

1. Go to `backend/`
2. Create `backend/.env` from `backend/.env.example`
3. Add your Gemini API key to `GEMINI_API_KEY`
4. Install backend dependencies with `npm install`
5. Start the backend with `npm run dev`

Default Gemini Live model:

- `gemini-3.1-flash-live-preview`

## Notes

- The backend opens one Gemini Live session per connected browser client.
- The destination language list is currently fixed to 10 common languages.

## Deploy

### Netlify frontend

Deploy the `Polyglott` folder as the frontend project.

- Base directory: `Polyglott`
- Build command: `npm run build`
- Publish directory: `dist`

Set this environment variable in Netlify:

- `VITE_LIVE_WS_URL=wss://your-render-service.onrender.com/live`

This is the key production change. Local development works through the Vite proxy, but a Netlify-hosted frontend must connect directly to the Render backend over `wss`.

### Render backend

Deploy the `Polyglott/backend` folder as a Render Web Service.

- Root directory: `Polyglott/backend`
- Build command: `npm install`
- Start command: `npm start`

Set these environment variables in Render:

- `GEMINI_API_KEY=...`
- `GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview`

The backend already reads `process.env.PORT`, which matches Render's web service requirements.
