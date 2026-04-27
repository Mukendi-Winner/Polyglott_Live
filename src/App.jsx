import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const DESTINATION_LANGUAGES = [
  { value: 'English', label: 'English' },
  { value: 'French', label: 'Francais' },
  { value: 'Spanish', label: 'Spanish' },
  { value: 'Portuguese', label: 'Portuguese' },
  { value: 'German', label: 'German' },
  { value: 'Italian', label: 'Italian' },
  { value: 'Arabic', label: 'Arabic' },
  { value: 'Mandarin Chinese', label: 'Mandarin Chinese' },
  { value: 'Japanese', label: 'Japanese' },
  { value: 'Korean', label: 'Korean' },
]

function getIdleStatus(inputLanguage, destinationLanguage) {
  if (inputLanguage && destinationLanguage) {
    return `Ready to translate from ${inputLanguage} to ${destinationLanguage}.`
  }

  if (inputLanguage || destinationLanguage) {
    return 'Select both the input and destination languages before speaking.'
  }

  return 'Select the input and destination languages before speaking.'
}

function WelcomeScreen({ onStart }) {
  return (
    <main className="app-shell">
      <section className="welcome-screen" aria-label="Welcome">
        <div className="welcome-copy">
          <p className="welcome-line">Bienvenue</p>
          <p className="welcome-line">Sur</p>
          <p className="welcome-line">Polyglott Live</p>
        </div>

        <button type="button" className="primary-button" onClick={onStart}>
          Commencer
        </button>
      </section>
    </main>
  )
}

function MicIcon() {
  return (
    <svg
      className="control-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V7a3.5 3.5 0 1 0-7 0v5a3.5 3.5 0 0 0 3.5 3.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 11.5v.5a5.5 5.5 0 0 0 11 0v-.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 17.5v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M9 21.5h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg
      className="control-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 7l10 10M17 7 7 17"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function LanguageIcon() {
  return (
    <svg
      className="select-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 6.5h16M7 6.5c.8 4 2.5 7.1 5 9.5m0 0c1.5-1.4 2.7-3 3.6-4.9M12 16l-2.2 4M12 16l2.2 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SelectChevron() {
  return (
    <svg
      className="select-chevron"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m7 10 5 5 5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function waitForSocketOpen(socket) {
  return new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) {
      resolve()
      return
    }

    const handleOpen = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error('Unable to connect to the Polyglott backend.'))
    }

    const cleanup = () => {
      socket.removeEventListener('open', handleOpen)
      socket.removeEventListener('error', handleError)
    }

    socket.addEventListener('open', handleOpen)
    socket.addEventListener('error', handleError)
  })
}

function base64FromInt16(int16Array) {
  const bytes = new Uint8Array(int16Array.buffer)
  let binary = ''

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }

  return window.btoa(binary)
}

function pcm16ToAudioBuffer(audioContext, base64Audio) {
  const binary = window.atob(base64Audio)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  const pcm16 = new Int16Array(bytes.buffer)
  const buffer = audioContext.createBuffer(1, pcm16.length, 24000)
  const channel = buffer.getChannelData(0)

  for (let index = 0; index < pcm16.length; index += 1) {
    channel[index] = pcm16[index] / 0x8000
  }

  return buffer
}

