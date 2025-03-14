import { readFileSync } from "fs";
import { Endianness } from "../../core/data_formats/Endianness";
import { prs_decompress } from "../../core/data_formats/compression/prs/decompress";
import { ArrayBufferCursor } from "../../core/data_formats/cursor/ArrayBufferCursor";
import { BufferCursor } from "../../core/data_formats/cursor/BufferCursor";
import { parse_bin, write_bin } from "../../core/data_formats/parsing/quest/bin";
import { assemble } from "./assembly";
import { disassemble } from "./disassembly";
import {
    new_arg,
    new_instruction,
    Segment,
    segment_arrays_equal,
    SegmentType,
} from "./instructions";
import { OP_ARG_PUSHW, OP_RET, OP_SWITCH_JMP, OP_VA_CALL, OP_VA_END, OP_VA_START } from "./opcodes";

test("vararg instructions should be disassembled correctly", () => {
    const asm = disassemble([
        {
            type: SegmentType.Instructions,
            labels: [0],
            instructions: [
                new_instruction(OP_SWITCH_JMP, [
                    new_arg(90, 1),
                    new_arg(100, 2),
                    new_arg(101, 2),
                    new_arg(102, 2),
                ]),
                new_instruction(OP_RET, []),
            ],
            asm: { labels: [] },
        },
    ]);

    expect(asm).toEqual(
        `.code

0:
    switch_jmp r90, 100, 101, 102
    ret
`.split("\n"),
    );
});

// arg_push* instructions should always be output when in a va list whether manual stack management
// is on or off.
test("va list instructions should be disassembled correctly", () => {
    const ir: Segment[] = [
        {
            type: SegmentType.Instructions,
            labels: [0],
            instructions: [
                new_instruction(OP_VA_START, []),
                new_instruction(OP_ARG_PUSHW, [new_arg(1337, 2)]),
                new_instruction(OP_VA_CALL, [new_arg(100, 2)]),
                new_instruction(OP_VA_END, []),
                new_instruction(OP_RET, []),
            ],
            asm: { labels: [] },
        },
    ];

    for (const manual_stack of [true, false]) {
        const asm = disassemble(ir, manual_stack);

        expect(asm).toEqual(
            `.code

0:
    va_start
    arg_pushw 1337
    va_call 100
    va_end
    ret
`.split("\n"),
        );
    }
});

// Round-trip test.
test("assembling disassembled object code with manual stack management should result in the same IR", () => {
    const orig_buffer = readFileSync("test/resources/quest27_e.bin");
    const orig_bytes = prs_decompress(new BufferCursor(orig_buffer, Endianness.Little));
    const bin = parse_bin(orig_bytes);

    const { object_code, warnings, errors } = assemble(disassemble(bin.object_code, true), true);

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);

    expect(segment_arrays_equal(object_code, bin.object_code)).toBe(true);
});

// Round-trip test.
test("assembling disassembled object code with automatic stack management should result in the same IR", () => {
    const orig_buffer = readFileSync("test/resources/quest27_e.bin");
    const orig_bytes = prs_decompress(new BufferCursor(orig_buffer, Endianness.Little));
    const bin = parse_bin(orig_bytes);

    const { object_code, warnings, errors } = assemble(disassemble(bin.object_code, false), false);

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);

    expect(segment_arrays_equal(object_code, bin.object_code)).toBe(true);
});

// Round-trip test.
test("assembling disassembled object code with manual stack management should result in the same object code", () => {
    const orig_buffer = readFileSync("test/resources/quest27_e.bin");
    const orig_bytes = prs_decompress(new BufferCursor(orig_buffer, Endianness.Little));
    const bin = parse_bin(orig_bytes);

    const { object_code, warnings, errors } = assemble(disassemble(bin.object_code, true), true);

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);

    const test_bytes = new ArrayBufferCursor(write_bin({ ...bin, object_code }), Endianness.Little);

    orig_bytes.seek_start(0);
    expect(test_bytes.size).toBe(orig_bytes.size);

    let matching_bytes = 0;

    while (orig_bytes.bytes_left) {
        const test_byte = test_bytes.u8();
        const orig_byte = orig_bytes.u8();

        if (test_byte !== orig_byte) {
            throw new Error(
                `Byte ${matching_bytes} didn't match, expected ${orig_byte}, got ${test_byte}.`,
            );
        }

        matching_bytes++;
    }

    expect(matching_bytes).toBe(orig_bytes.size);
});

// Round-trip test.
test("disassembling assembled assembly code with automatic stack management should result the same assembly code", () => {
    const orig_buffer = readFileSync("test/resources/quest27_e.bin");
    const orig_bytes = prs_decompress(new BufferCursor(orig_buffer, Endianness.Little));
    const orig_asm = disassemble(parse_bin(orig_bytes).object_code, false);

    const { object_code, warnings, errors } = assemble(orig_asm, false);

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);

    const test_asm = disassemble(object_code);
    const len = Math.min(orig_asm.length, test_asm.length);

    for (let i = 0; i < len; i++) {
        expect(test_asm[i]).toBe(orig_asm[i]);
    }

    expect(test_asm.length).toBe(orig_asm.length);
});
