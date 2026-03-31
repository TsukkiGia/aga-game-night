export default function VideoBody({ question }) {
  return (
    <div className="qv-video-wrap">
      <video className="qv-video" src={`/videos/${question.video}`} controls />
    </div>
  )
}
