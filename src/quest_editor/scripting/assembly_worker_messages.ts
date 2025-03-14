import { AssemblyError, AssemblyWarning, AssemblySettings } from "./assembly";
import { Segment } from "./instructions";
import { Opcode } from "./opcodes";

export enum InputMessageType {
    NewAssembly,
    AssemblyChange,
    SignatureHelp,
    Definition,
    SettingsChange,
}

export type AssemblyWorkerInput =
    | NewAssemblyInput
    | AssemblyChangeInput
    | SignatureHelpInput
    | DefinitionInput
    | AssemblySettingsChangeInput;

export type NewAssemblyInput = {
    readonly type: InputMessageType.NewAssembly;
    readonly assembly: string[];
};

export type AssemblyChangeInput = {
    readonly type: InputMessageType.AssemblyChange;
    readonly changes: {
        start_line_no: number;
        start_col: number;
        end_line_no: number;
        end_col: number;
        new_text: string;
    }[];
};

export type SignatureHelpInput = {
    readonly type: InputMessageType.SignatureHelp;
    readonly id: number;
    readonly line_no: number;
    readonly col: number;
};

export type DefinitionInput = {
    readonly type: InputMessageType.Definition;
    readonly id: number;
    readonly line_no: number;
    readonly col: number;
};

export type AssemblySettingsChangeInput = {
    readonly type: InputMessageType.SettingsChange;
    readonly settings: Partial<AssemblySettings>;
};

export enum OutputMessageType {
    NewObjectCode,
    SignatureHelp,
    Definition,
}

export type AssemblyWorkerOutput = NewObjectCodeOutput | SignatureHelpOutput | DefinitionOutput;

export type NewObjectCodeOutput = {
    readonly type: OutputMessageType.NewObjectCode;
    readonly object_code: Segment[];
    readonly map_designations: Map<number, number>;
    readonly warnings: AssemblyWarning[];
    readonly errors: AssemblyError[];
};

export type SignatureHelpOutput = {
    readonly type: OutputMessageType.SignatureHelp;
    readonly id: number;
    readonly opcode?: Opcode;
    readonly active_param: number;
};

export type DefinitionOutput = {
    readonly type: OutputMessageType.Definition;
    readonly id: number;
    readonly line_no?: number;
    readonly col?: number;
    readonly len?: number;
};
