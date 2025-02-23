import { Vec3 } from "../../vector";
import { npc_data, NpcType, NpcTypeData } from "./npc_types";
import { object_data, ObjectType, ObjectTypeData } from "./object_types";
import { DatEvent } from "./dat";

export type QuestNpc = {
    readonly type: NpcType;
    readonly area_id: number;
    readonly section_id: number;
    /**
     * Section-relative position
     */
    readonly position: Vec3;
    readonly rotation: Vec3;
    /**
     * Seemingly 3 floats, not sure what they represent.
     */
    readonly scale: Vec3;
    /**
     * Data of which the purpose hasn't been discovered yet.
     */
    readonly unknown: readonly number[][];
    readonly pso_type_id: number;
    readonly npc_id: number;
    readonly script_label: number;
    readonly pso_roaming: number;
};

export type QuestObject = {
    readonly type: ObjectType;
    readonly id: number;
    readonly group_id: number;
    readonly area_id: number;
    readonly section_id: number;
    /**
     * Section-relative position
     */
    readonly position: Vec3;
    readonly rotation: Vec3;
    /**
     * Properties that differ per object type.
     */
    readonly properties: Map<string, number>;
    /**
     * Data of which the purpose hasn't been discovered yet.
     */
    readonly unknown: readonly number[][];
};

export type QuestEvent = DatEvent;

export type EntityTypeData = NpcTypeData | ObjectTypeData;

export type EntityType = NpcType | ObjectType;

export function entity_type_to_string(type: EntityType): string {
    return (NpcType as any)[type] || (ObjectType as any)[type];
}

export function is_npc_type(entity_type: EntityType): entity_type is NpcType {
    return NpcType[entity_type] != undefined;
}

export function entity_data(type: EntityType): EntityTypeData {
    return npc_data(type as NpcType) || object_data(type as ObjectType);
}
