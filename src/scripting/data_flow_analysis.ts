import {
    InstructionSegment,
    Opcode,
    Segment,
    SegmentType,
    Instruction,
} from "../data_formats/parsing/quest/bin";
import { ValueSet } from "./ValueSet";

export enum BranchType {
    None,
    Return,
    Jump,
    ConditionalJump,
    Call,
}

export class BasicBlock {
    readonly from: BasicBlock[] = [];
    readonly to: BasicBlock[] = [];

    constructor(
        readonly segment: InstructionSegment,
        readonly start: number,
        readonly end: number,
        readonly branch_type: BranchType,
        /**
         * Either jumps or calls, depending on `branch_type`.
         */
        readonly branch_labels: number[]
    ) {}

    link_to(other: BasicBlock): void {
        this.to.push(other);
        other.from.push(this);
    }
}

export class ControlFlowGraph {
    readonly blocks: BasicBlock[] = [];
    readonly instructions: Map<Instruction, BasicBlock> = new Map();
}

export function create_control_flow_graph(segments: InstructionSegment[]): ControlFlowGraph {
    const cfg = new ControlFlowGraph();
    // Mapping of labels to basic blocks.
    const label_blocks = new Map<number, BasicBlock>();

    for (const segment of segments) {
        create_basic_blocks(cfg, label_blocks, segment);
    }

    link_blocks(cfg, label_blocks);
    return cfg;
}

/**
 * Computes the possible values of a register at a specific instruction.
 */
export function register_value_set(
    cfg: ControlFlowGraph,
    instruction: Instruction,
    register: number
): ValueSet {
    const block = cfg.instructions.get(instruction);

    if (block) {
        let inst_idx = block.start;

        while (inst_idx < block.end) {
            if (block.segment.instructions[inst_idx] === instruction) {
                break;
            }

            inst_idx++;
        }

        return find_value_set(block, inst_idx, register);
    } else {
        return new ValueSet();
    }
}

function find_value_set(block: BasicBlock, end: number, register: number): ValueSet {
    let values = new ValueSet();

    for (let i = block.start; i < end; i++) {
        const instruction = block.segment.instructions[i];
        const args = instruction.args;

        switch (instruction.opcode) {
            case Opcode.let:
                if (args[0].value === register) {
                    values = find_value_set(block, i, args[1].value);
                }
                break;
            case Opcode.leti:
            case Opcode.letb:
            case Opcode.letw:
            case Opcode.leto:
                if (args[0].value === register) {
                    values.set_value(args[1].value);
                }
                break;
        }
    }

    if (values.size() === 0) {
        for (const from of block.from) {
            values.union(find_value_set(from, from.end, register));
        }
    }

    return values;
}

function create_basic_blocks(
    cfg: ControlFlowGraph,
    label_blocks: Map<number, BasicBlock>,
    segment: InstructionSegment
) {
    const len = segment.instructions.length;
    let start = 0;
    let first_block = true;

    for (let i = 0; i < len; i++) {
        const inst = segment.instructions[i];

        let branch_type: BranchType;
        let branch_labels: number[];

        switch (inst.opcode) {
            // Return.
            case Opcode.ret:
                branch_type = BranchType.Return;
                branch_labels = [];
                break;

            // Unconditional jump.
            case Opcode.jmp:
                branch_type = BranchType.Jump;
                branch_labels = [inst.args[0].value];
                break;

            // Conditional jumps.
            case Opcode.jmp_on:
            case Opcode.jmp_off:
                branch_type = BranchType.ConditionalJump;
                branch_labels = [inst.args[0].value];
                break;
            case Opcode.jmp_e:
            case Opcode.jmpi_e:
            case Opcode.jmp_ne:
            case Opcode.jmpi_ne:
            case Opcode.ujmp_g:
            case Opcode.ujmpi_g:
            case Opcode.jmp_g:
            case Opcode.jmpi_g:
            case Opcode.ujmp_l:
            case Opcode.ujmpi_l:
            case Opcode.jmp_l:
            case Opcode.jmpi_l:
            case Opcode.ujmp_ge:
            case Opcode.ujmpi_ge:
            case Opcode.jmp_ge:
            case Opcode.jmpi_ge:
            case Opcode.ujmp_le:
            case Opcode.ujmpi_le:
            case Opcode.jmp_le:
            case Opcode.jmpi_le:
                branch_type = BranchType.ConditionalJump;
                branch_labels = [inst.args[2].value];
                break;
            case Opcode.switch_jmp:
                branch_type = BranchType.ConditionalJump;
                branch_labels = inst.args.slice(1).map(a => a.value);
                break;

            // Calls.
            case Opcode.call:
                branch_type = BranchType.Call;
                branch_labels = [inst.args[0].value];
                break;
            case Opcode.va_call:
                branch_type = BranchType.Call;
                branch_labels = [inst.args[0].value];
                break;
            case Opcode.switch_call:
                branch_type = BranchType.Call;
                branch_labels = inst.args.slice(1).map(a => a.value);
                break;

            // All other opcodes.
            default:
                if (i === len - 1) {
                    branch_type = BranchType.None;
                    branch_labels = [];
                    break;
                } else {
                    continue;
                }
        }

        const block = new BasicBlock(segment, start, i + 1, branch_type, branch_labels);

        for (let j = block.start; j < block.end; j++) {
            cfg.instructions.set(block.segment.instructions[j], block);
        }

        cfg.blocks.push(block);

        if (first_block) {
            for (const label of segment.labels) {
                label_blocks.set(label, block);
            }

            first_block = false;
        }

        start = i + 1;
    }
}

