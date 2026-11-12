import { UserButton } from '@clerk/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { errorMessage, useApi } from '../../../data/api-client'

type HeaderComponentProp = {
  title: string
}

type ChatMessage = {
  role: 'assistant' | 'user'
  content: string
}

const suggestedPrompts = [
  'Como estão as vendas hoje?',
  'Quais produtos vendem mais?',
  'Resuma minha semana',
]

const HeaderComponent = ({ title }: HeaderComponentProp) => {
  const api = useApi()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
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
      const result = await api.post<{ reply: string }>('/chat', {
        messages: conversation.slice(-20),
      }, { signal: controller.signal })

      if (typeof result.reply !== 'string' || result.reply.trim() === '') {
        throw new Error('O servidor retornou uma resposta inválida.')
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        { role: 'assistant', content: result.reply },
      ])
    } catch (error) {
      if (!controller.signal.aborted) {
        setChatError(errorMessage(error))
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
    setMessages([])
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
          <span aria-hidden="true" className="material-icons">auto_awesome</span>
          <span>Chatbot com IA</span>
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
              {messages.length === 0 && (
                <div className="chat-suggestions">
                  <p>Faça uma pergunta sobre seus produtos e vendas.</p>
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
                maxLength={4000}
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
