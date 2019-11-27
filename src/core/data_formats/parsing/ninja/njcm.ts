import Logger from "js-logger";
import { Cursor } from "../../cursor/Cursor";
import { Vec2, Vec3 } from "../../vector";
import { assert } from "../../../util";
import { WritableCursor } from "../../cursor/WritableCursor";

const logger = Logger.get("core/data_formats/parsing/ninja/njcm");

// TODO:
// - colors
// - bump maps

export type NjcmModel = {
    type: "njcm";
    /**
     * Sparse array of vertices.
     */
    vertices: NjcmVertex[];
    meshes: NjcmTriangleStrip[];
    collision_sphere_center: Vec3;
    collision_sphere_radius: number;
};

export type NjcmVertex = {
    index: number;
    position: Vec3;
    normal?: Vec3;
    bone_weight: number;
    bone_weight_status: number;
    calc_continue: boolean;
    chunk_type_id: number;
};

enum NjcmChunkType {
    Unknown,
    Null,
    Bits,
    CachePolygonList,
    DrawPolygonList,
    Tiny,
    Material,
    Vertex,
    Volume,
    Strip,
    End,
}

type NjcmChunkBase = {
    type: NjcmChunkType;
    type_id: number;
};

type NjcmChunk =
    | NjcmUnknownChunk
    | NjcmNullChunk
    | NjcmBitsChunk
    | NjcmCachePolygonListChunk
    | NjcmDrawPolygonListChunk
    | NjcmTinyChunk
    | NjcmMaterialChunk
    | NjcmVertexChunk
    | NjcmVolumeChunk
    | NjcmStripChunk
    | NjcmEndChunk;

type NjcmUnknownChunk = NjcmChunkBase & {
    type: NjcmChunkType.Unknown;
};

type NjcmNullChunk = NjcmChunkBase & {
    type: NjcmChunkType.Null;
};

type NjcmBitsChunk = NjcmChunkBase & {
    type: NjcmChunkType.Bits;
};

type NjcmCachePolygonListChunk = NjcmChunkBase & {
    type: NjcmChunkType.CachePolygonList;
    cache_index: number;
    offset: number;
};

type NjcmDrawPolygonListChunk = NjcmChunkBase & {
    type: NjcmChunkType.DrawPolygonList;
    cache_index: number;
};

type NjcmTinyChunk = NjcmChunkBase & {
    type: NjcmChunkType.Tiny;
    flip_u: boolean;
    flip_v: boolean;
    clamp_u: boolean;
    clamp_v: boolean;
    mipmap_d_adjust: number;
    filter_mode: number;
    super_sample: boolean;
    texture_id: number;
};

type NjcmMaterialChunk = NjcmChunkBase & {
    type: NjcmChunkType.Material;
};

type NjcmVertexChunk = NjcmChunkBase & {
    type: NjcmChunkType.Vertex;
    vertices: NjcmVertex[];
};

type NjcmVolumeChunk = NjcmChunkBase & {
    type: NjcmChunkType.Volume;
};

type NjcmStripChunk = NjcmChunkBase & {
    type: NjcmChunkType.Strip;
    triangle_strips: NjcmTriangleStrip[];
};

type NjcmEndChunk = NjcmChunkBase & {
    type: NjcmChunkType.End;
};

type NjcmTriangleStrip = {
    ignore_light: boolean;
    ignore_specular: boolean;
    ignore_ambient: boolean;
    use_alpha: boolean;
    double_side: boolean;
    flat_shading: boolean;
    environment_mapping: boolean;
    clockwise_winding: boolean;
    has_tex_coords: boolean;
    has_normal: boolean;
    texture_id?: number;
    vertices: NjcmMeshVertex[];
    chunk_type_id: number;
};

type NjcmMeshVertex = {
    index: number;
    normal?: Vec3;
    tex_coords?: Vec2;
};

