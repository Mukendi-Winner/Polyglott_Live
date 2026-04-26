# Polyglott Live

Polyglott Live is a microphone translator built with React, Vite, and the Gemini Live API.

The flow is simple:

1. Open the interpreter screen with `Commencer`
2. Choose a destination language
3. Press the mic button and speak
4. Gemini detects the spoken language and answers back as audio in the selected destination language

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

- `gemini-3-flash-preview`

## Notes

- The backend opens one Gemini Live session per connected browser client.
- The destination language list is currently fixed to 10 common languages.
