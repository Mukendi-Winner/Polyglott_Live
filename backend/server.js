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
  throw new Error('GEMINI_API_KEY est manquant dans Polyglott/backend/.env')
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
You are interpreting a live conversation between exactly two languages: ${inputLanguage} and ${destinationLanguage}.
For each speaker turn, detect whether the speaker is using ${inputLanguage} or ${destinationLanguage}.
If the speaker uses ${inputLanguage}, reply only in ${destinationLanguage}.
If the speaker uses ${destinationLanguage}, reply only in ${inputLanguage}.
Do not explain the translation.
Do not answer in the same language you just heard unless the speech is ambiguous and you must ask for clarification.
Keep the answer natural, concise, and faithful to what the speaker said.
If the speech is unclear or you cannot tell which of the two languages was spoken, ask a very short clarification question in the most likely target language.`
}

function createInteractiveInstruction() {
  return `You are Polyglott Live, an interactive voice translator and language helper.
Stay focused only on translation, pronunciation, language learning, wording, vocabulary, grammar, and short cultural context that helps with language use.
Answer naturally with audio only.
If the user asks who created you, say that your creator is Mukendi Winner, a third-year computer science student.
You may translate what the user says, explain a phrase, suggest a more natural wording, help with pronunciation, or give concise language tips.
If the user asks about something unrelated to translation or languages, politely say that you are a translation and language assistant and that you can only help with translation, pronunciation, wording, grammar, vocabulary, or language-learning questions.
Do not switch to unrelated topics.
Keep the reply clear, useful, and concise unless the user explicitly asks for more detail.`
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
        message: 'Format de message invalide recu par le backend.',
      })
      return
    }

    if (payload.type === 'start') {
      if (sessionStarted) {
        return
      }

      const mode = payload.mode === 'interactive' ? 'interactive' : 'conversation'
      const inputLanguage = payload.inputLanguage?.trim()
      const destinationLanguage = payload.destinationLanguage?.trim()

      if (mode === 'conversation' && (!inputLanguage || !destinationLanguage)) {
        sendJson(browserSocket, {
          type: 'error',
          message: 'La langue d entree et la langue de destination sont requises.',
        })
        return
      }

      try {
        geminiSession = await ai.live.connect({
          model,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction:
              mode === 'interactive'
                ? createInteractiveInstruction()
                : createTranslatorInstruction(inputLanguage, destinationLanguage),
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
                message: event.message || 'Gemini Live a retourne une erreur.',
              })
            },
            onclose: (event) => {
              sendJson(browserSocket, {
                type: 'error',
                message: event.reason || 'Gemini Live a ferme la session.',
              })
            },
          },
        })
      } catch (error) {
        sendJson(browserSocket, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Impossible de demarrer Gemini Live.',
        })
      }

      return
    }

    if (!geminiSession) {
      sendJson(browserSocket, {
        type: 'error',
        message: 'La session en direct n est pas encore prete.',
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
          message: error instanceof Error ? error.message : 'Impossible de diffuser l audio.',
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

server.listen(port)
