import { BufferGeometry, CylinderBufferGeometry, Texture } from "three";
import Logger from "js-logger";
import { LoadingCache } from "./LoadingCache";
import { Endianness } from "../../core/data_formats/Endianness";
import { ArrayBufferCursor } from "../../core/data_formats/cursor/ArrayBufferCursor";
import { ninja_object_to_buffer_geometry } from "../../core/rendering/conversion/ninja_geometry";
import { parse_nj, parse_xj } from "../../core/data_formats/parsing/ninja";
import { parse_xvm } from "../../core/data_formats/parsing/ninja/texture";
import { xvm_to_textures } from "../../core/rendering/conversion/ninja_textures";
import { load_array_buffer } from "../../core/loading";
import { object_data, ObjectType } from "../../core/data_formats/parsing/quest/object_types";
import { NpcType } from "../../core/data_formats/parsing/quest/npc_types";
import {
    entity_type_to_string,
    EntityType,
    is_npc_type,
} from "../../core/data_formats/parsing/quest/entities";

const logger = Logger.get("quest_editor/loading/entities");

const DEFAULT_ENTITY = new CylinderBufferGeometry(3, 3, 20);
DEFAULT_ENTITY.translate(0, 10, 0);
DEFAULT_ENTITY.computeBoundingBox();
DEFAULT_ENTITY.computeBoundingSphere();

const DEFAULT_ENTITY_PROMISE: Promise<BufferGeometry> = new Promise(resolve =>
    resolve(DEFAULT_ENTITY),
);

const DEFAULT_ENTITY_TEX: Texture[] = [];

const DEFAULT_ENTITY_TEX_PROMISE: Promise<Texture[]> = new Promise(resolve =>
    resolve(DEFAULT_ENTITY_TEX),
);

const geom_cache = new LoadingCache<EntityType, Promise<BufferGeometry>>();

const tex_cache = new LoadingCache<EntityType, Promise<Texture[]>>();

for (const type of [
    NpcType.Unknown,
    NpcType.Migium,
    NpcType.Hidoom,
    NpcType.DeathGunner,
    NpcType.StRappy,
    NpcType.HalloRappy,
    NpcType.EggRappy,
    NpcType.Migium2,
    NpcType.Hidoom2,
    NpcType.Recon,

    ObjectType.Unknown,
    ObjectType.PlayerSet,
    ObjectType.Particle,
    ObjectType.LightCollision,
    ObjectType.EnvSound,
    ObjectType.FogCollision,
    ObjectType.EventCollision,
    ObjectType.CharaCollision,
    ObjectType.ObjRoomID,
    ObjectType.LensFlare,
    ObjectType.ScriptCollision,
    ObjectType.MapCollision,
    ObjectType.ScriptCollisionA,
    ObjectType.ItemLight,
    ObjectType.RadarCollision,
    ObjectType.FogCollisionSW,
    ObjectType.ImageBoard,
    ObjectType.UnknownItem29,
    ObjectType.UnknownItem30,
    ObjectType.UnknownItem31,
    ObjectType.MenuActivation,
    ObjectType.BoxDetectObject,
    ObjectType.SymbolChatObject,
    ObjectType.TouchPlateObject,
    ObjectType.TargetableObject,
    ObjectType.EffectObject,
    ObjectType.CountDownObject,
    ObjectType.UnknownItem38,
    ObjectType.UnknownItem39,
    ObjectType.UnknownItem40,
    ObjectType.UnknownItem41,
    ObjectType.TelepipeLocation,
    ObjectType.BGMCollision,
    ObjectType.Pioneer2InvisibleTouchplate,
    ObjectType.TempleMapDetect,
    ObjectType.Firework,
    ObjectType.MainRagolTeleporterBattleInNextArea,
    ObjectType.Rainbow,
    ObjectType.FloatingBlueLight,
    ObjectType.PopupTrapNoTech,
    ObjectType.Poison,
    ObjectType.EnemyTypeBoxYellow,
    ObjectType.EnemyTypeBoxBlue,
    ObjectType.EmptyTypeBoxBlue,
    ObjectType.FloatingRocks,
    ObjectType.FloatingSoul,
    ObjectType.Butterfly,
    ObjectType.UnknownItem400,
    ObjectType.CCAAreaTeleporter,
    ObjectType.UnknownItem523,
    ObjectType.WhiteBird,
    ObjectType.OrangeBird,
    ObjectType.UnknownItem529,
    ObjectType.UnknownItem530,
    ObjectType.Seagull,
    ObjectType.UnknownItem576,
    ObjectType.WarpInBarbaRayRoom,
    ObjectType.UnknownItem672,
    ObjectType.InstaWarp,
    ObjectType.LabInvisibleObject,
    ObjectType.UnknownItem700,
]) {
    geom_cache.set(type, DEFAULT_ENTITY_PROMISE);
    tex_cache.set(type, DEFAULT_ENTITY_TEX_PROMISE);
}

