// Bot panel > Library: the bot's files only. Skills live on the Personas
// page, not here (no Files | Skills sub-tabs). The bot's Claude Code plugins live in Connect apps, in
// that bot's scope; the link below opens it there.
import { Puzzle } from "lucide-react";

import { useStore, type Bot } from "@/state/store";
import { t } from "@/lib/i18n";
import { FilesSection } from "./FilesSection";

export const LIBRARY_VIEWS = ["files"] as const;
export type LibraryView = (typeof LIBRARY_VIEWS)[number];

/** Opens Connect apps in this bot's install scope. */
export function openBotPlugins(dispatch: ReturnType<typeof useStore>["dispatch"], botId: string): void {
  dispatch({ type: "togglePlugins", open: true, botId });
}

export function LibraryTab({ bot }: { bot: Bot }) {
  const { dispatch } = useStore();
  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-2" data-library-view="files">
      <FilesSection bot={bot} />
      <button
        type="button"
        data-library-open-plugins
        onClick={() => openBotPlugins(dispatch, bot.id)}
        className="flex items-center gap-2 self-start rounded-md px-2 py-1 text-[12.5px] text-ink-secondary hover:bg-hover hover:text-ink"
      >
        <Puzzle size={14} aria-hidden="true" />
        {t("library.openPlugins")}
      </button>
    </div>
  );
}