function link_blocks(cfg: ControlFlowGraph, label_blocks: Map<number, BasicBlock>): void {
    // Pairs of calling block and block to which callees should return to.
    const callers: [BasicBlock, BasicBlock][] = [];

    for (let i = 0; i < cfg.blocks.length; i++) {
        const block = cfg.blocks[i];
        const next_block = cfg.blocks[i + 1];

        switch (block.branch_type) {
            case BranchType.Return:
                continue;
            case BranchType.Call:
                if (next_block) {
                    callers.push([block, next_block]);
                }
                break;
            case BranchType.None:
            case BranchType.ConditionalJump:
                if (next_block) {
                    block.link_to(next_block);
                }
                break;
        }

        for (const label of block.branch_labels) {
            const to_block = label_blocks.get(label);

            if (to_block) {
                block.link_to(to_block);
            }
        }
    }

    for (const [caller, ret] of callers) {
        link_returning_blocks(label_blocks, ret, caller);
    }
}

/**
 * Links returning blocks to their callers.
 */
function link_returning_blocks(
    label_blocks: Map<number, BasicBlock>,
    ret: BasicBlock,
    block: BasicBlock
): void {
    for (const label of block.branch_labels) {
        const sub_block = label_blocks.get(label);

        if (sub_block) {
            if (sub_block.branch_type === BranchType.Return) {
                sub_block.link_to(ret);
            }

            link_returning_blocks(label_blocks, ret, sub_block);
        }
    }
}

/////////////////
//    Crap:    //
/////////////////

class DfState {
    private registers: DataView;

    constructor(other?: DfState) {
        if (other) {
            this.registers = new DataView(other.registers.buffer.slice(0));
        } else {
            this.registers = new DataView(new ArrayBuffer(2 * 4 * 256));
        }
    }

    get_min(register: number): number {
        return this.registers.getInt32(2 * register);
    }

    get_max(register: number): number {
        return this.registers.getInt32(2 * register + 1);
    }

    set(register: number, min: number, max: number): void {
        this.registers.setInt32(2 * register, min);
        this.registers.setInt32(2 * register + 1, max);
    }

    // getf(register: number): number {
    //     return this.registers.getFloat32(2 * register);
    // }

    // setf(register: number, value: number): void {
    //     this.registers.setFloat32(2 * register, value);
    //     this.registers.setFloat32(2 * register + 1, value);
    // }
}

/**
 * @param segments mapping of labels to segments.
 */
