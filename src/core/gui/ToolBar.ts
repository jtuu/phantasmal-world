import { Widget, WidgetOptions } from "./Widget";
import { create_element } from "./dom";
import "./ToolBar.css";
import { LabelledControl } from "./LabelledControl";

export type ToolBarOptions = WidgetOptions & {
    children?: Widget[];
};

export class ToolBar extends Widget {
    readonly element = create_element("div", { class: "core_ToolBar" });
    readonly height = 33;

    constructor(options?: ToolBarOptions) {
        super(options);

        this.element.style.height = `${this.height}px`;

        if (options && options.children) {
            for (const child of options.children) {
                if (child instanceof LabelledControl && child.label) {
                    const group = create_element("div", { class: "core_ToolBar_group" });

                    if (
                        child.preferred_label_position === "left" ||
                        child.preferred_label_position === "top"
                    ) {
                        group.append(child.label.element, child.element);
                    } else {
                        group.append(child.element, child.label.element);
                    }

                    this.element.append(group);
                } else {
                    this.element.append(child.element);
                    this.disposable(child);
                }
            }
        }

        this.finalize_construction(ToolBar.prototype);
    }
}
