import { ExecutionResult, VirtualMachine, ExecutionLocation } from "./scripting/vm";
import { QuestModel } from "./model/QuestModel";
import { VirtualMachineIO } from "./scripting/vm/io";
import { AsmToken, SegmentType, InstructionSegment, Segment, Instruction } from "./scripting/instructions";
import { quest_editor_store } from "./stores/QuestEditorStore";
import { asm_editor_store } from "./stores/AsmEditorStore";
import { defined, assert } from "../core/util";
import {
    OP_CALL,
    OP_VA_CALL,
    OP_SWITCH_CALL,
} from "./scripting/opcodes";

const logger = quest_editor_store.get_logger("quest_editor/QuestRunner");

function srcloc_to_string(srcloc: AsmToken): string {
    return `[${srcloc.line_no}:${srcloc.col}]`;
}

function execloc_to_string(execloc: ExecutionLocation) {
    return `[${execloc.seg_idx}:${execloc.inst_idx}]`;
}

export class QuestRunner {
    private readonly vm: VirtualMachine;
    private quest?: QuestModel;
    private animation_frame?: number;
    /**
     * Invisible breakpoints that help with stepping over/in/out.
     */
    private readonly stepping_breakpoints: number[] = [];
    private break_on_next = false;

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
        const execloc = this.vm.get_current_execution_location();

        defined(this.quest);

        const src_segment = this.get_instruction_segment_by_index(execloc.seg_idx);
        const cur_instr = src_segment.instructions[execloc.inst_idx];
        const dst_label = this.get_step_innable_instruction_label_argument(cur_instr);

        // nothing to step over, just break on next instruction
        if (dst_label === undefined) {
            this.break_on_next = true;
        }
        // set a breakpoint on the next line
        else {
            const next_execloc = new ExecutionLocation(execloc.seg_idx, execloc.inst_idx + 1);

            // next line is in the next segment
            if (next_execloc.inst_idx >= src_segment.instructions.length) {
                next_execloc.seg_idx++;
                next_execloc.inst_idx = 0;
            }

            const dst_segment = this.get_instruction_segment_by_index(next_execloc.seg_idx);
            const dst_instr = dst_segment.instructions[next_execloc.inst_idx];
            if (dst_instr.asm && dst_instr.asm.mnemonic) {
                this.stepping_breakpoints.push(dst_instr.asm.mnemonic.line_no);
            }
        }
    }

    public step_in(): void {
        const execloc = this.vm.get_current_execution_location();
        const src_segment = this.get_instruction_segment_by_index(execloc.seg_idx);
        const cur_instr = src_segment.instructions[execloc.inst_idx];
        const dst_label = this.get_step_innable_instruction_label_argument(cur_instr);

        // not a step-innable instruction, behave like step-over
        if (dst_label === undefined) {
            this.step_over();
        }
        // can step-in
        else {
            const dst_segment = this.get_instruction_segment_by_label(dst_label);
            const dst_instr = dst_segment.instructions[0];
            
            if (dst_instr.asm && dst_instr.asm.mnemonic) {
                this.stepping_breakpoints.push(dst_instr.asm.mnemonic.line_no);
            }
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
            if (srcloc) {
                const hit_breakpoint =
                    this.break_on_next ||
                    asm_editor_store.breakpoints.val.includes(srcloc.line_no) ||
                    this.stepping_breakpoints.includes(srcloc.line_no);
                if (hit_breakpoint) {
                    this.stepping_breakpoints.length = 0;
                    asm_editor_store.set_execution_location(srcloc.line_no);
                    break exec_loop;
                }
            }

            this.break_on_next = false;

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

    private get_instruction_segment_by_index(index: number): InstructionSegment {
        defined(this.quest);

        const segment = this.quest.object_code[index];

        assert(
            segment.type === SegmentType.Instructions,
            `Expected segment ${index} to be of type ${
                SegmentType[SegmentType.Instructions]
            }, but was ${SegmentType[segment.type]}.`,
        );

        return segment;
    }

    private get_instruction_segment_by_label(label: number): InstructionSegment {
        const seg_idx = this.vm.get_segment_index_by_label(label);
        return this.get_instruction_segment_by_index(seg_idx);
    }

    private get_step_innable_instruction_label_argument(instr: Instruction): number | undefined {
        switch (instr.opcode.code) {
            case OP_VA_CALL.code:
            case OP_CALL.code:
                return instr.args[0].value;
            case OP_SWITCH_CALL.code:
                return instr.args[1].value;
        }
    }
}