export async function load_entity_geometry(type: EntityType): Promise<BufferGeometry> {
    return geom_cache.get_or_set(type, async () => {
        try {
            const { url, data } = await load_entity_data(type, AssetType.Geometry);
            const cursor = new ArrayBufferCursor(data, Endianness.Little);
            const nj_objects = url.endsWith(".nj") ? parse_nj(cursor) : parse_xj(cursor);

            if (nj_objects.length) {
                return ninja_object_to_buffer_geometry(nj_objects[0]);
            } else {
                logger.warn(`Couldn't parse ${url} for ${entity_type_to_string(type)}.`);
                return DEFAULT_ENTITY;
            }
        } catch (e) {
            logger.warn(`Couldn't load geometry file for ${entity_type_to_string(type)}.`, e);
            return DEFAULT_ENTITY;
        }
    });
}

export async function load_entity_textures(type: EntityType): Promise<Texture[]> {
    return tex_cache.get_or_set(type, async () => {
        try {
            const { data } = await load_entity_data(type, AssetType.Texture);
            const cursor = new ArrayBufferCursor(data, Endianness.Little);
            const xvm = parse_xvm(cursor);
            return xvm_to_textures(xvm);
        } catch (e) {
            logger.warn(`Couldn't load texture file for ${entity_type_to_string(type)}.`, e);
            return DEFAULT_ENTITY_TEX;
        }
    });
}

export async function load_entity_data(
    type: EntityType,
    asset_type: AssetType,
): Promise<{ url: string; data: ArrayBuffer }> {
    const url = entity_type_to_url(type, asset_type);
    const data = await load_array_buffer(url);
    return { url, data };
}

enum AssetType {
    Geometry,
    Texture,
}

function entity_type_to_url(type: EntityType, asset_type: AssetType): string {
    if (is_npc_type(type)) {
        switch (type) {
            // The dubswitch model is in XJ format.
            case NpcType.Dubswitch:
                return `/npcs/${NpcType[type]}.${asset_type === AssetType.Geometry ? "xj" : "xvm"}`;

            // Episode II VR Temple

            case NpcType.Hildebear2:
                return entity_type_to_url(NpcType.Hildebear, asset_type);
            case NpcType.Hildeblue2:
                return entity_type_to_url(NpcType.Hildeblue, asset_type);
            case NpcType.RagRappy2:
                return entity_type_to_url(NpcType.RagRappy, asset_type);
            case NpcType.Monest2:
                return entity_type_to_url(NpcType.Monest, asset_type);
            case NpcType.Mothmant2:
                return entity_type_to_url(NpcType.Mothmant, asset_type);
            case NpcType.PoisonLily2:
                return entity_type_to_url(NpcType.PoisonLily, asset_type);
            case NpcType.NarLily2:
                return entity_type_to_url(NpcType.NarLily, asset_type);
            case NpcType.GrassAssassin2:
                return entity_type_to_url(NpcType.GrassAssassin, asset_type);
            case NpcType.Dimenian2:
                return entity_type_to_url(NpcType.Dimenian, asset_type);
            case NpcType.LaDimenian2:
                return entity_type_to_url(NpcType.LaDimenian, asset_type);
            case NpcType.SoDimenian2:
                return entity_type_to_url(NpcType.SoDimenian, asset_type);
            case NpcType.DarkBelra2:
                return entity_type_to_url(NpcType.DarkBelra, asset_type);

            // Episode II VR Spaceship

            case NpcType.SavageWolf2:
                return entity_type_to_url(NpcType.SavageWolf, asset_type);
            case NpcType.BarbarousWolf2:
                return entity_type_to_url(NpcType.BarbarousWolf, asset_type);
            case NpcType.PanArms2:
                return entity_type_to_url(NpcType.PanArms, asset_type);
            case NpcType.Dubchic2:
                return entity_type_to_url(NpcType.Dubchic, asset_type);
            case NpcType.Gilchic2:
                return entity_type_to_url(NpcType.Gilchic, asset_type);
            case NpcType.Garanz2:
                return entity_type_to_url(NpcType.Garanz, asset_type);
            case NpcType.Dubswitch2:
                return entity_type_to_url(NpcType.Dubswitch, asset_type);
            case NpcType.Delsaber2:
                return entity_type_to_url(NpcType.Delsaber, asset_type);
            case NpcType.ChaosSorcerer2:
                return entity_type_to_url(NpcType.ChaosSorcerer, asset_type);

            default:
                return `/npcs/${NpcType[type]}.${asset_type === AssetType.Geometry ? "nj" : "xvm"}`;
        }
    } else {
        if (asset_type === AssetType.Geometry) {
            switch (type) {
                case ObjectType.EasterEgg:
                case ObjectType.ChristmasTree:
                case ObjectType.ChristmasWreath:
                case ObjectType.TwentyFirstCentury:
                case ObjectType.Sonic:
                case ObjectType.WelcomeBoard:
                case ObjectType.FloatingJellyfish:
                case ObjectType.RuinsSeal:
                case ObjectType.Dolphin:
                case ObjectType.Cacti:
                case ObjectType.BigBrownRock:
                case ObjectType.PoisonPlant:
                case ObjectType.BigBlackRocks:
                case ObjectType.FallingRock:
                case ObjectType.DesertFixedTypeBoxBreakableCrystals:
                case ObjectType.BeeHive:
                    return `/objects/${object_data(type).pso_id}.nj`;

                default:
                    return `/objects/${object_data(type).pso_id}.xj`;
            }
        } else {
            return `/objects/${object_data(type).pso_id}.xvm`;
        }
    }
}
