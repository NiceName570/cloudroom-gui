import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders as useProviders,
  type PluginProvidersState,
} from "@get-bb/plugin-sdk/app";
import type {
  AutomationAgentSummary,
  AutomationReadProblem,
  AutomationResponse,
  AutomationsOverviewResponse,
} from "./src/rpc-types.js";
import { AutomationLifecycleControl } from "./detail-view.js";
import { Icon } from "@cloudroom/shared-ui/icon";
import { DelayedLoading } from "@cloudroom/shared-ui/delayed-loading";
import { COARSE_POINTER_ICON_SIZE_SHRINK_CLASS } from "@cloudroom/shared-ui/coarse-pointer-sizing";
import {
  ResourceBrowseGrid,
  ResourceCollectionPage,
  ResourceCollectionViewport,
  ResourceCreateButton,
  ResourceListState,
  ResourceFilterMenu,
  ResourceMeta,
  ResourceRow,
  ResourceSortMenu,
  ResourceTemplateBrowseCard,
  ResourceToolbar,
} from "@cloudroom/shared-ui/resource-list";
import { cn } from "@cloudroom/shared-ui/lib/utils";
import { Button } from "@cloudroom/shared-ui/button";
import {
  type AutomationStatusFilter,
  formatAutomationTrigger,
  formatOverviewScheduleMetadata,
  formatScheduleRunTime,
  formatScheduleStatusLabel,
  formatTimeUntil,
  getOneShotLifecycle,
  matchesAutomationStatusFilters,
  oneShotLifecycleAllowsToggle,
  PERSONAL_PROJECT_ID,
} from "./lib/format-schedule.js";
import { AutomationMetadataItem } from "./metadata.js";
import type { CloudAutomation, CloudAutomationActions } from "./cloud-view.js";

const AUTOMATION_STATUS_FILTER_OPTIONS = [
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
] as const;

export const CREATE_AUTOMATION_PROMPT = "Create a new Cloudroom automation to ";
export const AUTOMATION_CREATE_TEMPLATES = [
  {
    label: "CI failure triage",
    icon: "AlertCircle",
    description:
      "runs every weekday morning, checks failed main-branch CI, and opens fixer threads only for new failures",
    prompt: `${CREATE_AUTOMATION_PROMPT}runs every weekday morning, checks failed main-branch CI, and opens fixer threads only for new failures.`,
  },
  {
    label: "Dependency drift",
    icon: "ElectricPlugs",
    description:
      "checks weekly for stale dependencies and opens an update thread when risk is low",
    prompt: `${CREATE_AUTOMATION_PROMPT}checks weekly for stale dependencies and opens an update thread when risk is low.`,
  },
  {
    label: "Release readiness",
    icon: "Target",
    description:
      "checks the release branch hourly, summarizes blocking checks, and alerts only when the status changes",
    prompt: `${CREATE_AUTOMATION_PROMPT}checks the release branch hourly, summarizes blocking checks, and alerts only when the status changes.`,
  },
  {
    label: "Stale worktrees",
    icon: "FolderGit",
    description:
      "checks daily for stale worktrees and opens cleanup threads only after they exceed the team's retention window",
    prompt: `${CREATE_AUTOMATION_PROMPT}checks daily for stale worktrees and opens cleanup threads only after they exceed the team's retention window.`,
  },
] as const;

type OverviewEntry = AutomationsOverviewResponse["automations"][number];
type AutomationProjectFilter = `project:${string}`;
type AutomationSortMode = "next" | "project" | "alpha";
type ProviderList = PluginProvidersState["providers"];
type AutomationSortDirection = "asc" | "desc";
export type AutomationCollectionMode = "installed" | "browse";
type ReadableOverviewAutomation =
  | AutomationResponse
  | Extract<AutomationReadProblem, { problem: "missing-agent-prompt" }>;

interface AutomationDetailRoute {
  projectId: string;
  automationId: string;
}

interface AutomationDetailNavigationOptions {
  editing?: boolean;
}

function routeOf(
  automation: Pick<AutomationResponse, "id" | "projectId">,
): AutomationDetailRoute {
  return { projectId: automation.projectId, automationId: automation.id };
}

