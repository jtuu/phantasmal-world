import { enum_values } from "../enums";

export const RARE_ENEMY_PROB = 1 / 512;
export const KONDRIEU_PROB = 1 / 10;

export enum Server {
    Ephinea = "Ephinea",
}

export const Servers: readonly Server[] = enum_values(Server);

export enum SectionId {
    Viridia,
    Greenill,
    Skyly,
    Bluefull,
    Purplenum,
    Pinkal,
    Redria,
    Oran,
    Yellowboze,
    Whitill,
}

export const SectionIds: readonly SectionId[] = enum_values(SectionId);

export enum Difficulty {
    Normal,
    Hard,
    VHard,
    Ultimate,
}

export const Difficulties: readonly Difficulty[] = enum_values(Difficulty);
