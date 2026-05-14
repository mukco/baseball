export default function LiveTV() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6">
      <div className="card p-8 max-w-md w-full text-center space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-bg-border bg-bg-elevated px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-content-secondary">
          <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
          MLB Network
        </div>

        <h1 className="text-2xl font-bold text-content-primary">Live on MLB Network</h1>

        <p className="text-sm text-content-muted">
          MLB Network streams live on MLB.TV. Opens in a new tab — sign in with your TV provider or MLB.TV subscription to watch.
        </p>

        <a
          href="https://www.mlb.com/tv/watch/mlbn"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary inline-block w-full"
        >
          Watch MLB Network ↗
        </a>
      </div>
    </div>
  )
}
