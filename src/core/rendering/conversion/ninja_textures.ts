import {
    CompressedPixelFormat,
    CompressedTexture,
    LinearFilter,
    MirroredRepeatWrapping,
    RGBA_S3TC_DXT1_Format,
    RGBA_S3TC_DXT3_Format,
    Texture as ThreeTexture,
} from "three";
import { Xvm, XvrTexture } from "../../data_formats/parsing/ninja/texture";
import { Texture, TextureFormat } from "../Texture";
import { Gfx } from "../Gfx";

export function xvr_texture_to_texture(gfx: Gfx, xvr: XvrTexture): Texture {
    let format: TextureFormat;
    let data_size: number;

    // Ignore mipmaps.
    switch (xvr.format[1]) {
        case 6:
            format = TextureFormat.RGBA_S3TC_DXT1;
            data_size = (xvr.width * xvr.height) / 2;
            break;
        case 7:
            format = TextureFormat.RGBA_S3TC_DXT3;
            data_size = xvr.width * xvr.height;
            break;
        default:
            throw new Error(`Format ${xvr.format.join(", ")} not supported.`);
    }

    return new Texture(gfx, format, xvr.width, xvr.height, xvr.data.slice(0, data_size));
}

export function xvm_to_three_textures(xvm: Xvm): ThreeTexture[] {
    return xvm.textures.map(xvr_texture_to_three_texture);
}

export function xvr_texture_to_three_texture(xvr: XvrTexture): ThreeTexture {
    let format: CompressedPixelFormat;
    let data_size: number;

    // Ignore mipmaps.
    switch (xvr.format[1]) {
        case 6:
            format = RGBA_S3TC_DXT1_Format;
            data_size = (xvr.width * xvr.height) / 2;
            break;
        case 7:
            format = RGBA_S3TC_DXT3_Format;
            data_size = xvr.width * xvr.height;
            break;
        default:
            throw new Error(`Format ${xvr.format.join(", ")} not supported.`);
    }

    const texture_3js = new CompressedTexture(
        [
            {
                data: new Uint8Array(xvr.data, 0, data_size) as any,
                width: xvr.width,
                height: xvr.height,
            },
        ],
        xvr.width,
        xvr.height,
        format,
    );

    texture_3js.minFilter = LinearFilter;
    texture_3js.wrapS = MirroredRepeatWrapping;
    texture_3js.wrapT = MirroredRepeatWrapping;
    texture_3js.needsUpdate = true;

    return texture_3js;
}

type RGB = [number, number, number];

function rgb8_to_rgb565(rgb: RGB): number {
    return ((rgb[0] & 0xf8) << 8) | ((rgb[1] & 0xfc) << 3) | (rgb[2] >> 3);
}

function decompose_rgb565(rgb: number): RGB {
    const r = rgb >> 11;
    const g = (rgb >> 5) & 0x3f;
    const b = rgb & 0x1f;
    return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
}

const dxt1_block_dim = 4;

