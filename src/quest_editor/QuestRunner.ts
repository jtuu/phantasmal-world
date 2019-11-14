import { ExecutionResult, VirtualMachine, ExecutionLocation } from "./scripting/vm";
import { QuestModel } from "./model/QuestModel";
import { VirtualMachineIO } from "./scripting/vm/io";
import { AsmToken, SegmentType, InstructionSegment, Segment } from "./scripting/instructions";
import { quest_editor_store } from "./stores/QuestEditorStore";
import { asm_editor_store } from "./stores/AsmEditorStore";
import { defined } from "../core/util";
import {
    OP_CALL,
    OP_JMP,
    OP_JMP_E,
    OP_JMPI_E,
    OP_JMP_ON,
    OP_JMP_OFF,
    OP_JMP_NE,
    OP_JMPI_NE,
    OP_UJMP_G,
    OP_UJMPI_G,
    OP_JMP_G,
    OP_JMPI_G,
    OP_UJMP_L,
    OP_UJMPI_L,
    OP_JMP_L,
    OP_JMPI_L,
    OP_UJMP_GE,
    OP_UJMPI_GE,
    OP_JMP_GE,
    OP_JMPI_GE,
    OP_UJMP_LE,
    OP_UJMPI_LE,
    OP_JMP_LE,
    OP_JMPI_LE,
} from "./scripting/opcodes";

const logger = quest_editor_store.get_logger("quest_editor/QuestRunner");

function srcloc_to_string(srcloc: AsmToken): string {
    return `[${srcloc.line_no}:${srcloc.col}]`;
}

function execloc_to_string(execloc: ExecutionLocation) {
    return `[${execloc.seg_idx}:${execloc.inst_idx}]`;
}

function assert_instruction_segment(segment: Segment): asserts segment is InstructionSegment {
    if (segment.type !== SegmentType.Instructions) {
        throw new Error(
            `Assertion Error: Segment type was ${SegmentType[segment.type]}, ` +
                `expected ${SegmentType[SegmentType.Instructions]}.`
        );
    }
}

export class QuestRunner {
    private readonly vm: VirtualMachine;
    private quest?: QuestModel;
    private animation_frame?: number;
    /**
     * Invisible breakpoints that help with stepping over/in/out.
     */
    private readonly stepping_breakpoints: number[] = [];

    constructor() {
        this.vm = new VirtualMachine(this.create_vm_io());
    }

    run(quest: QuestModel): void {
        if (this.animation_frame != undefined) {
            cancelAnimationFrame(this.animation_frame);
        }

        this.quest = quest;

        this.vm.load_object_code(quest.object_code);
        this.vm.start_thread(0);

        this.schedule_frame();
    }

    public resume(): void {
        this.schedule_frame();
    }

    public step_over(): void {

    }

    public step_in(): void {
        const execloc = this.vm.get_current_execution_location();

        defined(this.quest);

        const segment = this.quest.object_code[execloc.seg_idx];

        assert_instruction_segment(segment);

        const cur_inst = segment.instructions[execloc.inst_idx];

        let dst_label: number | undefined = undefined;

        // check if is instruction that can be stepped-in
        switch (cur_inst.opcode.code) {
            // label is the first argument
            case OP_CALL.code:
            case OP_JMP.code:
            case OP_JMP_ON.code:
            case OP_JMP_OFF.code:
                dst_label = cur_inst.args[0].value;
                break;
            // label is third argument
            case OP_JMP_E.code:
            case OP_JMPI_E.code:
            case OP_JMP_NE.code:
            case OP_JMPI_NE.code:
            case OP_UJMP_G.code:
            case OP_UJMPI_G.code:
            case OP_JMP_G.code:
            case OP_JMPI_G.code:
            case OP_UJMP_L.code:
            case OP_UJMPI_L.code:
            case OP_JMP_L.code:
            case OP_JMPI_L.code:
            case OP_UJMP_GE.code:
            case OP_UJMPI_GE.code:
            case OP_JMP_GE.code:
            case OP_JMPI_GE.code:
            case OP_UJMP_LE.code:
            case OP_UJMPI_LE.code:
            case OP_JMP_LE.code:
            case OP_JMPI_LE.code:
                dst_label = cur_inst.args[2].value;
                break;
            default:
                break;
        }

        // not a step-innable instruction, behave like step-over
        if (dst_label === undefined) {
            this.step_over();
        }
        // can step-in
        else {
            const dst_segment = this.quest.object_code[dst_label];
            assert_segment_type(dst_segment.type, SegmentType.Instructions);
        }
    }

    private schedule_frame(): void {
        this.animation_frame = requestAnimationFrame(this.execution_loop);
    }

    private execution_loop = (): void => {
        let result: ExecutionResult;

        exec_loop: while (true) {
            result = this.vm.execute();

            const srcloc = this.vm.get_current_source_location();
            if (srcloc && asm_editor_store.breakpoints.val.includes(srcloc.line_no)) {
                asm_editor_store.set_execution_location(srcloc.line_no);
                break exec_loop;
            }

            switch (result) {
                case ExecutionResult.WaitingVsync:
                    this.vm.vsync();
                    this.schedule_frame();
                    break;
                case ExecutionResult.WaitingInput:
                    // TODO: implement input from gui
                    this.schedule_frame();
                    break;
                case ExecutionResult.WaitingSelection:
                    // TODO: implement input from gui
                    this.vm.list_select(0);
                    this.schedule_frame();
                    break;
                case ExecutionResult.Halted:
                    asm_editor_store.unset_execution_location();
                    break exec_loop;
            }
        }
    };

    private create_vm_io = (): VirtualMachineIO => {
        return {
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

            list: (list_items: string[]): void => {
                logger.info(`list "[${list_items}]"`);
            },

            warning: (msg: string, srcloc?: AsmToken): void => {
                logger.warning(msg, srcloc && srcloc_to_string(srcloc));
            },

            error: (err: Error, srcloc?: AsmToken): void => {
                logger.error(err, srcloc && srcloc_to_string(srcloc));
            },
        };
    };
}
