import * as api from "../shared/api";
import { useStore } from "../shared/store";
import { toastInfo } from "../shared/toast";
import type { List } from "../shared/types";

/** "Save as template": copy the list (unchecked, no due dates) into a new template. */
export async function saveAsTemplate(list: List): Promise<void> {
  const name = await useStore.getState().askName({
    title: "Save as template",
    label: "Template name",
    initial: list.name,
    confirmLabel: "Save template",
  });
  if (!name) return;
  const tpl = await api.saveListAsTemplate(list.id, name);
  toastInfo(`Saved "${tpl.name}" as a template`);
}

/** "New list from template": prompt for a name, then create a fresh unchecked copy. */
export async function newListFromTemplate(template: List): Promise<void> {
  const name = await useStore.getState().askName({
    title: "New list from template",
    label: "List name",
    initial: template.name,
    confirmLabel: "Create list",
  });
  if (!name) return;
  const list = await api.createListFromTemplate(template.id, name);
  useStore.getState().setView({ kind: "list", listId: list.id });
}