export function parse_njcm_model(cursor: Cursor, cached_chunk_offsets: number[]): NjcmModel {
    const vlist_offset = cursor.u32(); // Vertex list
    const plist_offset = cursor.u32(); // Triangle strip index list
    const bounding_sphere_center = cursor.vec3_f32();
    const bounding_sphere_radius = cursor.f32();
    const vertices: NjcmVertex[] = [];
    const meshes: NjcmTriangleStrip[] = [];

    if (vlist_offset) {
        cursor.seek_start(vlist_offset);

        for (const chunk of parse_chunks(cursor, cached_chunk_offsets, true)) {
            if (chunk.type === NjcmChunkType.Vertex) {
                for (const vertex of chunk.vertices) {
                    vertices[vertex.index] = {
                        index: vertex.index,
                        position: vertex.position,
                        normal: vertex.normal,
                        bone_weight: vertex.bone_weight,
                        bone_weight_status: vertex.bone_weight_status,
                        calc_continue: vertex.calc_continue,
                        chunk_type_id: vertex.chunk_type_id,
                    };
                }
            }
        }
    }

    if (plist_offset) {
        cursor.seek_start(plist_offset);

        let texture_id: number | undefined = undefined;

        for (const chunk of parse_chunks(cursor, cached_chunk_offsets, false)) {
            if (chunk.type === NjcmChunkType.Tiny) {
                texture_id = chunk.texture_id;
            } else if (chunk.type === NjcmChunkType.Strip) {
                for (const strip of chunk.triangle_strips) {
                    strip.texture_id = texture_id;
                }

                meshes.push(...chunk.triangle_strips);
            }
        }
    }

    return {
        type: "njcm",
        vertices,
        meshes,
        collision_sphere_center: bounding_sphere_center,
        collision_sphere_radius: bounding_sphere_radius,
    };
}

export function write_njcm_model(
    dst: WritableCursor,
    model: NjcmModel,
    cached_chunk_offsets: number[],
): void {
    const vlist_offset_pos = dst.position;
    dst.write_u32(0);
    const plist_offset_pos = dst.position;
    dst.write_u32(0);

    dst.write_vec3_f32(model.collision_sphere_center);
    dst.write_f32(model.collision_sphere_radius);

    if (model.vertices.length > 0) {
        dst.write_u32_at(vlist_offset_pos, dst.position);

        const grouped_verts: Record<number, NjcmVertex[]> = {};
        for (const vert of model.vertices) {
            if (!vert) continue;
            if (grouped_verts[vert.chunk_type_id] === undefined) {
                grouped_verts[vert.chunk_type_id] = [];
            }

            grouped_verts[vert.chunk_type_id].push(vert);
        }
        write_chunks(
            dst,
            Object.entries(grouped_verts).map(([type_id, verts]) => ({
                type: NjcmChunkType.Vertex,
                type_id: Number(type_id),
                vertices: verts,
            })),
            cached_chunk_offsets,
            true,
        );
    }

    if (model.meshes.length > 0) {
        dst.write_u32_at(plist_offset_pos, dst.position);

        const grouped_strips: Record<number, NjcmTriangleStrip[]> = {};
        for (const strip of model.meshes) {
            if (grouped_strips[strip.chunk_type_id] === undefined) {
                grouped_strips[strip.chunk_type_id] = [];
            }

            grouped_strips[strip.chunk_type_id].push(strip);
        }
        write_chunks(
            dst,
            Object.entries(grouped_strips).map(([type_id, strips]) => ({
                type: NjcmChunkType.Strip,
                type_id: Number(type_id),
                triangle_strips: strips,
            })),
            cached_chunk_offsets,
            false,
        );
    }
}

