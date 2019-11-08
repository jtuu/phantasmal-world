import { ResizableWidget } from "../../core/gui/ResizableWidget";
import { el, bind_children_to } from "../../core/gui/dom";
import "./MessageLogView.css";
import { ListProperty, ListChangeType } from "../../core/observable/property/list/ListProperty";
import { Property } from "../../core/observable/property/Property";
import { quest_editor_store } from "../stores/QuestEditorStore";
import { DropDown } from "../../core/gui/DropDown";
import { ToolBar } from "../../core/gui/ToolBar";
import { WritableListProperty } from "../../core/observable/property/list/WritableListProperty";

export interface LogLevel {
    readonly name: string;
    readonly value: number;
}

export interface LogGroup {
    readonly name: string;
    readonly key: number;
}

export interface LogMessage {
    readonly formatted_timestamp: string;
    readonly message_contents: string;
    readonly log_level: LogLevel;
    readonly log_group: LogGroup;
}

export interface MessageLogStore {
    log_messages: ListProperty<LogMessage>;
    log_level: Property<LogLevel>;
    log_group: Property<LogGroup>;
    log_levels: readonly LogLevel[];
    log_groups: ListProperty<LogGroup>;

    set_log_level(level: LogLevel): void;
    set_log_group(group: LogGroup): void;
}

export abstract class MessageLogView extends ResizableWidget {
    readonly element = el.div({ class: "MessageLogView", tab_index: -1 });
    protected base_classname = this.element.className;

    // container gets a scrollbar
    protected list_container = el.div({class: this.base_classname + "_list_container"});
    protected list_element = el.div({ class: this.base_classname + "_message_list" });

    protected level_filter = new DropDown("Level", this.store.log_levels, l => l.name, {
        class: this.base_classname + "_level_filter",
    });
    protected group_filter = new DropDown("Group", this.store.log_groups, g => g.name, {
        class: this.base_classname + "_group_filter",
    });
    protected settings_bar = new ToolBar({
        class: this.base_classname + "_settings",
        children: [this.level_filter, this.group_filter],
    });

    protected was_scrolled_to_bottom = true;

    constructor(protected store: MessageLogStore) {
        super();

        this.disposables(
            // before update, save scroll state
            this.store.log_messages.observe_list(() => {
                this.was_scrolled_to_bottom = this.is_scrolled_to_bottom();
            }),

            // do update
            bind_children_to(
                this.list_element,
                this.store.log_messages,
                this.create_message_element,
            ),

            // after update, scroll if was scrolled
            this.store.log_messages.observe_list(() => {
                if (this.was_scrolled_to_bottom) {
                    this.scroll_to_bottom();
                }
            }),

            this.level_filter.chosen.observe(({ value }) => this.store.set_log_level(value)),

            this.group_filter.chosen.observe(({ value }) => this.store.set_log_group(value)),
        );

        this.list_container.appendChild(this.list_element);
        this.element.appendChild(this.settings_bar.element);
        this.element.appendChild(this.list_container);

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
            this.list_container.scrollTop >=
            this.list_container.scrollHeight - this.list_container.offsetHeight - this.get_autoscroll_treshold()
        );
    }

    protected scroll_to_bottom(): void {
        this.list_container.scrollTo({
            top: this.list_container.scrollHeight,
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
        return el.div(
            {
                class: [
                    this.base_classname + "_message",
                    this.base_classname + "_" + msg.log_level.name + "_message",
                ].join(" "),
            },
            el.div({
                class: this.base_classname + "_message_timestamp",
                text: msg.formatted_timestamp,
            }),
            el.div({
                class: this.base_classname + "_message_group",
                text: "[" + msg.log_group.name + "]",
            }),
            el.div({
                class: this.base_classname + "_message_level",
                text: "[" + msg.log_level.name + "]",
            }),
            el.div({
                class: this.base_classname + "_message_contents",
                text: msg.message_contents,
            }),
        );
    };
}

export class QuestMessageLogView extends MessageLogView {
    constructor() {
        super(quest_editor_store);
    }
}
