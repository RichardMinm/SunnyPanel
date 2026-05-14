"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; fallbackLabel?: string };
type State = { error: Error | null };

export class AgentErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AgentErrorBoundary]", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="sunny-agent-error-boundary" role="alert">
          <div className="sunny-agent-error-boundary-inner">
            <h3>{this.props.fallbackLabel ?? "Agent \u7ec4\u4ef6\u51fa\u9519\u4e86"}</h3>
            <p>{this.state.error.message}</p>
            <button type="button" onClick={this.handleRetry} className="sunny-agent-error-boundary-retry">
              \u91cd\u8bd5
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