function data_flow(
    label_holder: any,
    segments: Map<number, Segment>,
    entry_label: number,
    entry_state: DfState
): void {
    const segment = segments.get(entry_label);
    if (!segment || segment.type !== SegmentType.Instructions) return;

    let out_states: DfState[] = [new DfState(entry_state)];

    for (const instruction of segment.instructions) {
        const args = instruction.args;

        for (const state of out_states) {
            switch (instruction.opcode) {
                case Opcode.let:
                case Opcode.flet:
                    state.set(
                        args[0].value,
                        state.get_min(args[1].value),
                        state.get_max(args[1].value)
                    );
                    break;
                case Opcode.leti:
                case Opcode.letb:
                case Opcode.letw:
                case Opcode.leta:
                case Opcode.sync_leti:
                case Opcode.sync_register:
                    state.set(args[0].value, args[1].value, args[1].value);
                    break;
                case Opcode.leto:
                    {
                        const info = label_holder.get_info(args[1].value);
                        state.set(args[0].value, info ? info.offset : 0, info ? info.offset : 0);
                    }
                    break;
                case Opcode.set:
                    state.set(args[0].value, 1, 1);
                    break;
                case Opcode.clear:
                    state.set(args[0].value, 0, 0);
                    break;
                case Opcode.leti:
                case Opcode.letb:
                case Opcode.letw:
                case Opcode.leta:
                case Opcode.sync_leti:
                case Opcode.sync_register:
                    state.set(args[0].value, args[1].value, args[1].value);
                    break;
                // case Opcode.fleti:
                //     state.setf(args[0].value, args[1].value);
                //     break;
                case Opcode.rev:
                    {
                        const reg = args[0].value;
                        const max = state.get_min(reg) <= 0 && state.get_max(reg) >= 0 ? 1 : 0;
                        const min = state.get_min(reg) === 0 && state.get_max(reg) === 0 ? 1 : 0;
                        state.set(reg, min, max);
                    }
                    break;
                // case Opcode.add:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) + state.get_min(args[1].value));
                //     }
                //     break;
                // case Opcode.addi:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) + args[1].value);
                //     }
                //     break;
                // case Opcode.sub:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) - state.get_min(args[1].value));
                //     }
                //     break;
                // case Opcode.subi:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) - args[1].value);
                //     }
                //     break;
                // case Opcode.mul:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) * state.get_min(args[1].value));
                //     }
                //     break;
                // case Opcode.muli:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) * args[1].value);
                //     }
                //     break;
                // case Opcode.div:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) / state.get_min(args[1].value));
                //     }
                //     break;
                // case Opcode.divi:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) / args[1].value);
                //     }
                //     break;
                // case Opcode.and:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) & state.get_min(args[1].value));
                //     }
                //     break;
                // case Opcode.andi:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) & args[1].value);
                //     }
                //     break;
                // case Opcode.or:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) | state.get_min(args[1].value));
                //     }
                //     break;
                // case Opcode.ori:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) | args[1].value);
                //     }
                //     break;
                // case Opcode.xor:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) ^ state.get_min(args[1].value));
                //     }
                //     break;
                // case Opcode.xori:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) ^ args[1].value);
                //     }
                //     break;
                // case Opcode.mod:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) % state.get_min(args[1].value));
                //     }
                //     break;
                // case Opcode.modi:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) % args[1].value);
                //     }
                //     break;
                // case Opcode.shift_left:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) << state.get_min(args[1].value));
                //     }
                //     break;
                // case Opcode.shift_right:
                //     {
                //         const reg = args[0].value;
                //         state.set(reg, state.get_min(reg) >> state.get_min(args[1].value));
                //     }
                //     break;
                // case Opcode.fadd:
                //     {
                //         const reg = args[0].value;
                //         state.setf(reg, state.getf(reg) + state.getf(args[1].value));
                //     }
                //     break;
                // case Opcode.faddi:
                //     {
                //         const reg = args[0].value;
                //         state.setf(reg, state.getf(reg) + args[1].value);
                //     }
                //     break;
                // case Opcode.fsub:
                //     {
                //         const reg = args[0].value;
                //         state.setf(reg, state.getf(reg) - state.getf(args[1].value));
                //     }
                //     break;
                // case Opcode.fsubi:
                //     {
                //         const reg = args[0].value;
                //         state.setf(reg, state.getf(reg) - args[1].value);
                //     }
                //     break;
                // case Opcode.fmul:
                //     {
                //         const reg = args[0].value;
                //         state.setf(reg, state.getf(reg) * state.getf(args[1].value));
                //     }
                //     break;
                // case Opcode.fmuli:
                //     {
                //         const reg = args[0].value;
                //         state.setf(reg, state.getf(reg) * args[1].value);
                //     }
                //     break;
                // case Opcode.fdiv:
                //     {
                //         const reg = args[0].value;
                //         state.setf(reg, state.getf(reg) / state.getf(args[1].value));
                //     }
                //     break;
                // case Opcode.fdivi:
                //     {
                //         const reg = args[0].value;
                //         state.setf(reg, state.getf(reg) / args[1].value);
                //     }
                //     break;
            }
        }
    }
}
