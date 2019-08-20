import { Property } from "../observable/Property";
import { Disposable } from "../gui/Disposable";

export enum GuiTool {
    Viewer,
    QuestEditor,
    HuntOptimizer,
}

const GUI_TOOL_TO_STRING = new Map([
    [GuiTool.Viewer, "viewer"],
    [GuiTool.QuestEditor, "quest_editor"],
    [GuiTool.HuntOptimizer, "hunt_optimizer"],
]);
const STRING_TO_GUI_TOOL = new Map([...GUI_TOOL_TO_STRING.entries()].map(([k, v]) => [v, k]));

class GuiStore implements Disposable {
    tool = new Property<GuiTool>(GuiTool.Viewer);

    private hash_disposer = this.tool.observe(tool => {
        window.location.hash = `#/${gui_tool_to_string(tool)}`;
    });

    constructor() {
        const tool = window.location.hash.slice(2);
        this.tool.set(string_to_gui_tool(tool) || GuiTool.Viewer);
    }

    dispose(): void {
        this.hash_disposer.dispose();
    }
}

export const gui_store = new GuiStore();

function string_to_gui_tool(tool: string): GuiTool | undefined {
    return STRING_TO_GUI_TOOL.get(tool);
}

function gui_tool_to_string(tool: GuiTool): string {
    const str = GUI_TOOL_TO_STRING.get(tool);

    if (str) {
        return str;
    } else {
        throw new Error(`To string not implemented for ${(GuiTool as any)[tool]}.`);
    }
}
