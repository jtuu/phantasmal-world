import { CylinderBufferGeometry, MeshLambertMaterial, Object3D, Vector3 } from 'three';
import { DatNpc, DatObject } from '../data_formats/parsing/quest/dat';
import { NpcType, ObjectType, QuestNpc, QuestObject } from '../domain';
import { Vec3 } from "../data_formats/Vec3";
import { create_npc_mesh, create_object_mesh, NPC_COLOR, OBJECT_COLOR } from './entities';

const cylinder = new CylinderBufferGeometry(3, 3, 20).translate(0, 10, 0);

test('create geometry for quest objects', () => {
    const object = new QuestObject(7, 13, new Vec3(17, 19, 23), new Vec3(0, 0, 0), ObjectType.PrincipalWarp, {} as DatObject);
    const geometry = create_object_mesh(object, cylinder);

    expect(geometry).toBeInstanceOf(Object3D);
    expect(geometry.name).toBe('Object');
    expect(geometry.userData.entity).toBe(object);
    expect(geometry.position.x).toBe(17);
    expect(geometry.position.y).toBe(19);
    expect(geometry.position.z).toBe(23);
    expect((geometry.material as MeshLambertMaterial).color.getHex()).toBe(OBJECT_COLOR);
});

test('create geometry for quest NPCs', () => {
    const npc = new QuestNpc(7, 13, new Vec3(17, 19, 23), new Vec3(0, 0, 0), NpcType.Booma, {} as DatNpc);
    const geometry = create_npc_mesh(npc, cylinder);

    expect(geometry).toBeInstanceOf(Object3D);
    expect(geometry.name).toBe('NPC');
    expect(geometry.userData.entity).toBe(npc);
    expect(geometry.position.x).toBe(17);
    expect(geometry.position.y).toBe(19);
    expect(geometry.position.z).toBe(23);
    expect((geometry.material as MeshLambertMaterial).color.getHex()).toBe(NPC_COLOR);
});

test('geometry position changes when entity position changes element-wise', () => {
    const npc = new QuestNpc(7, 13, new Vec3(17, 19, 23), new Vec3(0, 0, 0), NpcType.Booma, {} as DatNpc);
    const geometry = create_npc_mesh(npc, cylinder);
    npc.position = new Vec3(2, 3, 5).add(npc.position);

    expect(geometry.position).toEqual(new Vector3(19, 22, 28));
});

test('geometry position changes when entire entity position changes', () => {
    const npc = new QuestNpc(7, 13, new Vec3(17, 19, 23), new Vec3(0, 0, 0), NpcType.Booma, {} as DatNpc);
    const geometry = create_npc_mesh(npc, cylinder);
    npc.position = new Vec3(2, 3, 5);

    expect(geometry.position).toEqual(new Vector3(2, 3, 5));
});
