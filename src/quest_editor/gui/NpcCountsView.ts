import { ResizableWidget } from "../../core/gui/ResizableWidget";
import { el } from "../../core/gui/dom";
import { quest_editor_store } from "../stores/QuestEditorStore";
import { npc_data, NpcType } from "../../core/data_formats/parsing/quest/npc_types";
import "./NpcCountsView.css";
import { DisabledView } from "./DisabledView";
import { property } from "../../core/observable";
import { QuestNpcModel } from "../model/QuestNpcModel";

export class NpcCountsView extends ResizableWidget {
    readonly element = el.div({ class: "quest_editor_NpcCountsView" });

    private readonly table_element = el.table();

    private readonly no_quest_view = new DisabledView("No quest loaded.");

    constructor() {
        super();

        this.element.append(this.table_element, this.no_quest_view.element);

        const quest = quest_editor_store.current_quest;
        const no_quest = quest.map(q => q == undefined);

        this.bind_hidden(this.table_element, no_quest);

        this.disposables(
            this.no_quest_view.visible.bind_to(no_quest),

            quest
                .flat_map(quest => (quest ? quest.npcs : property([])))
                .observe(({ value: npcs }) => this.update_view(npcs), {
                    call_now: true,
                }),
        );

        this.finalize_construction(NpcCountsView.prototype);
    }

    private update_view(npcs: readonly QuestNpcModel[]): void {
        const frag = document.createDocumentFragment();

        const npc_counts = new Map<NpcType, number>();

        for (const npc of npcs) {
            const val = npc_counts.get(npc.type) || 0;
            npc_counts.set(npc.type, val + 1);
        }

        const extra_canadines = (npc_counts.get(NpcType.Canane) || 0) * 8;

        // Sort by canonical order.
        const sorted_npc_counts = [...npc_counts].sort((a, b) => a[0] - b[0]);

        for (const [npc_type, count] of sorted_npc_counts) {
            const extra = npc_type === NpcType.Canadine ? extra_canadines : 0;

            frag.append(
                el.tr(
                    {},
                    el.th({ text: npc_data(npc_type).name + ":" }),
                    el.td({ text: String(count + extra) }),
                ),
            );
        }

        this.table_element.innerHTML = "";
        this.table_element.append(frag);
    }
}