function dxt1_compress_rgba8(img: ImageData): ArrayBuffer | undefined {
    const w = img.width;
    const h = img.height;

    const src_block_size = dxt1_block_dim * dxt1_block_dim;
    const num_src_chans = 4;
    const num_dst_chans = 3;
    const inset_shift = 4;
    const num_palette_colors = 4;
    // Compressed block is [u16, u16, u32].
    const dst_block_size = 8;

    // Source must be divisible by block dimension.
    if (w % dxt1_block_dim !== 0 || h % dxt1_block_dim !== 0) {
        return undefined;
    }

    const src = img.data;
    const dst = new Uint32Array(Math.floor((w * h) / dst_block_size));
    let dst_idx = 0;

    // Iterate through source in blocks.
    for (let y = 0; y < h; y += dxt1_block_dim) {
        for (let x = 0; x < w; x += dxt1_block_dim) {
            const min_rgb8: RGB = [0xff, 0xff, 0xff];
            const max_rgb8: RGB = [0, 0, 0];

            // Compute block's RGB bounding box.
            for (let px_idx = 0; px_idx < src_block_size; px_idx++) {
                const offset =
                    ((Math.floor(px_idx / dxt1_block_dim) + y) * w + x + (px_idx % dxt1_block_dim)) *
                    num_src_chans;

                for (let i = 0; i < num_dst_chans; i++) {
                    if (max_rgb8[i] < src[offset + i]) {
                        max_rgb8[i] = src[offset + i];
                    }
                    if (min_rgb8[i] > src[offset + i]) {
                        min_rgb8[i] = src[offset + i];
                    }
                }
            }

            // Quantize colors.
            const inset_rgb = max_rgb8.map((val, i) => (val - min_rgb8[i]) >> inset_shift);

            let max_rgb565 = rgb8_to_rgb565(
                max_rgb8.map((val, i) => (val >= inset_rgb[i] ? val - inset_rgb[i] : 0)) as RGB,
            );

            let min_rgb565 = rgb8_to_rgb565(
                min_rgb8.map((val, i) =>
                    val + inset_rgb[i] < 0xff ? val + inset_rgb[i] : 0xff,
                ) as RGB,
            );

            // Block can be written fast if there is only one color.
            if (max_rgb565 === min_rgb565) {
                dst[dst_idx++] = (max_rgb565 << 16) | max_rgb565;
                dst[dst_idx++] = 0;
                continue;
            }

            // Fix ordering if it got swapped during quantization.
            if (max_rgb565 < min_rgb565) {
                const temp = max_rgb565;
                max_rgb565 = min_rgb565;
                min_rgb565 = temp;
            }

            // Compute palette colors.
            const palette0 = decompose_rgb565(max_rgb565);
            const palette1 = decompose_rgb565(min_rgb565);
            const palette2 = palette0.map((val, i) => (((val << 1) + palette1[i]) / 3) | 0);
            const palette3 = palette0.map((val, i) => (((palette1[i] << 1) + val) / 3) | 0);
            const palettes = [palette0, palette1, palette2, palette3];

            // Write palette colors.
            dst[dst_idx++] = (min_rgb565 << 16) | max_rgb565;

            // Write block pixel values.
            for (let px_idx = 0; px_idx < src_block_size; px_idx++) {
                const offset =
                    ((Math.floor(px_idx / dxt1_block_dim) + y) * w + x + (px_idx % dxt1_block_dim)) *
                    num_src_chans;

                let best_color_dist = Infinity;
                let best_palette_idx = 0;

                // Find best palette color for current pixel.
                for (let palette_idx = 0; palette_idx < num_palette_colors; palette_idx++) {
                    // Compute distance between current pixel and palette color.
                    let dist = 0;
                    for (let i = 0; i < num_dst_chans; i++) {
                        const delta = src[offset + i] - palettes[palette_idx][i];
                        dist += delta * delta;
                    }

                    if (dist < best_color_dist) {
                        best_color_dist = dist;
                        best_palette_idx = palette_idx;
                    }
                }

                // Write palette index (2-bit) at pixel index.
                dst[dst_idx] |= best_palette_idx << (px_idx << 1);
            }

            dst_idx++;
        }
    }

    return dst.buffer;
}

export function adjust_image_dimensions_for_xvr(width: number, height: number): [number, number] {
    return [
        Math.floor(width / dxt1_block_dim) * dxt1_block_dim,
        Math.floor(height / dxt1_block_dim) * dxt1_block_dim,
    ];
}

export function rgba8_to_xvr_texture(img: ImageData): XvrTexture | undefined {
    const compressed = dxt1_compress_rgba8(img);

    if (!compressed) {
        throw new Error("Failed to compress image data");
    }

    return {
        id: 0,
        data: compressed,
        format: [0, 6],
        width: img.width,
        height: img.height,
        size: compressed.byteLength,
    };
}
