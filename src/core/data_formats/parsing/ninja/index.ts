import { Cursor } from "../../cursor/Cursor";
import { Vec3 } from "../../vector";
import { parse_iff } from "../iff";
import { NjcmModel, parse_njcm_model, write_njcm_model } from "./njcm";
import { parse_xj_model, XjModel } from "./xj";
import { WritableCursor } from "../../cursor/WritableCursor";
import { ResizableBufferCursor } from "../../cursor/ResizableBufferCursor";
import { ResizableBuffer } from "../../ResizableBuffer";

export const ANGLE_TO_RAD = (2 * Math.PI) / 0xffff;
export const RAD_TO_ANGLE = 0xffff / (2 * Math.PI);

const NJCM = 0x4d434a4e;

export type NjModel = NjcmModel | XjModel;

export function is_njcm_model(model: NjModel): model is NjcmModel {
    return model.type === "njcm";
}

export function is_xj_model(model: NjModel): model is XjModel {
    return model.type === "xj";
}

export class NjObject<M extends NjModel = NjModel> {
    readonly evaluation_flags: NjEvaluationFlags;
    readonly model: M | undefined;
    readonly position: Vec3;
    readonly rotation: Vec3; // Euler angles in radians.
    readonly scale: Vec3;
    readonly children: NjObject<M>[];

    private bone_cache = new Map<number, NjObject<M> | null>();
    private _bone_count = -1;

    constructor(
        evaluation_flags: NjEvaluationFlags,
        model: M | undefined,
        position: Vec3,
        rotation: Vec3, // Euler angles in radians.
        scale: Vec3,
        children: NjObject<M>[],
    ) {
        this.evaluation_flags = evaluation_flags;
        this.model = model;
        this.position = position;
        this.rotation = rotation;
        this.scale = scale;
        this.children = children;
    }

    bone_count(): number {
        if (this._bone_count === -1) {
            const id_ref: [number] = [0];
            this.get_bone_internal(this, Infinity, id_ref);
            this._bone_count = id_ref[0];
        }

        return this._bone_count;
    }

    get_bone(bone_id: number): NjObject<M> | undefined {
        let bone = this.bone_cache.get(bone_id);

        // Strict check because null means there's no bone with this id.
        if (bone === undefined) {
            bone = this.get_bone_internal(this, bone_id, [0]);
            this.bone_cache.set(bone_id, bone || null);
        }

        return bone || undefined;
    }

    private get_bone_internal(
        object: NjObject<M>,
        bone_id: number,
        id_ref: [number],
    ): NjObject<M> | undefined {
        if (!object.evaluation_flags.skip) {
            const id = id_ref[0]++;
            this.bone_cache.set(id, object);

            if (id === bone_id) {
                return object;
            }
        }

        if (!object.evaluation_flags.break_child_trace) {
            for (const child of object.children) {
                const bone = this.get_bone_internal(child, bone_id, id_ref);
                if (bone) return bone;
            }
        }
    }
}

export type NjEvaluationFlags = {
    no_translate: boolean;
    no_rotate: boolean;
    no_scale: boolean;
    hidden: boolean;
    break_child_trace: boolean;
    zxy_rotation_order: boolean;
    skip: boolean;
    shape_skip: boolean;
};

/**
 * Parses an NJCM file.
 */
export function parse_nj(cursor: Cursor): NjObject<NjcmModel>[] {
    return parse_ninja(cursor, parse_njcm_model, []);
}

export function write_nj(dst: ResizableBufferCursor, objects: NjObject<NjcmModel>[]): void {
    write_ninja(dst, objects, write_njcm_model, []);
}

/**
 * Parses an NJCM file.
 */
export function parse_xj(cursor: Cursor): NjObject<XjModel>[] {
    return parse_ninja(cursor, parse_xj_model, undefined);
}

/**
 * Parses a ninja object.
 */
export function parse_xj_object(cursor: Cursor): NjObject<XjModel>[] {
    return parse_sibling_objects(cursor, parse_xj_model, undefined);
}

function parse_ninja<M extends NjModel>(
    cursor: Cursor,
    parse_model: (cursor: Cursor, context: any) => M,
    context: any,
): NjObject<M>[] {
    // POF0 and other chunks types are ignored.
    const njcm_chunks = parse_iff(cursor).filter(chunk => chunk.type === NJCM);
    const objects: NjObject<M>[] = [];

    for (const chunk of njcm_chunks) {
        objects.push(...parse_sibling_objects(chunk.data, parse_model, context));
    }

    return objects;
}

