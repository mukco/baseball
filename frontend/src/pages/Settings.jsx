import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

function ObsidianIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden="true">
      <path
        d="M12 2C8.5 2 6 4.5 5 7c-1.5 1-2.5 2.5-2.5 4.5 0 3.5 3 6.5 6.5 6.5h6c3.5 0 6.5-3 6.5-6.5S15.5 5 12 5"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
      />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
    </svg>
  )
}

export default function Settings() {
  const qc = useQueryClient()
  const dropRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [saved, setSaved] = useState(false)

  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
    staleTime: 60_000,
  })

  const [vaultPath, setVaultPath] = useState(null)
  const displayPath = vaultPath ?? settings.obsidian_vault_path ?? ''

  const saveMutation = useMutation({
    mutationFn: (path) => api.settings.update({ obsidian_vault_path: path }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  function handleDragOver(e) {
    e.preventDefault()
    setDragging(true)
  }

  function handleDragLeave(e) {
    if (!dropRef.current?.contains(e.relatedTarget)) setDragging(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)

    const uriList = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (uriList) {
      const uri = uriList.split(/\r?\n/).find(u => u.trim().startsWith('file://'))
      if (uri) {
        const path = decodeURIComponent(uri.trim().replace(/^file:\/\//, ''))
        setVaultPath(path)
        return
      }
    }
    const files = e.dataTransfer.files
    if (files?.length) {
      const first = files[0]
      const candidate = first.webkitRelativePath || first.name
      if (candidate) setVaultPath(candidate)
    }
  }

  const isConfigured = Boolean(settings.obsidian_vault_path)
  const isDirty = vaultPath !== null && vaultPath !== (settings.obsidian_vault_path ?? '')

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold text-content-primary mb-6">Settings</h1>

      {/* Obsidian integration card */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
            <ObsidianIcon />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-content-primary">Obsidian Vault</h2>
            <p className="text-xs text-content-muted">
              The assistant can save notes directly to your vault when you ask it to.
            </p>
          </div>
          <div className="ml-auto shrink-0">
            {isConfigured ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                <CheckIcon /> Connected
              </span>
            ) : (
              <span className="inline-flex items-center text-[11px] font-medium text-content-muted bg-bg-border px-2 py-0.5 rounded-full">
                Not configured
              </span>
            )}
          </div>
        </div>

        {/* Path input */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-content-secondary">Vault directory path</label>
          <input
            type="text"
            value={displayPath}
            onChange={e => setVaultPath(e.target.value)}
            placeholder="/home/you/Documents/obsidian"
            className="w-full bg-bg-base border border-bg-border rounded px-3 py-2 text-sm text-content-primary outline-none focus:border-brand font-mono placeholder-content-muted"
          />
        </div>

        {/* Drop zone */}
        <div
          ref={dropRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors cursor-default ${
            dragging
              ? 'border-brand bg-brand/5 text-brand'
              : 'border-bg-border text-content-muted hover:border-bg-border/80'
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 opacity-60" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <span className="text-xs">Drop your Obsidian vault folder here</span>
          <span className="text-[11px] opacity-60">Drag the vault folder from your file manager</span>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => saveMutation.mutate(displayPath)}
            disabled={saveMutation.isPending || !displayPath.trim()}
            className="btn-primary text-sm px-4 py-1.5 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <CheckIcon /> Saved
            </span>
          )}
          {saveMutation.isError && (
            <span className="text-xs text-red-400">{saveMutation.error?.message ?? 'Save failed'}</span>
          )}
          {isDirty && !saveMutation.isPending && !saved && (
            <span className="text-xs text-content-muted">Unsaved changes</span>
          )}
        </div>

        {isConfigured && (
          <p className="text-xs text-content-muted border-t border-bg-border pt-3">
            Notes will be saved to <span className="font-mono text-content-secondary">{settings.obsidian_vault_path}/Baseball/</span> by default.
            You can ask the assistant to use a different subfolder.
          </p>
        )}
      </div>
    </div>
  )
}