// TODO: don't reparse when DrawPolygonList chunk is encountered.
function parse_chunks(
    cursor: Cursor,
    cached_chunk_offsets: number[],
    wide_end_chunks: boolean,
): NjcmChunk[] {
    const chunks: NjcmChunk[] = [];
    let loop = true;

    while (loop) {
        const type_id = cursor.u8();
        const flags = cursor.u8();
        const chunk_start_position = cursor.position;
        let size = 0;

        if (type_id === 0) {
            chunks.push({
                type: NjcmChunkType.Null,
                type_id,
            });
        } else if (1 <= type_id && type_id <= 3) {
            chunks.push({
                type: NjcmChunkType.Bits,
                type_id,
            });
        } else if (type_id === 4) {
            const cache_index = flags;
            const offset = cursor.position;
            chunks.push({
                type: NjcmChunkType.CachePolygonList,
                type_id,
                cache_index,
                offset,
            });
            cached_chunk_offsets[cache_index] = offset;
            loop = false;
        } else if (type_id === 5) {
            const cache_index = flags;
            const cached_offset = cached_chunk_offsets[cache_index];

            if (cached_offset != null) {
                cursor.seek_start(cached_offset);
                chunks.push(...parse_chunks(cursor, cached_chunk_offsets, wide_end_chunks));
            }

            chunks.push({
                type: NjcmChunkType.DrawPolygonList,
                type_id,
                cache_index,
            });
        } else if (8 <= type_id && type_id <= 9) {
            size = 2;
            const texture_bits_and_id = cursor.u16();
            chunks.push({
                type: NjcmChunkType.Tiny,
                type_id,
                flip_u: (type_id & 0x80) !== 0,
                flip_v: (type_id & 0x40) !== 0,
                clamp_u: (type_id & 0x20) !== 0,
                clamp_v: (type_id & 0x10) !== 0,
                mipmap_d_adjust: type_id & 0b1111,
                filter_mode: texture_bits_and_id >>> 14,
                super_sample: (texture_bits_and_id & 0x40) !== 0,
                texture_id: texture_bits_and_id & 0x1fff,
            });
        } else if (17 <= type_id && type_id <= 31) {
            size = 2 + 2 * cursor.u16();
            chunks.push({
                type: NjcmChunkType.Material,
                type_id,
            });
        } else if (32 <= type_id && type_id <= 50) {
            size = 2 + 4 * cursor.u16();
            chunks.push({
                type: NjcmChunkType.Vertex,
                type_id,
                vertices: parse_vertex_chunk(cursor, type_id, flags),
            });
        } else if (56 <= type_id && type_id <= 58) {
            size = 2 + 2 * cursor.u16();
            chunks.push({
                type: NjcmChunkType.Volume,
                type_id,
            });
        } else if (64 <= type_id && type_id <= 75) {
            size = 2 + 2 * cursor.u16();
            chunks.push({
                type: NjcmChunkType.Strip,
                type_id,
                triangle_strips: parse_triangle_strip_chunk(cursor, type_id, flags),
            });
        } else if (type_id === 255) {
            size = wide_end_chunks ? 2 : 0;
            chunks.push({
                type: NjcmChunkType.End,
                type_id,
            });
            loop = false;
        } else {
            size = 2 + 2 * cursor.u16();
            chunks.push({
                type: NjcmChunkType.Unknown,
                type_id,
            });
            logger.warn(`Unknown chunk type ${type_id} at offset ${chunk_start_position}.`);
        }

        cursor.seek_start(chunk_start_position + size);
    }

    return chunks;
}

function write_chunks(
    dst: WritableCursor,
    chunks: NjcmChunk[],
    cached_chunk_offsets: number[],
    wide_end_chunks: boolean,
    start_idx = 0,
    written_chunks: number[] = [],
): void {
    chunk_loop: for (let i = start_idx; i < chunks.length; i++) {
        if (written_chunks.includes(i)) {
            continue;
        }

        const chunk = chunks[i];
        switch (chunk.type) {
            case NjcmChunkType.Null:
                dst.write_u8(chunk.type_id);
                dst.write_u8(0);
                break;
            case NjcmChunkType.Bits:
                dst.write_u8(chunk.type_id);
                dst.write_u8(0);
                break;
            case NjcmChunkType.CachePolygonList:
                dst.write_u8(chunk.type_id);
                dst.write_u8(chunk.cache_index);
                cached_chunk_offsets[chunk.cache_index] = dst.position;
                break chunk_loop;
            case NjcmChunkType.DrawPolygonList:
                {
                    dst.write_u8(chunk.type_id);
                    dst.write_u8(chunk.cache_index);

                    const cached_offset = cached_chunk_offsets[chunk.cache_index];

                    if (cached_offset != null) {
                        const orig_pos = dst.position;
                        dst.seek_start(cached_offset);
                        write_chunks(
                            dst,
                            chunks,
                            cached_chunk_offsets,
                            wide_end_chunks,
                            i + 1,
                            written_chunks,
                        );
                        dst.seek_start(orig_pos);
                    }
                }
                break;
            case NjcmChunkType.Tiny:
                {
                    dst.write_u8(chunk.type_id);
                    dst.write_u8(0);

                    const texture_bits_and_id =
                        (chunk.texture_id & 0x1fff) |
                        ((Number(chunk.super_sample) << 13) & 0x2000) |
                        ((chunk.filter_mode << 14) & 0xc000);
                    dst.write_u16(texture_bits_and_id);
                }
                break;
            case NjcmChunkType.Material:
                logger.warn("Ignoring NjcmChunkType.Material");
                break;
            case NjcmChunkType.Vertex:
                write_vertex_chunk(dst, chunk);
                break;
            case NjcmChunkType.Volume:
                logger.warn("Ignoring NjcmChunkType.Volume");
                break;
            case NjcmChunkType.Strip:
                write_triangle_strip_chunk(dst, chunk);
                break;
            case NjcmChunkType.End:
                if (wide_end_chunks) {
                    dst.write_u16(0);
                }
                dst.write_u16(0);
                break chunk_loop;
            default:
                logger.warn("Ignoring unknown NjcmChunkType");
                break;
        }

        written_chunks.push(i);
    }
}

