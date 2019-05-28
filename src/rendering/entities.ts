import { BufferGeometry, DoubleSide, Mesh, MeshLambertMaterial } from 'three';
import { autorun } from 'mobx';
import { Vec3, VisibleQuestEntity, QuestNpc, QuestObject, Section } from '../domain';

export const OBJECT_COLOR = 0xFFFF00;
export const OBJECT_HOVER_COLOR = 0xFFDF3F;
export const OBJECT_SELECTED_COLOR = 0xFFAA00;
export const NPC_COLOR = 0xFF0000;
export const NPC_HOVER_COLOR = 0xFF3F5F;
export const NPC_SELECTED_COLOR = 0xFF0054;

export function createObjectMesh(object: QuestObject, sections: Section[], geometry: BufferGeometry): Mesh {
    return createMesh(object, sections, geometry, OBJECT_COLOR, 'Object');
}

export function createNpcMesh(npc: QuestNpc, sections: Section[], geometry: BufferGeometry): Mesh {
    return createMesh(npc, sections, geometry, NPC_COLOR, 'NPC');
}

function createMesh(
    entity: VisibleQuestEntity,
    sections: Section[],
    geometry: BufferGeometry,
    color: number,
    type: string
): Mesh {
    let {x, y, z} = entity.position;

    const section = sections.find(s => s.id === entity.sectionId);
    entity.section = section;

    if (section) {
        const {x: secX, y: secY, z: secZ} = section.position;
        const rotX = section.cosYAxisRotation * x + section.sinYAxisRotation * z;
        const rotZ = -section.sinYAxisRotation * x + section.cosYAxisRotation * z;
        x = rotX + secX;
        y += secY;
        z = rotZ + secZ;
    } else {
        console.warn(`Section ${entity.sectionId} not found.`);
    }

    const object3d = new Mesh(
        geometry,
        new MeshLambertMaterial({
            color,
            side: DoubleSide
        })
    );
    object3d.name = type;
    object3d.userData.entity = entity;

    // TODO: dispose autorun?
    autorun(() => {
        const {x, y, z} = entity.position;
        object3d.position.set(x, y, z);
        const rot = entity.rotation;
        object3d.rotation.set(rot.x, rot.y, rot.z);
    });

    entity.position = new Vec3(x, y, z);

    return object3d;
}
