import { UserButton } from '@clerk/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import menuIcon from '../../../assets/list.svg'

type HeaderComponentProp = {
  title: string
}

type ChatMessage = {
  role: 'assistant' | 'user'
  content: string
}

const welcomeMessage: ChatMessage = {
  role: 'assistant',
  content: 'Oi, Matheus! Como posso ajudar você hoje?',
}

const chatApiUrl = import.meta.env.VITE_CHAT_API_URL ?? 'http://localhost:3001'

const suggestedPrompts = [
  'Como estão as vendas hoje?',
  'Quais produtos vendem mais?',
  'Resuma minha semana',
]

const HeaderComponent = ({ title }: HeaderComponentProp) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [chatError, setChatError] = useState('')
  const activeRequest = useRef<AbortController | null>(null)

  useEffect(() => () => activeRequest.current?.abort(), [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || isSending) return

    const conversation = [...messages, { role: 'user' as const, content }]
    setMessages(conversation)
    setDraft('')
    setChatError('')
    setIsSending(true)
    const controller = new AbortController()
    activeRequest.current = controller

    try {
      const response = await fetch(`${chatApiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversation.slice(-20) }),
        signal: controller.signal,
      })
      const result: unknown = await response.json()

      if (!response.ok) {
        const message = (
          typeof result === 'object'
          && result !== null
          && 'error' in result
          && typeof result.error === 'string'
        ) ? result.error : 'Não foi possível enviar sua mensagem.'
        throw new Error(message)
      }

      if (
        typeof result !== 'object'
        || result === null
        || !('reply' in result)
        || typeof result.reply !== 'string'
      ) {
        throw new Error('O servidor retornou uma resposta inválida.')
      }

      const reply = result.reply
      setMessages((currentMessages) => [
        ...currentMessages,
        { role: 'assistant', content: reply },
      ])
    } catch (error) {
      if (!controller.signal.aborted) {
        setChatError(
          error instanceof TypeError
            ? 'Não foi possível conectar ao backend. Verifique se o servidor está em execução.'
            : error instanceof Error
              ? error.message
              : 'Ocorreu um erro ao enviar sua mensagem.',
        )
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null
        setIsSending(false)
      }
    }
  }

  const stopGeneration = () => {
    activeRequest.current?.abort()
    activeRequest.current = null
    setIsSending(false)
  }

  const startNewConversation = () => {
    setMessages([welcomeMessage])
    setDraft('')
    setChatError('')
  }

  return (
    <>
      <header className="app-header">
        <button
          aria-label="Abrir chat"
          aria-expanded={isDrawerOpen}
          className="header-menu-button"
          onClick={() => setIsDrawerOpen(true)}
          type="button"
        >
          <img src={menuIcon} alt="" width={25} height={25} />
        </button>
        <h1>{title}</h1>
        <UserButton />
      </header>

      {isDrawerOpen && (
        <div className="drawer-layer">
          <button
            aria-label="Fechar navegação"
            className="drawer-backdrop"
            onClick={() => setIsDrawerOpen(false)}
            type="button"
          />
          <section aria-label="Chat com assistente" className="app-drawer chat-panel">
            <div className="chat-header">
              <div className="chat-title-group">
                <span aria-hidden="true" className="material-icons chat-brand-icon">auto_awesome</span>
                <div>
                  <h2>Assistente</h2>
                  <p>Seu espaço de conversa</p>
                </div>
              </div>
              <div className="chat-header-actions">
                <button aria-label="Nova conversa" className="chat-icon-button" disabled={isSending} onClick={startNewConversation} type="button">
                  <span aria-hidden="true" className="material-icons">edit_square</span>
                </button>
                <button
                  aria-label="Fechar chat"
                  className="chat-icon-button"
                  onClick={() => setIsDrawerOpen(false)}
                  type="button"
                >
                  <span aria-hidden="true" className="material-icons">close</span>
                </button>
              </div>
            </div>

            <div aria-live="polite" className="chat-messages">
              {messages.map((message, index) => (
                <div className={`chat-message chat-message-${message.role}`} key={`${message.role}-${index}`}>
                  {message.role === 'assistant' && (
                    <span aria-hidden="true" className="material-icons chat-message-avatar">auto_awesome</span>
                  )}
                  <p>{message.content}</p>
                </div>
              ))}
              {isSending && (
                <div className="chat-message chat-message-assistant">
                  <span aria-hidden="true" className="material-icons chat-message-avatar">auto_awesome</span>
                  <p>Preparando uma resposta...</p>
                </div>
              )}
              {messages.length === 1 && (
                <div className="chat-suggestions">
                  <span>Você pode perguntar</span>
                  {suggestedPrompts.map((prompt) => (
                    <button key={prompt} onClick={() => setDraft(prompt)} type="button">{prompt}</button>
                  ))}
                </div>
              )}
            </div>

            {chatError && <p className="chat-error" role="alert">{chatError}</p>}
            <form className="chat-composer" onSubmit={handleSubmit}>
              <label className="visually-hidden" htmlFor="chat-message">Sua mensagem</label>
              <textarea
                id="chat-message"
                disabled={isSending}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                placeholder="Escreva sua mensagem..."
                rows={1}
                value={draft}
              />
              <button
                aria-label={isSending ? 'Parar geração' : 'Enviar mensagem'}
                className={isSending ? 'chat-stop-button' : ''}
                disabled={!isSending && !draft.trim()}
                onClick={isSending ? stopGeneration : undefined}
                type={isSending ? 'button' : 'submit'}
              >
                <span aria-hidden="true" className="material-icons">{isSending ? 'stop' : 'arrow_upward'}</span>
              </button>
              <span className="chat-composer-hint">Enter para enviar · Shift + Enter para nova linha</span>
            </form>
          </section>
        </div>
      )}
    </>
  )
}

export default HeaderComponent