function parse_vertex_chunk(cursor: Cursor, chunk_type_id: number, flags: number): NjcmVertex[] {
    if (chunk_type_id < 32 || chunk_type_id > 50) {
        logger.warn(`Unknown vertex chunk type ${chunk_type_id}.`);
        return [];
    }

    const bone_weight_status = flags & 0b11;
    const calc_continue = (flags & 0x80) !== 0;

    const index = cursor.u16();
    const vertex_count = cursor.u16();

    const vertices: NjcmVertex[] = [];

    for (let i = 0; i < vertex_count; ++i) {
        const vertex: NjcmVertex = {
            index: index + i,
            position: cursor.vec3_f32(),
            bone_weight: 1,
            bone_weight_status,
            calc_continue,
            chunk_type_id,
        };

        if (chunk_type_id === 32) {
            // NJD_CV_SH
            cursor.seek(4); // Always 1.0
        } else if (chunk_type_id === 33) {
            // NJD_CV_VN_SH
            cursor.seek(4); // Always 1.0
            vertex.normal = cursor.vec3_f32();
            cursor.seek(4); // Always 0.0
        } else if (35 <= chunk_type_id && chunk_type_id <= 40) {
            if (chunk_type_id === 37) {
                // NJD_CV_NF
                // NinjaFlags32
                vertex.index = index + cursor.u16();
                vertex.bone_weight = cursor.u16() / 255;
            } else {
                // Skip user flags and material information.
                cursor.seek(4);
            }
        } else if (41 <= chunk_type_id && chunk_type_id <= 47) {
            vertex.normal = cursor.vec3_f32();

            if (chunk_type_id >= 42) {
                if (chunk_type_id === 44) {
                    // NJD_CV_VN_NF
                    // NinjaFlags32
                    vertex.index = index + cursor.u16();
                    vertex.bone_weight = cursor.u16() / 255;
                } else {
                    // Skip user flags and material information.
                    cursor.seek(4);
                }
            }
        } else if (48 <= chunk_type_id && chunk_type_id <= 50) {
            // 32-Bit vertex normal in format: reserved(2)|x(10)|y(10)|z(10)
            const normal = cursor.u32();
            vertex.normal = {
                x: ((normal >> 20) & 0x3ff) / 0x3ff,
                y: ((normal >> 10) & 0x3ff) / 0x3ff,
                z: (normal & 0x3ff) / 0x3ff,
            };

            if (chunk_type_id >= 49) {
                // Skip user flags and material information.
                cursor.seek(4);
            }
        }

        vertices.push(vertex);
    }

    return vertices;
}

