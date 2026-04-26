import dotenv from 'dotenv'
import express from 'express'
import process from 'node:process'
import http from 'node:http'
import { GoogleGenAI, Modality } from '@google/genai'
import { WebSocketServer } from 'ws'

dotenv.config()

const apiKey = process.env.GEMINI_API_KEY
const model = process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview'
const port = Number(process.env.PORT || 3001)

if (!apiKey) {
  throw new Error('Missing GEMINI_API_KEY in Polyglott/backend/.env')
}

const app = express()
const server = http.createServer(app)
const liveServer = new WebSocketServer({ server, path: '/live' })
const ai = new GoogleGenAI({ apiKey })

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    model,
  })
})

function sendJson(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

function createTranslatorInstruction(inputLanguage, destinationLanguage) {
  return `You are Polyglott Live, a speech-to-speech translator.
The user will speak in ${inputLanguage}.
Reply only in ${destinationLanguage}.
Do not explain the translation.
Keep the answer natural, concise, and faithful to what the user said.
If the source speech is already in ${destinationLanguage}, briefly answer in ${destinationLanguage}.`
}

liveServer.on('connection', (browserSocket) => {
  let geminiSession = null
  let sessionStarted = false

  const closeGeminiSession = () => {
    if (geminiSession) {
      geminiSession.close()
      geminiSession = null
    }
  }

  browserSocket.on('message', async (rawMessage) => {
    let payload

    try {
      payload = JSON.parse(rawMessage.toString())
    } catch {
      sendJson(browserSocket, {
        type: 'error',
        message: 'Invalid message format received by the backend.',
      })
      return
    }

    if (payload.type === 'start') {
      if (sessionStarted) {
        return
      }

      const inputLanguage = payload.inputLanguage?.trim()
      const destinationLanguage = payload.destinationLanguage?.trim()

      if (!inputLanguage || !destinationLanguage) {
        sendJson(browserSocket, {
          type: 'error',
          message: 'Both input and destination languages are required.',
        })
        return
      }

      try {
        geminiSession = await ai.live.connect({
          model,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: createTranslatorInstruction(inputLanguage, destinationLanguage),
          },
          callbacks: {
            onopen: () => {
              sessionStarted = true
              sendJson(browserSocket, {
                type: 'ready',
              })
            },
            onmessage: (message) => {
              const serverContent = message.serverContent
              const parts = serverContent?.modelTurn?.parts || []

              for (const part of parts) {
                const inlineData = part.inlineData

                if (inlineData?.data && inlineData.mimeType?.startsWith('audio/pcm')) {
                  sendJson(browserSocket, {
                    type: 'audio',
                    data: inlineData.data,
                    mimeType: inlineData.mimeType,
                  })
                }
              }

              if (serverContent?.interrupted) {
                sendJson(browserSocket, { type: 'interrupted' })
              }

              if (serverContent?.turnComplete) {
                sendJson(browserSocket, { type: 'turn-complete' })
              }
            },
            onerror: (event) => {
              sendJson(browserSocket, {
                type: 'error',
                message: event.message || 'Gemini Live returned an error.',
              })
            },
            onclose: (event) => {
              sendJson(browserSocket, {
                type: 'error',
                message: event.reason || 'Gemini Live closed the session.',
              })
            },
          },
        })
      } catch (error) {
        sendJson(browserSocket, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to start Gemini Live.',
        })
      }

      return
    }

    if (!geminiSession) {
      sendJson(browserSocket, {
        type: 'error',
        message: 'The live session is not ready yet.',
      })
      return
    }

    if (payload.type === 'audio' && payload.data) {
      try {
        geminiSession.sendRealtimeInput({
          audio: {
            data: payload.data,
            mimeType: payload.mimeType || 'audio/pcm;rate=48000',
          },
        })
      } catch (error) {
        sendJson(browserSocket, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to stream audio.',
        })
      }
    }
  })

  browserSocket.on('close', () => {
    closeGeminiSession()
  })

  browserSocket.on('error', () => {
    closeGeminiSession()
  })
})

server.listen(port, () => {
  console.log(`Polyglott backend listening on http://localhost:${port}`)
})
