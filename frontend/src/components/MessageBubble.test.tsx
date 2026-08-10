import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessageBubble } from '@/components/MessageBubble'

describe('MessageBubble', () => {
  it('renders assistant content and its tool citations', () => {
    render(
      <MessageBubble
        message={{
          role: 'assistant',
          content: 'There are 1482 species in the catalogue.',
          sources: ['dataset_overview'],
        }}
      />,
    )
    expect(screen.getByText(/1482 species/)).toBeInTheDocument()
    // Provenance is the point of the chat UI — an answer without a visible
    // source is indistinguishable from a hallucination.
    expect(screen.getByText('dataset_overview')).toBeInTheDocument()
  })

  it('does not show a sources block on user messages', () => {
    render(<MessageBubble message={{ role: 'user', content: 'How many species?' }} />)
    expect(screen.getByText('How many species?')).toBeInTheDocument()
    expect(screen.queryByText(/Sources:/i)).not.toBeInTheDocument()
  })

  it('renders an assistant message that has no sources', () => {
    // The graceful-fallback path returns prose with no tools_used; it must
    // still render rather than throwing on a missing array.
    render(<MessageBubble message={{ role: 'assistant', content: 'I could not complete that.' }} />)
    expect(screen.getByText(/could not complete/)).toBeInTheDocument()
  })

  it('preserves newlines in multi-paragraph answers', () => {
    render(<MessageBubble message={{ role: 'assistant', content: 'Line one.\nLine two.' }} />)
    const node = screen.getByText(/Line one/)
    expect(node).toHaveClass('whitespace-pre-wrap')
  })
})
