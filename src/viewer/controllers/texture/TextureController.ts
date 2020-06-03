import { Controller } from "../../../core/controllers/Controller";
import { filename_extension } from "../../../core/util";
import { read_file } from "../../../core/files";
import {
    is_xvm,
    parse_xvm,
    XvrTexture,
    parse_xvr,
    write_xvr,
} from "../../../core/data_formats/parsing/ninja/texture";
import { ArrayBufferCursor } from "../../../core/data_formats/cursor/ArrayBufferCursor";
import { Endianness } from "../../../core/data_formats/Endianness";
import { parse_afs } from "../../../core/data_formats/parsing/afs";
import { LogManager } from "../../../core/Logger";
import { WritableListProperty } from "../../../core/observable/property/list/WritableListProperty";
import { list_property, property } from "../../../core/observable";
import { ListProperty } from "../../../core/observable/property/list/ListProperty";
import { prs_decompress } from "../../../core/data_formats/compression/prs/decompress";
import { failure, Result, result_builder } from "../../../core/Result";
import { Severity } from "../../../core/Severity";
import { Property } from "../../../core/observable/property/Property";
import { WritableProperty } from "../../../core/observable/property/WritableProperty";
import { rgba8_to_xvr_texture, adjust_image_dimensions_for_xvr } from "../../../core/rendering/conversion/ninja_textures";
import { prs_compress } from "../../../core/data_formats/compression/prs/compress";
import { write_iff } from "../../../core/data_formats/parsing/iff";

const logger = LogManager.get("viewer/controllers/TextureController");

export class TextureController extends Controller {
    private readonly _textures: WritableListProperty<XvrTexture> = list_property();
    private readonly _result_dialog_visible = property(false);
    private readonly _result: WritableProperty<Result<unknown> | undefined> = property(undefined);
    private readonly _result_problems_message = property("");
    private readonly _result_error_message = property("");

    readonly textures: ListProperty<XvrTexture> = this._textures;
    readonly result_dialog_visible: Property<boolean> = this._result_dialog_visible;
    readonly result: Property<Result<unknown> | undefined> = this._result;
    readonly result_problems_message: Property<string> = this._result_problems_message;
    readonly result_error_message: Property<string> = this._result_error_message;

    load_file = async (file: File): Promise<void> => {
        this._result_problems_message.val = `Encountered some problems while opening "${file.name}".`;
        this._result_error_message.val = `Couldn't open "${file.name}".`;

        try {
            const ext = filename_extension(file.name).toLowerCase();
            const buffer = await read_file(file);
            const cursor = new ArrayBufferCursor(buffer, Endianness.Little);

            if (ext === "xvm") {
                const xvm_result = parse_xvm(cursor);
                this.set_result(xvm_result);

                if (xvm_result.success) {
                    this._textures.val = xvm_result.value.textures;
                }
            } else if (ext === "afs") {
                const rb = result_builder(logger);
                const afs_result = parse_afs(cursor);
                rb.add_result(afs_result);

                if (!afs_result.success) {
                    this.set_result(rb.failure());
                } else {
                    const textures: XvrTexture[] = afs_result.value.flatMap(file => {
                        const cursor = new ArrayBufferCursor(file, Endianness.Little);

                        if (is_xvm(cursor)) {
                            const xvm_result = parse_xvm(cursor);
                            rb.add_result(xvm_result);
                            return xvm_result.value?.textures ?? [];
                        } else {
                            const xvm_result = parse_xvm(prs_decompress(cursor.seek_start(0)));
                            rb.add_result(xvm_result);
                            return xvm_result.value?.textures ?? [];
                        }
                    });

                    if (textures.length) {
                        this.set_result(rb.success(textures));
                    } else {
                        this.set_result(rb.failure());
                    }

                    this._textures.val = textures;
                }
            } else if (ext === "xvr") {
                const rb = result_builder<XvrTexture>(logger);
                const decomp = prs_decompress(cursor);
                decomp.u32();
                decomp.u32();
                const xvr = parse_xvr(decomp);
                this.set_result(rb.success(xvr));
                this._textures.val = [xvr];
            } else if (ext === "png") {
                const rb = result_builder<XvrTexture>(logger);
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d")!;
                const img = new Image();
                img.src = URL.createObjectURL(new Blob([buffer]));
                img.onload = () => {
                    const [w, h] = adjust_image_dimensions_for_xvr(img.width, img.height);
                    canvas.width = w;
                    canvas.height = h;
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const xvr = rgba8_to_xvr_texture(data)!;
                    this.set_result(rb.success(xvr));
                    this._textures.val = [xvr];
                    const xvr_bytes = write_xvr(xvr);
                    xvr_bytes.seek_start(0);
                    const iff = write_iff({type: 0x54525658, data: xvr_bytes});
                    iff.seek_start(0);
                    const prs = prs_compress(iff);
                    let body = "";
                    let i = 1;
                    while (prs.bytes_left) {
                        const hex = "0x" + prs.u8().toString(16).padStart(2, "0");
                        body += hex;
                        if (i !== 0 && i % 16 === 0) {
                            body += "\n";
                        } else {
                            body += " ";
                        }
                        i++;
                    }

                    console.log(iff.size);
                    console.log(".data\n" + "7777:\n" + body);
                };
            } else {
                logger.debug(`Unsupported file extension in filename "${file.name}".`);
                this.set_result(
                    failure([{ severity: Severity.Error, ui_message: "Unsupported file type." }]),
                );
            }
        } catch (e) {
            logger.error("Couldn't read file.", e);
            this.set_result(failure());
        }
    };

    dismiss_result_dialog = (): void => {
        this._result_dialog_visible.val = false;
    };

    private set_result(result: Result<unknown>): void {
        this._result.val = result;

        if (result.problems.length) {
            this._result_dialog_visible.val = true;
        }
    }
}
