import { Component, type ReactNode } from 'react'
import { Fallback } from './Fallback.tsx'

interface State {
  failed: boolean
}

/**
 * If the scene cannot run at all (no graphics context could be made, or it failed to start),
 * the still sky takes its place instead of a broken page.
 */
export class GraphicsBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  override render() {
    return this.state.failed ? <Fallback /> : this.props.children
  }
}
