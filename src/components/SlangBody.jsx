export default function SlangBody({ question }) {
  return (
    <div className="qv-slang-wrap">
      <div className="qv-slang-meta">{question.language} · {question.country}</div>
      <div className="qv-slang-term">{question.term}</div>
      <div className="qv-slang-sentence">"{question.sentence}"</div>
    </div>
  )
}