function getLiveSocketUrl() {
  const configuredUrl = import.meta.env.VITE_LIVE_WS_URL?.trim()

  if (configuredUrl) {
    return configuredUrl
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/live`
}

function InterpreterScreen({ onBack }) {
  const [inputLanguage, setInputLanguage] = useState('')
  const [destinationLanguage, setDestinationLanguage] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0.08)
  const [status, setStatus] = useState(getIdleStatus('', ''))
  const [error, setError] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const inputAudioContextRef = useRef(null)
  const outputAudioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const streamRef = useRef(null)
  const processorRef = useRef(null)
  const muteGainRef = useRef(null)
  const socketRef = useRef(null)
  const frameRef = useRef(0)
  const nextPlaybackTimeRef = useRef(0)
  const sessionReadyResolverRef = useRef(null)
  const sessionReadyRejecterRef = useRef(null)
  const liveSocketUrl = useMemo(() => getLiveSocketUrl(), [])

  const areLanguagesSelected = Boolean(inputLanguage && destinationLanguage)

  const statusText = useMemo(() => {
    if (error) {
      return error
    }

    return status
  }, [error, status])

  useEffect(() => {
    console.log('Resolved live socket URL:', liveSocketUrl)
  }, [liveSocketUrl])

  const stopListening = (options = {}) => {
    const { closeSocket = true, navigateHome = false } = options

    cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
    nextPlaybackTimeRef.current = 0
    setIsListening(false)
    setIsConnecting(false)
    setAudioLevel(0.08)

    if (processorRef.current) {
      processorRef.current.port.onmessage = null
      processorRef.current.disconnect()
      processorRef.current = null
    }

    if (muteGainRef.current) {
      muteGainRef.current.disconnect()
      muteGainRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close()
      inputAudioContextRef.current = null
    }

    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close()
      outputAudioContextRef.current = null
    }

    analyserRef.current = null

    if (closeSocket && socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }

    if (!error) {
      setStatus(getIdleStatus(inputLanguage, destinationLanguage))
    }

    if (navigateHome) {
      onBack()
    }
  }

  useEffect(() => {
    return () => {
      cancelAnimationFrame(frameRef.current)

      if (processorRef.current) {
        processorRef.current.port.onmessage = null
        processorRef.current.disconnect()
      }

      if (muteGainRef.current) {
        muteGainRef.current.disconnect()
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }

      if (inputAudioContextRef.current) {
        inputAudioContextRef.current.close()
      }

      if (outputAudioContextRef.current) {
        outputAudioContextRef.current.close()
      }

      if (socketRef.current) {
        socketRef.current.close()
      }
    }
  }, [])

  const playAudioChunk = async (base64Audio) => {
    if (!outputAudioContextRef.current) {
      outputAudioContextRef.current = new window.AudioContext({
        sampleRate: 24000,
      })
    }

    const audioContext = outputAudioContextRef.current

    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    const audioBuffer = pcm16ToAudioBuffer(audioContext, base64Audio)
    const source = audioContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(audioContext.destination)

    const startAt = Math.max(audioContext.currentTime, nextPlaybackTimeRef.current)
    source.start(startAt)
    nextPlaybackTimeRef.current = startAt + audioBuffer.duration
  }

  const handleSocketMessage = async (event) => {
    let message

    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }

    if (message.type === 'ready') {
      if (sessionReadyResolverRef.current) {
        sessionReadyResolverRef.current()
        sessionReadyResolverRef.current = null
        sessionReadyRejecterRef.current = null
      }

      setStatus(`Listening. Polyglott will answer in ${destinationLanguage}.`)
      return
    }

    if (message.type === 'audio' && message.data) {
      try {
        await playAudioChunk(message.data)
      } catch {
        setError('Audio playback failed while streaming the translation.')
        stopListening()
      }
      return
    }

    if (message.type === 'turn-complete') {
      setStatus(`Listening. Polyglott will answer in ${destinationLanguage}.`)
      return
    }

    if (message.type === 'interrupted') {
      nextPlaybackTimeRef.current = 0
      return
    }

    if (message.type === 'error') {
      if (sessionReadyRejecterRef.current) {
        sessionReadyRejecterRef.current(
          new Error(message.message || 'The live translation session stopped unexpectedly.'),
        )
        sessionReadyResolverRef.current = null
        sessionReadyRejecterRef.current = null
      }

      setError(message.message || 'The live translation session stopped unexpectedly.')
      stopListening()
    }
  }

  const waitForLiveSessionReady = () =>
    new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        sessionReadyResolverRef.current = null
        sessionReadyRejecterRef.current = null
        reject(new Error('Timed out while waiting for the live session to start.'))
      }, 15000)

      sessionReadyResolverRef.current = () => {
        window.clearTimeout(timeoutId)
        resolve()
      }

      sessionReadyRejecterRef.current = (error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      }
    })

  const startListening = async () => {
    if (!destinationLanguage) {
      setError('Choose both the input and destination languages before starting the microphone.')
      return
    }

    if (!inputLanguage) {
      setError('Choose both the input and destination languages before starting the microphone.')
      return
    }

    setError('')
    setIsConnecting(true)
    setStatus('Connecting to Polyglott Live...')

    try {
      const socket = new WebSocket(getLiveSocketUrl())
      socketRef.current = socket

      socket.addEventListener('message', handleSocketMessage)
      socket.addEventListener('close', () => {
        if (socketRef.current === socket) {
          socketRef.current = null
        }

        if (isListening || isConnecting) {
          setIsListening(false)
          setIsConnecting(false)
          setAudioLevel(0.08)
        }
      })

      await waitForSocketOpen(socket)

      socket.send(
        JSON.stringify({
          type: 'start',
          inputLanguage,
          destinationLanguage,
        }),
      )

      await waitForLiveSessionReady()

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const audioContext = new window.AudioContext()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)
      await audioContext.audioWorklet.addModule('/pcm-recorder-worklet.js')
      const processor = new AudioWorkletNode(audioContext, 'pcm-recorder-worklet', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
        processorOptions: {
          targetSampleRate: 16000,
        },
      })
      const muteGain = audioContext.createGain()

      muteGain.gain.value = 0
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.85

      source.connect(analyser)
      analyser.connect(muteGain)
      muteGain.connect(audioContext.destination)
      source.connect(processor)

      processor.port.onmessage = (workletEvent) => {
        if (socket.readyState !== WebSocket.OPEN) {
          return
        }

        const pcm16 = new Int16Array(workletEvent.data)
        const base64Audio = base64FromInt16(pcm16)

        socket.send(
          JSON.stringify({
            type: 'audio',
            data: base64Audio,
            mimeType: 'audio/pcm;rate=16000',
          }),
        )
      }

      streamRef.current = stream
      inputAudioContextRef.current = audioContext
      analyserRef.current = analyser
      processorRef.current = processor
      muteGainRef.current = muteGain
      setIsListening(true)
      setIsConnecting(false)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const animate = () => {
        analyser.getByteFrequencyData(dataArray)

        const average =
          dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
        const nextLevel = Math.max(0.08, average / 255)

        setAudioLevel(nextLevel)
        frameRef.current = requestAnimationFrame(animate)
      }

      animate()
    } catch {
      setError('Unable to start the live translation session.')
      stopListening()
    }
  }

  const handleControlClick = async () => {
    if (isListening) {
      stopListening()
      onBack()
      return
    }

    await startListening()
  }

  const waveHeight = 8 + audioLevel * 50
  const waveHue = 210 + audioLevel * 15
  const waveBackground = `linear-gradient(
    to top,
    hsl(${waveHue}, 100%, 65%) 0%,
    hsl(${waveHue + 10}, 90%, 55%) ${waveHeight * 0.5}%,
    hsl(${waveHue + 20}, 80%, 40%) ${waveHeight}%,
    rgba(2, 6, 23, 0.9) ${waveHeight + 10}%,
    #020617 100%
  )`

  return (
    <main className="app-shell">
      <section className="interpreter-screen" aria-label="Polyglott live">
        <header className="interpreter-header">
          <h1>Polyglott Live</h1>
          <div className="language-panel">
            <p className="language-label">Input language</p>

            <div className="language-select-wrap">
              <LanguageIcon />

              <select
                className="language-select"
                value={inputLanguage}
                onChange={(event) => {
                  const nextLanguage = event.target.value

                  setInputLanguage(nextLanguage)
                  setError('')
                  setStatus(getIdleStatus(nextLanguage, destinationLanguage))
                }}
                aria-label="Select input language"
              >
                <option value="">Select a language</option>
                {DESTINATION_LANGUAGES.map((language) => (
                  <option key={`input-${language.value}`} value={language.value}>
                    {language.label}
                  </option>
                ))}
              </select>

              <SelectChevron />
            </div>

            <p className="language-label">Destination language</p>

            <div className="language-select-wrap">
              <LanguageIcon />

              <select
                className="language-select"
                value={destinationLanguage}
                onChange={(event) => {
                  const nextLanguage = event.target.value

                  setDestinationLanguage(nextLanguage)
                  setError('')
                  setStatus(getIdleStatus(inputLanguage, nextLanguage))
                }}
                aria-label="Select destination language"
              >
                <option value="">Select a language</option>
                {DESTINATION_LANGUAGES.map((language) => (
                  <option key={language.value} value={language.value}>
                    {language.label}
                  </option>
                ))}
              </select>

              <SelectChevron />
            </div>
          </div>
        </header>

        <div className="interpreter-center">
          <button
            type="button"
            className={`control-button ${isListening ? 'is-active' : ''}`}
            onClick={handleControlClick}
            aria-label={isListening ? 'Stop live conversation' : 'Start live conversation'}
            disabled={!areLanguagesSelected || isConnecting}
          >
            {isListening ? <CloseIcon /> : <MicIcon />}
          </button>

          <p className={`status-text ${error ? 'is-error' : ''}`}>{statusText}</p>
          <p className="debug-text">Socket: {liveSocketUrl}</p>
        </div>

        <div
          className={`wave-panel ${isListening ? 'is-listening' : ''}`}
          aria-hidden="true"
          style={{
            background: waveBackground,
          }}
        />
      </section>
    </main>
  )
}

function App() {
  const [screen, setScreen] = useState('welcome')

  if (screen === 'interpreter') {
    return (
      <InterpreterScreen
        onBack={() => {
          setScreen('welcome')
        }}
      />
    )
  }

  return (
    <WelcomeScreen
      onStart={() => {
        setScreen('interpreter')
      }}
    />
  )
}

export default App
