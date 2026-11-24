export function AnswerText({ text }: { text: string }) {
  return (
    <div className="answer">
      {text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) =>
        <p key={index}>{line}</p>,
      )}
    </div>
  )
}