const LAST_RUN_DOT = {
  succeeded: { label: "Last run succeeded", className: "bg-success" },
  skipped: { label: "Last run skipped", className: "bg-muted-foreground/50" },
  failed: { label: "Last run failed", className: "bg-destructive" },
  running: { label: "Running", className: "animate-pulse bg-primary" },
} as const;

function AutomationStatusDot({
  status,
}: {
  status: AutomationResponse["lastRunStatus"];
}) {
  return (
    <span
      role="img"
      aria-label={status === null ? "Not run yet" : LAST_RUN_DOT[status].label}
      className={cn(
        "size-[7px] shrink-0 rounded-full",
        status === null
          ? "ring-1 ring-inset ring-muted-foreground/50"
          : LAST_RUN_DOT[status].className,
      )}
    />
  );
}

function formatModelName(model: string): string {
  const [, base = model, context] = /^(.+?)(?:\[(\w+)\])?$/u.exec(model) ?? [];
  const name = (base.split("/").at(-1) ?? base)
    .replace(/^claude-/u, "")
    .split("-")
    .map((part) =>
      part === "gpt" ? "GPT" : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ")
    .replace(/(\d) (?=\d)/gu, "$1.")
    .replace(/^GPT /u, "GPT-");
  return context === undefined ? name : `${name} (${context.toUpperCase()})`;
}

function automationAgents(
  automation: AutomationResponse,
  scriptAgents: readonly AutomationAgentSummary[] | undefined,
): readonly AutomationAgentSummary[] {
  const { execution } = automation;
  if (execution.mode === "script") return scriptAgents ?? [];
  return [
    {
      providerId: execution.providerId,
      model: execution.model,
      reasoningLevel: execution.reasoningLevel,
    },
  ];
}

function AutomationAgentLine({
  agents,
  providers,
}: {
  agents: readonly AutomationAgentSummary[];
  providers: ProviderList;
}) {
  if (agents.length === 0) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon
          name="ComputerTerminal01"
          className="size-3.5 shrink-0"
          aria-hidden
        />
        Script
      </span>
    );
  }
  const providerIds = [...new Set(agents.map((agent) => agent.providerId))];
  const models = [
    ...new Set(
      agents.flatMap((agent) =>
        agent.model === null || agent.model === "default"
          ? []
          : [formatModelName(agent.model)],
      ),
    ),
  ];
  const levels = [
    ...new Set(
      agents.flatMap((agent) =>
        agent.reasoningLevel === null ? [] : [agent.reasoningLevel],
      ),
    ),
  ];
  const providerOf = (id: string) => providers.find((info) => info.id === id);
  const levelLabel = (level: string) =>
    providers
      .flatMap((info) => info.reasoningLevels ?? [])
      .find((option) => option.id === level)?.label ?? level;
  const parts = [
    providerIds
      .map((id) =>
        id === null ? "Agent" : (providerOf(id)?.displayName ?? id),
      )
      .join(" ⇄ "),
    models.join(" ⇄ "),
    levels.map(levelLabel).join(" ⇄ "),
  ].filter((part) => part !== "");
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex shrink-0 items-center">
        {providerIds.map((id, index) =>
          id === null ? (
            <Icon key="default" name="Bot" className="size-3.5" aria-hidden />
          ) : (
            <ProviderIcon
              key={id}
              providerKind="agent"
              provider={providerOf(id) ?? { id }}
              fallback="Bot"
              className={cn("size-3.5", index > 0 && "-ml-1")}
              aria-hidden
            />
          ),
        )}
      </span>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <span aria-hidden className="text-muted-foreground/40">
              ·
            </span>
          ) : null}
          <span
            className={cn(
              "min-w-0 truncate",
              part === levelLabel("max") && "text-primary",
            )}
          >
            {part}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

function automationNextRunText(
  automation: AutomationResponse,
  now: number,
): string {
  if (automation.lastRunStatus === "running") return "Running";
  const metadata = formatOverviewScheduleMetadata({
    enabled: automation.enabled,
    nextRunAt: automation.nextRunAt,
    trigger: automation.trigger,
    runCount: automation.runCount,
    lastRunStatus: automation.lastRunStatus,
    now,
  });
  if (metadata?.isNextRun && automation.nextRunAt !== null) {
    return formatTimeUntil(automation.nextRunAt, now);
  }
  return formatScheduleStatusLabel({ ...automation, now }).split(" — ")[0]!;
}

