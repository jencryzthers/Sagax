/** A conversation the person never sees in the sidebar: a routine's
 * detached execution, or an AI client's hidden conversation (#291). */
export function taskHiddenFromSidebar(task: { routineRunId?: string; hidden?: true }): boolean {
  return Boolean(task.routineRunId) || task.hidden === true;
}

/** Sidebar dot, dock badge, and notifying pose.
 * A hidden routine execution is not a conversation, so it never counts, and
 * neither does an AI client's hidden conversation.
 * Bots saved before task lists still use their own unread flag. */
export function botShowsUnread(bot: {
  unread?: boolean;
  tasks?: ReadonlyArray<{ unread?: boolean; routineRunId?: string; hidden?: true }> | null;
}): boolean {
  if (!bot.tasks?.length) return Boolean(bot.unread);
  return bot.tasks.some((task) => Boolean(task.unread) && !taskHiddenFromSidebar(task));
}
