import { useEffect, useRef } from "react";
import { Button } from "@cloudroom/shared-ui/button";
import { Icon } from "@cloudroom/shared-ui/icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@cloudroom/shared-ui/tooltip";
import { SidebarMenuItem } from "@/components/ui/sidebar";
import { cn } from "@cloudroom/shared-ui/lib/utils";
import { appToast } from "@/components/ui/app-toast";
import { useCloudroomAccount } from "@/hooks/queries/cloudroom-queries";
import { openUrlInExternalBrowser } from "@/lib/url-open-routing";

// The cloud queue (docs/scopes/public-launch.md): Free accounts wait in line to start Cloud threads. Everything else,
// including Local threads, works as usual. The website decides; these only show it.
export type CloudQueue = { position: number; total: number; regionBlocked: boolean };

const upgrade = () => openUrlInExternalBrowser("https://www.cloudroom.dev/billing");

/** Under the new-thread composer while Cloud is picked and the account waits. */
export function CloudQueueCard({ queue, onUseLocal }: { queue: CloudQueue; onUseLocal: () => void }) {
  const local = <Button type="button" size="sm" variant="outline" onClick={onUseLocal}><Icon name="Laptop" aria-hidden />Run it on Local</Button>;
  if (queue.regionBlocked) {
    return (
      <section aria-label="Cloud unavailable" className="mt-3 flex gap-3 rounded-lg border border-foreground/10 bg-surface-raised-solid p-4">
        <Icon name="Cloud" className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Cloud isn't available in your region yet</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">We're adding cloud capacity region by region. Local threads work as usual.</p>
          </div>
          {local}
        </div>
      </section>
    );
  }
  // The share of the line behind you: it fills up as people ahead get in.
  const behind = queue.total > 0 ? Math.max(4, Math.round(((queue.total - queue.position + 1) / queue.total) * 100)) : 4;
  return (
    <section aria-label="Cloud queue" className="mt-3 flex gap-3 rounded-lg border border-foreground/10 bg-surface-raised-solid p-4">
      <Icon name="Cloud" className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">You're in the cloud queue</p>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">#{queue.position.toLocaleString("en-US")} in line</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">We let people into the cloud in small batches so it stays fast. We'll tell you here when it's your turn. Local threads work right now.</p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-foreground/10"><div className="h-full rounded-full bg-primary" style={{ width: `${behind}%` }} /></div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={upgrade}><Icon name="Zap" aria-hidden />Skip the queue with Pro</Button>
          {local}
          <span className="text-xs text-muted-foreground">Pro is $50/month</span>
        </div>
      </div>
    </section>
  );
}

/** Free Cloud needs a GitHub sign-in at least 30 days old. "Sign in with GitHub" adds GitHub to this account on the
 *  website; the card goes away once the website counts it. */
export function CloudGithubCard({ className }: { className?: string }) {
  return (
    <section aria-label="Sign in with GitHub" className={cn("rounded-lg border border-border bg-surface-raised-solid p-3 text-xs", className)}>
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border"><Icon name="GithubLogo" className="size-4" aria-hidden /></span>
        <p className="min-w-0 flex-1 text-sm font-medium">Sign in with GitHub to use free Cloud</p>
        <Button type="button" size="sm" variant="outline" onClick={upgrade}>Upgrade</Button>
        <Button type="button" size="sm" onClick={() => openUrlInExternalBrowser("https://www.cloudroom.dev/github")}><Icon name="GithubLogo" aria-hidden />Sign in with GitHub</Button>
      </div>
    </section>
  );
}

/** Sidebar footer badge while the account waits. Says so once when the account gets in. */
export function CloudQueueChip() {
  const queue = useCloudroomAccount().data?.cloudQueue ?? null;
  const waited = useRef(false);
  useEffect(() => {
    if (queue && !queue.regionBlocked) waited.current = true;
    else if (!queue && waited.current) {
      waited.current = false;
      appToast.success("You're in! Cloud threads are ready.");
    }
  }, [queue]);
  if (!queue || queue.regionBlocked) return null;
  return (
    <SidebarMenuItem data-footer-item="cloud-queue">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" aria-label={`Cloud queue: number ${queue.position}`} className="h-[26px] gap-1 rounded-md bg-primary/15 px-2 text-xs font-medium text-primary hover:bg-primary/25 hover:text-primary [&_[data-icon-root]]:size-3.5" onClick={upgrade}>
            <Icon name="Cloud" aria-hidden />
            #{queue.position.toLocaleString("en-US")}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">You're #{queue.position.toLocaleString("en-US")} in the cloud queue. Get Pro to skip it.</TooltipContent>
      </Tooltip>
    </SidebarMenuItem>
  );
}
