import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatWindow } from '@/components/ChatWindow'
import { agentApi } from '@/api/agent'

afterEach(() => vi.restoreAllMocks())

describe('ChatWindow', () => {
  it('sends a message and renders the reply with its sources', async () => {
    vi.spyOn(agentApi, 'chat').mockResolvedValue({
      conversation_id: 7,
      message: { role: 'assistant', content: 'There are 1482 species.', sources: ['dataset_overview'] },
    })

    const user = userEvent.setup()
    render(<ChatWindow />)
    await user.type(screen.getByPlaceholderText(/Ask about ocean/i), 'How many species?')
    await user.click(screen.getByRole('button', { name: /send/i }))

    expect(await screen.findByText(/1482 species/)).toBeInTheDocument()
    expect(screen.getByText('dataset_overview')).toBeInTheDocument()
  })

  it('threads the conversation_id into the next turn', async () => {
    const chat = vi.spyOn(agentApi, 'chat').mockResolvedValue({
      conversation_id: 42,
      message: { role: 'assistant', content: 'ok', sources: [] },
    })

    const user = userEvent.setup()
    render(<ChatWindow />)
    const box = screen.getByPlaceholderText(/Ask about ocean/i)

    await user.type(box, 'first{Enter}')
    await waitFor(() => expect(chat).toHaveBeenCalledTimes(1))
    expect(chat).toHaveBeenLastCalledWith('first', undefined)

    await user.type(box, 'second{Enter}')
    await waitFor(() => expect(chat).toHaveBeenCalledTimes(2))
    // Without this the backend starts a new conversation every turn and
    // follow-up questions lose all context.
    expect(chat).toHaveBeenLastCalledWith('second', 42)
  })

  it('survives a malformed response instead of blanking the page', async () => {
    // Regression test for a real failure: the backend briefly returned
    // {answer, tools_used} while this component expected {message}. The
    // undefined message reached MessageBubble, threw on `message.role`
    // during render, and white-screened the whole app.
    vi.spyOn(agentApi, 'chat').mockResolvedValue({
      conversation_id: 1,
      // @ts-expect-error deliberately wrong shape
      message: undefined,
    })

    const user = userEvent.setup()
    render(<ChatWindow />)
    await user.type(screen.getByPlaceholderText(/Ask about ocean/i), 'anything{Enter}')

    expect(await screen.findByText(/unexpected response shape/i)).toBeInTheDocument()
    // The user's own message must still be on screen — proof the tree did
    // not unmount.
    expect(screen.getByText('anything')).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    vi.spyOn(agentApi, 'chat').mockRejectedValue(new Error('Network down'))

    const user = userEvent.setup()
    render(<ChatWindow />)
    await user.type(screen.getByPlaceholderText(/Ask about ocean/i), 'hello{Enter}')

    expect(await screen.findByText(/Network down/)).toBeInTheDocument()
  })

  it('ignores an empty submission', async () => {
    const chat = vi.spyOn(agentApi, 'chat')
    const user = userEvent.setup()
    render(<ChatWindow />)
    await user.click(screen.getByRole('button', { name: /send/i }))
    expect(chat).not.toHaveBeenCalled()
  })
})
