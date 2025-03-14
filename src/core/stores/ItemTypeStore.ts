import {
    ArmorItemType,
    ItemType,
    ShieldItemType,
    ToolItemType,
    UnitItemType,
    WeaponItemType,
} from "../model/items";
import { ServerMap } from "./ServerMap";
import { Server } from "../model";
import { ItemTypeDto } from "../dto/ItemTypeDto";

export class ItemTypeStore {
    readonly item_types: ItemType[];

    constructor(item_types: ItemType[], private readonly id_to_item_type: ItemType[]) {
        this.item_types = item_types;
    }

    get_by_id = (id: number): ItemType | undefined => {
        return this.id_to_item_type[id];
    };
}

async function load(server: Server): Promise<ItemTypeStore> {
    const response = await fetch(
        `${process.env.PUBLIC_URL}/itemTypes.${Server[server].toLowerCase()}.json`,
    );
    const data: ItemTypeDto[] = await response.json();
    const item_types: ItemType[] = [];
    const id_to_item_type: ItemType[] = [];

    for (const item_type_dto of data) {
        let item_type: ItemType;

        switch (item_type_dto.class) {
            case "weapon":
                item_type = new WeaponItemType(
                    item_type_dto.id,
                    item_type_dto.name,
                    item_type_dto.minAtp,
                    item_type_dto.maxAtp,
                    item_type_dto.ata,
                    item_type_dto.maxGrind,
                    item_type_dto.requiredAtp,
                );
                break;
            case "armor":
                item_type = new ArmorItemType(
                    item_type_dto.id,
                    item_type_dto.name,
                    item_type_dto.atp,
                    item_type_dto.ata,
                    item_type_dto.minEvp,
                    item_type_dto.maxEvp,
                    item_type_dto.minDfp,
                    item_type_dto.maxDfp,
                    item_type_dto.mst,
                    item_type_dto.hp,
                    item_type_dto.lck,
                );
                break;
            case "shield":
                item_type = new ShieldItemType(
                    item_type_dto.id,
                    item_type_dto.name,
                    item_type_dto.atp,
                    item_type_dto.ata,
                    item_type_dto.minEvp,
                    item_type_dto.maxEvp,
                    item_type_dto.minDfp,
                    item_type_dto.maxDfp,
                    item_type_dto.mst,
                    item_type_dto.hp,
                    item_type_dto.lck,
                );
                break;
            case "unit":
                item_type = new UnitItemType(item_type_dto.id, item_type_dto.name);
                break;
            case "tool":
                item_type = new ToolItemType(item_type_dto.id, item_type_dto.name);
                break;
            default:
                continue;
        }

        id_to_item_type[item_type.id] = item_type;
        item_types.push(item_type);
    }

    return new ItemTypeStore(item_types, id_to_item_type);
}

export const item_type_stores: ServerMap<ItemTypeStore> = new ServerMap(load);
