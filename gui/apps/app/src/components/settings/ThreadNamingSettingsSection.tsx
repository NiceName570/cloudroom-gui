import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import { Slider } from "@cloudroom/shared-ui/slider";
import { Switch } from "@cloudroom/shared-ui/switch";
import { Textarea } from "@cloudroom/shared-ui/textarea";
import {
  DEFAULT_THREAD_NAMING_RULES,
  THREAD_PURPOSE_CLAUDE_MODEL,
} from "@cloudroom/domain";
import {
  SettingsSection,
  SettingsWithControl,
} from "@/components/ui/settings-section";
import { useSystemConfig } from "@/hooks/queries/system-queries";
import { createSyncedPreferenceAtom } from "@/lib/ui-preferences/synced-preference-atom";
import {
  SettingsDropdown,
  ThreadNamingModelPicker,
} from "./ThreadNamingModelPicker";

const threadNamingModelAtom = createSyncedPreferenceAtom("threadNaming.model");
const threadNamingFallbackModelAtom = createSyncedPreferenceAtom(
  "threadNaming.fallbackModel",
);
const threadNamingRulesAtom = createSyncedPreferenceAtom("threadNaming.rules");
const renameSensitivityAtom = createSyncedPreferenceAtom(
  "threadNaming.renameSensitivity",
);
const threadPurposeEnabledAtom = createSyncedPreferenceAtom(
  "threadPurpose.enabled",
);
const threadPurposeModelAtom = createSyncedPreferenceAtom("threadPurpose.model");
const threadPurposeEffortAtom = createSyncedPreferenceAtom(
  "threadPurpose.reasoningEffort",
);
const PURPOSE_EFFORT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;
const RENAME_SENSITIVITY_LABELS = [
  "Off",
  "Rarely",
  "Sometimes",
  "Often",
  "Very often",
] as const;

export function ThreadNamingSettingsSection() {
  const [model, setModel] = useAtom(threadNamingModelAtom);
  const [fallbackModel, setFallbackModel] = useAtom(
    threadNamingFallbackModelAtom,
  );
  const [rules, setRules] = useAtom(threadNamingRulesAtom);
  const [renameSensitivity, setRenameSensitivity] = useAtom(
    renameSensitivityAtom,
  );
  const [draftRules, setDraftRules] = useState(rules);
  const defaultModel = useSystemConfig().data?.aiServices.inference ?? null;

  useEffect(() => setDraftRules(rules), [rules]);

  const saveRules = () => {
    const next = draftRules.trim() || DEFAULT_THREAD_NAMING_RULES;
    setDraftRules(next);
    if (next !== rules) setRules(next);
  };

  return (
    <SettingsSection
      title="Thread naming"
      description="Names new threads after your first message."
    >
      <div className="space-y-4">
        <ThreadNamingModelPicker
          harnessDescription="Uses this harness's subscription."
          value={model}
          defaultValue={defaultModel}
          onChange={setModel}
        />
        <ThreadNamingModelPicker
          prefix="Fallback"
          harnessDescription="Used when the main model fails."
          value={fallbackModel}
          defaultValue={null}
          allowNone
          onChange={setFallbackModel}
        />
        <SettingsWithControl
          label="Rules"
          description="How titles should look. Saved when you click away."
          controlPlacement="below"
        >
          <Textarea
            aria-label="Thread naming rules"
            className="min-h-[80px] text-sm"
            maxLength={4_000}
            value={draftRules}
            onChange={(event) => setDraftRules(event.target.value)}
            onBlur={saveRules}
          />
        </SettingsWithControl>
        <SettingsWithControl
          label="Rename vague titles"
          description="After the first reply, gives a vague title a clearer name once. Titles you set are never changed."
        >
          <div className="flex w-48 items-center gap-3">
            <Slider
              aria-label="Rename vague titles"
              min={1}
              max={5}
              step={1}
              value={[renameSensitivity]}
              onValueChange={([value]) => {
                if (value !== undefined) setRenameSensitivity(value);
              }}
            />
            <span className="w-16 shrink-0 text-xs text-muted-foreground">
              {RENAME_SENSITIVITY_LABELS[renameSensitivity - 1]}
            </span>
          </div>
        </SettingsWithControl>
      </div>
    </SettingsSection>
  );
}

export function ThreadPurposeSettingsSection() {
  const [enabled, setEnabled] = useAtom(threadPurposeEnabledAtom);
  const [model, setModel] = useAtom(threadPurposeModelAtom);
  const [effort, setEffort] = useAtom(threadPurposeEffortAtom);

  return (
    <SettingsSection
      title="Thread purpose"
      description="Hover a thread's title to see what it is for and how far along it is. Updated after every reply. Off when neither Claude Code nor Codex is signed in."
    >
      <div className="space-y-4">
        <SettingsWithControl
          label="Thread purpose"
          description="Uses a small model call after each reply."
        >
          <Switch
            aria-label="Thread purpose"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </SettingsWithControl>
        {enabled ? (
          <>
            <ThreadNamingModelPicker
              harnessDescription="Default: Haiku 5.5 on Claude Code, or GPT-6 Luna on Codex without Claude."
              scope="Thread purpose"
              value={model}
              defaultValue={THREAD_PURPOSE_CLAUDE_MODEL}
              defaultLabel="Haiku 5.5, or GPT-6 Luna"
              onChange={setModel}
            />
            <SettingsWithControl label="Reasoning effort">
              <SettingsDropdown
                label="Thread purpose reasoning effort"
                options={[...PURPOSE_EFFORT_OPTIONS]}
                selected={effort}
                triggerLabel={
                  PURPOSE_EFFORT_OPTIONS.find((option) => option.value === effort)
                    ?.label ?? effort
                }
                onSelect={(value) => {
                  const next = PURPOSE_EFFORT_OPTIONS.find(
                    (option) => option.value === value,
                  );
                  if (next) setEffort(next.value);
                }}
              />
            </SettingsWithControl>
          </>
        ) : null}
      </div>
    </SettingsSection>
  );
}
