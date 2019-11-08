import { ExecutionResult, VirtualMachine } from "./scripting/vm";
import { QuestModel } from "./model/QuestModel";
import { VirtualMachineIO } from "./scripting/vm/io";
import { AsmToken } from "./scripting/instructions";
import { quest_editor_store } from "./stores/QuestEditorStore";

const logger = quest_editor_store.get_logger("quest_editor/QuestRunner");

function srcloc_to_string(srcloc: AsmToken): string {
    return `[${srcloc.line_no}:${srcloc.col}]`;
}

export class QuestRunner {
    private readonly vm: VirtualMachine;
    private animation_frame?: number;

    constructor() {
        this.vm = new VirtualMachine(this.create_vm_io());
    }

    run(quest: QuestModel): void {
        if (this.animation_frame != undefined) {
            cancelAnimationFrame(this.animation_frame);
        }

        this.vm.load_object_code(quest.object_code);
        this.vm.start_thread(0);

        this.animation_frame = requestAnimationFrame(this.execution_loop);
    }

    private execution_loop = (): void => {
        this.vm.vsync();

        let result: ExecutionResult;

        do {
            result = this.vm.execute();
        } while (result == ExecutionResult.Ok);

        if (result === ExecutionResult.WaitingVsync) {
            this.animation_frame = requestAnimationFrame(this.execution_loop);
        }
    };

    private create_vm_io = (): VirtualMachineIO => {
        return {
            async advance_msg(): Promise<any> {
                throw new Error("Not implemented.");
            },

            window_msg: (msg: string): void => {
                logger.info(`window_msg "${msg}"`);
            },

            message: (msg: string): void => {
                logger.info(`message "${msg}"`);
            },

            add_msg: (msg: string): void => {
                logger.info(`add_msg "${msg}"`);
            },

            winend: (): void => {},

            mesend: (): void => {},

            warning: (msg: string, srcloc?: AsmToken): void => {
                logger.warning(msg, srcloc && srcloc_to_string(srcloc));
            },

            error: (err: Error, srcloc?: AsmToken): void => {
                logger.error(err, srcloc && srcloc_to_string(srcloc));
            },
        };
    };
}