function write_ninja<M extends NjModel>(
    dst: ResizableBufferCursor,
    objects: NjObject<M>[],
    parse_model: (dst: WritableCursor, model: M, context: any) => void,
    context: any,
): void {
    for (const obj of objects) {
        dst.write_u32(NJCM);

        const size_pos = dst.position;
        dst.write_u32(0);

        const chunk = new ResizableBufferCursor(new ResizableBuffer(0), dst.endianness);
        write_sibling_objects(chunk, obj, parse_model, context);

        const chunk_size = chunk.position;
        for (let i = 0; i < chunk_size; i++) {
            dst.write_u8(chunk.u8_at(i));
        }

        dst.write_u32_at(size_pos, chunk_size);
    }
}

// TODO: cache model and object offsets so we don't reparse the same data.
function parse_sibling_objects<M extends NjModel>(
    cursor: Cursor,
    parse_model: (cursor: Cursor, context: any) => M,
    context: any,
): NjObject<M>[] {
    const eval_flags = cursor.u32();
    const no_translate = (eval_flags & 0b1) !== 0;
    const no_rotate = (eval_flags & 0b10) !== 0;
    const no_scale = (eval_flags & 0b100) !== 0;
    const hidden = (eval_flags & 0b1000) !== 0;
    const break_child_trace = (eval_flags & 0b10000) !== 0;
    const zxy_rotation_order = (eval_flags & 0b100000) !== 0;
    const skip = (eval_flags & 0b1000000) !== 0;
    const shape_skip = (eval_flags & 0b10000000) !== 0;

    const model_offset = cursor.u32();
    const pos = cursor.vec3_f32();
    const rotation = {
        x: cursor.i32() * ANGLE_TO_RAD,
        y: cursor.i32() * ANGLE_TO_RAD,
        z: cursor.i32() * ANGLE_TO_RAD,
    };
    const scale = cursor.vec3_f32();
    const child_offset = cursor.u32();
    const sibling_offset = cursor.u32();

    let model: M | undefined;
    let children: NjObject<M>[];
    let siblings: NjObject<M>[];

    if (model_offset) {
        cursor.seek_start(model_offset);
        model = parse_model(cursor, context);
    }

    if (child_offset) {
        cursor.seek_start(child_offset);
        children = parse_sibling_objects(cursor, parse_model, context);
    } else {
        children = [];
    }

    if (sibling_offset) {
        cursor.seek_start(sibling_offset);
        siblings = parse_sibling_objects(cursor, parse_model, context);
    } else {
        siblings = [];
    }

    const object = new NjObject<M>(
        {
            no_translate,
            no_rotate,
            no_scale,
            hidden,
            break_child_trace,
            zxy_rotation_order,
            skip,
            shape_skip,
        },
        model,
        pos,
        rotation,
        scale,
        children,
    );

    return [object, ...siblings];
}

function write_sibling_objects<M extends NjModel>(
    dst: WritableCursor,
    object: NjObject<M>,
    write_model: (dst: WritableCursor, model: M, context: any) => void,
    context: any,
): void {
    let eval_flags = 0;
    {
        const flags = object.evaluation_flags;
        eval_flags ^= (-flags.no_translate ^ eval_flags) & (1 << 0);
        eval_flags ^= (-flags.no_rotate ^ eval_flags) & (1 << 1);
        eval_flags ^= (-flags.no_scale ^ eval_flags) & (1 << 2);
        eval_flags ^= (-flags.hidden ^ eval_flags) & (1 << 3);
        eval_flags ^= (-flags.break_child_trace ^ eval_flags) & (1 << 4);
        eval_flags ^= (-flags.zxy_rotation_order ^ eval_flags) & (1 << 5);
        eval_flags ^= (-flags.skip ^ eval_flags) & (1 << 6);
        eval_flags ^= (-flags.shape_skip ^ eval_flags) & (1 << 7);
    }
    dst.write_u32(eval_flags);

    const model_offset_pos = dst.position;
    dst.write_u32(0);

    dst.write_vec3_f32(object.position);

    dst.write_i32(object.rotation.x * RAD_TO_ANGLE);
    dst.write_i32(object.rotation.y * RAD_TO_ANGLE);
    dst.write_i32(object.rotation.z * RAD_TO_ANGLE);

    dst.write_vec3_f32(object.scale);

    const child_offset = dst.position;
    dst.write_u32(0);

    // sibling offset
    dst.write_u32(0);

    if (object.model) {
        dst.write_u32_at(model_offset_pos, dst.position);
        write_model(dst, object.model, context);
    }

    if (object.children.length > 0) {
        dst.write_u32_at(child_offset, dst.position);
        for (const child of object.children) {
            write_sibling_objects(dst, child, write_model, context);
        }
    }

    // FIXME:
    // i don't know how to handle siblings.
    // aren't they also children of the same parent?
}
