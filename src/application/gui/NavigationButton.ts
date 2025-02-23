import { Widget } from "../../core/gui/Widget";
import { create_element, el } from "../../core/gui/dom";
import { GuiTool } from "../../core/stores/GuiStore";
import "./NavigationButton.css";

export class NavigationButton extends Widget {
    readonly element = el.span({ class: "application_NavigationButton" });

    private input: HTMLInputElement = create_element("input");
    private label: HTMLLabelElement = create_element("label");

    constructor(tool: GuiTool, text: string) {
        super();

        const tool_str = GuiTool[tool];

        this.input.type = "radio";
        this.input.name = "application_NavigationButton";
        this.input.value = tool_str;
        this.input.id = `application_NavigationButton_${tool_str}`;

        this.label.append(text);
        this.label.htmlFor = `application_NavigationButton_${tool_str}`;

        this.element.append(this.input, this.label);

        this.finalize_construction(NavigationButton.prototype);
    }

    set checked(checked: boolean) {
        this.input.checked = checked;
    }
}