function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function automationProjectLabel(
  project: OverviewEntry["project"],
): string {
  return project.name;
}

function automationProjectFilterId(
  entry: OverviewEntry,
): AutomationProjectFilter {
  const projectId = entry.project.id;
  return `project:${projectId}`;
}

function isAutomationProjectFilter(
  value: string,
): value is AutomationProjectFilter {
  return value.startsWith("project:");
}

function isAutomationStatusFilter(
  value: string,
): value is AutomationStatusFilter {
  return AUTOMATION_STATUS_FILTER_OPTIONS.some((option) => option.id === value);
}

function applyAutomationSortDirection(
  result: number,
  direction: AutomationSortDirection,
): number {
  return direction === "asc" ? result : -result;
}

function automationLifecycleSortRank(automation: AutomationResponse): number {
  const oneShotLifecycle = getOneShotLifecycle({
    enabled: automation.enabled,
    trigger: automation.trigger,
    runCount: automation.runCount,
    lastRunStatus: automation.lastRunStatus,
  });
  if (oneShotLifecycle === "completed") return 3;
  if (!automation.enabled && oneShotLifecycle !== "running") return 2;
  if (oneShotLifecycle === "scheduled") return 1;
  return 0;
}

function AutomationRowMetadata({
  automation,
  project,
}: {
  automation: ReadableOverviewAutomation | null;
  project: OverviewEntry["project"];
}) {
  const projectLabel = automationProjectLabel(project);
  const personalProject = project.id === PERSONAL_PROJECT_ID;
  const scheduleMetadata =
    automation === null
      ? null
      : formatOverviewScheduleMetadata({
          enabled: automation.enabled,
          nextRunAt: automation.nextRunAt,
          trigger: automation.trigger,
          runCount: automation.runCount,
          lastRunStatus: automation.lastRunStatus,
        });
  return (
    <ResourceMeta
      items={[
        <AutomationMetadataItem
          icon="Folder"
          iconLabel={personalProject ? `Project: ${projectLabel}` : "Project"}
          title={projectLabel}
        >
          {projectLabel}
        </AutomationMetadataItem>,
        automation !== null ? (
          <AutomationMetadataItem icon="DateTime" iconLabel="Schedule">
            {formatAutomationTrigger(automation.trigger)}
          </AutomationMetadataItem>
        ) : null,
        automation !== null && scheduleMetadata !== null ? (
          <AutomationMetadataItem
            icon={scheduleMetadata.isNextRun ? "CalendarCheckOut02" : undefined}
            iconLabel={scheduleMetadata.isNextRun ? "Next run" : undefined}
          >
            {scheduleMetadata.text}
          </AutomationMetadataItem>
        ) : null,
        automation === null ? "The stored configuration cannot be read." : null,
      ]}
    />
  );
}

