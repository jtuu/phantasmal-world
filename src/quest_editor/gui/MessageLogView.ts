import { ResizableWidget } from "../../core/gui/ResizableWidget";
import { el, bind_children_to } from "../../core/gui/dom";
import "./MessageLogView.css";
import { ILogLevel } from "js-logger/src/types";
import { ListProperty } from "../../core/observable/property/list/ListProperty";
import { Property } from "../../core/observable/property/Property";
import { list_property, property } from "../../core/observable";

export interface LogMessage {
    formatted_timestamp: string;
    message_contents: string;
    log_level: ILogLevel;
}

export interface MessageLogStore {
    messages: ListProperty<LogMessage>;
    log_level: Property<ILogLevel>;
}

export abstract class MessageLogView extends ResizableWidget {
    readonly element = el.div({ class: "quest_editor_MessageLogView", tab_index: -1 });
    protected base_classname = this.element.className;
    protected list_element = this.element.appendChild(
        el.div({ class: this.base_classname + "_message_list" }),
    );

    constructor(protected store: MessageLogStore) {
        super();

        this.disposables(
            bind_children_to(
                this.list_element,
                store.messages.filtered(this.should_show),
                this.create_message_element,
            ),
        );

        this.finalize_construction(this.constructor.prototype);
    }

    protected get_formatted_timestamp(date = new Date()): string {
        return "[" + date.toISOString() + "]";
    }

    /**
     * How far away from the bottom the scrolling is allowed to
     * be for autoscroll to still happen. Returns pixels.
     */
    protected get_autoscroll_treshold(): number {
        const some_msg = this.list_element.firstElementChild;

        if (!some_msg) {
            return 0;
        }

        // half of the height of a message
        return some_msg.clientHeight / 2;
    }

    protected is_scrolled_to_bottom(): boolean {
        return (
            this.element.scrollTop >=
            this.element.scrollHeight - this.element.offsetHeight - this.get_autoscroll_treshold()
        );
    }

    protected scroll_to_bottom(): void {
        this.element.scrollTo({
            top: this.element.scrollHeight,
            left: 0,
            behavior: "auto",
        });
    }

    protected add_message(msg: HTMLElement): void {
        const autoscroll = this.is_scrolled_to_bottom();

        this.list_element.appendChild(msg);

        if (autoscroll) {
            this.scroll_to_bottom();
        }
    }

    protected create_message_element = (msg: LogMessage): HTMLElement => {
        const timestamp = el.div({
            class: this.base_classname + "_timestamp",
            text: msg.formatted_timestamp,
        });
        const contents = el.div({
            class: [
                this.base_classname + "_message",
                this.base_classname + "_message_" + msg.log_level.name,
            ].join(" "),
            text: msg.message_contents,
        });
        const container = el.div(
            { class: this.base_classname + "_message_container" },
            timestamp,
            contents,
        );
        return container;
    };

    protected should_show = (msg: LogMessage): boolean => {
        return msg.log_level.value >= this.store.log_level.val.value;
    };
}

export class QuestMessageLogView extends MessageLogView {
    constructor() {
        super({
            messages: list_property(),
            log_level: property({
                value: 1,
                name: "foo"
            })
        });
    }
}
