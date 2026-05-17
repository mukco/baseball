import { createContext, useContext, useRef, useState } from 'react'

const SandboxContext = createContext(null)

export function SandboxProvider({ children }) {
  const [currentSql, setCurrentSql]           = useState('')
  const [currentError, setCurrentError]       = useState(null)
  const [pendingQuestion, setPendingQuestion] = useState(null)

  const loadSqlRef       = useRef(null)  // Sandbox.jsx registers its setSql here
  const openAssistantRef = useRef(null)  // App.jsx registers its setAssistantOpen(true) here

  function loadSql(sql) {
    if (loadSqlRef.current) {
      loadSqlRef.current(sql)
    }
  }

  function askAssistant(text) {
    setPendingQuestion(text)
    openAssistantRef.current?.(true)
  }

  return (
    <SandboxContext.Provider value={{
      currentSql,    setCurrentSql,
      currentError,  setCurrentError,
      pendingQuestion, setPendingQuestion,
      loadSql, loadSqlRef,
      askAssistant, openAssistantRef,
    }}>
      {children}
    </SandboxContext.Provider>
  )
}

export function useSandbox() {
  return useContext(SandboxContext)
}