function AutomationListRow({
  status,
  name,
  agentLine,
  cloud,
  schedule,
  nextRun,
  nextRunAt,
  enabled,
  muted,
  toggle,
  actions,
  openLabel,
  onOpen,
}: {
  status: AutomationResponse["lastRunStatus"];
  name: string;
  agentLine: ReactNode;
  cloud: boolean;
  schedule: string;
  nextRun: string;
  nextRunAt: number | null;
  enabled: boolean;
  muted: boolean;
  toggle: ReactNode;
  actions?: ReactNode;
  openLabel?: string;
  onOpen: () => void;
}) {
  return (
    <ResourceRow
      leading={<AutomationStatusDot status={status} />}
      title={name}
      description={
        <span className="mt-1.5 flex min-w-0 items-center gap-1.5">
          {agentLine}
        </span>
      }
      className="py-3.5"
      trailingMeta={
        <span className="flex items-center gap-4 pr-3 text-xs">
          <span
            className={cn(
              "hidden w-20 items-center gap-1.5 md:flex",
              cloud ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon
              name={cloud ? "Cloud" : "Laptop"}
              className="size-3.5 shrink-0"
              aria-hidden
            />
            {cloud ? "Cloud" : "Local"}
          </span>
          <span
            className={cn(
              "flex items-center gap-4",
              actions && "group-focus-within:hidden group-hover:hidden",
            )}
          >
            <span
              className="hidden w-52 truncate text-muted-foreground md:block"
              title={schedule}
            >
              {schedule}
            </span>
            <span
              className={cn(
                "w-24 text-right tabular-nums",
                nextRun === "Running"
                  ? "font-medium text-primary"
                  : enabled && nextRun.startsWith("in ")
                    ? "font-mono text-foreground"
                    : "text-muted-foreground",
              )}
              title={
                nextRunAt === null
                  ? undefined
                  : formatScheduleRunTime(nextRunAt)
              }
            >
              {nextRun}
            </span>
          </span>
          {actions ? (
            <span className="hidden w-80 items-center justify-end gap-1 group-focus-within:flex group-hover:flex">
              {actions}
            </span>
          ) : null}
        </span>
      }
      muted={muted}
      openLabel={openLabel}
      onOpen={onOpen}
      persistentActions={toggle}
    />
  );
}

export function OverviewRow({
  automation,
  project,
  scriptAgents,
  providers,
  showProject,
  now,
  onNavigate,
  onEnabledChange,
}: {
  automation: AutomationResponse;
  project: OverviewEntry["project"];
  scriptAgents: readonly AutomationAgentSummary[] | undefined;
  providers: ProviderList;
  showProject: boolean;
  now: number;
  onNavigate: (route: AutomationDetailRoute) => void;
  onEnabledChange: (
    enabled: boolean,
    route: AutomationDetailRoute,
  ) => Promise<void>;
}) {
  const [togglePending, setTogglePending] = useState(false);
  const route = routeOf(automation);
  const oneShotLifecycle = getOneShotLifecycle({
    enabled: automation.enabled,
    trigger: automation.trigger,
    runCount: automation.runCount,
    lastRunStatus: automation.lastRunStatus,
  });
  const lifecycleLocked = !oneShotLifecycleAllowsToggle(oneShotLifecycle);
  const projectLabel = automationProjectLabel(project);

  return (
    <AutomationListRow
      status={automation.lastRunStatus}
      name={automation.name}
      agentLine={
        <>
          <AutomationAgentLine
            agents={automationAgents(automation, scriptAgents)}
            providers={providers}
          />
          {showProject ? (
            <>
              <span aria-hidden className="text-muted-foreground/40">
                ·
              </span>
              <AutomationMetadataItem
                icon="Folder"
                iconLabel={
                  project.id === PERSONAL_PROJECT_ID
                    ? `Project: ${projectLabel}`
                    : "Project"
                }
                title={projectLabel}
              >
                {projectLabel}
              </AutomationMetadataItem>
            </>
          ) : null}
        </>
      }
      cloud={false}
      schedule={formatAutomationTrigger(automation.trigger)}
      nextRun={automationNextRunText(automation, now)}
      nextRunAt={automation.nextRunAt}
      enabled={automation.enabled}
      muted={lifecycleLocked}
      onOpen={() => onNavigate(route)}
      toggle={
        <AutomationLifecycleControl
          checked={automation.enabled && !lifecycleLocked}
          disabled={lifecycleLocked || togglePending}
          disabledReason={
            lifecycleLocked
              ? oneShotLifecycle === "expired"
                ? "Missed its run time. Edit to reschedule."
                : "Already ran. Edit to reschedule."
              : undefined
          }
          label={`${automation.enabled ? "Disable" : "Enable"} ${automation.name}`}
          onCheckedChange={(enabled) => {
            setTogglePending(true);
            void onEnabledChange(enabled, route).finally(() =>
              setTogglePending(false),
            );
          }}
        />
      }
    />
  );
}

export function CloudAutomationRow({
  automation,
  providers,
  now,
  actions,
}: {
  automation: CloudAutomation;
  providers: ProviderList;
  now: number;
  actions: CloudAutomationActions;
}) {
  const nextRunAt =
    automation.next_run_at === null ? null : Date.parse(automation.next_run_at);
  return (
    <AutomationListRow
      status={
        automation.last_error !== null
          ? "failed"
          : automation.last_run_at !== null
            ? "succeeded"
            : null
      }
      name={automation.name}
      agentLine={
        <AutomationAgentLine
          agents={[
            automation.agent ?? {
              providerId: null,
              model: null,
              reasoningLevel: null,
            },
          ]}
          providers={providers}
        />
      }
      cloud
      schedule={
        automation.cron === null
          ? "One time"
          : formatAutomationTrigger({
              triggerType: "schedule",
              cron: automation.cron,
              timezone: automation.timezone,
            })
      }
      nextRun={
        !automation.enabled
          ? "Paused"
          : nextRunAt === null
            ? "Starts soon"
            : formatTimeUntil(nextRunAt, now)
      }
      nextRunAt={nextRunAt}
      enabled={automation.enabled}
      muted={!automation.enabled}
      openLabel="Open Cloud thread"
      onOpen={() => actions.onOpen(automation)}
      actions={
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => actions.onRun(automation)}
          >
            Run now
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => actions.onDelete(automation)}
          >
            Delete
          </Button>
        </>
      }
      toggle={
        <AutomationLifecycleControl
          checked={automation.enabled}
          label={`${automation.enabled ? "Pause" : "Resume"} ${automation.name}`}
          onCheckedChange={(enabled) =>
            actions.onEnabledChange(automation, enabled)
          }
        />
      }
    />
  );
}