function write_vertex_chunk(dst: WritableCursor, chunk: NjcmVertexChunk): void {
    if (chunk.vertices.length < 1) {
        logger.warn("Chunk with empty vertex list passed to write_vertex_chunk.");
        return;
    }

    const chunk_type_id = chunk.type_id;
    dst.write_u8(chunk.type_id);

    let flags = 0;
    {
        const vert = chunk.vertices[0];
        flags |= vert.bone_weight_status;
        flags ^= (-vert.calc_continue ^ flags) & (1 << 7);
    }
    dst.write_u8(flags);

    const size_pos = dst.position;
    dst.write_u16(0);

    if (chunk_type_id < 32 || chunk_type_id > 50) {
        logger.warn(`Unknown vertex chunk type ${chunk_type_id}.`);
        return;
    } else {
        let lowest_idx = Infinity;
        for (const vert of chunk.vertices) {
            if (vert.index < lowest_idx) {
                lowest_idx = vert.index;
            }
        }

        const index_offset = lowest_idx;
        const vertex_count = chunk.vertices.length;
        dst.write_u16(index_offset);
        dst.write_u16(vertex_count);

        for (const vert of chunk.vertices) {
            dst.write_vec3_f32(vert.position);

            if (chunk_type_id === 32) {
                dst.write_f32(1.0);
            } else if (chunk_type_id === 33) {
                assert(vert.normal, "Vertices in chunk type 33 must have normal.");

                dst.write_f32(1.0);
                dst.write_vec3_f32(vert.normal);
                dst.write_f32(0.0);
            } else if (35 <= chunk_type_id && chunk_type_id <= 40) {
                if (chunk_type_id === 37) {
                    dst.write_u16(vert.index - index_offset);
                    dst.write_u16(vert.bone_weight * 255);
                } else {
                    dst.write_u32(0);
                }
            } else if (41 <= chunk_type_id && chunk_type_id <= 47) {
                assert(vert.normal, "Vertices in chunk types 41-47 must have normal.");

                dst.write_vec3_f32(vert.normal);

                if (chunk_type_id >= 42) {
                    if (chunk_type_id === 44) {
                        dst.write_u16(vert.index - index_offset);
                        dst.write_u16(vert.bone_weight * 255);
                    } else {
                        dst.write_u32(0);
                    }
                }
            } else if (48 <= chunk_type_id && chunk_type_id <= 50) {
                assert(vert.normal, "Vertices in chunk types 48-50 must have normal.");

                const normal =
                    ((vert.normal.x * 0x3ff) << 20) |
                    ((vert.normal.y * 0x3ff) << 10) |
                    (vert.normal.z * 0x3ff);
                dst.write_u32(normal);

                if (chunk_type_id >= 49) {
                    dst.write_u32(0);
                }
            }
        }
    }

    dst.write_u16_at(size_pos, (dst.position - size_pos - 2) / 4);
}

interface TriangleStripChunkProperties {
    readonly has_tex_coords: boolean;
    readonly has_color: boolean;
    readonly has_normal: boolean;
    readonly has_double_tex_coords: boolean;
}

function get_triangle_strip_chunk_properties(chunk_type_id: number): TriangleStripChunkProperties {
    let has_tex_coords = false;
    let has_color = false;
    let has_normal = false;
    let has_double_tex_coords = false;

    switch (chunk_type_id) {
        case 64:
            break;
        case 65:
        case 66:
            has_tex_coords = true;
            break;
        case 67:
            has_normal = true;
            break;
        case 68:
        case 69:
            has_tex_coords = true;
            has_normal = true;
            break;
        case 70:
            has_color = true;
            break;
        case 71:
        case 72:
            has_tex_coords = true;
            has_color = true;
            break;
        case 73:
            break;
        case 74:
        case 75:
            has_double_tex_coords = true;
            break;
        default:
            throw new Error(`Unexpected chunk type ID: ${chunk_type_id}.`);
    }

    return {
        has_tex_coords,
        has_color,
        has_normal,
        has_double_tex_coords,
    };
}

