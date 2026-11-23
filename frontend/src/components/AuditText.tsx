/// <reference lib="es2022.intl" />
import { Fragment, type ReactNode } from 'react'
import { Lexer, type Token } from 'marked'

// Older reports store a whole assessment on one line. Break only at sentence boundaries.
function paragraphs(text: string) {
  if (text.length < 180 || text.includes('\n') || !Intl.Segmenter) return text
  const parts: string[] = []
  let paragraph = ''
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text)) {
    if (paragraph.trim().length >= 75) { parts.push(paragraph.trim()); paragraph = '' }
    paragraph += segment
  }
  if (paragraph.trim()) parts.push(paragraph.trim())
  return parts.join('\n\n')
}

function nodes(tokens: Token[]): ReactNode {
  return tokens.map((token, index) => {
    const content = 'tokens' in token && token.tokens ? nodes(token.tokens) : 'text' in token ? token.text : token.raw
    switch (token.type) {
      case 'space': return null
      case 'heading': return <h5 key={index}>{content}</h5>
      case 'paragraph': return <p key={index}>{content}</p>
      case 'strong': return <strong key={index}>{content}</strong>
      case 'em': return <em key={index}>{content}</em>
      case 'blockquote': return <blockquote key={index}>{content}</blockquote>
      case 'codespan': return <code key={index}>{token.text}</code>
      case 'code': return <pre key={index}><code>{token.text}</code></pre>
      case 'br': return <br key={index}/>
      case 'list': {
        const items = token.items.map((item: { tokens: Token[] }, i: number) => <li key={i}>{nodes(item.tokens)}</li>)
        return token.ordered ? <ol key={index} start={Number(token.start)}>{items}</ol> : <ul key={index}>{items}</ul>
      }
      default: return <Fragment key={index}>{content}</Fragment>
    }
  })
}

export function AuditText({ text }: { text: string }) {
  const blocks = Lexer.lex(text)
  const plain = blocks.length === 1 && blocks[0].type === 'paragraph' && blocks[0].tokens?.every((t: Token) => t.type === 'text')
  return <div className="audit-prose">{nodes(plain ? Lexer.lex(paragraphs(text)) : blocks)}</div>
}