function AutomationProblemRow({
  automation,
  project,
  onNavigate,
}: {
  automation: AutomationReadProblem;
  project: OverviewEntry["project"];
  onNavigate: (
    route: AutomationDetailRoute,
    options?: AutomationDetailNavigationOptions,
  ) => void;
}) {
  const repairTarget =
    automation.problem === "missing-agent-prompt" ? automation : null;
  const problemLabel = automationProblemLabel(automation);
  const route = routeOf(automation);
  return (
    <ResourceRow
      leading={
        <Icon
          name={repairTarget !== null ? "AlertCircle" : "CircleX"}
          className={cn(
            repairTarget !== null ? "text-warning" : "text-destructive",
            COARSE_POINTER_ICON_SIZE_SHRINK_CLASS,
          )}
          aria-hidden
        />
      }
      title={automation.name}
      state={
        <span
          className={cn(
            "inline-flex shrink-0 self-center items-center whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium",
            repairTarget !== null
              ? "bg-warning/10 text-warning-text"
              : "bg-destructive/10 text-destructive-text",
          )}
        >
          {problemLabel}
        </span>
      }
      description={
        <AutomationRowMetadata automation={repairTarget} project={project} />
      }
      className="items-start"
      onOpen={() =>
        onNavigate(route, repairTarget === null ? undefined : { editing: true })
      }
      persistentActions={
        repairTarget !== null ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onNavigate(route, { editing: true })}
          >
            Edit
          </Button>
        ) : undefined
      }
    />
  );
}

function automationProblemLabel(automation: AutomationReadProblem): string {
  return automation.problem === "missing-agent-prompt"
    ? "Prompt required"
    : "Invalid data";
}

function automationProblemSearchText(
  automation: AutomationReadProblem,
): string {
  return automation.problem === "missing-agent-prompt"
    ? `${automationProblemLabel(automation)} needs prompt missing prompt`
    : `${automationProblemLabel(automation)} invalid stored data`;
}

function matchesAutomationReadStatusFilters(
  automation: OverviewEntry["automation"],
  statusFilters: readonly AutomationStatusFilter[],
): boolean {
  if ("problem" in automation && automation.problem === "invalid-stored-data") {
    return statusFilters.length === 0;
  }
  return matchesAutomationStatusFilters(automation, statusFilters);
}

function automationSearchValues(
  automation: OverviewEntry["automation"],
  projectName: string,
): string[] {
  const values = [automation.name, projectName];
  if ("problem" in automation) {
    values.push(automationProblemSearchText(automation));
    if (automation.problem === "invalid-stored-data") return values;
  }
  values.push(formatScheduleStatusLabel(automation));
  values.push(formatAutomationTrigger(automation.trigger));
  return values;
}

function isActiveEntry({ automation }: OverviewEntry): boolean {
  return (
    "problem" in automation ||
    matchesAutomationStatusFilters(automation, ["active"])
  );
}

type ListItem = { name: string; nextRunAt: number | null; node: ReactNode };

function sortByNextRun(
  items: readonly ListItem[],
  direction: AutomationSortDirection,
): ListItem[] {
  return [...items].sort((left, right) =>
    applyAutomationSortDirection(
      (left.nextRunAt ?? Number.MAX_SAFE_INTEGER) -
        (right.nextRunAt ?? Number.MAX_SAFE_INTEGER) ||
        left.name.localeCompare(right.name),
      direction,
    ),
  );
}