function parse_triangle_strip_chunk(
    cursor: Cursor,
    chunk_type_id: number,
    flags: number,
): NjcmTriangleStrip[] {
    const render_flags = {
        ignore_light: (flags & 0b1) !== 0,
        ignore_specular: (flags & 0b10) !== 0,
        ignore_ambient: (flags & 0b100) !== 0,
        use_alpha: (flags & 0b1000) !== 0,
        double_side: (flags & 0b10000) !== 0,
        flat_shading: (flags & 0b100000) !== 0,
        environment_mapping: (flags & 0b1000000) !== 0,
    };
    const user_offset_and_strip_count = cursor.u16();
    const user_flags_size = user_offset_and_strip_count >>> 14;
    const strip_count = user_offset_and_strip_count & 0x3fff;

    const properties = get_triangle_strip_chunk_properties(chunk_type_id);

    const strips: NjcmTriangleStrip[] = [];

    for (let i = 0; i < strip_count; ++i) {
        const winding_flag_and_index_count = cursor.i16();
        const clockwise_winding = winding_flag_and_index_count < 1;
        const index_count = Math.abs(winding_flag_and_index_count);

        const vertices: NjcmMeshVertex[] = [];

        for (let j = 0; j < index_count; ++j) {
            const vertex: NjcmMeshVertex = {
                index: cursor.u16(),
            };
            vertices.push(vertex);

            if (properties.has_tex_coords) {
                vertex.tex_coords = { x: cursor.u16() / 255, y: cursor.u16() / 255 };
            }

            // Ignore ARGB8888 color.
            if (properties.has_color) {
                cursor.seek(4);
            }

            if (properties.has_normal) {
                vertex.normal = {
                    x: cursor.u16() / 255,
                    y: cursor.u16() / 255,
                    z: cursor.u16() / 255,
                };
            }

            // Ignore double texture coordinates (Ua, Vb, Ua, Vb).
            if (properties.has_double_tex_coords) {
                cursor.seek(8);
            }

            // User flags start at the third vertex because they are per-triangle.
            if (j >= 2) {
                cursor.seek(2 * user_flags_size);
            }
        }

        strips.push({
            ...render_flags,
            clockwise_winding,
            has_tex_coords: properties.has_tex_coords,
            has_normal: properties.has_normal,
            vertices,
            chunk_type_id,
        });
    }

    return strips;
}

function write_triangle_strip_chunk(dst: WritableCursor, chunk: NjcmStripChunk): void {
    if (chunk.triangle_strips.length < 1) {
        logger.warn("Chunk with empty strip list passed to write_triangle_strip_chunks.");
        return;
    }

    const chunk_type_id = chunk.type_id;
    dst.write_u8(chunk.type_id);

    let flags = 0;
    {
        const strip = chunk.triangle_strips[0];
        flags ^= (-strip.ignore_light ^ flags) & (1 << 0);
        flags ^= (-strip.ignore_specular ^ flags) & (1 << 1);
        flags ^= (-strip.ignore_ambient ^ flags) & (1 << 2);
        flags ^= (-strip.use_alpha ^ flags) & (1 << 3);
        flags ^= (-strip.double_side ^ flags) & (1 << 4);
        flags ^= (-strip.flat_shading ^ flags) & (1 << 5);
        flags ^= (-strip.environment_mapping ^ flags) & (1 << 6);
    }
    dst.write_u8(flags);


    const size_pos = dst.position;
    const strip_count = chunk.triangle_strips.length;
    const user_flags_size = 0;
    const user_offset_and_strip_count = (strip_count & 0x3fff) | ((user_flags_size << 14) & 0xc000);
    dst.write_u16(user_offset_and_strip_count);

    const properties = get_triangle_strip_chunk_properties(chunk_type_id);

    for (const strip of chunk.triangle_strips) {
        const winding_flag_and_index_count = strip.clockwise_winding
            ? -strip.vertices.length
            : strip.vertices.length;
        dst.write_i16(winding_flag_and_index_count);

        for (let j = 0; j < strip.vertices.length; j++) {
            const vert = strip.vertices[j];

            dst.write_u16(vert.index);

            if (properties.has_tex_coords) {
                assert(
                    vert.tex_coords,
                    "Vertex is missing tex_coords even though has_tex_coords is set.",
                );
                dst.write_u16(vert.tex_coords.x * 255);
                dst.write_u16(vert.tex_coords.y * 255);
            }

            if (properties.has_color) {
                dst.write_u32(0);
            }

            if (properties.has_normal) {
                assert(vert.normal, "Vertex is missing normal even though has_normal is set.");
                dst.write_u16(vert.normal.x * 255);
                dst.write_u16(vert.normal.y * 255);
                dst.write_u16(vert.normal.z * 255);
            }

            if (properties.has_double_tex_coords) {
                dst.write_u32(0);
                dst.write_u32(0);
            }

            if (j >= 2) {
                dst.seek(2 * user_flags_size);
            }
        }
    }

    dst.write_u16_at(size_pos, (dst.position - size_pos - 2) / 2);
}
