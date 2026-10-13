import { Component, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowClockwise,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "./Common";

/** A failed optional page must leave the navigation and saved table available. */
export class PageBoundary extends Component<
  { children: ReactNode; title: string; onHome: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="page-content page-recovery" role="alert">
        <WarningCircle size={36} aria-hidden="true" />
        <div className="eyebrow">The trail is still here</div>
        <h1>{this.props.title} could not open.</h1>
        <p>
          A required file may be unavailable or this page encountered a problem.
          Return to your campaigns, or reload to try again.
        </p>
        <div className="page-recovery-actions">
          <Button onClick={this.props.onHome} secondary>
            <ArrowLeft size={18} /> Return to campaigns
          </Button>
          <Button onClick={() => window.location.reload()}>
            <ArrowClockwise size={18} /> Reload page
          </Button>
        </div>
      </section>
    );
  }
}