function cloudNextRunAt(automation: CloudAutomation): number | null {
  return automation.next_run_at === null
    ? null
    : Date.parse(automation.next_run_at);
}

function AutomationSummary({
  entries,
  cloud,
  now,
}: {
  entries: readonly OverviewEntry[];
  cloud: readonly CloudAutomation[];
  now: number;
}) {
  const active = entries.filter(isActiveEntry);
  const activeCloud = cloud.filter((automation) => automation.enabled);
  const nextRunAt = Math.min(
    ...active.flatMap(({ automation }) =>
      "problem" in automation || automation.nextRunAt === null
        ? []
        : [automation.nextRunAt],
    ),
    ...activeCloud.flatMap((automation) => cloudNextRunAt(automation) ?? []),
  );
  return (
    <>
      <span className="text-foreground">
        {active.length + activeCloud.length}
      </span>{" "}
      active
      {Number.isFinite(nextRunAt) ? (
        <>
          {" · next run "}
          <span className="text-foreground">
            {formatTimeUntil(nextRunAt, now)}
          </span>
        </>
      ) : null}
    </>
  );
}

export function AutomationOverviewView({
  entries,
  error,
  onRetry,
  onOpenDetail,
  onEnabledChange,
  onCreateViaChat,
  activeMode,
  onModeChange,
  cloud,
}: {
  entries: OverviewEntry[] | null;
  error: string | null;
  onRetry: () => void;
  onOpenDetail: (
    route: AutomationDetailRoute,
    options?: AutomationDetailNavigationOptions,
  ) => void;
  onEnabledChange: (
    enabled: boolean,
    route: AutomationDetailRoute,
  ) => Promise<void>;
  onCreateViaChat: (prompt?: string) => void;
  activeMode: AutomationCollectionMode;
  onModeChange: (mode: AutomationCollectionMode) => void;
  cloud?: {
    rows: readonly CloudAutomation[];
    actions: CloudAutomationActions;
  };
}) {
  const [query, setQuery] = useState("");
  const [projectFilters, setProjectFilters] = useState<
    AutomationProjectFilter[]
  >([]);
  const [statusFilters, setStatusFilters] = useState<AutomationStatusFilter[]>(
    [],
  );
  const [sortMode, setSortMode] = useState<AutomationSortMode>("next");
  const [sortDirection, setSortDirection] =
    useState<AutomationSortDirection>("asc");
  const [showInactive, setShowInactive] = useState(false);
  const { providers } = useProviders();
  const now = useMinuteClock();

  const normalizedQuery = query.trim().toLowerCase();
  const projectCounts = useMemo(() => {
    const counts = new Map<AutomationProjectFilter, number>();
    for (const entry of entries ?? []) {
      const project = automationProjectFilterId(entry);
      counts.set(project, (counts.get(project) ?? 0) + 1);
    }
    return counts;
  }, [entries]);
  const projectBucketCount = projectCounts.size;
  const projectOptions = useMemo(() => {
    const options = new Map<AutomationProjectFilter, string>();
    for (const entry of entries ?? []) {
      options.set(
        automationProjectFilterId(entry),
        automationProjectLabel(entry.project),
      );
    }
    return [...options].map(([id, label]) => ({ id, label }));
  }, [entries]);
  useEffect(() => {
    setProjectFilters((current) =>
      current.filter((project) => projectCounts.has(project)),
    );
  }, [projectCounts]);
  useEffect(() => {
    if (sortMode === "project" && projectBucketCount <= 1) {
      setSortMode("next");
      setSortDirection("asc");
    }
  }, [projectBucketCount, sortMode]);
  const filteredEntries = useMemo(() => {
    if (entries === null) return [];
    return entries.filter((entry) => {
      const { automation, project } = entry;
      if (
        projectFilters.length > 0 &&
        !projectFilters.includes(automationProjectFilterId(entry))
      ) {
        return false;
      }
      if (!matchesAutomationReadStatusFilters(automation, statusFilters)) {
        return false;
      }
      return (
        normalizedQuery.length === 0 ||
        automationSearchValues(automation, project.name).some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        )
      );
    });
  }, [entries, normalizedQuery, projectFilters, statusFilters]);
  const visibleEntries = useMemo(() => {
    return [...filteredEntries].sort((left, right) => {
      if ("problem" in left.automation && "problem" in right.automation) {
        return applyAutomationSortDirection(
          left.automation.name.localeCompare(right.automation.name),
          sortDirection,
        );
      }
      if ("problem" in left.automation) return -1;
      if ("problem" in right.automation) return 1;
      const bothEnabled = left.automation.enabled && right.automation.enabled;
      const lifecycleOrder =
        automationLifecycleSortRank(left.automation) -
        automationLifecycleSortRank(right.automation);
      if (lifecycleOrder !== 0 && !(sortMode === "next" && bothEnabled)) {
        return lifecycleOrder;
      }
      const byName = left.automation.name.localeCompare(right.automation.name);
      const base =
        sortMode === "project"
          ? automationProjectLabel(left.project).localeCompare(
              automationProjectLabel(right.project),
            ) || byName
          : sortMode === "next"
            ? (left.automation.nextRunAt ?? Number.MAX_SAFE_INTEGER) -
                (right.automation.nextRunAt ?? Number.MAX_SAFE_INTEGER) ||
              byName
            : byName;
      return applyAutomationSortDirection(base, sortDirection);
    });
  }, [filteredEntries, sortDirection, sortMode]);
  const activeEntries = visibleEntries.filter(isActiveEntry);
  const inactiveEntries = visibleEntries.filter(
    (entry) => !isActiveEntry(entry),
  );
  const cloudRows = cloud?.rows ?? [];
  const visibleCloud = cloudRows.filter(
    (automation) =>
      projectFilters.length === 0 &&
      (statusFilters.length === 0 ||
        statusFilters.includes(automation.enabled ? "active" : "paused")) &&
      (normalizedQuery === "" ||
        [automation.name, "Cloud"].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        )),
  );
  const inactiveOpen =
    showInactive || normalizedQuery !== "" || statusFilters.length > 0;
  const handleSortChange = useCallback(
    (nextSort: string) => {
      if (
        nextSort !== "project" &&
        nextSort !== "alpha" &&
        nextSort !== "next"
      ) {
        return;
      }
      if (nextSort === "project" && projectBucketCount <= 1) return;
      if (nextSort === sortMode) {
        setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
        return;
      }
      setSortMode(nextSort);
      setSortDirection("asc");
    },
    [projectBucketCount, sortMode],
  );

  let body: ReactNode;
  if (error !== null) {
    body = (
      <ResourceListState
        state="error"
        message="Couldn't load automations."
        onRetry={onRetry}
      />
    );
  } else if (entries === null) {
    body = (
      <DelayedLoading>
        <ResourceListState state="loading" message="Loading automations" />
      </DelayedLoading>
    );
  } else if (entries.length === 0 && cloudRows.length === 0) {
    body = (
      <ResourceListState state="empty" message="No automations installed." />
    );
  } else if (visibleEntries.length === 0 && visibleCloud.length === 0) {
    body = (
      <ResourceListState
        state="empty"
        message={
          normalizedQuery === ""
            ? "No automations match these filters."
            : projectFilters.length > 0 || statusFilters.length > 0
              ? `No automations match "${query}" with these filters.`
              : `No automations match "${query}"`
        }
      />
    );
  } else {
    const renderEntry = ({
      automation,
      project,
      scriptAgents,
    }: OverviewEntry) =>
      "problem" in automation ? (
        <AutomationProblemRow
          key={automation.id}
          automation={automation}
          project={project}
          onNavigate={onOpenDetail}
        />
      ) : (
        <OverviewRow
          key={automation.id}
          automation={automation}
          project={project}
          scriptAgents={scriptAgents}
          providers={providers}
          showProject={projectBucketCount > 1}
          now={now}
          onNavigate={onOpenDetail}
          onEnabledChange={onEnabledChange}
        />
      );
    const localItem = (entry: OverviewEntry): ListItem => ({
      name: entry.automation.name,
      nextRunAt:
        "problem" in entry.automation ? null : entry.automation.nextRunAt,
      node: renderEntry(entry),
    });
    const cloudItem = (automation: CloudAutomation): ListItem => ({
      name: automation.name,
      nextRunAt: cloudNextRunAt(automation),
      node: cloud ? (
        <CloudAutomationRow
          key={automation.id}
          automation={automation}
          providers={providers}
          now={now}
          actions={cloud.actions}
        />
      ) : null,
    });
    const problems = activeEntries.filter(
      (entry) => "problem" in entry.automation,
    );
    const activeRest = [
      ...activeEntries
        .filter((entry) => !("problem" in entry.automation))
        .map(localItem),
      ...visibleCloud.filter((automation) => automation.enabled).map(cloudItem),
    ];
    const activeItems = [
      ...problems.map(localItem),
      ...(sortMode === "next"
        ? sortByNextRun(activeRest, sortDirection)
        : activeRest),
    ];
    const inactiveItems = [
      ...inactiveEntries.map(localItem),
      ...visibleCloud
        .filter((automation) => !automation.enabled)
        .map(cloudItem),
    ];
    body = (
      <div className="pb-4">
        {activeItems.length > 0 ? (
          <>
            <div className="pb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              Active · {activeItems.length}
            </div>
            <div className="divide-y divide-foreground/10 border-b border-foreground/10">
              {activeItems.map((item) => item.node)}
            </div>
          </>
        ) : null}
        {inactiveItems.length > 0 ? (
          <>
            <button
              type="button"
              aria-expanded={inactiveOpen}
              onClick={() => setShowInactive(!inactiveOpen)}
              className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <Icon
                name={inactiveOpen ? "ChevronDown" : "ChevronRight"}
                className="size-3.5"
                aria-hidden
              />
              Paused &amp; finished
              <span className="text-muted-foreground/60">
                {inactiveItems.length}
              </span>
            </button>
            {inactiveOpen ? (
              <div className="mt-2 divide-y divide-foreground/10 border-y border-foreground/10">
                {inactiveItems.map((item) => item.node)}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <ResourceCollectionPage
      id="automations-collection"
      description={
        entries !== null && entries.length + cloudRows.length > 0 ? (
          <AutomationSummary entries={entries} cloud={cloudRows} now={now} />
        ) : (
          "Manage scheduled Cloudroom work across projects and folders. Automations run recurring or one-time tasks without manual prompting."
        )
      }
      modes={[
        {
          id: "installed",
          label: "Installed",
          count:
            entries === null ? undefined : entries.length + cloudRows.length,
        },
        { id: "browse", label: "Browse" },
      ]}
      activeMode={activeMode}
      onModeChange={onModeChange}
      actions={
        <ResourceCreateButton
          label="New automation"
          templates={AUTOMATION_CREATE_TEMPLATES}
          onCreate={onCreateViaChat}
        />
      }
    >
      {activeMode === "browse" ? (
        <ResourceCollectionViewport contentClassName="space-y-3">
          <ResourceBrowseGrid>
            {AUTOMATION_CREATE_TEMPLATES.map((template) => (
              <ResourceTemplateBrowseCard
                key={template.label}
                title={template.label}
                description={template.description}
                onUse={() => onCreateViaChat(template.prompt)}
              />
            ))}
          </ResourceBrowseGrid>
        </ResourceCollectionViewport>
      ) : (
        <ResourceCollectionViewport
          scrollId="automations-installed-results"
          toolbar={
            <ResourceToolbar
              searchValue={query}
              searchPlaceholder="Search automations"
              onSearchChange={setQuery}
              controls={
                <>
                  <ResourceFilterMenu
                    compact
                    groups={[
                      {
                        id: "projects",
                        label: "Projects",
                        options: projectOptions,
                        selectedValues: projectFilters,
                        onChange: (values) =>
                          setProjectFilters(
                            values.filter(isAutomationProjectFilter),
                          ),
                      },
                      {
                        id: "status",
                        label: "Status",
                        options: AUTOMATION_STATUS_FILTER_OPTIONS,
                        selectedValues: statusFilters,
                        onChange: (values) =>
                          setStatusFilters(
                            values.filter(isAutomationStatusFilter),
                          ),
                      },
                    ]}
                  />
                  <ResourceSortMenu
                    value={sortMode}
                    direction={sortDirection}
                    compact
                    options={[
                      { id: "next", label: "Next run" },
                      {
                        id: "project",
                        label: "Project",
                        disabled: projectBucketCount <= 1,
                      },
                      { id: "alpha", label: "Automation name" },
                    ]}
                    onChange={handleSortChange}
                  />
                </>
              }
            />
          }
        >
          {body}
        </ResourceCollectionViewport>
      )}
    </ResourceCollectionPage>
  );
}
